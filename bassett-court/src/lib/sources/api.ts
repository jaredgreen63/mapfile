import type { AdapterOptions, RawVehicle, SourceAdapter } from '../types';
import { fetchText, sleep } from './http';
import { mapRow, parseFeedBody } from './feed';

/**
 * Authenticated JSON/CSV/XML API adapter.
 *
 * This is the shape most dealer inventory APIs take: a key, an endpoint, and
 * pages of vehicle records. Field names are matched loosely by `mapRow`, so a
 * new provider usually needs nothing beyond a URL and a credential.
 *
 * The key is read from the environment and never logged, never written to the
 * snapshot, and never included in an error message.
 */

export type AuthStyle = 'bearer' | 'header' | 'query' | 'none';

export interface ApiSourceConfig {
  name: string;
  url: string;
  apiKey?: string;
  /** How the credential is presented. Default: bearer. */
  authStyle?: AuthStyle;
  /** Header name for `authStyle: 'header'`. Default: X-API-Key. */
  headerName?: string;
  /** Query parameter for `authStyle: 'query'`. Default: api_key. */
  queryParam?: string;
  /** Extra query parameters to send on every request. */
  params?: Record<string, string>;
  /** Max pages to walk before giving up. */
  maxPages?: number;
  /** Records per page, when the API accepts a size parameter. */
  pageSize?: number;
  /** Name of the page parameter. Default: page. */
  pageParam?: string;
}

/** Keys an API commonly uses to point at the next page. */
const NEXT_KEYS = ['next', 'next_page', 'nextPage', 'nextUrl', 'next_url', 'nextCursor', 'next_cursor'];

function buildUrl(config: ApiSourceConfig, page: number): string {
  const url = new URL(config.url);
  for (const [key, value] of Object.entries(config.params ?? {})) {
    url.searchParams.set(key, value);
  }
  if (config.apiKey && config.authStyle === 'query') {
    url.searchParams.set(config.queryParam ?? 'api_key', config.apiKey);
  }
  if (page > 1) {
    url.searchParams.set(config.pageParam ?? 'page', String(page));
  }
  if (config.pageSize) {
    url.searchParams.set('limit', String(config.pageSize));
  }
  return url.toString();
}

function authHeaders(config: ApiSourceConfig): Record<string, string> {
  if (!config.apiKey || config.authStyle === 'query' || config.authStyle === 'none') return {};
  if (config.authStyle === 'header') {
    return { [config.headerName ?? 'X-API-Key']: config.apiKey };
  }
  return { Authorization: `Bearer ${config.apiKey}` };
}

/** Strip any credential out of a string before it reaches a log. */
export function redact(text: string, secret?: string): string {
  if (!secret) return text;
  return text.split(secret).join('***');
}

export async function fetchApiInventory(
  config: ApiSourceConfig,
  log: (message: string) => void,
  onRawRows?: (rows: Record<string, unknown>[]) => void,
): Promise<RawVehicle[]> {
  if (!config.url) {
    throw new Error(`${config.name}: no endpoint configured.`);
  }

  const maxPages = config.maxPages ?? 25;
  const collected: Record<string, unknown>[] = [];
  // Every URL we have already fetched. An API that ignores the page parameter,
  // or a cursor that points back at itself, would otherwise loop until
  // maxPages and duplicate the whole catalogue.
  const seen = new Set<string>();
  let previousBody: string | null = null;
  let nextUrl: string | null = buildUrl(config, 1);
  let page = 1;

  while (nextUrl && page <= maxPages) {
    if (seen.has(nextUrl)) {
      log('  already fetched this page; stopping pagination');
      break;
    }
    seen.add(nextUrl);
    log(`page ${page}`);

    let body: string | null;
    try {
      body = await fetchText(nextUrl, {
        accept: 'application/json,text/csv,application/xml;q=0.9,*/*;q=0.8',
        headers: authHeaders(config),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${config.name}: request failed — ${redact(message, config.apiKey)}`);
    }

    if (!body) {
      if (page === 1) throw new Error(`${config.name}: endpoint returned no content.`);
      break;
    }

    // An API that ignores the page parameter hands back the same records under
    // a different URL, which the URL guard above cannot see. Identical
    // consecutive bodies mean pagination is not working; stop rather than
    // multiply the catalogue by maxPages.
    if (previousBody !== null && body === previousBody) {
      log('  page identical to the previous one; stopping pagination');
      break;
    }
    previousBody = body;

    let rows: Record<string, unknown>[];
    try {
      rows = parseFeedBody(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${config.name}: could not parse the response — ${redact(message, config.apiKey)}`);
    }

    log(`  ${rows.length} record(s)`);
    if (!rows.length) break;
    collected.push(...rows);

    // Prefer the cursor the API gives us. Fall back to numeric paging only
    // when a page size is configured and this page came back full — without a
    // page size there is no way to tell a complete response from a partial one,
    // and guessing means requesting pages that do not exist.
    const cursor = findNextUrl(body, nextUrl);
    const looksFull = config.pageSize != null && rows.length >= config.pageSize;
    nextUrl = cursor ?? (looksFull && page < maxPages ? buildUrl(config, page + 1) : null);

    page += 1;
    if (nextUrl) await sleep(200);
  }

  log(`collected ${collected.length} record(s) across ${page - 1} page(s)`);
  onRawRows?.(collected);
  return collected.map(mapRow);
}

function findNextUrl(body: string, current: string): string | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const envelopes = [parsed, parsed.meta, parsed.pagination, parsed.links].filter(
      (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object',
    );
    for (const envelope of envelopes) {
      for (const key of NEXT_KEYS) {
        const value = envelope[key];
        if (typeof value === 'string' && value && value !== current) {
          return new URL(value, current).toString();
        }
      }
    }
  } catch {
    /* not JSON, or no cursor — fall back to numeric paging */
  }
  return null;
}

export function createApiAdapter(config: Omit<ApiSourceConfig, 'url' | 'apiKey'> & {
  resolve: () => { url: string; apiKey?: string };
}): SourceAdapter {
  return {
    name: config.name,
    async fetchAll(options: AdapterOptions): Promise<RawVehicle[]> {
      const { url, apiKey } = config.resolve();
      return fetchApiInventory(
        { ...config, url: url || options.feedUrl || '', apiKey },
        (message) => options.log?.(message),
        options.onRawRows,
      );
    },
  };
}
