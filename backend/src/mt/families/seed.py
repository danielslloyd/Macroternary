"""Idempotent food-family seed loader.

Reads a JSON file matching the §4 schema and upserts rows in a single
transaction. Same slug → update name/description/parent; never duplicates.
"""
from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy.orm import Session

from mt.db.models import FoodFamily


class FamilySeed(BaseModel):
    slug: str
    name: str
    description: str | None = None
    parent_slug: str | None = None


class FamilySeedFile(BaseModel):
    version: int = 1
    families: list[FamilySeed]


def _load_file(path: Path) -> FamilySeedFile:
    return FamilySeedFile.model_validate_json(path.read_text(encoding="utf-8"))


def load_family_seed(session: Session, path: Path) -> dict[str, int]:
    """Upsert families from `path`. Returns {created, updated, total}."""
    payload = _load_file(path)
    return apply_seed(session, payload)


def apply_seed(session: Session, payload: FamilySeedFile) -> dict[str, int]:
    by_slug: dict[str, FoodFamily] = {f.slug: f for f in session.query(FoodFamily).all()}
    created = 0
    updated = 0

    # First pass: upsert rows without parent linkage.
    for entry in payload.families:
        existing = by_slug.get(entry.slug)
        if existing is None:
            row = FoodFamily(slug=entry.slug, name=entry.name, description=entry.description)
            session.add(row)
            by_slug[entry.slug] = row
            created += 1
        else:
            changed = False
            if existing.name != entry.name:
                existing.name = entry.name
                changed = True
            if existing.description != entry.description:
                existing.description = entry.description
                changed = True
            if changed:
                updated += 1

    session.flush()  # assign ids for newly created rows.

    # Second pass: link parents now that all rows exist.
    for entry in payload.families:
        row = by_slug[entry.slug]
        if entry.parent_slug:
            if entry.parent_slug not in by_slug:
                raise ValueError(
                    f"family '{entry.slug}' references unknown parent '{entry.parent_slug}'"
                )
            target_parent_id = by_slug[entry.parent_slug].id
        else:
            target_parent_id = None
        if row.parent_id != target_parent_id:
            row.parent_id = target_parent_id

    session.flush()
    return {"created": created, "updated": updated, "total": len(payload.families)}


def write_seed_template(path: Path) -> None:
    """Used in tests / scaffolding."""
    template = FamilySeedFile(
        version=1,
        families=[FamilySeed(slug="oats", name="Oats")],
    )
    path.write_text(json.dumps(template.model_dump(), indent=2))
