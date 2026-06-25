"""
config.py — Single source of truth for ALL backend configuration.
================================================================
Every tunable parameter lives here. Override any value with an environment
variable (or a .env file) of the same name — no code changes required.

This is intentionally the ONLY file an operator needs to touch to:
  • point Augur at a live Prometheus workspace
  • change how services are discovered
  • teach Augur how a new application exposes its metrics (PromQL templates)
  • tune the Prophet model and anomaly thresholds

Design note (why Pydantic Settings): environment-driven config is 12-factor
friendly, plays nicely with Docker/K8s, and gives us validation for free.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# ─────────────────────────────────────────────────────────────────────────────
#  METRIC PROFILES
#  -------------------------------------------------------------------------
#  A "metric profile" maps a LOGICAL metric (what humans care about, e.g.
#  "error rate") to one or more candidate PromQL templates. Augur tries each
#  template in order and uses the first that returns data — this is what makes
#  discovery "smart": the same logical dashboard works whether a service is
#  Spring Boot (Micrometer), Node (prom-client), Go, or anything else.
#
#  ${service} is substituted with the discovered service identifier.
#  ${range}   is substituted with the rate window (e.g. 5m).
#
#  To support a brand-new application, add its query convention to the
#  relevant profile's `queries` list. Nothing else needs to change.
# ─────────────────────────────────────────────────────────────────────────────

METRIC_PROFILES: list[dict] = [
    {
        "key": "request_rate",
        "label": "Request Rate",
        "unit": "req/s",
        "direction": "neutral",  # spikes AND drops are both interesting
        "description": "Throughput in requests per second. A sudden drop can mean an outage; a spike can mean a traffic flood or retry storm.",
        "queries": [
            # Spring Boot / Micrometer
            'sum(rate(http_server_requests_seconds_count{${label}="${service}"}[${range}]))',
            # Node.js prom-client / generic
            'sum(rate(http_requests_total{${label}="${service}"}[${range}]))',
            # Go / Prometheus client
            'sum(rate(http_request_duration_seconds_count{${label}="${service}"}[${range}]))',
        ],
    },
    {
        "key": "error_rate",
        "label": "Error Rate",
        "unit": "%",
        "direction": "up_is_bad",
        "description": "Percentage of requests returning 5xx. Any sustained increase above baseline is significant.",
        "queries": [
            '100 * sum(rate(http_server_requests_seconds_count{${label}="${service}",status=~"5.."}[${range}])) / clamp_min(sum(rate(http_server_requests_seconds_count{${label}="${service}"}[${range}])), 1)',
            '100 * sum(rate(http_requests_total{${label}="${service}",status=~"5.."}[${range}])) / clamp_min(sum(rate(http_requests_total{${label}="${service}"}[${range}])), 1)',
            '100 * sum(rate(http_requests_total{${label}="${service}",code=~"5.."}[${range}])) / clamp_min(sum(rate(http_requests_total{${label}="${service}"}[${range}])), 1)',
        ],
    },
    {
        "key": "latency_p99",
        "label": "P99 Latency",
        "unit": "ms",
        "direction": "up_is_bad",
        "description": "99th-percentile response time in milliseconds. Tail latency is what your slowest users actually feel.",
        "queries": [
            '1000 * histogram_quantile(0.99, sum(rate(http_server_requests_seconds_bucket{${label}="${service}"}[${range}])) by (le))',
            '1000 * histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{${label}="${service}"}[${range}])) by (le))',
        ],
    },
    {
        "key": "cpu_usage",
        "label": "CPU Usage",
        "unit": "%",
        "direction": "up_is_bad",
        "description": "Process CPU utilisation. Sustained saturation queues requests and inflates latency.",
        "queries": [
            '100 * avg(process_cpu_usage{${label}="${service}"})',
            '100 * avg(rate(process_cpu_seconds_total{${label}="${service}"}[${range}]))',
        ],
    },
    {
        "key": "memory_used",
        "label": "Memory Used",
        "unit": "MB",
        "direction": "up_is_bad",
        "description": "Resident memory in MB. A steady climb with no recovery is the classic memory-leak signature.",
        "queries": [
            'sum(jvm_memory_used_bytes{${label}="${service}",area="heap"}) / 1048576',
            'avg(process_resident_memory_bytes{${label}="${service}"}) / 1048576',
        ],
    },
]


class Settings(BaseSettings):
    """All backend configuration. Override via env vars or backend/.env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    app_name: str = Field(default="Augur", description="Product name shown in logs")
    api_prefix: str = Field(default="/api/v1")
    backend_port: int = Field(default=8100, description="Port uvicorn binds to")
    log_level: str = Field(default="INFO")

    # ── CORS (frontend origins allowed to call the API) ──────────────────────
    cors_origins: list[str] = Field(default=["*"])

    # ── Data source mode ─────────────────────────────────────────────────────
    #   "auto"  → use Prometheus if reachable, else fall back to demo data
    #   "live"  → force Prometheus only (fail loudly if unreachable)
    #   "demo"  → force synthetic data (no Prometheus needed)
    data_mode: Literal["auto", "live", "demo"] = Field(default="auto")

    # ── Prometheus connection ────────────────────────────────────────────────
    prometheus_url: str = Field(
        default="",
        description="Base URL of your Prometheus, e.g. http://prometheus.mycorp:9090",
    )
    prometheus_timeout_seconds: float = Field(default=10.0)
    prometheus_username: str = Field(default="", description="Optional basic-auth user")
    prometheus_password: str = Field(default="", description="Optional basic-auth password")
    prometheus_bearer_token: str = Field(default="", description="Optional bearer token")

    # ── Service discovery ────────────────────────────────────────────────────
    #   The Prometheus label that identifies a service. Most setups use "job";
    #   Spring Boot/K8s often use "application", "service", or "kubernetes_name".
    #   Augur tries these in order until one yields service names.
    discovery_labels: list[str] = Field(default=["service", "application", "job"])
    #   Optional allow/deny lists to keep the sidebar clean.
    discovery_include: list[str] = Field(default=[], description="If set, ONLY these services are shown")
    discovery_exclude: list[str] = Field(default=["prometheus", "grafana", "alertmanager", "node-exporter"])
    discovery_refresh_seconds: int = Field(default=60, description="How often to re-scan Prometheus for new services")

    # ── PromQL rate window ───────────────────────────────────────────────────
    rate_window: str = Field(default="5m", description="Window for rate() in PromQL templates")

    # ── Prophet model / anomaly detection ────────────────────────────────────
    prophet_enabled: bool = Field(default=True, description="If False, uses the lightweight statistical fallback detector")
    prophet_interval_width: float = Field(default=0.99, description="Confidence interval width (0.99 = 99%)")
    prophet_changepoint_prior_scale: float = Field(default=0.05)
    prophet_daily_seasonality: bool = Field(default=True)
    prophet_weekly_seasonality: bool = Field(default=True)
    model_cache_ttl_seconds: int = Field(default=900, description="How long a trained model is reused before retraining")

    #   Severity is derived from the confidence score (0..1, higher = more normal).
    #   confidence = exp(-0.8 * residual), where residual = |obs-pred| / half-band.
    #   residual 1.0 == sitting exactly on the 99% CI boundary (conf ~0.45).
    #   Thresholds below are tuned so ordinary in-band noise stays NORMAL and a
    #   tier only fires at/beyond the boundary.
    severity_critical_below: float = Field(default=0.18)  # residual ~2.1  (far outside)
    severity_warning_below: float = Field(default=0.30)   # residual ~1.5  (clearly outside)
    severity_watch_below: float = Field(default=0.45)     # residual ~1.0  (at boundary)

    # ── Time windows offered to the UI (days) ────────────────────────────────
    available_windows_days: list[int] = Field(default=[7, 14, 30, 60, 90])
    default_window_days: int = Field(default=30)

    # ── Demo mode parameters ─────────────────────────────────────────────────
    demo_service_count: int = Field(default=8)
    demo_resolution_minutes: int = Field(default=5)

    @property
    def metric_profiles(self) -> list[dict]:
        return METRIC_PROFILES

    def prometheus_configured(self) -> bool:
        return bool(self.prometheus_url.strip())


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton. Import this everywhere."""
    return Settings()
