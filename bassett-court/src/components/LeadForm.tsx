'use client';

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'sent' | 'error';

export function LeadForm({
  vehicleId,
  vehicleLabel,
  compact = false,
}: {
  vehicleId?: string;
  vehicleLabel?: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setError(null);

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, vehicleId, vehicleLabel }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'We could not send that just now.');
      }

      form.reset();
      setStatus('sent');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div
        className="rounded-[var(--radius-card)] p-6 text-center"
        style={{ backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
      >
        <p className="display-tight text-xl">Thank you — we have your message.</p>
        <p className="mt-2 text-sm text-secondary">
          A member of our team will follow up shortly to confirm availability and next steps.
        </p>
        <button type="button" onClick={() => setStatus('idle')} className="btn btn-outline mt-5">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      {vehicleLabel ? (
        <p className="text-[0.8125rem] text-secondary">
          Inquiring about <strong style={{ color: 'var(--text-primary)' }}>{vehicleLabel}</strong>
        </p>
      ) : null}

      <div className={compact ? 'space-y-4' : 'grid gap-4 sm:grid-cols-2'}>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Name</span>
          <input name="name" required autoComplete="name" className="field" placeholder="Jane Doe" />
        </label>

        <label className="block">
          <span className="eyebrow mb-1.5 block">Phone</span>
          <input name="phone" type="tel" autoComplete="tel" className="field" placeholder="(555) 555-0123" />
        </label>
      </div>

      <label className="block">
        <span className="eyebrow mb-1.5 block">Email</span>
        <input name="email" type="email" required autoComplete="email" className="field" placeholder="jane@example.com" />
      </label>

      <label className="block">
        <span className="eyebrow mb-1.5 block">Message</span>
        <textarea
          name="message"
          rows={compact ? 3 : 4}
          className="field resize-y"
          placeholder={vehicleLabel ? 'Is this still available? I would like to arrange a time to see it.' : 'Tell us what you are looking for.'}
        />
      </label>

      {/* Honeypot: bots fill hidden fields, people do not. */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-[0.8125rem]" style={{ color: '#c0392b' }}>
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={status === 'submitting'} className="btn btn-accent w-full disabled:opacity-60">
        {status === 'submitting' ? 'Sending…' : 'Send inquiry'}
      </button>

      <p className="text-[0.6875rem] leading-relaxed text-muted">
        By submitting you agree to be contacted about this request. We do not sell your information.
      </p>
    </form>
  );
}
