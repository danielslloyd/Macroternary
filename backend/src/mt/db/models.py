from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from mt.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Source(str, enum.Enum):
    scrape = "scrape"
    photo_vlm = "photo_vlm"
    manual = "manual"


class FoodFamily(Base):
    __tablename__ = "food_families"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("food_families.id", ondelete="SET NULL")
    )

    parent: Mapped["FoodFamily | None"] = relationship(
        "FoodFamily", remote_side=[id], backref="children"
    )
    products: Mapped[list[Product]] = relationship(back_populates="food_family")


class Retailer(Base):
    __tablename__ = "retailers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(255))
    scrape_strategy: Mapped[str | None] = mapped_column(String(64))
    rate_limit_rps: Mapped[float] = mapped_column(Numeric(6, 3), default=0.5)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("retailer", "retailer_sku", name="uq_retailer_sku"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    retailer: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    retailer_sku: Mapped[str] = mapped_column(String(128), nullable=False)

    brand: Mapped[str | None] = mapped_column(String(128))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(64))

    food_family_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("food_families.id", ondelete="SET NULL"), index=True
    )

    serving_size_g: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    serving_size_label: Mapped[str | None] = mapped_column(String(128))
    calories_per_serving: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    protein_g: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    carbs_g: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    fat_g: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    fiber_g: Mapped[float | None] = mapped_column(Numeric(10, 3))
    sugar_g: Mapped[float | None] = mapped_column(Numeric(10, 3))
    sat_fat_g: Mapped[float | None] = mapped_column(Numeric(10, 3))
    sodium_mg: Mapped[float | None] = mapped_column(Numeric(10, 3))

    product_url: Mapped[str] = mapped_column(Text, nullable=False)
    affiliate_url: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    label_image_url: Mapped[str | None] = mapped_column(Text)

    source: Mapped[Source] = mapped_column(Enum(Source, name="product_source"), nullable=False)
    extraction_confidence: Mapped[float] = mapped_column(Numeric(4, 3), default=1.0)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    food_family: Mapped[FoodFamily | None] = relationship(back_populates="products")
    extraction_attempts: Mapped[list[ExtractionAttempt]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ExtractionAttempt(Base):
    __tablename__ = "extraction_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    product_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    source: Mapped[Source] = mapped_column(Enum(Source, name="product_source"), nullable=False)
    raw_payload: Mapped[dict | None] = mapped_column(JSON)
    errors: Mapped[list | None] = mapped_column(JSON)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False)

    product: Mapped[Product | None] = relationship(back_populates="extraction_attempts")
