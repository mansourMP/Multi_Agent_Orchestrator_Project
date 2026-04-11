import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneRole,
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
  resolveRuntimeWorkspaceId,
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
  const workspaceId = await resolveRuntimeWorkspaceId(
    request,
    String(request.nextUrl.searchParams.get('workspace_id') || 'default').trim() || 'default',
  );
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(
    request,
    workspaceId,
    'viewer',
    'machines.read',
  );
  if (workspaceFailure) return workspaceFailure;

  try {
    const suffix = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
    const { status, payload } = await runtimeJsonRequest(`/machines${suffix}`, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Machines proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'member');
  if (roleFailure) return roleFailure;

  const rawBody = await request.text();
  let workspaceId = 'default';
  try {
    const parsed = JSON.parse(rawBody || '{}') as { workspace_id?: string };
    workspaceId = String(parsed.workspace_id || 'default').trim() || 'default';
  } catch {
    workspaceId = 'default';
  }
  workspaceId = await resolveRuntimeWorkspaceId(request, workspaceId);
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(
    request,
    workspaceId,
    'member',
    'machines.manage',
  );
  if (workspaceFailure) return workspaceFailure;

  try {
    const { status, payload } = await runtimeJsonRequest('/machines/enroll', {
      method: 'POST',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Machine enroll proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
