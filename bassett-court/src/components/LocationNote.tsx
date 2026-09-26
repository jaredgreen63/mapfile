import type { Vehicle } from '@/lib/types';
import { siteConfig } from '~/site.config';

/**
 * Where a vehicle physically is. Stated plainly wherever a buyer might
 * otherwise assume the car is somewhere it is not.
 *
 * A multi-rooftop feed carries a different dealer and address per vehicle, so
 * the record wins where it has one and the configured address is the fallback.
 * Getting this wrong sends someone on a drive to the wrong town.
 */
export function LocationNote({
  variant = 'card',
  vehicle,
}: {
  variant?: 'card' | 'inline' | 'line';
  vehicle?: Pick<Vehicle, 'dealer'> | null;
}) {
  const location = resolveLocation(vehicle);

  if (variant === 'line') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-muted">
        <PinIcon />
        {location.short}
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-secondary">
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Located at {location.dealer}
        </span>
        {' · '}
        <a href={location.mapsUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          {location.oneLine}
        </a>
      </p>
    );
  }

  return (
    <div
      className="rounded-[var(--radius-card)] p-5"
      style={{ backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
    >
      <h3 className="eyebrow flex items-center gap-1.5">
        <PinIcon />
        Where this vehicle is
      </h3>
      <p className="mt-3 text-[0.9375rem] font-semibold leading-snug">{location.dealer}</p>
      <address className="mt-1 text-[0.875rem] not-italic leading-relaxed text-secondary">
        {location.street}
        {location.street && location.cityLine ? <br /> : null}
        {location.cityLine}
      </address>
      <a
        href={location.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold transition-opacity hover:opacity-80"
        style={{ color: 'var(--accent)' }}
      >
        Get directions
        <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}

interface ResolvedLocation {
  dealer: string;
  street: string | null;
  cityLine: string | null;
  oneLine: string;
  short: string;
  mapsUrl: string;
}

function resolveLocation(vehicle?: Pick<Vehicle, 'dealer'> | null): ResolvedLocation {
  const fallback = siteConfig.location;
  const dealer = vehicle?.dealer;

  if (!dealer?.address && !dealer?.name) {
    return {
      dealer: fallback.dealer,
      street: fallback.street,
      cityLine: `${fallback.city}, ${fallback.state} ${fallback.zip}`.trim(),
      oneLine: fallback.oneLine,
      short: fallback.short,
      mapsUrl: fallback.mapsUrl,
    };
  }

  const name = dealer.name ?? fallback.dealer;
  const address = dealer.address ?? '';
  // "5010 Old Easley Bridge Rd, Easley, SC 29642" -> street / rest
  const [street, ...rest] = address.split(',').map((part) => part.trim()).filter(Boolean);
  const cityLine = rest.join(', ') || null;
  const oneLine = address || fallback.oneLine;

  // The short form on a card should name the town, not the street.
  const townMatch = cityLine?.match(/^([^,]+),?\s*([A-Z]{2})?/);
  const short = townMatch
    ? [townMatch[1], townMatch[2]].filter(Boolean).join(', ')
    : fallback.short;

  return {
    dealer: name,
    street: street ?? null,
    cityLine,
    oneLine,
    short,
    mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(`${name}, ${oneLine}`)}`,
  };
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
