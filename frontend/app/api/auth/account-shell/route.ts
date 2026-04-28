import type { NextRequest } from 'next/server';

import { forwardControlPlaneRequest } from '@/lib/server/control-plane-proxy';

export const dynamic = 'force-dynamic';
const AUTH_ACCOUNT_SHELL_TIMEOUT_MS = 4_000;

export async function GET(request: NextRequest) {
  return forwardControlPlaneRequest(request, '/api/v1/auth/account-shell', {
    method: 'GET',
    timeoutMs: AUTH_ACCOUNT_SHELL_TIMEOUT_MS,
  });
}
