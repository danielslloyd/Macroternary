"""Snapshot publish command (§8).

Reads the canonical DB, emits public-facing artifacts:
    products.vN.json, families.vN.json, meta.json
under the configured output directory. Per-calorie percentages are
pre-computed on the way out so the frontend stays trivial.

The job:
- excludes products with extraction_confidence < 0.5
- prefers affiliate_url over product_url when both exist
- uses macros (4P + 4C + 9F) for plot coordinates, not the label kcal
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session, joinedload

from mt.db.models import FoodFamily, Product
from mt.validators.product import PublicFoodFamily, PublicProduct

CONFIDENCE_THRESHOLD = 0.5


def _calorie_shares(p: float, c: float, f: float) -> tuple[float, float, float]:
    cal_p = 4 * p
    cal_c = 4 * c
    cal_f = 9 * f
    total = cal_p + cal_c + cal_f
    if total <= 0:
        return 0.0, 0.0, 0.0
    return cal_p / total, cal_c / total, cal_f / total


def build_public_payload(
    session: Session,
) -> tuple[list[PublicProduct], list[PublicFoodFamily]]:
    families = (
        session.query(FoodFamily)
        .options(joinedload(FoodFamily.parent))
        .order_by(FoodFamily.slug)
        .all()
    )
    family_slug_by_id = {f.id: f.slug for f in families}

    products: list[PublicProduct] = []
    rows = (
        session.query(Product)
        .filter(Product.extraction_confidence >= CONFIDENCE_THRESHOLD)
        .order_by(Product.retailer, Product.name)
        .all()
    )
    for row in rows:
        p, c, f = float(row.protein_g), float(row.carbs_g), float(row.fat_g)
        p_pct, c_pct, f_pct = _calorie_shares(p, c, f)
        url = row.affiliate_url or row.product_url
        products.append(
            PublicProduct(
                id=row.id,
                retailer=row.retailer,
                brand=row.brand,
                name=row.name,
                category=row.category,
                family=family_slug_by_id.get(row.food_family_id),
                serving_g=float(row.serving_size_g),
                serving_label=row.serving_size_label,
                kcal=float(row.calories_per_serving),
                p=p,
                c=c,
                f=f,
                p_pct=round(p_pct, 6),
                c_pct=round(c_pct, 6),
                f_pct=round(f_pct, 6),
                url=url,
                img=row.image_url,
            )
        )

    public_families = [
        PublicFoodFamily(
            slug=fam.slug,
            name=fam.name,
            description=fam.description,
            parent_slug=fam.parent.slug if fam.parent else None,
        )
        for fam in families
    ]
    return products, public_families


def publish_snapshot(
    session: Session,
    out_dir: Path,
    version: int,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    products, families = build_public_payload(session)
    retailers = sorted({p.retailer for p in products})

    products_path = out_dir / f"products.v{version}.json"
    families_path = out_dir / f"families.v{version}.json"
    meta_path = out_dir / "meta.json"

    products_path.write_text(
        json.dumps([p.model_dump() for p in products], indent=2, ensure_ascii=False)
    )
    families_path.write_text(
        json.dumps([f.model_dump() for f in families], indent=2, ensure_ascii=False)
    )
    meta = {
        "version": version,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(products),
        "retailers": retailers,
        "products_url": products_path.name,
        "families_url": families_path.name,
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    return meta
