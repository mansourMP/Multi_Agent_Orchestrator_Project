import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';
import { requireOwnedRun } from '@/lib/server/runOwnership';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { id } = await params;
  const rawRunId = String(id || '').trim();
  const owned = await requireOwnedRun(request, rawRunId);
  if (owned.response) return owned.response;

  try {
    const { status, payload } = await runtimeJsonRequest(`/runs/${encodeURIComponent(rawRunId)}/resume`, {
      method: 'POST',
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run resume proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
