import type { MetadataRoute } from 'next';
import { getSnapshot } from '@/lib/inventory';
import { siteConfig } from '~/site.config';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await getSnapshot();
  const base = siteConfig.url.replace(/\/$/, '');

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/inventory`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/financing`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const vehicleRoutes: MetadataRoute.Sitemap = snapshot.vehicles.map((vehicle) => ({
    url: `${base}/inventory/${vehicle.slug}`,
    lastModified: vehicle.lastSeenAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...staticRoutes, ...vehicleRoutes];
}
