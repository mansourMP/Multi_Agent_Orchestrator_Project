import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import {
  registryInstallDetailPath,
  registryInstallUpdatePath,
  registrySpecialistDetailPath,
  workspaceIdFromPayload,
} from '@/lib/server/agentRuntimeRouteContracts.js';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function queryWorkspaceId(request: NextRequest): string {
  return String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ install_id: string }> },
) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const workspaceId = queryWorkspaceId(request);
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'viewer');
  if (workspaceFailure) return workspaceFailure;
  const { install_id } = await context.params;

  try {
    const { status, payload } = await runtimeJsonRequest(registryInstallDetailPath(install_id, workspaceId), { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent detail proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ install_id: string }> },
) {
  const rejection = enforceBffRouteGuard(request, { methods: ['PATCH'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const body = await request.json().catch(() => null);
  const workspaceId = workspaceIdFromPayload(body || {});
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'member');
  if (workspaceFailure) return workspaceFailure;
  const { install_id } = await context.params;

  try {
    const runtimePath = body?.manifest
      ? registrySpecialistDetailPath(install_id)
      : registryInstallUpdatePath(install_id);
    const { status, payload } = await runtimeJsonRequest(runtimePath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent update proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
