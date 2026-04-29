# Macro Ternary — Requirements & Architecture Spec

A visualization tool that maps packaged foods on a ternary plot of caloric composition (carbs / protein / fat). Public-facing site is a static React app reading a published JSON snapshot. The data pipeline (scraping, image-based label extraction, validation, snapshot publishing) runs locally.

---

## 1. Goals & Non-Goals

### Goals
- Plot foods as points on a per-calorie ternary (P/C/F share of calories).
- Overlay **calories-per-gram-of-protein isolines** (protein at the top vertex). These curves let users instantly see protein cost regardless of macro mix.
- Hover reveals key macros, serving size, calories, and a link to the retailer product page.
- Maintain a retailer-agnostic product database via scraping, with photo-of-label as fallback.
- Group products by **food family** (e.g. "oats" → Quaker Instant, Great Value Old-Fashioned), so users browse by what something *is*, not just by brand.
- Allow users to enter a freeform recipe; an LLM estimates macros and plots the recipe alongside packaged products.
- Public site is cheap to host (static JSON + images, CDN-friendly).

### Non-Goals (v1)
- User accounts, saved lists, or any write path from the public site.
- Persistent storage of user-entered recipes — recipes live in URL state only.
- Mobile-native app.
- Price tracking. (Schema should not preclude it later.)

---

## 2. System Architecture

```
┌─────────────────── LOCAL (developer machine) ───────────────────┐
│                                                                  │
│  Retailer Adapters (Playwright)  ─┐                              │
│                                   ├─►  Normalizer  ─►  Validator │
│  Photo Pipeline                   │                       │      │
│   └─ VLM (Qwen2.5-VL via Ollama) ─┘                       ▼      │
│                                                       PostgreSQL │
│                                                           │      │
│                                                           ▼      │
│                                                    Snapshot Job  │
│                                                   (products.json │
│                                                    + images/)    │
└──────────────────────────────────┬───────────────────────────────┘
                                   │  publish (rsync / wrangler / netlify)
                                   ▼
┌─────────────────── PUBLIC (static host, e.g. Cloudflare Pages) ──┐
│                                                                  │
│  React + Vite SPA                                                │
│   └─ Custom D3 ternary (SVG)                                     │
│   └─ Fetches products.vN.json + image thumbs                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

### Backend (local)
- **Python 3.12**, package mgmt with **`uv`**.
- **FastAPI** — admin/review UI + internal endpoints (not public).
- **SQLAlchemy 2.x** + **Alembic** — ORM + migrations.
- **PostgreSQL 16** — local DB. SQLite acceptable for prototyping but prefer Postgres from the start (JSONB for raw extraction blobs).
- **Playwright (Python)** — scraping. Async, one browser context per retailer adapter.
- **Pydantic v2** — schema validation everywhere extraction touches the DB.
- **Ollama** — runs the local VLM. Default model: **Qwen2.5-VL-7B-Instruct** (Q4_K_M quant, ~6–7 GB VRAM, comfortable on the 5070 Ti 16 GB). Abstract behind a `LabelExtractor` interface so the model can be swapped (Llama 3.2 Vision, vLLM, hosted API).
- **httpx** for any non-browser HTTP.

### Frontend (public)
- **React 18 + TypeScript + Vite**.
- **D3 v7** for ternary geometry, isoline contouring, and SVG rendering. **Not Plotly** — the isoline overlay and custom hover behavior are easier to build directly than to bend Plotly into.
- **Tailwind** for styling.
- **No state library needed** for v1; React state + URL params are enough.
- Bundle target: <150 KB gzipped JS.

### Hosting
- **Netlify** for the static SPA (initial choice) plus **Netlify Functions** for the recipe LLM endpoint.
- `products.vN.json`, `families.vN.json`, and `/images/` co-located on the same origin (no CORS headaches).
- If the image directory grows past ~500 MB, move images off Netlify to **R2** or **S3 + CloudFront** and keep JSON on Netlify.
- Custom domain deferred — start under a `*.netlify.app` subdomain.

---

## 4. Data Model

### `products` (canonical row, one per SKU per retailer)
| field | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `retailer` | text | `costco` / `walmart` / `trader_joes` / etc. |
| `retailer_sku` | text | retailer's product ID |
| `brand` | text | nullable |
| `name` | text | display name |
| `category` | text | nullable, e.g. `dairy`, `snack_bar` |
| `food_family_id` | uuid FK | nullable; groups SKUs that are the same generic food |
| `serving_size_g` | numeric | grams per serving (the basis for all per-100g math) |
| `serving_size_label` | text | "1 bar (40g)" — for display |
| `calories_per_serving` | numeric | |
| `protein_g` | numeric | per serving |
| `carbs_g` | numeric | per serving (total carbs) |
| `fat_g` | numeric | per serving (total fat) |
| `fiber_g` | numeric | nullable |
| `sugar_g` | numeric | nullable |
| `sat_fat_g` | numeric | nullable |
| `sodium_mg` | numeric | nullable |
| `product_url` | text | retailer page (canonical, no affiliate tag) |
| `affiliate_url` | text | nullable; preferred public link if set |
| `image_url` | text | path under `/images/` |
| `label_image_url` | text | nullable, original label photo |
| `source` | enum | `scrape` / `photo_vlm` / `manual` |
| `extraction_confidence` | numeric | 0–1, from validator |
| `last_verified_at` | timestamp | for link-rot job |
| `created_at` / `updated_at` | timestamp | |

### `extraction_attempts` (audit trail; useful when scrapers/VLM drift)
- `product_id`, `attempted_at`, `source`, `raw_payload` (JSONB), `errors` (JSONB), `accepted` (bool).

### `retailers` (config)
- name, base_url, scrape_strategy (e.g. `sitemap`, `category_walk`), rate_limit_rps.

### `food_families` (generic food groupings)
| field | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | e.g. `oats`, `peanut-butter`, `greek-yogurt` |
| `name` | text | display name, e.g. "Oats" |
| `description` | text | nullable |
| `parent_id` | uuid FK | nullable, for hierarchies (e.g. `oats` → `instant-oats`) |

A family is a **generic food** that has many branded SKUs. Assignment is curatorial — set in the admin UI, not auto-derived. The frontend lets users browse by family ("show me all oats") and see brand-level variation as a cluster on the ternary.

### Seed file
Food families are loaded from a configurable JSON seed file at startup (or via `mt families load <path>`). Format:

```json
{
  "version": 1,
  "families": [
    {
      "slug": "oats",
      "name": "Oats",
      "description": "Whole oat groats and processed forms thereof.",
      "parent_slug": null
    },
    {
      "slug": "instant-oats",
      "name": "Instant Oats",
      "description": "Pre-cooked, dried, and rolled thin for fast preparation.",
      "parent_slug": "oats"
    }
  ]
}
```

- Loader is **idempotent**: same slug → upsert (update name/description/parent), never duplicates.
- Path is configurable via `MT_FAMILY_SEED_PATH` env var (defaults to `./seeds/food_families.json`).
- Daniel will provide a larger seed dataset; the loader must handle a few thousand entries without choking. Build the loader with bulk upsert (one transaction).
- Claude Code should ship a starter seed (≤30 common families: oats, rice, bread, pasta, milk, yogurt, cheese, eggs, peanut butter, almonds, chicken breast, ground beef, salmon, tofu, beans, lentils, bananas, apples, broccoli, spinach, etc.) so the system has something to render on day one.

---

## 5. Per-Calorie Ternary Math

For each product:

```
cal_p = protein_g * 4
cal_c = carbs_g   * 4
cal_f = fat_g     * 9
total = cal_p + cal_c + cal_f          # NOTE: ≠ calories_per_serving exactly
P% = cal_p / total
C% = cal_c / total
F% = cal_f / total
```

Use `total` (computed from macros), not `calories_per_serving`, for plot coordinates — labels often round and include alcohol/fiber adjustments that don't fit cleanly. Store both; flag products where the gap exceeds 15%.

### Vertex assignment
- **Top:** Protein
- **Bottom-left:** Carbs
- **Bottom-right:** Fat

### Isolines: calories per gram of protein

In strict per-calorie space, cal/g protein depends only on P%:

```
g_protein_per_cal = P% / 4
cal_per_g_protein = 4 / P%
```

So isolines are **straight horizontal bands parallel to the C–F base**. Render them at:

| P% | cal/g protein |
|---|---|
| 100% | 4 |
| 50%  | 8 |
| 33%  | 12 |
| 25%  | 16 |
| 20%  | 20 |
| 10%  | 40 |

Label each line at the right edge of the triangle. Lines should be visually faint (low-opacity stroke) so they don't compete with data points; labels in a slightly heavier weight.

---

## 6. Scraper Adapters

### Interface
```python
class RetailerAdapter(Protocol):
    name: str
    async def discover(self) -> AsyncIterator[ProductRef]: ...
    async def fetch(self, ref: ProductRef) -> RawProduct: ...
```

- `RawProduct` is a Pydantic model with optional fields; the normalizer maps it to the canonical schema.
- One adapter per retailer, in `scrapers/<retailer>/`.
- Each adapter ships with **fixture HTML files** and **pytest tests** that assert correct extraction. When the DOM changes, tests fail, you fix one place.
- Respect `robots.txt` and apply per-retailer rate limits (configurable, default 0.5 rps).
- User-agent: descriptive, with contact email.

### Initial adapters (build in this order)
1. Trader Joe's (smallest catalog, simpler site)
2. Walmart (largest catalog, most useful)
3. Costco (auth-walled member pricing — only scrape public nutrition data)

### Fallback: photo pipeline (local web UI)

Photo-sourced rows are reviewed through a local web app served by the FastAPI backend at `http://localhost:8000/admin`. Workflow:

1. **Upload** — drag-and-drop one or many label photos. Each upload kicks off an async VLM job.
2. **Queue view** — table of pending extractions with thumbnail, status (`processing` / `ready` / `error`), and confidence.
3. **Review screen** — split pane:
   - **Left:** original label image, zoomable.
   - **Right:** form pre-filled with VLM-extracted fields (serving size, calories, P/C/F, fiber, sugar, sat fat, sodium, brand, name). Validator results shown inline (e.g., red banner: "calorie arithmetic off by 22%").
   - User edits any field, attaches retailer URL, clicks **Approve** → row writes to DB with `source = photo_vlm`, `extraction_confidence = 0.8`.
   - **Reject** discards the attempt (kept in `extraction_attempts` for audit).
4. **Re-extract** button reruns the VLM with a different prompt template if extraction is wildly off.

The VLM prompt requests strict JSON with all macro fields plus `confidence_notes`. Human review is **mandatory** for any photo-sourced row before it lands in the published snapshot.

Stack: same React + Vite app structure as the public site, but a separate entry point (`admin.html`) that talks to the local FastAPI. Not deployed publicly. Auth: bind FastAPI to `127.0.0.1` only.

---

## 7. Validation Rules

Every extraction (scrape or VLM) runs through the validator before insert. Reject or flag if:

- `|calories_per_serving − (4P + 4C + 9F)| / calories_per_serving > 0.15` — label arithmetic check.
- `sat_fat_g > fat_g` or `sugar_g > carbs_g` (when both present).
- `serving_size_g <= 0` or any macro is negative.
- Any required field missing.

Validator output sets `extraction_confidence`:
- `1.0` — all checks pass, scrape source.
- `0.8` — all checks pass, VLM source, human-reviewed.
- `<0.5` — blocked from snapshot until reviewed.

---

## 8. Snapshot Publishing

A single command produces the public artifacts. **Snapshots are on-demand** — no cron, no auto-publish. You run the command when the DB is in a state worth publishing.

```bash
mt snapshot --version 4 --out ./public/
```

Outputs:
- `products.v4.json` — array of products with only public-facing fields. **No raw extraction data, no internal IDs leaked.**
- `images/<id>.webp` — 400×400 product thumbnails, optimized.
- `meta.json` — `{ version, generated_at, count, retailers: [...] }`.

The frontend reads `meta.json` first, then `products.v{version}.json`. Old snapshot versions stay deployed for cache safety.

### Public schema (subset of internal)
```ts
type PublicProduct = {
  id: string;
  retailer: string;
  brand: string | null;
  name: string;
  category: string | null;
  family: string | null;       // food family slug, e.g. "oats"
  serving_g: number;
  serving_label: string;
  kcal: number;       // calories per serving
  p: number;          // protein g
  c: number;          // carbs g
  f: number;          // fat g
  // Pre-computed for plotting:
  p_pct: number;      // calorie share, 0–1
  c_pct: number;
  f_pct: number;
  url: string;       // affiliate_url if present, else product_url
  img: string;        // relative path to thumb
};

type PublicFoodFamily = {
  slug: string;
  name: string;
  description: string | null;
  parent_slug: string | null;
};
```

The snapshot emits `products.vN.json` and `families.vN.json` side by side. Pre-computing percentages keeps the frontend trivial and the bundle small. The snapshot job picks `affiliate_url` over `product_url` per row when both exist; the frontend never sees both.

---

## 9. Recipe Feature (LLM-powered, public-side)

Users type a freeform recipe ("1 cup oats, 1 tbsp peanut butter, 1 scoop whey, 1 banana"). An LLM estimates total macros, the recipe is plotted on the ternary as a distinct point, and the result is shareable via URL.

### Architecture
- **Serverless function** (Netlify Function or Cloudflare Worker, depending on host) at `/api/recipe`. Receives the freeform text, returns structured macros JSON.
- **No persistence.** The function does not write anywhere. Recipe state is encoded in the URL hash on the frontend (e.g. `#r=<base64-encoded-json>`), so users can share a recipe link.
- **LLM abstraction.** The function calls a `RecipeMacroEstimator` interface; concrete implementations for OpenAI, Anthropic, Cloudflare Workers AI, etc. **v1 ships with OpenAI** (`gpt-4o-mini` recommended for cost — strict JSON mode supported, ~$0.15/1M input tokens). Switch via `RECIPE_LLM_PROVIDER` env var.
- **Rate limiting.** IP-based, **3 requests/min/IP**. Required to prevent abuse running up your LLM bill.
- **Cost cap.** Hard daily spend limit of **$0.25/day** enforced in the function itself; over-limit returns a 429 with a friendly message. Tracked via a Netlify Blobs counter keyed by UTC date.

### LLM contract
The estimator is asked to return strict JSON:
```json
{
  "items": [
    {"ingredient": "rolled oats", "quantity_g": 80, "kcal": 304, "p": 13, "c": 54, "f": 5.3},
    ...
  ],
  "totals": {"kcal": ..., "p": ..., "c": ..., "f": ...},
  "assumptions": ["Assumed 'oats' = rolled oats, dry weight"],
  "confidence": "medium"
}
```
- Per-ingredient breakdown is shown to the user so they can see what the LLM assumed.
- `assumptions` field is **prominently surfaced** in the UI — calling out unit/variety guesses is the main way to keep users from being misled by silent errors.
- `confidence` (`high` / `medium` / `low`) drives a visual badge on the recipe point.

### Frontend UX
- A "+ Recipe" button opens a modal with a textarea.
- After submission, recipe appears as a **diamond marker** (vs circles for products), with a different color, and a "Recipe" badge in the hover card.
- Hover/click shows the per-ingredient breakdown and the LLM's assumptions list.
- Up to 5 active recipes at a time on the plot, all encoded in the URL.
- A "Share recipe" button copies the deep-linked URL.
- A **"Save as PNG"** button exports a shareable image (see below).

### PNG export

When the user clicks "Save as PNG" on a recipe, a composite image is generated **client-side** (no server round trip) and downloaded as `recipe-<short-id>.png`.

**Composition** (single 1200×1200 PNG, square for social-friendly aspect):
- Top: recipe title (auto-generated from first ingredient or user-editable) + total macros line ("420 kcal · 28P / 45C / 12F").
- Middle: the ternary plot, snapshot of current state — the recipe diamond highlighted, all other points faded to ~10% opacity for context.
- Bottom: ingredient list (LLM-parsed, with quantities), and the LLM's `assumptions` line in small italic text.
- Footer strip: site URL + small disclaimer ("Macros estimated by AI — see site for details").

**Implementation:**
- Use **`html-to-image`** (≈10 KB gzipped) to rasterize a hidden DOM node containing the export layout. The ternary SVG is included via `<svg>` inline so fonts and CSS render reliably.
- Build a dedicated `<RecipeExportCard />` React component that mounts off-screen (`position: absolute; left: -10000px`) when the user clicks Save, gets rasterized, then unmounts.
- Embed all fonts via `@font-face` with base64 data URIs (Inter or similar) so rendering is deterministic across browsers — `html-to-image` can otherwise produce inconsistent results when fonts haven't fully loaded.
- Test on Safari iOS specifically — it's the most likely place this breaks.

**No server-side fallback.** If client-side rendering fails (rare), surface a clear error rather than silently producing a broken image.

### Failure modes to design for
- LLM returns invalid JSON → function retries once with a stricter prompt, then surfaces an error to the user.
- LLM hallucinates macros wildly off realistic ranges (e.g. 200g protein in 100kcal) → server-side sanity check (`4P + 4C + 9F` within 20% of stated kcal); reject and ask user to rephrase.
- User enters something that isn't a recipe ("hello") → LLM should return `{"error": "not_a_recipe"}` per its system prompt; frontend shows a friendly message.

---

## 10. Frontend Behavior

### Layout
- Single page. Ternary plot dominant. Filter sidebar (retailer, **food family**, category, search by name). Optional table view toggle.
- "+ Recipe" button in the header opens the recipe modal (see §9).

### Plot
- SVG ternary, ~700 px on desktop, responsive.
- Product points: circles, colored by retailer (categorical palette), shape varied for accessibility.
- Recipe points: diamonds, distinct color, with a "Recipe" badge.
- Isolines drawn as faint lines with end-of-line labels (`8 cal/g protein`, etc.).
- When a food family is selected, non-family points fade to ~15% opacity so the family cluster pops.
- Click a point → side panel with full macro breakdown, larger image, retailer link.
- URL params reflect filters, selected product, and active recipes (deep-linkable).

### Performance budget
- Handle 5,000 points without jank. Beyond that, switch to canvas — but defer until needed.
- All filter ops are in-memory on the loaded JSON. No request-per-filter.

### Accessibility
- Keyboard navigation between points (arrow keys cycle by P% then C%).
- Screen-reader description of each point on focus.
- Color is not the only retailer indicator — use shape too.

---

## 11. Repo Layout

```
macro-ternary/
├── backend/
│   ├── pyproject.toml                  # uv-managed
│   ├── alembic/
│   ├── src/mt/
│   │   ├── api/                        # FastAPI (admin only)
│   │   ├── db/                         # SQLAlchemy models
│   │   ├── scrapers/
│   │   │   ├── base.py                 # RetailerAdapter protocol
│   │   │   ├── trader_joes/
│   │   │   ├── walmart/
│   │   │   └── costco/
│   │   ├── extractors/
│   │   │   ├── base.py                 # LabelExtractor protocol
│   │   │   └── qwen_ollama.py
│   │   ├── validators/
│   │   ├── snapshot/                   # publish command
│   │   └── cli.py                      # `mt` command
│   └── tests/
│       └── scrapers/<retailer>/fixtures/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── ternary/                    # D3 ternary component
│   │   │   ├── geometry.ts             # barycentric → cartesian
│   │   │   ├── isolines.ts
│   │   │   └── Ternary.tsx
│   │   ├── filters/
│   │   └── data/                       # JSON fetch + types
│   └── public/
│       ├── products.v1.json            # symlinked from backend output
│       ├── meta.json
│       └── images/
└── README.md
```

---

## 12. Build Order (suggested for Claude Code)

1. **Backend skeleton:** `uv` project, SQLAlchemy models (including `food_families`), Alembic init, one migration.
2. **Family seed loader** + starter JSON seed (≤30 common families). Idempotent upsert, bulk-safe.
3. **Validator + tests** — fastest thing to TDD; lock down the schema invariants.
4. **Snapshot command** with hand-seeded data — proves the contract to the frontend before any scraping exists.
5. **Frontend skeleton:** Vite + React + Tailwind, fetch `meta.json` + products + families, render a placeholder list.
6. **D3 ternary component** with hardcoded points; iterate on isolines.
7. **Family-aware filter sidebar** + cluster fade behavior.
8. **First scraper:** Trader Joe's. Fixtures + tests first.
9. **VLM extractor + admin web UI** for photo review.
10. **Wire end-to-end:** scrape → validate → DB → snapshot → frontend renders real data.
11. **Walmart adapter, then Costco.**
12. **Recipe feature:** Netlify Function with `RecipeMacroEstimator` interface (OpenAI impl), frontend modal, URL encoding.
13. **Recipe PNG export:** `<RecipeExportCard />` + `html-to-image` integration.
14. **Link-rot job** (CLI command, manual-run; marks `last_verified_at`).
15. **Deploy frontend** to Netlify (subdomain). Wire affiliate templating later when programs are active.

---

## 13. Policies

### Image hosting policy
- **Label photos** (taken by you): stored locally and bundled into the public snapshot under `/images/`.
- **Retailer product images**: not redistributed. The public snapshot's `img` field is an absolute URL pointing to the retailer's own CDN. The local `image_url` column is used only by the admin UI. This sidesteps copyright/redistribution concerns and keeps the public bundle small.
- A nightly link-check (run on demand) marks dead retailer CDN URLs so the frontend can show a placeholder instead of a broken image.

### SKU granularity
**One row per SKU.** Different sizes, frozen vs fresh, or limited-edition variants of the same nominal product each get their own row. Reasons: macros differ across variants more than people expect; users searching for "Mandarin Orange Chicken" benefit from seeing the actual cluster of variants on the plot. The `name` field should disambiguate (`"Mandarin Orange Chicken (frozen, 22 oz)"`).

### Food families
A `food_family` is the **generic food** ("oats", "peanut butter", "greek yogurt"). SKUs assigned to a family form a cluster on the ternary, letting users see brand-level macro variation at a glance. Family assignment is curatorial (admin UI), not auto-derived from name. Hierarchies are allowed: `oats` → `instant-oats`, `oats` → `steel-cut-oats`. Brand canonicalization (`brand_canonical`) is deferred — keep raw `brand` strings in v1.

### Affiliate links
You don't currently have any affiliate program memberships, so v1 ships with no affiliate URLs. The schema and snapshot pipeline are built to support them later without re-scraping.

- `affiliate_url` is the preferred public link when present; `product_url` is always the canonical untagged URL.
- Per-retailer support is a config flag — applied as a URL-template transformation at snapshot time.
- Disclosure UI is built from day one (footer + inline note near affiliate links), even though it'll be inert until the first program is active. Disclosure must be "clear and conspicuous" per FTC 16 CFR Part 255.

**Affiliate program landscape (for when you're ready to sign up):**

| Program | Approval | Notes |
|---|---|---|
| Walmart Creator / Affiliates | Easy | Best first target. ~1–4% commission on groceries. |
| Amazon Associates | Easy, but **180-day rule** | Don't sign up until the site has real traffic — accounts are closed if you don't drive a sale within 180 days. Useful as fallback for products that exist on Amazon. |
| Target Affiliates (Impact) | Moderate | Lower priority. |
| Costco | None — no public program | Costco URLs will never be affiliate links. |
| Trader Joe's | None — no e-commerce | TJ's URLs are informational pages only. A meaningful chunk of the dataset will never have affiliate revenue regardless of program signups. |

### Snapshot cadence
On-demand only. The expected workflow: scrape or photo-import in batches, eyeball the admin queue, run `mt snapshot && mt publish` when satisfied.

---

## 14. Open Questions for Daniel

All major design decisions are resolved:
- ✅ Isoline metric: `4/P%`, straight horizontal bands.
- ✅ Photo review: local web UI under FastAPI admin.
- ✅ Affiliate links: schema supports them; no programs active at v1; disclosure UI built from day one.
- ✅ Refresh: on-demand.
- ✅ SKUs: one row per SKU.
- ✅ Brand handling: food families (curated) instead of brand canonicalization.
- ✅ Hosting: Netlify (subdomain) + Netlify Functions for the recipe endpoint.
- ✅ Recipe feature: LLM does everything, ephemeral URL state.
- ✅ Image rights: hot-link retailer CDNs from public site; only label photos redistributed.
- ✅ Recipe rate limits: 3 req/min/IP, $0.25/day cap.
- ✅ Family seed: configurable JSON file; Claude Code provides starter seed; Daniel will port a larger dataset later.
- ✅ Recipe LLM provider for v1: OpenAI (`gpt-4o-mini`).
- ✅ Recipe PNG export: client-side via `html-to-image`.

### Items Daniel needs to provide (or decide before running Claude Code)
1. **`OPENAI_API_KEY`** — set in Netlify environment for the recipe function. Optionally a usage cap on the OpenAI dashboard as a backstop to the in-function $0.25/day limit.
2. **Larger food-family seed file** — when ready, drop into `seeds/food_families.json` (or set `MT_FAMILY_SEED_PATH`) and run `mt families load`. Format documented in §4.
3. **Site name** — the spec calls it "Macro Ternary" as a working title. Confirm or rename; affects Netlify subdomain (`macro-ternary.netlify.app`?), repo name, and the PNG export footer.
