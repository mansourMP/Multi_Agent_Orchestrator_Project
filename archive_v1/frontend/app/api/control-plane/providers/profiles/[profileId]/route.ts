import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ profileId: string }>;
};

export async function DELETE(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['DELETE'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { profileId } = await params;
  const normalized = encodeURIComponent(String(profileId || '').trim());

  try {
    return await runtimeProxyResponse(`/providers/profiles/${normalized}`, { method: 'DELETE' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime profile delete failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
