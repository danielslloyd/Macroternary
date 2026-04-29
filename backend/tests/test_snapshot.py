import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from mt.db.base import Base
from mt.db.models import FoodFamily, Product, Source
from mt.snapshot import publish_snapshot, build_public_payload


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, future=True)
    db = Session()
    try:
        yield db
        db.commit()
    finally:
        db.close()


def _seed_basic(session) -> dict:
    fam = FoodFamily(slug="oats", name="Oats")
    session.add(fam)
    session.flush()
    p = Product(
        retailer="trader_joes",
        retailer_sku="A1",
        name="Rolled Oats",
        food_family_id=fam.id,
        serving_size_g=40,
        serving_size_label="1/2 cup (40g)",
        calories_per_serving=150,
        protein_g=5,
        carbs_g=27,
        fat_g=2.5,
        product_url="https://example.com/p/A1",
        affiliate_url="https://aff.example.com/p/A1",
        image_url="https://cdn.example.com/oats.jpg",
        source=Source.scrape,
        extraction_confidence=1.0,
    )
    blocked = Product(
        retailer="walmart",
        retailer_sku="B1",
        name="Mystery item",
        serving_size_g=30,
        calories_per_serving=100,
        protein_g=0,
        carbs_g=20,
        fat_g=2,
        product_url="https://walmart.com/p/B1",
        source=Source.photo_vlm,
        extraction_confidence=0.3,  # below threshold
    )
    session.add_all([p, blocked])
    session.flush()
    return {"family": fam, "product": p, "blocked": blocked}


def test_payload_excludes_low_confidence_rows(session):
    _seed_basic(session)
    products, families = build_public_payload(session)
    assert len(products) == 1
    assert products[0].retailer == "trader_joes"
    assert {f.slug for f in families} == {"oats"}


def test_percentages_computed_from_macros(session):
    _seed_basic(session)
    products, _ = build_public_payload(session)
    p = products[0]
    # 4*5 + 4*27 + 9*2.5 = 20 + 108 + 22.5 = 150.5
    assert p.p_pct == pytest.approx(20 / 150.5, abs=1e-4)
    assert p.c_pct == pytest.approx(108 / 150.5, abs=1e-4)
    assert p.f_pct == pytest.approx(22.5 / 150.5, abs=1e-4)
    assert sum([p.p_pct, p.c_pct, p.f_pct]) == pytest.approx(1.0, abs=1e-4)


def test_affiliate_url_preferred(session):
    _seed_basic(session)
    products, _ = build_public_payload(session)
    assert products[0].url == "https://aff.example.com/p/A1"


def test_publish_writes_files(session, tmp_path):
    _seed_basic(session)
    meta = publish_snapshot(session, tmp_path, version=4)
    assert (tmp_path / "products.v4.json").exists()
    assert (tmp_path / "families.v4.json").exists()
    assert (tmp_path / "meta.json").exists()
    assert meta["count"] == 1
    assert meta["retailers"] == ["trader_joes"]

    parsed = json.loads((tmp_path / "products.v4.json").read_text())
    assert parsed[0]["family"] == "oats"
