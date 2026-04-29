import type { Meta, PublicFoodFamily, PublicProduct } from "../types";

export type LoadResult = {
  meta: Meta;
  products: PublicProduct[];
  families: PublicFoodFamily[];
};

export async function loadSnapshot(): Promise<LoadResult> {
  const metaRes = await fetch("/meta.json", { cache: "no-cache" });
  if (!metaRes.ok) throw new Error("missing meta.json — run `mt snapshot`");
  const meta: Meta = await metaRes.json();

  const productsUrl = meta.products_url ?? `products.v${meta.version}.json`;
  const familiesUrl = meta.families_url ?? `families.v${meta.version}.json`;

  const [productsRes, familiesRes] = await Promise.all([
    fetch(`/${productsUrl}`, { cache: "no-cache" }),
    fetch(`/${familiesUrl}`, { cache: "no-cache" }),
  ]);
  if (!productsRes.ok) throw new Error(`fetch ${productsUrl} failed`);

  const products: PublicProduct[] = await productsRes.json();
  const families: PublicFoodFamily[] = familiesRes.ok ? await familiesRes.json() : [];
  return { meta, products, families };
}
