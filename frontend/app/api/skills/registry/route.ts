import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const url = new URL(request.url);
  const upstreamPath = url.search ? `/skills/registry${url.search}` : '/skills/registry';
  try {
    return await runtimeProxyResponse(upstreamPath, { method: 'GET' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load marketplace registry.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
