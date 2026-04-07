import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneRole, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['DELETE'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'member');
  if (roleFailure) return roleFailure;

  const { id } = await params;
  const machineId = encodeURIComponent(String(id || '').trim());

  try {
    const { status, payload } = await runtimeJsonRequest(`/machines/${machineId}`, { method: 'DELETE' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Machine revoke proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
