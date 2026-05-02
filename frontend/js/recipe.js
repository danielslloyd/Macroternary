// Recipe state: lives in the URL hash so a link is shareable (spec §9).
//
// Two ways to add a recipe in the local sandbox:
//   1. Manual entry — type totals directly. Always works, no backend required.
//   2. AI estimator — POST freeform text to /api/recipe; the FastAPI server
//      forwards to OpenAI (requires OPENAI_API_KEY) and returns macros.

import { calorieShares } from "./geometry.js";
import { loadApiKeys, getModelsByProvider } from "./models.js";

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

// ─── Modal ───────────────────────────────────────────────────────────────

const MODAL_TEMPLATE = `
<div data-modal class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
  <div data-modal-card class="bg-white rounded shadow-xl w-full max-w-lg p-6 space-y-4" role="dialog" aria-modal="true">
    <h2 class="text-lg font-semibold">Add a recipe</h2>

    <div class="border border-gray-200 rounded p-3 space-y-3">
      <h3 class="text-sm font-semibold">Upload nutrition label</h3>
      <p class="text-xs text-gray-600">Take a photo of a nutrition facts label and we'll extract the macros.</p>
      <input data-label-image type="file" accept="image/*" class="w-full text-xs" />
      <img data-label-preview class="hidden max-h-40 rounded" />
      <label class="text-xs">
        Model
        <select data-label-model class="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm">
          <option>No models available</option>
        </select>
      </label>
      <button data-action="extract-label" type="button"
              class="px-3 py-1.5 text-sm bg-ink text-white rounded">
        Extract macros from label
      </button>
      <p data-label-status class="text-xs text-gray-500"></p>
    </div>

    <div class="border border-gray-200 rounded p-3 space-y-3">
      <h3 class="text-sm font-semibold">Manual entry</h3>
      <p class="text-xs text-gray-600">Type the totals you want plotted. Always works offline.</p>
      <input data-mt-title type="text" placeholder="Recipe title (optional)"
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
      <button data-action="add-manual" type="button"
              class="px-3 py-1.5 text-sm bg-ink text-white rounded">
        Add to plot
      </button>
    </div>

    <div class="border border-gray-200 rounded p-3 space-y-3">
      <h3 class="text-sm font-semibold">AI estimator <span class="text-xs font-normal text-gray-500">(optional)</span></h3>
      <p class="text-xs text-gray-600">
        Paste a freeform recipe; the local backend forwards to your configured LLM.
      </p>

      <div data-providers-list class="space-y-2"></div>

      <div class="hidden" data-no-keys-msg>
        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          No API keys configured. Add them to <code class="font-mono text-xs">frontend/data/api-keys.json</code>
          and reload the page.
        </p>
      </div>

      <label class="text-xs">
        Model
        <select data-model-select class="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm">
          <option>No models available</option>
        </select>
      </label>

      <textarea data-llm-text rows="3"
                placeholder="1 cup oats, 1 tbsp peanut butter, 1 scoop whey, 1 banana"
                class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"></textarea>
      <button data-action="estimate" type="button"
              class="px-3 py-1.5 text-sm border border-gray-300 rounded">
        Estimate macros
      </button>
      <p data-llm-status class="text-xs text-gray-500"></p>
    </div>

    <div class="flex justify-end">
      <button data-action="close" type="button"
              class="px-3 py-1.5 text-sm border border-gray-300 rounded">
        Close
      </button>
    </div>
  </div>
</div>`;

export async function openRecipeModal({ onAdd }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = MODAL_TEMPLATE;

  const overlay = root.querySelector("[data-modal]");
  const card = root.querySelector("[data-modal-card]");

  const close = () => (root.innerHTML = "");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  card.addEventListener("click", (e) => e.stopPropagation());

  // Load API keys and populate provider list
  await loadApiKeys();
  const providers = getModelsByProvider();
  const providersList = card.querySelector("[data-providers-list]");
  const noKeysMsg = card.querySelector("[data-no-keys-msg]");

  if (providers.some((p) => p.available)) {
    providers.forEach((provider) => {
      const providerEl = document.createElement("div");
      providerEl.className = `px-2 py-1.5 rounded ${provider.available ? "" : "opacity-50"}`;
      providerEl.style.backgroundColor = provider.color;
      providerEl.innerHTML = `
        <div class="text-xs font-semibold">${provider.label}</div>
        <div class="text-xs text-gray-700">
          ${provider.models.map((m) => m.name).join(", ")}
          ${!provider.available ? "<span class='text-xs text-gray-500'> (no key)</span>" : ""}
        </div>
      `;
      providersList.appendChild(providerEl);
    });
  } else {
    noKeysMsg.classList.remove("hidden");
  }

  const titleEl = card.querySelector("[data-mt-title]");
  const kcalEl = card.querySelector("[data-mt-kcal]");
  const pEl = card.querySelector("[data-mt-p]");
  const cEl = card.querySelector("[data-mt-c]");
  const fEl = card.querySelector("[data-mt-f]");
  const llmTextEl = card.querySelector("[data-llm-text]");
  const llmStatusEl = card.querySelector("[data-llm-status]");
  const modelSelectEl = card.querySelector("[data-model-select]");
  const labelImageEl = card.querySelector("[data-label-image]");
  const labelPreviewEl = card.querySelector("[data-label-preview]");
  const labelModelEl = card.querySelector("[data-label-model]");
  const labelStatusEl = card.querySelector("[data-label-status]");

  // Populate model selector with available models
  const availableModels = [];
  providers.forEach((provider) => {
    if (provider.available) {
      provider.models.forEach((model) => {
        const option = document.createElement("option");
        option.value = `${provider.provider}:${model.name}`;
        option.textContent = `${provider.label} – ${model.name}`;
        modelSelectEl.appendChild(option);
      });
    }
  });

  // Pre-select first available model
  if (modelSelectEl.children.length > 0) {
    modelSelectEl.selectedIndex = 0;
  }

  // Populate label model selector with vision-capable models only
  const visionProviders = ["openai", "google", "anthropic"];
  providers.forEach((provider) => {
    if (provider.available && visionProviders.includes(provider.provider)) {
      provider.models.forEach((model) => {
        const option = document.createElement("option");
        option.value = `${provider.provider}:${model.name}`;
        option.textContent = `${provider.label} – ${model.name}`;
        labelModelEl.appendChild(option);
      });
    }
  });

  // Image preview
  labelImageEl.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        labelPreviewEl.src = event.target?.result;
        labelPreviewEl.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    }
  });

  card.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "close") return close();

    if (action === "add-manual") {
      const kcal = parseFloat(kcalEl.value);
      const p = parseFloat(pEl.value);
      const c = parseFloat(cEl.value);
      const f = parseFloat(fEl.value);
      if (![kcal, p, c, f].every((n) => Number.isFinite(n) && n >= 0)) {
        llmStatusEl.textContent = "Enter all four totals as numbers ≥ 0.";
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
      return;
    }

    if (action === "estimate") {
      const text = llmTextEl.value.trim();
      if (!text) {
        llmStatusEl.textContent = "Type a few ingredients first.";
        return;
      }

      const modelValue = modelSelectEl.value;
      if (!modelValue || modelValue === "No models available") {
        llmStatusEl.textContent = "No model selected.";
        return;
      }

      llmStatusEl.textContent = "Estimating…";
      const [provider, model] = modelValue.split(":");
      try {
        const res = await fetch("/api/recipe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, provider, model }),
        });
        const data = await res.json();
        if (!res.ok) {
          llmStatusEl.textContent =
            data.message || data.error || `Estimator failed (${res.status}).`;
          return;
        }
        if (data.error === "not_a_recipe") {
          llmStatusEl.textContent =
            "That doesn't look like a recipe. Try listing ingredients with quantities.";
          return;
        }
        const t = data.totals;
        const shares = calorieShares(t.p, t.c, t.f);
        onAdd({
          id: crypto.randomUUID(),
          title:
            titleEl.value.trim() ||
            data.items?.[0]?.ingredient ||
            "Recipe",
          totals: t,
          items: data.items || [],
          assumptions: data.assumptions || [],
          confidence: data.confidence || "medium",
          ...shares,
        });
        close();
      } catch (err) {
        llmStatusEl.textContent = `Network error: ${err.message}`;
      }
    }

    if (action === "extract-label") {
      const file = labelImageEl.files?.[0];
      if (!file) {
        labelStatusEl.textContent = "Select an image first.";
        return;
      }

      const modelValue = labelModelEl.value;
      if (!modelValue || modelValue === "No models available") {
        labelStatusEl.textContent = "No model selected.";
        return;
      }

      labelStatusEl.textContent = "Extracting…";
      const [provider, model] = modelValue.split(":");
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
          labelStatusEl.textContent =
            data.message || data.error || `Extraction failed (${res.status}).`;
          return;
        }
        if (data.error === "not_a_label") {
          labelStatusEl.textContent =
            "That doesn't look like a nutrition label. Try a clearer image.";
          return;
        }
        const t = data.totals;
        const shares = calorieShares(t.p, t.c, t.f);
        onAdd({
          id: crypto.randomUUID(),
          title: titleEl.value.trim() || "Label",
          totals: t,
          items: [],
          assumptions: data.assumptions || [],
          confidence: data.confidence || "medium",
          ...shares,
        });
        close();
      } catch (err) {
        labelStatusEl.textContent = `Network error: ${err.message}`;
      }
    }
  });

  // Focus the first input.
  titleEl.focus();
}
