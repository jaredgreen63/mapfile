import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { siteConfig } from '~/site.config';

/**
 * The header lock-up, resolved on the server in three steps:
 *
 *   1. A full lock-up at `public/logo.svg` (mark and name as one image), if one
 *      has been supplied — that replaces everything below.
 *   2. The lion mark at `public/logo-mark.png` set beside a typographic
 *      wordmark. This is the current arrangement, taken from the company
 *      business card.
 *   3. A "BC" monogram beside the wordmark, so the header still reads as a
 *      brand if both files go missing.
 */

const LOCKUP_CANDIDATES = ['/logo.svg', '/logo.png', '/logo.webp', '/logo.jpg'];

function publicFileExists(path: string): boolean {
  return existsSync(join(process.cwd(), 'public', path.replace(/^\//, '')));
}

function findLockup(): string | null {
  if (!siteConfig.logo.enabled) return null;
  return [siteConfig.logo.src, ...LOCKUP_CANDIDATES].find(publicFileExists) ?? null;
}

function findMark(): string | null {
  if (!siteConfig.logo.enabled) return null;
  const mark = siteConfig.logo.mark;
  return mark && publicFileExists(mark) ? mark : null;
}

export function Logo({ className = '', inverted = false }: { className?: string; inverted?: boolean }) {
  const lockup = findLockup();

  if (lockup) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={lockup}
        alt={siteConfig.logo.alt}
        className={`h-9 w-auto object-contain md:h-10 ${className}`}
      />
    );
  }

  return <Wordmark className={className} inverted={inverted} />;
}

export function Wordmark({
  className = '',
  inverted = false,
  size = 'md',
}: {
  className?: string;
  inverted?: boolean;
  size?: 'md' | 'lg';
}) {
  const mark = findMark();
  const box = size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const title = size === 'lg' ? 'text-[1.375rem]' : 'text-[1.0625rem]';
  const sub = size === 'lg' ? 'text-[0.6875rem]' : 'text-[0.5625rem]';

  return (
    <span className={`flex items-center gap-2.5 ${className}`} aria-label={siteConfig.name}>
      {mark ? (
        <span
          aria-hidden="true"
          className={`${box} shrink-0 overflow-hidden rounded-[0.3rem] ring-1`}
          style={{ '--tw-ring-color': inverted ? 'rgb(255 255 255 / 0.25)' : 'var(--border-subtle)' } as React.CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} alt="" className="h-full w-full object-cover" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`${box} grid shrink-0 place-items-center rounded-[0.3rem] border text-[0.8125rem] font-semibold tracking-tight`}
          style={{
            borderColor: inverted ? 'rgb(255 255 255 / 0.35)' : 'var(--accent)',
            color: inverted ? '#fff' : 'var(--accent)',
            fontFamily: 'var(--font-display)',
          }}
        >
          BC
        </span>
      )}

      <span className="flex flex-col leading-none">
        <span
          className={`display-tight ${title} font-medium`}
          style={{ color: inverted ? '#fff' : 'var(--text-primary)' }}
        >
          Bassett Court
        </span>
        <span
          className={`mt-[0.1875rem] ${sub} font-semibold uppercase tracking-[0.22em]`}
          style={{ color: inverted ? 'rgb(255 255 255 / 0.6)' : 'var(--text-muted)' }}
        >
          Holdings, LLC.
        </span>
      </span>
    </span>
  );
}
