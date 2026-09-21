// Server-only: reads the snapshot from disk at build/render time.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { InventorySnapshot, Vehicle } from './types';
import { siteConfig } from '~/site.config';

const SNAPSHOT_PATH = resolve(process.cwd(), 'data/inventory.json');

const EMPTY: InventorySnapshot = {
  generatedAt: new Date(0).toISOString(),
  sourceUrl: siteConfig.inventory.sourceUrl,
  sourceName: siteConfig.inventory.sourceName,
  adapter: 'none',
  markupRate: siteConfig.pricing.markupRate,
  vehicleCount: 0,
  vehicles: [],
};

let cached: InventorySnapshot | null = null;

/**
 * Read the synced snapshot. Cached for the lifetime of the process, which is
 * correct for both `next build` and a running server: the snapshot only ever
 * changes via a sync + redeploy.
 */
export async function getSnapshot(): Promise<InventorySnapshot> {
  if (cached) return cached;
  try {
    const raw = await readFile(SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as InventorySnapshot;
    cached = Array.isArray(parsed.vehicles) ? parsed : EMPTY;
  } catch {
    // A missing snapshot is a first-run state, not an error. Render an empty
    // catalogue rather than failing the build.
    cached = EMPTY;
  }
  return cached;
}

export async function getVehicles(): Promise<Vehicle[]> {
  return (await getSnapshot()).vehicles;
}

export async function getVehicleBySlug(slug: string): Promise<Vehicle | null> {
  const vehicles = await getVehicles();
  return vehicles.find((vehicle) => vehicle.slug === slug) ?? null;
}

/** A few comparable units to show at the bottom of a detail page. */
export async function getSimilarVehicles(vehicle: Vehicle, count = 3): Promise<Vehicle[]> {
  const vehicles = await getVehicles();

  const score = (candidate: Vehicle): number => {
    if (candidate.id === vehicle.id) return -Infinity;
    let points = 0;
    if (candidate.bodyStyle && candidate.bodyStyle === vehicle.bodyStyle) points += 3;
    if (candidate.make === vehicle.make) points += 2;
    if (candidate.model === vehicle.model) points += 2;
    if (candidate.condition === vehicle.condition) points += 1;
    if (vehicle.price != null && candidate.price != null) {
      const gap = Math.abs(candidate.price - vehicle.price) / vehicle.price;
      if (gap < 0.15) points += 3;
      else if (gap < 0.3) points += 1;
    }
    return points;
  };

  return [...vehicles]
    .map((candidate) => ({ candidate, points: score(candidate) }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, count)
    .map((entry) => entry.candidate);
}

export interface InventoryFacets {
  conditions: { value: string; count: number }[];
  makes: { value: string; count: number }[];
  models: { value: string; count: number }[];
  bodyStyles: { value: string; count: number }[];
  drivetrains: { value: string; count: number }[];
  fuelTypes: { value: string; count: number }[];
  years: number[];
  priceRange: { min: number; max: number };
  mileageMax: number;
}

function tally(values: (string | null)[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function buildFacets(vehicles: Vehicle[]): InventoryFacets {
  const prices = vehicles.map((v) => v.price).filter((p): p is number => p != null && p > 0);
  const mileages = vehicles.map((v) => v.mileage).filter((m): m is number => m != null && m >= 0);

  return {
    conditions: tally(vehicles.map((v) => v.condition)),
    makes: tally(vehicles.map((v) => v.make)),
    models: tally(vehicles.map((v) => v.model)),
    bodyStyles: tally(vehicles.map((v) => v.bodyStyle)),
    drivetrains: tally(vehicles.map((v) => v.drivetrain)),
    fuelTypes: tally(vehicles.map((v) => v.fuelType)),
    years: [...new Set(vehicles.map((v) => v.year).filter((y): y is number => y != null))].sort((a, b) => b - a),
    priceRange: {
      min: prices.length ? Math.floor(Math.min(...prices) / 1000) * 1000 : 0,
      max: prices.length ? Math.ceil(Math.max(...prices) / 1000) * 1000 : 100_000,
    },
    mileageMax: mileages.length ? Math.ceil(Math.max(...mileages) / 5000) * 5000 : 150_000,
  };
}
