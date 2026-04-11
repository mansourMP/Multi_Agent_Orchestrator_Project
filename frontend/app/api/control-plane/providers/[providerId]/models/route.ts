import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
  resolveRuntimeWorkspaceId,
} from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ providerId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { providerId } = await params;
  const normalized = encodeURIComponent(String(providerId || '').trim());
  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  const credentialId = String(request.nextUrl.searchParams.get('credential_id') || '').trim();
  if (workspaceId) {
    const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'viewer');
    if (workspaceFailure) return workspaceFailure;
    search.set('workspace_id', await resolveRuntimeWorkspaceId(request, workspaceId));
  }
  if (credentialId) search.set('credential_id', credentialId);

  try {
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return await runtimeProxyResponse(`/providers/${normalized}/models${suffix}`, { method: 'GET' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider models proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
