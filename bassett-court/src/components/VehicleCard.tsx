import Link from 'next/link';
import type { Vehicle } from '@/lib/types';
import { VehicleImage } from './VehicleImage';
import { LocationNote } from './LocationNote';
import { formatMileage, formatPrice } from '@/lib/pricing';
import { conditionLabel, vehicleTitle } from '@/lib/format';
import { siteConfig } from '~/site.config';

export function VehicleCard({ vehicle, priority = false }: { vehicle: Vehicle; priority?: boolean }) {
  const specs = [
    vehicle.condition === 'new' ? null : formatMileage(vehicle.mileage),
    vehicle.drivetrain,
    vehicle.fuelType,
  ].filter(Boolean) as string[];

  return (
    <article
      className="card-capped group flex flex-col overflow-hidden rounded-[var(--radius-card)] transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5"
      style={{
        backgroundColor: 'var(--surface-raised)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="relative aspect-[4/3] overflow-hidden" style={{ backgroundColor: 'var(--surface-sunken)' }}>
        <div className="h-full w-full transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]">
          <VehicleImage vehicle={vehicle} priority={priority} />
        </div>

        <span
          className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.1em] backdrop-blur"
          style={{
            backgroundColor: vehicle.condition === 'new' ? 'var(--accent)' : 'rgb(0 0 0 / 0.66)',
            color: vehicle.condition === 'new' ? 'var(--accent-contrast)' : '#fff',
          }}
        >
          {conditionLabel(vehicle.condition)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          <h3 className="display-soft text-[1.0625rem] leading-snug">
            <Link href={`/inventory/${vehicle.slug}`} className="transition-colors hover:text-[var(--accent)]">
              {vehicleTitle(vehicle)}
            </Link>
          </h3>
          {vehicle.trim ? (
            <p className="mt-0.5 truncate text-[0.8125rem] text-secondary">{vehicle.trim}</p>
          ) : null}
        </div>

        <p className="price text-[1.25rem] leading-none">
          {formatPrice(vehicle.price, siteConfig.pricing.callForPriceLabel)}
        </p>

        {specs.length ? (
          <ul className="flex flex-wrap gap-x-2 gap-y-1 text-[0.75rem] text-muted">
            {specs.map((spec, index) => (
              <li key={spec} className="flex items-center gap-2">
                {index > 0 ? <span aria-hidden="true" className="opacity-40">·</span> : null}
                <span className="numeric">{spec}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Every vehicle sits on the same lot; say so on the card rather than
            making the buyer open the listing to find out. */}
        <LocationNote variant="line" vehicle={vehicle} />

        <Link
          href={`/appointment?vehicle=${encodeURIComponent(vehicle.id)}`}
          className="btn btn-accent btn-block mt-auto"
        >
          Book a test drive
        </Link>
      </div>
    </article>
  );
}
