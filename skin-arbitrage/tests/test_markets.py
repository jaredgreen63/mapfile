from arbitrage.markets.dmarket import DMarketAdapter


def test_price_parsing_all_shapes():
    parse = DMarketAdapter._price_cents
    assert parse({"price": {"USD": "150"}}) == 150
    assert parse({"price": {"amount": "150", "currency": "USD"}}) == 150
    assert parse({"price": {"Amount": "150", "Currency": "USD"}}) == 150
    assert parse({"price": {}}) is None
    assert parse({}) is None
    assert parse({"price": {"USD": "garbage"}}) is None


def test_offer_id_fallbacks():
    oid = DMarketAdapter._offer_id
    assert oid({"offerId": "abc"}) == "abc"
    assert oid({"extra": {"offerId": "xyz"}, "itemId": "item1"}) == "xyz"
    assert oid({"itemId": "item1"}) == "item1"
    assert oid({}) is None
