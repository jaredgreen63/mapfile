"""DMarket adapter (CS2 + Rust). https://docs.dmarket.com

The marketplace-api/v2 endpoints require ed25519-signed requests for
EVERYTHING, including browsing — so this adapter is unavailable until
DMARKET_PUBLIC_KEY / DMARKET_SECRET_KEY are set in .env (account settings
-> trading API -> create key pair; free). The signature covers
method + path-with-query + body + timestamp.

Endpoints (the old public /exchange/v1/market/items returned 410 in 2026):
  browse:  GET  /marketplace-api/v2/offers        (configurable: offers_path)
  buy:     POST /trading/v1/buy/offers            (configurable: buy_path)
Game IDs are configurable (game_ids); defaults: cs2 -> a8db, rust -> rust.
"""
from __future__ import annotations

import json
import logging
import time
from urllib.parse import urlencode

from nacl.signing import SigningKey

from ..models import MarketListing, PriceReference
from .base import MarketAdapter, MarketError

log = logging.getLogger("dmarket")

BASE = "https://api.dmarket.com"
DEFAULT_OFFERS_PATH = "/marketplace-api/v2/offers"
DEFAULT_BUY_PATH = "/trading/v1/buy/offers"
DEFAULT_GAME_IDS = {"cs2": "a8db", "rust": "rust"}


class DMarketAdapter(MarketAdapter):
    name = "dmarket"
    can_scan_listings = True
    can_reference = True

    @property
    def _has_keys(self) -> bool:
        return bool(self.app.dmarket_public_key and self.app.dmarket_secret_key)

    @property
    def available(self) -> bool:  # type: ignore[override]
        return self._has_keys

    unavailable_reason = ("DMARKET_PUBLIC_KEY / DMARKET_SECRET_KEY not set in .env — "
                          "DMarket's v2 API requires signed requests even for browsing. "
                          "Create free API keys in DMarket account settings, or set "
                          "markets.dmarket.enabled: false to silence this.")

    @property
    def can_buy(self) -> bool:  # type: ignore[override]
        return self._has_keys

    can_sell = False  # selling requires items in DMarket inventory; enable after deposit flow

    def _game_id(self, game: str) -> str | None:
        ids = {**DEFAULT_GAME_IDS, **(self.cfg.extra.get("game_ids") or {})}
        return ids.get(game)

    def _offers_path(self) -> str:
        return self.cfg.extra.get("offers_path", DEFAULT_OFFERS_PATH)

    def _buy_path(self) -> str:
        return self.cfg.extra.get("buy_path", DEFAULT_BUY_PATH)

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
        """DMarket has shipped several price shapes; accept all of them:
        {"price": {"USD": "150"}}, {"price": {"amount": "150", ...}},
        {"price": {"Amount": "150", ...}} — amounts are cents-as-strings."""
        price = obj.get("price") or {}
        raw = price.get("USD") or price.get("amount") or price.get("Amount")
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _offer_id(obj: dict) -> str | None:
        oid = obj.get("offerId") or obj.get("extra", {}).get("offerId") or obj.get("itemId")
        return str(oid) if oid else None

    async def _fetch_offers(self, game_id: str, params: dict) -> list[dict]:
        # Signed GET: the query string is part of the signed message, so build
        # the full path here and don't pass params separately.
        query = urlencode({"gameId": game_id, "currency": "USD", **params})
        path_with_query = f"{self._offers_path()}?{query}"
        headers = self._signed_headers("GET", path_with_query)
        data = await self._request_json("GET", f"{BASE}{path_with_query}", headers=headers)
        return (data or {}).get("objects", []) or []

    async def scan_listings(self, game: str) -> list[MarketListing]:
        game_id = self._game_id(game)
        if not game_id:
            return []
        objects = await self._fetch_offers(game_id, {
            "limit": 100, "orderBy": "updated", "orderDir": "desc",
            "priceFrom": self.app.strategy.min_item_price_cents,
            "priceTo": self.app.strategy.max_item_price_cents,
        })
        listings = []
        for obj in objects:
            price = self._price_cents(obj)
            title = obj.get("title")
            offer_id = self._offer_id(obj)
            if price is None or not title or not offer_id:
                continue
            listings.append(MarketListing(
                venue="dmarket", listing_id=offer_id, game=game,
                market_hash_name=title, price_cents=price,
                float_value=(obj.get("extra") or {}).get("floatValue"),
            ))
        return listings

    async def fetch_references(self, game: str) -> list[PriceReference]:
        """Approximate lowest asks from the cheapest slice of the offers feed."""
        game_id = self._game_id(game)
        if not game_id:
            return []
        objects = await self._fetch_offers(game_id, {
            "limit": 100, "orderBy": "price", "orderDir": "asc",
        })
        best: dict[str, PriceReference] = {}
        for obj in objects:
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
        path = self._buy_path()
        body = json.dumps({
            "Items": [{
                "OfferID": listing.listing_id,
                "Price": {"Amount": str(listing.price_cents), "Currency": "USD"},
            }]
        }, separators=(",", ":"))
        headers = self._signed_headers("POST", path, body)
        result = await self._request_json(
            "POST", f"{BASE}{path}", headers=headers,
            json_body=json.loads(body), retries=0,  # never retry a buy
        )
        result = result or {}
        if result.get("HasErrors") or not result.get("TotalSucceed"):
            raise MarketError(f"dmarket buy failed: {json.dumps(result)[:300]}")
        return listing.listing_id
