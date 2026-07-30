"""Deal detection: pure margin logic, kept side-effect free for testability."""
from __future__ import annotations

from ..config import AppConfig
from ..fees import margin_pct, net_proceeds_cents
from ..models import DealCandidate, MarketListing, PriceReference


def evaluate_listing(
    listing: MarketListing,
    refs_by_venue: dict[str, PriceReference],
    cfg: AppConfig,
    sellable_venues: set[str],
) -> DealCandidate | None:
    """Compare a buyable listing against sell-side references on other venues.

    refs_by_venue: current lowest asks for this item keyed by venue.
    sellable_venues: venues we could actually liquidate on (sell_enabled or
    at minimum reference venues we'd manually sell through).
    """
    strat = cfg.strategy

    if listing.price_cents < strat.min_item_price_cents:
        return None
    if listing.price_cents > strat.max_item_price_cents:
        return None
    for bad in cfg.blacklist_substrings:
        if bad and bad.lower() in listing.market_hash_name.lower():
            return None

    best: DealCandidate | None = None
    for venue, ref in refs_by_venue.items():
        if venue == listing.venue or venue not in sellable_venues:
            continue
        if ref.quantity < strat.min_reference_quantity:
            continue
        fee_pct = cfg.markets.get(venue).fee_pct if venue in cfg.markets else 15.0
        proceeds = net_proceeds_cents(ref.price_cents, fee_pct, strat.reference_safety_pct)
        profit = proceeds - listing.price_cents
        margin = margin_pct(profit, listing.price_cents)
        if profit < strat.min_profit_cents or margin < strat.min_margin_pct:
            continue
        if best is None or profit > best.est_profit_cents:
            best = DealCandidate(
                listing=listing, ref_venue=venue, ref_price_cents=ref.price_cents,
                est_net_proceeds_cents=proceeds, est_profit_cents=profit,
                margin_pct=margin,
            )
    return best
