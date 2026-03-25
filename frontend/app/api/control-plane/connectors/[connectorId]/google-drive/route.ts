import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ connectorId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { connectorId } = await params;
  const normalized = encodeURIComponent(String(connectorId || '').trim());
  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  const path = String(request.nextUrl.searchParams.get('path') || '').trim();
  if (workspaceId) search.set('workspace_id', workspaceId);
  if (path) search.set('path', path);

  try {
    return await runtimeProxyResponse(`/connectors/vault/${normalized}/google-drive?${search.toString()}`, { method: 'GET' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Drive browse failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
