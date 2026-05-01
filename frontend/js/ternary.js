// d3 ternary renderer. Draws into the supplied container, idempotent: call
// it again with new state and the SVG updates in place via d3 selections.

import * as d3 from "d3";
import { isolines } from "./isolines.js";
import {
  ternaryToXY,
  trianglePath,
  vertices,
} from "./geometry.js";

const RETAILER_COLORS = {
  trader_joes: "#dc2626",
  walmart: "#1d4ed8",
  costco: "#0d9488",
};
const FALLBACK_COLOR = "#6b7280";

const RETAILER_SHAPE = {
  trader_joes: "circle",
  walmart: "square",
  costco: "triangle",
};

function colorFor(retailer) {
  return RETAILER_COLORS[retailer] || FALLBACK_COLOR;
}

function shapePath(retailer, size) {
  const s = RETAILER_SHAPE[retailer] || "circle";
  if (s === "square") {
    return `M ${-size},${-size} L ${size},${-size} L ${size},${size} L ${-size},${size} Z`;
  }
  if (s === "triangle") {
    return `M 0,${-size * 1.1} L ${size},${size * 0.7} L ${-size},${size * 0.7} Z`;
  }
  // circle as a path so we can use the same <path> element for everything.
  return `M ${-size},0 a ${size},${size} 0 1,0 ${size * 2},0 a ${size},${size} 0 1,0 ${-size * 2},0`;
}

const BOUNDS = { width: 700, height: 620, padding: 48 };

export function renderTernary({
  container,
  products,
  recipes,
  selectedFamily,
  selectedId,
  hiddenRetailers,
  onSelect,
}) {
  const svg = ensureSvg(container);

  // Visible products (after retailer filter).
  const visible = products.filter(
    (p) => !hiddenRetailers || !hiddenRetailers.has(p.retailer),
  );

  // ─── isolines ────────────────────────────────────────────────────────
  const lineGroup = svg
    .selectAll("g.isoline-group")
    .data([null])
    .join("g")
    .attr("class", "isoline-group")
    .attr("opacity", 0.7);

  const lines = isolines(BOUNDS);
  const lineSel = lineGroup.selectAll("g.isoline").data(lines, (d) => d.pct);

  const lineEnter = lineSel
    .enter()
    .append("g")
    .attr("class", "isoline");
  lineEnter
    .append("line")
    .attr("stroke", "#9ca3af")
    .attr("stroke-width", 0.75)
    .attr("stroke-dasharray", "3 3");
  lineEnter
    .append("text")
    .attr("font-size", 10)
    .attr("fill", "#374151")
    .attr("font-weight", 500);

  const lineMerge = lineEnter.merge(lineSel);
  lineMerge
    .select("line")
    .attr("x1", (d) => d.left.x)
    .attr("y1", (d) => d.left.y)
    .attr("x2", (d) => d.right.x)
    .attr("y2", (d) => d.right.y);
  lineMerge
    .select("text")
    .attr("x", (d) => d.right.x + 6)
    .attr("y", (d) => d.right.y + 3)
    .text((d) => `${d.label} cal/g protein`);

  // ─── triangle outline + vertex labels ────────────────────────────────
  svg
    .selectAll("path.triangle")
    .data([null])
    .join("path")
    .attr("class", "triangle")
    .attr("d", trianglePath(BOUNDS))
    .attr("fill", "white")
    .attr("stroke", "#1a1a1a")
    .attr("stroke-width", 1.5);

  const v = vertices(BOUNDS);
  const labels = [
    { key: "P", x: v.top.x, y: v.top.y - 14, anchor: "middle", text: "Protein" },
    { key: "C", x: v.left.x - 8, y: v.left.y + 18, anchor: "end", text: "Carbs" },
    { key: "F", x: v.right.x + 8, y: v.right.y + 18, anchor: "start", text: "Fat" },
  ];
  svg
    .selectAll("text.vertex")
    .data(labels, (d) => d.key)
    .join("text")
    .attr("class", "vertex")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y)
    .attr("text-anchor", (d) => d.anchor)
    .attr("font-size", 13)
    .attr("font-weight", 600)
    .text((d) => d.text);

  // ─── product points ──────────────────────────────────────────────────
  const pointGroup = svg
    .selectAll("g.points")
    .data([null])
    .join("g")
    .attr("class", "points");

  const pointSel = pointGroup
    .selectAll("path.point")
    .data(visible, (d) => d.id);

  const pointEnter = pointSel
    .enter()
    .append("path")
    .attr("class", "point")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .attr("tabindex", 0)
    .on("click", (event, d) => {
      event.stopPropagation();
      onSelect(d.id);
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(d.id);
      }
    });
  pointEnter.append("title");

  pointSel.exit().remove();

  const merged = pointEnter.merge(pointSel);
  merged
    .attr("transform", (d) => {
      const xy = ternaryToXY(d.p_pct, d.c_pct, d.f_pct, BOUNDS);
      return `translate(${xy.x},${xy.y})`;
    })
    .attr("d", (d) => {
      const isSel = d.id === selectedId;
      return shapePath(d.retailer, isSel ? 7 : 4.5);
    })
    .attr("fill", (d) => colorFor(d.retailer))
    .attr("opacity", (d) => {
      if (selectedFamily && d.family !== selectedFamily) return 0.15;
      return d.id === selectedId ? 1 : 0.85;
    });

  merged
    .select("title")
    .text(
      (d) =>
        `${d.name} (${d.brand ?? d.retailer}) — ${Math.round(d.kcal)} kcal · ${d.p}P / ${d.c}C / ${d.f}F`,
    );

  // ─── recipe diamonds ─────────────────────────────────────────────────
  const recipeGroup = svg
    .selectAll("g.recipes")
    .data([null])
    .join("g")
    .attr("class", "recipes");

  const recipeSel = recipeGroup
    .selectAll("g.recipe-marker")
    .data(recipes, (d) => d.id);

  const recipeEnter = recipeSel
    .enter()
    .append("g")
    .attr("class", "recipe-marker");
  recipeEnter
    .append("polygon")
    .attr("fill", "#f59e0b")
    .attr("stroke", "white")
    .attr("stroke-width", 1.5);
  recipeEnter
    .append("text")
    .attr("font-size", 11)
    .attr("font-weight", 600)
    .attr("fill", "#92400e");
  recipeEnter.append("title");

  recipeSel.exit().remove();

  const recipeMerged = recipeEnter.merge(recipeSel);
  recipeMerged.attr("transform", (d) => {
    const xy = ternaryToXY(d.p_pct, d.c_pct, d.f_pct, BOUNDS);
    return `translate(${xy.x},${xy.y})`;
  });
  const s = 8;
  const diamond = `0,${-s} ${s},0 0,${s} ${-s},0`;
  recipeMerged.select("polygon").attr("points", diamond);
  recipeMerged
    .select("text")
    .attr("x", s + 4)
    .attr("y", 4)
    .text((d) => d.title);
  recipeMerged
    .select("title")
    .text(
      (d) =>
        `${d.title} — ${Math.round(d.totals.kcal)} kcal · ` +
        `${Math.round(d.totals.p)}P / ${Math.round(d.totals.c)}C / ${Math.round(d.totals.f)}F`,
    );

  // Click on empty space deselects.
  svg.on("click", (event) => {
    if (event.target.tagName === "svg" || event.target.classList.contains("triangle")) {
      onSelect(null);
    }
  });
}

function ensureSvg(container) {
  let svg = d3.select(container).select("svg");
  if (svg.empty()) {
    svg = d3
      .select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${BOUNDS.width} ${BOUNDS.height}`)
      .attr("role", "img")
      .attr("aria-label", "Per-calorie macro ternary plot");
  }
  return svg;
}
