// Entry point. Holds top-level state and re-renders the three panels +
// status bar on change. No framework — just plain functions over a state
// object.

import { loadSnapshot } from "./data.js";
import { renderTernary } from "./ternary.js";
import { renderSidebar } from "./filters.js";
import { renderDetail } from "./detail.js";
import {
  openRecipeModal,
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

document.getElementById("recipe-btn").addEventListener("click", () => {
  openRecipeModal({
    onAdd: (recipe) => {
      // Spec §9: cap of 5 active recipes.
      const next = [...state.recipes, recipe].slice(-5);
      setState({ recipes: next });
    },
  });
});

// Initial load.
async function start() {
  state.recipes = readRecipesFromHash();
  try {
    const snapshot = await loadSnapshot();
    state.meta = snapshot.meta;
    state.products = snapshot.products;
    state.families = snapshot.families;
    state.filters.retailers = new Set(snapshot.meta.retailers);
    render();
  } catch (e) {
    showBanner(e.message);
    console.error(e);
  }
}

start();
