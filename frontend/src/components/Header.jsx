/**
 * components/Header.jsx — top app bar: brand, status, window selector, refresh.
 */
import { theme } from "../theme";
import { config } from "../config";

export function Header({
  appName, tagline, health, windows, window, onWindow, onRefresh, clock, refreshing,
}) {
  const mode = health?.mode;
  const live = mode === "live";

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px", height: 64, background: theme.color.surface,
      borderBottom: `1px solid ${theme.color.border}`, flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logo />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: theme.size.lg, fontWeight: 600, color: theme.color.text, letterSpacing: "-0.01em" }}>
              {appName}
            </span>
            <StatusPill live={live} mode={mode} services={health?.services_discovered} />
          </div>
          <div style={{ fontSize: theme.size.xs, color: theme.color.textFaint, marginTop: 1 }}>
            {tagline} · {config.subtitle}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", background: theme.color.inset, borderRadius: theme.radius.md, padding: 3, border: `1px solid ${theme.color.border}` }}>
          {(windows || config.availableWindowsDays).map((w) => (
            <button key={w} onClick={() => onWindow(w)} style={{
              border: "none", cursor: "pointer", fontFamily: theme.font.mono,
              background: window === w ? theme.color.accent : "transparent",
              color: window === w ? "#fff" : theme.color.textMute,
              fontSize: theme.size.xs, fontWeight: 500, padding: "5px 12px",
              borderRadius: theme.radius.sm, transition: "all .15s",
            }}>{w}d</button>
          ))}
        </div>
        <button onClick={onRefresh} disabled={refreshing} style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: theme.color.surface2, color: theme.color.text,
          border: `1px solid ${theme.color.borderStrong}`, borderRadius: theme.radius.md,
          padding: "7px 14px", cursor: refreshing ? "default" : "pointer",
          fontSize: theme.size.sm, fontWeight: 500, fontFamily: theme.font.sans,
        }}>
          <span style={{ display: "inline-block", animation: refreshing ? "augurSpin .8s linear infinite" : "none" }}>↻</span>
          Refresh
        </button>
        <span style={{ fontSize: theme.size.xs, color: theme.color.textFaint, fontFamily: theme.font.mono, minWidth: 64, textAlign: "right" }}>
          {clock}
        </span>
      </div>
    </header>
  );
}

function StatusPill({ live, mode, services }) {
  const color = live ? theme.color.healthy : theme.color.warning;
  const text = live ? `Live · ${services ?? 0} services` : "Demo mode";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: theme.size.xxs, color, background: `${color}18`,
      border: `1px solid ${color}40`, padding: "2px 9px", borderRadius: theme.radius.pill,
      fontFamily: theme.font.mono,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {text}
    </span>
  );
}

function Logo() {
  return (
    <div style={{
      width: 38, height: 38, borderRadius: theme.radius.md,
      background: `linear-gradient(135deg, ${theme.color.accent}, ${theme.color.info})`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 17 L9 11 L13 14 L21 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="13" cy="14" r="1.8" fill="#fff" />
      </svg>
    </div>
  );
}
