/**
 * components/AnomalyChart.jsx — the core visualisation.
 * ====================================================
 * Renders observed values, the Prophet forecast line, the confidence band
 * (shaded), and anomaly markers. Every visual element is explained in the
 * legend AND in the caveats below the chart, so a user unfamiliar with Prophet
 * can interpret every data point.
 */
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { theme, sevColors } from "../theme";
import { config } from "../config";

function downsample(points, max) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, i) => i % step === 0 || points[i].is_anomaly);
}

function fmtTime(iso, windowDays) {
  const d = new Date(iso);
  if (windowDays <= 2) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Dot(props) {
  const { cx, cy, payload } = props;
  if (!payload.is_anomaly || cx == null || cy == null) return null;
  const { fg } = sevColors(payload.severity);
  return <circle cx={cx} cy={cy} r={4.5} fill={fg} stroke={theme.color.bg} strokeWidth={1.5} />;
}

export function AnomalyChart({ data, windowDays, color, unit, height = 230 }) {
  const points = downsample(data, config.maxChartPoints).map((p) => ({
    ...p, t: fmtTime(p.ts, windowDays),
  }));
  const accent = color || theme.color.accent;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={points} margin={{ top: 8, right: 14, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={`area-${accent}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.18} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.color.border} vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: theme.color.textFaint, fontFamily: theme.font.mono }}
                 tickLine={false} axisLine={{ stroke: theme.color.border }}
                 interval={Math.max(0, Math.floor(points.length / 7))} minTickGap={24} />
          <YAxis tick={{ fontSize: 10, fill: theme.color.textFaint, fontFamily: theme.font.mono }}
                 tickLine={false} axisLine={false} width={42}
                 tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v * 100) / 100)} />
          <Tooltip
            contentStyle={{
              background: theme.color.surface2, border: `1px solid ${theme.color.borderStrong}`,
              borderRadius: theme.radius.md, fontSize: theme.size.xs, fontFamily: theme.font.mono,
            }}
            labelStyle={{ color: theme.color.textFaint }}
            itemStyle={{ color: theme.color.text }}
            formatter={(v, name) => {
              const labels = { upper: "Upper band", lower: "Lower band", predicted: "Forecast", value: "Observed" };
              return [v == null ? "—" : `${Number(v).toFixed(2)} ${unit || ""}`, labels[name] || name];
            }}
          />
          {/* Confidence band: draw upper as filled area, mask with lower */}
          <Area type="monotone" dataKey="upper" stroke="none" fill={theme.color.watch} fillOpacity={0.07} name="upper" isAnimationActive={false} connectNulls />
          <Area type="monotone" dataKey="lower" stroke="none" fill={theme.color.inset} fillOpacity={1} name="lower" isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="predicted" stroke={theme.color.textFaint} strokeWidth={1.3}
                strokeDasharray="5 4" dot={false} name="predicted" isAnimationActive={false} connectNulls />
          <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2}
                fill={`url(#area-${accent})`} dot={<Dot />} activeDot={{ r: 4 }}
                name="value" isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend — every series explained */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10, fontSize: theme.size.xs, color: theme.color.textFaint }}>
        <LegendItem swatch={<span style={{ width: 14, height: 2, background: accent, display: "inline-block" }} />} text="Observed" />
        <LegendItem swatch={<span style={{ width: 14, height: 0, borderTop: `2px dashed ${theme.color.textFaint}`, display: "inline-block" }} />} text="Forecast (Prophet)" />
        <LegendItem swatch={<span style={{ width: 14, height: 9, background: theme.color.watch, opacity: 0.2, display: "inline-block", borderRadius: 2 }} />} text="Confidence band" />
        <LegendItem swatch={<span style={{ width: 9, height: 9, borderRadius: "50%", background: theme.color.warning, display: "inline-block" }} />} text="Anomaly" />
      </div>
    </div>
  );
}

function LegendItem({ swatch, text }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {swatch}{text}
    </span>
  );
}
