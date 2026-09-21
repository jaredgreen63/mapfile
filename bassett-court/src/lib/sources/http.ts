/** Shared HTTP plumbing for inventory adapters: polite, retrying, robots-aware. */

export const USER_AGENT =
  'BassettCourtInventoryBot/1.0 (+https://www.bassettcourtholdings.com/about; inventory syndication)';

export interface FetchTextOptions {
  timeoutMs?: number;
  retries?: number;
  accept?: string;
}

export async function fetchText(
  url: string,
  { timeoutMs = 20_000, retries = 2, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }: FetchTextOptions = {},
): Promise<string | null> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      // 404/410 mean the listing is gone — that is an answer, not a failure.
      if (response.status === 404 || response.status === 410) return null;

      if (!response.ok) {
        // Back off on rate limiting and transient server errors; give up on
        // anything else, since retrying a 403 just annoys the origin.
        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`HTTP ${response.status} for ${url}`);
          await sleep(backoffMs(attempt));
          continue;
        }
        return null;
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError) throw lastError;
  return null;
}

export function backoffMs(attempt: number): number {
  return Math.min(8_000, 1_000 * 2 ** attempt);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run tasks with bounded concurrency, preserving input order in the output. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

export interface Robots {
  /** Sitemap URLs advertised in robots.txt. */
  sitemaps: string[];
  /** True when the path is allowed for our user-agent. */
  isAllowed(path: string): boolean;
  crawlDelayMs: number;
}

/**
 * Minimal robots.txt parser covering the directives that matter here:
 * User-agent grouping, Allow/Disallow with `*` and `$`, Crawl-delay, Sitemap.
 *
 * A source we cannot read robots.txt for is treated as fully allowed, matching
 * the RFC's guidance for an unreachable robots file.
 */
export async function loadRobots(origin: string): Promise<Robots> {
  const permissive: Robots = { sitemaps: [], isAllowed: () => true, crawlDelayMs: 0 };

  let body: string | null = null;
  try {
    body = await fetchText(new URL('/robots.txt', origin).toString(), { retries: 1, accept: 'text/plain' });
  } catch {
    return permissive;
  }
  if (!body) return permissive;

  const sitemaps: string[] = [];
  const rules: { allow: boolean; pattern: string }[] = [];
  let crawlDelaySeconds = 0;

  // Directives apply to the most recently declared user-agent group. We collect
  // rules from the wildcard group and from any group naming our bot.
  let groupApplies = false;
  let sawAnyAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }

    if (field === 'user-agent') {
      const agent = value.toLowerCase();
      groupApplies = agent === '*' || USER_AGENT.toLowerCase().includes(agent);
      sawAnyAgent = true;
      continue;
    }

    if (!sawAnyAgent || !groupApplies) continue;

    if (field === 'disallow') {
      // An empty Disallow is an explicit "everything is permitted".
      if (value) rules.push({ allow: false, pattern: value });
    } else if (field === 'allow') {
      if (value) rules.push({ allow: true, pattern: value });
    } else if (field === 'crawl-delay') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) crawlDelaySeconds = Math.max(crawlDelaySeconds, parsed);
    }
  }

  return {
    sitemaps,
    crawlDelayMs: Math.round(crawlDelaySeconds * 1000),
    isAllowed(path: string) {
      // Longest matching pattern wins; Allow beats Disallow on equal length.
      let best: { allow: boolean; length: number } | null = null;
      for (const rule of rules) {
        if (!matchesRobotsPattern(path, rule.pattern)) continue;
        const length = rule.pattern.length;
        if (!best || length > best.length || (length === best.length && rule.allow)) {
          best = { allow: rule.allow, length };
        }
      }
      return best ? best.allow : true;
    },
  };
}

function matchesRobotsPattern(path: string, pattern: string): boolean {
  const anchoredEnd = pattern.endsWith('$');
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchoredEnd ? '$' : ''}`).test(path);
}
