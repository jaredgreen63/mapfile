import type { AdapterOptions, RawVehicle, SourceAdapter } from '../types';
import { fetchText, loadRobots, mapLimit, sleep } from './http';
import { vehicleFromHtmlFallback, vehicleFromJsonLd } from './extract';

/**
 * Default adapter: discover vehicle detail pages through the source's XML
 * sitemaps, then read the schema.org markup each one publishes.
 *
 * Sitemaps are the right discovery mechanism here because they are the source's
 * own published index of what exists. When a vehicle sells and its page is
 * pulled, it leaves the sitemap, so it drops out of the next sync without any
 * extra bookkeeping — which is exactly the add/remove behaviour we need.
 */

/** URL shapes used for vehicle detail pages across the major dealer platforms. */
const VDP_PATTERNS: RegExp[] = [
  /\/(new|used|certified|pre-owned)[^/]*\/[^/]+\/[^/]+\.htm[l]?$/i, // Dealer.com
  /\/(new|used|certified)-(vehicle|inventory)\//i,                   // Dealer Inspire / Sincro
  /\/vehicle(-details)?\//i,                                         // fusionZONE / eProcess
  /\/inventory\/[^/]+-[a-hj-npr-z0-9]{17}/i,                         // VIN in path
  /[?&]vin=[a-hj-npr-z0-9]{17}/i,                                    // VIN in query
  /\/(newvehicledetails|usedvehicledetails|vdp)\b/i,                 // DealerOn
];

/** Pages that match a VDP pattern loosely but are really search or filter pages. */
const EXCLUDE_PATTERNS: RegExp[] = [
  /\/(search|inventory)\/?$/i,
  /\/(blog|news|service|parts|specials|about|contact|finance|staff|reviews)\b/i,
  /[?&](page|start|offset|sort)=/i,
  /\.(jpg|jpeg|png|webp|gif|pdf|css|js)$/i,
];

const SITEMAP_HINTS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/inventory-sitemap.xml',
  '/vehicle-sitemap.xml',
  '/sitemap/inventory.xml',
];

function looksLikeVdp(url: string): boolean {
  if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(url))) return false;
  return VDP_PATTERNS.some((pattern) => pattern.test(url));
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim().replace(/&amp;/g, '&'))
    .filter(Boolean);
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/** Walk sitemap indexes breadth-first, collecting every page URL. */
async function collectSitemapUrls(
  seeds: string[],
  log: (message: string) => void,
): Promise<string[]> {
  const queue = [...new Set(seeds)];
  const visited = new Set<string>();
  const pages = new Set<string>();
  let guard = 0;

  while (queue.length && guard < 200) {
    const sitemapUrl = queue.shift()!;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    guard += 1;

    let xml: string | null = null;
    try {
      xml = await fetchText(sitemapUrl, { accept: 'application/xml,text/xml,*/*' });
    } catch (error) {
      log(`  sitemap unreachable: ${sitemapUrl} (${(error as Error).message})`);
      continue;
    }
    if (!xml) continue;

    const locs = extractLocs(xml);
    if (isSitemapIndex(xml)) {
      log(`  index ${sitemapUrl} -> ${locs.length} child sitemap(s)`);
      // Prioritise children whose names suggest inventory.
      const inventoryFirst = locs.sort((a, b) =>
        Number(/inventory|vehicle|new|used/i.test(b)) - Number(/inventory|vehicle|new|used/i.test(a)),
      );
      queue.push(...inventoryFirst);
    } else {
      for (const loc of locs) pages.add(loc);
      log(`  sitemap ${sitemapUrl} -> ${locs.length} URL(s)`);
    }
  }

  return [...pages];
}

export const sitemapJsonLdAdapter: SourceAdapter = {
  name: 'sitemap-jsonld',

  async fetchAll(options: AdapterOptions): Promise<RawVehicle[]> {
    const log = options.log ?? (() => {});
    const origin = new URL(options.sourceUrl).origin;

    const robots = await loadRobots(origin);
    const delayMs = Math.max(options.politenessDelayMs ?? 250, robots.crawlDelayMs);
    log(`robots.txt: ${robots.sitemaps.length} sitemap(s) advertised, crawl delay ${delayMs}ms`);

    const seeds = robots.sitemaps.length
      ? robots.sitemaps
      : SITEMAP_HINTS.map((path) => new URL(path, origin).toString());

    const allUrls = await collectSitemapUrls(seeds, log);
    log(`discovered ${allUrls.length} URL(s) across sitemaps`);

    let vdpUrls = allUrls.filter(looksLikeVdp).filter((url) => {
      try {
        return robots.isAllowed(new URL(url).pathname);
      } catch {
        return false;
      }
    });

    // Some platforms give inventory its own sitemap with plain URLs that match
    // none of the known shapes. If the pattern filter finds nothing but the
    // sitemaps clearly contain inventory pages, fall back to path keywords.
    if (!vdpUrls.length) {
      log('no URLs matched the known detail-page shapes; falling back to keyword matching');
      vdpUrls = allUrls.filter(
        (url) =>
          /\/(inventory|vehicle|new|used|certified|pre-owned)\//i.test(url) &&
          !EXCLUDE_PATTERNS.some((pattern) => pattern.test(url)),
      );
    }

    if (options.limit && options.limit > 0) vdpUrls = vdpUrls.slice(0, options.limit);
    log(`fetching ${vdpUrls.length} vehicle detail page(s)`);

    let processed = 0;
    const results = await mapLimit(vdpUrls, 4, async (url) => {
      if (delayMs) await sleep(delayMs);
      try {
        const html = await fetchText(url);
        if (!html) return null;
        const vehicle = vehicleFromJsonLd(html, url) ?? vehicleFromHtmlFallback(html, url);
        return vehicle;
      } catch {
        return null;
      } finally {
        processed += 1;
        if (processed % 50 === 0) log(`  ...${processed}/${vdpUrls.length}`);
      }
    });

    const vehicles = results.filter((vehicle): vehicle is RawVehicle => vehicle !== null);
    log(`parsed ${vehicles.length} vehicle(s) from ${vdpUrls.length} page(s)`);
    return vehicles;
  },
};
