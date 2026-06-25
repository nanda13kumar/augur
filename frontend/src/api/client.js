/**
 * api/client.js — Thin, typed-ish API client.
 * ==========================================
 * All network access goes through here. Every call targets the relative
 * config.apiBaseUrl so the proxy decides the real backend address/port.
 */

import { config } from "../config";

async function get(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ).toString();
  const url = `${config.apiBaseUrl}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function post(path) {
  const res = await fetch(`${config.apiBaseUrl}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return res.json();
}

export const api = {
  health:      () => get("/health"),
  config:      () => get("/config"),
  overview:    (window) => get("/overview", { window }),
  services:    (window) => get("/services", { window }),
  timeseries:  (service, metric, window) =>
                 get(`/services/${encodeURIComponent(service)}/metrics/${encodeURIComponent(metric)}`, { window }),
  anomalies:   (window, severity) => get("/anomalies", { window, severity }),
  rediscover:  () => post("/discover"),
};
