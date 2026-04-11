import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function buildThreadQuery(request: NextRequest): string {
  const params = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  const includeTurns = String(request.nextUrl.searchParams.get('include_turns') || '').trim();
  const limit = String(request.nextUrl.searchParams.get('limit') || '').trim();
  if (workspaceId) params.set('workspace_id', workspaceId);
  if (includeTurns) params.set('include_turns', includeTurns);
  if (limit) params.set('limit', limit);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    const { status, payload } = await runtimeJsonRequest(`/threads${buildThreadQuery(request)}`, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Thread list proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
