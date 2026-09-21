'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = safeRead();
    const initial: Theme =
      stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('bch-theme', next);
    } catch {
      // Private browsing or blocked storage — the toggle still works for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="grid h-9 w-9 place-items-center rounded-lg border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
    >
      {/* Render nothing until the client resolves the theme, to avoid a flash of
          the wrong icon during hydration. */}
      <span className="sr-only">Toggle theme</span>
      {theme === null ? null : theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function safeRead(): Theme | null {
  try {
    const value = localStorage.getItem('bch-theme');
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * Applies the stored theme before first paint. Rendered inline in <head> so it
 * runs ahead of hydration and there is no flash of the wrong palette.
 */
export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('bch-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`;
