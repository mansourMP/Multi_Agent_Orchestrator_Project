import type { NextRequest } from 'next/server';

import { forwardControlPlaneRequest } from '@/lib/server/control-plane-proxy';

export const dynamic = 'force-dynamic';
const AUTH_REQUEST_TIMEOUT_MS = 12_000;

export async function POST(request: NextRequest) {
  return forwardControlPlaneRequest(request, '/api/v1/auth/refresh', {
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}
