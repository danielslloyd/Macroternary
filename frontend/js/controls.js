// Live "Style" panel: a schema-driven set of inputs bound to the theme, plus
// the export buttons. Mutating a control updates the theme in place and calls
// onChange, which re-renders just the plot (see main.js).

import { resetTheme } from "./theme.js";

// Control schema. `key` may be dotted ("macroColors.protein"). Section rows
// (only a `section`) render a subheading.
const SCHEMA = [
  { section: "Points" },
  {
    key: "colorMode",
    label: "Colour by",
    type: "select",
    options: [
      ["macro", "Macro blend"],
      ["retailer", "Retailer"],
    ],
  },
  { key: "pointSize", label: "Point size", type: "range", min: 2, max: 10, step: 0.5 },
  { key: "pointOpacity", label: "Opacity", type: "range", min: 0.2, max: 1, step: 0.05 },
  { key: "pointShadow", label: "Drop shadow", type: "checkbox" },

  { section: "Grid & guides" },
  { key: "showGrid", label: "Triangular grid", type: "checkbox" },
  {
    key: "gridInterval",
    label: "Grid step",
    type: "select",
    numeric: true,
    options: [
      [0.1, "10%"],
      [0.2, "20%"],
      [0.25, "25%"],
    ],
  },
  { key: "gridOpacity", label: "Grid opacity", type: "range", min: 0, max: 1, step: 0.05 },
  { key: "showIsolines", label: "Protein isolines", type: "checkbox" },
  { key: "showTicks", label: "Axis ticks", type: "checkbox" },

  { section: "Style" },
  { key: "cornerTint", label: "Corner tint", type: "checkbox" },
  { key: "tintStrength", label: "Tint strength", type: "range", min: 0, max: 0.4, step: 0.02 },
  { key: "showLegend", label: "Legend", type: "checkbox" },
  { key: "background", label: "Background", type: "color" },
  { key: "triangleFill", label: "Triangle fill", type: "color" },

  { section: "Macro colours" },
  { key: "macroColors.protein", label: "Protein", type: "color" },
  { key: "macroColors.carbs", label: "Carbs", type: "color" },
  { key: "macroColors.fat", label: "Fat", type: "color" },
];

function getVal(theme, key) {
  return key.includes(".")
    ? key.split(".").reduce((o, k) => (o == null ? o : o[k]), theme)
    : theme[key];
}
function setVal(theme, key, value) {
  if (!key.includes(".")) {
    theme[key] = value;
    return;
  }
  const [a, b] = key.split(".");
  theme[a] = { ...theme[a], [b]: value };
}

function coerce(ctrl, raw) {
  if (ctrl.type === "checkbox") return raw;
  if (ctrl.type === "range") return parseFloat(raw);
  if (ctrl.type === "select" && ctrl.numeric) return parseFloat(raw);
  return raw;
}

function controlRow(ctrl, theme) {
  const val = getVal(theme, ctrl.key);
  const id = `ctl-${ctrl.key.replace(/\./g, "-")}`;

  if (ctrl.type === "checkbox") {
    return `
      <label class="mt-ctl-row" for="${id}">
        <span>${ctrl.label}</span>
        <input type="checkbox" id="${id}" data-key="${ctrl.key}" data-type="checkbox"
               ${val ? "checked" : ""} />
      </label>`;
  }
  if (ctrl.type === "color") {
    return `
      <label class="mt-ctl-row" for="${id}">
        <span>${ctrl.label}</span>
        <input type="color" id="${id}" data-key="${ctrl.key}" data-type="color"
               value="${val}" />
      </label>`;
  }
  if (ctrl.type === "select") {
    const opts = ctrl.options
      .map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? "selected" : ""}>${l}</option>`)
      .join("");
    return `
      <label class="mt-ctl-row" for="${id}">
        <span>${ctrl.label}</span>
        <select id="${id}" data-key="${ctrl.key}" data-type="select"
                data-numeric="${ctrl.numeric ? 1 : 0}"
                class="mt-ctl-select">${opts}</select>
      </label>`;
  }
  // range
  return `
    <label class="mt-ctl-row" for="${id}">
      <span>${ctrl.label} <em data-out="${ctrl.key}">${val}</em></span>
      <input type="range" id="${id}" data-key="${ctrl.key}" data-type="range"
             min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${val}" />
    </label>`;
}

export function renderControls({ container, theme, onChange, onExportSVG, onExportPNG, onReset }) {
  const body = SCHEMA.map((c) =>
    c.section
      ? `<h4 class="mt-ctl-section">${c.section}</h4>`
      : controlRow(c, theme),
  ).join("");

  container.innerHTML = `
    <details class="mt-panel" open>
      <summary class="mt-panel-summary">
        <span>⚙ Style &amp; export</span>
      </summary>
      <div class="mt-panel-body">
        ${body}
        <div class="mt-ctl-buttons">
          <button type="button" data-act="reset" class="mt-btn">Reset</button>
          <button type="button" data-act="svg" class="mt-btn mt-btn-primary">Export SVG</button>
          <button type="button" data-act="png" class="mt-btn">Export PNG</button>
        </div>
      </div>
    </details>
  `;

  // Wire every input generically.
  container.querySelectorAll("[data-key]").forEach((input) => {
    const evt = input.dataset.type === "range" || input.dataset.type === "color" ? "input" : "change";
    input.addEventListener(evt, () => {
      const type = input.dataset.type;
      const raw = type === "checkbox" ? input.checked : input.value;
      const ctrl = { type, numeric: input.dataset.numeric === "1" };
      setVal(theme, input.dataset.key, coerce(ctrl, raw));
      if (type === "range") {
        const out = container.querySelector(`[data-out="${input.dataset.key}"]`);
        if (out) out.textContent = input.value;
      }
      onChange(theme);
    });
  });

  container.querySelector('[data-act="reset"]').addEventListener("click", () => {
    const fresh = resetTheme();
    onReset(fresh);
  });
  container.querySelector('[data-act="svg"]').addEventListener("click", onExportSVG);
  container.querySelector('[data-act="png"]').addEventListener("click", onExportPNG);
}
