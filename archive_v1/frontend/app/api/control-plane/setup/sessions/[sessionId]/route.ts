import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { sessionId } = await params;
  const normalized = encodeURIComponent(String(sessionId || '').trim());

  try {
    return await runtimeProxyResponse(`/setup/sessions/${normalized}`, { method: 'GET' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Setup session refresh failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
