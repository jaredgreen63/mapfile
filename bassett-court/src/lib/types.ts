/** Canonical vehicle record. Every adapter normalizes into this shape. */
export interface Vehicle {
  /** Stable identity. VIN when available, otherwise a hash of the source URL. */
  id: string;
  vin: string | null;
  stockNumber: string | null;

  condition: 'new' | 'used' | 'certified';
  year: number | null;
  make: string;
  model: string;
  trim: string | null;

  bodyStyle: string | null;
  drivetrain: string | null;
  transmission: string | null;
  fuelType: string | null;
  engine: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  doors: number | null;
  mileage: number | null;

  /** Upstream asking price in USD, before markup. Null means "no price given". */
  sourcePrice: number | null;
  /** Upstream MSRP when published separately from the asking price. */
  sourceMsrp: number | null;
  /** Our published price: sourcePrice + markup, rounded per site config. */
  price: number | null;
  /** Rate actually applied, recorded per-vehicle for auditability. */
  markupRate: number;

  images: string[];
  features: string[];
  description: string | null;

  /** Upstream detail page, kept for reconciliation. Never linked publicly. */
  sourceUrl: string | null;

  /** URL slug on this site. */
  slug: string;

  /** ISO timestamps managed by the sync. */
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface InventorySnapshot {
  /** ISO timestamp of the sync that produced this file. */
  generatedAt: string;
  sourceUrl: string;
  sourceName: string;
  adapter: string;
  markupRate: number;
  vehicleCount: number;
  vehicles: Vehicle[];
}

export interface SyncDiff {
  added: string[];
  removed: string[];
  repriced: { id: string; from: number | null; to: number | null }[];
  unchanged: number;
}

export interface SyncLogEntry extends SyncDiff {
  at: string;
  adapter: string;
  fetched: number;
  published: number;
  ok: boolean;
  note?: string;
}

/** Raw shape an adapter may emit; everything is optional and untrusted. */
export interface RawVehicle {
  vin?: string | null;
  stockNumber?: string | null;
  condition?: string | null;
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  bodyStyle?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  engine?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  doors?: number | string | null;
  mileage?: number | string | null;
  price?: number | string | null;
  msrp?: number | string | null;
  images?: string[] | null;
  features?: string[] | null;
  description?: string | null;
  sourceUrl?: string | null;
}

export interface SourceAdapter {
  name: string;
  /** Fetch the complete current inventory from the upstream source. */
  fetchAll(options: AdapterOptions): Promise<RawVehicle[]>;
}

export interface AdapterOptions {
  sourceUrl: string;
  feedUrl?: string;
  /** Hard cap on detail pages fetched per run; 0 means unlimited. */
  limit?: number;
  /** Milliseconds between upstream requests. */
  politenessDelayMs?: number;
  log?: (message: string) => void;
}
