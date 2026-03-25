import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  try {
    const { status, payload } = await runtimeJsonRequest('/runtime/runtimes/status', { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime machines proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
