import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { getControlPlaneSession, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function sanitizeHistoryQuery(request: NextRequest): string {
  const next = new URLSearchParams();
  const limitRaw = String(request.nextUrl.searchParams.get('limit') || '').trim();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();

  if (workspaceId) next.set('workspace_id', workspaceId);
  if (limitRaw) {
    const limit = Number(limitRaw);
    if (Number.isFinite(limit)) {
      next.set('limit', String(Math.max(1, Math.min(Math.trunc(limit), 200))));
    }
  }

  return next.toString();
}

function normalizeHistoryPayload(payload: unknown) {
  const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  return {
    items: items.map((item) => {
      const record = item as Record<string, unknown>;
      const connectorBinding = record.connector_binding && typeof record.connector_binding === 'object'
        ? (record.connector_binding as Record<string, unknown>)
        : null;
      const delegationSummary = record.delegation_summary && typeof record.delegation_summary === 'object'
        ? (record.delegation_summary as Record<string, unknown>)
        : null;
      return {
        run_id: String(record.run_id || '').trim(),
        owner_user_id: typeof record.owner_user_id === 'string' ? record.owner_user_id : null,
        status: typeof record.status === 'string' ? record.status : null,
        user_goal: typeof record.user_goal === 'string' ? record.user_goal : null,
        created_at: typeof record.created_at === 'string' ? record.created_at : null,
        completed_at: typeof record.completed_at === 'string' ? record.completed_at : null,
        duration_ms: typeof record.duration_ms === 'number' ? record.duration_ms : null,
        time_to_first_value_ms: typeof record.time_to_first_value_ms === 'number' ? record.time_to_first_value_ms : null,
        hitl_wait_total_ms: typeof record.hitl_wait_total_ms === 'number' ? record.hitl_wait_total_ms : null,
        result_summary: typeof record.result_summary === 'string' ? record.result_summary : null,
        agent_role: typeof record.agent_role === 'string' ? record.agent_role : null,
        agent_role_source: typeof record.agent_role_source === 'string' ? record.agent_role_source : null,
        parent_run_id: typeof record.parent_run_id === 'string' ? record.parent_run_id : null,
        delegation_root_run_id: typeof record.delegation_root_run_id === 'string' ? record.delegation_root_run_id : null,
        delegated_by_run_id: typeof record.delegated_by_run_id === 'string' ? record.delegated_by_run_id : null,
        delegated_by_role: typeof record.delegated_by_role === 'string' ? record.delegated_by_role : null,
        delegation_note: typeof record.delegation_note === 'string' ? record.delegation_note : null,
        retry_of_run_id: typeof record.retry_of_run_id === 'string' ? record.retry_of_run_id : null,
        retry_root_run_id: typeof record.retry_root_run_id === 'string' ? record.retry_root_run_id : null,
        retry_sequence: typeof record.retry_sequence === 'number' ? record.retry_sequence : null,
        child_run_count: typeof record.child_run_count === 'number' ? record.child_run_count : 0,
        delegation_next_action: typeof record.delegation_next_action === 'string' ? record.delegation_next_action : null,
        delegation_ready: Boolean(record.delegation_ready),
        execution_target_requested: typeof record.execution_target_requested === 'string' ? record.execution_target_requested : null,
        execution_target_selected: typeof record.execution_target_selected === 'string' ? record.execution_target_selected : null,
        execution_target_reason: typeof record.execution_target_reason === 'string' ? record.execution_target_reason : null,
        execution_target_fallback: typeof record.execution_target_fallback === 'string' ? record.execution_target_fallback : null,
        delegation_summary: delegationSummary
          ? {
              retryable_failed_children:
                typeof delegationSummary.retryable_failed_children === 'number'
                  ? delegationSummary.retryable_failed_children
                  : 0,
              ready_for_merge: Boolean(delegationSummary.ready_for_merge),
              failed_run_ids: Array.isArray(delegationSummary.failed_run_ids)
                ? delegationSummary.failed_run_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                : [],
            }
          : null,
        connector_binding: connectorBinding
          ? {
              channel: typeof connectorBinding.channel === 'string' ? connectorBinding.channel : null,
              connector: typeof connectorBinding.connector === 'string' ? connectorBinding.connector : null,
              label: typeof connectorBinding.label === 'string' ? connectorBinding.label : null,
              identity_label: typeof connectorBinding.identity_label === 'string' ? connectorBinding.identity_label : null,
              routing_scope: typeof connectorBinding.routing_scope === 'string' ? connectorBinding.routing_scope : null,
            }
          : null,
        active_profile_id: typeof record.active_profile_id === 'string' ? record.active_profile_id : null,
        active_profile_label: typeof record.active_profile_label === 'string' ? record.active_profile_label : null,
        active_profile_provider: typeof record.active_profile_provider === 'string' ? record.active_profile_provider : null,
        active_profile_model: typeof record.active_profile_model === 'string' ? record.active_profile_model : null,
        usage_total_tokens_est: typeof record.usage_total_tokens_est === 'number' ? record.usage_total_tokens_est : null,
        usage_cost_band: typeof record.usage_cost_band === 'string' ? record.usage_cost_band : null,
      };
    }).filter((item) => item.run_id),
  };
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const session = await getControlPlaneSession(request);
  const ownerUserId = String(session?.sub || '').trim();

  const query = sanitizeHistoryQuery(request);
  const runtimePath = `/history/runs${query ? `?${query}` : ''}`;

  try {
    const { status, payload } = await runtimeJsonRequest(runtimePath, { method: 'GET' });
    const normalized = normalizeHistoryPayload(payload);
    normalized.items = normalized.items.filter((item) => String(item.owner_user_id || '').trim() === ownerUserId);
    return Response.json(normalized, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution history proxy failed.';
    return Response.json({ detail: message, items: [] }, { status: 503 });
  }
}
