/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vehicle photography is hot-linked from the upstream inventory source, so the
  // hostname set is not known ahead of time. `unoptimized` keeps <img> semantics
  // simple and avoids a build-time allowlist that breaks whenever the source
  // changes CDNs.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
