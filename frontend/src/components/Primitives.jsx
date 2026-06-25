/**
 * components/Primitives.jsx — small reusable building blocks.
 */
import { theme, sevColors } from "../theme";
import { SEVERITY } from "../config";

export function Card({ children, style, accent, ...rest }) {
  return (
    <div
      style={{
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        borderLeft: accent ? `3px solid ${accent}` : `1px solid ${theme.color.border}`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SeverityDot({ severity, size = 8, pulse = false }) {
  const { fg } = sevColors(severity);
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%", background: fg,
        display: "inline-block", flexShrink: 0,
        boxShadow: severity !== "NORMAL" ? `0 0 0 3px ${fg}22` : "none",
        animation: pulse && severity === "CRITICAL" ? "augurPulse 1.6s infinite" : "none",
      }}
    />
  );
}

export function Badge({ severity }) {
  const { fg, bg, border } = sevColors(severity);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: theme.size.xxs, fontWeight: 500, letterSpacing: "0.02em",
      color: fg, background: bg, border: `1px solid ${border}`,
      padding: "3px 10px", borderRadius: theme.radius.pill, fontFamily: theme.font.sans,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: fg }} />
      {SEVERITY[severity]?.label || severity}
    </span>
  );
}

export function Tag({ children }) {
  return (
    <span style={{
      fontSize: theme.size.xxs, color: theme.color.textMute,
      background: theme.color.surface2, border: `1px solid ${theme.color.border}`,
      padding: "3px 9px", borderRadius: theme.radius.pill, fontFamily: theme.font.mono,
    }}>
      {children}
    </span>
  );
}

export function ConfidenceBar({ value, showLabel = true }) {
  const pct = Math.round((value ?? 1) * 100);
  const color =
    value > 0.8 ? theme.color.healthy :
    value > 0.45 ? theme.color.watch :
    value > 0.3 ? theme.color.warning : theme.color.critical;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div style={{ flex: 1, height: 5, background: theme.color.surface3, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width .3s" }} />
      </div>
      {showLabel && (
        <span style={{ fontSize: theme.size.xs, fontWeight: 500, color, minWidth: 34, textAlign: "right", fontFamily: theme.font.mono }}>
          {pct}%
        </span>
      )}
    </div>
  );
}

export function Stat({ label, value, unit, sub, color }) {
  return (
    <div>
      <div style={{ fontSize: theme.size.xxs, color: theme.color.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: theme.size.xxl, fontWeight: 600, color: color || theme.color.text, fontFamily: theme.font.mono, lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: theme.size.md, color: theme.color.textFaint, fontFamily: theme.font.mono }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: theme.size.xs, color: theme.color.textFaint, marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.color.textFaint, fontSize: theme.size.sm, padding: 24 }}>
      <span style={{
        width: 14, height: 14, border: `2px solid ${theme.color.border}`,
        borderTopColor: theme.color.accent, borderRadius: "50%",
        display: "inline-block", animation: "augurSpin .8s linear infinite",
      }} />
      {label}…
    </div>
  );
}
