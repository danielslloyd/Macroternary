// Ternary geometry helpers (spec §5).
//
// Vertices:
//   Top      = Protein (P)
//   Bottom-L = Carbs   (C)
//   Bottom-R = Fat     (F)
//
// Mapping for an SVG drawing area of size (width, height) with `padding`
// reserved on each side:
//   x = pad + inner_w/2 + (F% − C%) * inner_w/2
//   y = pad + inner_h * (1 − P%)

export function ternaryToXY(p_pct, c_pct, f_pct, bounds) {
  const inner_w = bounds.width - 2 * bounds.padding;
  const inner_h = bounds.height - 2 * bounds.padding;
  const x = bounds.padding + inner_w / 2 + (f_pct - c_pct) * (inner_w / 2);
  const y = bounds.padding + inner_h * (1 - p_pct);
  return { x, y };
}

export function trianglePath(bounds) {
  const top = ternaryToXY(1, 0, 0, bounds);
  const left = ternaryToXY(0, 1, 0, bounds);
  const right = ternaryToXY(0, 0, 1, bounds);
  return `M ${top.x},${top.y} L ${right.x},${right.y} L ${left.x},${left.y} Z`;
}

export function vertices(bounds) {
  return {
    top: ternaryToXY(1, 0, 0, bounds),
    left: ternaryToXY(0, 1, 0, bounds),
    right: ternaryToXY(0, 0, 1, bounds),
  };
}

// Macro grams → per-calorie shares (sums to 1.0). Used for both products and
// recipes so the plot only ever sees pre-normalized triplets.
export function calorieShares(p, c, f) {
  const cal_p = 4 * p;
  const cal_c = 4 * c;
  const cal_f = 9 * f;
  const total = cal_p + cal_c + cal_f;
  if (total <= 0) return { p_pct: 0, c_pct: 0, f_pct: 0 };
  return { p_pct: cal_p / total, c_pct: cal_c / total, f_pct: cal_f / total };
}
