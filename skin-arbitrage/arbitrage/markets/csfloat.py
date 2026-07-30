"""CSFloat adapter (CS2 only). https://docs.csfloat.com

Public listings endpoint needs no auth; buying/selling needs an API key
(created in your CSFloat profile > developer tab).
"""
from __future__ import annotations

import logging

from ..models import MarketListing, PriceReference
from .base import MarketAdapter, MarketError

log = logging.getLogger("csfloat")

BASE = "https://csfloat.com/api/v1"


class CSFloatAdapter(MarketAdapter):
    name = "csfloat"
    can_scan_listings = True
    can_reference = True
    can_buy = True
    can_sell = True

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.app.csfloat_api_key:
            headers["Authorization"] = self.app.csfloat_api_key
        return headers

    @staticmethod
    def _parse_listing(row: dict) -> MarketListing | None:
        item = row.get("item") or {}
        name = item.get("market_hash_name")
        price = row.get("price")
        if not name or not isinstance(price, int):
            return None
        return MarketListing(
            venue="csfloat",
            listing_id=str(row.get("id")),
            game="cs2",
            market_hash_name=name,
            price_cents=price,
            float_value=item.get("float_value"),
            extra={"watermarked": bool(item.get("is_souvenir"))},
        )

    async def scan_listings(self, game: str) -> list[MarketListing]:
        if game != "cs2":
            return []
        data = await self._request_json(
            "GET", f"{BASE}/listings", headers=self._headers(),
            params={
                "sort_by": "most_recent",
                "type": "buy_now",
                "limit": 50,
                "min_price": self.app.strategy.min_item_price_cents,
                "max_price": self.app.strategy.max_item_price_cents,
            },
        )
        rows = data.get("data") if isinstance(data, dict) else data
        listings = []
        for row in rows or []:
            parsed = self._parse_listing(row)
            if parsed:
                listings.append(parsed)
        return listings

    # No bulk price dump on CSFloat — the base fetch_references stays unused
    # (the scanner skips it); lowest_price serves on-demand reference lookups.
    async def lowest_price(self, market_hash_name: str) -> PriceReference | None:
        data = await self._request_json(
            "GET", f"{BASE}/listings", headers=self._headers(),
            params={"sort_by": "lowest_price", "type": "buy_now", "limit": 5,
                    "market_hash_name": market_hash_name},
        )
        rows = data.get("data") if isinstance(data, dict) else data
        if not rows:
            return None
        prices = [r["price"] for r in rows if isinstance(r.get("price"), int)]
        if not prices:
            return None
        return PriceReference(
            venue="csfloat", game="cs2", market_hash_name=market_hash_name,
            price_cents=min(prices), quantity=len(prices),
        )

    async def buy(self, listing: MarketListing) -> str:
        if not self.app.csfloat_api_key:
            raise MarketError("csfloat: CSFLOAT_API_KEY not set")
        result = await self._request_json(
            "POST", f"{BASE}/listings/buy", headers=self._headers(),
            json_body={"total_price": listing.price_cents,
                       "contract_ids": [listing.listing_id]},
            retries=0,  # never retry a buy — risk of double purchase
        )
        log.info("csfloat buy ok: %s", result)
        return listing.listing_id

    async def create_sell_listing(self, asset_id: str, price_cents: int) -> str:
        if not self.app.csfloat_api_key:
            raise MarketError("csfloat: CSFLOAT_API_KEY not set")
        result = await self._request_json(
            "POST", f"{BASE}/listings", headers=self._headers(),
            json_body={"asset_id": asset_id, "type": "buy_now", "price": price_cents},
            retries=0,
        )
        return str(result.get("id", ""))

    async def cancel_sell_listing(self, listing_id: str) -> None:
        await self._request_json(
            "DELETE", f"{BASE}/listings/{listing_id}", headers=self._headers(), retries=0,
        )
