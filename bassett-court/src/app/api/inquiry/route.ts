import { NextResponse } from 'next/server';

/**
 * Lead intake.
 *
 * Out of the box this validates the submission and records it in the server log
 * so nothing is silently dropped. Set LEAD_WEBHOOK_URL to forward leads to a
 * CRM, Zapier/Make scenario, or an email service — that is the one-line change
 * that makes the form deliver.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Payload {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  company?: string;
  vehicleId?: string;
  vehicleLabel?: string;
}

const MAX_FIELD_LENGTH = 2000;

export async function POST(request: Request): Promise<NextResponse> {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  // Honeypot — a filled hidden field means a bot. Return 200 so the bot does
  // not learn it was caught, but drop the submission.
  if (payload.company) {
    return NextResponse.json({ ok: true });
  }

  const name = clean(payload.name);
  const email = clean(payload.email);

  if (!name) return NextResponse.json({ error: 'Please include your name.' }, { status: 400 });
  if (!email || !isEmail(email)) {
    return NextResponse.json({ error: 'Please include a valid email address.' }, { status: 400 });
  }

  const lead = {
    receivedAt: new Date().toISOString(),
    name,
    email,
    phone: clean(payload.phone),
    message: clean(payload.message),
    vehicleId: clean(payload.vehicleId),
    vehicleLabel: clean(payload.vehicleLabel),
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
      // The visitor did their part; log loudly rather than showing them a failure
      // we can recover from by reading the log.
      console.error('[lead] webhook delivery failed', { lead, error });
      return NextResponse.json(
        { error: 'We could not send that just now. Please call us and we will take care of it.' },
        { status: 502 },
      );
    }
  } else {
    console.info('[lead] received (no LEAD_WEBHOOK_URL configured)', lead);
  }

  return NextResponse.json({ ok: true });
}

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
