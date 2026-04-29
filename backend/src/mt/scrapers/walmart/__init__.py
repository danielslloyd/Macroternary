"""Walmart adapter (placeholder per §6, build order #11)."""
from __future__ import annotations

from collections.abc import AsyncIterator

from mt.scrapers.base import ProductRef, RawProduct


class WalmartAdapter:
    name = "walmart"

    async def discover(self) -> AsyncIterator[ProductRef]:  # pragma: no cover
        if False:
            yield  # type: ignore[unreachable]
        raise NotImplementedError

    async def fetch(self, ref: ProductRef) -> RawProduct:  # pragma: no cover
        raise NotImplementedError
