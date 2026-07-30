"""Steam Community Market — optional price reference only.

Steam proceeds are locked to the Steam wallet (not withdrawable), so Steam is
never used as a sell venue for arbitrage; its median price is only a sanity
reference. The priceoverview endpoint is aggressively rate limited, so this
adapter looks up single names on demand rather than bulk-polling.
"""
from __future__ import annotations

import logging
import re

from ..config import STEAM_APP_IDS
from ..models import PriceReference
from .base import MarketAdapter

log = logging.getLogger("steam")


def _parse_money(text: str | None) -> int | None:
    if not text:
        return None
    match = re.search(r"([\d.,]+)", text)
    if not match:
        return None
    value = match.group(1).replace(",", "")
    try:
        return int(round(float(value) * 100))
    except ValueError:
        return None


class SteamAdapter(MarketAdapter):
    name = "steam"
    can_reference = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.limiter.rate = 0.2  # ~1 request / 5s to stay under Steam limits

    async def lowest_price(self, game: str, market_hash_name: str) -> PriceReference | None:
        app_id = STEAM_APP_IDS.get(game)
        if not app_id:
            return None
        data = await self._request_json(
            "GET", "https://steamcommunity.com/market/priceoverview/",
            params={"appid": app_id, "currency": 1, "market_hash_name": market_hash_name},
            retries=1,
        )
        if not data or not data.get("success"):
            return None
        price = _parse_money(data.get("lowest_price") or data.get("median_price"))
        if price is None:
            return None
        volume = _parse_money(data.get("volume"))
        return PriceReference(
            venue="steam", game=game, market_hash_name=market_hash_name,
            price_cents=price, quantity=int((volume or 0) / 100),
        )
