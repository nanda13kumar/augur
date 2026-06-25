"""
app/main.py — FastAPI application entrypoint.
============================================
Wires config → Engine → routes, sets up CORS, background discovery, and clean
startup/shutdown. Run with:

    python -m uvicorn app.main:app --host 0.0.0.0 --port 8100
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from config import get_settings
from app.api.routes import router
from app.core.engine import Engine

VERSION = "1.0.0"
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.app_name} v{VERSION}")
    engine = Engine(settings)
    app.state.engine = engine

    # Initial discovery (non-fatal if Prometheus is down — auto mode falls back to demo)
    try:
        engine.ensure_catalog(force=True)
    except Exception as e:
        logger.error(f"Initial discovery failed: {e}")

    logger.info(f"Mode={engine.mode}  services={len(engine._catalog)}  "
                f"detector={engine.detector.name}")

    # Background re-discovery so new services surface without a restart
    stop = asyncio.Event()

    async def _rediscover_loop():
        while not stop.is_set():
            try:
                await asyncio.sleep(settings.discovery_refresh_seconds)
                await asyncio.get_event_loop().run_in_executor(None, engine.ensure_catalog, True)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Background discovery error: {e}")

    task = asyncio.create_task(_rediscover_loop())
    yield
    stop.set()
    task.cancel()
    engine.prom.close()
    logger.info("Shutdown complete.")


app = FastAPI(
    title=f"{settings.app_name} API",
    description="Predictive anomaly detection for microservices — Prophet + Prometheus.",
    version=VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix=settings.api_prefix)


@app.get("/")
def root():
    return {"app": settings.app_name, "version": VERSION, "docs": "/docs",
            "api": settings.api_prefix}
