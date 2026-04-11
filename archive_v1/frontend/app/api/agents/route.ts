import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import {
  registryInstallsCollectionPath,
  registryInstallsPath,
  registrySpecialistsPath,
  workspaceIdFromPayload,
} from '@/lib/server/agentRuntimeRouteContracts.js';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function queryWorkspaceId(request: NextRequest): string {
  return String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
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
    const { status, payload } = await runtimeJsonRequest(registryInstallsPath(workspaceId), { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agents proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: 'Invalid specialist payload.' }, { status: 400 });
  }

  const workspaceId = workspaceIdFromPayload(body);
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'member');
  if (workspaceFailure) return workspaceFailure;

  try {
    const runtimePath = body.manifest ? registrySpecialistsPath() : registryInstallsCollectionPath();
    const { status, payload } = await runtimeJsonRequest(runtimePath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent create proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
