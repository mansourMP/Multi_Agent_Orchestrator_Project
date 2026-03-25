import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    const [snapshot, inbox] = await Promise.all([
      runtimeJsonRequest('/agents/workspace/snapshot?workspace_id=default&history_limit=12&audit_limit=16', { method: 'GET' }),
      runtimeJsonRequest('/events/inbox?workspace_id=default&limit=12&include_sessions=1&session_limit=6', { method: 'GET' }),
    ]);

    if (snapshot.status < 200 || snapshot.status >= 300) {
      return Response.json(snapshot.payload, { status: snapshot.status || 503 });
    }

    return Response.json({
      snapshot: snapshot.payload,
      inbox: inbox.status >= 200 && inbox.status < 300 ? inbox.payload : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workbench control-center proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
