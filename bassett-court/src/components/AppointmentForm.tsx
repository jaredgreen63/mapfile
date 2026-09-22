'use client';

import { useEffect, useMemo, useState } from 'react';
import { siteConfig } from '~/site.config';

type Status = 'idle' | 'submitting' | 'sent' | 'error';

export interface BookableVehicle {
  id: string;
  slug: string;
  label: string;
  price: string;
}

interface DayOption {
  /** ISO date, submitted with the form. */
  value: string;
  /** "Today", "Tomorrow", "Thu 9/24". */
  label: string;
}

/**
 * Appointment request.
 *
 * Deliberately short: name and phone are the only required fields, because
 * every extra required box costs bookings. Everything else is a preference we
 * confirm by phone anyway.
 */
export function AppointmentForm({
  vehicles,
  defaultVehicleId,
  compact = false,
}: {
  vehicles: BookableVehicle[];
  defaultVehicleId?: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const [vehicleId, setVehicleId] = useState(defaultVehicleId ?? '');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [tradeIn, setTradeIn] = useState(siteConfig.booking.tradeInOptions[0]);

  // Dates are derived on the client. Computing them during render would bake
  // the build date into the statically generated HTML, so the chips would read
  // "Today" for a day that had already passed.
  const [days, setDays] = useState<DayOption[] | null>(null);
  useEffect(() => setDays(buildDays(siteConfig.booking.daysAhead)), []);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setError(null);

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch('/api/appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          vehicleId,
          vehicleLabel: selectedVehicle?.label ?? '',
          preferredDay: day,
          preferredDayLabel: days?.find((d) => d.value === day)?.label ?? '',
          preferredTime: time,
          tradeIn,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'We could not send that just now.');
      }

      form.reset();
      setDay(''); setTime(''); setVehicleId(defaultVehicleId ?? '');
      setStatus('sent');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  if (status === 'sent') return <Confirmation onReset={() => setStatus('idle')} />;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Your name" required>
        <input name="name" required autoComplete="name" placeholder="Full name" className="field" />
      </Field>

      <div className={compact ? 'space-y-5' : 'grid gap-5 sm:grid-cols-2'}>
        <Field label="Phone" required>
          <input name="phone" type="tel" required autoComplete="tel" placeholder="(864) 555-0123" className="field" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" placeholder="you@email.com" className="field" />
        </Field>
      </div>

      <Field label="Which vehicle?">
        <select
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
          className="field"
          aria-label="Which vehicle"
        >
          <option value="">Select a vehicle</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.label} — {vehicle.price}
            </option>
          ))}
          <option value="__other">Something else / not sure yet</option>
        </select>
      </Field>

      <fieldset>
        <legend className="eyebrow mb-2.5">Preferred day</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {days
            ? days.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={day === option.value}
                  onClick={() => setDay(day === option.value ? '' : option.value)}
                  className="chip"
                >
                  {option.label}
                </button>
              ))
            : // Placeholders keep the layout from jumping before dates resolve.
              Array.from({ length: siteConfig.booking.daysAhead }, (_, i) => (
                <span key={i} className="chip opacity-40" aria-hidden="true">
                  &nbsp;
                </span>
              ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-2.5">Preferred time</legend>
        <div className="grid grid-cols-3 gap-2">
          {siteConfig.booking.timeSlots.map((slot) => (
            <button
              key={slot}
              type="button"
              aria-pressed={time === slot}
              onClick={() => setTime(time === slot ? '' : slot)}
              className="chip"
            >
              {slot}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Have a trade-in?">
        <select
          value={tradeIn}
          onChange={(event) => setTradeIn(event.target.value as typeof tradeIn)}
          className="field"
          aria-label="Have a trade-in"
        >
          {siteConfig.booking.tradeInOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </Field>

      <Field label="Anything we should know?">
        <textarea
          name="message"
          rows={compact ? 3 : 4}
          placeholder="Trade-in details, budget, timeline, questions…"
          className="field resize-y"
        />
      </Field>

      {/* Honeypot — bots fill hidden fields, people do not. */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-[0.8125rem] font-medium" style={{ color: '#ef6d62' }}>
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="btn btn-accent w-full py-3.5 text-[0.9375rem] disabled:opacity-60"
      >
        {status === 'submitting' ? 'Sending…' : 'Request My Appointment'}
      </button>

      <p className="text-center text-[0.75rem] leading-relaxed text-muted">
        {siteConfig.booking.reassurance}
      </p>

      <p className="text-center text-[0.8125rem] text-secondary">
        Rather talk now? Call or text {siteConfig.contact.name} at{' '}
        <a
          href={`tel:${siteConfig.contact.phone.replace(/[^0-9+]/g, '')}`}
          className="numeric font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          {siteConfig.contact.phone}
        </a>
        .
      </p>
    </form>
  );
}

function Field({
  label, required = false, children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">
        {label}
        {required ? <span style={{ color: 'var(--accent)' }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Confirmation({ onReset }: { onReset: () => void }) {
  return (
    <div
      className="rounded-[var(--radius-card)] p-7 text-center"
      style={{ backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
    >
      <div
        className="mx-auto grid h-12 w-12 place-items-center rounded-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <p className="display-soft mt-4 text-[1.375rem]">Request received</p>
      <p className="mx-auto mt-2.5 max-w-sm text-[0.875rem] leading-relaxed text-secondary">
        {siteConfig.contact.name} will reach out personally to confirm a time. If you need it sooner,
        call or text{' '}
        <a href={`tel:${siteConfig.contact.phone.replace(/[^0-9+]/g, '')}`} className="numeric font-semibold" style={{ color: 'var(--accent)' }}>
          {siteConfig.contact.phone}
        </a>
        .
      </p>
      <button type="button" onClick={onReset} className="btn btn-outline mt-6">
        Book another
      </button>
    </div>
  );
}

/** "Today", "Tomorrow", then weekday + M/D for the rest of the window. */
function buildDays(count: number): DayOption[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    const label =
      offset === 0
        ? 'Today'
        : offset === 1
          ? 'Tomorrow'
          : `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.getMonth() + 1}/${date.getDate()}`;

    // Local calendar date, not toISOString — that would shift the day for
    // anyone west of UTC.
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { value, label };
  });
}
