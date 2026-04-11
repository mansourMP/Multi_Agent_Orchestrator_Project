import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneRole, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';
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
  const roleFailure = await requireControlPlaneRole(request, 'owner');
  if (roleFailure) return roleFailure;

  const { id } = await params;
  const rawRunId = String(id || '').trim();
  const owned = await requireOwnedRun(request, rawRunId);
  if (owned.response) return owned.response;
  const runId = encodeURIComponent(rawRunId);

  try {
    const { status, payload } = await runtimeJsonRequest(`/runs/${runId}/replay`, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run replay proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
