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

// CSV loader. Loads food data from CSV and converts to products format.
export async function loadCSV() {
  const csvRes = await fetch("data/food_data_combined.csv", { cache: "no-cache" });
  if (!csvRes.ok) {
    throw new Error("CSV file not found");
  }
  const csv = await csvRes.text();
  const lines = csv.trim().split("\n");
  const products = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map(p => p.trim());
    if (parts.length < 5) continue;

    const name = parts[0];
    const kcal = parseFloat(parts[1]) || 0;
    const fat = parseFloat(parts[2]) || 0;
    const carbs = parseFloat(parts[3]) || 0;
    const protein = parseFloat(parts[4]) || 0;

    const total = fat + carbs + protein;
    const p_pct = total > 0 ? protein / total : 0;
    const c_pct = total > 0 ? carbs / total : 0;
    const f_pct = total > 0 ? fat / total : 0;

    products.push({
      id: `csv-${i}`,
      retailer: "csv",
      brand: null,
      name: name,
      category: null,
      family: null,
      serving_g: 100,
      serving_label: "100g",
      kcal: parseFloat(kcal.toFixed(1)),
      p: protein,
      c: carbs,
      f: fat,
      p_pct: parseFloat(p_pct.toFixed(6)),
      c_pct: parseFloat(c_pct.toFixed(6)),
      f_pct: parseFloat(f_pct.toFixed(6)),
      url: null,
      img: null,
    });
  }

  const meta = {
    version: 1,
    count: products.length,
    retailers: ["csv"],
  };

  return { meta, products, families: [] };
}
