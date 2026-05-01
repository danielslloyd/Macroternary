"""Recipe macro estimator (spec §9).

For the local sandbox, the LLM call lives behind a FastAPI route on the
same server that serves the frontend. v1 ships with OpenAI gpt-4o-mini;
add a sibling implementation and key off `MT_RECIPE_LLM_PROVIDER` to swap.

If `OPENAI_API_KEY` isn't set, the endpoint returns 503 so the frontend
can fall back to manual entry.
"""
from __future__ import annotations

import json
import os
import time
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, Field

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


def get_estimator(provider: str | None = None, model: str | None = None) -> RecipeEstimator | None:
    """Return the configured estimator for a provider, or None if no key is set."""
    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        return OpenAIEstimator(api_key, model or "gpt-4o-mini")
    elif provider == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return None
        return AnthropicEstimator(api_key, model or "claude-3-5-sonnet-20241022")
    elif provider == "google":
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return None
        return GoogleEstimator(api_key, model or "gemini-2.0-flash")
    elif provider == "grok":
        api_key = os.getenv("GROK_API_KEY")
        if not api_key:
            return None
        return GrokEstimator(api_key, model or "grok-3")
    else:
        # Fallback: try providers in order of preference
        for p in ["openai", "anthropic", "google", "grok"]:
            est = get_estimator(p, model)
            if est:
                return est
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

_RPM = 3
_buckets: dict[str, dict[str, float]] = {}


def rate_limit_ok(ip: str) -> bool:
    now = time.time()
    bucket = _buckets.get(ip)
    if not bucket or bucket["reset_at"] < now:
        _buckets[ip] = {"count": 1, "reset_at": now + 60}
        return True
    if bucket["count"] >= _RPM:
        return False
    bucket["count"] += 1
    return True
