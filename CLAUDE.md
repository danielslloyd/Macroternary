# Macro Ternary – Development Guide

## Project Overview

Macro Ternary is a nutrition/macronutrient visualization tool with AI-powered recipe estimation. Users can:
- Plot foods on a ternary diagram by protein/carb/fat ratios
- Manually enter macros or use AI to extract them from food text or nutrition label images
- Support multiple LLM providers: Anthropic, OpenAI, Google, Grok, and NVIDIA NIM

## Architecture

### Frontend (`frontend/`)
- Plain HTML/JS/CSS (no framework) served from FastAPI static mount
- **index.html**: Entry point with Tailwind CSS (CDN) + custom styles.css
- **js/main.js**: State management and rendering orchestration
- **js/recipe.js**: AI modal UI and recipe state (URL-hash persistence)
- **js/models.js**: LLM provider config and API key management
- **js/filters.js**: Sidebar (search, retailer toggles, family dropdown)
- **js/ternary.js**: Ternary diagram rendering (D3)
- **js/theme.js**: Tunable visual parameters for the plot (colors, sizes, grid, tints) + localStorage persistence and color-mixing helpers
- **js/controls.js**: Live "Style & export" panel bound to the theme
- **js/export.js**: Standalone SVG / PNG export of the chart
- **js/detail.js**: Right sidebar (selected product details)
- **data/**: Served statically; contains families, products, meta. **api-keys.json is gitignored** (sensitive data)

### Backend (`backend/src/mt/api/`)
- FastAPI server on 127.0.0.1:8000
- **app.py**: Routes, static file serving, CORS middleware
- **recipe.py**: LLM estimator implementations (OpenAI, Anthropic, Google, Grok, NIM)
- Supports both local `api-keys.json` (preferred) and environment variables for API keys

## API Key Management

### File-based (Preferred)
- **Location**: `frontend/data/api-keys.json` (git-ignored)
- **Format**:
  ```json
  {
    "anthropic": "sk-ant-...",
    "openai": "sk-...",
    "google": "AQ.Ab8RN6LZ2-...",
    "grok": "xai-...",
    "nim": "nvapi-..."
  }
  ```
- Empty strings are filtered out by the backend

### Environment-based
- Set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GROK_API_KEY`, `NIM_API_KEY`
- These override values from the JSON file

### Important: Server Caching
- **Backend caches API keys in memory** (`_API_KEYS_CACHE` in recipe.py)
- The cache now **automatically reloads** when `api-keys.json` is modified (by checking file mtime)
- **Frontend fetches** `/api/api-keys` with `cache: "no-cache"` to bypass browser caching
- Changes to `api-keys.json` are picked up without restarting the server

## LLM Providers & Models

### Provider Configuration (`frontend/js/models.js`)
Each provider has:
- `label`: Display name
- `icon`: SVG path in `/icons/`
- `models`: Array of model IDs
- `capabilities`: ["text"] or ["text", "image"]
- `bgColor`: Hex color for lit state in provider selector
- `alwaysAvailable` (Ollama only): Doesn't require API key

### NVIDIA NIM - Critical Detail
- **Model names MUST have `nvidia/` prefix**: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
- Without the prefix, the API returns 404
- Default fallback: `nvidia/meta-llama-3.1-405b-instruct`

### Provider Availability Logic
- A provider is "lit" (colored in UI) if:
  - Ollama: always (local, no API key needed)
  - Others: if `apiKeys[provider]` exists and is non-empty after trim

## UI Components

### AI Modal (`recipe.js: openAIModal()`)
- **Provider selector**: Rounded squares (w-10 h-10 rounded border-2)
  - **Lit state**: Border = bgColor, background = bgColor (opaque)
  - **Unlit state**: Border = gray-300 (#d1d5db), background = transparent, icon masked to gray
- **Model dropdown**: Populated only with models from available providers
- **Image extraction**: Requires vision-capable model (flagged in capability array)
- **Text estimation**: Works with any model

### Styling Notes
- Lit provider squares now have background color (not just border)
- Unlit gray is gray-300 (#d1d5db) for better visibility against paper background
- Tailwind via CDN with custom theme colors (ink: #1a1a1a, paper: #fafaf7)

## Common Issues & Solutions

### Issue: NIM Provider Greyed Out
**Cause**: API key missing or empty in `api-keys.json`
**Solution**: 
1. Add NIM key to `frontend/data/api-keys.json`
2. Reload the page (no server restart needed due to auto-reload cache)
3. Check browser console: `[loadApiKeys]` logs will show available keys

### Issue: Changes Not Appearing After Reload
**Cause**: Browser or server caching
**Solution**:
- Browser: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Server API keys: Changes to api-keys.json are auto-detected; just reload browser
- No server restart needed for API key changes

### Issue: NIM API Returns 404
**Cause**: Model name missing `nvidia/` prefix
**Solution**: Ensure model names in `models.js` use format: `nvidia/model-name-here`

### Issue: Model Dropdown Empty
**Cause**: No providers have available API keys
**Solution**: Add at least one API key to `api-keys.json` or set environment variable

## Debugging Tips

### Frontend Console Logs
- `[loadApiKeys]`: Shows API key fetch attempt, response status, loaded keys
- `[hasKey]`: Shows per-provider key check results (provider, exists, length, result)
- Check Network tab: `/api/api-keys` should return provider availability

### Backend Logs
- `[get_estimator]`: Shows which provider/model is being used
- `Loading API keys from`: File path and loaded providers
- `Final API keys available`: List of providers with non-empty keys

### Quick Test: Manual vs AI Modal
- **Manual mode** (+ Manual button): Works offline, no API keys needed
- **AI mode** (+ AI button): Requires at least one API key configured

## Ternary Plot Styling & Export

The plot's appearance is fully data-driven by a `theme` object (`js/theme.js`).
`renderTernary` only reads values — it never hard-codes look — so every visual
parameter is tunable.

- **Live controls**: the "⚙ Style & export" panel (`js/controls.js`) sits beside
  the chart. It's schema-driven: add a row to the `SCHEMA` array to expose a new
  theme key (supports `range`, `checkbox`, `color`, `select`). Dotted keys like
  `macroColors.protein` are supported.
- **Persistence**: choices are saved to `localStorage` (`mt.theme.v1`) and
  restored on load. "Reset" clears them back to `DEFAULT_THEME`.
- **Point colouring** (`colorMode`): `"macro"` blends the three corner colours by
  each food's P/C/F share (foods with zero macros fall back to neutral grey);
  `"retailer"` uses a fixed colour per retailer.
- **Layers**: the SVG is built once as a fixed stack of `<g class="layer …">`
  groups (bg → tints → grid → isolines → outline → ticks → halo → points →
  recipes → labels → legend) so z-order is stable across re-renders.
- **Export** (`js/export.js`): `exportSVG` clones the `<svg>`, stamps explicit
  size + namespaces + a font `<style>`, and downloads a self-contained file
  (all colours/sizes are already inline attributes). `exportPNG` rasterises that
  SVG through an offscreen canvas at 2×.

## Development Workflow

1. **Update API keys**: Edit `frontend/data/api-keys.json`, save, reload browser
2. **Modify frontend**: Changes to `js/` files picked up on reload (no restart needed)
3. **Modify backend**: Restart the server (`start-server.bat`)
4. **Debug API keys**: Open browser console and check `[loadApiKeys]` and `[hasKey]` logs

## File Structure Reference

```
frontend/
├── index.html          # Entry point, Tailwind + custom CSS
├── styles.css          # Custom styles (ternary chart, etc.)
├── js/
│   ├── main.js         # State & render orchestration
│   ├── recipe.js       # AI modal, manual modal
│   ├── models.js       # Provider/model config, API key loading
│   ├── filters.js      # Sidebar filters
│   ├── ternary.js      # D3 ternary chart
│   ├── detail.js       # Right sidebar
│   ├── data.js         # Snapshot loading
│   ├── geometry.js     # Calorie share math
│   └── isolines.js     # Ternary isolines
├── data/               # Static JSON (families, products, meta)
│   └── api-keys.json   # (gitignored, add manually)
└── icons/              # Provider SVGs

backend/
├── src/mt/api/
│   ├── app.py          # FastAPI routes, static serving
│   ├── recipe.py       # Estimator implementations, API key cache
│   └── __init__.py
├── src/mt/db/          # SQLAlchemy models
└── tests/
```

## Key Dependencies

- **Frontend**: Tailwind CSS (CDN), D3 (CDN via importmap)
- **Backend**: FastAPI, Pydantic, httpx (async HTTP), SQLAlchemy
- **LLM SDKs**: openai, anthropic, google-generativeai (loaded on demand)
