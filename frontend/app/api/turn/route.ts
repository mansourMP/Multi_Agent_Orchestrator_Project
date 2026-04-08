import type { NextRequest } from 'next/server';
import type { AgentTurnRequest } from '@shared/api-contract';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  getAdminBrowserIdentity,
  getControlPlaneSession,
  requireControlPlaneRole,
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
} from '@/lib/server/controlPlaneSession';
import { runtimeAuthorizedFetch } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function parseTurnPayload(raw: string): AgentTurnRequest | null {
  try {
    const parsed = JSON.parse(raw) as AgentTurnRequest;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function stampTurnOwnerBody(request: NextRequest, rawBody: string): Promise<string> {
  if (!rawBody) return rawBody;
  const parsed = parseTurnPayload(rawBody);
  if (!parsed) return rawBody;

  const ownerUserId = String((await getControlPlaneSession(request))?.sub || '').trim();
  if (!ownerUserId) return rawBody;

  const identity = await getAdminBrowserIdentity(request);
  const metadata = {
    ...asRecord(parsed.context_hints?.metadata),
    owner_user_id: ownerUserId,
    ...(identity?.email ? { owner_email: identity.email } : {}),
  };

  return JSON.stringify({
    ...parsed,
    context_hints: {
      ...(parsed.context_hints || {}),
      metadata,
    },
  });
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'member');
  if (roleFailure) return roleFailure;

  const rawBody = await request.text();
  const stampedBody = await stampTurnOwnerBody(request, rawBody);
  const turn = parseTurnPayload(stampedBody);
  const workspaceFailure = await requireControlPlaneWorkspaceAccess(
    request,
    String(turn?.workspace_id || 'default').trim() || 'default',
    'member',
    'turn.execute',
  );
  if (workspaceFailure) return workspaceFailure;

  try {
    const forwardedHeaders: Record<string, string> = {};
    if (stampedBody) {
      forwardedHeaders['Content-Type'] = request.headers.get('content-type') || 'application/json';
    }
    const lastEventId = request.headers.get('last-event-id');
    if (lastEventId) forwardedHeaders['Last-Event-ID'] = lastEventId;

    const runtimeResponse = await runtimeAuthorizedFetch('/turn', {
      method: 'POST',
      body: stampedBody || undefined,
      headers: Object.keys(forwardedHeaders).length > 0 ? forwardedHeaders : undefined,
    });
    const contentType = runtimeResponse.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const headers = new Headers();
      headers.set('content-type', contentType || 'text/event-stream');
      headers.set('cache-control', 'no-store');
      headers.set('connection', 'keep-alive');
      return new Response(runtimeResponse.body, {
        status: runtimeResponse.status,
        headers,
      });
    }

    const raw = await runtimeResponse.text().catch(() => '');
    let payload: unknown = raw || {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = raw || {};
    }
    return Response.json(payload, { status: runtimeResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Turn proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
