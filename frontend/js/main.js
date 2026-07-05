// Entry point. Holds top-level state and re-renders the three panels +
// status bar on change. No framework — just plain functions over a state
// object.

import { loadSnapshot, loadCSV } from "./data.js";
import { renderTernary } from "./ternary.js";
import { renderSidebar } from "./filters.js";
import { renderDetail } from "./detail.js";
import { renderControls } from "./controls.js";
import { loadTheme, saveTheme } from "./theme.js";
import { exportSVG, exportPNG } from "./export.js";
import {
  openManualModal,
  openAIModal,
  readRecipesFromHash,
  writeRecipesToHash,
} from "./recipe.js";

const state = {
  meta: null,
  products: [],
  families: [],
  filters: {
    retailers: new Set(),
    family: null,
    query: "",
  },
  selectedId: null,
  recipes: [],
  theme: loadTheme(),
};

function setState(partial) {
  Object.assign(state, partial);
  render();
}

function setFilters(next) {
  state.filters = next;
  render();
}

function getFilteredProducts() {
  const q = state.filters.query.trim().toLowerCase();
  return state.products.filter((p) => {
    if (
      state.filters.retailers.size &&
      !state.filters.retailers.has(p.retailer)
    ) {
      return false;
    }
    if (q) {
      const hay = `${p.name} ${p.brand || ""} ${p.family || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function render() {
  const headerSummary = document.getElementById("meta-summary");
  if (state.meta) {
    headerSummary.textContent = `v${state.meta.version} · ${state.meta.count} products`;
  }

  const filtered = getFilteredProducts();

  renderSidebar({
    container: document.getElementById("sidebar"),
    products: state.products,
    families: state.families,
    retailers: state.meta ? state.meta.retailers : [],
    filters: state.filters,
    onChange: setFilters,
  });

  renderTernary({
    container: document.getElementById("ternary-mount"),
    products: filtered,
    recipes: state.recipes,
    selectedFamily: state.filters.family,
    selectedId: state.selectedId,
    hiddenRetailers: null, // retailer filter already applied above
    theme: state.theme,
    onSelect: (id) => setState({ selectedId: id }),
  });

  const selectedProduct =
    state.products.find((p) => p.id === state.selectedId) || null;

  renderDetail({
    container: document.getElementById("detail"),
    product: selectedProduct,
    recipes: state.recipes,
    onRemoveRecipe: (id) =>
      setState({ recipes: state.recipes.filter((r) => r.id !== id) }),
  });

  writeRecipesToHash(state.recipes);
}

function showBanner(message, kind = "error") {
  const el = document.getElementById("status-banner");
  if (!message) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.className =
    "px-6 py-2 text-sm " +
    (kind === "error"
      ? "bg-red-50 text-red-800 border-b border-red-200"
      : "bg-amber-50 text-amber-800 border-b border-amber-200");
  el.textContent = message;
  el.classList.remove("hidden");
}

function addRecipe(recipe) {
  // Spec §9: cap of 5 active recipes.
  const next = [...state.recipes, recipe].slice(-5);
  setState({ recipes: next });
}

// The Style panel tunes visual params without changing app state, so it
// re-renders only the plot (keeps slider focus/drag intact) rather than the
// whole app. Full render() also passes state.theme, so both stay consistent.
function rerenderPlot() {
  const filtered = getFilteredProducts();
  renderTernary({
    container: document.getElementById("ternary-mount"),
    products: filtered,
    recipes: state.recipes,
    selectedFamily: state.filters.family,
    selectedId: state.selectedId,
    hiddenRetailers: null,
    theme: state.theme,
    onSelect: (id) => setState({ selectedId: id }),
  });
}

function mountControls() {
  const container = document.getElementById("controls-mount");
  if (!container) return;
  renderControls({
    container,
    theme: state.theme,
    onChange: (theme) => {
      state.theme = theme;
      saveTheme(theme);
      rerenderPlot();
    },
    onReset: (freshTheme) => {
      state.theme = freshTheme;
      mountControls(); // rebuild inputs to reflect defaults
      rerenderPlot();
    },
    onExportSVG: () => exportSVG(document.getElementById("ternary-mount")),
    onExportPNG: () => exportPNG(document.getElementById("ternary-mount")),
  });
}

document
  .getElementById("manual-btn")
  .addEventListener("click", () => openManualModal({ onAdd: addRecipe }));
document
  .getElementById("ai-btn")
  .addEventListener("click", () => openAIModal({ onAdd: addRecipe }));

// Initial load.
async function start() {
  state.recipes = readRecipesFromHash();
  try {
    const snapshot = await loadCSV();
    state.meta = snapshot.meta;
    state.products = snapshot.products;
    state.families = snapshot.families;
    state.filters.retailers = new Set(snapshot.meta.retailers);
    render();
    mountControls();

    // Fetch and display backend version
    try {
      const versionRes = await fetch("/api/version", { cache: "no-cache" });
      if (versionRes.ok) {
        const versionData = await versionRes.json();
        const footerEl = document.getElementById("footer-text");
        if (footerEl) {
          const currentText = footerEl.textContent;
          footerEl.textContent = `Backend v${versionData.version} · ${currentText}`;
        }
      }
    } catch (e) {
      console.debug("Could not fetch backend version:", e.message);
    }
  } catch (e) {
    showBanner(e.message);
    console.error(e);
  }
}

start();
