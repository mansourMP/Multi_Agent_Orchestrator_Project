import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import {
  registryInboundChannelPath,
  workspaceIdFromPayload,
} from '@/lib/server/agentRuntimeRouteContracts.js';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const body = await request.json().catch(() => null);
  const workspaceId = workspaceIdFromPayload(body || {});
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'viewer');
  if (workspaceFailure) return workspaceFailure;

  try {
    const { status, payload } = await runtimeJsonRequest(registryInboundChannelPath(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Channel ingress proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
