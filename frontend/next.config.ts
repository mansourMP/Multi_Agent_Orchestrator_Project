import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.resolve(__dirname, '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
