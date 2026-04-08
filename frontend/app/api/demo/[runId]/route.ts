import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneRole,
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'viewer');
  if (roleFailure) return roleFailure;

  const { runId } = await context.params;
  const workspaceId = String(request.nextUrl.searchParams.get('workspaceId') || request.nextUrl.searchParams.get('workspace_id') || 'default').trim() || 'default';
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'viewer');
  if (workspaceFailure) return workspaceFailure;

  try {
    const { status, payload } = await runtimeJsonRequest(
      `/desktop/demo/${encodeURIComponent(runId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
      { method: 'GET' },
    );
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Desktop demo status proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
