import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeAuthorizedFetch } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const path = String(request.nextUrl.searchParams.get('path') || '').trim();
  if (!path) {
    return Response.json({ detail: 'Artifact path is required.' }, { status: 400 });
  }

  try {
    const upstream = await runtimeAuthorizedFetch(`/artifacts/file?path=${encodeURIComponent(path)}`, {
      method: 'GET',
    });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return new Response(text || 'Artifact proxy failed.', {
        status: upstream.status || 502,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Content-Length': upstream.headers.get('content-length') || '',
        'Content-Disposition': upstream.headers.get('content-disposition') || '',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Artifact proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
