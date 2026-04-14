import type { NextRequest } from 'next/server';

import { forwardControlPlaneRequest } from '@/lib/server/control-plane-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return forwardControlPlaneRequest(request, '/api/v1/auth/register');
}
