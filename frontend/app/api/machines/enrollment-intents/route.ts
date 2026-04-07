import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneRole,
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

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
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(
    request,
    workspaceId,
    'member',
    'machines.manage',
  );
  if (workspaceFailure) return workspaceFailure;

  try {
    const { status, payload } = await runtimeJsonRequest('/machines/enrollment-intents', {
      method: 'POST',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Machine enrollment intent proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
