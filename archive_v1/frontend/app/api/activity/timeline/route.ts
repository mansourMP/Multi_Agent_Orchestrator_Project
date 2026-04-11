import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
  resolveRuntimeWorkspaceId,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function sanitizeQuery(request: NextRequest): URLSearchParams {
  const query = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || 'default').trim() || 'default';
  query.set('workspace_id', workspaceId);
  for (const key of ['limit', 'run_id', 'event_class', 'detail_level', 'actor_type', 'actor_id', 'install_id', 'app_id', 'thread_id']) {
    const value = String(request.nextUrl.searchParams.get(key) || '').trim();
    if (value) {
      query.set(key, value);
    }
  }
  return query;
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const query = sanitizeQuery(request);
  const workspaceId = query.get('workspace_id') || 'default';
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'viewer');
  if (workspaceFailure) return workspaceFailure;
  query.set('workspace_id', await resolveRuntimeWorkspaceId(request, workspaceId));

  try {
    const { status, payload } = await runtimeJsonRequest(`/activity/timeline?${query.toString()}`, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Activity timeline proxy failed.';
    return Response.json({ detail: message, count: 0, summary: {}, items: [] }, { status: 503 });
  }
}
