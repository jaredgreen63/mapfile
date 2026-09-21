'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Vehicle } from '@/lib/types';
import type { InventoryFacets } from '@/lib/inventory';
import { VehicleCard } from './VehicleCard';
import { formatPrice } from '@/lib/pricing';
import { siteConfig } from '~/site.config';

type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'year-desc' | 'mileage-asc' | 'newest';

interface Filters {
  q: string;
  condition: string;
  make: string;
  model: string;
  bodyStyle: string;
  drivetrain: string;
  fuelType: string;
  minPrice: number | null;
  maxPrice: number | null;
  maxMileage: number | null;
  sort: SortKey;
}

const EMPTY_FILTERS: Filters = {
  q: '', condition: '', make: '', model: '', bodyStyle: '', drivetrain: '',
  fuelType: '', minPrice: null, maxPrice: null, maxMileage: null, sort: 'recommended',
};

const SORT_LABELS: Record<SortKey, string> = {
  recommended: 'Recommended',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low',
  'year-desc': 'Year: Newest',
  'mileage-asc': 'Mileage: Lowest',
  newest: 'Recently Added',
};

export function InventoryBrowser({
  vehicles,
  facets,
  initial,
}: {
  vehicles: Vehicle[];
  facets: InventoryFacets;
  initial: Partial<Record<string, string>>;
}) {
  const [filters, setFilters] = useState<Filters>(() => hydrate(initial));
  const [visible, setVisible] = useState<number>(siteConfig.inventory.pageSize);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const update = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      // Changing make invalidates any model chosen under the previous make.
      if (key === 'make') next.model = '';
      return next;
    });
    setVisible(siteConfig.inventory.pageSize);
  }, []);

  // Keep the URL shareable without pushing history entries on every keystroke.
  useEffect(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value === '' || value == null) continue;
      if (key === 'sort' && value === 'recommended') continue;
      params.set(key, String(value));
    }
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }, [filters]);

  const modelsForMake = useMemo(() => {
    const pool = filters.make ? vehicles.filter((v) => v.make === filters.make) : vehicles;
    const counts = new Map<string, number>();
    for (const vehicle of pool) counts.set(vehicle.model, (counts.get(vehicle.model) ?? 0) + 1);
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [vehicles, filters.make]);

  const results = useMemo(() => applyFilters(vehicles, filters), [vehicles, filters]);
  const activeCount = countActive(filters);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* Filter rail */}
        <aside
          className={`${drawerOpen ? 'fixed inset-0 z-50 overflow-y-auto p-4' : 'hidden'} lg:sticky lg:top-24 lg:block lg:w-64 lg:shrink-0 lg:p-0`}
          style={drawerOpen ? { backgroundColor: 'var(--surface-page)' } : undefined}
        >
          <div className="lg:scroll-slim lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2">
            <div className="mb-5 flex items-center justify-between lg:hidden">
              <h2 className="text-base font-semibold">Filters</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} className="btn btn-outline">
                Done
              </button>
            </div>

            <div className="space-y-6">
              <Field label="Search">
                <input
                  type="search"
                  value={filters.q}
                  onChange={(event) => update('q', event.target.value)}
                  placeholder="Make, model, trim, VIN…"
                  className="field"
                />
              </Field>

              <SelectField
                label="Condition"
                value={filters.condition}
                onChange={(value) => update('condition', value)}
                options={facets.conditions.map((entry) => ({
                  value: entry.value,
                  label: entry.value === 'certified' ? 'Certified Pre-Owned' : entry.value === 'new' ? 'New' : 'Pre-Owned',
                  count: entry.count,
                }))}
                allLabel="Any condition"
              />

              <SelectField
                label="Make"
                value={filters.make}
                onChange={(value) => update('make', value)}
                options={facets.makes.map((entry) => ({ value: entry.value, label: entry.value, count: entry.count }))}
                allLabel="Any make"
              />

              <SelectField
                label="Model"
                value={filters.model}
                onChange={(value) => update('model', value)}
                options={modelsForMake.map((entry) => ({ value: entry.value, label: entry.value, count: entry.count }))}
                allLabel="Any model"
              />

              <SelectField
                label="Body Style"
                value={filters.bodyStyle}
                onChange={(value) => update('bodyStyle', value)}
                options={facets.bodyStyles.map((entry) => ({ value: entry.value, label: entry.value, count: entry.count }))}
                allLabel="Any body style"
              />

              <Field label="Price">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={filters.minPrice ?? ''}
                    onChange={(event) => update('minPrice', toNumberOrNull(event.target.value))}
                    placeholder={String(facets.priceRange.min)}
                    aria-label="Minimum price"
                    className="field numeric"
                  />
                  <span aria-hidden="true" className="text-muted">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={filters.maxPrice ?? ''}
                    onChange={(event) => update('maxPrice', toNumberOrNull(event.target.value))}
                    placeholder={String(facets.priceRange.max)}
                    aria-label="Maximum price"
                    className="field numeric"
                  />
                </div>
              </Field>

              <Field label={`Max Mileage${filters.maxMileage ? `: ${filters.maxMileage.toLocaleString()} mi` : ''}`}>
                <input
                  type="range"
                  min={0}
                  max={facets.mileageMax}
                  step={5000}
                  value={filters.maxMileage ?? facets.mileageMax}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    update('maxMileage', value >= facets.mileageMax ? null : value);
                  }}
                  aria-label="Maximum mileage"
                  className="w-full accent-[var(--accent)]"
                />
              </Field>

              <SelectField
                label="Drivetrain"
                value={filters.drivetrain}
                onChange={(value) => update('drivetrain', value)}
                options={facets.drivetrains.map((entry) => ({ value: entry.value, label: entry.value, count: entry.count }))}
                allLabel="Any drivetrain"
              />

              <SelectField
                label="Fuel"
                value={filters.fuelType}
                onChange={(value) => update('fuelType', value)}
                options={facets.fuelTypes.map((entry) => ({ value: entry.value, label: entry.value, count: entry.count }))}
                allLabel="Any fuel type"
              />

              {activeCount > 0 ? (
                <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="btn btn-outline w-full">
                  Clear all filters
                </button>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <p className="numeric text-sm text-secondary">
              <strong className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {results.length}
              </strong>{' '}
              vehicle{results.length === 1 ? '' : 's'}
            </p>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="btn btn-outline lg:hidden"
            >
              Filters{activeCount ? ` (${activeCount})` : ''}
            </button>

            <label className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-muted">Sort</span>
              <select
                value={filters.sort}
                onChange={(event) => update('sort', event.target.value as SortKey)}
                className="field w-auto"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>{SORT_LABELS[key]}</option>
                ))}
              </select>
            </label>
          </div>

          {activeCount > 0 ? (
            <div className="mb-6 flex flex-wrap gap-2">
              {activeChips(filters).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => update(chip.key as keyof Filters, (typeof filters[chip.key as keyof Filters] === 'number' ? null : '') as never)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.75rem] font-medium transition-colors hover:border-[var(--accent)]"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  {chip.label}
                  <span aria-hidden="true" className="opacity-60">×</span>
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
            </div>
          ) : null}

          {results.length === 0 ? (
            <EmptyState onReset={() => setFilters(EMPTY_FILTERS)} />
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.slice(0, visible).map((vehicle, index) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} priority={index < 3} />
                ))}
              </div>

              {visible < results.length ? (
                <div className="mt-10 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisible((value) => value + siteConfig.inventory.pageSize)}
                    className="btn btn-outline"
                  >
                    Show {Math.min(siteConfig.inventory.pageSize, results.length - visible)} more
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow mb-2 block">{label}</label>
      {children}
    </div>
  );
}

function SelectField({
  label, value, onChange, options, allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count: number }[];
  allLabel: string;
}) {
  if (!options.length) return null;
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="field">
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </Field>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div
      className="rounded-[var(--radius-card)] px-6 py-20 text-center"
      style={{ border: '1px dashed var(--border-strong)' }}
    >
      <p className="display-tight text-2xl">No vehicles match those filters</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-secondary">
        Try widening the price range or clearing a filter. We source vehicles daily, so tell us what
        you are after and we will watch for it.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onReset} className="btn btn-primary">Clear filters</button>
        <a href="/contact" className="btn btn-outline">Request a vehicle</a>
      </div>
    </div>
  );
}

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hydrate(initial: Partial<Record<string, string>>): Filters {
  const sort = initial.sort && initial.sort in SORT_LABELS ? (initial.sort as SortKey) : 'recommended';
  return {
    ...EMPTY_FILTERS,
    q: initial.q ?? '',
    condition: initial.condition ?? '',
    make: initial.make ?? '',
    model: initial.model ?? '',
    bodyStyle: initial.bodyStyle ?? '',
    drivetrain: initial.drivetrain ?? '',
    fuelType: initial.fuelType ?? '',
    minPrice: initial.minPrice ? Number(initial.minPrice) : null,
    maxPrice: initial.maxPrice ? Number(initial.maxPrice) : null,
    maxMileage: initial.maxMileage ? Number(initial.maxMileage) : null,
    sort,
  };
}

function countActive(filters: Filters): number {
  return activeChips(filters).length;
}

function activeChips(filters: Filters): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];
  if (filters.q) chips.push({ key: 'q', label: `“${filters.q}”` });
  if (filters.condition) chips.push({ key: 'condition', label: filters.condition === 'certified' ? 'Certified' : filters.condition === 'new' ? 'New' : 'Pre-Owned' });
  if (filters.make) chips.push({ key: 'make', label: filters.make });
  if (filters.model) chips.push({ key: 'model', label: filters.model });
  if (filters.bodyStyle) chips.push({ key: 'bodyStyle', label: filters.bodyStyle });
  if (filters.drivetrain) chips.push({ key: 'drivetrain', label: filters.drivetrain });
  if (filters.fuelType) chips.push({ key: 'fuelType', label: filters.fuelType });
  if (filters.minPrice != null) chips.push({ key: 'minPrice', label: `From ${formatPrice(filters.minPrice)}` });
  if (filters.maxPrice != null) chips.push({ key: 'maxPrice', label: `Up to ${formatPrice(filters.maxPrice)}` });
  if (filters.maxMileage != null) chips.push({ key: 'maxMileage', label: `Under ${filters.maxMileage.toLocaleString()} mi` });
  return chips;
}

export function applyFilters(vehicles: Vehicle[], filters: Filters): Vehicle[] {
  const needle = filters.q.trim().toLowerCase();

  const filtered = vehicles.filter((vehicle) => {
    if (filters.condition && vehicle.condition !== filters.condition) return false;
    if (filters.make && vehicle.make !== filters.make) return false;
    if (filters.model && vehicle.model !== filters.model) return false;
    if (filters.bodyStyle && vehicle.bodyStyle !== filters.bodyStyle) return false;
    if (filters.drivetrain && vehicle.drivetrain !== filters.drivetrain) return false;
    if (filters.fuelType && vehicle.fuelType !== filters.fuelType) return false;

    // Price bounds only exclude vehicles that have a price. A "Call for Price"
    // unit is not evidence that it falls outside the range, so it stays in.
    if (vehicle.price != null) {
      if (filters.minPrice != null && vehicle.price < filters.minPrice) return false;
      if (filters.maxPrice != null && vehicle.price > filters.maxPrice) return false;
    }

    if (filters.maxMileage != null && vehicle.mileage != null && vehicle.mileage > filters.maxMileage) {
      return false;
    }

    if (needle) {
      const haystack = [
        vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.bodyStyle,
        vehicle.exteriorColor, vehicle.vin, vehicle.stockNumber, vehicle.fuelType,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!needle.split(/\s+/).every((token) => haystack.includes(token))) return false;
    }

    return true;
  });

  return sortVehicles(filtered, filters.sort);
}

function sortVehicles(vehicles: Vehicle[], sort: SortKey): Vehicle[] {
  const sorted = [...vehicles];

  switch (sort) {
    case 'price-asc':
      // Unpriced units sort last in both directions; they carry no information.
      return sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    case 'price-desc':
      return sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    case 'year-desc':
      return sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    case 'mileage-asc':
      return sorted.sort((a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity));
    case 'newest':
      return sorted.sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt));
    default:
      // Recommended: photographed and priced units first, then newest model years.
      return sorted.sort((a, b) => {
        const score = (v: Vehicle) => (v.images.length ? 2 : 0) + (v.price != null ? 1 : 0);
        return score(b) - score(a) || (b.year ?? 0) - (a.year ?? 0) || (a.price ?? 0) - (b.price ?? 0);
      });
  }
}
