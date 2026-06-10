import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.resolve(__dirname, '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingIncludes: {
    '/*': [
      '.next/BUILD_ID',
      '.next/app-path-routes-manifest.json',
      '.next/build-manifest.json',
      '.next/fallback-build-manifest.json',
      '.next/images-manifest.json',
      '.next/package.json',
      '.next/prerender-manifest.json',
      '.next/required-server-files.json',
      '.next/routes-manifest.json',
      '.next/server/app-paths-manifest.json',
      '.next/server/functions-config-manifest.json',
      '.next/server/middleware-build-manifest.js',
      '.next/server/middleware-manifest.json',
      '.next/server/next-font-manifest.json',
      '.next/server/pages-manifest.json',
      '.next/server/server-reference-manifest.js',
      '.next/server/server-reference-manifest.json',
      '../scripts/install-agent-computer.sh',
    ],
  },
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
