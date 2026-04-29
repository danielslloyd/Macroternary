import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from mt.db.base import Base
from mt.db.models import FoodFamily
from mt.families import load_family_seed
from mt.families.seed import FamilySeedFile, apply_seed


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, future=True)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def _seed(tmp_path: Path, families: list[dict]) -> Path:
    p = tmp_path / "f.json"
    p.write_text(json.dumps({"version": 1, "families": families}))
    return p


def test_loads_basic_seed(session, tmp_path):
    path = _seed(tmp_path, [
        {"slug": "oats", "name": "Oats", "description": None, "parent_slug": None},
        {"slug": "instant-oats", "name": "Instant Oats", "description": None, "parent_slug": "oats"},
    ])
    out = load_family_seed(session, path)
    assert out == {"created": 2, "updated": 0, "total": 2}

    rows = {f.slug: f for f in session.query(FoodFamily).all()}
    assert set(rows) == {"oats", "instant-oats"}
    assert rows["instant-oats"].parent_id == rows["oats"].id


def test_idempotent_rerun(session, tmp_path):
    path = _seed(tmp_path, [
        {"slug": "oats", "name": "Oats", "description": "x", "parent_slug": None},
    ])
    load_family_seed(session, path)
    out = load_family_seed(session, path)
    assert out == {"created": 0, "updated": 0, "total": 1}
    assert session.query(FoodFamily).count() == 1


def test_updates_changed_metadata(session, tmp_path):
    path = _seed(tmp_path, [
        {"slug": "oats", "name": "Oats", "description": "old", "parent_slug": None},
    ])
    load_family_seed(session, path)

    path2 = _seed(tmp_path / "v2", [
        {"slug": "oats", "name": "Oats", "description": "new", "parent_slug": None},
    ]) if False else _seed(tmp_path, [
        {"slug": "oats", "name": "Oats", "description": "new", "parent_slug": None},
    ])
    out = load_family_seed(session, path2)
    assert out["updated"] == 1
    row = session.query(FoodFamily).filter_by(slug="oats").one()
    assert row.description == "new"


def test_unknown_parent_errors(session):
    payload = FamilySeedFile.model_validate(
        {
            "version": 1,
            "families": [
                {"slug": "child", "name": "Child", "parent_slug": "ghost"},
            ],
        }
    )
    with pytest.raises(ValueError, match="ghost"):
        apply_seed(session, payload)
