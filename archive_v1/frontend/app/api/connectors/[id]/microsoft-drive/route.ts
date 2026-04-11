import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { id } = await params;
  const connectorId = encodeURIComponent(String(id || '').trim());
  const search = new URLSearchParams({ workspace_id: 'default' });
  const path = String(request.nextUrl.searchParams.get('path') || '').trim();
  if (path) search.set('path', path);

  try {
    const { status, payload } = await runtimeJsonRequest(
      `/connectors/vault/${connectorId}/microsoft-drive?${search.toString()}`,
      { method: 'GET' },
    );
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Microsoft drive proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
