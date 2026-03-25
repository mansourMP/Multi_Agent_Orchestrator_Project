import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ credentialId: string }>;
};

export async function DELETE(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['DELETE'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { credentialId } = await params;
  const normalized = encodeURIComponent(String(credentialId || '').trim());
  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  if (workspaceId) search.set('workspace_id', workspaceId);

  try {
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return await runtimeProxyResponse(`/credentials/vault/${normalized}${suffix}`, { method: 'DELETE' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Credential delete failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
