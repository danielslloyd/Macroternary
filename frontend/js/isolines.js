// Isolines: calories per gram of protein (spec §5).
//
//   cal_per_g_protein = 4 / P%
//
// In strict per-calorie space this only depends on P%, so isolines are
// horizontal bands parallel to the C–F base.

import { ternaryToXY } from "./geometry.js";

const LEVELS = [
  { pct: 1.0, label: "4" },
  { pct: 0.5, label: "8" },
  { pct: 0.33, label: "12" },
  { pct: 0.25, label: "16" },
  { pct: 0.2, label: "20" },
  { pct: 0.1, label: "40" },
];

export function isolines(bounds) {
  return LEVELS.map(({ pct, label }) => {
    const left = ternaryToXY(pct, 1 - pct, 0, bounds);
    const right = ternaryToXY(pct, 0, 1 - pct, bounds);
    return { pct, label, cal_per_g: 4 / pct, left, right };
  });
}
