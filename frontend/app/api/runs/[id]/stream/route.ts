import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeAuthorizedFetch } from '@/lib/server/runtimeControlPlane';
import { requireOwnedRun } from '@/lib/server/runOwnership';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { id } = await params;
  const rawRunId = String(id || '').trim();
  const owned = await requireOwnedRun(request, rawRunId);
  if (owned.response) return owned.response;
  const runId = encodeURIComponent(rawRunId);

  try {
    const upstream = await runtimeAuthorizedFetch(`/runs/${runId}/stream`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
      },
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return new Response(text || 'Stream proxy failed.', {
        status: upstream.status || 502,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run stream proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
