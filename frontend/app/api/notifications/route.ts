import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneRole, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeAuthorizedFetch, runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function sanitizeNotificationsQuery(request: NextRequest): string {
  const next = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    next.set(key, normalized);
  }
  return next.toString();
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'viewer');
  if (roleFailure) return roleFailure;

  const query = sanitizeNotificationsQuery(request);
  const runtimePath = `/notifications${query ? `?${query}` : ''}`;
  const stream = String(request.nextUrl.searchParams.get('stream') || '').trim().toLowerCase() === 'true';

  if (stream) {
    try {
      const upstream = await runtimeAuthorizedFetch(runtimePath, { method: 'GET' });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notifications stream proxy failed.';
      return Response.json({ detail: message }, { status: 503 });
    }
  }

  try {
    const { status, payload } = await runtimeJsonRequest(runtimePath, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notifications proxy failed.';
    return Response.json({ detail: message, items: [], count: 0, total: 0, sessions: [], session_count: 0 }, { status: 503 });
  }
}
