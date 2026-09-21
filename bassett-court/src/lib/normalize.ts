import { createHash } from 'node:crypto';
import type { RawVehicle, Vehicle } from './types';
import { applyMarkup } from './pricing';
import { siteConfig } from '~/site.config';

const CONDITIONS = new Set(['new', 'used', 'certified']);

function text(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}

function titleCase(value: string | null): string | null {
  if (!value) return null;
  // Leave acronyms and alphanumeric trims (LTZ, RST, 4WD, Z71) intact.
  return value
    .split(' ')
    .map((word) =>
      word.length > 3 && word === word.toUpperCase() && /[A-Z]{4,}/.test(word)
        ? word.charAt(0) + word.slice(1).toLowerCase()
        : word,
    )
    .join(' ');
}

/** Pull a number out of "$42,394", "42394.00", "18,201 miles" etc. */
export function num(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeVin(value: unknown): string | null {
  const s = text(value);
  if (!s) return null;
  const vin = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // A VIN is 17 characters and never contains I, O or Q.
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}

function normalizeCondition(raw: RawVehicle): Vehicle['condition'] {
  const value = text(raw.condition)?.toLowerCase() ?? '';
  if (CONDITIONS.has(value)) return value as Vehicle['condition'];
  if (/certified|\bcpo\b/.test(value)) return 'certified';
  if (/\bnew\b/.test(value)) return 'new';
  if (/used|pre-?owned/.test(value)) return 'used';
  // Fall back on odometer: a car with real miles on it is not new.
  const mileage = num(raw.mileage);
  if (mileage != null && mileage > 1000) return 'used';
  return 'new';
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function stableId(raw: RawVehicle, vin: string | null): string {
  if (vin) return vin;
  const basis = text(raw.sourceUrl) ?? JSON.stringify([raw.make, raw.model, raw.year, raw.stockNumber, raw.price]);
  return createHash('sha1').update(basis).digest('hex').slice(0, 16).toUpperCase();
}

function cleanImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of images) {
    const url = text(entry);
    if (!url) continue;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 30) break;
  }
  return out;
}

function cleanFeatures(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of features) {
    const feature = text(entry);
    if (!feature || feature.length > 80) continue;
    const key = feature.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(feature);
    if (out.length >= 40) break;
  }
  return out;
}

export function buildTitle(v: Pick<Vehicle, 'year' | 'make' | 'model' | 'trim'>): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
}

/**
 * Convert an adapter's raw record into a canonical Vehicle, applying the
 * configured markup. Returns null for records too incomplete to publish —
 * a listing with no make and model is noise, not inventory.
 */
export function normalizeVehicle(
  raw: RawVehicle,
  now: string,
  previous?: Map<string, Vehicle>,
): Vehicle | null {
  const make = titleCase(text(raw.make));
  const model = titleCase(text(raw.model));
  if (!make || !model) return null;

  const vin = normalizeVin(raw.vin);
  const id = stableId(raw, vin);
  const yearValue = num(raw.year);
  const year = yearValue != null && yearValue >= 1900 && yearValue <= 2100 ? Math.round(yearValue) : null;

  const sourcePrice = num(raw.price);
  const sourceMsrp = num(raw.msrp);
  const { markupRate, rounding } = siteConfig.pricing;

  const trim = titleCase(text(raw.trim));
  const slugBase = [year, make, model, trim].filter(Boolean).join(' ');
  const slugSuffix = vin ? vin.slice(-6) : id.slice(0, 6);

  const prior = previous?.get(id);

  return {
    id,
    vin,
    stockNumber: text(raw.stockNumber),
    condition: normalizeCondition(raw),
    year,
    make,
    model,
    trim,
    bodyStyle: titleCase(text(raw.bodyStyle)),
    drivetrain: text(raw.drivetrain)?.toUpperCase() ?? null,
    transmission: titleCase(text(raw.transmission)),
    fuelType: titleCase(text(raw.fuelType)),
    engine: text(raw.engine),
    exteriorColor: titleCase(text(raw.exteriorColor)),
    interiorColor: titleCase(text(raw.interiorColor)),
    doors: num(raw.doors),
    mileage: num(raw.mileage),
    sourcePrice: sourcePrice != null && sourcePrice > 0 ? Math.round(sourcePrice) : null,
    sourceMsrp: sourceMsrp != null && sourceMsrp > 0 ? Math.round(sourceMsrp) : null,
    price: applyMarkup(sourcePrice, markupRate, rounding),
    markupRate,
    images: cleanImages(raw.images),
    features: cleanFeatures(raw.features),
    description: text(raw.description),
    sourceUrl: text(raw.sourceUrl),
    slug: `${slugify(slugBase)}-${slugSuffix.toLowerCase()}`,
    firstSeenAt: prior?.firstSeenAt ?? now,
    lastSeenAt: now,
  };
}

/** Collapse duplicate records, preferring the entry with the most photos. */
export function dedupe(vehicles: Vehicle[]): Vehicle[] {
  const byId = new Map<string, Vehicle>();
  for (const vehicle of vehicles) {
    const existing = byId.get(vehicle.id);
    if (!existing || vehicle.images.length > existing.images.length) {
      byId.set(vehicle.id, vehicle);
    }
  }
  // Guard against two different vehicles colliding on the same slug.
  const slugCounts = new Map<string, number>();
  return [...byId.values()].map((vehicle) => {
    const count = slugCounts.get(vehicle.slug) ?? 0;
    slugCounts.set(vehicle.slug, count + 1);
    return count === 0 ? vehicle : { ...vehicle, slug: `${vehicle.slug}-${count + 1}` };
  });
}
