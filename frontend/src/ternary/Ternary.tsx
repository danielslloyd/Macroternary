import { useMemo, useRef } from "react";
import { isolines } from "./isolines";
import {
  ternaryToXY,
  trianglePath,
  vertices,
  type TriangleBounds,
} from "./geometry";
import type { PublicProduct, RecipePoint } from "../types";

export type TernaryProps = {
  width?: number;
  height?: number;
  products: PublicProduct[];
  recipes?: RecipePoint[];
  selectedFamily?: string | null;
  selectedProductId?: string | null;
  hiddenRetailers?: Set<string>;
  onSelect?: (id: string | null) => void;
  retailerColors?: Record<string, string>;
};

const DEFAULT_COLORS: Record<string, string> = {
  trader_joes: "#dc2626",
  walmart: "#1d4ed8",
  costco: "#0d9488",
};

const FALLBACK = "#6b7280";

const RETAILER_SHAPE: Record<string, string> = {
  trader_joes: "circle",
  walmart: "square",
  costco: "triangle",
};

function shape(retailer: string, x: number, y: number, size: number, fill: string, opacity: number, stroke = "#fff") {
  const s = RETAILER_SHAPE[retailer] ?? "circle";
  if (s === "square") {
    return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={fill} stroke={stroke} strokeWidth={1} opacity={opacity} />;
  }
  if (s === "triangle") {
    const points = `${x},${y - size * 1.1} ${x - size},${y + size * 0.7} ${x + size},${y + size * 0.7}`;
    return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={1} opacity={opacity} />;
  }
  return <circle cx={x} cy={y} r={size} fill={fill} stroke={stroke} strokeWidth={1} opacity={opacity} />;
}

export function Ternary({
  width = 700,
  height = 620,
  products,
  recipes = [],
  selectedFamily = null,
  selectedProductId = null,
  hiddenRetailers,
  onSelect,
  retailerColors = DEFAULT_COLORS,
}: TernaryProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bounds: TriangleBounds = useMemo(
    () => ({ width, height, padding: 40 }),
    [width, height],
  );

  const lines = useMemo(() => isolines(bounds), [bounds]);
  const path = useMemo(() => trianglePath(bounds), [bounds]);
  const v = useMemo(() => vertices(bounds), [bounds]);

  const visible = useMemo(
    () =>
      products.filter((p) => !hiddenRetailers || !hiddenRetailers.has(p.retailer)),
    [products, hiddenRetailers],
  );

  const points = useMemo(
    () =>
      visible.map((p) => {
        const xy = ternaryToXY(p.p_pct, p.c_pct, p.f_pct, bounds);
        return { p, x: xy.x, y: xy.y };
      }),
    [visible, bounds],
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="Per-calorie macro ternary plot"
      onClick={(e) => {
        if (e.target === svgRef.current) onSelect?.(null);
      }}
    >
      {/* Triangle outline */}
      <path d={path} fill="#ffffff" stroke="#1a1a1a" strokeWidth={1.5} />

      {/* Isolines */}
      <g opacity={0.6}>
        {lines.map((line) => (
          <g key={line.pct}>
            <line
              x1={line.left.x}
              y1={line.left.y}
              x2={line.right.x}
              y2={line.right.y}
              stroke="#9ca3af"
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />
            <text
              x={line.right.x + 6}
              y={line.right.y + 3}
              fontSize={10}
              fill="#374151"
              fontWeight={500}
            >
              {line.label} cal/g protein
            </text>
          </g>
        ))}
      </g>

      {/* Vertex labels */}
      <text x={v.top.x} y={v.top.y - 12} textAnchor="middle" fontSize={13} fontWeight={600} fill="#111">
        Protein
      </text>
      <text x={v.left.x - 8} y={v.left.y + 16} textAnchor="end" fontSize={13} fontWeight={600} fill="#111">
        Carbs
      </text>
      <text x={v.right.x + 8} y={v.right.y + 16} textAnchor="start" fontSize={13} fontWeight={600} fill="#111">
        Fat
      </text>

      {/* Product points */}
      <g>
        {points.map(({ p, x, y }) => {
          const dimmed = selectedFamily && p.family !== selectedFamily;
          const opacity = dimmed ? 0.15 : 0.85;
          const fill = retailerColors[p.retailer] ?? FALLBACK;
          const isSelected = p.id === selectedProductId;
          const size = isSelected ? 7 : 4.5;
          return (
            <g
              key={p.id}
              tabIndex={0}
              role="button"
              aria-label={`${p.name} (${p.retailer})`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(p.id);
              }}
              style={{ cursor: "pointer" }}
            >
              {shape(p.retailer, x, y, size, fill, opacity)}
            </g>
          );
        })}
      </g>

      {/* Recipe diamonds */}
      <g>
        {recipes.map((r) => {
          const xy = ternaryToXY(r.p_pct, r.c_pct, r.f_pct, bounds);
          const s = 8;
          const points = `${xy.x},${xy.y - s} ${xy.x + s},${xy.y} ${xy.x},${xy.y + s} ${xy.x - s},${xy.y}`;
          return (
            <g key={r.id}>
              <polygon
                points={points}
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              <text
                x={xy.x + s + 4}
                y={xy.y + 4}
                fontSize={11}
                fontWeight={600}
                fill="#92400e"
              >
                {r.title}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
