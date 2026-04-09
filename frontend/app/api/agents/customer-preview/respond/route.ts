import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    const rawBody = await request.text();
    const { status, payload } = await runtimeJsonRequest('/agents/customer-preview/respond', {
      method: 'POST',
      body: rawBody || '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Customer preview proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
