import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { siteConfig } from '~/site.config';

export const metadata: Metadata = {
  title: 'Financing',
  description: 'Financing options, what to bring, and how approval works at Bassett Court Holdings.',
};

export default function FinancingPage() {
  const steps = [
    { title: 'Tell us the vehicle', body: 'Send us the listing you are interested in, or describe what you are after. We confirm it is available before anything else happens.' },
    { title: 'Share the basics', body: 'Name, contact details, and the terms you have in mind — down payment, monthly range, trade-in if you have one.' },
    { title: 'We shop the lenders', body: 'We submit to the lenders we work with and come back with the actual offers, including rate and term, not a teaser figure.' },
    { title: 'You decide in writing', body: 'Nothing is signed until you have the numbers in front of you. If the terms do not work, we say so rather than stretching the loan.' },
  ];

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow="Financing"
        title="Straightforward terms"
        lede="We work with a panel of lenders and present what they actually offer. No payment packing, no rate markup dressed up as a convenience fee."
      />

      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        <ol className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="numeric text-[0.75rem] font-semibold" style={{ color: 'var(--accent)' }}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h2 className="display-tight mt-2.5 text-[1.5rem]">{step.title}</h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="rounded-[var(--radius-card)] p-8 sm:p-10"
          style={{ backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
        >
          <h2 className="display-soft text-[1.75rem]">What to have ready</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              'Valid driver’s licence',
              'Proof of income — recent pay stubs or bank statements',
              'Proof of insurance, or we can arrange a binder',
              'Trade-in title and registration, if applicable',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[0.9375rem] text-secondary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-1 shrink-0" style={{ color: 'var(--accent)' }}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/contact" className="btn btn-accent px-6 py-3">Start a conversation</Link>
            <Link href="/inventory" className="btn btn-outline px-6 py-3">Browse inventory</Link>
          </div>
        </div>

        <p className="mt-8 max-w-3xl text-[0.6875rem] leading-relaxed text-muted">
          Financing is subject to credit approval. Advertised rates and terms are illustrative and do not
          constitute an offer of credit. The payment estimator on each listing is a calculation tool only —
          it does not include tax, title, registration, fees or any lender charges. {siteConfig.pricing.disclaimer}
        </p>
      </section>
    </div>
  );
}
