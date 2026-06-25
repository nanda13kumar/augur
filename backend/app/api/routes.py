"""
app/api/routes.py — REST API surface (versioned under /api/v1).
==============================================================
Thin controllers. All real work lives in the Engine. Each route is documented
inline so /docs (Swagger) is genuinely useful to consumers.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.schemas import (
    AnomalyReport, HealthResponse, OverviewResponse, RuntimeConfig,
    ServiceSummary, TimeseriesResponse,
)

router = APIRouter()


def _engine(request: Request):
    return request.app.state.engine


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health(request: Request):
    """Liveness + which data source / detector is active."""
    eng = _engine(request)
    eng.resolve_mode()
    from app.core.detector import prophet_available
    return HealthResponse(
        app_name=eng.s.app_name,
        version=request.app.version,
        mode=eng.mode,
        prometheus_connected=eng.prometheus_connected,
        prophet_available=prophet_available(),
        services_discovered=len(eng._catalog),
        last_discovery=eng.last_discovery,
    )


@router.get("/config", response_model=RuntimeConfig, tags=["system"])
def runtime_config(request: Request):
    """Bootstrap config the frontend reads on load (branding, windows, metrics)."""
    eng = _engine(request)
    eng.ensure_catalog()
    return RuntimeConfig(
        app_name=eng.s.app_name,
        tagline="Predictive anomaly detection",
        mode=eng.mode,
        available_windows_days=eng.s.available_windows_days,
        default_window_days=eng.s.default_window_days,
        metric_catalog=eng.metric_catalog(),
    )


@router.post("/discover", tags=["system"])
def rediscover(request: Request):
    """Force an immediate re-scan of Prometheus for new/removed services."""
    eng = _engine(request)
    eng.ensure_catalog(force=True)
    return {"services": list(eng._catalog.keys()), "count": len(eng._catalog), "mode": eng.mode}


@router.get("/overview", response_model=OverviewResponse, tags=["dashboard"])
def overview(request: Request, window: int = Query(default=None, description="Window in days")):
    eng = _engine(request)
    return eng.overview(window or eng.s.default_window_days)


@router.get("/services", response_model=list[ServiceSummary], tags=["services"])
def list_services(request: Request, window: int = Query(default=None)):
    """The dynamic service catalog — drives the sidebar. New services appear here automatically."""
    eng = _engine(request)
    return eng.services(window or eng.s.default_window_days)


@router.get("/services/{service}/metrics/{metric}", response_model=TimeseriesResponse, tags=["services"])
def service_metric(request: Request, service: str, metric: str,
                   window: int = Query(default=None)):
    """Timeseries + forecast band + anomaly flags + per-series caveats."""
    eng = _engine(request)
    eng.ensure_catalog()
    if service not in eng._catalog:
        raise HTTPException(404, f"Unknown service '{service}'")
    if metric not in eng._catalog[service]["metrics"]:
        raise HTTPException(404, f"Service '{service}' does not expose metric '{metric}'")
    return eng.timeseries(service, metric, window or eng.s.default_window_days)


@router.get("/anomalies", response_model=AnomalyReport, tags=["anomalies"])
def anomalies(request: Request,
              window: int = Query(default=None),
              severity: str = Query(default=None, description="CRITICAL | WARNING | WATCH")):
    eng = _engine(request)
    return eng.anomaly_report(window or eng.s.default_window_days, severity)
