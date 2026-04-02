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
    const upstream = await runtimeAuthorizedFetch('/tts', {
      method: 'POST',
      body: rawBody,
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
      },
    });
    const headers = new Headers();
    headers.set('content-type', upstream.headers.get('content-type') || 'audio/mpeg');
    headers.set('cache-control', 'no-store');
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Text-to-speech proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
