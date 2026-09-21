import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getSimilarVehicles, getVehicleBySlug, getVehicles } from '@/lib/inventory';
import { Gallery } from '@/components/Gallery';
import { LeadForm } from '@/components/LeadForm';
import { PaymentEstimator } from '@/components/PaymentEstimator';
import { VehicleCard } from '@/components/VehicleCard';
import { formatMileage, formatPrice } from '@/lib/pricing';
import { conditionLabel, vehicleFullTitle } from '@/lib/format';
import { siteConfig } from '~/site.config';
import type { Vehicle } from '@/lib/types';

export async function generateStaticParams() {
  const vehicles = await getVehicles();
  return vehicles.map((vehicle) => ({ slug: vehicle.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await getVehicleBySlug(slug);
  if (!vehicle) return { title: 'Vehicle not found' };

  const title = vehicleFullTitle(vehicle);
  const price = formatPrice(vehicle.price, siteConfig.pricing.callForPriceLabel);

  return {
    title,
    description: `${conditionLabel(vehicle.condition)} ${title} — ${price}${
      vehicle.mileage != null && vehicle.condition !== 'new' ? `, ${formatMileage(vehicle.mileage)}` : ''
    }. Available now at ${siteConfig.name}.`,
    alternates: { canonical: `/inventory/${vehicle.slug}` },
    openGraph: {
      title,
      images: vehicle.images.length ? [vehicle.images[0]] : undefined,
    },
  };
}

export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vehicle = await getVehicleBySlug(slug);
  if (!vehicle) notFound();

  const similar = await getSimilarVehicles(vehicle);
  const title = vehicleFullTitle(vehicle);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-7 text-[0.8125rem] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="transition-colors hover:text-[var(--accent)]">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/inventory" className="transition-colors hover:text-[var(--accent)]">Inventory</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" style={{ color: 'var(--text-secondary)' }}>{title}</li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-10">
          <Gallery vehicle={vehicle} />

          <section>
            <h2 className="display-tight text-[1.75rem]">Specifications</h2>
            <SpecTable vehicle={vehicle} />
          </section>

          {vehicle.features.length ? (
            <section>
              <h2 className="display-tight text-[1.75rem]">Equipment</h2>
              <ul className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {vehicle.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-[0.875rem] text-secondary">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }}>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {vehicle.description ? (
            <section>
              <h2 className="display-tight text-[1.75rem]">About this vehicle</h2>
              <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-secondary">
                {vehicle.description}
              </p>
            </section>
          ) : null}
        </div>

        {/* Purchase rail */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-5">
            <div>
              <span
                className="inline-block rounded-full px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.1em]"
                style={{
                  backgroundColor: vehicle.condition === 'new' ? 'var(--accent)' : 'var(--surface-sunken)',
                  color: vehicle.condition === 'new' ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                }}
              >
                {conditionLabel(vehicle.condition)}
              </span>

              <h1 className="display-tight mt-3 text-[2rem] leading-[1.1]">{title}</h1>

              <p className="numeric mt-4 text-[2.25rem] font-semibold leading-none tracking-tight">
                {formatPrice(vehicle.price, siteConfig.pricing.callForPriceLabel)}
              </p>

              {siteConfig.pricing.showSourcePrice && vehicle.sourceMsrp ? (
                <p className="numeric mt-1.5 text-[0.8125rem] text-muted">
                  MSRP {formatPrice(vehicle.sourceMsrp, '—')}
                </p>
              ) : null}

              <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted">
                {siteConfig.pricing.disclaimer}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)]"
                style={{ backgroundColor: 'var(--border-subtle)', border: '1px solid var(--border-subtle)' }}>
              {[
                { label: 'Mileage', value: vehicle.condition === 'new' ? 'New' : formatMileage(vehicle.mileage) },
                { label: 'Drivetrain', value: vehicle.drivetrain ?? '—' },
                { label: 'Fuel', value: vehicle.fuelType ?? '—' },
                { label: 'Stock', value: vehicle.stockNumber ?? '—' },
              ].map((item) => (
                <div key={item.label} className="px-4 py-3.5" style={{ backgroundColor: 'var(--surface-raised)' }}>
                  <dt className="eyebrow">{item.label}</dt>
                  <dd className="numeric mt-1 text-[0.9375rem] font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>

            {vehicle.price != null ? <PaymentEstimator price={vehicle.price} /> : null}

            <div
              className="rounded-[var(--radius-card)] p-5"
              style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' }}
            >
              <h2 className="display-tight text-[1.25rem]">Check availability</h2>
              <div className="mt-4">
                <LeadForm vehicleId={vehicle.id} vehicleLabel={title} compact />
              </div>
            </div>

            {siteConfig.inventory.sourcingDisclosure ? (
              <p className="text-[0.6875rem] leading-relaxed text-muted">
                {siteConfig.inventory.sourcingDisclosure}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {similar.length ? (
        <section className="mt-20">
          <h2 className="display-tight text-[1.75rem]">Similar vehicles</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((entry) => (
              <VehicleCard key={entry.id} vehicle={entry} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Structured data so this listing is eligible for vehicle rich results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(vehicleJsonLd(vehicle, title)) }}
      />
    </div>
  );
}

function SpecTable({ vehicle }: { vehicle: Vehicle }) {
  const rows: [string, string | null][] = [
    ['Year', vehicle.year ? String(vehicle.year) : null],
    ['Make', vehicle.make],
    ['Model', vehicle.model],
    ['Trim', vehicle.trim],
    ['Body style', vehicle.bodyStyle],
    ['Mileage', vehicle.condition === 'new' ? 'New' : formatMileage(vehicle.mileage)],
    ['Engine', vehicle.engine],
    ['Transmission', vehicle.transmission],
    ['Drivetrain', vehicle.drivetrain],
    ['Fuel type', vehicle.fuelType],
    ['Exterior colour', vehicle.exteriorColor],
    ['Interior colour', vehicle.interiorColor],
    ['Doors', vehicle.doors != null ? String(vehicle.doors) : null],
    ['VIN', vehicle.vin],
    ['Stock number', vehicle.stockNumber],
  ];

  const present = rows.filter(([, value]) => value && value !== '—');

  return (
    <dl className="mt-5 grid gap-x-10 sm:grid-cols-2">
      {present.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b py-2.5 text-[0.875rem]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <dt className="text-muted">{label}</dt>
          <dd className="numeric text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function vehicleJsonLd(vehicle: Vehicle, title: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: title,
    ...(vehicle.vin ? { vehicleIdentificationNumber: vehicle.vin } : {}),
    ...(vehicle.year ? { vehicleModelDate: String(vehicle.year) } : {}),
    brand: { '@type': 'Brand', name: vehicle.make },
    model: vehicle.model,
    ...(vehicle.bodyStyle ? { bodyType: vehicle.bodyStyle } : {}),
    ...(vehicle.exteriorColor ? { color: vehicle.exteriorColor } : {}),
    ...(vehicle.fuelType ? { fuelType: vehicle.fuelType } : {}),
    ...(vehicle.transmission ? { vehicleTransmission: vehicle.transmission } : {}),
    ...(vehicle.mileage != null
      ? { mileageFromOdometer: { '@type': 'QuantitativeValue', value: vehicle.mileage, unitCode: 'SMI' } }
      : {}),
    ...(vehicle.images.length ? { image: vehicle.images.slice(0, 5) } : {}),
    ...(vehicle.price != null
      ? {
          offers: {
            '@type': 'Offer',
            price: vehicle.price,
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
            itemCondition:
              vehicle.condition === 'new'
                ? 'https://schema.org/NewCondition'
                : 'https://schema.org/UsedCondition',
            seller: { '@type': 'AutoDealer', name: siteConfig.name },
          },
        }
      : {}),
  };
}
