import type { SourceAdapter } from '../types';
import { sitemapJsonLdAdapter } from './sitemap-jsonld';
import { feedAdapter } from './feed';
import { demoAdapter } from './demo';

export const adapters: Record<string, SourceAdapter> = {
  'sitemap-jsonld': sitemapJsonLdAdapter,
  feed: feedAdapter,
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

export { sitemapJsonLdAdapter, feedAdapter, demoAdapter };
