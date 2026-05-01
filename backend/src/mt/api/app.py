"""Local FastAPI server.

In the local sandbox this single process serves three things:
  1. the static frontend (index.html + js/* + data/*) at /
  2. admin JSON endpoints under /admin/api/* (photo review queue, families)
  3. the recipe LLM endpoint at /api/recipe (calls OpenAI; optional)

Bound to 127.0.0.1 by default; never exposed publicly.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterator

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from mt.api import recipe as recipe_mod
from mt.db.models import ExtractionAttempt, FoodFamily, Product, Source
from mt.db.session import SessionLocal
from mt.validators import ProductCandidate, validate_product

# Repo root: backend/src/mt/api/app.py → up four = backend/, up five = repo root.
REPO_ROOT = Path(__file__).resolve().parents[4]
FRONTEND_DIR = REPO_ROOT / "frontend"


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


class RecipeRequest(BaseModel):
    text: str


def create_app() -> FastAPI:
    app = FastAPI(title="Macro Ternary local server", docs_url="/admin/docs")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ─── admin JSON endpoints (photo pipeline scaffold) ───────────────────

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
        # acknowledges the upload so the admin UI can show the queue layout.
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
                raise HTTPException(
                    status_code=400, detail=f"unknown family: {req.food_family_slug}"
                )
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

    # ─── recipe estimator (§9) ────────────────────────────────────────────

    @app.post("/api/recipe")
    async def estimate_recipe(req: RecipeRequest, request: Request) -> JSONResponse:
        ip = request.client.host if request.client else "unknown"
        if not recipe_mod.rate_limit_ok(ip):
            return JSONResponse(
                {"error": "rate_limit", "message": "3 requests per minute. Try again shortly."},
                status_code=429,
            )

        text = (req.text or "").strip()
        if not text:
            return JSONResponse({"error": "empty_input"}, status_code=400)
        if len(text) > 2000:
            return JSONResponse({"error": "too_long"}, status_code=400)

        estimator = recipe_mod.get_estimator()
        if estimator is None:
            return JSONResponse(
                {
                    "error": "no_estimator_configured",
                    "message": (
                        "Set OPENAI_API_KEY in the environment before starting "
                        "the server, or use manual entry."
                    ),
                },
                status_code=503,
            )

        try:
            result = await estimator.estimate(text)
        except Exception as e:
            return JSONResponse(
                {"error": "llm_unavailable", "message": str(e)}, status_code=502
            )

        if result.error == "not_a_recipe":
            return JSONResponse(result.model_dump())

        problem = recipe_mod.sanity_check(result)
        if problem:
            return JSONResponse(
                {"error": "sanity_check_failed", "message": problem}, status_code=422
            )
        return JSONResponse(result.model_dump())

    # ─── static frontend ──────────────────────────────────────────────────

    if FRONTEND_DIR.is_dir():
        # Serve js/, data/, styles.css from disk.
        app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
        if (FRONTEND_DIR / "data").is_dir():
            app.mount("/data", StaticFiles(directory=FRONTEND_DIR / "data"), name="data")

        @app.get("/styles.css", include_in_schema=False)
        def styles() -> FileResponse:
            return FileResponse(FRONTEND_DIR / "styles.css", media_type="text/css")

        @app.get("/", include_in_schema=False)
        def index() -> FileResponse:
            return FileResponse(FRONTEND_DIR / "index.html")

    return app


app = create_app()
