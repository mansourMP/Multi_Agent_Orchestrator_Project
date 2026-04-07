import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneRole, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
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
  const roleFailure = await requireControlPlaneRole(request, 'member');
  if (roleFailure) return roleFailure;

  const { id } = await params;
  const rawRunId = String(id || '').trim();
  const owned = await requireOwnedRun(request, rawRunId);
  if (owned.response) return owned.response;
  const runId = encodeURIComponent(rawRunId);
  const rawBody = await request.text();

  try {
    const { status, payload } = await runtimeJsonRequest(`/runs/${runId}/delegate/auto`, {
      method: 'POST',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auto-delegate proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
