"""Trader Joe's adapter — first scraper to build per §6.

The current implementation is a placeholder. Wire up Playwright and add
fixture HTML + tests under `tests/scrapers/trader_joes/fixtures/` before
shipping real data.
"""
from __future__ import annotations

from collections.abc import AsyncIterator

from mt.scrapers.base import ProductRef, RawProduct


class TraderJoesAdapter:
    name = "trader_joes"

    async def discover(self) -> AsyncIterator[ProductRef]:  # pragma: no cover
        if False:
            yield  # type: ignore[unreachable]
        raise NotImplementedError("Trader Joe's discovery not yet implemented")

    async def fetch(self, ref: ProductRef) -> RawProduct:  # pragma: no cover
        raise NotImplementedError("Trader Joe's fetch not yet implemented")
