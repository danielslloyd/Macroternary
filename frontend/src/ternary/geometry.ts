/**
 * Ternary geometry helpers.
 *
 * Vertex assignment per spec §5:
 *   Top      = Protein (P)
 *   Bottom-L = Carbs   (C)
 *   Bottom-R = Fat     (F)
 *
 * Barycentric-to-cartesian mapping used everywhere:
 *   x = (W/2) + (F% - C%) * (W/2)
 *   y = H * (1 - P%)
 * for an equilateral-ish render area of width W, height H.
 */

export type TriangleBounds = {
  width: number;
  height: number;
  padding: number;
};

export type Cartesian = { x: number; y: number };

export function ternaryToXY(
  p_pct: number,
  c_pct: number,
  f_pct: number,
  bounds: TriangleBounds,
): Cartesian {
  const inner_w = bounds.width - 2 * bounds.padding;
  const inner_h = bounds.height - 2 * bounds.padding;
  const x = bounds.padding + inner_w / 2 + (f_pct - c_pct) * (inner_w / 2);
  const y = bounds.padding + inner_h * (1 - p_pct);
  return { x, y };
}

export function trianglePath(bounds: TriangleBounds): string {
  const top = ternaryToXY(1, 0, 0, bounds);
  const left = ternaryToXY(0, 1, 0, bounds);
  const right = ternaryToXY(0, 0, 1, bounds);
  return `M ${top.x},${top.y} L ${right.x},${right.y} L ${left.x},${left.y} Z`;
}

export function vertices(bounds: TriangleBounds) {
  return {
    top: ternaryToXY(1, 0, 0, bounds),
    left: ternaryToXY(0, 1, 0, bounds),
    right: ternaryToXY(0, 0, 1, bounds),
  };
}

/** Macros → calorie-share triplet (sums to 1.0). */
export function calorieShares(p: number, c: number, f: number): [number, number, number] {
  const cal_p = 4 * p;
  const cal_c = 4 * c;
  const cal_f = 9 * f;
  const total = cal_p + cal_c + cal_f;
  if (total <= 0) return [0, 0, 0];
  return [cal_p / total, cal_c / total, cal_f / total];
}
