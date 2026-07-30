"""DMarket adapter (CS2 + Rust). https://docs.dmarket.com

Public market browsing needs no auth. Trading (buy/sell) uses ed25519-signed
requests with the public/secret key pair from DMarket account settings.
Game IDs are configurable in config.yaml (markets.dmarket.game_ids) since
DMarket occasionally changes them; defaults: cs2 -> a8db, rust -> rust.
"""
from __future__ import annotations

import json
import logging
import time

from nacl.signing import SigningKey

from ..models import MarketListing, PriceReference
from .base import MarketAdapter, MarketError

log = logging.getLogger("dmarket")

BASE = "https://api.dmarket.com"
DEFAULT_GAME_IDS = {"cs2": "a8db", "rust": "rust"}


class DMarketAdapter(MarketAdapter):
    name = "dmarket"
    can_scan_listings = True
    can_reference = True

    @property
    def can_buy(self) -> bool:  # type: ignore[override]
        return bool(self.app.dmarket_public_key and self.app.dmarket_secret_key)

    can_sell = False  # selling requires items in DMarket inventory; enable after deposit flow

    def _game_id(self, game: str) -> str | None:
        ids = {**DEFAULT_GAME_IDS, **(self.cfg.extra.get("game_ids") or {})}
        return ids.get(game)

    def _signed_headers(self, method: str, path: str, body: str = "") -> dict[str, str]:
        if not (self.app.dmarket_public_key and self.app.dmarket_secret_key):
            raise MarketError("dmarket: DMARKET_PUBLIC_KEY / DMARKET_SECRET_KEY not set")
        ts = str(int(time.time()))
        message = method + path + body + ts
        signing_key = SigningKey(bytes.fromhex(self.app.dmarket_secret_key))
        signature = signing_key.sign(message.encode()).signature.hex()
        return {
            "X-Api-Key": self.app.dmarket_public_key,
            "X-Request-Sign": "dmar ed25519 " + signature,
            "X-Sign-Date": ts,
            "Content-Type": "application/json",
        }

    @staticmethod
    def _price_cents(obj: dict) -> int | None:
        raw = (obj.get("price") or {}).get("USD")
        try:
            return int(raw)  # DMarket returns USD amounts already in cents
        except (TypeError, ValueError):
            return None

    async def scan_listings(self, game: str) -> list[MarketListing]:
        game_id = self._game_id(game)
        if not game_id:
            return []
        data = await self._request_json(
            "GET", f"{BASE}/exchange/v1/market/items",
            params={
                "gameId": game_id, "currency": "USD", "limit": 100,
                "orderBy": "updated", "orderDir": "desc",
                "priceFrom": self.app.strategy.min_item_price_cents,
                "priceTo": self.app.strategy.max_item_price_cents,
            },
        )
        listings = []
        for obj in (data or {}).get("objects", []):
            price = self._price_cents(obj)
            title = obj.get("title")
            if price is None or not title:
                continue
            listings.append(MarketListing(
                venue="dmarket", listing_id=str(obj.get("itemId")), game=game,
                market_hash_name=title, price_cents=price,
                float_value=(obj.get("extra") or {}).get("floatValue"),
            ))
        return listings

    async def fetch_references(self, game: str) -> list[PriceReference]:
        """Aggregated lowest asks. Uses the market items feed ordered by price;
        cheap approximation good enough for cross-venue reference."""
        game_id = self._game_id(game)
        if not game_id:
            return []
        data = await self._request_json(
            "GET", f"{BASE}/exchange/v1/market/items",
            params={"gameId": game_id, "currency": "USD", "limit": 100,
                    "orderBy": "price", "orderDir": "asc"},
        )
        best: dict[str, PriceReference] = {}
        for obj in (data or {}).get("objects", []):
            price = self._price_cents(obj)
            title = obj.get("title")
            if price is None or not title:
                continue
            ref = best.get(title)
            if ref is None:
                best[title] = PriceReference(
                    venue="dmarket", game=game, market_hash_name=title,
                    price_cents=price, quantity=1,
                )
            else:
                ref.quantity += 1
                ref.price_cents = min(ref.price_cents, price)
        return list(best.values())

    async def buy(self, listing: MarketListing) -> str:
        path = "/exchange/v1/offers-buy"
        body = json.dumps({
            "offers": [{
                "offerId": listing.listing_id,
                "price": {"amount": str(listing.price_cents), "currency": "USD"},
                "type": "dmarket",
            }]
        }, separators=(",", ":"))
        headers = self._signed_headers("PATCH", path, body)
        result = await self._request_json(
            "PATCH", f"{BASE}{path}", headers=headers,
            json_body=json.loads(body), retries=0,  # never retry a buy
        )
        status = (result or {}).get("status", "")
        if str(status).lower() not in ("success", "txsuccess", ""):
            raise MarketError(f"dmarket buy failed: {result}")
        return listing.listing_id
