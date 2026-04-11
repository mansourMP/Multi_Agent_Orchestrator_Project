import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function normalizedSessionId(id: string): string {
  return String(id || '').trim();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { id } = await context.params;
  const sessionId = normalizedSessionId(id);
  if (!sessionId) return Response.json({ detail: 'Session id is required.' }, { status: 400 });

  try {
    const { status, payload } = await runtimeJsonRequest(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session lookup failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rejection = enforceBffRouteGuard(request, { methods: ['DELETE'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { id } = await context.params;
  const sessionId = normalizedSessionId(id);
  if (!sessionId) return Response.json({ detail: 'Session id is required.' }, { status: 400 });

  try {
    const { status, payload } = await runtimeJsonRequest(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session terminate failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
