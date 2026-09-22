import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { getSnapshot } from '@/lib/inventory';
import { formatDateTime } from '@/lib/format';
import { siteConfig } from '~/site.config';

export const metadata: Metadata = {
  title: 'About',
  description: `About ${siteConfig.name} — how we source vehicles and how our pricing works.`,
};

export default async function AboutPage() {
  const snapshot = await getSnapshot();

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow={`${siteConfig.legalName} · ${siteConfig.contact.address.city}, ${siteConfig.contact.address.stateFull}`}
        title="How we work"
        lede={siteConfig.description}
      />

      <section className="mx-auto mt-14 max-w-3xl space-y-10 px-4 sm:px-6 lg:px-8">
        <div>
          <h2 className="display-soft text-[1.75rem]">Sourcing</h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-secondary">
            Our catalogue is assembled from vehicles available through our dealer network and refreshed
            automatically. When a vehicle becomes available it appears here; when it is sold or withdrawn
            it comes off. That means the listing you are looking at reflects what was actually available
            as of the last refresh, rather than a page someone forgot to take down.
          </p>
          {siteConfig.inventory.sourcingDisclosure ? (
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-secondary">
              {siteConfig.inventory.sourcingDisclosure}
            </p>
          ) : null}
        </div>

        <div>
          <h2 className="display-soft text-[1.75rem]">Pricing</h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-secondary">
            Each vehicle carries a single published price. It covers the vehicle itself; tax, title,
            registration and documentation fees are separate and are itemised before you sign anything.
            If a vehicle is listed as “{siteConfig.pricing.callForPriceLabel}”, that means we do not yet
            have a firm number for it — not that the number is negotiable in a direction you would not like.
          </p>
        </div>

        <div>
          <h2 className="display-soft text-[1.75rem]">Delivery</h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-secondary">
            You are welcome to inspect any vehicle in person. If travelling is impractical, we arrange
            transport and coordinate the paperwork remotely. Either way we confirm condition and
            availability in writing first.
          </p>
        </div>

        <div
          className="rounded-[var(--radius-card)] p-6"
          style={{ backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
        >
          <h2 className="eyebrow">Catalogue status</h2>
          <dl className="mt-4 space-y-2.5 text-[0.875rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Vehicles listed</dt>
              <dd className="numeric font-medium">{snapshot.vehicleCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Last refreshed</dt>
              <dd className="numeric font-medium">{formatDateTime(snapshot.generatedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/inventory" className="btn btn-accent px-6 py-3">Browse inventory</Link>
          <Link href="/contact" className="btn btn-outline px-6 py-3">Contact us</Link>
        </div>
      </section>
    </div>
  );
}
