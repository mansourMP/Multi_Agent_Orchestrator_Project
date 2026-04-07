import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard, sanitizeArtifactsWorkspaceQuery } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneRole,
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'viewer');
  if (roleFailure) return roleFailure;
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  if (workspaceId) {
    const workspaceFailure = await requireControlPlaneWorkspaceAccess(
      request,
      workspaceId,
      'viewer',
      'artifacts.read',
    );
    if (workspaceFailure) return workspaceFailure;
  }

  const query = sanitizeArtifactsWorkspaceQuery(request);
  const runtimePath = `/artifacts${query ? `?${query}` : ''}`;

  try {
    const { status, payload } = await runtimeJsonRequest(runtimePath, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Artifacts proxy failed.';
    return Response.json({ ok: false, detail: message, items: [] }, { status: 503 });
  }
}
