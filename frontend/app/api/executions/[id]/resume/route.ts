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
  const rawExecutionId = String(id || '').trim();
  const owned = await requireOwnedRun(request, rawExecutionId);
  if (owned.response) return owned.response;

  const executionId = encodeURIComponent(rawExecutionId);
  const rawBody = await request.text();

  try {
    const { status, payload } = await runtimeJsonRequest(`/executions/${executionId}/resume`, {
      method: 'POST',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution resume proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
