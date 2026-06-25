"""
app/core/engine.py — The orchestration layer.
=============================================
This is the brain that the API routes call. It hides WHERE data comes from
(Prometheus vs demo) and HOW anomalies are detected (Prophet vs statistical),
exposing a clean catalog + timeseries + anomaly API to the routes.

Caching strategy:
  • Service catalog is discovered on a timer (config.discovery_refresh_seconds)
    and on demand. New services therefore appear in the sidebar automatically.
  • Scored series are cached per (service, metric, window) for
    model_cache_ttl_seconds to avoid retraining Prophet on every poll.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from loguru import logger

from config import Settings
from app.core.detector import ScoredSeries, make_detector, prophet_available
from app.core.prometheus import PrometheusClient
from app.core import synthetic
from app.models.schemas import (
    Anomaly, AnomalyReport, MetricInfo, MetricSnapshot, Mode,
    OverviewResponse, ServiceSummary, TimeseriesPoint, TimeseriesResponse,
)

# ── Action playbook (severity, direction) → guidance ─────────────────────────
ACTION_PLAYBOOK = {
    ("CRITICAL", "spike"): ("Immediate action", [
        "Page the on-call engineer — SLO breach likely imminent",
        "Tail service logs for exception stack traces",
        "Check downstream dependency health (DB, cache, upstream APIs)",
        "Consider shedding load or activating a circuit breaker",
    ]),
    ("CRITICAL", "drop"): ("Immediate action", [
        "Verify the service health/readiness endpoint is responding",
        "Check for a bad deployment or config change in the last hour",
        "Review pod/container restart counts and crash loops",
        "Confirm upstream traffic sources are still routing here",
    ]),
    ("WARNING", "spike"): ("Investigate", [
        "Profile the affected metric over the last 30 minutes",
        "Correlate with recent commits, feature flags, or config pushes",
        "Tighten alerting at current value + 20% as a tripwire",
    ]),
    ("WARNING", "drop"): ("Investigate", [
        "Monitor the trend over the next 15 minutes",
        "Confirm downstream consumers are unaffected",
        "Rule out a planned maintenance window or batch job",
    ]),
    ("WATCH", "spike"): ("Monitor", [
        "Marginal deviation — no immediate action required",
        "Re-check after one more scrape interval",
        "Escalate only if the deviation is sustained beyond 30 minutes",
    ]),
    ("WATCH", "drop"): ("Monitor", [
        "Within the watch band — verify again in ~10 minutes",
        "No customer-facing impact expected at this level",
    ]),
}


class Engine:
    def __init__(self, settings: Settings):
        self.s = settings
        self.prom = PrometheusClient(settings)
        self.detector = make_detector(settings)
        self._mode: Mode = "demo"
        self._discovery_label = settings.discovery_labels[0]
        # catalog: {service_id: {"label", "desc", "tech", "metrics": {key: promql|None}}}
        self._catalog: dict[str, dict] = {}
        self._catalog_ts: float = 0.0
        self._last_discovery: Optional[str] = None
        self._series_cache: dict[tuple, tuple[float, ScoredSeries]] = {}

    # ── mode / health ─────────────────────────────────────────────────────────
    def resolve_mode(self) -> Mode:
        if self.s.data_mode == "demo":
            self._mode = "demo"
        elif self.s.data_mode == "live":
            self._mode = "live"
        else:  # auto
            self._mode = "live" if self.prom.ping() else "demo"
        return self._mode

    @property
    def mode(self) -> Mode:
        return self._mode

    @property
    def prometheus_connected(self) -> bool:
        return self._mode == "live"

    @property
    def last_discovery(self) -> Optional[str]:
        return self._last_discovery

    def metric_catalog(self) -> list[MetricInfo]:
        return [
            MetricInfo(key=p["key"], label=p["label"], unit=p["unit"],
                       direction=p["direction"], description=p["description"])
            for p in self.s.metric_profiles
        ]

    def _profile(self, key: str) -> dict:
        return next(p for p in self.s.metric_profiles if p["key"] == key)

    # ── discovery ──────────────────────────────────────────────────────────────
    def ensure_catalog(self, force: bool = False) -> None:
        fresh = (time.time() - self._catalog_ts) < self.s.discovery_refresh_seconds
        if self._catalog and fresh and not force:
            return
        self.resolve_mode()
        if self._mode == "live":
            self._discover_live()
        else:
            self._discover_demo()
        self._catalog_ts = time.time()
        self._last_discovery = datetime.now(timezone.utc).isoformat()

    def _discover_live(self) -> None:
        services, label = self.prom.discover_services()
        self._discovery_label = label
        catalog: dict[str, dict] = {}
        for svc in services:
            promqls = self.prom.probe_metrics(svc, label)
            if not promqls:
                continue  # nothing we recognise — skip until it exposes known metrics
            catalog[svc] = {
                "label": _humanize(svc),
                "desc": f"Discovered via Prometheus label '{label}'",
                "tech": self.prom.guess_tech(svc, promqls),
                "metrics": promqls,  # {key: promql}
            }
        self._catalog = catalog
        logger.info(f"Live catalog rebuilt: {len(catalog)} services.")

    def _discover_demo(self) -> None:
        catalog: dict[str, dict] = {}
        for svc, desc, tech in synthetic.demo_services()[: self.s.demo_service_count]:
            catalog[svc] = {
                "label": _humanize(svc),
                "desc": desc,
                "tech": tech,
                "metrics": {k: None for k in synthetic.demo_metric_keys(svc)},
            }
        self._catalog = catalog
        logger.info(f"Demo catalog built: {len(catalog)} services.")

    # ── data fetch ─────────────────────────────────────────────────────────────
    def _raw_series(self, service: str, metric_key: str, window_days: int) -> pd.DataFrame:
        step_min = self.s.demo_resolution_minutes
        if self._mode == "live":
            promql = self._catalog[service]["metrics"].get(metric_key)
            if not promql:
                return pd.DataFrame(columns=["ts", "value"])
            # adaptive step so long windows stay performant (Prometheus point cap)
            step_sec = max(60, int(window_days * 86400 / 1500))
            return self.prom.fetch_series(promql, window_days, step_sec)
        return synthetic.demo_series(service, metric_key, window_days, step_min)

    def scored_series(self, service: str, metric_key: str, window_days: int) -> ScoredSeries:
        cache_key = (service, metric_key, window_days, self._mode)
        now = time.time()
        if cache_key in self._series_cache:
            ts, scored = self._series_cache[cache_key]
            if now - ts < self.s.model_cache_ttl_seconds:
                return scored
        df = self._raw_series(service, metric_key, window_days)
        scored = self.detector.score(df)
        self._series_cache[cache_key] = (now, scored)
        return scored

    # ── API-shaped responses ───────────────────────────────────────────────────
    def timeseries(self, service: str, metric_key: str, window_days: int) -> TimeseriesResponse:
        self.ensure_catalog()
        profile = self._profile(metric_key)
        scored = self.scored_series(service, metric_key, window_days)
        info = MetricInfo(key=profile["key"], label=profile["label"], unit=profile["unit"],
                          direction=profile["direction"], description=profile["description"])

        points = [
            TimeseriesPoint(
                ts=row.ts.isoformat() if hasattr(row.ts, "isoformat") else str(row.ts),
                value=_nz(getattr(row, "value", None)),
                predicted=_nz(getattr(row, "predicted", None)),
                lower=_nz(getattr(row, "lower", None)),
                upper=_nz(getattr(row, "upper", None)),
                is_anomaly=bool(getattr(row, "is_anomaly", False)),
                severity=self._sev(getattr(row, "confidence", 1.0), bool(getattr(row, "is_anomaly", False))),
                confidence=round(float(getattr(row, "confidence", 1.0)), 4),
            )
            for row in scored.df.itertuples()
        ]

        step_sec = (self.s.demo_resolution_minutes * 60) if self._mode == "demo" \
            else max(60, int(window_days * 86400 / 1500))

        return TimeseriesResponse(
            service=service,
            metric=info,
            window_days=window_days,
            resolution_seconds=step_sec,
            model_trained=scored.trained,
            detector=scored.detector,
            points=points,
            caveats=self._series_caveats(scored, profile, window_days),
        )

    def overview(self, window_days: int) -> OverviewResponse:
        self.ensure_catalog()
        summaries = [self._service_summary(svc, window_days) for svc in self._catalog]
        healthy = sum(1 for s in summaries if s.worst_severity == "NORMAL")
        at_risk = sum(1 for s in summaries if s.worst_severity in ("WATCH", "WARNING"))
        breached = sum(1 for s in summaries if s.worst_severity == "CRITICAL")
        total_anom = sum(
            sum(1 for m in s.metrics if m.severity != "NORMAL") for s in summaries
        )
        return OverviewResponse(
            generated_at=datetime.now(timezone.utc).isoformat(),
            window_days=window_days,
            mode=self._mode,
            total_services=len(summaries),
            healthy=healthy, at_risk=at_risk, breached=breached,
            total_anomalies=total_anom,
            services=summaries,
        )

    def services(self, window_days: int) -> list[ServiceSummary]:
        self.ensure_catalog()
        return [self._service_summary(svc, window_days) for svc in self._catalog]

    def anomaly_report(self, window_days: int, severity: Optional[str] = None) -> AnomalyReport:
        self.ensure_catalog()
        items: list[Anomaly] = []
        for svc, meta in self._catalog.items():
            for key in meta["metrics"]:
                scored = self.scored_series(svc, key, window_days)
                if scored.df.empty:
                    continue
                # Current outstanding issue = worst severity across the most
                # recent ~30 min. We report the single worst recent point per
                # (service, metric) to avoid flooding the operator.
                recent = scored.df.tail(6)
                worst_row, worst_conf, worst_sev = None, 1.0, "NORMAL"
                rank_local = {"NORMAL": 0, "WATCH": 1, "WARNING": 2, "CRITICAL": 3}
                for _, r in recent.iterrows():
                    c = float(r.get("confidence", 1.0))
                    sv = self._sev(c, bool(r.get("is_anomaly", False)))
                    if rank_local[sv] > rank_local[worst_sev]:
                        worst_sev, worst_conf, worst_row = sv, c, r
                if worst_sev == "NORMAL" or worst_row is None:
                    continue
                items.append(self._make_anomaly(svc, meta, key, worst_row, worst_conf, worst_sev))
        if severity:
            items = [a for a in items if a.severity == severity.upper()]
        rank = {"CRITICAL": 3, "WARNING": 2, "WATCH": 1, "NORMAL": 0}
        items.sort(key=lambda a: (rank[a.severity], -a.age_minutes), reverse=True)
        return AnomalyReport(
            generated_at=datetime.now(timezone.utc).isoformat(),
            window_days=window_days,
            total=len(items),
            critical=sum(1 for a in items if a.severity == "CRITICAL"),
            warning=sum(1 for a in items if a.severity == "WARNING"),
            watch=sum(1 for a in items if a.severity == "WATCH"),
            items=items,
        )

    # ── builders ───────────────────────────────────────────────────────────────
    def _service_summary(self, svc: str, window_days: int) -> ServiceSummary:
        meta = self._catalog[svc]
        snaps: list[MetricSnapshot] = []
        worst = "NORMAL"
        rank = {"NORMAL": 0, "WATCH": 1, "WARNING": 2, "CRITICAL": 3}
        for key in meta["metrics"]:
            profile = self._profile(key)
            scored = self.scored_series(svc, key, window_days)
            if scored.df.empty:
                snaps.append(MetricSnapshot(key=key, label=profile["label"],
                                            unit=profile["unit"], value=None))
                continue
            # "Current" health = worst severity over the most recent ~30 minutes,
            # not a single scrape — one transient point shouldn't define status,
            # but a sustained recent breach should.
            recent = scored.df.tail(6)
            last = scored.df.iloc[-1]
            worst_conf, worst_sev = 1.0, "NORMAL"
            rank_local = {"NORMAL": 0, "WATCH": 1, "WARNING": 2, "CRITICAL": 3}
            for _, r in recent.iterrows():
                c = float(r.get("confidence", 1.0))
                sv = self._sev(c, bool(r.get("is_anomaly", False)))
                if rank_local[sv] > rank_local[worst_sev]:
                    worst_sev, worst_conf = sv, c
            snaps.append(MetricSnapshot(
                key=key, label=profile["label"], unit=profile["unit"],
                value=round(float(last["value"]), 3), severity=worst_sev,
                confidence=round(worst_conf, 4),
            ))
            if rank[worst_sev] > rank[worst]:
                worst = worst_sev
        return ServiceSummary(
            id=svc, label=meta["label"], description=meta["desc"], tech=meta["tech"],
            worst_severity=worst, metrics=snaps,
            available_metric_keys=list(meta["metrics"].keys()),
        )

    def _make_anomaly(self, svc, meta, key, row, conf, sev) -> Anomaly:
        profile = self._profile(key)
        observed = float(row["value"])
        expected = float(row.get("predicted", observed) or observed)
        direction = "spike" if observed > expected else "drop"
        label, steps = ACTION_PLAYBOOK.get((sev, direction), ("Monitor", ["Continue monitoring."]))
        ts = row.ts if hasattr(row, "ts") else row["ts"]
        ts = pd.Timestamp(ts)
        age = max(0, int((datetime.now(timezone.utc) - ts.to_pydatetime().replace(
            tzinfo=timezone.utc)).total_seconds() / 60))
        dev_pct = (1 - conf) * 100
        return Anomaly(
            id=f"{svc}|{key}|{int(ts.timestamp())}",
            service=svc, service_label=meta["label"],
            metric_key=key, metric_label=profile["label"], unit=profile["unit"],
            severity=sev, direction=direction,
            observed=round(observed, 3), expected=round(expected, 3),
            confidence=round(conf, 4),
            detected_at=ts.isoformat(), age_minutes=age,
            recommended_action_label=label, recommended_steps=steps,
            caveat=(f"{self.detector.name.title()} model on {meta['label']} "
                    f"{profile['label']}. This {direction} is ~{dev_pct:.0f}% outside the "
                    f"expected band. A single-point {direction} that recovers within one or two "
                    f"scrape intervals is often noise — confirm a sustained trend before acting."),
        )

    # ── helpers ──────────────────────────────────────────────────────────────
    def _sev(self, confidence: float, is_anomaly: bool) -> str:
        """Severity is a graded function of the confidence score, NOT the hard
        99% CI boundary. This lets us surface WATCH/WARNING for points that are
        meaningfully deviating but haven't yet crossed the outer band — exactly
        when an operator wants a heads-up. The `is_anomaly` flag (outside the CI)
        stays on each point for stricter consumers."""
        if confidence < self.s.severity_critical_below:
            return "CRITICAL"
        if confidence < self.s.severity_warning_below:
            return "WARNING"
        if confidence < self.s.severity_watch_below:
            return "WATCH"
        return "NORMAL"

    def _series_caveats(self, scored: ScoredSeries, profile: dict, window_days: int) -> list[str]:
        caveats = [
            f"Shaded band = {int(self.s.prophet_interval_width * 100)}% prediction interval "
            f"learned from {window_days} days of history. Points inside it are expected; "
            f"dots outside are flagged anomalies.",
            f"Detector: {scored.detector}. " + (
                "Prophet models daily + weekly seasonality." if scored.detector == "prophet"
                else "Statistical fallback (robust rolling z-score) is in use — "
                     "it has no seasonality model, so recurring daily peaks may read as anomalous."
            ),
        ]
        if not scored.trained:
            caveats.append("Not enough history to train a model — predictions are degraded; "
                           "treat anomaly flags with caution.")
        if profile["direction"] == "up_is_bad":
            caveats.append("For this metric, downward deviations are usually benign; "
                           "focus on upward spikes.")
        if self._mode == "demo":
            caveats.append("DEMO MODE: this series is synthetic. Connect a Prometheus "
                           "workspace (PROMETHEUS_URL) to see real telemetry.")
        return caveats


def _humanize(s: str) -> str:
    return s.replace("-", " ").replace("_", " ").title()


def _nz(v):
    if v is None:
        return None
    try:
        f = float(v)
        return None if (f != f) else round(f, 4)  # NaN check
    except (TypeError, ValueError):
        return None
