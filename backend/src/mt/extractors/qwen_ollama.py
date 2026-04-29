"""Qwen2.5-VL extractor via Ollama.

Requires the optional `vlm` extra (`uv pip install -e .[vlm]`) and a local
Ollama with `qwen2.5vl:7b` pulled. Kept thin so the prompt is the only thing
to iterate on.
"""
from __future__ import annotations

import json
from pathlib import Path

from mt.config import settings
from mt.extractors.base import ExtractedLabel

PROMPT = """You are reading a US Nutrition Facts label from a single product photo.
Return STRICT JSON with these keys (use null for unknowns, no prose):
{
  "name": str|null,
  "brand": str|null,
  "serving_size_g": number|null,
  "serving_size_label": str|null,
  "calories_per_serving": number|null,
  "protein_g": number|null,
  "carbs_g": number|null,
  "fat_g": number|null,
  "fiber_g": number|null,
  "sugar_g": number|null,
  "sat_fat_g": number|null,
  "sodium_mg": number|null,
  "confidence_notes": str|null
}
Use 'Total Carbohydrate' for carbs_g and 'Total Fat' for fat_g.
If serving size is given as a count + grams (e.g. '1 bar (40 g)'), put 40 in serving_size_g
and the verbatim string in serving_size_label.
Do not invent values; null is correct when unsure.
"""


class QwenOllamaExtractor:
    name = "qwen_ollama"

    def __init__(self, model: str | None = None, host: str | None = None) -> None:
        self.model = model or settings.vlm_model
        self.host = host or settings.ollama_host

    async def extract(self, image_path: Path) -> ExtractedLabel:  # pragma: no cover
        try:
            import ollama  # type: ignore
        except ImportError as e:
            raise RuntimeError("Install with [vlm] extra: pip install -e .[vlm]") from e

        client = ollama.AsyncClient(host=self.host)
        resp = await client.chat(
            model=self.model,
            format="json",
            messages=[
                {
                    "role": "user",
                    "content": PROMPT,
                    "images": [str(image_path)],
                }
            ],
        )
        text = resp["message"]["content"]
        data = json.loads(text)
        data["raw"] = {"model": self.model, "response": text}
        return ExtractedLabel.model_validate(data)
