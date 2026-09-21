'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { siteConfig } from '~/site.config';

export function SiteHeader({ logo }: { logo: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className="sticky top-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? 'color-mix(in srgb, var(--surface-page) 88%, transparent)' : 'var(--surface-page)',
        backdropFilter: scrolled ? 'blur(12px)' : undefined,
        borderBottom: `1px solid ${scrolled ? 'var(--border-subtle)' : 'transparent'}`,
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0" aria-label={`${siteConfig.name} — home`}>
          {logo}
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Primary">
          {siteConfig.nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors"
                style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href={`tel:${siteConfig.contact.phone.replace(/[^0-9+]/g, '')}`}
            className="numeric hidden text-[0.8125rem] font-semibold transition-colors lg:inline"
            style={{ color: 'var(--text-secondary)' }}
          >
            {siteConfig.contact.phone}
          </a>
          <ThemeToggle />
          <Link href="/inventory" className="btn btn-primary hidden sm:inline-flex">
            Browse Inventory
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation"
            className="grid h-9 w-9 place-items-center rounded-lg border md:hidden"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          className="md:hidden"
          style={{ borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface-raised)' }}
          aria-label="Primary mobile"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2.5 text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/inventory" className="btn btn-primary mt-2">
              Browse Inventory
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
