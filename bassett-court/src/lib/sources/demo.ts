import type { AdapterOptions, RawVehicle, SourceAdapter } from '../types';

/**
 * Deterministic sample inventory.
 *
 * Used for local development, for preview deploys, and as the fallback when the
 * live source cannot be reached — a site that renders is easier to review than
 * an empty one. The generator is seeded, so repeated runs produce identical
 * output and the committed snapshot does not churn.
 *
 * These are not real listings and carry no photography.
 */

/** mulberry32 — small, fast, deterministic. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ModelSpec {
  model: string;
  trims: string[];
  body: string;
  priceLow: number;
  priceHigh: number;
  fuel: string;
  drivetrains: string[];
  doors: number;
}

const NEW_MODELS: ModelSpec[] = [
  { model: 'Trax', trims: ['LS', '1RS', 'LT', 'ACTIV', '2RS'], body: 'SUV', priceLow: 21_500, priceHigh: 25_900, fuel: 'Gasoline', drivetrains: ['FWD'], doors: 4 },
  { model: 'Trailblazer', trims: ['LS', 'LT', 'ACTIV', 'RS'], body: 'SUV', priceLow: 24_100, priceHigh: 30_400, fuel: 'Gasoline', drivetrains: ['FWD', 'AWD'], doors: 4 },
  { model: 'Equinox', trims: ['LT', 'RS', 'ACTIV', 'Premier'], body: 'SUV', priceLow: 28_600, priceHigh: 36_200, fuel: 'Gasoline', drivetrains: ['FWD', 'AWD'], doors: 4 },
  { model: 'Equinox EV', trims: ['LT', 'RS'], body: 'SUV', priceLow: 34_900, priceHigh: 45_300, fuel: 'Electric', drivetrains: ['FWD', 'AWD'], doors: 4 },
  { model: 'Blazer', trims: ['LT', 'RS', 'Premier'], body: 'SUV', priceLow: 36_800, priceHigh: 46_500, fuel: 'Gasoline', drivetrains: ['FWD', 'AWD'], doors: 4 },
  { model: 'Blazer EV', trims: ['LT', 'RS', 'SS'], body: 'SUV', priceLow: 45_200, priceHigh: 62_400, fuel: 'Electric', drivetrains: ['FWD', 'AWD'], doors: 4 },
  { model: 'Traverse', trims: ['LS', 'LT', 'Z71', 'RS', 'High Country'], body: 'SUV', priceLow: 39_900, priceHigh: 55_800, fuel: 'Gasoline', drivetrains: ['FWD', 'AWD'], doors: 4 },
  { model: 'Tahoe', trims: ['LS', 'LT', 'RST', 'Z71', 'Premier', 'High Country'], body: 'SUV', priceLow: 59_800, priceHigh: 79_600, fuel: 'Gasoline', drivetrains: ['RWD', '4WD'], doors: 4 },
  { model: 'Suburban', trims: ['LS', 'LT', 'RST', 'Z71', 'High Country'], body: 'SUV', priceLow: 62_900, priceHigh: 83_100, fuel: 'Gasoline', drivetrains: ['RWD', '4WD'], doors: 4 },
  { model: 'Colorado', trims: ['WT', 'LT', 'Trail Boss', 'Z71', 'ZR2'], body: 'Truck', priceLow: 31_600, priceHigh: 49_200, fuel: 'Gasoline', drivetrains: ['RWD', '4WD'], doors: 4 },
  { model: 'Silverado 1500', trims: ['WT', 'Custom', 'LT', 'RST', 'LT Trail Boss', 'LTZ', 'High Country'], body: 'Truck', priceLow: 37_500, priceHigh: 73_400, fuel: 'Gasoline', drivetrains: ['RWD', '4WD'], doors: 4 },
  { model: 'Silverado 2500HD', trims: ['WT', 'Custom', 'LT', 'LTZ', 'High Country'], body: 'Truck', priceLow: 46_900, priceHigh: 89_200, fuel: 'Diesel', drivetrains: ['RWD', '4WD'], doors: 4 },
  { model: 'Corvette Stingray', trims: ['1LT', '2LT', '3LT'], body: 'Coupe', priceLow: 70_900, priceHigh: 96_800, fuel: 'Gasoline', drivetrains: ['RWD'], doors: 2 },
];

const USED_MODELS: { make: string; model: string; trims: string[]; body: string; priceLow: number; priceHigh: number; fuel: string; drivetrains: string[]; doors: number }[] = [
  { make: 'Ford', model: 'F-150', trims: ['XLT', 'Lariat', 'STX'], body: 'Truck', priceLow: 27_900, priceHigh: 52_400, fuel: 'Gasoline', drivetrains: ['RWD', '4WD'], doors: 4 },
  { make: 'Toyota', model: 'RAV4', trims: ['LE', 'XLE', 'Adventure'], body: 'SUV', priceLow: 21_400, priceHigh: 34_800, fuel: 'Gasoline', drivetrains: ['FWD', 'AWD'], doors: 4 },
  { make: 'Toyota', model: 'Tacoma', trims: ['SR5', 'TRD Sport', 'TRD Off-Road'], body: 'Truck', priceLow: 26_800, priceHigh: 44_900, fuel: 'Gasoline', drivetrains: ['RWD', '4WD'], doors: 4 },
  { make: 'Honda', model: 'Civic', trims: ['LX', 'Sport', 'EX-L'], body: 'Sedan', priceLow: 17_900, priceHigh: 27_600, fuel: 'Gasoline', drivetrains: ['FWD'], doors: 4 },
  { make: 'Jeep', model: 'Grand Cherokee', trims: ['Laredo', 'Limited', 'Altitude'], body: 'SUV', priceLow: 22_500, priceHigh: 41_200, fuel: 'Gasoline', drivetrains: ['RWD', '4WD'], doors: 4 },
  { make: 'Jeep', model: 'Wrangler', trims: ['Sport S', 'Willys', 'Rubicon'], body: 'SUV', priceLow: 26_400, priceHigh: 48_700, fuel: 'Gasoline', drivetrains: ['4WD'], doors: 4 },
  { make: 'GMC', model: 'Sierra 1500', trims: ['SLE', 'SLT', 'Elevation'], body: 'Truck', priceLow: 29_900, priceHigh: 56_300, fuel: 'Gasoline', drivetrains: ['RWD', '4WD'], doors: 4 },
  { make: 'Nissan', model: 'Altima', trims: ['S', 'SV', 'SR'], body: 'Sedan', priceLow: 14_900, priceHigh: 24_400, fuel: 'Gasoline', drivetrains: ['FWD', 'AWD'], doors: 4 },
  { make: 'Chevrolet', model: 'Malibu', trims: ['LS', 'RS', 'LT'], body: 'Sedan', priceLow: 14_200, priceHigh: 23_900, fuel: 'Gasoline', drivetrains: ['FWD'], doors: 4 },
  { make: 'Chevrolet', model: 'Camaro', trims: ['1LT', '2SS', 'LT1'], body: 'Coupe', priceLow: 24_600, priceHigh: 46_800, fuel: 'Gasoline', drivetrains: ['RWD'], doors: 2 },
];

const EXTERIOR_COLORS = [
  'Summit White', 'Black', 'Sterling Gray Metallic', 'Radiant Red Tintcoat',
  'Lakeshore Blue Metallic', 'Sterling Silver Metallic', 'Cacti Green',
  'Dark Ash Metallic', 'Riptide Blue Metallic', 'Meteorite Gray Metallic',
];
const INTERIOR_COLORS = ['Jet Black', 'Gideon / Very Dark Atmosphere', 'Medium Ash Gray', 'Adrenaline Red'];
const TRANSMISSIONS = ['8-Speed Automatic', '10-Speed Automatic', 'Single-Speed', 'CVT'];

const FEATURE_POOL = [
  'Apple CarPlay', 'Android Auto', 'Heated Front Seats', 'Ventilated Front Seats',
  'Remote Start', 'Adaptive Cruise Control', 'Blind Spot Monitoring',
  'Lane Keep Assist', 'Rear Cross Traffic Alert', 'Power Liftgate', 'Sunroof',
  'Panoramic Sunroof', 'Leather Upholstery', 'Wireless Charging',
  'Bose Premium Audio', 'Trailering Package', 'Heated Steering Wheel',
  '360-Degree Camera', 'Third-Row Seating', 'Navigation System',
  'Head-Up Display', 'Rear Park Assist',
];

const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

function makeVin(random: () => number): string {
  let vin = '';
  for (let i = 0; i < 17; i += 1) {
    vin += VIN_CHARS[Math.floor(random() * VIN_CHARS.length)];
  }
  return vin;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function pickMany<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const chosen: T[] = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return chosen;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}


/** Engines that actually belong under the hood of each model, so the sample
 *  data does not read as nonsense to anyone who knows the cars. */
const ENGINES_BY_MODEL: Record<string, string[]> = {
  Trax: ['1.2L Turbo 3-Cylinder'],
  Trailblazer: ['1.3L Turbo 3-Cylinder', '1.2L Turbo 3-Cylinder'],
  Equinox: ['1.5L Turbo 4-Cylinder'],
  Blazer: ['2.0L Turbo 4-Cylinder', '3.6L V6'],
  Traverse: ['2.5L Turbo 4-Cylinder'],
  Tahoe: ['5.3L V8', '6.2L V8', '3.0L Turbo-Diesel I6'],
  Suburban: ['5.3L V8', '6.2L V8', '3.0L Turbo-Diesel I6'],
  Colorado: ['2.7L Turbo 4-Cylinder'],
  'Silverado 1500': ['2.7L Turbo 4-Cylinder', '5.3L V8', '6.2L V8'],
  'Silverado 2500HD': ['6.6L Duramax Turbo-Diesel V8', '6.6L V8'],
  'Corvette Stingray': ['6.2L V8'],
  'F-150': ['2.7L EcoBoost V6', '3.5L EcoBoost V6', '5.0L V8'],
  RAV4: ['2.5L 4-Cylinder'],
  Tacoma: ['2.4L Turbo 4-Cylinder', '3.5L V6'],
  Civic: ['2.0L 4-Cylinder', '1.5L Turbo 4-Cylinder'],
  'Grand Cherokee': ['3.6L V6', '5.7L V8'],
  Wrangler: ['3.6L V6', '2.0L Turbo 4-Cylinder'],
  'Sierra 1500': ['5.3L V8', '2.7L Turbo 4-Cylinder'],
  Altima: ['2.5L 4-Cylinder'],
  Malibu: ['1.5L Turbo 4-Cylinder'],
  Camaro: ['3.6L V6', '6.2L V8'],
};

function engineFor(model: string, fuel: string, random: () => number): string {
  if (fuel === 'Electric') return 'Electric Drive Unit';
  const options = ENGINES_BY_MODEL[model];
  return options ? pick(options, random) : '2.5L 4-Cylinder';
}

export function buildDemoInventory(count = 54, seed = 20260921): RawVehicle[] {
  const random = rng(seed);
  const vehicles: RawVehicle[] = [];
  const currentYear = 2026;
  const newCount = Math.round(count * 0.65);

  for (let i = 0; i < count; i += 1) {
    const isNew = i < newCount;

    if (isNew) {
      const spec = pick(NEW_MODELS, random);
      const trim = pick(spec.trims, random);
      const msrp = roundTo(spec.priceLow + random() * (spec.priceHigh - spec.priceLow), 5);
      // A handful of units are published without a price, as happens with
      // in-transit and allocation stock.
      const priced = random() > 0.06;

      vehicles.push({
        vin: makeVin(random),
        stockNumber: `N${String(10_000 + Math.floor(random() * 89_999))}`,
        condition: 'new',
        year: random() > 0.25 ? currentYear : currentYear - 1,
        make: 'Chevrolet',
        model: spec.model,
        trim,
        bodyStyle: spec.body,
        drivetrain: pick(spec.drivetrains, random),
        transmission: spec.fuel === 'Electric' ? 'Single-Speed' : pick(TRANSMISSIONS.slice(0, 2), random),
        fuelType: spec.fuel,
        engine: engineFor(spec.model, spec.fuel, random),
        exteriorColor: pick(EXTERIOR_COLORS, random),
        interiorColor: pick(INTERIOR_COLORS, random),
        doors: spec.doors,
        mileage: Math.floor(random() * 24),
        price: priced ? msrp : null,
        msrp,
        images: [],
        features: pickMany(FEATURE_POOL, 5 + Math.floor(random() * 6), random),
        description: `${currentYear} Chevrolet ${spec.model} ${trim} in ${spec.body.toLowerCase()} configuration. Factory warranty, ready for immediate delivery.`,
        sourceUrl: null,
      });
      continue;
    }

    const spec = pick(USED_MODELS, random);
    const trim = pick(spec.trims, random);
    const age = 1 + Math.floor(random() * 7);
    const mileage = roundTo(age * (9_000 + random() * 8_000), 100);
    const price = roundTo(spec.priceLow + random() * (spec.priceHigh - spec.priceLow), 5);
    const certified = spec.make === 'Chevrolet' && age <= 5 && random() > 0.6;

    vehicles.push({
      vin: makeVin(random),
      stockNumber: `U${String(10_000 + Math.floor(random() * 89_999))}`,
      condition: certified ? 'certified' : 'used',
      year: currentYear - age,
      make: spec.make,
      model: spec.model,
      trim,
      bodyStyle: spec.body,
      drivetrain: pick(spec.drivetrains, random),
      transmission: pick(TRANSMISSIONS, random),
      fuelType: spec.fuel,
      engine: engineFor(spec.model, spec.fuel, random),
      exteriorColor: pick(EXTERIOR_COLORS, random),
      interiorColor: pick(INTERIOR_COLORS, random),
      doors: spec.doors,
      mileage,
      price,
      msrp: null,
      images: [],
      features: pickMany(FEATURE_POOL, 4 + Math.floor(random() * 5), random),
      description: `${currentYear - age} ${spec.make} ${spec.model} ${trim}. Inspected, reconditioned and ready for the road.`,
      sourceUrl: null,
    });
  }

  return vehicles;
}

export const demoAdapter: SourceAdapter = {
  name: 'demo',
  async fetchAll(options: AdapterOptions): Promise<RawVehicle[]> {
    const log = options.log ?? (() => {});
    const vehicles = buildDemoInventory(options.limit && options.limit > 0 ? options.limit : 54);
    log(`generated ${vehicles.length} sample vehicle(s)`);
    return vehicles;
  },
};
