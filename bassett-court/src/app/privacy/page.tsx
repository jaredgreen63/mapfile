import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { siteConfig } from '~/site.config';

export const metadata: Metadata = {
  title: 'Privacy',
  description: `How ${siteConfig.name} handles the information you share.`,
};

export default function PrivacyPage() {
  const sections = [
    {
      title: 'What we collect',
      body: 'When you submit an enquiry we receive the name, email address, phone number and message you provide, along with the listing you were viewing. We do not require an account and we do not ask for financial details through this website.',
    },
    {
      title: 'How we use it',
      body: 'We use your details to answer your enquiry and to follow up about the vehicle you asked about. If you ask us to watch for a particular vehicle, we keep your request on file until you tell us to stop.',
    },
    {
      title: 'What we do not do',
      body: 'We do not sell your information, and we do not pass it to third-party marketing lists. Information is shared with a lender or transport provider only when you have asked us to arrange financing or delivery.',
    },
    {
      title: 'Retention and removal',
      body: `Ask us to delete your details at any time and we will, other than anything we are required to retain for a completed transaction. Write to ${siteConfig.contact.email}.`,
    },
    {
      title: 'Analytics and cookies',
      body: 'This site stores a single preference in your browser — whether you chose the light or dark theme. It is never sent to us and is not used to identify you.',
    },
  ];

  return (
    <div className="pb-24">
      <PageHeader eyebrow="Legal" title="Privacy" lede="Plain terms, because they should be." />

      <section className="mx-auto mt-12 max-w-3xl space-y-9 px-4 sm:px-6 lg:px-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="display-soft text-[1.5rem]">{section.title}</h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-secondary">{section.body}</p>
          </div>
        ))}

        <p className="text-[0.75rem] leading-relaxed text-muted">
          This page is a plain-language summary provided as a starting point. Have counsel review it
          against the privacy and consumer-disclosure rules that apply where you do business before
          you rely on it.
        </p>
      </section>
    </div>
  );
}
