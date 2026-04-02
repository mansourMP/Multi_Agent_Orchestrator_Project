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

  const contentType = request.headers.get('content-type') || 'audio/webm';
  const payload = Buffer.from(await request.arrayBuffer());

  try {
    const upstream = await runtimeAuthorizedFetch('/stt', {
      method: 'POST',
      body: payload,
      headers: {
        'Content-Type': contentType,
      },
    });
    const text = await upstream.text().catch(() => '');
    const headers = new Headers({ 'content-type': upstream.headers.get('content-type') || 'application/json' });
    return new Response(text, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Speech transcription proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
