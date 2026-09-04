/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Demo rendering is a preview/development aid only. Even if a stale Vercel
  // project variable is accidentally left enabled, Production bundles must
  // compile the public demo flag to false. The demo completion API has its own
  // independent server-side Production block as a second line of defense.
  env: {
    NEXT_PUBLIC_DEMO_MODE:
      process.env.VERCEL_ENV === 'production'
        ? 'false'
        : process.env.NEXT_PUBLIC_DEMO_MODE ?? 'false',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
      {
        source: '/api/admin/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
    ];
  },
};

export default nextConfig;