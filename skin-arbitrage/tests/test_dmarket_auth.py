import asyncio

import aiohttp
import pytest

from arbitrage.config import AppConfig, MarketConfig
from arbitrage.markets.dmarket import DMarketAdapter

FAKE_SECRET = "ab" * 32  # 32-byte ed25519 seed as hex


def make_adapter(with_keys: bool) -> DMarketAdapter:
    async def build():
        app = AppConfig()
        if with_keys:
            app.dmarket_public_key = "pubkey123"
            app.dmarket_secret_key = FAKE_SECRET
        async with aiohttp.ClientSession() as http:
            return DMarketAdapter(app, MarketConfig(enabled=True), http)
    return asyncio.run(build())


def test_unavailable_without_keys():
    adapter = make_adapter(with_keys=False)
    assert not adapter.available
    assert not adapter.can_buy
    assert "DMARKET_PUBLIC_KEY" in adapter.unavailable_reason


def test_available_with_keys():
    adapter = make_adapter(with_keys=True)
    assert adapter.available
    assert adapter.can_buy


def test_signed_headers_shape():
    adapter = make_adapter(with_keys=True)
    headers = adapter._signed_headers("GET", "/marketplace-api/v2/offers?gameId=a8db&limit=5")
    assert headers["X-Api-Key"] == "pubkey123"
    assert headers["X-Request-Sign"].startswith("dmar ed25519 ")
    # ed25519 signature is 64 bytes -> 128 hex chars
    assert len(headers["X-Request-Sign"].split()[-1]) == 128
    assert headers["X-Sign-Date"].isdigit()


def test_signature_covers_query_string():
    adapter = make_adapter(with_keys=True)
    a = adapter._signed_headers("GET", "/marketplace-api/v2/offers?gameId=a8db")
    b = adapter._signed_headers("GET", "/marketplace-api/v2/offers?gameId=rust")
    assert a["X-Request-Sign"] != b["X-Request-Sign"]
