import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { after, before } from 'node:test';

import { loadRobots, mapLimit } from '../src/lib/sources/http';

/** Serve a fixed robots.txt so the parser is tested without touching a real site. */
function withRobotsBody(body: string | null, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(body ?? '', { status: body === null ? 404 : status })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe('loadRobots', () => {
  let restore: () => void;
  after(() => restore?.());

  it('collects advertised sitemaps and the crawl delay', async () => {
    restore = withRobotsBody(`
User-agent: *
Crawl-delay: 2
Disallow: /admin/

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/inventory-sitemap.xml
`);
    const robots = await loadRobots('https://example.com');
    assert.deepEqual(robots.sitemaps, [
      'https://example.com/sitemap.xml',
      'https://example.com/inventory-sitemap.xml',
    ]);
    assert.equal(robots.crawlDelayMs, 2000);
    restore();
  });

  it('honours Disallow, and lets a longer Allow override it', async () => {
    restore = withRobotsBody(`
User-agent: *
Disallow: /inventory/
Allow: /inventory/new/
`);
    const robots = await loadRobots('https://example.com');
    assert.equal(robots.isAllowed('/inventory/used/abc'), false);
    assert.equal(robots.isAllowed('/inventory/new/abc'), true);
    assert.equal(robots.isAllowed('/about'), true);
    restore();
  });

  it('supports * and $ in patterns', async () => {
    restore = withRobotsBody(`
User-agent: *
Disallow: /*.pdf$
Disallow: /search
`);
    const robots = await loadRobots('https://example.com');
    assert.equal(robots.isAllowed('/brochure.pdf'), false);
    assert.equal(robots.isAllowed('/brochure.pdf.html'), true, '$ should anchor the match');
    assert.equal(robots.isAllowed('/search?q=tahoe'), false);
    restore();
  });

  it('ignores rules that belong to another user-agent group', async () => {
    restore = withRobotsBody(`
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /admin/
`);
    const robots = await loadRobots('https://example.com');
    assert.equal(robots.isAllowed('/inventory/new/abc'), true);
    assert.equal(robots.isAllowed('/admin/x'), false);
    restore();
  });

  it('treats an empty Disallow as permission for everything', async () => {
    restore = withRobotsBody('User-agent: *\nDisallow:\n');
    const robots = await loadRobots('https://example.com');
    assert.equal(robots.isAllowed('/anything'), true);
    restore();
  });

  it('falls back to permissive when robots.txt is missing', async () => {
    restore = withRobotsBody(null);
    const robots = await loadRobots('https://example.com');
    assert.equal(robots.isAllowed('/inventory/new/abc'), true);
    assert.deepEqual(robots.sitemaps, []);
    restore();
  });
});

describe('mapLimit', () => {
  it('preserves input order regardless of completion order', async () => {
    const result = await mapLimit([30, 10, 20, 5], 2, async (ms, index) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return index;
    });
    assert.deepEqual(result, [0, 1, 2, 3]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return null;
    });
    assert.ok(peak <= 4, `peak concurrency was ${peak}`);
  });

  it('handles an empty input', async () => {
    assert.deepEqual(await mapLimit([], 4, async () => 1), []);
  });
});
