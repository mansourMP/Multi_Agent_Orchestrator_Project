import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneRole, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { requireOwnedRun } from '@/lib/server/runOwnership';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'viewer');
  if (roleFailure) return roleFailure;

  const { id } = await params;
  const runId = String(id || '').trim();
  const owned = await requireOwnedRun(request, runId);
  if (owned.response) return owned.response;
  return Response.json(owned.payload ?? {}, { status: 200 });
}
