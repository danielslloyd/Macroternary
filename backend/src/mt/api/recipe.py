"""Recipe macro estimator (spec §9).

For the local sandbox, the LLM call lives behind a FastAPI route on the
same server that serves the frontend. Supports multiple providers:
- OpenAI, Anthropic, Google, Grok

API keys are read from environment variables or api-keys.json in the frontend/data directory.
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ─── interface ────────────────────────────────────────────────────────────


class EstimatedItem(BaseModel):
    ingredient: str
    quantity_g: float | None = None
    kcal: float
    p: float
    c: float
    f: float


class EstimatedRecipe(BaseModel):
    items: list[EstimatedItem] = Field(default_factory=list)
    totals: dict[str, float] | None = None
    assumptions: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"
    error: str | None = None


class RecipeEstimator(Protocol):
    name: str

    async def estimate(self, text: str) -> EstimatedRecipe:
        ...


# ─── OpenAI implementation ────────────────────────────────────────────────

SYSTEM_PROMPT = """You estimate the macronutrients of a freeform recipe.
Return STRICT JSON only, matching this schema:
{
  "items": [{"ingredient": str, "quantity_g": number?, "kcal": number, "p": number, "c": number, "f": number}, ...],
  "totals": {"kcal": number, "p": number, "c": number, "f": number},
  "assumptions": [str, ...],
  "confidence": "high" | "medium" | "low"
}
- Use grams for quantity_g whenever possible.
- p, c, f are grams of protein/carbs/fat per item; kcal is total per item.
- Note any unit/variety guess (e.g. 'assumed rolled oats, dry weight') in 'assumptions'.
- If the input is not a recipe (greeting, single non-food word), return {"error": "not_a_recipe"} only.
- Macros must roughly satisfy 4P + 4C + 9F ≈ kcal per item.
"""


class OpenAIEstimator:
    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self.api_key = api_key
        self.model = model
        self.name = f"openai_{model}"

    async def estimate(self, text: str) -> EstimatedRecipe:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Recipe:\n{text}\n\nRespond with strict JSON."},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"authorization": f"Bearer {self.api_key}"},
                json=body,
            )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return EstimatedRecipe.model_validate(json.loads(content))


class AnthropicEstimator:
    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022") -> None:
        self.api_key = api_key
        self.model = model
        self.name = f"anthropic_{model}"

    async def estimate(self, text: str) -> EstimatedRecipe:
        body = {
            "model": self.model,
            "max_tokens": 2048,
            "system": SYSTEM_PROMPT,
            "messages": [
                {"role": "user", "content": f"Recipe:\n{text}\n\nRespond with strict JSON."},
            ],
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "authorization": f"Bearer {self.api_key}",
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            )
        resp.raise_for_status()
        content = resp.json()["content"][0]["text"]
        return EstimatedRecipe.model_validate(json.loads(content))


class GoogleEstimator:
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash") -> None:
        self.api_key = api_key
        self.model = model
        self.name = f"google_{model}"

    async def estimate(self, text: str) -> EstimatedRecipe:
        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": SYSTEM_PROMPT},
                        {"text": f"Recipe:\n{text}\n\nRespond with strict JSON."},
                    ],
                }
            ],
            "generationConfig": {"temperature": 0.1},
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}",
                json=body,
            )
        resp.raise_for_status()
        content = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return EstimatedRecipe.model_validate(json.loads(content))


class OllamaEstimator:
    def __init__(self, base_url: str = "http://127.0.0.1:11434", model: str = "mistral") -> None:
        self.base_url = base_url
        self.model = model
        self.name = f"ollama_{model}"

    async def estimate(self, text: str) -> EstimatedRecipe:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Recipe:\n{text}\n\nRespond with strict JSON."},
            ],
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/api/chat",
                json=body,
            )
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        return EstimatedRecipe.model_validate(json.loads(content))


class GrokEstimator:
    def __init__(self, api_key: str, model: str = "grok-3") -> None:
        self.api_key = api_key
        self.model = model
        self.name = f"grok_{model}"

    async def estimate(self, text: str) -> EstimatedRecipe:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Recipe:\n{text}\n\nRespond with strict JSON."},
            ],
            "temperature": 0.1,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.x.ai/v1/chat/completions",
                headers={"authorization": f"Bearer {self.api_key}"},
                json=body,
            )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return EstimatedRecipe.model_validate(json.loads(content))


def _load_api_keys() -> dict[str, str]:
    """Load API keys from api-keys.json or environment variables."""
    keys = {}

    # Try to load from api-keys.json first
    api_keys_path = Path(__file__).resolve().parents[4] / "frontend" / "data" / "api-keys.json"
    print(f"\n=== LOADING API KEYS ===")
    print(f"Looking for api-keys.json at: {api_keys_path}")
    print(f"File exists: {api_keys_path.exists()}")
    logger.info(f"Looking for api-keys.json at: {api_keys_path}")

    if api_keys_path.exists():
        try:
            print(f"Reading file...")
            with open(api_keys_path, 'r') as f:
                content = f.read()
                print(f"Raw file content: {content}")
                keys = json.loads(content)
            print(f"Parsed keys: {keys}")
            print(f"Keys with non-empty values: {[(k, v) for k, v in keys.items() if v]}")
            logger.info(f"Loaded API keys from {api_keys_path}: {list(keys.keys())}")
            # Filter out empty strings
            keys = {k: v for k, v in keys.items() if v and v.strip()}
            print(f"Final filtered keys: {list(keys.keys())}")
        except Exception as e:
            print(f"ERROR loading api-keys.json: {e}")
            logger.error(f"Failed to load api-keys.json: {e}", exc_info=True)
    else:
        print(f"api-keys.json not found at {api_keys_path}")
        logger.warning(f"api-keys.json not found at {api_keys_path}")

    # Also check environment variables (they override api-keys.json)
    print(f"Checking environment variables...")
    for provider in ["openai", "anthropic", "google", "grok"]:
        env_var = f"{provider.upper()}_API_KEY"
        env_key = os.getenv(env_var)
        if env_key:
            print(f"  {env_var}: {env_key[:20]}...")
            keys[provider] = env_key
            logger.info(f"Loaded {provider} key from environment variable {env_var}")
        else:
            print(f"  {env_var}: NOT SET")

    print(f"Final API keys available: {list(keys.keys())}")
    print(f"=== END LOADING API KEYS ===\n")
    logger.info(f"Final API keys available: {list(keys.keys())}")
    return keys


_API_KEYS_CACHE = None


def get_api_keys() -> dict[str, str]:
    """Get cached API keys."""
    global _API_KEYS_CACHE
    if _API_KEYS_CACHE is None:
        _API_KEYS_CACHE = _load_api_keys()
    return _API_KEYS_CACHE


def get_estimator(provider: str | None = None, model: str | None = None) -> RecipeEstimator | None:
    """Return the configured estimator for a provider, or None if no key is set."""
    keys = get_api_keys()
    logger.info(f"get_estimator called: provider={provider}, model={model}")

    if provider == "openai":
        api_key = keys.get("openai")
        if not api_key:
            logger.warning("OpenAI key not found")
            return None
        logger.info(f"Using OpenAI with model {model or 'gpt-4o-mini'}")
        return OpenAIEstimator(api_key, model or "gpt-4o-mini")
    elif provider == "anthropic":
        api_key = keys.get("anthropic")
        if not api_key:
            logger.warning("Anthropic key not found")
            return None
        logger.info(f"Using Anthropic with model {model or 'claude-3-5-sonnet-20241022'}")
        return AnthropicEstimator(api_key, model or "claude-3-5-sonnet-20241022")
    elif provider == "google":
        api_key = keys.get("google")
        if not api_key:
            logger.warning("Google key not found")
            return None
        logger.info(f"Using Google with model {model or 'gemini-2.0-flash'}")
        return GoogleEstimator(api_key, model or "gemini-2.0-flash")
    elif provider == "grok":
        api_key = keys.get("grok")
        if not api_key:
            logger.warning("Grok key not found")
            return None
        logger.info(f"Using Grok with model {model or 'grok-3'}")
        return GrokEstimator(api_key, model or "grok-3")
    elif provider == "ollama":
        # Ollama runs locally, no API key needed
        logger.info(f"Using Ollama with model {model or 'mistral'}")
        return OllamaEstimator(model=model or "mistral")
    else:
        # Fallback: try providers in order, then Ollama
        logger.info(f"No provider specified, trying providers in order: {list(keys.keys())}")
        for p in ["openai", "anthropic", "google", "grok"]:
            if p in keys:
                est = get_estimator(p, model)
                if est:
                    logger.info(f"Using fallback provider: {p}")
                    return est

        # Try Ollama as last resort
        logger.info("Trying Ollama as fallback...")
        try:
            est = OllamaEstimator(model=model or "mistral")
            logger.info("Ollama available")
            return est
        except Exception as e:
            logger.error(f"Ollama not available: {e}")

        logger.error("No API keys or local LLM configured")
        return None


# ─── sanity check ─────────────────────────────────────────────────────────


def sanity_check(recipe: EstimatedRecipe) -> str | None:
    """Spec §9: catch obvious LLM hallucinations server-side."""
    t = recipe.totals
    if not t:
        return "missing totals"
    kcal = t.get("kcal", 0)
    if kcal <= 0:
        return "non-positive kcal"
    computed = 4 * t.get("p", 0) + 4 * t.get("c", 0) + 9 * t.get("f", 0)
    gap = abs(computed - kcal) / max(kcal, 1)
    if gap > 0.20:
        return f"macros inconsistent with kcal (off by {round(gap * 100)}%)"
    if t.get("p", 0) > kcal / 4 + 1:
        return "implausible protein:kcal ratio"
    return None


# ─── per-IP rate limiting (in-memory; per-process) ────────────────────────
# Disabled for development; set _RPM to a low number to re-enable

_RPM = 1000  # Effectively disabled; set to 3 for production
_buckets: dict[str, dict[str, float]] = {}


def rate_limit_ok(ip: str) -> bool:
    now = time.time()
    bucket = _buckets.get(ip)
    if not bucket or bucket["reset_at"] < now:
        _buckets[ip] = {"count": 1, "reset_at": now + 60}
        logger.info(f"Rate limit reset for {ip}")
        return True
    if bucket["count"] >= _RPM:
        logger.warning(f"Rate limit exceeded for {ip} ({bucket['count']}/{_RPM} requests)")
        return False
    bucket["count"] += 1
    logger.debug(f"Rate limit OK for {ip} ({bucket['count']}/{_RPM} requests)")
    return True
