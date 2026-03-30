import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeAuthorizedFetch } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const rawBody = await request.text();

  try {
    const runtimeResponse = await runtimeAuthorizedFetch('/chat/respond', {
      method: 'POST',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    const headers = new Headers();
    const contentType = runtimeResponse.headers.get('content-type');
    headers.set('content-type', contentType || 'text/event-stream');
    headers.set('cache-control', 'no-store');
    headers.set('connection', 'keep-alive');
    return new Response(runtimeResponse.body, {
      status: runtimeResponse.status,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat response proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
