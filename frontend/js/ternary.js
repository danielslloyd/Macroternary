// d3 ternary renderer. Draws into the supplied container, idempotent: call
// it again with new state and the SVG updates in place via d3 selections.
//
// All *look* is driven by the `theme` object (see theme.js); this module only
// knows geometry and how to bind data to elements. The SVG is built as a fixed
// stack of layer groups so z-order stays stable no matter when each layer's
// data changes, and so the whole thing serialises cleanly for SVG export.

import * as d3 from "d3";
import { isolines } from "./isolines.js";
import { ternaryToXY, trianglePath, vertices } from "./geometry.js";
import {
  DEFAULT_THEME,
  RETAILER_COLORS,
  FALLBACK_COLOR,
  macroColor,
} from "./theme.js";

const BOUNDS = { width: 700, height: 640, padding: 60 };

const RETAILER_SHAPE = {
  trader_joes: "circle",
  walmart: "square",
  costco: "triangle",
  csv: "circle",
};

function shapePath(retailer, size) {
  const s = RETAILER_SHAPE[retailer] || "circle";
  if (s === "square") {
    return `M ${-size},${-size} L ${size},${-size} L ${size},${size} L ${-size},${size} Z`;
  }
  if (s === "triangle") {
    return `M 0,${-size * 1.1} L ${size},${size * 0.7} L ${-size},${size * 0.7} Z`;
  }
  // circle as a path so a single <path> element covers every shape.
  return `M ${-size},0 a ${size},${size} 0 1,0 ${size * 2},0 a ${size},${size} 0 1,0 ${-size * 2},0`;
}

function pointColor(d, theme) {
  if (theme.colorMode === "retailer") {
    return RETAILER_COLORS[d.retailer] || FALLBACK_COLOR;
  }
  return macroColor(d.p_pct, d.c_pct, d.f_pct, theme);
}

// Triangular grid: lines of constant P, C and F at every `interval` step.
function gridLines(interval, bounds) {
  const out = [];
  const step = interval > 0 ? interval : 0.2;
  for (let i = 1; i * step < 1 - 1e-9; i++) {
    const k = Math.round(i * step * 1e4) / 1e4;
    if (k <= 0 || k >= 1) continue;
    const seg = (a, b, id) => ({ id, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    // constant protein (horizontal), constant carbs, constant fat
    out.push(seg(ternaryToXY(k, 1 - k, 0, bounds), ternaryToXY(k, 0, 1 - k, bounds), `P${k}`));
    out.push(seg(ternaryToXY(1 - k, k, 0, bounds), ternaryToXY(0, k, 1 - k, bounds), `C${k}`));
    out.push(seg(ternaryToXY(1 - k, 0, k, bounds), ternaryToXY(0, 1 - k, k, bounds), `F${k}`));
  }
  return out;
}

// Percentage tick labels sitting just outside each of the three edges.
function tickLabels(interval, bounds) {
  const out = [];
  const step = interval > 0 ? interval : 0.2;
  for (let i = 1; i * step < 1 - 1e-9; i++) {
    const k = Math.round(i * step * 1e4) / 1e4;
    if (k <= 0 || k >= 1) continue;
    const pct = `${Math.round(k * 100)}`;
    const lp = ternaryToXY(k, 1 - k, 0, bounds); // protein, left edge
    const rp = ternaryToXY(1 - k, 0, k, bounds); // fat, right edge
    const bp = ternaryToXY(0, k, 1 - k, bounds); // carbs, base edge
    out.push({ id: `P${k}`, x: lp.x - 7, y: lp.y + 3, anchor: "end", text: pct });
    out.push({ id: `F${k}`, x: rp.x + 7, y: rp.y + 3, anchor: "start", text: pct });
    out.push({ id: `C${k}`, x: bp.x, y: bp.y + 15, anchor: "middle", text: pct });
  }
  return out;
}

// ─── tooltip (a single reused DOM node, lives outside the SVG) ──────────
let tooltip = null;
function ensureTooltip() {
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className =
      "fixed bg-gray-900 text-white text-xs py-1 px-2 rounded pointer-events-none opacity-0 transition-opacity duration-75 z-50 shadow-lg";
    document.body.appendChild(tooltip);
  }
  return tooltip;
}
function showTooltip(text, event) {
  const t = ensureTooltip();
  t.textContent = text;
  t.classList.remove("opacity-0");
  const rect = event.target.getBoundingClientRect();
  t.style.left = rect.left + rect.width / 2 + "px";
  t.style.top = rect.top - 30 + "px";
  t.style.transform = "translateX(-50%)";
}
function hideTooltip() {
  ensureTooltip().classList.add("opacity-0");
}

export function renderTernary(opts) {
  const theme = { ...DEFAULT_THEME, ...(opts.theme || {}) };
  theme.macroColors = { ...DEFAULT_THEME.macroColors, ...(opts.theme?.macroColors || {}) };

  const {
    container,
    products,
    recipes,
    selectedFamily,
    selectedId,
    hiddenRetailers,
    onSelect,
  } = opts;

  const svg = ensureSvg(container);
  const v = vertices(BOUNDS);

  const visible = products.filter(
    (p) => !hiddenRetailers || !hiddenRetailers.has(p.retailer),
  );

  // ─── background + triangle fill ───────────────────────────────────────
  svg.select("rect.bg").attr("fill", theme.background);
  svg
    .select("path.triangle-fill")
    .attr("d", trianglePath(BOUNDS))
    .attr("fill", theme.triangleFill);

  // ─── corner tint wash ─────────────────────────────────────────────────
  svg.select("g.tints").attr("display", theme.cornerTint ? null : "none");
  const defs = svg.select("defs");
  const tintDefs = [
    ["mt-tint-p", theme.macroColors.protein],
    ["mt-tint-c", theme.macroColors.carbs],
    ["mt-tint-f", theme.macroColors.fat],
  ];
  tintDefs.forEach(([id, color]) => {
    const grad = defs.select(`#${id}`);
    grad.select("stop.inner").attr("stop-color", color).attr("stop-opacity", theme.tintStrength);
    grad.select("stop.outer").attr("stop-color", color);
  });

  // ─── triangular grid ──────────────────────────────────────────────────
  const gridGroup = svg
    .select("g.grid")
    .attr("display", theme.showGrid ? null : "none")
    .attr("opacity", theme.gridOpacity);
  gridGroup
    .selectAll("line")
    .data(theme.showGrid ? gridLines(theme.gridInterval, BOUNDS) : [], (d) => d.id)
    .join("line")
    .attr("x1", (d) => d.x1)
    .attr("y1", (d) => d.y1)
    .attr("x2", (d) => d.x2)
    .attr("y2", (d) => d.y2)
    .attr("stroke", theme.gridColor)
    .attr("stroke-width", theme.gridWidth);

  // ─── protein calorie-cost isolines ────────────────────────────────────
  const isoGroup = svg
    .select("g.isolines")
    .attr("display", theme.showIsolines ? null : "none");
  const isoSel = isoGroup
    .selectAll("g.isoline")
    .data(theme.showIsolines ? isolines(BOUNDS) : [], (d) => d.pct);
  isoSel.exit().remove();
  const isoEnter = isoSel.enter().append("g").attr("class", "isoline");
  isoEnter.append("line");
  isoEnter.append("text");
  const isoMerge = isoEnter.merge(isoSel);
  isoMerge
    .select("line")
    .attr("x1", (d) => d.left.x)
    .attr("y1", (d) => d.left.y)
    .attr("x2", (d) => d.right.x)
    .attr("y2", (d) => d.right.y)
    .attr("stroke", theme.isolineColor)
    .attr("stroke-width", theme.isolineWidth)
    .attr("stroke-dasharray", theme.isolineDash);
  isoMerge
    .select("text")
    // Nudge clear of the right-edge fat ticks so the two don't collide when
    // ticks are enabled.
    .attr("x", (d) => d.right.x + (theme.showTicks ? 30 : 8))
    .attr("y", (d) => d.right.y + 3)
    .attr("font-size", 9.5)
    .attr("font-weight", 500)
    .attr("fill", theme.isolineLabelColor)
    .text((d) => `${d.label} cal/g`);

  // ─── triangle outline (drawn over grid/isolines for a crisp edge) ─────
  svg
    .select("path.outline")
    .attr("d", trianglePath(BOUNDS))
    .attr("fill", "none")
    .attr("stroke", theme.triangleStroke)
    .attr("stroke-width", theme.triangleStrokeWidth)
    .attr("stroke-linejoin", "round");

  // ─── axis ticks ───────────────────────────────────────────────────────
  svg
    .select("g.ticks")
    .attr("display", theme.showTicks ? null : "none")
    .selectAll("text")
    .data(theme.showTicks ? tickLabels(theme.gridInterval, BOUNDS) : [], (d) => d.id)
    .join("text")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y)
    .attr("text-anchor", (d) => d.anchor)
    .attr("font-size", theme.tickFontSize)
    .attr("fill", theme.tickColor)
    .text((d) => d.text);

  // ─── selection halo (soft ring behind the active point) ───────────────
  const sel = visible.find((p) => p.id === selectedId);
  svg
    .select("g.halo")
    .selectAll("circle")
    .data(sel ? [sel] : [], (d) => d.id)
    .join("circle")
    .attr("cx", (d) => ternaryToXY(d.p_pct, d.c_pct, d.f_pct, BOUNDS).x)
    .attr("cy", (d) => ternaryToXY(d.p_pct, d.c_pct, d.f_pct, BOUNDS).y)
    .attr("r", theme.selectedPointSize + 6)
    .attr("fill", (d) => pointColor(d, theme))
    .attr("opacity", 0.22);

  // ─── product points ───────────────────────────────────────────────────
  const pointGroup = svg
    .select("g.points")
    .attr("filter", theme.pointShadow ? "url(#mt-shadow)" : null);

  const pointSel = pointGroup.selectAll("path.point").data(visible, (d) => d.id);
  pointSel.exit().remove();
  const pointEnter = pointSel
    .enter()
    .append("path")
    .attr("class", "point")
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
    })
    .on("mouseover", (event, d) => {
      const text = `${d.name} (${d.brand ?? d.retailer}) — ${Math.round(d.kcal)} kcal · ${d.p}P / ${d.c}C / ${d.f}F`;
      showTooltip(text, event);
    })
    .on("mouseout", hideTooltip);

  pointEnter
    .merge(pointSel)
    .attr("transform", (d) => {
      const xy = ternaryToXY(d.p_pct, d.c_pct, d.f_pct, BOUNDS);
      return `translate(${xy.x},${xy.y})`;
    })
    .attr("d", (d) =>
      shapePath(d.retailer, d.id === selectedId ? theme.selectedPointSize : theme.pointSize),
    )
    .attr("fill", (d) => pointColor(d, theme))
    .attr("stroke", theme.pointStroke)
    .attr("stroke-width", theme.pointStrokeWidth)
    .attr("opacity", (d) => {
      if (selectedFamily && d.family !== selectedFamily) return theme.dimmedOpacity;
      return d.id === selectedId ? 1 : theme.pointOpacity;
    });

  // ─── recipe diamonds ──────────────────────────────────────────────────
  const recipeSel = svg
    .select("g.recipes")
    .selectAll("g.recipe-marker")
    .data(recipes, (d) => d.id);
  recipeSel.exit().remove();
  const recipeEnter = recipeSel.enter().append("g").attr("class", "recipe-marker");
  recipeEnter.append("polygon");
  recipeEnter.append("text");
  recipeEnter.append("title");
  const recipeMerged = recipeEnter.merge(recipeSel);
  recipeMerged.attr("transform", (d) => {
    const xy = ternaryToXY(d.p_pct, d.c_pct, d.f_pct, BOUNDS);
    return `translate(${xy.x},${xy.y})`;
  });
  const rs = theme.recipeSize;
  recipeMerged
    .select("polygon")
    .attr("points", `0,${-rs} ${rs},0 0,${rs} ${-rs},0`)
    .attr("fill", theme.recipeColor)
    .attr("stroke", theme.recipeStroke)
    .attr("stroke-width", 1.5);
  recipeMerged
    .select("text")
    .attr("x", rs + 4)
    .attr("y", 4)
    .attr("font-size", 11)
    .attr("font-weight", 600)
    .attr("fill", "#92400e")
    .text((d) => d.title);
  recipeMerged
    .select("title")
    .text(
      (d) =>
        `${d.title} — ${Math.round(d.totals.kcal)} kcal · ` +
        `${Math.round(d.totals.p)}P / ${Math.round(d.totals.c)}C / ${Math.round(d.totals.f)}F`,
    );

  // ─── vertex labels ────────────────────────────────────────────────────
  const labels = [
    { key: "P", x: v.top.x, y: v.top.y - 16, anchor: "middle", text: "Protein", color: theme.macroColors.protein },
    { key: "C", x: v.left.x - 10, y: v.left.y + 20, anchor: "end", text: "Carbs", color: theme.macroColors.carbs },
    { key: "F", x: v.right.x + 10, y: v.right.y + 20, anchor: "start", text: "Fat", color: theme.macroColors.fat },
  ];
  svg
    .select("g.vlabels")
    .selectAll("text.vertex")
    .data(labels, (d) => d.key)
    .join("text")
    .attr("class", "vertex")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y)
    .attr("text-anchor", (d) => d.anchor)
    .attr("font-size", theme.vertexFontSize)
    .attr("font-weight", 700)
    .attr("fill", (d) => d.color)
    .text((d) => d.text);

  // ─── legend ───────────────────────────────────────────────────────────
  renderLegend(svg.select("g.legend"), theme, visible);

  // Click on empty space deselects.
  svg.on("click", (event) => {
    const t = event.target;
    if (
      t.tagName === "svg" ||
      t.classList.contains("bg") ||
      t.classList.contains("triangle-fill") ||
      t.classList.contains("outline")
    ) {
      onSelect(null);
    }
  });
}

function renderLegend(group, theme, visible) {
  group.selectAll("*").remove();
  if (!theme.showLegend) {
    group.attr("display", "none");
    return;
  }
  group.attr("display", null);

  let items;
  if (theme.colorMode === "retailer") {
    const seen = [...new Set(visible.map((p) => p.retailer))];
    items = seen.map((r) => ({
      color: RETAILER_COLORS[r] || FALLBACK_COLOR,
      shape: r,
      label: r.replace(/_/g, " "),
    }));
  } else {
    items = [
      { color: theme.macroColors.protein, shape: "circle", label: "Protein-rich" },
      { color: theme.macroColors.carbs, shape: "circle", label: "Carb-rich" },
      { color: theme.macroColors.fat, shape: "circle", label: "Fat-rich" },
    ];
  }
  if (!items.length) return;

  const rowH = 17;
  const padX = 10;
  const padY = 8;
  const boxW = 132;
  const boxH = padY * 2 + items.length * rowH;

  group.attr("transform", `translate(14,14)`);
  group
    .append("rect")
    .attr("width", boxW)
    .attr("height", boxH)
    .attr("rx", 7)
    .attr("fill", "#ffffff")
    .attr("fill-opacity", 0.82)
    .attr("stroke", "#e2e8f0")
    .attr("stroke-width", 1);

  const rows = group
    .selectAll("g.legend-row")
    .data(items)
    .join("g")
    .attr("class", "legend-row")
    .attr("transform", (_d, i) => `translate(${padX},${padY + i * rowH + rowH / 2})`);
  rows
    .append("path")
    .attr("d", (d) => shapePath(d.shape, 5))
    .attr("transform", "translate(5,0)")
    .attr("fill", (d) => d.color)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1);
  rows
    .append("text")
    .attr("x", 18)
    .attr("y", 3.5)
    .attr("font-size", 10.5)
    .attr("fill", "#334155")
    .text((d) => d.label);
}

// Build the SVG skeleton exactly once: <defs> plus an ordered stack of layer
// groups. Later renders only ever populate these, so z-order never shifts.
function ensureSvg(container) {
  let svg = d3.select(container).select("svg.mt-chart");
  if (!svg.empty()) return svg;

  svg = d3
    .select(container)
    .append("svg")
    .attr("class", "mt-chart")
    .attr("xmlns", "http://www.w3.org/2000/svg")
    .attr("viewBox", `0 0 ${BOUNDS.width} ${BOUNDS.height}`)
    .attr("font-family", DEFAULT_THEME.fontFamily)
    .attr("role", "img")
    .attr("aria-label", "Per-calorie macronutrient ternary plot");

  const defs = svg.append("defs");

  // soft drop shadow for the point cloud
  const shadow = defs
    .append("filter")
    .attr("id", "mt-shadow")
    .attr("x", "-20%")
    .attr("y", "-20%")
    .attr("width", "140%")
    .attr("height", "140%");
  shadow
    .append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 0.8)
    .attr("stdDeviation", 1.1)
    .attr("flood-color", "#0f172a")
    .attr("flood-opacity", 0.35);

  // clip the corner tints to the triangle interior
  defs
    .append("clipPath")
    .attr("id", "mt-clip")
    .append("path")
    .attr("d", trianglePath(BOUNDS));

  // one radial gradient per corner, centred on its vertex
  const v = vertices(BOUNDS);
  const inner = BOUNDS.height - 2 * BOUNDS.padding;
  const tintSpecs = [
    ["mt-tint-p", v.top],
    ["mt-tint-c", v.left],
    ["mt-tint-f", v.right],
  ];
  tintSpecs.forEach(([id, c]) => {
    const grad = defs
      .append("radialGradient")
      .attr("id", id)
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("cx", c.x)
      .attr("cy", c.y)
      .attr("r", inner * 0.95);
    grad.append("stop").attr("class", "inner").attr("offset", "0%");
    grad.append("stop").attr("class", "outer").attr("offset", "78%").attr("stop-opacity", 0);
  });

  // fixed layer stack (bottom → top)
  svg.append("rect").attr("class", "layer bg").attr("x", 0).attr("y", 0)
    .attr("width", BOUNDS.width).attr("height", BOUNDS.height);
  svg.append("path").attr("class", "layer triangle-fill");
  svg.append("g").attr("class", "layer tints").attr("clip-path", "url(#mt-clip)");
  // three full-canvas rects painted with the corner gradients (clipped above)
  ["mt-tint-p", "mt-tint-c", "mt-tint-f"].forEach((id) => {
    svg.select("g.tints").append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", BOUNDS.width).attr("height", BOUNDS.height)
      .attr("fill", `url(#${id})`);
  });
  svg.append("g").attr("class", "layer grid");
  svg.append("g").attr("class", "layer isolines");
  svg.append("path").attr("class", "layer outline");
  svg.append("g").attr("class", "layer ticks");
  svg.append("g").attr("class", "layer halo");
  svg.append("g").attr("class", "layer points");
  svg.append("g").attr("class", "layer recipes");
  svg.append("g").attr("class", "layer vlabels");
  svg.append("g").attr("class", "layer legend");

  return svg;
}
