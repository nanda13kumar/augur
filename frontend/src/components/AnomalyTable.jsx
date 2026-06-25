/**
 * components/AnomalyTable.jsx — ranked list of current anomalies with guidance.
 */
import { useState } from "react";
import { Card, Badge, ConfidenceBar } from "./Primitives";
import { ActionBlock } from "./CaveatPanel";
import { theme, sevColors } from "../theme";

export function AnomalyTable({ report, onInspect }) {
  const [open, setOpen] = useState(null);
  if (!report || report.total === 0) {
    return (
      <Card style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
        <div style={{ color: theme.color.healthy, fontWeight: 500 }}>No anomalies in the selected window.</div>
        <div style={{ color: theme.color.textFaint, fontSize: theme.size.sm, marginTop: 6 }}>
          All services are tracking within their forecast bands.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {report.items.map((a) => {
        const { fg } = sevColors(a.severity);
        const isOpen = open === a.id;
        return (
          <Card key={a.id} accent={fg} style={{ padding: 0, overflow: "hidden" }}>
            <button onClick={() => setOpen(isOpen ? null : a.id)} style={{
              display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr 1fr auto",
              gap: 16, alignItems: "center", width: "100%", background: "transparent",
              border: "none", padding: "14px 18px", cursor: "pointer", textAlign: "left",
            }}>
              <div>
                <div style={{ fontSize: theme.size.sm, fontWeight: 500, color: theme.color.text }}>{a.service_label}</div>
                <div style={{ fontSize: theme.size.xs, color: theme.color.textFaint, marginTop: 2 }}>{a.metric_label}</div>
              </div>
              <div><Badge severity={a.severity} /></div>
              <div style={{ fontSize: theme.size.xs, color: theme.color.textMute, fontFamily: theme.font.mono }}>
                {a.direction === "spike" ? "▲" : "▼"} {a.direction}
              </div>
              <div>
                <div style={{ fontSize: theme.size.xxs, color: theme.color.textFaint, marginBottom: 4 }}>
                  observed {a.observed} vs ~{a.expected} {a.unit}
                </div>
                <ConfidenceBar value={a.confidence} />
              </div>
              <span style={{ color: theme.color.textFaint, fontSize: 13 }}>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${theme.color.border}`, paddingTop: 16 }}>
                <ActionBlock label={a.recommended_action_label} steps={a.recommended_steps} color={fg} caveat={a.caveat} />
                <button onClick={() => onInspect(a.service, a.metric_key)} style={{
                  marginTop: 14, background: theme.color.surface2, color: theme.color.text,
                  border: `1px solid ${theme.color.borderStrong}`, borderRadius: theme.radius.md,
                  padding: "7px 14px", cursor: "pointer", fontSize: theme.size.xs, fontFamily: theme.font.sans,
                }}>
                  ⌕ Inspect timeseries
                </button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
