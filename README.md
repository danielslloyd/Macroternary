# Macro Ternary

A visualization tool that maps packaged foods on a per-calorie ternary plot
(carbs / protein / fat), with calories-per-gram-of-protein isolines. Public
site is a static React app reading a published JSON snapshot. Data pipeline
(scrape, photo-of-label OCR via local VLM, validation, snapshot publishing)
runs locally.

See [`docs/macro_ternary_spec.md`](docs/macro_ternary_spec.md) for the full
spec. This README is the operator's manual.

## Repo layout

```
backend/      Python (uv) — DB, validators, snapshot, admin FastAPI, `mt` CLI
frontend/     Vite + React + Tailwind + D3 ternary
netlify/      Netlify Function for the recipe LLM endpoint
docs/         Spec
```

## Backend setup

```bash
cd backend
uv sync                          # or: pip install -e '.[dev]'
uv run alembic upgrade head      # or: mt init-db for SQLite quick-start
uv run mt families load          # loads seeds/food_families.json
uv run mt seed-demo              # inserts ~10 demo products
uv run mt snapshot --version 1 --out ../frontend/public
```

The default DB is SQLite (`./macroternary.db`). For Postgres, set
`MT_DATABASE_URL=postgresql+psycopg://user:pass@localhost/macroternary` and
`alembic upgrade head`.

### Tests

```bash
cd backend
uv run pytest
```

Validator and snapshot pipelines are TDD'd; scraper adapters expect HTML
fixtures under `tests/scrapers/<retailer>/fixtures/` (not yet populated).

### Admin UI (photo pipeline)

```bash
uv run mt serve                  # FastAPI on 127.0.0.1:8000
```

Currently exposes JSON endpoints (`/admin/api/*`). Browser UI for the photo
review queue is next on the build order (#9 in the spec).

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The app expects `public/meta.json`, `products.vN.json`, and
`families.vN.json` to be present. A pre-baked demo snapshot ships in this
repo so `npm run dev` works out of the box.

Production build:

```bash
npm run build
```

## Recipe function (Netlify)

`/api/recipe` accepts `{text}` and returns macro estimates. Set in Netlify
environment:

```
OPENAI_API_KEY=sk-...
RECIPE_LLM_PROVIDER=openai      # default; switch when alternates exist
OPENAI_MODEL=gpt-4o-mini        # default
```

Limits enforced in the function: 3 req/min/IP, $0.25/day cap (tracked via
Netlify Blobs).

Local: `netlify dev` from repo root proxies the function at `/api/recipe`.

## Snapshot workflow

Snapshots are on-demand. Typical loop:

```bash
# scrape or photo-import in batches…
uv run mt snapshot --version 5 --out ../frontend/public
# rsync / netlify deploy as usual
```

The snapshot job:

- excludes `extraction_confidence < 0.5`
- prefers `affiliate_url` over `product_url`
- pre-computes `p_pct / c_pct / f_pct` from macros (not label kcal — see §5)

## Status vs. spec build order

| # | Item | Status |
|---|------|--------|
| 1 | Backend skeleton + models + migration | ✅ |
| 2 | Family seed loader + starter seed | ✅ |
| 3 | Validator + tests | ✅ |
| 4 | Snapshot command + tests | ✅ |
| 5 | Frontend skeleton (Vite + React + Tailwind) | ✅ |
| 6 | D3 ternary + isolines | ✅ |
| 7 | Family-aware filter sidebar + cluster fade | ✅ |
| 8 | Trader Joe's adapter | 🟡 stub interface; HTML fixtures TBD |
| 9 | VLM extractor + admin web UI | 🟡 Qwen extractor + JSON API; React admin TBD |
| 10 | End-to-end wiring | ✅ via `seed-demo` + snapshot |
| 11 | Walmart, Costco adapters | 🟡 stubs |
| 12 | Recipe Netlify Function + frontend modal | ✅ |
| 13 | Recipe PNG export | ✅ |
| 14 | Link-rot job | ⏳ |
| 15 | Deploy to Netlify | ⏳ |

## Provenance

This codebase was bootstrapped from `docs/macro_ternary_spec.md`.
