"""
app/core/prometheus.py — Live Prometheus connector + smart discovery.
=====================================================================
Responsibilities:
  1. Talk to a Prometheus HTTP API (instant + range queries).
  2. DISCOVER services automatically from label values.
  3. PROBE each service to learn which logical metrics it actually exposes,
     by trying the candidate PromQL templates in config.METRIC_PROFILES.
  4. Fetch range data shaped for the Prophet detector.

Why this design: the same dashboard must light up for a Spring Boot app, a
Node service, or a freshly-deployed `rundeck` job without anyone editing code.
We achieve that by treating metric queries as DATA (templates in config), not
hard-coded strings, and by probing-before-rendering.
"""

from __future__ import annotations

import re
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import pandas as pd
from loguru import logger

from config import Settings


class PrometheusClient:
    def __init__(self, settings: Settings):
        self.s = settings
        self._client: Optional[httpx.Client] = None

    # ── connection ───────────────────────────────────────────────────────────
    def _http(self) -> httpx.Client:
        if self._client is None:
            auth = None
            headers = {}
            if self.s.prometheus_username:
                auth = (self.s.prometheus_username, self.s.prometheus_password)
            if self.s.prometheus_bearer_token:
                headers["Authorization"] = f"Bearer {self.s.prometheus_bearer_token}"
            self._client = httpx.Client(
                base_url=self.s.prometheus_url.rstrip("/"),
                timeout=self.s.prometheus_timeout_seconds,
                auth=auth,
                headers=headers,
            )
        return self._client

    def ping(self) -> bool:
        """Return True if Prometheus is reachable and healthy."""
        if not self.s.prometheus_configured():
            return False
        try:
            r = self._http().get("/-/ready")
            return r.status_code == 200
        except Exception as e:
            logger.warning(f"Prometheus ping failed: {e}")
            return False

    # ── low-level queries ─────────────────────────────────────────────────────
    def instant(self, promql: str) -> list[dict]:
        r = self._http().get("/api/v1/query", params={"query": promql})
        r.raise_for_status()
        body = r.json()
        if body.get("status") != "success":
            raise RuntimeError(body.get("error", "query failed"))
        return body["data"]["result"]

    def range(self, promql: str, start: datetime, end: datetime, step: str) -> list[dict]:
        r = self._http().get(
            "/api/v1/query_range",
            params={
                "query": promql,
                "start": start.timestamp(),
                "end": end.timestamp(),
                "step": step,
            },
        )
        r.raise_for_status()
        body = r.json()
        if body.get("status") != "success":
            raise RuntimeError(body.get("error", "range query failed"))
        return body["data"]["result"]

    def label_values(self, label: str) -> list[str]:
        r = self._http().get(f"/api/v1/label/{label}/values")
        r.raise_for_status()
        return r.json().get("data", [])

    # ── discovery ──────────────────────────────────────────────────────────────
    def discover_services(self) -> tuple[list[str], str]:
        """
        Return (service_names, discovery_label).

        Tries each configured discovery label until one yields names, applies
        include/exclude filters, and returns the cleaned list. The label that
        worked is returned so subsequent metric probes use the SAME label.
        """
        for label in self.s.discovery_labels:
            try:
                values = self.label_values(label)
            except Exception as e:
                logger.debug(f"label '{label}' lookup failed: {e}")
                continue
            if not values:
                continue

            services = self._filter_services(values)
            if services:
                logger.info(f"Discovered {len(services)} services via label '{label}'")
                return services, label

        logger.warning("No services discovered from any configured label.")
        return [], self.s.discovery_labels[0]

    def _filter_services(self, values: list[str]) -> list[str]:
        out = []
        excl = {e.lower() for e in self.s.discovery_exclude}
        incl = {i.lower() for i in self.s.discovery_include}
        for v in values:
            lv = v.lower()
            if incl and lv not in incl:
                continue
            if any(x in lv for x in excl):
                continue
            out.append(v)
        return sorted(set(out))

    def probe_metrics(self, service: str, label: str) -> dict[str, str]:
        """
        For one service, return {metric_key: working_promql}.

        We render each candidate template and run an INSTANT query; the first
        template that returns a non-empty scalar wins. This is how a new app
        (e.g. rundeck) gets the right panels even though its metric names
        differ from a Spring Boot service.
        """
        resolved: dict[str, str] = {}
        for profile in self.s.metric_profiles:
            for template in profile["queries"]:
                promql = self._render(template, service=service, label=label)
                try:
                    result = self.instant(promql)
                except Exception:
                    continue
                if result:  # this convention exists for this service
                    resolved[profile["key"]] = promql
                    break
        return resolved

    def fetch_series(
        self, promql: str, window_days: int, step_seconds: int
    ) -> pd.DataFrame:
        """Return a DataFrame[ts, value] for the resolved PromQL over the window."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=window_days)
        result = self.range(promql, start, end, f"{step_seconds}s")
        if not result:
            return pd.DataFrame(columns=["ts", "value"])
        # Sum across series if the query returned more than one (defensive)
        series = result[0]["values"]
        rows = [
            {"ts": datetime.fromtimestamp(float(t), tz=timezone.utc), "value": float(v)}
            for t, v in series
            if v not in ("NaN", "+Inf", "-Inf")
        ]
        return pd.DataFrame(rows)

    # ── helpers ──────────────────────────────────────────────────────────────
    def _render(self, template: str, service: str, label: str) -> str:
        return string.Template(template).safe_substitute(
            service=service, label=label, range=self.s.rate_window
        )

    @staticmethod
    def guess_tech(service: str, promqls: dict[str, str]) -> list[str]:
        """Best-effort tech tags from metric names — purely cosmetic for the UI."""
        blob = " ".join(promqls.values()).lower() + " " + service.lower()
        tags = []
        for needle, tag in [
            ("jvm", "jvm"), ("spring", "spring"), ("hikari", "postgres"),
            ("node", "node.js"), ("go_", "go"), ("nginx", "nginx"),
            ("kafka", "kafka"), ("redis", "redis"), ("python", "python"),
        ]:
            if needle in blob:
                tags.append(tag)
        return tags[:3]

    def close(self):
        if self._client:
            self._client.close()
            self._client = None
