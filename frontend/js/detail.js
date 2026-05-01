// Right-hand detail panel: either the selected product, or the active
// recipe list, or a placeholder.

export function renderDetail({ container, product, recipes, onRemoveRecipe }) {
  if (product) {
    container.innerHTML = renderProduct(product);
    return;
  }
  if (recipes.length) {
    container.innerHTML = renderRecipes(recipes);
    container.querySelectorAll("[data-remove-recipe]").forEach((btn) => {
      btn.addEventListener("click", () =>
        onRemoveRecipe(btn.dataset.removeRecipe),
      );
    });
    return;
  }
  container.innerHTML = `
    <div class="p-4 text-sm text-gray-500">
      Click a point on the plot, or click <strong>+ Recipe</strong> in the header.
    </div>
  `;
}

function renderProduct(p) {
  const calPerGProtein =
    p.p_pct > 0 ? (4 / p.p_pct).toFixed(1) : "—";
  const labelPct = (n) => `${Math.round(n * 100)}%`;
  return `
    <div class="p-4 space-y-2">
      <h2 class="text-base font-semibold">${escapeHtml(p.name)}</h2>
      <p class="text-xs text-gray-500">
        ${escapeHtml(p.brand || "")} · ${escapeHtml(p.retailer)}
      </p>
      <dl class="text-sm grid grid-cols-2 gap-y-1 mt-3">
        <dt class="text-gray-500">Serving</dt>
        <dd>${escapeHtml(p.serving_label || `${p.serving_g} g`)}</dd>
        <dt class="text-gray-500">Calories</dt>
        <dd>${p.kcal}</dd>
        <dt class="text-gray-500">Protein</dt>
        <dd>${p.p} g (${labelPct(p.p_pct)})</dd>
        <dt class="text-gray-500">Carbs</dt>
        <dd>${p.c} g (${labelPct(p.c_pct)})</dd>
        <dt class="text-gray-500">Fat</dt>
        <dd>${p.f} g (${labelPct(p.f_pct)})</dd>
        <dt class="text-gray-500">cal/g protein</dt>
        <dd>${calPerGProtein}</dd>
      </dl>
      <a href="${escapeHtml(p.url)}" target="_blank" rel="nofollow noopener noreferrer"
         class="inline-block mt-3 text-sm text-blue-700 underline">
        View at ${escapeHtml(p.retailer)}
      </a>
    </div>
  `;
}

function renderRecipes(recipes) {
  return `
    <div class="p-4 space-y-3">
      <h2 class="text-base font-semibold">Recipes</h2>
      ${recipes
        .map(
          (r) => `
        <div class="border border-gray-200 rounded p-3 space-y-2">
          <div class="flex justify-between items-baseline gap-2">
            <strong>${escapeHtml(r.title)}</strong>
            <span class="${badgeClass(
              r.confidence,
            )} text-xs px-1.5 py-0.5 rounded uppercase tracking-wide">
              ${escapeHtml(r.confidence)}
            </span>
          </div>
          <p class="text-xs text-gray-600">
            ${Math.round(r.totals.kcal)} kcal · ${Math.round(r.totals.p)}P /
            ${Math.round(r.totals.c)}C / ${Math.round(r.totals.f)}F
          </p>
          ${
            r.assumptions?.length
              ? `<p class="text-xs italic text-amber-900"><strong>Assumptions:</strong>
                 ${escapeHtml(r.assumptions.join("; "))}</p>`
              : ""
          }
          ${
            r.items?.length
              ? `<details class="text-xs">
                  <summary class="cursor-pointer text-gray-600">Ingredients</summary>
                  <ul class="mt-1 ml-4 list-disc space-y-0.5">
                    ${r.items
                      .map(
                        (it) => `
                      <li>${escapeHtml(it.ingredient)}${
                          it.quantity_g ? ` (${it.quantity_g} g)` : ""
                        } · ${Math.round(it.kcal)} kcal</li>`,
                      )
                      .join("")}
                  </ul>
                </details>`
              : ""
          }
          <button data-remove-recipe="${escapeHtml(r.id)}" type="button"
                  class="text-xs px-2 py-1 border border-gray-300 rounded text-red-700">
            Remove
          </button>
        </div>`,
        )
        .join("")}
    </div>
  `;
}

function badgeClass(confidence) {
  switch (confidence) {
    case "high":
      return "bg-emerald-100 text-emerald-800";
    case "low":
      return "bg-amber-100 text-amber-800";
    case "manual":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}
