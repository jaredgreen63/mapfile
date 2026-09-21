import type { Metadata } from 'next';
import { buildFacets, getSnapshot } from '@/lib/inventory';
import { InventoryBrowser } from '@/components/InventoryBrowser';
import { siteConfig } from '~/site.config';

export const metadata: Metadata = {
  title: 'Inventory',
  description: `Browse the current ${siteConfig.name} inventory of new and pre-owned vehicles.`,
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const snapshot = await getSnapshot();
  const facets = buildFacets(snapshot.vehicles);

  // Collapse repeated query params to the first value; the browser owns state
  // from here, and the URL is only used to seed it.
  const raw = await searchParams;
  const initial: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first) initial[key] = first;
  }

  return (
    <div className="py-12">
      <div className="mx-auto mb-10 max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="eyebrow">Inventory</p>
        <h1 className="display-tight mt-2 text-[2.5rem] sm:text-[3.25rem]">
          {snapshot.vehicleCount} vehicles available
        </h1>
        <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-secondary">
          Filter by condition, make, body style, price or mileage. Listings update automatically —
          anything shown here was in the catalogue as of the last sync.
        </p>
      </div>

      <InventoryBrowser vehicles={snapshot.vehicles} facets={facets} initial={initial} />

      {siteConfig.inventory.sourcingDisclosure ? (
        <p className="mx-auto mt-16 max-w-7xl px-4 text-[0.6875rem] leading-relaxed text-muted sm:px-6 lg:px-8">
          {siteConfig.inventory.sourcingDisclosure} {siteConfig.pricing.disclaimer}
        </p>
      ) : null}
    </div>
  );
}
