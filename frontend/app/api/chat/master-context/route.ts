import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function queryWorkspaceId(request: NextRequest): string {
  return String(request.nextUrl.searchParams.get('workspace_id') || 'default').trim() || 'default';
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const workspaceId = queryWorkspaceId(request);
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'viewer');
  if (workspaceFailure) return workspaceFailure;

  try {
    const { status, payload } = await runtimeJsonRequest(
      `/agent-registry/chat-context?workspace_id=${encodeURIComponent(workspaceId)}`,
      { method: 'GET' },
    );
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Master chat context proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
