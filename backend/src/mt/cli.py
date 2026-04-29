"""`mt` command-line interface (§8, §11).

Subcommands:
    mt init-db                    create tables (alembic upgrade equivalent)
    mt families load [--path P]   idempotent seed loader
    mt snapshot --version N --out PATH
    mt serve                      run admin FastAPI on 127.0.0.1
    mt seed-demo                  insert a few demo products (handy for the frontend)
"""
from __future__ import annotations

import sys
from pathlib import Path

import click

from mt.config import settings
from mt.db.base import Base
from mt.db.models import FoodFamily, Product, Source
from mt.db.session import SessionLocal, get_engine
from mt.families import load_family_seed


@click.group()
def main() -> None:
    """Macro Ternary admin commands."""


@main.command("init-db")
def init_db() -> None:
    """Create all tables (use Alembic in production)."""
    Base.metadata.create_all(get_engine())
    click.echo("ok")


@main.group("families")
def families_cmd() -> None:
    """Food-family operations."""


@families_cmd.command("load")
@click.option("--path", "path", type=click.Path(path_type=Path), default=None)
def families_load(path: Path | None) -> None:
    p = path or settings.family_seed_path
    if not p.exists():
        click.echo(f"seed file not found: {p}", err=True)
        sys.exit(1)
    db = SessionLocal()
    try:
        result = load_family_seed(db, p)
        db.commit()
    finally:
        db.close()
    click.echo(f"created={result['created']} updated={result['updated']} total={result['total']}")


@main.command("snapshot")
@click.option("--version", required=True, type=int)
@click.option(
    "--out",
    "out",
    type=click.Path(path_type=Path),
    default=None,
    help="output directory (defaults to MT_SNAPSHOT_OUT_DIR or ./public)",
)
def snapshot(version: int, out: Path | None) -> None:
    from mt.snapshot import publish_snapshot

    out_dir = out or settings.snapshot_out_dir
    db = SessionLocal()
    try:
        meta = publish_snapshot(db, out_dir, version=version)
    finally:
        db.close()
    click.echo(
        f"wrote {meta['count']} products to {out_dir} (v{meta['version']}, "
        f"retailers: {', '.join(meta['retailers']) or 'none'})"
    )


@main.command("serve")
@click.option("--host", default=None)
@click.option("--port", default=None, type=int)
def serve(host: str | None, port: int | None) -> None:
    """Start the local admin FastAPI."""
    import uvicorn

    uvicorn.run(
        "mt.api.app:app",
        host=host or settings.admin_host,
        port=port or settings.admin_port,
        reload=False,
    )


@main.command("seed-demo")
def seed_demo() -> None:
    """Insert a small demo dataset so the frontend has something to render."""
    Base.metadata.create_all(get_engine())
    db = SessionLocal()
    try:
        # Make sure families are loaded; this is best-effort.
        if db.query(FoodFamily).count() == 0 and settings.family_seed_path.exists():
            load_family_seed(db, settings.family_seed_path)
            db.commit()

        slug_to_id = {f.slug: f.id for f in db.query(FoodFamily).all()}

        demo = [
            ("trader_joes", "TJ-OATS", "Trader Joe's", "Rolled Oats",
             "oats", 40, "1/2 cup (40g)", 150, 5, 27, 2.5,
             "https://www.traderjoes.com/home/products/pdp/rolled-oats-x"),
            ("trader_joes", "TJ-PB", "Trader Joe's", "Creamy Salted Peanut Butter",
             "peanut-butter", 32, "2 tbsp (32g)", 200, 8, 6, 17,
             "https://www.traderjoes.com/home/products/pdp/peanut-butter-y"),
            ("walmart", "WM-CHIX", "Great Value", "Boneless Skinless Chicken Breast",
             "chicken-breast", 112, "4 oz (112g)", 130, 26, 0, 3,
             "https://www.walmart.com/ip/great-value-chicken-z"),
            ("walmart", "WM-OAT", "Great Value", "Old Fashioned Oats",
             "oats", 40, "1/2 cup (40g)", 150, 5, 27, 3,
             "https://www.walmart.com/ip/old-fashioned-oats-q"),
            ("costco", "CO-SALMON", "Kirkland Signature", "Atlantic Salmon Fillet",
             "salmon", 113, "4 oz (113g)", 240, 23, 0, 16,
             "https://www.costco.com/atlantic-salmon-fillet.product"),
            ("trader_joes", "TJ-GREEK", "Trader Joe's", "0% Greek Nonfat Yogurt",
             "greek-yogurt", 170, "1 container (170g)", 90, 17, 6, 0,
             "https://www.traderjoes.com/home/products/pdp/greek-yogurt-a"),
            ("walmart", "WM-WHEY", "Optimum Nutrition", "Gold Standard 100% Whey",
             "whey-protein", 31, "1 scoop (31g)", 120, 24, 3, 1,
             "https://www.walmart.com/ip/whey-protein-b"),
            ("walmart", "WM-OLIVE", "Great Value", "Extra Virgin Olive Oil",
             "olive-oil", 14, "1 tbsp (14g)", 120, 0, 0, 14,
             "https://www.walmart.com/ip/olive-oil-c"),
            ("costco", "CO-EGGS", "Kirkland Signature", "Large Eggs",
             "eggs", 50, "1 large egg (50g)", 70, 6, 0, 5,
             "https://www.costco.com/eggs.product"),
            ("trader_joes", "TJ-LENTIL", "Trader Joe's", "Steamed Lentils",
             "lentils", 100, "1/2 cup (100g)", 110, 9, 18, 0.5,
             "https://www.traderjoes.com/home/products/pdp/lentils-d"),
        ]

        added = 0
        for retailer, sku, brand, name, fam_slug, sg, sl, kcal, p, c, f, url in demo:
            exists = (
                db.query(Product)
                .filter_by(retailer=retailer, retailer_sku=sku)
                .one_or_none()
            )
            if exists:
                continue
            db.add(
                Product(
                    retailer=retailer,
                    retailer_sku=sku,
                    brand=brand,
                    name=name,
                    food_family_id=slug_to_id.get(fam_slug),
                    serving_size_g=sg,
                    serving_size_label=sl,
                    calories_per_serving=kcal,
                    protein_g=p,
                    carbs_g=c,
                    fat_g=f,
                    product_url=url,
                    source=Source.manual,
                    extraction_confidence=0.9,
                )
            )
            added += 1
        db.commit()
        click.echo(f"demo rows added: {added}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
