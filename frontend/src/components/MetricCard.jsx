/**
 * components/MetricCard.jsx — the top KPI row on the Overview.
 */
import { Card } from "./Primitives";
import { theme } from "../theme";

export function MetricCard({ label, value, unit, sub, color }) {
  return (
    <Card style={{ padding: "18px 20px", flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: theme.size.xxs, color: theme.color.textFaint,
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{
          fontSize: 34, fontWeight: 600, lineHeight: 1,
          color: color || theme.color.text, fontFamily: theme.font.mono,
        }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: theme.size.lg, color: theme.color.textFaint, fontFamily: theme.font.mono }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: theme.size.xs, color: theme.color.textFaint, marginTop: 10 }}>{sub}</div>}
    </Card>
  );
}
