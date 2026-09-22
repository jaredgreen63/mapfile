import Link from 'next/link';
import { getSnapshot } from '@/lib/inventory';
import { toBookable } from '@/lib/booking';
import { VehicleCard } from '@/components/VehicleCard';
import { AppointmentForm } from '@/components/AppointmentForm';
import { LocationNote } from '@/components/LocationNote';
import { PulseDivider } from '@/components/PulseDivider';
import { VehicleImage } from '@/components/VehicleImage';
import { formatPrice } from '@/lib/pricing';
import { relativeTime, vehicleTitle } from '@/lib/format';
import { siteConfig } from '~/site.config';
import type { Vehicle } from '@/lib/types';

export default async function HomePage() {
  const snapshot = await getSnapshot();
  const vehicles = snapshot.vehicles;
  const bookable = toBookable(vehicles);

  const featured = [...vehicles]
    .sort((a, b) => (b.images.length ? 1 : 0) - (a.images.length ? 1 : 0) || (b.year ?? 0) - (a.year ?? 0))
    .slice(0, 6);

  const priced = vehicles.map((v) => v.price).filter((p): p is number => p != null);
  const lowestPrice = priced.length ? Math.min(...priced) : null;
  const newCount = vehicles.filter((v) => v.condition === 'new').length;
  const usedCount = vehicles.length - newCount;

  return (
    <>
      <Hero
        vehicleCount={vehicles.length}
        newCount={newCount}
        usedCount={usedCount}
        lowestPrice={lowestPrice}
        syncedAt={snapshot.generatedAt}
        spotlight={featured[0] ?? null}
      />

      <BodyStyleStrip vehicles={vehicles} />

      <PulseDivider className="mt-16" />

      {featured.length ? (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">At {siteConfig.location.dealer}</p>
              <h2 className="display-tight mt-2 text-[2.25rem] sm:text-[2.75rem]">What’s on the lot</h2>
            </div>
            <Link href="/inventory" className="btn btn-outline">
              View all {vehicles.length} vehicles →
            </Link>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((vehicle, index) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} priority={index < 3} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyInventoryNotice />
      )}

      <ValueProps />
      <BookingBand vehicles={bookable} />
    </>
  );
}

function Hero({
  vehicleCount, newCount, usedCount, lowestPrice, syncedAt, spotlight,
}: {
  vehicleCount: number;
  newCount: number;
  usedCount: number;
  lowestPrice: number | null;
  syncedAt: string;
  spotlight: Vehicle | null;
}) {
  return (
    <section className="relative overflow-hidden">
      {/* Soft brass wash behind the headline, kept subtle in both themes. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 420px at 15% -10%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div>
          <p className="eyebrow inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            Inventory refreshed {relativeTime(syncedAt)}
          </p>

          <h1 className="display-tight mt-5 text-[2.75rem] sm:text-[4rem] lg:text-[4.75rem]">
            Considered vehicles,
            <br />
            <span style={{ color: 'var(--accent)' }}>plainly priced.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-secondary">
            A working catalogue of {vehicleCount} new and pre-owned vehicles — updated automatically,
            priced without games, and available for inspection or delivery.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/inventory" className="btn btn-accent px-6 py-3 text-[0.9375rem]">
              Browse the inventory
            </Link>
            <Link href="/appointment" className="btn btn-outline px-6 py-3 text-[0.9375rem]">
              Book an appointment
            </Link>
          </div>
          </div>

          {spotlight ? <Spotlight vehicle={spotlight} /> : null}
        </div>

        <dl className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] sm:grid-cols-4"
            style={{ backgroundColor: 'var(--border-subtle)', border: '1px solid var(--border-subtle)' }}>
          {[
            { label: 'Vehicles listed', value: vehicleCount.toLocaleString() },
            { label: 'New', value: newCount.toLocaleString() },
            { label: 'Pre-owned', value: usedCount.toLocaleString() },
            { label: 'Starting from', value: lowestPrice != null ? formatPrice(lowestPrice, '—') : '—' },
          ].map((stat) => (
            <div key={stat.label} className="px-5 py-6" style={{ backgroundColor: 'var(--surface-raised)' }}>
              <dt className="eyebrow">{stat.label}</dt>
              <dd className="numeric mt-2 text-[1.5rem] font-semibold tracking-tight">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function BodyStyleStrip({ vehicles }: { vehicles: Vehicle[] }) {
  const counts = new Map<string, number>();
  for (const vehicle of vehicles) {
    if (!vehicle.bodyStyle) continue;
    counts.set(vehicle.bodyStyle, (counts.get(vehicle.bodyStyle) ?? 0) + 1);
  }
  const styles = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!styles.length) return null;

  return (
    <section
      className="border-y"
      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-sunken)' }}
    >
      <div className="scroll-slim mx-auto flex max-w-7xl gap-3 overflow-x-auto px-4 py-5 sm:px-6 lg:px-8">
        {styles.map(([style, count]) => (
          <Link
            key={style}
            href={`/inventory?bodyStyle=${encodeURIComponent(style)}`}
            className="group flex shrink-0 items-center gap-2.5 rounded-full border px-4 py-2 text-[0.8125rem] font-medium transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-raised)' }}
          >
            {style}
            <span className="numeric text-[0.6875rem] text-muted">{count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ValueProps() {
  const items = [
    {
      title: 'Pricing you can check',
      body: 'Every vehicle carries one number, shown up front. No conditional rebates you do not qualify for, no figure that changes when you walk in.',
    },
    {
      title: 'A catalogue that is actually current',
      body: 'Inventory syncs automatically. Vehicles appear as they become available and come down as soon as they are gone, so you are never chasing a car that sold last week.',
    },
    {
      title: 'Inspection and delivery',
      body: 'Come see the vehicle, or have us bring it to you. We arrange transport and handle the paperwork either way.',
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="grid gap-10 md:grid-cols-3">
        {items.map((item, index) => (
          <div key={item.title}>
            <span className="numeric text-[0.75rem] font-semibold" style={{ color: 'var(--accent)' }}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="display-soft mt-3 text-[1.5rem]">{item.title}</h3>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-secondary">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BookingBand({ vehicles }: { vehicles: ReturnType<typeof toBookable> }) {
  return (
    <section
      id="book"
      className="border-t"
      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-sunken)' }}
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="eyebrow">Book an appointment</p>
          <h2 className="display-tight mt-2 text-[2.25rem] sm:text-[2.75rem]">
            Come see it in person.
          </h2>
          <p className="mt-5 max-w-md text-[0.9375rem] leading-relaxed text-secondary">
            Pick a vehicle and a time that works. {siteConfig.contact.name} confirms every
            appointment personally and checks the vehicle is still on the lot before you drive
            anywhere.
          </p>

          <div className="mt-8 max-w-sm">
            <LocationNote />
          </div>

          <div className="mt-7">
            <p className="eyebrow">Or call direct</p>
            <p className="numeric mt-2 text-[1.75rem] font-bold tracking-tight">
              <a
                href={`tel:${siteConfig.contact.phone.replace(/[^0-9+]/g, '')}`}
                className="transition-colors hover:text-[var(--accent)]"
              >
                {siteConfig.contact.phone}
              </a>
            </p>
            <p className="mt-1 text-[0.875rem] text-secondary">
              {siteConfig.contact.name} · {siteConfig.legalName}
            </p>
          </div>
        </div>

        <div
          className="rounded-[var(--radius-card)] p-6 sm:p-8"
          style={{
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-lift)',
          }}
        >
          <AppointmentForm vehicles={vehicles} />
        </div>
      </div>
    </section>
  );
}

function EmptyInventoryNotice() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <h2 className="display-soft text-[2rem]">Inventory is being prepared</h2>
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-secondary">
        No snapshot has been published yet. Run <code className="numeric rounded px-1.5 py-0.5" style={{ backgroundColor: 'var(--surface-sunken)' }}>npm run sync</code>{' '}
        to pull the current catalogue, then redeploy.
      </p>
    </section>
  );
}

function Spotlight({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="hidden lg:block">
      <Link
        href={`/inventory/${vehicle.slug}`}
        className="group relative block overflow-hidden rounded-[var(--radius-card)] transition-transform duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-1"
        style={{
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lift)',
        }}
      >
        <div className="aspect-[16/10] overflow-hidden" style={{ backgroundColor: 'var(--surface-sunken)' }}>
          <div className="h-full w-full transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]">
            <VehicleImage vehicle={vehicle} priority sizes="45vw" />
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="eyebrow">In the showroom</p>
            <p className="mt-1.5 truncate text-[1.0625rem] font-semibold">{vehicleTitle(vehicle)}</p>
            {vehicle.trim ? <p className="truncate text-[0.8125rem] text-secondary">{vehicle.trim}</p> : null}
          </div>
          <p className="numeric shrink-0 text-[1.25rem] font-semibold tracking-tight">
            {formatPrice(vehicle.price, siteConfig.pricing.callForPriceLabel)}
          </p>
        </div>
      </Link>
    </div>
  );
}
