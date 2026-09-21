import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { applyMarkup, formatMileage, formatPrice, monthlyPayment, roundPrice } from '../src/lib/pricing';

describe('applyMarkup', () => {
  it('applies a 3% markup', () => {
    // 30,000 * 1.03 = 30,900, already on a 25 boundary.
    assert.equal(applyMarkup(30_000, 0.03, 'none'), 30_900);
  });

  it('rounds to the configured boundary', () => {
    // 28,499 * 1.03 = 29,353.97
    assert.equal(applyMarkup(28_499, 0.03, 'none'), 29_354);
    assert.equal(applyMarkup(28_499, 0.03, 'nearest-5'), 29_355);
    assert.equal(applyMarkup(28_499, 0.03, 'nearest-25'), 29_350);
    assert.equal(applyMarkup(28_499, 0.03, 'nearest-100'), 29_400);
    assert.equal(applyMarkup(28_499, 0.03, 'dealer-95'), 29_395);
  });

  it('never invents a price for a vehicle that has none', () => {
    for (const input of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(applyMarkup(input as number | null, 0.03), null);
    }
  });

  it('honours a markup rate other than 3%', () => {
    assert.equal(applyMarkup(20_000, 0, 'none'), 20_000);
    assert.equal(applyMarkup(20_000, 0.1, 'none'), 22_000);
  });

  it('is monotonic — a dearer vehicle never prices below a cheaper one', () => {
    let previous = 0;
    for (let source = 5_000; source <= 200_000; source += 137) {
      const price = applyMarkup(source, 0.03, 'nearest-25')!;
      assert.ok(price >= previous, `price went backwards at source ${source}`);
      previous = price;
    }
  });
});

describe('roundPrice', () => {
  it('always lands on a x95 ending in dealer-95 mode', () => {
    for (let value = 1_000; value < 100_000; value += 311) {
      const rounded = roundPrice(value, 'dealer-95');
      assert.equal(rounded % 100, 95, `${value} -> ${rounded}`);
      assert.ok(rounded >= value, `${value} rounded down to ${rounded}`);
      assert.ok(rounded - value < 100, `${value} rounded up too far to ${rounded}`);
    }
  });
});

describe('formatPrice', () => {
  it('formats whole dollars', () => {
    assert.equal(formatPrice(31_150), '$31,150');
  });

  it('falls back rather than printing $0', () => {
    assert.equal(formatPrice(null), 'Call for Price');
    assert.equal(formatPrice(0), 'Call for Price');
    assert.equal(formatPrice(undefined, '—'), '—');
  });
});

describe('formatMileage', () => {
  it('formats and handles the edges', () => {
    assert.equal(formatMileage(18_201), '18,201 mi');
    assert.equal(formatMileage(0), '0 mi');
    assert.equal(formatMileage(null), '—');
  });
});

describe('monthlyPayment', () => {
  it('matches a standard amortization', () => {
    // 30,000 at 7.9% over 72 months -> $524.53/mo
    const payment = monthlyPayment(30_000, 7.9, 72)!;
    assert.ok(Math.abs(payment - 524.53) < 0.5, `got ${payment}`);
  });

  it('degenerates to simple division at 0% APR', () => {
    assert.equal(monthlyPayment(24_000, 0, 48), 500);
  });

  it('returns null for inputs that cannot produce a payment', () => {
    assert.equal(monthlyPayment(0, 5, 60), null);
    assert.equal(monthlyPayment(10_000, 5, 0), null);
  });
});
