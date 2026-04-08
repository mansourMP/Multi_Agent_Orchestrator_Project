import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    externalDir: true,
  },
  async redirects() {
    return [
      {
        source: '/builder/:path*',
        destination: '/agents',
        permanent: false,
      },
      {
        source: '/workflows/new',
        destination: '/',
        permanent: false,
      },
      {
        source: '/workflows/:id',
        destination: '/agents',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, { silent: true })
  : nextConfig;
