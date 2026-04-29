import { useEffect, useMemo, useRef, useState } from "react";
import { Ternary } from "./ternary/Ternary";
import { FilterSidebar } from "./filters/FilterSidebar";
import { RecipeModal } from "./recipe/RecipeModal";
import { RecipeExportCard } from "./recipe/RecipeExportCard";
import { loadSnapshot, type LoadResult } from "./data/load";
import {
  readRecipesFromHash,
  writeRecipesToHash,
} from "./recipe/encoder";
import type { Filters, RecipePoint } from "./types";

const DEFAULT_FILTERS = (): Filters => ({
  retailers: new Set<string>(),
  family: null,
  query: "",
});

export default function App() {
  const [data, setData] = useState<LoadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipePoint[]>([]);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [exporting, setExporting] = useState<RecipePoint | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  // Load snapshot once.
  useEffect(() => {
    loadSnapshot()
      .then((d) => {
        setData(d);
        setFilters((prev) => ({
          ...prev,
          retailers: new Set(d.meta.retailers),
        }));
      })
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  // Hydrate recipes from URL hash.
  useEffect(() => {
    setRecipes(readRecipesFromHash());
  }, []);
  useEffect(() => {
    writeRecipesToHash(recipes);
  }, [recipes]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    const q = filters.query.trim().toLowerCase();
    return data.products.filter((p) => {
      if (filters.retailers.size && !filters.retailers.has(p.retailer)) return false;
      if (q) {
        const hay = `${p.name} ${p.brand ?? ""} ${p.family ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, filters]);

  const selectedProduct = useMemo(
    () => filteredProducts.find((p) => p.id === selectedId) ?? null,
    [filteredProducts, selectedId],
  );

  const triggerPng = async (recipe: RecipePoint) => {
    setExporting(recipe);
    // Wait a tick so the off-screen card mounts before rasterizing.
    requestAnimationFrame(async () => {
      try {
        const { toPng } = await import("html-to-image");
        if (!exportRef.current) return;
        const dataUrl = await toPng(exportRef.current, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#fafaf7",
        });
        const link = document.createElement("a");
        link.download = `recipe-${recipe.id.slice(0, 8)}.png`;
        link.href = dataUrl;
        link.click();
      } catch (e) {
        // Surface a clear error rather than failing silently (§9).
        // eslint-disable-next-line no-alert
        alert(
          "PNG export failed — try again, or take a screenshot. " +
            (e instanceof Error ? e.message : ""),
        );
      } finally {
        setExporting(null);
      }
    });
  };

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold">Macro Ternary</h1>
        <p className="mt-4 text-red-700">Could not load snapshot: {error}</p>
        <p className="mt-2 text-sm text-gray-600">
          Run <code className="font-mono bg-gray-100 px-1">mt snapshot --version 1 --out frontend/public</code> from
          the backend, then refresh.
        </p>
      </div>
    );
  }
  if (!data) {
    return <div className="p-8">Loading snapshot…</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold">Macro Ternary</h1>
          <span className="text-xs text-gray-500">
            v{data.meta.version} · {data.meta.count} products
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRecipeModal(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            + Recipe
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <FilterSidebar
          products={data.products}
          families={data.families}
          retailers={data.meta.retailers}
          filters={filters}
          setFilters={setFilters}
        />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto">
            <Ternary
              products={filteredProducts}
              recipes={recipes}
              selectedFamily={filters.family}
              selectedProductId={selectedId}
              onSelect={setSelectedId}
            />
            <p className="mt-2 text-xs text-gray-500">
              Click a point to inspect; arrow keys via tab. Isolines show calories per gram of protein.
            </p>
          </div>
        </main>

        <aside className="w-80 border-l border-gray-200 overflow-y-auto">
          {selectedProduct ? (
            <div className="p-4 space-y-2">
              <h2 className="text-base font-semibold">{selectedProduct.name}</h2>
              <p className="text-xs text-gray-500">
                {selectedProduct.brand} · {selectedProduct.retailer}
              </p>
              <dl className="text-sm grid grid-cols-2 gap-y-1 mt-3">
                <dt className="text-gray-500">Serving</dt>
                <dd>{selectedProduct.serving_label ?? `${selectedProduct.serving_g} g`}</dd>
                <dt className="text-gray-500">Calories</dt>
                <dd>{selectedProduct.kcal}</dd>
                <dt className="text-gray-500">Protein</dt>
                <dd>{selectedProduct.p} g ({Math.round(selectedProduct.p_pct * 100)}%)</dd>
                <dt className="text-gray-500">Carbs</dt>
                <dd>{selectedProduct.c} g ({Math.round(selectedProduct.c_pct * 100)}%)</dd>
                <dt className="text-gray-500">Fat</dt>
                <dd>{selectedProduct.f} g ({Math.round(selectedProduct.f_pct * 100)}%)</dd>
                <dt className="text-gray-500">cal/g protein</dt>
                <dd>
                  {selectedProduct.p_pct > 0
                    ? (4 / selectedProduct.p_pct).toFixed(1)
                    : "—"}
                </dd>
              </dl>
              <a
                href={selectedProduct.url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="inline-block mt-3 text-sm text-blue-700 underline"
              >
                View at {selectedProduct.retailer}
              </a>
            </div>
          ) : recipes.length > 0 ? (
            <div className="p-4 space-y-3">
              <h2 className="text-base font-semibold">Recipes</h2>
              {recipes.map((r) => (
                <div key={r.id} className="border border-gray-200 rounded p-3 space-y-2">
                  <div className="flex justify-between items-baseline">
                    <strong>{r.title}</strong>
                    <span className={`text-xs px-1.5 py-0.5 rounded uppercase tracking-wide ${
                      r.confidence === "high" ? "bg-emerald-100 text-emerald-800" :
                      r.confidence === "low" ? "bg-amber-100 text-amber-800" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {r.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {Math.round(r.totals.kcal)} kcal · {Math.round(r.totals.p)}P /{" "}
                    {Math.round(r.totals.c)}C / {Math.round(r.totals.f)}F
                  </p>
                  {r.assumptions.length > 0 && (
                    <p className="text-xs italic text-amber-900">
                      <strong>Assumptions:</strong> {r.assumptions.join("; ")}
                    </p>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600">Ingredients</summary>
                    <ul className="mt-1 ml-4 list-disc space-y-0.5">
                      {r.items.map((it, i) => (
                        <li key={i}>
                          {it.ingredient}
                          {it.quantity_g ? ` (${it.quantity_g} g)` : ""} · {Math.round(it.kcal)} kcal
                        </li>
                      ))}
                    </ul>
                  </details>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => triggerPng(r)}
                      className="text-xs px-2 py-1 border border-gray-300 rounded"
                    >
                      Save as PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipes((prev) => prev.filter((x) => x.id !== r.id))}
                      className="text-xs px-2 py-1 border border-gray-300 rounded text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-gray-500">
              Click a point on the plot, or click <strong>+ Recipe</strong> in the header.
            </div>
          )}
        </aside>
      </div>

      <footer className="border-t border-gray-200 px-6 py-2 text-xs text-gray-500">
        Snapshot {data.meta.generated_at} · Some links may be affiliate links;
        we may earn a commission if you buy through them.
      </footer>

      {showRecipeModal && (
        <RecipeModal
          onClose={() => setShowRecipeModal(false)}
          onAdd={(r) => setRecipes((prev) => [...prev, r].slice(-5))}
        />
      )}

      {exporting && (
        <div style={{ position: "absolute", left: -10000, top: 0 }} aria-hidden="true">
          <RecipeExportCard
            ref={exportRef}
            recipe={exporting}
            products={data.products}
          />
        </div>
      )}
    </div>
  );
}
