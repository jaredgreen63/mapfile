import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { diffSnapshots } from '../src/lib/diff';
import { normalizeVehicle } from '../src/lib/normalize';
import type { Vehicle } from '../src/lib/types';

const NOW = '2026-09-21T12:00:00.000Z';

function vehicle(vin: string, price: number | null): Vehicle {
  return normalizeVehicle({ vin, make: 'Chevrolet', model: 'Tahoe', year: 2026, price }, NOW)!;
}

const A = vehicle('1GNSKPKD5RR100001', 60_000);
const B = vehicle('1GNSKPKD5RR100002', 70_000);
const C = vehicle('1GNSKPKD5RR100003', 80_000);

describe('diffSnapshots', () => {
  it('reports a vehicle that appeared upstream as added', () => {
    const diff = diffSnapshots([A], [A, B]);
    assert.deepEqual(diff.added, [B.id]);
    assert.deepEqual(diff.removed, []);
    assert.equal(diff.unchanged, 1);
  });

  it('reports a vehicle that left upstream as removed', () => {
    // This is the behaviour that takes sold vehicles off the site.
    const diff = diffSnapshots([A, B], [A]);
    assert.deepEqual(diff.removed, [B.id]);
    assert.deepEqual(diff.added, []);
  });

  it('reports a price change without counting it as add or remove', () => {
    const repriced = vehicle('1GNSKPKD5RR100001', 58_000);
    const diff = diffSnapshots([A], [repriced]);
    assert.equal(diff.repriced.length, 1);
    assert.equal(diff.repriced[0].from, A.price);
    assert.equal(diff.repriced[0].to, repriced.price);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, []);
  });

  it('treats a vehicle losing its price as a reprice, not a removal', () => {
    const unpriced = vehicle('1GNSKPKD5RR100001', null);
    const diff = diffSnapshots([A], [unpriced]);
    assert.equal(diff.repriced.length, 1);
    assert.equal(diff.repriced[0].to, null);
  });

  it('handles a first run against an empty previous snapshot', () => {
    const diff = diffSnapshots([], [A, B, C]);
    assert.equal(diff.added.length, 3);
    assert.equal(diff.unchanged, 0);
  });

  it('handles the whole catalogue disappearing', () => {
    const diff = diffSnapshots([A, B, C], []);
    assert.equal(diff.removed.length, 3);
    assert.equal(diff.added.length, 0);
  });

  it('is order-independent', () => {
    const forward = diffSnapshots([A, B], [B, A]);
    assert.deepEqual(forward.added, []);
    assert.deepEqual(forward.removed, []);
    assert.equal(forward.unchanged, 2);
  });
});
