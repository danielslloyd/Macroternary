"""Pydantic-backed validation for extracted product rows.

The validator is the single gate every extraction (scrape or VLM) crosses
before it lands in the database. It rejects junk and assigns an
`extraction_confidence` per the spec (§7).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field

Source = Literal["scrape", "photo_vlm", "manual"]

CALORIE_ARITHMETIC_TOLERANCE = 0.15


class ProductCandidate(BaseModel):
    """A row produced by a scraper or VLM, pre-DB."""

    retailer: str
    retailer_sku: str
    name: str
    product_url: str
    serving_size_g: float
    calories_per_serving: float
    protein_g: float
    carbs_g: float
    fat_g: float

    brand: str | None = None
    category: str | None = None
    serving_size_label: str | None = None
    fiber_g: float | None = None
    sugar_g: float | None = None
    sat_fat_g: float | None = None
    sodium_mg: float | None = None
    image_url: str | None = None
    label_image_url: str | None = None
    food_family_slug: str | None = None
    affiliate_url: str | None = None
    source: Source = "scrape"


@dataclass
class ValidationOutcome:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    confidence: float = 0.0


def _calorie_gap(c: ProductCandidate) -> float:
    computed = 4 * c.protein_g + 4 * c.carbs_g + 9 * c.fat_g
    if c.calories_per_serving <= 0:
        return float("inf")
    return abs(c.calories_per_serving - computed) / c.calories_per_serving


def confidence_for(source: Source, ok: bool) -> float:
    if not ok:
        return 0.0
    if source == "scrape":
        return 1.0
    if source == "photo_vlm":
        return 0.8
    return 0.9  # manual


def validate_product(candidate: ProductCandidate) -> ValidationOutcome:
    errors: list[str] = []
    warnings: list[str] = []

    # Required-positive fields.
    if candidate.serving_size_g <= 0:
        errors.append("serving_size_g must be > 0")
    for field_name in ("calories_per_serving", "protein_g", "carbs_g", "fat_g"):
        if getattr(candidate, field_name) < 0:
            errors.append(f"{field_name} must not be negative")

    # Cross-field sanity.
    if candidate.sat_fat_g is not None and candidate.sat_fat_g > candidate.fat_g + 1e-6:
        errors.append("sat_fat_g exceeds fat_g")
    if candidate.sugar_g is not None and candidate.sugar_g > candidate.carbs_g + 1e-6:
        errors.append("sugar_g exceeds carbs_g")

    # Arithmetic check (§7 + §5: gap > 15% blocks; lower gap is a warning if non-zero).
    gap = _calorie_gap(candidate)
    if gap > CALORIE_ARITHMETIC_TOLERANCE:
        errors.append(
            f"calorie arithmetic off by {gap:.0%} (label says {candidate.calories_per_serving},"
            f" computed {4 * candidate.protein_g + 4 * candidate.carbs_g + 9 * candidate.fat_g:.1f})"
        )
    elif gap > 0.05:
        warnings.append(f"calorie arithmetic off by {gap:.0%}")

    ok = not errors
    confidence = confidence_for(candidate.source, ok)
    if confidence < 0.5:
        warnings.append("confidence below snapshot threshold (0.5)")

    return ValidationOutcome(ok=ok, errors=errors, warnings=warnings, confidence=confidence)


class PublicProduct(BaseModel):
    """Schema written to products.vN.json. Mirrors §8 exactly."""

    id: str
    retailer: str
    brand: str | None
    name: str
    category: str | None
    family: str | None
    serving_g: float
    serving_label: str | None
    kcal: float
    p: float
    c: float
    f: float
    p_pct: float = Field(ge=0.0, le=1.0)
    c_pct: float = Field(ge=0.0, le=1.0)
    f_pct: float = Field(ge=0.0, le=1.0)
    url: str
    img: str | None


class PublicFoodFamily(BaseModel):
    slug: str
    name: str
    description: str | None
    parent_slug: str | None
