"""FastAPI admin app (§6 photo pipeline).

Bound to 127.0.0.1; never exposed publicly. Serves the local React admin
under /admin and provides JSON endpoints for the photo review flow.

This is a minimal scaffold — enough to host a UI, list pending extractions,
and accept/reject reviewed rows. Re-extraction wiring is stubbed.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from mt.db.models import ExtractionAttempt, FoodFamily, Product, Source
from mt.db.session import SessionLocal
from mt.validators import ProductCandidate, validate_product


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class ApproveRequest(BaseModel):
    candidate: ProductCandidate
    label_image_url: str | None = None
    food_family_slug: str | None = None
    attempt_id: str | None = None


def create_app() -> FastAPI:
    app = FastAPI(title="Macro Ternary admin", docs_url="/admin/docs")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/admin/api/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/admin/api/families")
    def families(db: Session = Depends(get_db)) -> list[dict]:
        return [
            {"slug": f.slug, "name": f.name, "parent_slug": f.parent.slug if f.parent else None}
            for f in db.query(FoodFamily).order_by(FoodFamily.slug).all()
        ]

    @app.get("/admin/api/queue")
    def queue(db: Session = Depends(get_db)) -> list[dict]:
        rows = (
            db.query(ExtractionAttempt)
            .filter(ExtractionAttempt.accepted == False)  # noqa: E712
            .order_by(ExtractionAttempt.attempted_at.desc())
            .limit(200)
            .all()
        )
        return [
            {
                "id": r.id,
                "product_id": r.product_id,
                "attempted_at": r.attempted_at.isoformat() if r.attempted_at else None,
                "source": r.source.value,
                "errors": r.errors,
                "raw_payload": r.raw_payload,
            }
            for r in rows
        ]

    @app.post("/admin/api/upload")
    async def upload_label(file: UploadFile) -> dict:
        # Persistence is left to the CLI workflow; this endpoint just
        # acknowledges the file so the admin UI can show the queue layout.
        return {"filename": file.filename, "size": (await file.read()).__len__()}

    @app.post("/admin/api/products/approve")
    def approve(req: ApproveRequest, db: Session = Depends(get_db)) -> dict:
        outcome = validate_product(req.candidate)
        if not outcome.ok:
            raise HTTPException(status_code=400, detail={"errors": outcome.errors})

        family_id: str | None = None
        if req.food_family_slug:
            fam = db.query(FoodFamily).filter_by(slug=req.food_family_slug).one_or_none()
            if fam is None:
                raise HTTPException(status_code=400, detail=f"unknown family: {req.food_family_slug}")
            family_id = fam.id

        c = req.candidate
        product = Product(
            retailer=c.retailer,
            retailer_sku=c.retailer_sku,
            brand=c.brand,
            name=c.name,
            category=c.category,
            food_family_id=family_id,
            serving_size_g=c.serving_size_g,
            serving_size_label=c.serving_size_label,
            calories_per_serving=c.calories_per_serving,
            protein_g=c.protein_g,
            carbs_g=c.carbs_g,
            fat_g=c.fat_g,
            fiber_g=c.fiber_g,
            sugar_g=c.sugar_g,
            sat_fat_g=c.sat_fat_g,
            sodium_mg=c.sodium_mg,
            product_url=c.product_url,
            affiliate_url=c.affiliate_url,
            image_url=c.image_url,
            label_image_url=req.label_image_url,
            source=Source(c.source),
            extraction_confidence=outcome.confidence,
        )
        db.add(product)
        if req.attempt_id:
            attempt = db.get(ExtractionAttempt, req.attempt_id)
            if attempt:
                attempt.accepted = True
                attempt.product_id = product.id
        db.commit()
        return {"id": product.id, "confidence": outcome.confidence}

    return app


app = create_app()
