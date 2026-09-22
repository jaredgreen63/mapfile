import { NextResponse } from 'next/server';
import { siteConfig } from '~/site.config';

/**
 * Appointment and enquiry intake.
 *
 * Validates the submission and records it in the server log so nothing is
 * silently dropped. Set LEAD_WEBHOOK_URL to forward to a CRM, a Zapier/Make
 * scenario, or an email service — that is the change that makes the form
 * actually deliver.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Payload {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  company?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  preferredDay?: string;
  preferredDayLabel?: string;
  preferredTime?: string;
  tradeIn?: string;
}

const MAX_FIELD_LENGTH = 2000;

export async function POST(request: Request): Promise<NextResponse> {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  // Honeypot. Return 200 so the bot does not learn it was caught.
  if (payload.company) return NextResponse.json({ ok: true });

  const name = clean(payload.name);
  const phone = clean(payload.phone);
  const email = clean(payload.email);

  if (!name) {
    return NextResponse.json({ error: 'Please include your name.' }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json(
      { error: 'Please include a phone number or an email address so we can reach you.' },
      { status: 400 },
    );
  }
  if (email && !isEmail(email)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  }

  const lead = {
    receivedAt: new Date().toISOString(),
    name,
    phone,
    email,
    vehicleId: clean(payload.vehicleId),
    vehicleLabel: clean(payload.vehicleLabel),
    preferredDay: clean(payload.preferredDay),
    preferredDayLabel: clean(payload.preferredDayLabel),
    preferredTime: clean(payload.preferredTime),
    tradeIn: clean(payload.tradeIn),
    message: clean(payload.message),
    vehicleLocation: siteConfig.location.oneLine,
  };

  const webhook = process.env.LEAD_WEBHOOK_URL;
  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
    } catch (error) {
      // The visitor did their part. Log loudly so the request is recoverable
      // even though delivery failed.
      console.error('[appointment] webhook delivery failed', { lead, error });
      return NextResponse.json(
        {
          error: `We could not send that just now. Please call or text ${siteConfig.contact.phone} and we will take care of it.`,
        },
        { status: 502 },
      );
    }
  } else {
    console.info('[appointment] received (no LEAD_WEBHOOK_URL configured)', lead);
  }

  return NextResponse.json({ ok: true });
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_LENGTH) : '';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
