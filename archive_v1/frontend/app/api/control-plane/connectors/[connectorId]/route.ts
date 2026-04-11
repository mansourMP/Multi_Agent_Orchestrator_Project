import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ connectorId: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['PATCH'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { connectorId } = await params;
  const normalized = encodeURIComponent(String(connectorId || '').trim());
  const rawBody = await request.text();

  try {
    return await runtimeProxyResponse(`/connectors/vault/${normalized}`, {
      method: 'PATCH',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connector update failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['DELETE'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { connectorId } = await params;
  const normalized = encodeURIComponent(String(connectorId || '').trim());
  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  if (workspaceId) search.set('workspace_id', workspaceId);

  try {
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return await runtimeProxyResponse(`/connectors/vault/${normalized}${suffix}`, { method: 'DELETE' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connector delete failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
