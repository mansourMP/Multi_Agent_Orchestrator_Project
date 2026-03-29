import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { getControlPlaneSession, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function normalizePendingPayload(status: number, payload: unknown) {
  if (status < 200 || status >= 300) return { items: [] };
  const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  return {
    items: items.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        run_id: String(record.run_id || '').trim(),
        owner_user_id: typeof record.owner_user_id === 'string' ? record.owner_user_id : null,
        approval_id: String(record.approval_id || '').trim(),
        prompt: String(record.prompt || '').trim(),
        status: String(record.status || '').trim(),
        scope: typeof record.scope === 'string' ? record.scope : 'once',
        reusable: typeof record.reusable === 'boolean' ? record.reusable : false,
        consequence: typeof record.consequence === 'string' ? record.consequence : null,
        actions: Array.isArray(record.actions)
          ? record.actions.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [],
        target: typeof record.target === 'string' ? record.target : null,
        requested_at: typeof record.requested_at === 'string' ? record.requested_at : null,
        expires_at: typeof record.expires_at === 'string' ? record.expires_at : null,
        correlation_id: typeof record.correlation_id === 'string' ? record.correlation_id : null,
        labels: Array.isArray(record.labels)
          ? record.labels.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [],
        capabilities: Array.isArray(record.capabilities)
          ? record.capabilities.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [],
        agent_role: typeof record.agent_role === 'string' ? record.agent_role : null,
      };
    }).filter((item) => item.run_id && item.approval_id),
  };
}

function normalizeHistoryPayload(status: number, payload: unknown) {
  if (status < 200 || status >= 300) return { items: [] };
  const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  return {
    items: items.map((item) => {
      const record = item as Record<string, unknown>;
      const connectorBinding = record.connector_binding && typeof record.connector_binding === 'object'
        ? (record.connector_binding as Record<string, unknown>)
        : null;
      return {
        run_id: String(record.run_id || '').trim(),
        owner_user_id: typeof record.owner_user_id === 'string' ? record.owner_user_id : null,
        user_goal: typeof record.user_goal === 'string' ? record.user_goal : null,
        agent_role: typeof record.agent_role === 'string' ? record.agent_role : null,
        connector_binding: connectorBinding
          ? {
              channel: typeof connectorBinding.channel === 'string' ? connectorBinding.channel : null,
              label: typeof connectorBinding.label === 'string' ? connectorBinding.label : null,
              identity_label: typeof connectorBinding.identity_label === 'string' ? connectorBinding.identity_label : null,
              routing_scope: typeof connectorBinding.routing_scope === 'string' ? connectorBinding.routing_scope : null,
            }
          : null,
      };
    }).filter((item) => item.run_id),
  };
}

function normalizeAuditPayload(status: number, payload: unknown) {
  if (status < 200 || status >= 300) return { items: [] };
  const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  return {
    items: items.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: String(record.id || '').trim(),
        ts: String(record.ts || '').trim(),
        stage: String(record.stage || '').trim(),
        decision: typeof record.decision === 'string' ? record.decision : '',
        actor: typeof record.actor === 'string' ? record.actor : '',
        run_id: typeof record.run_id === 'string' ? record.run_id : null,
        note: typeof record.note === 'string' ? record.note : null,
      };
    }).filter((item) => item.id && item.ts && item.stage),
  };
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const session = await getControlPlaneSession(request);
  const ownerUserId = String(session?.sub || '').trim();

  try {
    const [pending, history, audit] = await Promise.all([
      runtimeJsonRequest('/approvals?limit=40&workspace_id=default', { method: 'GET' }),
      runtimeJsonRequest('/history/runs?limit=40&workspace_id=default', { method: 'GET' }),
      runtimeJsonRequest('/approvals/audit?limit=24', { method: 'GET' }),
    ]);

    const pendingPayload = normalizePendingPayload(pending.status, pending.payload);
    const historyPayload = normalizeHistoryPayload(history.status, history.payload);
    const ownedPending = pendingPayload.items.filter((item) => String(item.owner_user_id || '').trim() === ownerUserId);
    const ownedHistory = historyPayload.items.filter((item) => String(item.owner_user_id || '').trim() === ownerUserId);
    const ownedRunIds = new Set<string>([
      ...ownedPending.map((item) => item.run_id),
      ...ownedHistory.map((item) => item.run_id),
    ]);
    const ownedAudit = normalizeAuditPayload(audit.status, audit.payload).items.filter((item) => {
      const runId = String(item.run_id || '').trim();
      return runId && ownedRunIds.has(runId);
    });

    return Response.json({
      pending: { items: ownedPending },
      history: { items: ownedHistory },
      audit: { items: ownedAudit },
      partial:
        pending.status < 200 || pending.status >= 300 ||
        history.status < 200 || history.status >= 300 ||
        audit.status < 200 || audit.status >= 300,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approvals overview proxy failed.';
    return Response.json(
      {
        pending: { items: [] },
        history: { items: [] },
        audit: { items: [] },
        partial: true,
        detail: message,
      },
      { status: 503 },
    );
  }
}
