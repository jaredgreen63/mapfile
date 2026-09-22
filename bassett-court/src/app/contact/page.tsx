import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { AppointmentForm } from '@/components/AppointmentForm';
import { LocationNote } from '@/components/LocationNote';
import { getVehicles } from '@/lib/inventory';
import { toBookable } from '@/lib/booking';
import { formatAddress } from '@/lib/format';
import { siteConfig } from '~/site.config';

export const metadata: Metadata = {
  title: 'Contact',
  description: `Reach ${siteConfig.name} by phone, email or the enquiry form.`,
};

export default async function ContactPage() {
  const bookable = toBookable(await getVehicles());
  const { contact } = siteConfig;
  const address = formatAddress(contact.address);

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow="Contact"
        title="Talk to us"
        lede="Questions about a listing, a vehicle you want us to find, or a trade-in you want valued — this reaches the people who can answer."
      />

      <div className="mx-auto mt-12 grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,1fr)] lg:px-8">
        <div className="space-y-9">
          <div>
            <h2 className="eyebrow">Who you will speak to</h2>
            <p className="mt-2.5 text-[1.0625rem] font-medium">{contact.name}</p>
            <p className="mt-0.5 text-[0.875rem] text-secondary">{siteConfig.legalName}</p>
          </div>

          <div>
            <h2 className="eyebrow">By phone</h2>
            <p className="numeric mt-2.5 text-[1.5rem] font-semibold tracking-tight">
              <a href={`tel:${contact.phone.replace(/[^0-9+]/g, '')}`} className="transition-colors hover:text-[var(--accent)]">
                {contact.phone}
              </a>
            </p>
          </div>

          <div>
            <h2 className="eyebrow">By email</h2>
            <p className="mt-2.5 text-[1.0625rem]">
              <a href={`mailto:${contact.email}`} className="break-all transition-colors hover:text-[var(--accent)]">
                {contact.email}
              </a>
            </p>
          </div>

          <div>
            <h2 className="eyebrow">Where we are</h2>
            <address className="mt-2.5 text-[0.9375rem] not-italic leading-relaxed text-secondary">
              {address.lines.map((line, index) => (
                <span key={line}>
                  {index > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </address>
          </div>

          <div>
            <h2 className="eyebrow">Where the vehicles are</h2>
            <div className="mt-3 max-w-xs">
              <LocationNote />
            </div>
          </div>

          <div>
            <h2 className="eyebrow">Hours</h2>
            <ul className="mt-3 max-w-xs space-y-2 text-[0.9375rem] text-secondary">
              {contact.hours.map((entry) => (
                <li key={entry.days} className="flex justify-between gap-6 border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span>{entry.days}</span>
                  <span className="numeric">{entry.close ? `${entry.open} – ${entry.close}` : entry.open}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="h-fit rounded-[var(--radius-card)] p-6 sm:p-8"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' }}
        >
          <h2 className="display-soft text-[1.5rem]">Book or ask a question</h2>
          <div className="mt-5">
            <AppointmentForm vehicles={bookable} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
