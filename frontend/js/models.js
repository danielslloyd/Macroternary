// Models configuration by provider.
// Icon path + capability metadata + key availability.

const PROVIDER_CONFIGS = {
  anthropic: {
    label: "Anthropic",
    icon: "/icons/anthropic.svg",
    models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20250219", "claude-3-haiku-20240307"],
    capabilities: ["text", "image"],
    bgColor: "#d97706",
  },
  openai: {
    label: "OpenAI",
    icon: "/icons/openai.svg",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    capabilities: ["text", "image"],
    bgColor: "#059669",
  },
  grok: {
    label: "Grok",
    icon: "/icons/grok.svg",
    models: ["grok-3"],
    capabilities: ["text"],
    bgColor: "#8b5cf6",
  },
  google: {
    label: "Google",
    icon: "/icons/google.svg",
    models: ["gemini-2.0-flash", "gemini-1.5-pro"],
    capabilities: ["text", "image"],
    bgColor: "#0891b2",
  },
  ollama: {
    label: "Ollama",
    icon: "/icons/ollama.svg",
    models: [],
    capabilities: ["text"],
    alwaysAvailable: true,
    dynamic: true,
    bgColor: "#000000",
  },
  nim: {
    label: "NVIDIA NIM",
    icon: "/icons/nim.svg",
    models: [
      "nemotron-3-nano-omni-30b-a3b-reasoning",
      "paligemma",
    ],
    capabilities: ["text", "image"],
    bgColor: "#76b900",
  },
};

let apiKeys = {};
let ollamaModels = [];

export async function loadApiKeys() {
  try {
    const res = await fetch("/data/api-keys.json");
    if (res.ok) {
      apiKeys = await res.json();
    }
  } catch (err) {
    console.warn("Could not load API keys:", err.message);
  }
}

export async function loadOllamaModels() {
  try {
    const res = await fetch("/api/ollama/tags");
    if (res.ok) {
      const data = await res.json();
      // data.models is now [{name, vision}, ...]
      ollamaModels = Array.isArray(data.models) ? data.models : [];
    } else {
      ollamaModels = [];
    }
  } catch (err) {
    console.warn("Could not load Ollama tags:", err.message);
    ollamaModels = [];
  }
  // Always include a default model option for Ollama
  if (ollamaModels.length === 0) {
    ollamaModels = ["mistral"];
  }
  PROVIDER_CONFIGS.ollama.models = ollamaModels;
}

function hasKey(provider) {
  return !!(apiKeys[provider] && apiKeys[provider].trim());
}

function isAvailable(provider) {
  const cfg = PROVIDER_CONFIGS[provider];
  if (!cfg) return false;
  // Ollama is local — always "lit" regardless of whether models are pulled
  // or the daemon is up. The model dropdown will simply be empty if not.
  if (cfg.alwaysAvailable) return true;
  if (cfg.alwaysAvailable) {
    // Ollama is always available (no API key required)
    return true;
  }
  return hasKey(provider);
}

export function getModelsByProvider() {
  return Object.entries(PROVIDER_CONFIGS).map(([provider, config]) => ({
    provider,
    label: config.label,
    icon: config.icon,
    capabilities: config.capabilities,
    available: isAvailable(provider),
    models: config.models.map((m) => {
      // m can be a string (openai, anthropic, etc.) or an object (ollama: {name, vision})
      const name = typeof m === "string" ? m : m.name;
      const capabilities =
        provider === "ollama" && typeof m === "object" && m.vision
          ? ["text", "image"]
          : config.capabilities;
      return {
        name,
        provider,
        capabilities,
      };
    }),
  }));
}

export function getAvailableModels({ requireImage = false } = {}) {
  return Object.entries(PROVIDER_CONFIGS)
    .filter(([provider, cfg]) => {
      if (!isAvailable(provider)) return false;
      if (requireImage && !cfg.capabilities.includes("image")) return false;
      return true;
    })
    .flatMap(([provider, config]) =>
      config.models.map((model) => ({
        name: model,
        provider,
        label: `${config.label} – ${model}`,
        capabilities: config.capabilities,
      }))
    );
}
