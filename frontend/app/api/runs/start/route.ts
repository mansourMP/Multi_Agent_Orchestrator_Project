import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';
import { stampRunOwnerBody } from '@/lib/server/runOwnership';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const rawBody = await request.text();
  const stampedBody = await stampRunOwnerBody(request, rawBody);

  try {
    const { status, payload } = await runtimeJsonRequest('/runs/start', {
      method: 'POST',
      body: stampedBody || undefined,
      headers: stampedBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run start proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
