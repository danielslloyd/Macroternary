import pytest

from mt.validators import ProductCandidate, validate_product


def make(**overrides) -> ProductCandidate:
    base = dict(
        retailer="trader_joes",
        retailer_sku="123",
        name="Rolled Oats",
        product_url="https://example.com/p/123",
        serving_size_g=40,
        calories_per_serving=150,
        protein_g=5,
        carbs_g=27,
        fat_g=2.5,
    )
    base.update(overrides)
    return ProductCandidate(**base)


def test_clean_scrape_passes_with_full_confidence():
    out = validate_product(make())
    assert out.ok
    assert out.confidence == 1.0
    assert out.errors == []


def test_vlm_clean_gets_0_8_confidence():
    out = validate_product(make(source="photo_vlm"))
    assert out.ok
    assert out.confidence == pytest.approx(0.8)


def test_negative_macro_rejected():
    out = validate_product(make(protein_g=-1))
    assert not out.ok
    assert any("protein_g" in e for e in out.errors)


def test_zero_serving_rejected():
    out = validate_product(make(serving_size_g=0))
    assert not out.ok
    assert any("serving_size_g" in e for e in out.errors)


def test_calorie_arithmetic_far_off_rejected():
    # 4*5 + 4*27 + 9*2.5 = 150.5 — claim 250 → ~40% gap
    out = validate_product(make(calories_per_serving=250))
    assert not out.ok
    assert any("calorie arithmetic" in e for e in out.errors)


def test_calorie_arithmetic_within_tolerance_accepted():
    # ~10% gap stays under the 15% block but should warn.
    out = validate_product(make(calories_per_serving=165))
    assert out.ok
    assert out.warnings


def test_sat_fat_exceeding_total_rejected():
    out = validate_product(make(fat_g=2.5, sat_fat_g=4))
    assert not out.ok
    assert any("sat_fat_g" in e for e in out.errors)


def test_sugar_exceeding_carbs_rejected():
    out = validate_product(make(carbs_g=10, sugar_g=12))
    assert not out.ok
    assert any("sugar_g" in e for e in out.errors)
