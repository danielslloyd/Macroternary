"""Photo-of-label extractor protocol (§3, §6, §7).

The default implementation calls Qwen2.5-VL via Ollama. The interface is
intentionally narrow so it can be swapped (Llama 3.2 Vision, vLLM, hosted).
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from pydantic import BaseModel


class ExtractedLabel(BaseModel):
    name: str | None = None
    brand: str | None = None
    serving_size_g: float | None = None
    serving_size_label: str | None = None
    calories_per_serving: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    fiber_g: float | None = None
    sugar_g: float | None = None
    sat_fat_g: float | None = None
    sodium_mg: float | None = None
    confidence_notes: str | None = None
    raw: dict | None = None


class LabelExtractor(Protocol):
    name: str

    async def extract(self, image_path: Path) -> ExtractedLabel:
        ...
