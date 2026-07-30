"""Skinport adapter (CS2 + Rust). https://docs.skinport.com

Skinport's public API exposes bulk price data only (no public purchase API),
so this venue serves as a sell-side price reference and an alert source.
The /v1/items endpoint is cached 5 minutes server-side and requires Brotli.
Rate limit: 8 requests / 5 minutes — poll_seconds should stay >= 120.
"""
from __future__ import annotations

import logging

from ..config import STEAM_APP_IDS
from ..models import PriceReference
from .base import MarketAdapter

log = logging.getLogger("skinport")

BASE = "https://api.skinport.com/v1"


class SkinportAdapter(MarketAdapter):
    name = "skinport"
    can_reference = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.limiter.rate = 8 / 300  # 8 requests per 5 minutes
        self.limiter.burst = 2

    async def fetch_references(self, game: str) -> list[PriceReference]:
        app_id = STEAM_APP_IDS.get(game)
        if not app_id:
            return []
        rows = await self._request_json(
            "GET", f"{BASE}/items",
            headers={"Accept-Encoding": "br", "Accept": "application/json"},
            params={"app_id": app_id, "currency": self.app.currency},
        )
        refs = []
        for row in rows or []:
            name = row.get("market_hash_name")
            min_price = row.get("min_price")
            if not name or min_price is None:
                continue
            refs.append(PriceReference(
                venue="skinport", game=game, market_hash_name=name,
                price_cents=int(round(float(min_price) * 100)),
                quantity=int(row.get("quantity") or 0),
            ))
        log.info("skinport: %d references for %s", len(refs), game)
        return refs
