"""Plain data types passed between market adapters and the engine.

All money values are integer cents in the configured currency (USD by default).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class MarketListing:
    venue: str
    listing_id: str
    game: str  # "cs2" | "rust"
    market_hash_name: str
    price_cents: int
    float_value: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class PriceReference:
    venue: str
    game: str
    market_hash_name: str
    price_cents: int  # lowest ask on that venue
    quantity: int  # listings available (liquidity signal)


@dataclass
class DealCandidate:
    listing: MarketListing
    ref_venue: str
    ref_price_cents: int
    est_net_proceeds_cents: int
    est_profit_cents: int
    margin_pct: float
