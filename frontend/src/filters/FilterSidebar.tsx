import type { Filters, PublicFoodFamily, PublicProduct } from "../types";

type Props = {
  products: PublicProduct[];
  families: PublicFoodFamily[];
  retailers: string[];
  filters: Filters;
  setFilters: (f: Filters) => void;
};

export function FilterSidebar({
  products,
  families,
  retailers,
  filters,
  setFilters,
}: Props) {
  const familyCounts = new Map<string, number>();
  for (const p of products) {
    if (!p.family) continue;
    familyCounts.set(p.family, (familyCounts.get(p.family) ?? 0) + 1);
  }

  return (
    <aside className="space-y-6 p-4 border-r border-gray-200 w-64 overflow-y-auto">
      <div>
        <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
          Search
        </label>
        <input
          type="text"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          placeholder="oats, chicken…"
        />
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          Retailer
        </h3>
        <ul className="space-y-1">
          {retailers.map((r) => {
            const checked = filters.retailers.has(r);
            return (
              <li key={r}>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(filters.retailers);
                      if (e.target.checked) next.add(r);
                      else next.delete(r);
                      setFilters({ ...filters, retailers: next });
                    }}
                  />
                  <span className="capitalize">{r.replace("_", " ")}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          Food family
        </h3>
        <select
          value={filters.family ?? ""}
          onChange={(e) =>
            setFilters({ ...filters, family: e.target.value || null })
          }
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
        >
          <option value="">— all —</option>
          {families.map((f) => {
            const count = familyCounts.get(f.slug) ?? 0;
            if (count === 0 && filters.family !== f.slug) return null;
            return (
              <option key={f.slug} value={f.slug}>
                {f.name} ({count})
              </option>
            );
          })}
        </select>
      </div>
    </aside>
  );
}
