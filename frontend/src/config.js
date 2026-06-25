/**
 * config.js — Single source of truth for ALL frontend configuration.
 * ==================================================================
 * This is the ONLY file you should need to touch to rebrand, repoint, or
 * retune the UI. Everything below can also be overridden at BUILD time via
 * Vite env vars (VITE_*), so Docker images stay generic and are configured
 * per-environment without a rebuild.
 *
 * Note on ports / API URL: the frontend ALWAYS calls the API at a relative
 * path ("/api/v1"). A proxy (Vite in dev, nginx in Docker) forwards that to
 * the backend. This is deliberate — it means the backend port is fully
 * configurable via .env with zero frontend code changes.
 */

const env = import.meta.env || {};

export const config = {
  // ── Branding (also overridable by the backend /config response) ──────────
  appName: env.VITE_APP_NAME || "Augur",
  tagline: env.VITE_APP_TAGLINE || "Predictive Anomaly Detection",
  // A short, honest one-liner shown in the header.
  subtitle: env.VITE_APP_SUBTITLE || "Prophet · Prometheus",

  // ── API ──────────────────────────────────────────────────────────────────
  // Relative on purpose. See note above. Override only for cross-origin setups.
  apiBaseUrl: env.VITE_API_BASE_URL || "/api/v1",

  // ── Polling / refresh ──────────────────────────────────────────────────────
  pollIntervalMs: Number(env.VITE_POLL_INTERVAL_MS || 30000), // auto-refresh cadence
  healthPollMs: Number(env.VITE_HEALTH_POLL_MS || 15000),

  // ── Defaults (backend /config usually overrides these) ───────────────────
  defaultWindowDays: Number(env.VITE_DEFAULT_WINDOW_DAYS || 30),
  availableWindowsDays: [7, 14, 30, 60, 90],

  // ── Display tuning ─────────────────────────────────────────────────────────
  maxChartPoints: Number(env.VITE_MAX_CHART_POINTS || 600), // downsample for snappy charts
};

// Severity vocabulary used across the whole UI. Change labels/colors in ONE place.
export const SEVERITY = {
  CRITICAL: { label: "Breached", short: "Critical", rank: 3 },
  WARNING:  { label: "At Risk",  short: "Warning",  rank: 2 },
  WATCH:    { label: "Watch",    short: "Watch",    rank: 1 },
  NORMAL:   { label: "Healthy",  short: "Normal",   rank: 0 },
};

// Human-friendly copy for the "How to read this dashboard" caveat panels.
// Centralised so product/UX can edit wording without hunting through components.
export const CAVEATS = {
  dashboard:
    "Availability-style status is derived from a Prophet forecast, not a fixed threshold. " +
    "A service is flagged when recent values fall outside the band the model learned from history. " +
    "“Confidence” is how normal a value looks (100% = right on the prediction; low = far outside the expected range) — " +
    "it is NOT a probability that something is broken.",
  chart:
    "The shaded band is the model’s prediction interval. Points inside it are expected; dots outside are flagged. " +
    "A single isolated dot that immediately recovers is usually noise — act on sustained deviations, not one scrape.",
  confidence:
    "Confidence score measures deviation from the learned pattern. " +
    "It does not know business context: a planned batch job, a marketing campaign, or a deploy can all look anomalous while being perfectly fine.",
};
