import Link from 'next/link';
import { Wordmark } from './Logo';
import { siteConfig } from '~/site.config';
import { formatAddress, formatDateTime } from '@/lib/format';
import { LocationNote } from './LocationNote';

export function SiteFooter({ syncedAt, vehicleCount }: { syncedAt: string; vehicleCount: number }) {
  const { contact } = siteConfig;
  const address = formatAddress(contact.address);
  const year = new Date().getFullYear();

  return (
    <footer style={{ backgroundColor: 'var(--surface-sunken)', borderTop: '1px solid var(--border-subtle)' }}>
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Wordmark />
            <p className="mt-4 max-w-xs text-[0.8125rem] leading-relaxed text-secondary">
              {siteConfig.description}
            </p>
          </div>

          <nav aria-label="Footer">
            <h2 className="eyebrow">Browse</h2>
            <ul className="mt-4 space-y-2.5 text-[0.8125rem]">
              {[
                { href: '/inventory', label: 'All Inventory' },
                { href: '/inventory?condition=new', label: 'New Vehicles' },
                { href: '/inventory?condition=used', label: 'Pre-Owned' },
                { href: '/inventory?bodyStyle=Truck', label: 'Trucks' },
                { href: '/inventory?bodyStyle=SUV', label: 'SUVs' },
              ].map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="transition-colors hover:text-[var(--accent)]" style={{ color: 'var(--text-secondary)' }}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="eyebrow">Company</h2>
            <ul className="mt-4 space-y-2.5 text-[0.8125rem]">
              {[
                { href: '/appointment', label: 'Book an Appointment' },
                { href: '/financing', label: 'Financing' },
                { href: '/about', label: 'About Us' },
                { href: '/contact', label: 'Contact' },
                { href: '/privacy', label: 'Privacy' },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition-colors hover:text-[var(--accent)]" style={{ color: 'var(--text-secondary)' }}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="eyebrow">Visit</h2>
            <address className="mt-4 space-y-2.5 text-[0.8125rem] not-italic text-secondary">
              <p>
                {address.lines.map((line, index) => (
                  <span key={line}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </p>
              <p>
                <a href={`tel:${contact.phone.replace(/[^0-9+]/g, '')}`} className="numeric transition-colors hover:text-[var(--accent)]">
                  {contact.phone}
                </a>
              </p>
              <p>
                <a href={`mailto:${contact.email}`} className="break-all transition-colors hover:text-[var(--accent)]">
                  {contact.email}
                </a>
              </p>
            </address>

            <h2 className="eyebrow mt-6">Vehicles located at</h2>
            <p className="mt-3 text-[0.8125rem] font-semibold leading-snug">
              {siteConfig.location.dealer}
            </p>
            <address className="mt-1 text-[0.8125rem] not-italic leading-relaxed text-secondary">
              {siteConfig.location.street}
              <br />
              {siteConfig.location.city}, {siteConfig.location.state} {siteConfig.location.zip}
            </address>
            <a
              href={siteConfig.location.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[0.8125rem] font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--accent)' }}
            >
              Get directions →
            </a>

            <h2 className="eyebrow mt-6">Hours</h2>
            <ul className="mt-3 space-y-1.5 text-[0.8125rem] text-secondary">
              {contact.hours.map((entry) => (
                <li key={entry.days} className="flex justify-between gap-4">
                  <span>{entry.days}</span>
                  <span className="numeric">{entry.close ? `${entry.open} – ${entry.close}` : entry.open}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="mt-12 flex flex-col gap-4 pt-7 text-[0.75rem] text-muted md:flex-row md:items-center md:justify-between"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <p>© {year} {siteConfig.legalName} All rights reserved.</p>
          <p className="numeric">
            {vehicleCount} vehicle{vehicleCount === 1 ? '' : 's'} listed · inventory updated {formatDateTime(syncedAt)}
          </p>
        </div>

        <p className="mt-5 max-w-4xl text-[0.6875rem] leading-relaxed text-muted">
          {siteConfig.pricing.disclaimer}
          {siteConfig.inventory.sourcingDisclosure ? ` ${siteConfig.inventory.sourcingDisclosure}` : ''}
        </p>
      </div>
    </footer>
  );
}
