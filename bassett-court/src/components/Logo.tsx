import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { siteConfig } from '~/site.config';

/**
 * Renders the uploaded logo when one is present in /public, and a typographic
 * wordmark until then — so the header is never a broken image while the brand
 * asset is still in flight.
 *
 * Drop `logo.svg` (preferred) or `logo.png` into `public/` and it is picked up
 * on the next build. No code change needed.
 */

const CANDIDATES = ['/logo.svg', '/logo.png', '/logo.webp', '/logo.jpg'];

function findLogo(): string | null {
  if (!siteConfig.logo.enabled) return null;
  const preferred = [siteConfig.logo.src, ...CANDIDATES];
  for (const candidate of preferred) {
    if (existsSync(join(process.cwd(), 'public', candidate.replace(/^\//, '')))) {
      return candidate;
    }
  }
  return null;
}

export function Logo({ className = '', inverted = false }: { className?: string; inverted?: boolean }) {
  const src = findLogo();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={siteConfig.logo.alt}
        className={`h-9 w-auto object-contain md:h-10 ${className}`}
      />
    );
  }

  return <Wordmark className={className} inverted={inverted} />;
}

export function Wordmark({ className = '', inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`} aria-label={siteConfig.name}>
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.3rem] border text-[0.8125rem] font-semibold tracking-tight"
        style={{
          borderColor: inverted ? 'rgb(255 255 255 / 0.35)' : 'var(--accent)',
          color: inverted ? '#fff' : 'var(--accent)',
          fontFamily: 'var(--font-display)',
        }}
      >
        BC
      </span>
      <span className="flex flex-col leading-none">
        <span
          className="display-tight text-[1.0625rem] font-medium"
          style={{ color: inverted ? '#fff' : 'var(--text-primary)' }}
        >
          Bassett Court
        </span>
        <span
          className="mt-[0.1875rem] text-[0.5625rem] font-semibold uppercase tracking-[0.22em]"
          style={{ color: inverted ? 'rgb(255 255 255 / 0.6)' : 'var(--text-muted)' }}
        >
          Holdings
        </span>
      </span>
    </span>
  );
}
