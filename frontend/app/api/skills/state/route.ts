import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    return await runtimeProxyResponse('/skills/state', { method: 'GET' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load skills.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['PUT'] });
  if (rejection) return rejection;

  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const rawBody = await request.text();

  try {
    return await runtimeProxyResponse('/skills/state', {
      method: 'PUT',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update skills state.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
