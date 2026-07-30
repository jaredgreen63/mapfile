"""Minimal async token-bucket rate limiter (per-adapter)."""
from __future__ import annotations

import asyncio
import time


class RateLimiter:
    def __init__(self, rate_per_second: float, burst: int = 1):
        self.rate = max(rate_per_second, 0.001)
        self.burst = max(burst, 1)
        self._tokens = float(self.burst)
        self._last = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                self._tokens = min(self.burst, self._tokens + (now - self._last) * self.rate)
                self._last = now
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return
                await asyncio.sleep((1.0 - self._tokens) / self.rate)
