"""Retailer adapter protocol (§6).

Concrete adapters live under `mt.scrapers.<retailer>` and ship with HTML
fixtures + pytest tests. The normalizer maps `RawProduct` to the canonical
schema; the validator (§7) is the gate.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol

from pydantic import BaseModel


class ProductRef(BaseModel):
    retailer: str
    retailer_sku: str
    url: str


class RawProduct(BaseModel):
    """Loose, optional-everything bag from a scrape. Normalizer narrows it."""

    retailer: str
    retailer_sku: str
    url: str
    name: str | None = None
    brand: str | None = None
    category: str | None = None
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
    image_url: str | None = None
    raw: dict | None = None


class RetailerAdapter(Protocol):
    name: str

    async def discover(self) -> AsyncIterator[ProductRef]:
        ...

    async def fetch(self, ref: ProductRef) -> RawProduct:
        ...
