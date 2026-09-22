import type { SourceAdapter } from '../types';
import { sitemapJsonLdAdapter } from './sitemap-jsonld';
import { feedAdapter } from './feed';
import { demoAdapter } from './demo';
import { shiftlyAdapter } from './shiftly';

export const adapters: Record<string, SourceAdapter> = {
  'sitemap-jsonld': sitemapJsonLdAdapter,
  feed: feedAdapter,
  shiftly: shiftlyAdapter,
  demo: demoAdapter,
};

export function getAdapter(name: string): SourceAdapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(
      `Unknown inventory adapter "${name}". Available: ${Object.keys(adapters).join(', ')}`,
    );
  }
  return adapter;
}

export { sitemapJsonLdAdapter, feedAdapter, shiftlyAdapter, demoAdapter };
