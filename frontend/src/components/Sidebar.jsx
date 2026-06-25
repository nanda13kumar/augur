/**
 * components/Sidebar.jsx — dynamic navigation.
 * ===========================================
 * The service list is driven entirely by the backend catalog, so a service
 * newly discovered in Prometheus (e.g. `rundeck`) appears here automatically
 * on the next poll — no code change, no redeploy.
 */
import { theme, sevColors } from "../theme";
import { SeverityDot } from "./Primitives";

const VIEWS = [
  { id: "overview", label: "Overview", icon: "◎" },
  { id: "anomalies", label: "Anomalies", icon: "◆" },
];

export function Sidebar({ services, view, activeService, onView, onSelectService, mode }) {
  return (
    <aside style={{
      width: 250, flexShrink: 0, background: theme.color.surface,
      borderRight: `1px solid ${theme.color.border}`, height: "100%",
      overflowY: "auto", display: "flex", flexDirection: "column",
    }}>
      <NavSection title="Dashboard">
        {VIEWS.map((v) => (
          <NavItem key={v.id} active={view === v.id && !activeService}
                   onClick={() => onView(v.id)} icon={v.icon} label={v.label} />
        ))}
      </NavSection>

      <NavSection title={`Services · ${services.length}`}>
        {services.length === 0 && (
          <div style={{ fontSize: theme.size.xs, color: theme.color.textGhost, padding: "8px 12px" }}>
            No services discovered yet.
          </div>
        )}
        {services.map((s) => {
          const { fg } = sevColors(s.worst_severity);
          const active = view === "service" && activeService === s.id;
          return (
            <button key={s.id} onClick={() => onSelectService(s.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              background: active ? theme.color.surface3 : "transparent",
              border: "none", borderRadius: theme.radius.sm, padding: "8px 12px",
              cursor: "pointer", textAlign: "left", color: active ? theme.color.text : theme.color.textMute,
              fontSize: theme.size.sm, fontFamily: theme.font.sans, marginBottom: 1,
              borderLeft: active ? `2px solid ${theme.color.accent}` : "2px solid transparent",
            }}>
              <SeverityDot severity={s.worst_severity} pulse />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              {s.worst_severity !== "NORMAL" && (
                <span style={{ fontSize: 9, color: fg, fontFamily: theme.font.mono }}>●</span>
              )}
            </button>
          );
        })}
      </NavSection>

      <div style={{ marginTop: "auto", padding: 16, borderTop: `1px solid ${theme.color.border}` }}>
        <div style={{ fontSize: theme.size.xxs, color: theme.color.textGhost, lineHeight: 1.6 }}>
          {mode === "live"
            ? "Connected to Prometheus. New services appear automatically as they are discovered."
            : "Demo mode — synthetic data. Set PROMETHEUS_URL to connect a live workspace."}
        </div>
      </div>
    </aside>
  );
}

function NavSection({ title, children }) {
  return (
    <div style={{ padding: "14px 12px 6px" }}>
      <div style={{ fontSize: theme.size.xxs, color: theme.color.textGhost, textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 12px 8px" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function NavItem({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%",
      background: active ? theme.color.surface3 : "transparent", border: "none",
      borderRadius: theme.radius.sm, padding: "8px 12px", cursor: "pointer",
      textAlign: "left", color: active ? theme.color.text : theme.color.textMute,
      fontSize: theme.size.sm, fontFamily: theme.font.sans, marginBottom: 1,
      borderLeft: active ? `2px solid ${theme.color.accent}` : "2px solid transparent",
    }}>
      <span style={{ color: active ? theme.color.accent : theme.color.textFaint, width: 16, textAlign: "center" }}>{icon}</span>
      {label}
    </button>
  );
}
