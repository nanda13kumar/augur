/**
 * components/CaveatPanel.jsx — the "how to read this / what's safe to ignore" panel.
 * One of the most important components: it keeps users honest about what the
 * numbers mean and what to do next.
 */
import { theme } from "../theme";

export function CaveatPanel({ title = "How to read this dashboard", children, tone = "info" }) {
  const toneColor = {
    info: theme.color.info,
    warning: theme.color.warning,
  }[tone] || theme.color.info;

  return (
    <div style={{
      background: theme.color.surface,
      border: `1px solid ${theme.color.border}`,
      borderLeft: `3px solid ${toneColor}`,
      borderRadius: theme.radius.lg,
      padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 18, height: 18, borderRadius: "50%", background: `${toneColor}22`,
          color: toneColor, display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}>i</span>
        <span style={{ fontSize: theme.size.sm, fontWeight: 500, color: toneColor }}>{title}</span>
      </div>
      <div style={{ fontSize: theme.size.sm, color: theme.color.textMute, lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

/** Inline "what's next" action block used on anomalies. */
export function ActionBlock({ label, steps, color, caveat }) {
  return (
    <div>
      <div style={{ fontSize: theme.size.xs, fontWeight: 500, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        What’s next — {label}
      </div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {steps.map((s, i) => (
          <li key={i} style={{ fontSize: theme.size.sm, color: theme.color.textMute, lineHeight: 1.8, marginBottom: 3 }}>{s}</li>
        ))}
      </ol>
      {caveat && (
        <div style={{ marginTop: 12, fontSize: theme.size.xs, color: theme.color.textFaint, lineHeight: 1.7, fontStyle: "italic", paddingTop: 10, borderTop: `1px solid ${theme.color.border}` }}>
          {caveat}
        </div>
      )}
    </div>
  );
}
