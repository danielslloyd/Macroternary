// Central bag of *tunable* visual parameters for the ternary plot.
//
// Everything that controls how the chart looks lives here so the renderer
// stays declarative: `renderTernary` reads values, it never hard-codes them.
// The controls panel (controls.js) mutates a copy of this object and the
// choices are persisted to localStorage so they survive reloads.

export const DEFAULT_THEME = {
  // ─── canvas ──────────────────────────────────────────────────────────
  background: "#faf9f5", // outer panel colour
  triangleFill: "#ffffff", // interior of the triangle

  // ─── triangle outline ────────────────────────────────────────────────
  triangleStroke: "#1f2937",
  triangleStrokeWidth: 1.5,

  // ─── point colouring ─────────────────────────────────────────────────
  // "macro"    → blend the three corner colours by the food's P/C/F share
  // "retailer" → fixed colour per retailer (useful for the curated snapshot)
  colorMode: "macro",
  pointSize: 4.5,
  selectedPointSize: 8,
  pointOpacity: 0.9,
  pointStroke: "#ffffff",
  pointStrokeWidth: 1,
  dimmedOpacity: 0.12, // points outside the selected family
  pointShadow: true,

  // ─── macro corner colours (drive tints + macro colouring) ────────────
  macroColors: {
    protein: "#6366f1", // indigo — top vertex
    carbs: "#14b8a6", // teal   — bottom-left vertex
    fat: "#f97316", // orange — bottom-right vertex
  },

  // ─── corner tint wash ────────────────────────────────────────────────
  cornerTint: true,
  tintStrength: 0.16, // 0 = off, ~0.4 = heavy

  // ─── triangular grid ─────────────────────────────────────────────────
  showGrid: true,
  gridInterval: 0.2, // spacing as a fraction (0.2 = every 20%)
  gridColor: "#cbd5e1",
  gridWidth: 0.6,
  gridOpacity: 0.55,

  // ─── protein calorie-cost isolines ───────────────────────────────────
  showIsolines: true,
  isolineColor: "#94a3b8",
  isolineWidth: 0.9,
  isolineDash: "4 4",
  isolineLabelColor: "#64748b",

  // ─── axis ticks (percent labels along the three edges) ───────────────
  showTicks: false,
  tickColor: "#64748b",
  tickFontSize: 9,

  // ─── vertex labels ───────────────────────────────────────────────────
  vertexFontSize: 14,
  vertexColor: "#111827",

  // ─── recipe markers ──────────────────────────────────────────────────
  recipeSize: 8,
  recipeColor: "#f59e0b",
  recipeStroke: "#ffffff",

  // ─── legend ──────────────────────────────────────────────────────────
  showLegend: true,

  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
};

// Colours used for retailers when colorMode === "retailer".
export const RETAILER_COLORS = {
  trader_joes: "#dc2626",
  walmart: "#1d4ed8",
  costco: "#0d9488",
  csv: "#6b7280",
};
export const FALLBACK_COLOR = "#6b7280";

const STORAGE_KEY = "mt.theme.v1";

// Deep-ish merge that only touches the one nested object we have.
function mergeTheme(base, override) {
  const out = { ...base, ...(override || {}) };
  out.macroColors = { ...base.macroColors, ...(override?.macroColors || {}) };
  return out;
}

export function loadTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME, macroColors: { ...DEFAULT_THEME.macroColors } };
    return mergeTheme(DEFAULT_THEME, JSON.parse(raw));
  } catch {
    return { ...DEFAULT_THEME, macroColors: { ...DEFAULT_THEME.macroColors } };
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export function resetTheme() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_THEME, macroColors: { ...DEFAULT_THEME.macroColors } };
}

// ─── colour helpers ────────────────────────────────────────────────────

export function hexToRgb(hex) {
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// Blend the three macro colours weighted by a food's calorie/mass shares.
// A gamma > 1 sharpens the mix so the dominant macro reads clearly instead
// of everything trending muddy-grey in the middle.
export function macroColor(p_pct, c_pct, f_pct, theme, gamma = 1.4) {
  const wp = Math.pow(Math.max(0, p_pct), gamma);
  const wc = Math.pow(Math.max(0, c_pct), gamma);
  const wf = Math.pow(Math.max(0, f_pct), gamma);
  const s = wp + wc + wf;
  // Foods with no macros at all (e.g. water) have zero shares — fall back to
  // a neutral grey instead of blending to black.
  if (s <= 0) return "#9ca3af";
  const P = hexToRgb(theme.macroColors.protein);
  const C = hexToRgb(theme.macroColors.carbs);
  const F = hexToRgb(theme.macroColors.fat);
  return rgbToHex(
    (P.r * wp + C.r * wc + F.r * wf) / s,
    (P.g * wp + C.g * wc + F.g * wf) / s,
    (P.b * wp + C.b * wc + F.b * wf) / s,
  );
}
