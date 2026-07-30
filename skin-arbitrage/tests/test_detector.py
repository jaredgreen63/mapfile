from arbitrage.config import AppConfig, MarketConfig, StrategyConfig
from arbitrage.engine.detector import evaluate_listing
from arbitrage.models import MarketListing, PriceReference


def make_cfg() -> AppConfig:
    cfg = AppConfig()
    cfg.strategy = StrategyConfig(
        min_margin_pct=8.0, min_profit_cents=50, min_item_price_cents=100,
        max_item_price_cents=15000, reference_safety_pct=0.0, min_reference_quantity=3,
    )
    cfg.markets = {
        "csfloat": MarketConfig(enabled=True, fee_pct=2.0),
        "skinport": MarketConfig(enabled=True, fee_pct=12.0),
    }
    return cfg


def listing(price: int, name: str = "AK-47 | Redline (Field-Tested)") -> MarketListing:
    return MarketListing(venue="csfloat", listing_id="L1", game="cs2",
                         market_hash_name=name, price_cents=price)


def ref(venue: str, price: int, qty: int = 10) -> PriceReference:
    return PriceReference(venue=venue, game="cs2",
                          market_hash_name="AK-47 | Redline (Field-Tested)",
                          price_cents=price, quantity=qty)


SELLABLE = {"csfloat", "skinport"}


def test_profitable_deal_detected():
    # buy $10.00, skinport ref $13.00 -> net 13.00*0.88 = 11.44 -> profit 1.44 (14.4%)
    cand = evaluate_listing(listing(1000), {"skinport": ref("skinport", 1300)},
                            make_cfg(), SELLABLE)
    assert cand is not None
    assert cand.ref_venue == "skinport"
    assert cand.est_profit_cents == 144
    assert cand.margin_pct == 14.4


def test_thin_margin_rejected():
    # buy $10.00, ref $11.00 -> net 9.68 -> negative after fees
    cand = evaluate_listing(listing(1000), {"skinport": ref("skinport", 1100)},
                            make_cfg(), SELLABLE)
    assert cand is None


def test_same_venue_ref_ignored():
    cand = evaluate_listing(listing(1000), {"csfloat": ref("csfloat", 2000)},
                            make_cfg(), SELLABLE)
    assert cand is None


def test_illiquid_reference_rejected():
    cand = evaluate_listing(listing(1000), {"skinport": ref("skinport", 1300, qty=1)},
                            make_cfg(), SELLABLE)
    assert cand is None


def test_price_bounds_enforced():
    cfg = make_cfg()
    assert evaluate_listing(listing(50), {"skinport": ref("skinport", 200)},
                            cfg, SELLABLE) is None
    assert evaluate_listing(listing(20000), {"skinport": ref("skinport", 30000)},
                            cfg, SELLABLE) is None


def test_blacklisted_name_rejected():
    cfg = make_cfg()
    bad = listing(1000, name="Souvenir AWP | Safari Mesh (Field-Tested)")
    assert evaluate_listing(bad, {"skinport": ref("skinport", 1300)}, cfg, SELLABLE) is None


def test_best_venue_chosen():
    cfg = make_cfg()
    refs = {"skinport": ref("skinport", 1300)}
    # add a second sellable venue with a lower fee and same price
    cfg.markets["dmarket"] = MarketConfig(enabled=True, fee_pct=7.0)
    refs["dmarket"] = PriceReference(venue="dmarket", game="cs2",
                                     market_hash_name="AK-47 | Redline (Field-Tested)",
                                     price_cents=1300, quantity=10)
    cand = evaluate_listing(listing(1000), refs, cfg, SELLABLE | {"dmarket"})
    assert cand is not None
    assert cand.ref_venue == "dmarket"  # 7% fee beats 12%
