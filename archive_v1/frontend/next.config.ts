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
        source: '/executions',
        destination: '/runs',
        permanent: false,
      },
      {
        source: '/history',
        destination: '/runs',
        permanent: false,
      },
      {
        source: '/approvals',
        destination: '/runs',
        permanent: false,
      },
      {
        source: '/artifacts',
        destination: '/runs',
        permanent: false,
      },
      {
        source: '/store',
        destination: '/agents',
        permanent: false,
      },
      {
        source: '/library',
        destination: '/agents',
        permanent: false,
      },
      {
        source: '/connectors',
        destination: '/integrations',
        permanent: false,
      },
      {
        source: '/notifications',
        destination: '/runs',
        permanent: false,
      },
      {
        source: '/credentials',
        destination: '/integrations',
        permanent: false,
      },
      {
        source: '/machines',
        destination: '/integrations',
        permanent: false,
      },
      {
        source: '/health',
        destination: '/integrations',
        permanent: false,
      },
      {
        source: '/home',
        destination: '/',
        permanent: false,
      },
      {
        source: '/builder/:path*',
        destination: '/agents',
        permanent: false,
      },
      {
        source: '/skills/:path*',
        destination: '/agents',
        permanent: false,
      },
      {
        source: '/solutions/:path*',
        destination: '/agents',
        permanent: false,
      },
      {
        source: '/apps/:path*',
        destination: '/agents',
        permanent: false,
      },
      {
        source: '/workflows/new',
        destination: '/agents',
        permanent: false,
      },
      {
        source: '/workflows/:path*',
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
