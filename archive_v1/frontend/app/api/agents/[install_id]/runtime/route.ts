import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import {
  registrySpecialistRuntimePath,
  workspaceIdFromPayload,
} from '@/lib/server/agentRuntimeRouteContracts.js';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ install_id: string }> },
) {
  const rejection = enforceBffRouteGuard(request, { methods: ['PUT'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const body = await request.json().catch(() => null);
  const workspaceId = workspaceIdFromPayload(body || {});
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'member');
  if (workspaceFailure) return workspaceFailure;
  const { install_id } = await context.params;

  try {
    const { status, payload } = await runtimeJsonRequest(
      registrySpecialistRuntimePath(install_id),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      },
    );
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime profile proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
