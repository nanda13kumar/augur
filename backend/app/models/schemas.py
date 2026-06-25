"""
app/models/schemas.py — Pydantic data models (the API contract).
================================================================
These classes ARE the API schema. They are documented automatically at
/docs (Swagger) and /redoc, and they double as the single source of truth
for the shapes the React frontend consumes.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Severity = Literal["NORMAL", "WATCH", "WARNING", "CRITICAL"]
Direction = Literal["spike", "drop", "normal"]
Mode = Literal["live", "demo"]


class HealthResponse(BaseModel):
    status: str = "ok"
    app_name: str
    version: str
    mode: Mode
    prometheus_connected: bool
    prophet_available: bool
    services_discovered: int
    last_discovery: Optional[str] = None


class RuntimeConfig(BaseModel):
    """Bootstrap config the frontend fetches on load so branding/behaviour
    can be driven from the backend too."""
    app_name: str
    tagline: str
    mode: Mode
    available_windows_days: list[int]
    default_window_days: int
    metric_catalog: list["MetricInfo"]


class MetricInfo(BaseModel):
    key: str
    label: str
    unit: str
    direction: Literal["up_is_bad", "down_is_bad", "neutral"]
    description: str


class MetricSnapshot(BaseModel):
    key: str
    label: str
    unit: str
    value: Optional[float] = None
    severity: Severity = "NORMAL"
    confidence: float = 1.0


class ServiceSummary(BaseModel):
    """One card in the sidebar / overview grid."""
    id: str
    label: str
    description: str = ""
    tech: list[str] = Field(default_factory=list)
    worst_severity: Severity = "NORMAL"
    metrics: list[MetricSnapshot] = Field(default_factory=list)
    available_metric_keys: list[str] = Field(default_factory=list)


class TimeseriesPoint(BaseModel):
    ts: str                     # ISO-8601
    value: Optional[float] = None
    predicted: Optional[float] = None
    lower: Optional[float] = None
    upper: Optional[float] = None
    is_anomaly: bool = False
    severity: Severity = "NORMAL"
    confidence: float = 1.0


class TimeseriesResponse(BaseModel):
    service: str
    metric: MetricInfo
    window_days: int
    resolution_seconds: int
    model_trained: bool
    detector: str               # "prophet" | "statistical"
    points: list[TimeseriesPoint]
    caveats: list[str]          # human-readable warnings about THIS series


class Anomaly(BaseModel):
    id: str
    service: str
    service_label: str
    metric_key: str
    metric_label: str
    unit: str
    severity: Severity
    direction: Direction
    observed: float
    expected: float
    confidence: float
    detected_at: str
    age_minutes: int
    recommended_action_label: str
    recommended_steps: list[str]
    caveat: str


class AnomalyReport(BaseModel):
    generated_at: str
    window_days: int
    total: int
    critical: int
    warning: int
    watch: int
    items: list[Anomaly]


class OverviewResponse(BaseModel):
    generated_at: str
    window_days: int
    mode: Mode
    total_services: int
    healthy: int
    at_risk: int
    breached: int
    total_anomalies: int
    services: list[ServiceSummary]


# Resolve forward references
RuntimeConfig.model_rebuild()
