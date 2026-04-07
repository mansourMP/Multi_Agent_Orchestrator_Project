import type { NextRequest } from 'next/server';
import type { AgentTurnRequest } from '@shared/api-contract';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  getAdminBrowserIdentity,
  getControlPlaneSession,
  requireControlPlaneRole,
  requireControlPlaneSession,
} from '@/lib/server/controlPlaneSession';
import { runtimeAuthorizedFetch, runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

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

function wantsDirectChatStream(turn: AgentTurnRequest | null): turn is AgentTurnRequest {
  return Boolean(
    turn
    && (turn.execution_mode || 'sync') === 'sync'
    && (turn.response_mode || 'stream') === 'stream',
  );
}

function buildDirectChatBody(turn: AgentTurnRequest): Record<string, unknown> {
  const hints = asRecord(turn.context_hints);
  const metadata = asRecord(hints.metadata);
  const approvedAction = asRecord(hints.approved_action);
  return {
    workspace_id: String(turn.workspace_id || 'default').trim() || 'default',
    thread_id: String(turn.session_id || '').trim(),
    channel: String(turn.channel || 'web').trim() || 'web',
    message: String(turn.message || ''),
    attachments: Array.isArray(turn.attachments) ? turn.attachments : [],
    machine_target: turn.machine_target || undefined,
    policy_context: asRecord(turn.policy_context),
    provider: typeof hints.provider === 'string' ? hints.provider : undefined,
    model: typeof hints.model === 'string' ? hints.model : undefined,
    reasoning_effort: typeof hints.reasoning_effort === 'string' ? hints.reasoning_effort : undefined,
    client_request_id: typeof hints.request_id === 'string' ? hints.request_id : undefined,
    last_event_id: typeof hints.last_event_id === 'string' ? hints.last_event_id : undefined,
    approved_action: Object.keys(approvedAction).length > 0 ? approvedAction : undefined,
    prior_messages: Array.isArray(hints.prior_messages) ? hints.prior_messages : undefined,
    max_iterations: hints.max_iterations,
    metadata,
  };
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

  if (wantsDirectChatStream(turn)) {
    try {
      const forwardedHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      const lastEventId = request.headers.get('last-event-id');
      if (lastEventId) forwardedHeaders['Last-Event-ID'] = lastEventId;
      const runtimeResponse = await runtimeAuthorizedFetch('/turn', {
        method: 'POST',
        body: JSON.stringify(buildDirectChatBody(turn)),
        headers: forwardedHeaders,
      });
      const headers = new Headers();
      headers.set('content-type', runtimeResponse.headers.get('content-type') || 'text/event-stream');
      headers.set('cache-control', 'no-store');
      headers.set('connection', 'keep-alive');
      return new Response(runtimeResponse.body, {
        status: runtimeResponse.status,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Turn stream proxy failed.';
      return Response.json({ detail: message }, { status: 503 });
    }
  }

  try {
    const { status, payload } = await runtimeJsonRequest('/turn', {
      method: 'POST',
      body: stampedBody || undefined,
      headers: stampedBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Turn proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
