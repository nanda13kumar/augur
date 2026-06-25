"""
app/core/synthetic.py — Demo-mode data source.
==============================================
When no Prometheus is configured (or it's unreachable in "auto" mode), Augur
generates realistic-looking microservice telemetry so the product is fully
explorable out of the box. It mimics the SAME interface the Prometheus path
produces (service catalog + range DataFrames), so the rest of the system is
oblivious to which source it's using.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

DEMO_SERVICES = [
    ("api-gateway",     "Edge proxy — routes all inbound traffic to downstream services", ["nginx", "envoy"]),
    ("auth-service",    "JWT issuance, OIDC federation and session management",            ["spring", "redis"]),
    ("payment-service", "Payment gateway integration, Stripe and ledger",                  ["spring", "postgres"]),
    ("data-pipeline",   "Kafka-backed ETL for analytics and downstream reporting",          ["python", "kafka"]),
    ("address-service", "Customer address and geo lookups",                                 ["spring", "postgres"]),
    ("notification-svc","Email, SMS and push notifications",                                ["node.js", "redis"]),
    ("reporting-service","On-demand PDF and Excel report generation",                       ["spring", "postgres"]),
    ("scheduler-service","Quartz-based batch job orchestration",                            ["spring", "postgres"]),
]

# logical metric → (base, daily_amplitude, noise_pct, up_is_bad)
DEMO_METRICS = {
    "request_rate": (40.0, 0.7, 0.12, False),
    "error_rate":   (0.4, 0.3, 0.20, True),
    "latency_p99":  (90.0, 0.6, 0.15, True),
    "cpu_usage":    (32.0, 0.5, 0.14, True),
    "memory_used":  (420.0, 0.2, 0.05, True),
}


def _seed(*parts: str) -> int:
    h = hashlib.md5("|".join(parts).encode()).hexdigest()
    return int(h[:8], 16)


def demo_services() -> list[tuple[str, str, list[str]]]:
    return DEMO_SERVICES


def demo_metric_keys(service: str) -> list[str]:
    # api-gateway has no memory metric exposed, to demonstrate per-service variation
    keys = list(DEMO_METRICS.keys())
    if service == "api-gateway":
        keys = [k for k in keys if k != "memory_used"]
    return keys


# Per-service "current condition" so the live dashboard looks alive and varied.
# (service, metric_key) → trailing anomaly magnitude. Drives the overview cards.
DEMO_CURRENT_CONDITION = {
    ("payment-service", "error_rate"):  1.62,  # → CRITICAL spike (conf ~0.12)
    ("data-pipeline",   "latency_p99"): 1.91,  # → CRITICAL spike (conf ~0.14)
    ("payment-service", "latency_p99"): 1.62,  # → WARNING       (conf ~0.24)
    ("auth-service",    "cpu_usage"):   1.57,  # → WARNING       (conf ~0.24)
    ("address-service", "error_rate"):  1.40,  # → WATCH         (conf ~0.38)
    ("reporting-service","memory_used"): 1.19, # → WATCH         (conf ~0.38)
}


def demo_series(service: str, metric_key: str, window_days: int, step_minutes: int) -> pd.DataFrame:
    rng = np.random.default_rng(_seed(service, metric_key))
    base, amp, noise, _ = DEMO_METRICS[metric_key]
    svc_mult = {"auth-service": 2.6, "payment-service": 1.4, "data-pipeline": 0.6,
                "api-gateway": 3.1, "reporting-service": 0.6}.get(service, 1.0)

    end = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    n = int(window_days * 24 * 60 / step_minutes)
    ts = [end - timedelta(minutes=step_minutes * (n - i)) for i in range(n)]

    # diurnal + weekly seasonality
    values = np.zeros(n)
    for i, t in enumerate(ts):
        hour = t.hour + t.minute / 60
        daily = 0.35 + amp * (np.exp(-((hour - 10) ** 2) / 18) + 0.7 * np.exp(-((hour - 17) ** 2) / 12))
        weekend = 0.6 if t.weekday() >= 5 else 1.0
        v = base * svc_mult * daily * weekend * (1 + (rng.random() - 0.5) * noise)
        values[i] = max(0, v)

    # inject 1–3 historical anomalies
    for _ in range(rng.integers(1, 4)):
        c = rng.integers(n // 10, n - n // 10)
        w = rng.integers(4, 10)
        spike = rng.random() > 0.5
        mag = rng.uniform(2.5, 4.5) if spike else rng.uniform(0.05, 0.2)
        for off in range(-w, w + 1):
            j = c + off
            if 0 <= j < n:
                decay = np.exp(-abs(off) / (w / 2))
                values[j] *= (1 + (mag - 1) * decay) if spike else (mag + (1 - mag) * (1 - decay))

    # inject a CURRENT (trailing) condition so the dashboard reflects "now"
    cond = DEMO_CURRENT_CONDITION.get((service, metric_key))
    if cond:
        w = 6
        for off in range(-w, 1):  # ramp up into the most recent point
            j = n - 1 + off
            if 0 <= j < n:
                decay = np.exp(-abs(off) / (w / 2))
                values[j] *= 1 + (cond - 1) * decay

    return pd.DataFrame({"ts": ts, "value": np.round(values, 4)})
