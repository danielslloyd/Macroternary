"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "food_families",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("slug", sa.String(length=128), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column(
            "parent_id",
            sa.String(length=36),
            sa.ForeignKey("food_families.id", ondelete="SET NULL"),
        ),
    )
    op.create_index("ix_food_families_slug", "food_families", ["slug"], unique=True)

    op.create_table(
        "retailers",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=64), nullable=False, unique=True),
        sa.Column("base_url", sa.String(length=255)),
        sa.Column("scrape_strategy", sa.String(length=64)),
        sa.Column("rate_limit_rps", sa.Numeric(6, 3), server_default="0.5"),
    )

    op.create_table(
        "products",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("retailer", sa.String(length=64), nullable=False),
        sa.Column("retailer_sku", sa.String(length=128), nullable=False),
        sa.Column("brand", sa.String(length=128)),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=64)),
        sa.Column(
            "food_family_id",
            sa.String(length=36),
            sa.ForeignKey("food_families.id", ondelete="SET NULL"),
        ),
        sa.Column("serving_size_g", sa.Numeric(10, 3), nullable=False),
        sa.Column("serving_size_label", sa.String(length=128)),
        sa.Column("calories_per_serving", sa.Numeric(10, 3), nullable=False),
        sa.Column("protein_g", sa.Numeric(10, 3), nullable=False),
        sa.Column("carbs_g", sa.Numeric(10, 3), nullable=False),
        sa.Column("fat_g", sa.Numeric(10, 3), nullable=False),
        sa.Column("fiber_g", sa.Numeric(10, 3)),
        sa.Column("sugar_g", sa.Numeric(10, 3)),
        sa.Column("sat_fat_g", sa.Numeric(10, 3)),
        sa.Column("sodium_mg", sa.Numeric(10, 3)),
        sa.Column("product_url", sa.Text(), nullable=False),
        sa.Column("affiliate_url", sa.Text()),
        sa.Column("image_url", sa.Text()),
        sa.Column("label_image_url", sa.Text()),
        sa.Column(
            "source",
            sa.Enum("scrape", "photo_vlm", "manual", name="product_source"),
            nullable=False,
        ),
        sa.Column("extraction_confidence", sa.Numeric(4, 3), server_default="1.0"),
        sa.Column("last_verified_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("retailer", "retailer_sku", name="uq_retailer_sku"),
    )
    op.create_index("ix_products_retailer", "products", ["retailer"])
    op.create_index("ix_products_food_family_id", "products", ["food_family_id"])

    op.create_table(
        "extraction_attempts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "product_id",
            sa.String(length=36),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
        ),
        sa.Column("attempted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "source",
            sa.Enum("scrape", "photo_vlm", "manual", name="product_source"),
            nullable=False,
        ),
        sa.Column("raw_payload", sa.JSON()),
        sa.Column("errors", sa.JSON()),
        sa.Column("accepted", sa.Boolean(), server_default=sa.false()),
    )
    op.create_index(
        "ix_extraction_attempts_product_id", "extraction_attempts", ["product_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_extraction_attempts_product_id", table_name="extraction_attempts")
    op.drop_table("extraction_attempts")
    op.drop_index("ix_products_food_family_id", table_name="products")
    op.drop_index("ix_products_retailer", table_name="products")
    op.drop_table("products")
    op.drop_table("retailers")
    op.drop_index("ix_food_families_slug", table_name="food_families")
    op.drop_table("food_families")
    sa.Enum(name="product_source").drop(op.get_bind(), checkfirst=True)
