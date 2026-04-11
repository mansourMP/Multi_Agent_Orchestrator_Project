import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import {
  parseJsonObjectBody,
  registryCustomerPreviewRespondPath,
  workspaceIdFromPayload,
} from '@/lib/server/agentRuntimeRouteContracts.js';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    const rawBody = await request.text();
    const body = parseJsonObjectBody(rawBody, 'Invalid customer preview payload.');
    const workspaceId = workspaceIdFromPayload(body);
    const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'viewer');
    if (workspaceFailure) return workspaceFailure;
    const { status, payload } = await runtimeJsonRequest(registryCustomerPreviewRespondPath(), {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Customer preview proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
