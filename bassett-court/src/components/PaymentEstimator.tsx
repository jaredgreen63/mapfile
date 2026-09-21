'use client';

import { useMemo, useState } from 'react';
import { formatPrice, monthlyPayment } from '@/lib/pricing';
import { siteConfig } from '~/site.config';

export function PaymentEstimator({ price }: { price: number }) {
  const { defaultApr, defaultTermMonths, defaultDownPaymentRate, termOptions } = siteConfig.finance;

  const [down, setDown] = useState<number>(() => Math.round((price * defaultDownPaymentRate) / 100) * 100);
  const [term, setTerm] = useState<number>(defaultTermMonths);
  const [apr, setApr] = useState<number>(defaultApr);

  const financed = Math.max(price - down, 0);
  const payment = useMemo(() => monthlyPayment(financed, apr, term), [financed, apr, term]);

  return (
    <div
      className="rounded-[var(--radius-card)] p-5"
      style={{ backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
    >
      <h3 className="eyebrow">Estimate a payment</h3>

      <p className="numeric mt-3 text-[1.75rem] font-semibold leading-none tracking-tight">
        {payment == null ? '—' : formatPrice(Math.round(payment), '—')}
        <span className="ml-1.5 text-[0.8125rem] font-normal text-muted">/ mo</span>
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="eyebrow mb-1.5 block">Down payment</span>
          <input
            type="number"
            min={0}
            max={price}
            step={250}
            value={down}
            onChange={(event) => setDown(clamp(Number(event.target.value) || 0, 0, price))}
            className="field numeric"
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-1.5 block">Term</span>
          <select value={term} onChange={(event) => setTerm(Number(event.target.value))} className="field numeric">
            {termOptions.map((months) => (
              <option key={months} value={months}>{months} months</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="eyebrow mb-1.5 block">APR</span>
          <input
            type="number"
            min={0}
            max={30}
            step={0.1}
            value={apr}
            onChange={(event) => setApr(clamp(Number(event.target.value) || 0, 0, 30))}
            className="field numeric"
          />
        </label>
      </div>

      <p className="mt-4 text-[0.6875rem] leading-relaxed text-muted">
        Estimate only. Assumes {formatPrice(financed)} financed at {apr.toFixed(2)}% APR over {term} months,
        with no tax, title, registration or fees included. Actual terms depend on credit approval and are
        confirmed in writing before purchase.
      </p>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
