# Macro Ternary

Local-sandbox tool that maps packaged foods on a per-calorie ternary plot
(carbs / protein / fat), with calories-per-gram-of-protein isolines. One
Python process serves both the data API and the static frontend on
`127.0.0.1`. No build step on the frontend — plain HTML + ES-module JS.

See [`docs/macro_ternary_spec.md`](docs/macro_ternary_spec.md) for the full
spec and roadmap.

## Repo layout

```
backend/   Python (uv) — DB, validators, snapshot, FastAPI server, `mt` CLI
frontend/  index.html + js/* + styles.css + data/<snapshot files>
docs/      Spec
```

The frontend is plain JavaScript using ES modules. `d3` and Tailwind are
loaded from CDNs at runtime, so there is no npm install, no Vite, no TS.

## Quick start

```bash
# 1. backend env
cd backend
uv sync                              # or: python3.12 -m venv .venv && .venv/bin/pip install -e '.[dev]'

# 2. local DB + starter data
uv run mt init-db                    # SQLite at backend/macroternary.db
uv run mt families load              # loads seeds/food_families.json (~30 entries)
uv run mt seed-demo                  # ~10 demo products, manual source

# 3. publish a snapshot for the frontend to read
uv run mt snapshot --version 1       # writes ../frontend/data/{meta,products.v1,families.v1}.json

# 4. start the local server
uv run mt serve                      # http://127.0.0.1:8000
```

Open `http://127.0.0.1:8000` and you should see the ternary plot.

> Want to skip the backend entirely? A demo snapshot is checked into
> `frontend/data/`. From the `frontend/` directory run
> `python -m http.server 8000` and open `http://127.0.0.1:8000` — the
> ternary works; only the AI recipe estimator is unavailable.

## Daily workflow

```bash
# scrape / photo-import / hand-edit rows in the DB…
uv run mt snapshot --version 2       # bumps the snapshot the frontend reads
# refresh the browser
```

Snapshot job (spec §8):
- excludes rows with `extraction_confidence < 0.5`
- prefers `affiliate_url` over `product_url`
- pre-computes `p_pct / c_pct / f_pct` from macros (not label kcal — see §5)

## Tests

```bash
cd backend
uv run pytest
```

Validator, family seed loader, and snapshot publisher are covered.

## Recipe estimator (optional)

The `+ Recipe` button supports manual entry out of the box (type kcal/P/C/F
totals). The "AI estimator" panel posts to `/api/recipe`, which calls
OpenAI from the FastAPI server. To enable it:

```bash
export OPENAI_API_KEY=sk-...
# optional:
# export OPENAI_MODEL=gpt-4o-mini
# export MT_RECIPE_LLM_PROVIDER=openai
uv run mt serve
```

Limits: 3 req/min/IP (in-memory, per process).

## CLI commands

| Command | Purpose |
|---|---|
| `mt init-db` | Create tables (use Alembic in production) |
| `mt families load [--path ...]` | Idempotent food-family seeding |
| `mt seed-demo` | Insert ~10 demo products |
| `mt snapshot --version N [--out ...]` | Write public-facing JSON snapshot |
| `mt serve [--host ... --port ...]` | Start the local FastAPI server |

Default snapshot output is `../frontend/data/`, override via `MT_SNAPSHOT_OUT_DIR`.

## Status vs. the spec

| Item | State |
|---|---|
| DB models + migration | ✅ |
| Validator + tests | ✅ |
| Family seed loader + starter seed | ✅ |
| Snapshot publish + tests | ✅ |
| Static frontend (vanilla JS + d3) | ✅ |
| Ternary plot, isolines, family fade, retailer color/shape | ✅ |
| Recipe modal (manual entry + optional LLM) | ✅ |
| Recipes persisted in URL hash | ✅ |
| Recipe LLM endpoint (OpenAI) | ✅ on FastAPI |
| Trader Joe's / Walmart / Costco scrapers | 🟡 protocol stubs only |
| VLM photo extractor | 🟡 Qwen-via-Ollama wrapper; review UI TBD |
| PNG export of recipes | ⏳ deferred |
| Public deploy (Netlify) | ⏳ deferred — local sandbox first |
