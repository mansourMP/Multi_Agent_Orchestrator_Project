import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { consumeDesktopControlPlaneAuthHandoffResponse } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, {
    methods: ['POST'],
    requireLoopbackHost: true,
  });
  if (rejection) return rejection;

  const response = await consumeDesktopControlPlaneAuthHandoffResponse(request);
  if (!response) {
    return new Response(null, { status: 204 });
  }
  return response;
}
