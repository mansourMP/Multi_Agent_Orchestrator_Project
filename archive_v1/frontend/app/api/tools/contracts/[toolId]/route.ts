import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ toolId: string }>;
};

export async function PUT(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['PUT'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { toolId } = await params;
  const normalized = encodeURIComponent(String(toolId || '').trim());
  if (!normalized) return Response.json({ detail: 'Tool id is required.' }, { status: 400 });

  try {
    const body = await request.text();
    return await runtimeProxyResponse(`/tools/contracts/${normalized}`, { method: 'PUT', body });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool contract update failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
