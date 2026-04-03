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

  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  if (workspaceId) search.set('workspace_id', workspaceId);

  try {
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return await runtimeProxyResponse(`/providers/health-check${suffix}`, { method: 'GET' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider health-check proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
