import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { dedupe, normalizeVehicle, normalizeVin, num, slugify } from '../src/lib/normalize';
import type { RawVehicle, Vehicle } from '../src/lib/types';

const NOW = '2026-09-21T12:00:00.000Z';

function build(overrides: RawVehicle = {}): Vehicle {
  const vehicle = normalizeVehicle(
    { make: 'Chevrolet', model: 'Silverado 1500', year: 2026, price: 50_000, ...overrides },
    NOW,
  );
  assert.ok(vehicle, 'expected a publishable vehicle');
  return vehicle;
}

describe('num', () => {
  it('extracts numbers from the strings feeds actually contain', () => {
    assert.equal(num('$42,394'), 42_394);
    assert.equal(num('18,201 miles'), 18_201);
    assert.equal(num(' 35995.00 '), 35_995);
    assert.equal(num(1234), 1234);
  });

  it('returns null rather than NaN for junk', () => {
    for (const input of ['', '   ', 'Call for price', null, undefined, '-', '.']) {
      assert.equal(num(input), null, `expected null for ${JSON.stringify(input)}`);
    }
  });
});

describe('normalizeVin', () => {
  it('accepts a valid 17-character VIN', () => {
    assert.equal(normalizeVin('1gcuyded5kz123456'), '1GCUYDED5KZ123456');
  });

  it('rejects wrong lengths and the letters a VIN never uses', () => {
    assert.equal(normalizeVin('1GCUYDED5KZ12345'), null);   // 16 chars
    assert.equal(normalizeVin('1GCUYDED5KZ1234567'), null); // 18 chars
    assert.equal(normalizeVin('IGCUYDED5KZ123456'), null);  // leading I
    assert.equal(normalizeVin('1GCUYDEO5KZ123456'), null);  // contains O
    assert.equal(normalizeVin('1GCUYDEQ5KZ123456'), null);  // contains Q
    assert.equal(normalizeVin(''), null);
    assert.equal(normalizeVin(null), null);
  });
});

describe('normalizeVehicle', () => {
  it('refuses records with no make or model', () => {
    assert.equal(normalizeVehicle({ make: 'Chevrolet', price: 1000 }, NOW), null);
    assert.equal(normalizeVehicle({ model: 'Tahoe', price: 1000 }, NOW), null);
    assert.equal(normalizeVehicle({}, NOW), null);
  });

  it('publishes the source price unchanged while no markup is configured', () => {
    // The markup machinery is still in place and covered in pricing.test.ts;
    // the site is simply configured at 0% today.
    const vehicle = build({ price: '$40,000' });
    assert.equal(vehicle.sourcePrice, 40_000);
    assert.equal(vehicle.price, 40_000);
    assert.equal(vehicle.markupRate, 0);
  });

  it('carries an unpriced vehicle through without a price', () => {
    const vehicle = build({ price: null });
    assert.equal(vehicle.sourcePrice, null);
    assert.equal(vehicle.price, null);
  });

  it('infers condition from the odometer when the source does not say', () => {
    assert.equal(build({ condition: null, mileage: 45_000 }).condition, 'used');
    assert.equal(build({ condition: null, mileage: 12 }).condition, 'new');
    assert.equal(build({ condition: 'Certified Pre-Owned' }).condition, 'certified');
    assert.equal(build({ condition: 'Pre-Owned' }).condition, 'used');
  });

  it('keys off the VIN when there is one, and a stable hash when there is not', () => {
    const vin = '1GCUYDED5KZ123456';
    assert.equal(build({ vin }).id, vin);

    const first = build({ vin: null, sourceUrl: 'https://example.com/a' });
    const second = build({ vin: null, sourceUrl: 'https://example.com/a' });
    const other = build({ vin: null, sourceUrl: 'https://example.com/b' });
    assert.equal(first.id, second.id, 'same input should give the same id');
    assert.notEqual(first.id, other.id);
  });

  it('preserves firstSeenAt across syncs so "recently added" stays honest', () => {
    const original = build({ vin: '1GCUYDED5KZ123456' });
    const later = normalizeVehicle(
      { make: 'Chevrolet', model: 'Silverado 1500', year: 2026, price: 50_000, vin: '1GCUYDED5KZ123456' },
      '2026-10-01T00:00:00.000Z',
      new Map([[original.id, original]]),
    )!;
    assert.equal(later.firstSeenAt, NOW);
    assert.equal(later.lastSeenAt, '2026-10-01T00:00:00.000Z');
  });

  it('drops images that are not usable URLs and de-duplicates the rest', () => {
    const vehicle = build({
      images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/1.jpg', 'javascript:alert(1)', '', '/local.jpg'],
    });
    assert.deepEqual(vehicle.images, ['https://cdn.example.com/1.jpg', '/local.jpg']);
  });

  it('rejects implausible model years', () => {
    assert.equal(build({ year: 1776 }).year, null);
    assert.equal(build({ year: 3000 }).year, null);
    assert.equal(build({ year: '2026' }).year, 2026);
  });
});

describe('slugify', () => {
  it('produces URL-safe slugs', () => {
    assert.equal(slugify('2026 Chevrolet Silverado 1500 LT Trail Boss'), '2026-chevrolet-silverado-1500-lt-trail-boss');
    assert.equal(slugify('  Mercedes-Benz  C 300 4MATIC® '), 'mercedes-benz-c-300-4matic');
  });
});

describe('dedupe', () => {
  it('collapses repeats on id, keeping the record with more photos', () => {
    const sparse = build({ vin: '1GCUYDED5KZ123456', images: [] });
    const rich = build({ vin: '1GCUYDED5KZ123456', images: ['https://cdn.example.com/1.jpg'] });
    const result = dedupe([sparse, rich]);
    assert.equal(result.length, 1);
    assert.equal(result[0].images.length, 1);
  });

  it('keeps slugs unique when two different vehicles would collide', () => {
    const a = build({ vin: null, sourceUrl: 'https://example.com/a' });
    const b = build({ vin: null, sourceUrl: 'https://example.com/b' });
    const collided = dedupe([a, { ...b, slug: a.slug }]);
    assert.equal(collided.length, 2);
    assert.equal(new Set(collided.map((v) => v.slug)).size, 2);
  });
});
