import { forwardRef } from "react";
import type { PublicProduct, RecipePoint } from "../types";
import { Ternary } from "../ternary/Ternary";

type Props = {
  recipe: RecipePoint;
  products: PublicProduct[];
  siteName?: string;
};

export const RecipeExportCard = forwardRef<HTMLDivElement, Props>(function Card(
  { recipe, products, siteName = "macro-ternary.netlify.app" },
  ref,
) {
  const totals = recipe.totals;
  return (
    <div
      ref={ref}
      style={{
        width: 1200,
        height: 1200,
        background: "#fafaf7",
        color: "#1a1a1a",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 56,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <header>
        <h1 style={{ fontSize: 44, fontWeight: 700, margin: 0 }}>{recipe.title}</h1>
        <p style={{ fontSize: 22, marginTop: 8, color: "#374151" }}>
          {Math.round(totals.kcal)} kcal · {Math.round(totals.p)}P /{" "}
          {Math.round(totals.c)}C / {Math.round(totals.f)}F
        </p>
      </header>

      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 800, height: 720 }}>
          <Ternary
            width={800}
            height={720}
            products={products.map((p) => ({ ...p }))}
            recipes={[recipe]}
            // Fade context points by zero-ing the highlighted family.
            selectedFamily={"__none__"}
          />
        </div>
      </div>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Ingredients</h2>
        <ul style={{ fontSize: 16, lineHeight: 1.5, paddingLeft: 18, margin: 0 }}>
          {recipe.items.map((it, i) => (
            <li key={i}>
              {it.ingredient}
              {it.quantity_g ? ` — ${it.quantity_g} g` : ""} ·{" "}
              {Math.round(it.kcal)} kcal
            </li>
          ))}
        </ul>
        {recipe.assumptions.length > 0 && (
          <p style={{ fontSize: 14, color: "#6b7280", marginTop: 12, fontStyle: "italic" }}>
            Assumptions: {recipe.assumptions.join("; ")}
          </p>
        )}
      </section>

      <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, fontSize: 13, color: "#6b7280" }}>
        {siteName} · Macros estimated by AI — see site for details.
      </footer>
    </div>
  );
});
