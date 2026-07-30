"""Fee math. All values integer cents; fees are configurable per venue.

Defaults reflect typical published rates (verify against each site — they change):
  csfloat  ~2%   seller fee
  skinport ~12%  seller fee (lower for high-value items)
  dmarket  ~5-10% seller fee depending on item/game
  steam    ~15%  (13% + 2%) and proceeds are wallet-locked, not cash
"""
from __future__ import annotations


def net_proceeds_cents(sale_price_cents: int, fee_pct: float, safety_pct: float = 0.0) -> int:
    """What we actually receive from selling at sale_price on a venue.

    safety_pct is an extra haircut for price movement between detection and sale.
    """
    price = sale_price_cents * (1.0 - safety_pct / 100.0)
    return int(price * (1.0 - fee_pct / 100.0))


def margin_pct(profit_cents: int, cost_cents: int) -> float:
    if cost_cents <= 0:
        return 0.0
    return round(profit_cents / cost_cents * 100.0, 2)


def breakeven_sale_price_cents(cost_cents: int, fee_pct: float) -> int:
    """Minimum sale price that recovers cost after the venue's seller fee."""
    return int(cost_cents / (1.0 - fee_pct / 100.0)) + 1
