/**
 * Theme: reads primary/secondary colors from env (hex), exposes CSS vars and opacity helpers.
 * Both are bright colors. Set in frontend/.env: VITE_PRIMARY_COLOR, VITE_SECONDARY_COLOR
 */

const DEFAULT_PRIMARY = "#805ad5";
const DEFAULT_SECONDARY = "#e16d37";

function parseHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const s = hex.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(s) && !/^[0-9A-Fa-f]{3}$/.test(s)) return null;
  if (s.length === 3) {
    return [
      parseInt(s[0] + s[0], 16),
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16),
    ];
  }
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/**
 * Convert hex to rgba string for opacity control.
 * @param {string} hex - e.g. "#2563eb"
 * @param {number} opacity - 0–1
 * @returns {string} "rgba(r, g, b, opacity)"
 */
export function hexToRgba(hex, opacity = 1) {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(0, 0, 0, ${opacity})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}

/**
 * Get theme config (for inline styles or JS usage).
 */
export function getTheme() {
  const primary = (import.meta.env.VITE_PRIMARY_COLOR || DEFAULT_PRIMARY).trim();
  const secondary = (import.meta.env.VITE_SECONDARY_COLOR || DEFAULT_SECONDARY).trim();
  const primaryRgb = parseHex(primary) || [128, 90, 213];
  const secondaryRgb = parseHex(secondary) || [225, 109, 55];
  return {
    primary,
    secondary,
    primaryRgb: primaryRgb.join(", "),
    secondaryRgb: secondaryRgb.join(", "),
    primaryRgba: (opacity) => hexToRgba(primary, opacity),
    secondaryRgba: (opacity) => hexToRgba(secondary, opacity),
  };
}

/**
 * Apply theme as CSS custom properties on :root for use in stylesheets.
 * Call once on app load (e.g. in App.jsx useEffect).
 */
export function applyTheme() {
  const t = getTheme();
  const root = document.documentElement;
  root.style.setProperty("--primary", t.primary);
  root.style.setProperty("--secondary", t.secondary);
  root.style.setProperty("--primary-rgb", t.primaryRgb);
  root.style.setProperty("--secondary-rgb", t.secondaryRgb);
  root.style.setProperty("--primary-10", t.primaryRgba(0.1));
  root.style.setProperty("--primary-20", t.primaryRgba(0.2));
  root.style.setProperty("--primary-90", t.primaryRgba(0.9));
  root.style.setProperty("--secondary-10", t.secondaryRgba(0.12));
  root.style.setProperty("--secondary-20", t.secondaryRgba(0.2));
  root.style.setProperty("--secondary-90", t.secondaryRgba(0.9));
}

export function getLogoUrl() {
  const url = import.meta.env.VITE_LOGO_URL;
  return url && String(url).trim() ? String(url).trim() : null;
}
