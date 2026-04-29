"""Costco adapter (placeholder; only public nutrition data — no member pricing)."""
from __future__ import annotations

from collections.abc import AsyncIterator

from mt.scrapers.base import ProductRef, RawProduct


class CostcoAdapter:
    name = "costco"

    async def discover(self) -> AsyncIterator[ProductRef]:  # pragma: no cover
        if False:
            yield  # type: ignore[unreachable]
        raise NotImplementedError

    async def fetch(self, ref: ProductRef) -> RawProduct:  # pragma: no cover
        raise NotImplementedError
