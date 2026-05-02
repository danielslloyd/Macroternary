// Recipe state lives in the URL hash so a link is shareable (spec §9).
//
// Two entry points:
//   openManualModal — type macro totals directly. No backend.
//   openAIModal     — pick a provider/model, then either upload a label image
//                     or paste freeform text. POSTs to /api/recipe/extract-label
//                     or /api/recipe.

import { calorieShares } from "./geometry.js";
import { loadApiKeys, loadOllamaModels, getModelsByProvider } from "./models.js";

// ─── URL-hash persistence ────────────────────────────────────────────────

function toBase64Url(s) {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s) {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (s.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function readRecipesFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const encoded = params.get("r");
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(fromBase64Url(encoded));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeRecipesToHash(recipes) {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (recipes.length) {
    params.set("r", toBase64Url(JSON.stringify(recipes)));
  } else {
    params.delete("r");
  }
  const next = params.toString();
  window.history.replaceState(
    null,
    "",
    next ? `#${next}` : window.location.pathname,
  );
}

// ─── Manual modal ────────────────────────────────────────────────────────

const MANUAL_TEMPLATE = `
<div data-modal class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
  <div data-modal-card class="bg-white rounded shadow-xl w-full max-w-md p-6 space-y-4" role="dialog" aria-modal="true">
    <h2 class="text-lg font-semibold">Manual entry</h2>
    <p class="text-xs text-gray-600">Type the totals you want plotted.</p>
    <input data-mt-title type="text" placeholder="Title (optional)"
           class="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
    <div class="grid grid-cols-4 gap-2">
      <label class="text-xs">kcal
        <input data-mt-kcal type="number" min="0" step="any" class="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
      </label>
      <label class="text-xs">P (g)
        <input data-mt-p type="number" min="0" step="any" class="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
      </label>
      <label class="text-xs">C (g)
        <input data-mt-c type="number" min="0" step="any" class="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
      </label>
      <label class="text-xs">F (g)
        <input data-mt-f type="number" min="0" step="any" class="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
      </label>
    </div>
    <p data-status class="text-xs text-red-700"></p>
    <div class="flex justify-end gap-2">
      <button data-action="close" type="button"
              class="px-3 py-1.5 text-sm border border-gray-300 rounded">
        Close
      </button>
      <button data-action="add-manual" type="button"
              class="px-3 py-1.5 text-sm bg-ink text-white rounded">
        Add to plot
      </button>
    </div>
  </div>
</div>`;

export function openManualModal({ onAdd }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = MANUAL_TEMPLATE;
  const overlay = root.querySelector("[data-modal]");
  const card = root.querySelector("[data-modal-card]");
  const close = () => (root.innerHTML = "");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  card.addEventListener("click", (e) => e.stopPropagation());

  const titleEl = card.querySelector("[data-mt-title]");
  const kcalEl = card.querySelector("[data-mt-kcal]");
  const pEl = card.querySelector("[data-mt-p]");
  const cEl = card.querySelector("[data-mt-c]");
  const fEl = card.querySelector("[data-mt-f]");
  const statusEl = card.querySelector("[data-status]");

  card.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "close") return close();
    if (action === "add-manual") {
      const kcal = parseFloat(kcalEl.value);
      const p = parseFloat(pEl.value);
      const c = parseFloat(cEl.value);
      const f = parseFloat(fEl.value);
      if (![kcal, p, c, f].every((n) => Number.isFinite(n) && n >= 0)) {
        statusEl.textContent = "Enter all four totals as numbers ≥ 0.";
        return;
      }
      const shares = calorieShares(p, c, f);
      onAdd({
        id: crypto.randomUUID(),
        title: titleEl.value.trim() || "Recipe",
        totals: { kcal, p, c, f },
        items: [],
        assumptions: [],
        confidence: "manual",
        ...shares,
      });
      close();
    }
  });

  titleEl.focus();
}

// ─── AI modal ────────────────────────────────────────────────────────────

const AI_TEMPLATE = `
<div data-modal class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
  <div data-modal-card class="bg-white rounded shadow-xl w-full max-w-lg p-6 space-y-4" role="dialog" aria-modal="true">
    <h2 class="text-lg font-semibold">AI estimator</h2>

    <div class="space-y-2">
      <p class="text-xs text-gray-600">Provider (gray = no key)</p>
      <div data-providers-list class="flex items-center gap-3 flex-wrap"></div>
    </div>

    <label class="text-xs block">
      Model
      <select data-model-select class="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm">
        <option>No models available</option>
      </select>
    </label>

    <input data-title type="text" placeholder="Title (optional)"
           class="w-full px-2 py-1 border border-gray-300 rounded text-sm" />

    <div class="border border-gray-200 rounded p-3 space-y-2">
      <h3 class="text-sm font-semibold">Image</h3>
      <p class="text-xs text-gray-600">Photo of a nutrition label. Requires a vision-capable model.</p>
      <input data-image type="file" accept="image/*" class="w-full text-xs" />
      <img data-image-preview class="hidden max-h-32 rounded" />
      <button data-action="extract-image" type="button"
              class="px-3 py-1.5 text-sm bg-ink text-white rounded disabled:opacity-50 disabled:cursor-not-allowed">
        Extract from image
      </button>
    </div>

    <div class="border border-gray-200 rounded p-3 space-y-2">
      <h3 class="text-sm font-semibold">Text</h3>
      <p class="text-xs text-gray-600">A single food (e.g. "1 banana") or a recipe.</p>
      <textarea data-text rows="3"
                placeholder='1 cup oats, 1 tbsp peanut butter, 1 banana&#10;or just "chicken breast 200g"'
                class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"></textarea>
      <button data-action="estimate-text" type="button"
              class="px-3 py-1.5 text-sm bg-ink text-white rounded">
        Estimate from text
      </button>
    </div>

    <p data-status class="text-xs text-gray-600 min-h-[1em]"></p>

    <div class="flex justify-end">
      <button data-action="close" type="button"
              class="px-3 py-1.5 text-sm border border-gray-300 rounded">
        Close
      </button>
    </div>
  </div>
</div>`;

export async function openAIModal({ onAdd }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = AI_TEMPLATE;
  const overlay = root.querySelector("[data-modal]");
  const card = root.querySelector("[data-modal-card]");
  const close = () => (root.innerHTML = "");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  card.addEventListener("click", (e) => e.stopPropagation());

  const providersList = card.querySelector("[data-providers-list]");
  const modelSelectEl = card.querySelector("[data-model-select]");
  const titleEl = card.querySelector("[data-title]");
  const imageEl = card.querySelector("[data-image]");
  const imagePreviewEl = card.querySelector("[data-image-preview]");
  const textEl = card.querySelector("[data-text]");
  const statusEl = card.querySelector("[data-status]");
  const extractBtn = card.querySelector('[data-action="extract-image"]');

  await Promise.all([loadApiKeys(), loadOllamaModels()]);
  const providers = getModelsByProvider();

  // Icon row.
  providers.forEach((p) => {
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col items-center gap-1";
    wrap.title = p.available
      ? `${p.label} (${p.capabilities.join("+")})`
      : `${p.label} — no key`;
    wrap.innerHTML = `
      <img src="${p.icon}" alt="${p.label}" class="w-8 h-8 rounded ${p.available ? "" : "grayscale opacity-40"}" />
      <span class="text-[10px] ${p.available ? "text-gray-700" : "text-gray-400"}">${p.label}</span>
    `;
    providersList.appendChild(wrap);
  });

  // Populate model selector with EVERY model from EVERY available provider.
  modelSelectEl.innerHTML = "";
  let added = 0;
  providers.forEach((p) => {
    if (!p.available) return;
    p.models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = `${p.provider}:${m.name}`;
      opt.dataset.capabilities = p.capabilities.join(",");
      const caps = p.capabilities.includes("image") ? "text+img" : "text";
      opt.textContent = `${p.label} – ${m.name} (${caps})`;
      modelSelectEl.appendChild(opt);
      added += 1;
    });
  });
  if (added === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No models available";
    modelSelectEl.appendChild(opt);
  } else {
    modelSelectEl.selectedIndex = 0;
  }

  function selectedSupportsImage() {
    const sel = modelSelectEl.options[modelSelectEl.selectedIndex];
    if (!sel || !sel.dataset.capabilities) return false;
    return sel.dataset.capabilities.split(",").includes("image");
  }

  function refreshExtractBtn() {
    extractBtn.disabled = !selectedSupportsImage();
    if (!selectedSupportsImage()) {
      extractBtn.title = "Selected model can't read images. Pick a vision model.";
    } else {
      extractBtn.title = "";
    }
  }
  modelSelectEl.addEventListener("change", refreshExtractBtn);
  refreshExtractBtn();

  imageEl.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      imagePreviewEl.src = event.target?.result;
      imagePreviewEl.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  card.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "close") return close();

    const modelValue = modelSelectEl.value;
    if (!modelValue || modelValue === "No models available") {
      statusEl.textContent = "No model selected.";
      return;
    }
    const [provider, model] = modelValue.split(":");

    if (action === "estimate-text") {
      const text = textEl.value.trim();
      if (!text) {
        statusEl.textContent = "Type a food or recipe first.";
        return;
      }
      statusEl.textContent = "Estimating…";
      try {
        const res = await fetch("/api/recipe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, provider, model }),
        });
        const data = await res.json();
        if (!res.ok) {
          statusEl.textContent =
            data.message || data.error || `Estimator failed (${res.status}).`;
          return;
        }
        if (data.error === "not_a_recipe") {
          statusEl.textContent =
            "That doesn't look like food. Try an ingredient or recipe.";
          return;
        }
        const t = data.totals;
        const shares = calorieShares(t.p, t.c, t.f);
        onAdd({
          id: crypto.randomUUID(),
          title:
            titleEl.value.trim() || data.items?.[0]?.ingredient || "Recipe",
          totals: t,
          items: data.items || [],
          assumptions: data.assumptions || [],
          confidence: data.confidence || "medium",
          ...shares,
        });
        close();
      } catch (err) {
        statusEl.textContent = `Network error: ${err.message}`;
      }
      return;
    }

    if (action === "extract-image") {
      const file = imageEl.files?.[0];
      if (!file) {
        statusEl.textContent = "Select an image first.";
        return;
      }
      if (!selectedSupportsImage()) {
        statusEl.textContent = "Selected model can't read images.";
        return;
      }
      statusEl.textContent = "Extracting…";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", provider);
      formData.append("model", model);
      try {
        const res = await fetch("/api/recipe/extract-label", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          statusEl.textContent =
            data.message || data.error || `Extraction failed (${res.status}).`;
          return;
        }
        if (data.error === "not_a_label") {
          statusEl.textContent =
            "That doesn't look like a nutrition label. Try a clearer image.";
          return;
        }
        const t = data.totals;
        const shares = calorieShares(t.p, t.c, t.f);
        onAdd({
          id: crypto.randomUUID(),
          title: titleEl.value.trim() || "Label",
          totals: t,
          items: data.items || [],
          assumptions: data.assumptions || [],
          confidence: data.confidence || "medium",
          ...shares,
        });
        close();
      } catch (err) {
        statusEl.textContent = `Network error: ${err.message}`;
      }
    }
  });
}
