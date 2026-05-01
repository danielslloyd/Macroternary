// Models configuration by provider, with colors based on API key availability.

const PROVIDER_CONFIGS = {
  anthropic: {
    label: "Anthropic",
    models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20250219", "claude-3-haiku-20240307"],
    colorWithKey: "#d97706",
    colorWithoutKey: "#fed7aa",
  },
  openai: {
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    colorWithKey: "#059669",
    colorWithoutKey: "#d1fae5",
  },
  grok: {
    label: "Grok",
    models: ["grok-3"],
    colorWithKey: "#8b5cf6",
    colorWithoutKey: "#e9d5ff",
  },
  google: {
    label: "Google",
    models: ["gemini-2.0-flash", "gemini-1.5-pro"],
    colorWithKey: "#0891b2",
    colorWithoutKey: "#cffafe",
  },
};

let apiKeys = {};

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

function hasKey(provider) {
  return !!(apiKeys[provider] && apiKeys[provider].trim());
}

export function getModelsByProvider() {
  return Object.entries(PROVIDER_CONFIGS).map(([provider, config]) => {
    const hasApiKey = hasKey(provider);
    return {
      provider,
      label: config.label,
      color: hasApiKey ? config.colorWithKey : config.colorWithoutKey,
      available: hasApiKey,
      models: config.models.map((model) => ({
        name: model,
        provider,
      })),
    };
  });
}

export function getAvailableModels() {
  return Object.entries(PROVIDER_CONFIGS)
    .filter(([provider]) => hasKey(provider))
    .flatMap(([provider, config]) =>
      config.models.map((model) => ({
        name: model,
        provider,
        label: `${config.label} – ${model}`,
      }))
    );
}
