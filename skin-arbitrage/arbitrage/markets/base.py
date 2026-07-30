"""Market adapter interface + shared HTTP plumbing."""
from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC
from typing import Any

import aiohttp

from ..config import AppConfig, MarketConfig
from ..models import MarketListing, PriceReference
from ..ratelimit import RateLimiter

log = logging.getLogger("markets")


class MarketError(Exception):
    pass


class RateLimited(MarketError):
    """HTTP 429 — do not retry; back off for retry_after (or the adapter's
    escalating cooldown) before the next attempt."""

    def __init__(self, venue: str, retry_after: float = 0.0):
        super().__init__(f"{venue} rate limited (retry_after={retry_after:.0f}s)")
        self.retry_after = retry_after


class MarketAdapter(ABC):
    """A venue. Capability flags say what it can do:

    can_scan_listings — produce individual buyable listings (buy-side candidates)
    can_reference     — produce bulk lowest-ask prices (sell-side references)
    can_buy / can_sell — authenticated trading support
    """

    name: str = "base"
    can_scan_listings = False
    can_reference = False
    can_buy = False
    can_sell = False

    def __init__(self, app: AppConfig, mcfg: MarketConfig, http: aiohttp.ClientSession):
        self.app = app
        self.cfg = mcfg
        self.http = http
        self.limiter = RateLimiter(rate_per_second=1.0, burst=2)
        # 429 cooldown state: doubles on repeated rate limiting, resets on success
        self._cooldown_until = 0.0
        self._cooldown = 60.0

    def cooldown_remaining(self) -> float:
        return max(0.0, self._cooldown_until - time.monotonic())

    def note_rate_limited(self, retry_after: float = 0.0) -> None:
        wait = max(retry_after, self._cooldown)
        self._cooldown_until = time.monotonic() + wait
        self._cooldown = min(self._cooldown * 2, 900.0)
        log.warning("%s rate limited — cooling down %.0fs", self.name, wait)

    def note_success(self) -> None:
        self._cooldown = 60.0

    # ---- capabilities (override as supported) ----
    async def scan_listings(self, game: str) -> list[MarketListing]:
        return []

    async def fetch_references(self, game: str) -> list[PriceReference]:
        return []

    async def buy(self, listing: MarketListing) -> str:
        """Execute purchase; return an order/receipt id. Raises MarketError on failure."""
        raise MarketError(f"{self.name} does not support buying")

    async def create_sell_listing(self, asset_id: str, price_cents: int) -> str:
        raise MarketError(f"{self.name} does not support selling")

    async def cancel_sell_listing(self, listing_id: str) -> None:
        raise MarketError(f"{self.name} does not support selling")

    # ---- shared HTTP helper with retry/backoff ----
    async def _request_json(self, method: str, url: str, *, headers: dict[str, str] | None = None,
                            params: dict[str, Any] | None = None, json_body: Any = None,
                            retries: int = 3) -> Any:
        await self.limiter.acquire()
        delay = 2.0
        for attempt in range(retries + 1):
            try:
                async with self.http.request(
                    method, url, headers=headers, params=params, json=json_body,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 429:
                        try:
                            retry_after = float(resp.headers.get("Retry-After", 0))
                        except ValueError:
                            retry_after = 0.0
                        raise RateLimited(self.name, retry_after)
                    if resp.status >= 500:
                        raise MarketError(f"{self.name} HTTP {resp.status}")
                    if resp.status >= 400:
                        text = await resp.text()
                        raise MarketError(f"{self.name} HTTP {resp.status}: {text[:300]}")
                    self.note_success()
                    return await resp.json(content_type=None)
            except RateLimited:
                raise  # never retried here — callers must honor the cooldown
            except (aiohttp.ClientError, asyncio.TimeoutError, MarketError) as e:
                retryable = not (isinstance(e, MarketError) and "HTTP 4" in str(e))
                if attempt >= retries or not retryable:
                    raise
                log.warning("%s request failed (%s), retrying in %.0fs", self.name, e, delay)
                await asyncio.sleep(delay)
                delay *= 2
