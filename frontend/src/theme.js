/**
 * theme.js — Design tokens (the visual language).
 * ===============================================
 * One cohesive, professional dark palette tuned for long-session readability
 * in an ops/observability context. Colours, type scale, spacing and radii all
 * live here so the look-and-feel is consistent and trivially re-skinnable.
 *
 * Typography: IBM Plex Sans for UI, IBM Plex Mono for numbers/metrics.
 * Chosen because it is enterprise-grade and engineered for dense technical
 * dashboards — distinct from generic default UI fonts, loaded via Google Fonts.
 */

export const theme = {
  color: {
    // Surfaces — layered navy, low-glare for long sessions
    bg:        "#070A12",   // app background
    surface:   "#0E121C",   // panels / cards
    surface2:  "#141A28",   // raised inner elements
    surface3:  "#1B2233",   // hover / active fills
    inset:     "#0A0E17",   // wells, chart backgrounds

    // Borders / dividers
    border:    "rgba(255,255,255,0.07)",
    borderStrong: "rgba(255,255,255,0.13)",

    // Text
    text:      "#E7EBF3",   // primary
    textMute:  "#9AA4B6",   // secondary
    textFaint: "#5C6679",   // tertiary / labels
    textGhost: "#3A4255",   // disabled / footnotes

    // Brand accent
    accent:    "#5B8DEF",   // primary blue
    accentDim: "#2C4A87",

    // Semantic (status)
    healthy:   "#34D399",   healthyBg: "rgba(52,211,153,0.10)",  healthyBorder: "rgba(52,211,153,0.30)",
    watch:     "#60A5FA",   watchBg:   "rgba(96,165,250,0.10)",  watchBorder:   "rgba(96,165,250,0.30)",
    warning:   "#F5B041",   warningBg: "rgba(245,176,65,0.10)",  warningBorder: "rgba(245,176,65,0.32)",
    critical:  "#F26D6D",   criticalBg:"rgba(242,109,109,0.10)", criticalBorder:"rgba(242,109,109,0.32)",
    info:      "#A78BFA",   infoBg:    "rgba(167,139,250,0.08)", infoBorder:    "rgba(167,139,250,0.28)",
  },

  font: {
    sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'IBM Plex Mono', 'SF Mono', 'Roboto Mono', monospace",
  },

  // type scale (px)
  size: {
    xxl: 30, xl: 22, lg: 18, md: 15, sm: 13, xs: 12, xxs: 11,
  },

  radius: { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 },

  space: (n) => `${n * 4}px`,
};

// Map a severity key → the relevant colour triplet for fills/borders/text.
export function sevColors(severity) {
  const c = theme.color;
  switch (severity) {
    case "CRITICAL": return { fg: c.critical, bg: c.criticalBg, border: c.criticalBorder };
    case "WARNING":  return { fg: c.warning,  bg: c.warningBg,  border: c.warningBorder };
    case "WATCH":    return { fg: c.watch,    bg: c.watchBg,    border: c.watchBorder };
    default:         return { fg: c.healthy,  bg: c.healthyBg,  border: c.healthyBorder };
  }
}
