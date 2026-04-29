/**
 * Isolines: calories per gram of protein (§5).
 *
 *   cal_per_g_protein = 4 / P%
 *
 * In strict per-calorie space these are straight horizontal bands parallel
 * to the C–F base, so each isoline is just a line at the y-coordinate of
 * P% on the triangle.
 */
import { ternaryToXY, type TriangleBounds } from "./geometry";

export type Isoline = {
  pct: number; // protein calorie share, 0–1
  cal_per_g: number; // 4 / pct
  label: string;
  // Endpoints across the triangle at this P%:
  left: { x: number; y: number };
  right: { x: number; y: number };
};

const LEVELS: { pct: number; label: string }[] = [
  { pct: 1.0, label: "4" },
  { pct: 0.5, label: "8" },
  { pct: 0.33, label: "12" },
  { pct: 0.25, label: "16" },
  { pct: 0.2, label: "20" },
  { pct: 0.1, label: "40" },
];

export function isolines(bounds: TriangleBounds): Isoline[] {
  return LEVELS.map(({ pct, label }) => {
    // At a given P%, the C and F shares fill the remaining 1-P%.
    // We need the two endpoints of the horizontal band: one with c=1-pct,f=0
    // (left edge of triangle) and one with c=0,f=1-pct (right edge).
    const left = ternaryToXY(pct, 1 - pct, 0, bounds);
    const right = ternaryToXY(pct, 0, 1 - pct, bounds);
    return {
      pct,
      cal_per_g: 4 / pct,
      label,
      left,
      right,
    };
  });
}
