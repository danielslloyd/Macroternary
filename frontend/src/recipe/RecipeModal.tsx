import { useState } from "react";
import type { RecipePoint } from "../types";
import { calorieShares } from "../ternary/geometry";

type LLMResponse = {
  items: { ingredient: string; quantity_g?: number; kcal: number; p: number; c: number; f: number }[];
  totals: { kcal: number; p: number; c: number; f: number };
  assumptions: string[];
  confidence: "high" | "medium" | "low";
  error?: string;
};

type Props = {
  onClose: () => void;
  onAdd: (r: RecipePoint) => void;
  endpoint?: string;
};

export function RecipeModal({ onClose, onAdd, endpoint = "/api/recipe" }: Props) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("My recipe");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 429) {
        setError("Rate limit reached — try again in a minute.");
        return;
      }
      if (!res.ok) {
        setError("The estimator service is unavailable right now.");
        return;
      }
      const data: LLMResponse = await res.json();
      if (data.error === "not_a_recipe") {
        setError("That doesn't look like a recipe. Try listing ingredients with quantities.");
        return;
      }
      const [pp, cc, ff] = calorieShares(data.totals.p, data.totals.c, data.totals.f);
      const recipe: RecipePoint = {
        id: crypto.randomUUID(),
        title: title.trim() || (data.items[0]?.ingredient ?? "Recipe"),
        totals: data.totals,
        items: data.items,
        assumptions: data.assumptions ?? [],
        confidence: data.confidence ?? "medium",
        p_pct: pp,
        c_pct: cc,
        f_pct: ff,
      };
      onAdd(recipe);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded shadow-xl w-full max-w-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Add a recipe</h2>
        <p className="text-sm text-gray-600">
          Type a freeform ingredient list. The LLM estimates macros and plots
          your recipe alongside packaged products. Macros are estimates — see
          the assumptions panel after submission.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Recipe title (optional)"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="1 cup oats, 1 tbsp peanut butter, 1 scoop whey, 1 banana"
            className="w-full h-32 px-3 py-2 border border-gray-300 rounded text-sm font-mono"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="px-3 py-1.5 text-sm bg-ink text-white rounded disabled:opacity-50"
            >
              {busy ? "Estimating…" : "Estimate macros"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
