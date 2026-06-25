/**
 * App.jsx — application shell & view orchestration.
 * ================================================
 * Owns global state (window, view, selected service), polling, and data
 * fetching, then composes the presentational components. Three views:
 *   • Overview      — KPI row + service grid
 *   • Service detail — per-metric Prophet charts + caveats
 *   • Anomalies     — ranked, actionable anomaly list
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api/client";
import { config, CAVEATS } from "./config";
import { theme, sevColors } from "./theme";

import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { MetricCard } from "./components/MetricCard";
import { ServiceCard } from "./components/ServiceCard";
import { AnomalyChart } from "./components/AnomalyChart";
import { AnomalyTable } from "./components/AnomalyTable";
import { CaveatPanel } from "./components/CaveatPanel";
import { Card, Badge, Tag, Spinner } from "./components/Primitives";

export default function App() {
  const [boot, setBoot] = useState(null);          // /config
  const [health, setHealth] = useState(null);
  const [windowDays, setWindowDays] = useState(config.defaultWindowDays);
  const [view, setView] = useState("overview");    // overview | service | anomalies
  const [activeService, setActiveService] = useState(null);

  const [overview, setOverview] = useState(null);
  const [report, setReport] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [clock, setClock] = useState("");

  // ── clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    api.config().then(setBoot).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (boot?.default_window_days) setWindowDays(boot.default_window_days);
  }, [boot]);

  // ── data load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [ov, rep, h] = await Promise.all([
        api.overview(windowDays),
        api.anomalies(windowDays),
        api.health(),
      ]);
      setOverview(ov); setReport(rep); setHealth(h); setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  }, [windowDays]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, config.pollIntervalMs);
    return () => clearInterval(id);
  }, [load]);

  const appName = boot?.app_name || config.appName;
  const services = overview?.services || [];

  const openService = (svc) => { setActiveService(svc.id || svc); setView("service"); };
  const inspect = (svcId, metric) => { setActiveService(svcId); setView("service"); window.__augurMetric = metric; };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: theme.color.bg, color: theme.color.text, fontFamily: theme.font.sans }}>
      <Header
        appName={appName}
        tagline={boot?.tagline || config.tagline}
        health={health}
        windows={boot?.available_windows_days}
        window={windowDays}
        onWindow={setWindowDays}
        onRefresh={load}
        refreshing={refreshing}
        clock={clock}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          services={services}
          view={view}
          activeService={activeService}
          mode={health?.mode}
          onView={(v) => { setView(v); setActiveService(null); }}
          onSelectService={(id) => { setActiveService(id); setView("service"); }}
        />

        <main style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {error && (
            <Card accent={theme.color.critical} style={{ padding: 16, marginBottom: 18 }}>
              <div style={{ color: theme.color.critical, fontWeight: 500, fontSize: theme.size.sm }}>Couldn’t reach the API</div>
              <div style={{ color: theme.color.textFaint, fontSize: theme.size.xs, marginTop: 4, fontFamily: theme.font.mono }}>{error}</div>
            </Card>
          )}

          {!overview && !error && <Spinner label="Loading dashboard" />}

          {overview && view === "overview" && (
            <OverviewView overview={overview} report={report} onAnalyse={openService} />
          )}
          {overview && view === "anomalies" && (
            <AnomaliesView report={report} windowDays={windowDays} onInspect={inspect} />
          )}
          {view === "service" && activeService && (
            <ServiceDetailView
              serviceId={activeService}
              service={services.find((s) => s.id === activeService)}
              windowDays={windowDays}
              onBack={() => { setView("overview"); setActiveService(null); }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────────── Overview ─────────────────────────── */
function OverviewView({ overview, report, onAnalyse }) {
  const { color } = theme;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 1500, margin: "0 auto" }}>
      <CaveatPanel title="How to read this dashboard">{CAVEATS.dashboard}</CaveatPanel>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <MetricCard label="Services Monitored" value={overview.total_services} sub={overview.mode === "live" ? "From Prometheus" : "Demo dataset"} />
        <MetricCard label="Healthy" value={overview.healthy} color={color.healthy} sub="Within forecast band" />
        <MetricCard label="At Risk" value={overview.at_risk} color={color.warning} sub="Watch / warning" />
        <MetricCard label="Breached" value={overview.breached} color={color.critical} sub="Critical deviation" />
        <MetricCard label="Active Anomalies" value={report?.total ?? "—"} color={report?.total ? color.warning : color.healthy} sub={`Rolling ${overview.window_days}d`} />
      </div>

      <SectionLabel>Service Summary</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 16 }}>
        {overview.services.map((s) => <ServiceCard key={s.id} service={s} onAnalyse={onAnalyse} />)}
      </div>
    </div>
  );
}

/* ─────────────────────────── Anomalies ─────────────────────────── */
function AnomaliesView({ report, windowDays, onInspect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionLabel>Anomaly Report · Rolling {windowDays}d</SectionLabel>
        {report && (
          <div style={{ display: "flex", gap: 8 }}>
            <CountPill n={report.critical} severity="CRITICAL" />
            <CountPill n={report.warning} severity="WARNING" />
            <CountPill n={report.watch} severity="WATCH" />
          </div>
        )}
      </div>
      <CaveatPanel title="What counts as an anomaly" tone="warning">{CAVEATS.confidence}</CaveatPanel>
      <AnomalyTable report={report} onInspect={onInspect} />
    </div>
  );
}

/* ─────────────────────── Service Detail ─────────────────────── */
function ServiceDetailView({ serviceId, service, windowDays, onBack }) {
  const [series, setSeries] = useState({});  // metricKey → timeseries
  const [loading, setLoading] = useState(true);
  const metricKeys = service?.available_metric_keys || [];
  const focusRef = useRef(window.__augurMetric);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(metricKeys.map((k) => api.timeseries(serviceId, k, windowDays).then((d) => [k, d]).catch(() => [k, null])))
      .then((pairs) => { if (!cancelled) { setSeries(Object.fromEntries(pairs)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [serviceId, windowDays, metricKeys.join(",")]);

  if (!service) return <Spinner label="Loading service" />;
  const { fg } = sevColors(service.worst_severity);

  // order metrics so a focused (inspected) metric comes first
  const ordered = [...metricKeys].sort((a, b) => (a === focusRef.current ? -1 : b === focusRef.current ? 1 : 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100, margin: "0 auto" }}>
      <button onClick={onBack} style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: theme.color.textMute, cursor: "pointer", fontSize: theme.size.sm, fontFamily: theme.font.sans }}>
        ← Back to overview
      </button>

      <Card accent={fg} style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: theme.size.xl, fontWeight: 600 }}>{service.label}</span>
              <Badge severity={service.worst_severity} />
            </div>
            <div style={{ fontSize: theme.size.sm, color: theme.color.textMute, marginTop: 6, maxWidth: 620, lineHeight: 1.6 }}>{service.description}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {(service.tech || []).map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
        </div>
      </Card>

      {loading && <Spinner label="Training models & loading series" />}

      {!loading && ordered.map((key) => {
        const ts = series[key];
        if (!ts) return null;
        const metricSnap = service.metrics.find((m) => m.key === key);
        const sev = metricSnap?.severity || "NORMAL";
        const c = sevColors(sev);
        return (
          <Card key={key} style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: theme.size.md, fontWeight: 600 }}>{ts.metric.label}</span>
                <Badge severity={sev} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: theme.size.xs, color: theme.color.textFaint, fontFamily: theme.font.mono }}>
                <span>detector: {ts.detector}</span>
                <span>·</span>
                <span>{ts.metric.unit}</span>
              </div>
            </div>
            <div style={{ fontSize: theme.size.xs, color: theme.color.textFaint, marginBottom: 12, lineHeight: 1.5 }}>{ts.metric.description}</div>

            <AnomalyChart data={ts.points} windowDays={windowDays} color={sev === "NORMAL" ? theme.color.accent : c.fg} unit={ts.metric.unit} />

            {/* per-series caveats — interpret every data point */}
            <div style={{ marginTop: 16, background: theme.color.inset, border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md, padding: "12px 16px" }}>
              <div style={{ fontSize: theme.size.xxs, color: theme.color.info, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Reading this chart
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {ts.caveats.map((cv, i) => (
                  <li key={i} style={{ fontSize: theme.size.xs, color: theme.color.textMute, lineHeight: 1.7, marginBottom: 3 }}>{cv}</li>
                ))}
              </ul>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: theme.size.xs, color: theme.color.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>
      {children}
    </div>
  );
}

function CountPill({ n, severity }) {
  const { fg, bg, border } = sevColors(severity);
  return (
    <span style={{ fontSize: theme.size.xs, color: fg, background: bg, border: `1px solid ${border}`, padding: "4px 12px", borderRadius: theme.radius.pill, fontFamily: theme.font.mono }}>
      {n} {severity.toLowerCase()}
    </span>
  );
}
