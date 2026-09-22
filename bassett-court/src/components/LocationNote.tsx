import { siteConfig } from '~/site.config';

/**
 * Where the vehicles physically are. Stated plainly wherever a buyer might
 * otherwise assume the car is somewhere it is not.
 */
export function LocationNote({ variant = 'card' }: { variant?: 'card' | 'inline' | 'line' }) {
  const { location } = siteConfig;

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
        <br />
        {location.city}, {location.state} {location.zip}
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

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
