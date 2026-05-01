// Snapshot loader. Reads /data/meta.json first, then the versioned
// products/families files it points at.

export async function loadSnapshot() {
  const metaRes = await fetch("data/meta.json", { cache: "no-cache" });
  if (!metaRes.ok) {
    throw new Error(
      "data/meta.json missing — run `mt snapshot --version 1` from the backend."
    );
  }
  const meta = await metaRes.json();

  const productsUrl = meta.products_url || `products.v${meta.version}.json`;
  const familiesUrl = meta.families_url || `families.v${meta.version}.json`;

  const [productsRes, familiesRes] = await Promise.all([
    fetch(`data/${productsUrl}`, { cache: "no-cache" }),
    fetch(`data/${familiesUrl}`, { cache: "no-cache" }),
  ]);
  if (!productsRes.ok) {
    throw new Error(`data/${productsUrl} not found`);
  }
  const products = await productsRes.json();
  const families = familiesRes.ok ? await familiesRes.json() : [];
  return { meta, products, families };
}
