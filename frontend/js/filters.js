// Sidebar: search, retailer toggles, food-family dropdown.
// Renders into a container element; calls onChange(nextFilters) on edits.

export function renderSidebar({
  container,
  products,
  families,
  retailers,
  filters,
  onChange,
}) {
  const familyCounts = new Map();
  for (const p of products) {
    if (!p.family) continue;
    familyCounts.set(p.family, (familyCounts.get(p.family) || 0) + 1);
  }

  // Hide families that no product currently uses (unless that family is the
  // active selection, in which case keep it visible so the user can clear).
  const visibleFamilies = families.filter(
    (f) => familyCounts.get(f.slug) || filters.family === f.slug,
  );

  container.innerHTML = `
    <div>
      <label class="block text-xs uppercase tracking-wide text-gray-500 mb-1" for="filter-search">
        Search
      </label>
      <input id="filter-search" type="text" value="${escapeHtml(filters.query)}"
             placeholder="oats, chicken…"
             class="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
    </div>

    <div>
      <h3 class="text-xs uppercase tracking-wide text-gray-500 mb-2">Retailer</h3>
      <ul class="space-y-1" id="filter-retailers">
        ${retailers
          .map(
            (r) => `
          <li>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" data-retailer="${escapeHtml(r)}"
                     ${filters.retailers.has(r) ? "checked" : ""} />
              <span class="capitalize">${escapeHtml(r.replace(/_/g, " "))}</span>
            </label>
          </li>`,
          )
          .join("")}
      </ul>
    </div>

    <div>
      <h3 class="text-xs uppercase tracking-wide text-gray-500 mb-2">Food family</h3>
      <select id="filter-family" class="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white">
        <option value="">— all —</option>
        ${visibleFamilies
          .map((f) => {
            const count = familyCounts.get(f.slug) || 0;
            const sel = filters.family === f.slug ? "selected" : "";
            return `<option value="${escapeHtml(f.slug)}" ${sel}>${escapeHtml(f.name)} (${count})</option>`;
          })
          .join("")}
      </select>
    </div>
  `;

  container.querySelector("#filter-search").addEventListener("input", (e) => {
    onChange({ ...filters, query: e.target.value });
  });

  container
    .querySelectorAll("#filter-retailers input[data-retailer]")
    .forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const next = new Set(filters.retailers);
        if (e.target.checked) next.add(e.target.dataset.retailer);
        else next.delete(e.target.dataset.retailer);
        onChange({ ...filters, retailers: next });
      });
    });

  container.querySelector("#filter-family").addEventListener("change", (e) => {
    onChange({ ...filters, family: e.target.value || null });
  });
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
