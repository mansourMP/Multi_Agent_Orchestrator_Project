import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneRole,
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function workspaceIdFromRequest(request: NextRequest, body?: Record<string, unknown>): string {
  const queryValue = String(request.nextUrl.searchParams.get('workspaceId') || request.nextUrl.searchParams.get('workspace_id') || '').trim();
  const bodyValue = String(body?.workspaceId || body?.workspace_id || '').trim();
  return queryValue || bodyValue || 'default';
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'member');
  if (roleFailure) return roleFailure;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const workspaceId = workspaceIdFromRequest(request, body);
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'member');
  if (workspaceFailure) return workspaceFailure;

  try {
    const { status, payload } = await runtimeJsonRequest('/desktop/demo/screenshot-description', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId }),
      headers: { 'Content-Type': 'application/json' },
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Desktop demo start proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
