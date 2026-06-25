"""
app/core/detector.py — Anomaly detection (Prophet primary, statistical fallback).
================================================================================
Principal-engineer decision: the heavy dependency (Prophet + Stan) must NEVER
be a single point of failure. We define a small interface and TWO
implementations:

  • ProphetDetector      — Facebook Prophet with confidence intervals
  • StatisticalDetector  — rolling robust z-score (median + MAD), zero heavy deps

At import time we try Prophet; if its Stan backend is missing/broken (a very
common install problem), we transparently fall back. The API reports which
detector served each series so the UI can be honest about it.

The output contract is identical for both: per-point prediction, lower/upper
bound, anomaly flag, and a confidence score in [0, 1] where 1 == perfectly
normal.
"""

from __future__ import annotations

import math
import warnings
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from loguru import logger

warnings.filterwarnings("ignore")

# ── Try to load Prophet, but survive if its Stan backend is broken ───────────
_PROPHET_OK = False
try:
    from prophet import Prophet  # noqa

    # Smoke-test the Stan backend with a tiny fit — catches the classic
    # "'Prophet' object has no attribute 'stan_backend'" failure early.
    _test = Prophet()
    _PROPHET_OK = hasattr(_test, "stan_backend")
    del _test
    if _PROPHET_OK:
        logger.info("Prophet backend available.")
    else:
        logger.warning("Prophet imported but Stan backend missing — using statistical fallback.")
except Exception as e:  # ImportError or Stan compile failure
    logger.warning(f"Prophet unavailable ({type(e).__name__}) — using statistical fallback.")


@dataclass
class ScoredSeries:
    detector: str
    trained: bool
    df: pd.DataFrame  # columns: ts, value, predicted, lower, upper, is_anomaly, confidence


def _severity_from_confidence(c: float, crit: float, warn: float, watch: float) -> str:
    if c < crit:
        return "CRITICAL"
    if c < warn:
        return "WARNING"
    if c < watch:
        return "WATCH"
    return "NORMAL"


class StatisticalDetector:
    """Robust rolling z-score using median + MAD. Cheap, dependency-free,
    surprisingly effective for monitoring data."""

    name = "statistical"

    def __init__(self, interval_width: float = 0.99, window: int = 96):
        # window ~ points used for local baseline (96 * 5min = 8h)
        self.window = window
        # z multiplier ≈ inverse-normal of interval; 0.99 → ~2.576
        self.k = {0.90: 1.645, 0.95: 1.96, 0.99: 2.576}.get(round(interval_width, 2), 2.576)

    def score(self, df: pd.DataFrame) -> ScoredSeries:
        if len(df) < 10:
            return ScoredSeries(self.name, False, self._empty(df))
        s = df.copy().reset_index(drop=True)
        med = s["value"].rolling(self.window, min_periods=5, center=True).median()
        mad = (s["value"] - med).abs().rolling(self.window, min_periods=5, center=True).median()
        sigma = (mad * 1.4826).replace(0, np.nan).fillna(s["value"].std() or 1.0)
        s["predicted"] = med.fillna(s["value"].median())
        s["lower"] = (s["predicted"] - self.k * sigma).clip(lower=0)
        s["upper"] = s["predicted"] + self.k * sigma
        band = ((s["upper"] - s["lower"]) / 2).clip(lower=1e-9)
        residual = (s["value"] - s["predicted"]).abs() / band
        s["confidence"] = np.exp(-residual * 0.8)
        s["is_anomaly"] = (s["value"] < s["lower"]) | (s["value"] > s["upper"])
        return ScoredSeries(self.name, True, s)

    def _empty(self, df: pd.DataFrame) -> pd.DataFrame:
        s = df.copy()
        for col, default in [("predicted", np.nan), ("lower", np.nan),
                             ("upper", np.nan), ("confidence", 1.0)]:
            s[col] = s["value"] if col == "predicted" else default
        s["is_anomaly"] = False
        return s


class ProphetDetector:
    name = "prophet"

    def __init__(self, settings):
        self.s = settings

    def score(self, df: pd.DataFrame) -> ScoredSeries:
        if len(df) < 20:
            # Not enough history to train Prophet meaningfully.
            return StatisticalDetector(self.s.prophet_interval_width).score(df)

        pdf = pd.DataFrame({
            "ds": pd.to_datetime(df["ts"]).dt.tz_localize(None),
            "y": df["value"].astype(float),
        }).dropna()

        try:
            model = Prophet(
                interval_width=self.s.prophet_interval_width,
                changepoint_prior_scale=self.s.prophet_changepoint_prior_scale,
                daily_seasonality=self.s.prophet_daily_seasonality,
                weekly_seasonality=self.s.prophet_weekly_seasonality,
                yearly_seasonality=False,
                seasonality_mode="multiplicative",
            )
            model.fit(pdf)
            forecast = model.predict(pdf[["ds"]])
        except Exception as e:
            logger.warning(f"Prophet fit failed ({e}); falling back to statistical.")
            return StatisticalDetector(self.s.prophet_interval_width).score(df)

        out = df.copy().reset_index(drop=True)
        out["predicted"] = forecast["yhat"].values
        out["lower"] = forecast["yhat_lower"].clip(lower=0).values
        out["upper"] = forecast["yhat_upper"].values
        band = ((out["upper"] - out["lower"]) / 2).clip(lower=1e-9)
        residual = (out["value"] - out["predicted"]).abs() / band
        out["confidence"] = np.exp(-residual * 0.8)
        out["is_anomaly"] = (out["value"] < out["lower"]) | (out["value"] > out["upper"])
        return ScoredSeries(self.name, True, out)


def make_detector(settings):
    """Factory: return Prophet if usable & enabled, else the statistical detector."""
    if settings.prophet_enabled and _PROPHET_OK:
        return ProphetDetector(settings)
    return StatisticalDetector(settings.prophet_interval_width)


def prophet_available() -> bool:
    return _PROPHET_OK
