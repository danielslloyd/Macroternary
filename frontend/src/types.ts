export type PublicProduct = {
  id: string;
  retailer: string;
  brand: string | null;
  name: string;
  category: string | null;
  family: string | null;
  serving_g: number;
  serving_label: string | null;
  kcal: number;
  p: number;
  c: number;
  f: number;
  p_pct: number;
  c_pct: number;
  f_pct: number;
  url: string;
  img: string | null;
};

export type PublicFoodFamily = {
  slug: string;
  name: string;
  description: string | null;
  parent_slug: string | null;
};

export type Meta = {
  version: number;
  generated_at: string;
  count: number;
  retailers: string[];
  products_url?: string;
  families_url?: string;
};

export type RecipePoint = {
  id: string;
  title: string;
  totals: { kcal: number; p: number; c: number; f: number };
  items: { ingredient: string; quantity_g?: number; kcal: number; p: number; c: number; f: number }[];
  assumptions: string[];
  confidence: "high" | "medium" | "low";
  // Pre-computed plot coords:
  p_pct: number;
  c_pct: number;
  f_pct: number;
};

export type Filters = {
  retailers: Set<string>;
  family: string | null;
  query: string;
};
