import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneRole,
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'viewer');
  if (roleFailure) return roleFailure;

  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  if (workspaceId) {
    const workspaceFailure = await requireControlPlaneWorkspaceAccess(
      request,
      workspaceId,
      'viewer',
      'connectors.read',
    );
    if (workspaceFailure) return workspaceFailure;
  }
  if (workspaceId) search.set('workspace_id', workspaceId);

  try {
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return await runtimeProxyResponse(`/connectors${suffix}`, { method: 'GET' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connector proxy failed.';
    return Response.json({ detail: message, items: [], connectors: [] }, { status: 503 });
  }
}
