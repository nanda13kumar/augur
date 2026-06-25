/**
 * components/ServiceCard.jsx — one service in the Overview grid.
 * Matches the reference: status border, three key metric tiles, the worst-metric
 * confidence bar, tech tags, and an Analyse action that opens the detail view.
 */
import { Card, Badge, Tag, ConfidenceBar } from "./Primitives";
import { theme, sevColors } from "../theme";

const KEY_METRICS = ["request_rate", "error_rate", "latency_p99"];

function fmtValue(v, unit) {
  if (v == null) return "—";
  if (unit === "%") return v.toFixed(3);
  if (unit === "ms") return Math.round(v);
  if (unit === "MB") return Math.round(v);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(1);
}

export function ServiceCard({ service, onAnalyse }) {
  const { fg } = sevColors(service.worst_severity);
  const byKey = Object.fromEntries(service.metrics.map((m) => [m.key, m]));
  // pick up to 3 metrics to show as tiles (prefer the canonical three)
  const tiles = KEY_METRICS.filter((k) => byKey[k]).slice(0, 3).map((k) => byKey[k]);
  while (tiles.length < 3) {
    const extra = service.metrics.find((m) => !tiles.includes(m));
    if (!extra) break;
    tiles.push(extra);
  }
  const worstMetric = [...service.metrics].sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1))[0];

  return (
    <Card accent={fg} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: theme.size.lg, fontWeight: 600, color: theme.color.text }}>{service.label}</div>
          <div style={{ fontSize: theme.size.xs, color: theme.color.textFaint, marginTop: 4, lineHeight: 1.5, minHeight: 32 }}>
            {service.description}
          </div>
        </div>
        <Badge severity={service.worst_severity} />
      </div>

      {/* metric tiles */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: 10 }}>
        {tiles.map((m) => {
          const c = sevColors(m.severity);
          return (
            <div key={m.key} style={{ background: theme.color.inset, border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md, padding: "10px 12px" }}>
              <div style={{ fontSize: theme.size.xxs, color: theme.color.textFaint, marginBottom: 6 }}>{m.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: theme.size.lg, fontWeight: 600, fontFamily: theme.font.mono, color: m.severity === "NORMAL" ? theme.color.text : c.fg }}>
                  {fmtValue(m.value, m.unit)}
                </span>
                <span style={{ fontSize: theme.size.xxs, color: theme.color.textFaint, fontFamily: theme.font.mono }}>{m.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* worst-metric confidence */}
      {worstMetric && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: theme.size.xs, color: theme.color.textMute }}>
              Model confidence · {worstMetric.label}
            </span>
            <span style={{ fontSize: theme.size.xs, color: theme.color.textFaint }}>
              {worstMetric.severity === "NORMAL" ? "within expected band" : "deviating from forecast"}
            </span>
          </div>
          <ConfidenceBar value={worstMetric.confidence} showLabel={false} />
        </div>
      )}

      {/* footer: tech + analyse */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: "auto" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(service.tech || []).map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
        <button onClick={() => onAnalyse(service)} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "transparent", color: fg, border: `1px solid ${fg}55`,
          borderRadius: theme.radius.md, padding: "6px 14px", cursor: "pointer",
          fontSize: theme.size.xs, fontWeight: 500, fontFamily: theme.font.sans, whiteSpace: "nowrap",
        }}>
          ⌕ Analyse
        </button>
      </div>
    </Card>
  );
}
