from arbitrage.fees import breakeven_sale_price_cents, margin_pct, net_proceeds_cents


def test_net_proceeds_basic():
    # $100 sale, 12% fee -> $88
    assert net_proceeds_cents(10000, 12.0) == 8800


def test_net_proceeds_with_safety_haircut():
    # $100 sale, 12% fee, 3% haircut -> 100 * 0.97 * 0.88 = 85.36
    assert net_proceeds_cents(10000, 12.0, 3.0) == 8536


def test_margin_pct():
    assert margin_pct(500, 5000) == 10.0
    assert margin_pct(0, 5000) == 0.0
    assert margin_pct(100, 0) == 0.0


def test_breakeven_covers_fee():
    cost = 5000
    fee = 12.0
    price = breakeven_sale_price_cents(cost, fee)
    assert net_proceeds_cents(price, fee) >= cost
