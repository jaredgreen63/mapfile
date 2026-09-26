'use client';

import { useCallback, useState } from 'react';
import type { Vehicle } from '@/lib/types';

/**
 * Vehicle photography with a designed fallback.
 *
 * Source photos are hot-linked from the upstream CDN, so a listing has to look
 * deliberate in two separate cases: no photo supplied at all, and a supplied
 * photo that fails to load. The second is the one that bites — a 404 leaves
 * the browser's broken-image icon and the alt text sitting in the card — so
 * the fallback is wired to the image's error event, not just to a missing URL.
 *
 * The fallback draws a silhouette matched to the body style and tinted from
 * the vehicle's own exterior colour, which reads as intentional.
 */

const COLOR_MAP: [RegExp, string][] = [
  [/summit|white|pearl|ivory/i, '#e8e9ea'],
  [/black|midnight|onyx/i, '#23272c'],
  [/silver|sterling|aluminum/i, '#b9bfc5'],
  [/gray|grey|graphite|meteorite|ash|slate/i, '#7b828b'],
  [/red|cherry|crimson|garnet|radiant/i, '#a4322f'],
  [/blue|riptide|lakeshore|navy|cobalt/i, '#2f5a86'],
  [/green|cacti|forest|sage/i, '#4a6b52'],
  [/brown|bronze|copper|tan|beige|sand/i, '#8a6e51'],
  [/orange|amber/i, '#b86a30'],
  [/yellow|gold/i, '#b99537'],
  [/purple|violet/i, '#5a4570'],
];

function paintFor(color: string | null): string {
  if (!color) return '#6d7885';
  for (const [pattern, hex] of COLOR_MAP) {
    if (pattern.test(color)) return hex;
  }
  return '#6d7885';
}

type Silhouette = 'truck' | 'suv' | 'sedan' | 'coupe' | 'van';

function silhouetteFor(vehicle: Pick<Vehicle, 'bodyStyle' | 'model' | 'doors'>): Silhouette {
  const haystack = `${vehicle.bodyStyle ?? ''} ${vehicle.model ?? ''}`.toLowerCase();
  if (/truck|pickup|silverado|sierra|f-150|tacoma|colorado|ram/.test(haystack)) return 'truck';
  if (/van|minivan|express|transit|odyssey/.test(haystack)) return 'van';
  if (/coupe|convertible|corvette|camaro|mustang|roadster/.test(haystack)) return 'coupe';
  if (/suv|crossover|wagon|tahoe|suburban|traverse|equinox|blazer|trax|trailblazer|rav4|wrangler|cherokee|escape/.test(haystack)) return 'suv';
  if (/sedan|hatchback|malibu|civic|altima|camry|accord/.test(haystack)) return 'sedan';
  return vehicle.doors === 2 ? 'coupe' : 'suv';
}

/**
 * Side-profile geometry on a 400x200 canvas. Each body style gets a distinct
 * roofline and proportion so a Tahoe never renders as a Malibu — the whole
 * point of the fallback is that it tells you what shape of vehicle this is.
 */
interface Profile {
  body: string;
  glass: string;
  /** Pillar x-positions splitting the glasshouse into panes. */
  pillars: number[];
  wheels: [number, number];
  glassTop: number;
  glassBottom: number;
}

const PROFILES: Record<Silhouette, Profile> = {
  suv: {
    // Roofline carries all the way back to a near-vertical tailgate; that, not
    // ride height, is what distinguishes an SUV profile from a sedan's.
    body: 'M36 152 V102 L42 92 L112 88 L140 46 L154 40 H318 L334 50 L354 92 L362 102 V152 Z',
    glass: 'M128 84 L152 50 H312 L328 84 Z',
    pillars: [204, 256],
    wheels: [112, 302],
    glassTop: 50,
    glassBottom: 84,
  },
  sedan: {
    body: 'M32 152 V116 L40 104 L94 94 L140 62 L160 54 H250 L272 62 L312 94 L362 104 L368 116 V152 Z',
    glass: 'M134 92 L152 64 H248 L268 92 Z',
    pillars: [196, 228],
    wheels: [116, 300],
    glassTop: 64,
    glassBottom: 92,
  },
  coupe: {
    body: 'M30 152 V118 L38 106 L96 96 L150 62 L172 56 H236 L262 66 L326 100 L364 108 L370 120 V152 Z',
    glass: 'M148 94 L168 66 H234 L258 80 L274 94 Z',
    pillars: [212],
    wheels: [114, 302],
    glassTop: 66,
    glassBottom: 94,
  },
  truck: {
    body: 'M36 152 V104 L44 94 L84 86 L112 48 L128 40 H216 V96 H366 L372 106 V152 Z',
    glass: 'M120 84 L136 50 H208 V84 Z',
    pillars: [170],
    wheels: [112, 306],
    glassTop: 50,
    glassBottom: 84,
  },
  van: {
    body: 'M34 152 V80 L42 62 L60 54 L150 42 L178 38 H290 L308 46 L330 96 L360 130 L366 142 V152 Z',
    glass: 'M64 84 L72 62 L152 52 H258 L270 84 Z',
    pillars: [140, 206],
    wheels: [110, 300],
    glassTop: 52,
    glassBottom: 84,
  },
};

export function VehicleImage({
  vehicle,
  index = 0,
  className = '',
  priority = false,
  sizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
}: {
  vehicle: Pick<Vehicle, 'images' | 'bodyStyle' | 'model' | 'doors' | 'exteriorColor' | 'year' | 'make'>;
  index?: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const src = vehicle.images?.[index];
  const alt = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');

  // Keyed by src so that moving through a gallery re-arms the fallback rather
  // than carrying one bad photo's failure across to the next.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  /*
   * These pages are statically generated, so an image can finish failing
   * before React hydrates and attaches onError — the event is gone by the time
   * anyone is listening, and the broken icon stays on screen. Checking the
   * element's state when the ref attaches catches exactly that case.
   */
  const captureRef = useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete && node.naturalWidth === 0 && node.currentSrc) {
        setFailedSrc(node.getAttribute('src'));
      }
    },
    [],
  );

  if (src && failedSrc !== src) {
    return (
      // Plain <img>: source hostnames are not known ahead of time, and the
      // upstream CDN already serves appropriately sized renditions.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        ref={captureRef}
        onError={() => setFailedSrc(src)}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  return <VehicleSilhouette vehicle={vehicle} className={className} />;
}

export function VehicleSilhouette({
  vehicle,
  className = '',
}: {
  vehicle: Pick<Vehicle, 'bodyStyle' | 'model' | 'doors' | 'exteriorColor'>;
  className?: string;
}) {
  const kind = silhouetteFor(vehicle);
  const paint = paintFor(vehicle.exteriorColor);
  const profile = PROFILES[kind];
  const gradientId = `paint-${kind}-${paint.replace('#', '')}`;

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: 'linear-gradient(165deg, var(--surface-sunken) 0%, var(--surface-raised) 100%)' }}
      role="img"
      aria-label={`${vehicle.bodyStyle ?? 'Vehicle'} — photography pending`}
    >
      <svg viewBox="0 0 400 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={paint} stopOpacity="0.98" />
            <stop offset="55%" stopColor={paint} stopOpacity="0.88" />
            <stop offset="100%" stopColor={paint} stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Ground shadow */}
        <ellipse cx="205" cy="166" rx="162" ry="8" fill="#0b1118" opacity="0.08" />

        {/* The outline is what keeps a black vehicle visible against a dark
            card; it resolves through a CSS variable so it follows the theme. */}
        <path
          d={profile.body}
          fill={`url(#${gradientId})`}
          stroke="var(--border-strong)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />

        {/* Glasshouse, dark enough to read against every body colour. */}
        <path d={profile.glass} fill="#0b1620" opacity="0.42" />
        {profile.pillars.map((x) => (
          <rect
            key={x}
            x={x}
            y={profile.glassTop}
            width="5"
            height={profile.glassBottom - profile.glassTop}
            fill={paint}
            opacity="0.9"
          />
        ))}

        {/* Body crease along the flank */}
        <path
          d={`M${profile.wheels[0] - 60} 126 H${profile.wheels[1] + 56}`}
          stroke="#0b1118"
          strokeOpacity="0.1"
          strokeWidth="2"
        />

        {profile.wheels.map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="152" r="27" fill="#161b21" />
            <circle cx={cx} cy="152" r="14" fill="#ffffff" opacity="0.26" />
            <circle cx={cx} cy="152" r="5" fill="#161b21" opacity="0.7" />
          </g>
        ))}
      </svg>

      <span
        className="absolute bottom-2.5 right-3 text-[0.5625rem] font-semibold uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-muted)' }}
      >
        Photography pending
      </span>
    </div>
  );
}
