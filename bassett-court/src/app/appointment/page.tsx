import type { Metadata } from 'next';
import { AppointmentForm } from '@/components/AppointmentForm';
import { LocationNote } from '@/components/LocationNote';
import { PageHeader } from '@/components/PageHeader';
import { getVehicles } from '@/lib/inventory';
import { toBookable } from '@/lib/booking';
import { siteConfig } from '~/site.config';

export const metadata: Metadata = {
  title: 'Book an Appointment',
  description: `Book a test drive or appointment with ${siteConfig.contact.name} at ${siteConfig.legalName}. Vehicles are located at ${siteConfig.location.dealer}.`,
};

export default async function AppointmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const vehicles = await getVehicles();
  const bookable = toBookable(vehicles);

  const params = await searchParams;
  const requested = Array.isArray(params.vehicle) ? params.vehicle[0] : params.vehicle;
  const defaultVehicleId = bookable.some((v) => v.id === requested) ? requested : undefined;

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow="Appointments"
        title="Book a test drive"
        lede={`Pick a vehicle and a time that suits you. ${siteConfig.contact.name} confirms every appointment personally — no call centre, no pressure.`}
      />

      <div className="mx-auto mt-12 grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1.05fr)] lg:px-8">
        <div className="space-y-8">
          <LocationNote />

          <div>
            <h2 className="eyebrow">How it works</h2>
            <ol className="mt-4 space-y-5">
              {[
                { title: 'Send the request', body: 'Name and a phone number is all we truly need. Everything else just helps us prepare.' },
                { title: 'We confirm the vehicle is there', body: 'Before you drive anywhere, we check the vehicle is still on the lot and ready to be seen.' },
                { title: 'You get a time in writing', body: `${siteConfig.contact.name} calls or texts back with a confirmed time, and the price you saw on the listing.` },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    className="numeric mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.75rem] font-bold"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="display-soft text-[1.0625rem]">{step.title}</p>
                    <p className="mt-1 text-[0.875rem] leading-relaxed text-secondary">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div
            className="rounded-[var(--radius-card)] p-5"
            style={{ backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
          >
            <h2 className="eyebrow">Prefer to just call?</h2>
            <p className="numeric mt-2.5 text-[1.5rem] font-bold tracking-tight">
              <a href={`tel:${siteConfig.contact.phone.replace(/[^0-9+]/g, '')}`} className="transition-colors hover:text-[var(--accent)]">
                {siteConfig.contact.phone}
              </a>
            </p>
            <p className="mt-1 text-[0.8125rem] text-secondary">
              {siteConfig.contact.name} · {siteConfig.legalName}
            </p>
          </div>
        </div>

        <div
          className="h-fit rounded-[var(--radius-card)] p-6 sm:p-8"
          style={{
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-lift)',
          }}
        >
          <h2 className="display-soft text-[1.5rem]">Request an appointment</h2>
          <p className="mt-1.5 text-[0.875rem] text-secondary">
            Book a test drive or appointment — we confirm with you{' '}
            <strong style={{ color: 'var(--text-primary)' }}>personally</strong>.
          </p>
          <div className="mt-6">
            <AppointmentForm vehicles={bookable} defaultVehicleId={defaultVehicleId} />
          </div>
        </div>
      </div>
    </div>
  );
}
