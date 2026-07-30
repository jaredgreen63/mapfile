import asyncio

import aiohttp
import pytest

from arbitrage.config import AppConfig, MarketConfig
from arbitrage.markets.base import MarketAdapter, RateLimited


class FakeAdapter(MarketAdapter):
    name = "fake"


@pytest.fixture()
def adapter():
    async def make():
        async with aiohttp.ClientSession() as http:
            return FakeAdapter(AppConfig(), MarketConfig(), http)
    return asyncio.run(make())


def test_cooldown_escalates_and_resets(adapter):
    assert adapter.cooldown_remaining() == 0.0
    adapter.note_rate_limited()
    first = adapter.cooldown_remaining()
    assert 55 <= first <= 60
    adapter.note_rate_limited()
    assert 115 <= adapter.cooldown_remaining() <= 120  # doubled
    adapter.note_success()
    adapter.note_rate_limited()
    assert adapter.cooldown_remaining() <= 60  # reset after success


def test_retry_after_header_respected(adapter):
    adapter.note_rate_limited(retry_after=300)
    assert 295 <= adapter.cooldown_remaining() <= 300


def test_cooldown_caps_at_15_minutes(adapter):
    for _ in range(10):
        adapter.note_rate_limited()
    assert adapter.cooldown_remaining() <= 900


def test_rate_limited_carries_retry_after():
    err = RateLimited("fake", 42.0)
    assert err.retry_after == 42.0
    assert isinstance(err, Exception)
