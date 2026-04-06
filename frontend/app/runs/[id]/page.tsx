'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Bot,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  AUTH_STREAM_CLOSED,
  openAuthenticatedEventStream,
  type AuthenticatedEventStreamConnection,
} from '@/lib/authenticatedEventStream';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'error', 'stopped', 'timeout', 'cancelled']);

type HistoryItem = {
  run_id: string;
  status?: string;
  result_summary?: string | null;
  created_at?: string;
  completed_at?: string;
  active_profile_provider?: string | null;
  active_profile_model?: string | null;
};

type ApprovalState = {
  approval_id?: string;
  prompt?: string;
  status?: string;
  scope?: string | null;
  reusable?: boolean | null;
  consequence?: string | null;
  actions?: string[] | null;
  target?: string | null;
  requested_at?: string | null;
  expires_at?: string | null;
  metadata?: {
    approval_labels?: string[] | null;
    approval_capabilities?: string[] | null;
  } | null;
} | null;

type ExecutionSummary = {
  risk_level?: string | null;
  next_action?: string | null;
  estimated_time_saved_minutes?: number | null;
  approval_required?: boolean | null;
  approval_reason?: string | null;
} | null;

type RunNodeState = {
  node_id?: string | null;
  label?: string | null;
  status?: string | null;
  summary?: string | null;
  error?: string | null;
};

type RunNodeStatesPayload = {
  active_node_id?: string | null;
  final_node_id?: string | null;
  counts?: Record<string, number> | null;
  items?: RunNodeState[] | null;
};

type RunDiagnostics = {
  category?: string | null;
  headline?: string | null;
  summary?: string | null;
  next_step?: string | null;
  blocked_on?: string | null;
  failure_message?: string | null;
  failure_event?: string | null;
  scheduled?: boolean;
  schedule_id?: string | null;
  selected_target?: string | null;
  local_target?: boolean;
  local_status?: string | null;
  local_last_heartbeat_at?: string | null;
  browser_resume_supported?: boolean | null;
  resumed_after_restart?: boolean;
  retry_of_run_id?: string | null;
  retry_root_run_id?: string | null;
  retry_sequence?: number | null;
  archived?: boolean;
} | null;

type DelegationSummary = {
  retryable_failed_children?: number | null;
} | null;

type RunDetailPayload = {
  run_id?: string;
  status?: string;
  result?: string | null;
  active_profile_provider?: string | null;
  active_profile_model?: string | null;
  execution_target_requested?: string | null;
  execution_target_selected?: string | null;
  execution_target_reason?: string | null;
  execution_target_fallback?: string | null;
  execution_target_required_capabilities?: string[] | null;
  execution_target_missing_capabilities?: string[] | null;
  execution_target_matching_runtime_ids?: string[] | null;
  execution_target_available_runtime_ids?: string[] | null;
  execution_target_busy_runtime_ids?: string[] | null;
  execution_target_busy_runtime_labels?: string[] | null;
  execution_target_queued_ahead_count?: number | null;
  execution_target_estimated_wait_band?: string | null;
  execution_target_waiting_for_runtime?: boolean | null;
  execution_target_waiting_for_capacity?: boolean | null;
  route?: {
    requested?: string | null;
    selected?: string | null;
    reason?: string | null;
    fallback?: string | null;
    required_capabilities?: string[] | null;
    missing_capabilities?: string[] | null;
    matching_runtime_ids?: string[] | null;
    available_runtime_ids?: string[] | null;
    busy_runtime_ids?: string[] | null;
    busy_runtime_labels?: string[] | null;
    queued_ahead_count?: number | null;
    estimated_wait_band?: string | null;
    waiting_for_runtime?: boolean | null;
    waiting_for_capacity?: boolean | null;
  } | null;
  context?: {
    user_goal?: string;
  } | null;
  connector_binding?: {
    label?: string | null;
    connector?: string | null;
    channel?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null;
  run_detail_contract?: {
    provider_model?: {
      requested_provider?: string | null;
      effective_provider?: string | null;
      requested_model?: string | null;
      effective_model?: string | null;
      provider_overridden?: boolean;
      model_overridden?: boolean;
      fallback_used?: boolean;
      fallback_reason?: string | null;
    } | null;
    approval_outcome?: {
      status?: string | null;
      label?: string | null;
    } | null;
    connector_mutation?: {
      binding?: {
        label?: string | null;
        connector?: string | null;
        channel?: string | null;
        identity_label?: string | null;
        routing_scope?: string | null;
      } | null;
      action?: Record<string, unknown> | null;
      execution_label?: string | null;
      action_label?: string | null;
      system_label?: string | null;
      target_label?: string | null;
      result_label?: string | null;
    } | null;
    evidence_items?: Array<{
      id?: string | null;
      label?: string | null;
      value?: string | null;
    }> | null;
  } | null;
  pending_confirmation?: ApprovalState;
  /** @deprecated compatibility alias; use `pending_confirmation`. */
  pending_approval?: ApprovalState;
  diagnostics?: RunDiagnostics;
  delegation_summary?: DelegationSummary;
  result_data?: unknown;
  node_states?: RunNodeStatesPayload | null;
};

type ReplayEvent = {
  ts?: string;
  event?: string;
  message?: string;
};

type ReplayPayload = {
  item?: {
    status?: string;
    result_data?: unknown;
    events?: ReplayEvent[];
  } | null;
};

function compactText(value: string | null | undefined, fallback = '', maxLength = 220): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractPreviewText(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      for (const key of ['summary', 'result', 'message', 'text', 'reply', 'content', 'output', 'draft']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
  }
  return '';
}

function extractExecutionSummary(...candidates: unknown[]): ExecutionSummary {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as Record<string, unknown>;
    const summary = record.execution_summary;
    if (!summary || typeof summary !== 'object') continue;
    const executionSummary = summary as Record<string, unknown>;
    return {
      risk_level: typeof executionSummary.risk_level === 'string' ? executionSummary.risk_level : null,
      next_action: typeof executionSummary.next_action === 'string' ? executionSummary.next_action : null,
      estimated_time_saved_minutes:
        typeof executionSummary.estimated_time_saved_minutes === 'number'
          ? executionSummary.estimated_time_saved_minutes
          : null,
      approval_required:
        typeof executionSummary.approval_required === 'boolean'
          ? executionSummary.approval_required
          : null,
      approval_reason: typeof executionSummary.approval_reason === 'string' ? executionSummary.approval_reason : null,
    };
  }
  return null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function isSuccessStatus(status: string): boolean {
  return status === 'completed' || status === 'success';
}

function isFailureStatus(status: string): boolean {
  return ['failed', 'error', 'stopped', 'timeout', 'cancelled'].includes(status);
}

function formatProviderLabel(value: string | null | undefined): string {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'gemini' || provider === 'google') return 'Google';
  if (provider === 'openai') return 'OpenAI';
  return String(value || '').trim() || 'Platform';
}

function formatRiskSignal(value: string | null | undefined): string | null {
  const risk = String(value || '').trim().toLowerCase();
  if (risk === 'high') return 'Risk signal: High';
  if (risk === 'medium') return 'Risk signal: Medium';
  if (risk === 'low') return 'Risk signal: Low';
  return null;
}

function formatWorkflowNodeStatus(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '--';
  if (normalized === 'waiting_human') return 'Waiting';
  return normalized.replace(/_/g, ' ');
}

function formatExecutionTargetLabel(value: string | null | undefined): string {
  const target = String(value || '').trim().toLowerCase();
  if (target === 'local_companion' || target === 'local') return 'Local machine';
  if (target === 'cloud') return 'Cloud runtime';
  return 'Automatic';
}

function formatDiagnosticCategoryLabel(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Run diagnosis';
  if (normalized === 'approval_wait') return 'Blocked by confirmation';
  if (normalized === 'local_runtime_wait') return 'Waiting for machine capabilities';
  if (normalized === 'local_capacity_wait') return 'Waiting for machine capacity';
  if (normalized === 'resume_pending') return 'Queued to resume';
  if (normalized === 'local_queue') return 'Queued for local machine';
  if (normalized === 'local_running') return 'Running on local machine';
  if (normalized === 'failure') return 'Failure diagnosis';
  if (normalized === 'completed') return 'Completion summary';
  return normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatLocalExecutionStatus(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Not recorded';
  if (normalized === 'waiting_for_runtime') return 'Waiting for the right machine';
  if (normalized === 'waiting_for_capacity') return 'Waiting for machine capacity';
  if (normalized === 'resuming_after_restart') return 'Queued to resume after restart';
  if (normalized === 'queued_local') return 'Queued for local machine';
  if (normalized === 'running_local') return 'Running on local machine';
  return normalized.replace(/_/g, ' ');
}

function formatStatusLabel(
  detail: RunDetailPayload | null,
  historyItem: HistoryItem | null,
  replayPayload: ReplayPayload['item'],
): { label: string; toolLabel: string | null; icon: typeof Bot } {
  const status = String(detail?.status || replayPayload?.status || historyItem?.status || '').toLowerCase();
  if (!status) {
    return { label: '', toolLabel: null, icon: Bot };
  }
  if (status === 'waiting_for_input') {
    return { label: 'Waiting for input', toolLabel: null, icon: ShieldCheck };
  }
  if (status === 'completed') {
    return { label: 'Completed', toolLabel: null, icon: CheckCircle2 };
  }
  return {
    label: status.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
    toolLabel: null,
    icon: Bot,
  };
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = String(params?.id || '').trim();
  const streamRef = useRef<AuthenticatedEventStreamConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyItem, setHistoryItem] = useState<HistoryItem | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetailPayload | null>(null);
  const [replayItem, setReplayItem] = useState<ReplayPayload['item']>(null);
  const [, setLiveEvents] = useState<ReplayEvent[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<'Proceed' | 'Hold' | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const pendingConfirmation = runDetail?.pending_confirmation ?? runDetail?.pending_approval ?? null;
  const runDiagnostics = runDetail?.diagnostics ?? null;
  const detailContract = runDetail?.run_detail_contract ?? null;
  const contractProviderModel = detailContract?.provider_model ?? null;
  const contractConnectorMutation = detailContract?.connector_mutation ?? null;
  const contractConnectorBinding = contractConnectorMutation?.binding ?? null;
  const contractApprovalOutcome = detailContract?.approval_outcome ?? null;
  const contractEvidenceItems = useMemo(
    () =>
      Array.isArray(detailContract?.evidence_items)
        ? detailContract.evidence_items.filter(
            (item): item is { id?: string | null; label?: string | null; value?: string | null } =>
              !!item && typeof item === 'object' && (String(item.label || '').trim().length > 0 || String(item.value || '').trim().length > 0),
          )
        : [],
    [detailContract?.evidence_items],
  );

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError('');
    try {
      await ensureControlPlaneSession();
      const [historyRes, runRes, replayRes] = await Promise.all([
        fetch(`/api/executions/history?limit=200&workspace_id=default`, { cache: 'no-store' }),
        fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' }),
        fetch(`/api/runs/${encodeURIComponent(runId)}/replay`, { cache: 'no-store' }),
      ]);

      if (!historyRes.ok || !runRes.ok) {
        throw new Error('Could not load this run right now.');
      }

      const historyPayload = await historyRes.json().catch(() => ({ items: [] }));
      const runPayload = await runRes.json().catch(() => null);
      const replayPayload = replayRes.ok ? await replayRes.json().catch(() => ({ item: null })) : { item: null };
      const items = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
      const selected = items.find((item: HistoryItem) => item?.run_id === runId) || null;
      setHistoryItem(selected);
      setRunDetail(runPayload as RunDetailPayload | null);
      setReplayItem((replayPayload as ReplayPayload).item || null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load this run right now.');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!runId || loading) return;
    const latestStatus = String(runDetail?.status || historyItem?.status || replayItem?.status || '').toLowerCase();
    if (TERMINAL_RUN_STATUSES.has(latestStatus)) {
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
      return;
    }

    let active = true;
    let source: AuthenticatedEventStreamConnection | null = null;

    void (async () => {
      await ensureControlPlaneSession();
      if (!active) return;
      const url = `/api/runs/${encodeURIComponent(runId)}/stream`;
      source = openAuthenticatedEventStream({
        url,
        onEvent: (event) => {
          if (event.event !== 'log') return;
          try {
            const parsed = JSON.parse(String(event.data || '{}')) as ReplayEvent;
            setLiveEvents((prev) => [...prev.slice(-19), parsed]);
            const eventName = String(parsed.event || '').toLowerCase();
            if (
              eventName === 'run_complete'
              || eventName === 'run_error'
              || eventName === 'run_stopped'
              || eventName === 'timeout'
              || eventName.startsWith('approval_')
            ) {
              void load();
            }
          } catch {
            // Ignore malformed live events on the simplified view.
          }
        },
        onError: () => {
          if (source?.readyState === AUTH_STREAM_CLOSED && streamRef.current === source) {
            streamRef.current = null;
          }
          void load();
        },
        onClose: () => {
          if (streamRef.current === source) streamRef.current = null;
        },
      });
      streamRef.current = source;
    })();

    return () => {
      active = false;
      source?.close();
      if (streamRef.current === source) streamRef.current = null;
    };
  }, [historyItem?.status, load, loading, replayItem?.status, runDetail?.status, runId]);

  // The current run payload does not expose a dedicated hero/result field, so the
  // frontend falls back through explicit result text, archived summaries, and pack output.
  const previewText = useMemo(
    () =>
      compactText(
        extractPreviewText(
          runDetail?.result,
          historyItem?.result_summary,
          runDetail?.result_data,
          replayItem?.result_data,
        ),
        '',
        560,
      ),
    [historyItem?.result_summary, replayItem?.result_data, runDetail?.result, runDetail?.result_data],
  );
  const executionSummary = useMemo(
    () => extractExecutionSummary(runDetail?.result_data, replayItem?.result_data),
    [replayItem?.result_data, runDetail?.result_data],
  );

  const currentStatus = useMemo(
    () => formatStatusLabel(runDetail, historyItem, replayItem),
    [historyItem, replayItem, runDetail],
  );
  const effectiveStatus = useMemo(
    () => String(runDetail?.status || replayItem?.status || historyItem?.status || '').trim().toLowerCase(),
    [historyItem?.status, replayItem?.status, runDetail?.status],
  );
  const executionTargetRequested = useMemo(
    () => runDetail?.execution_target_requested ?? runDetail?.route?.requested ?? null,
    [runDetail?.execution_target_requested, runDetail?.route?.requested],
  );
  const executionTargetSelected = useMemo(
    () => runDetail?.execution_target_selected ?? runDetail?.route?.selected ?? executionTargetRequested,
    [executionTargetRequested, runDetail?.execution_target_selected, runDetail?.route?.selected],
  );
  const executionTargetReason = useMemo(
    () => runDetail?.execution_target_reason ?? runDetail?.route?.reason ?? null,
    [runDetail?.execution_target_reason, runDetail?.route?.reason],
  );
  const executionTargetFallback = useMemo(
    () => runDetail?.execution_target_fallback ?? runDetail?.route?.fallback ?? null,
    [runDetail?.execution_target_fallback, runDetail?.route?.fallback],
  );
  const executionTargetRequiredCapabilities = useMemo(() => {
    const value = runDetail?.execution_target_required_capabilities ?? runDetail?.route?.required_capabilities ?? [];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  }, [runDetail?.execution_target_required_capabilities, runDetail?.route?.required_capabilities]);
  const executionTargetMissingCapabilities = useMemo(() => {
    const value = runDetail?.execution_target_missing_capabilities ?? runDetail?.route?.missing_capabilities ?? [];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  }, [runDetail?.execution_target_missing_capabilities, runDetail?.route?.missing_capabilities]);
  const executionTargetBusyRuntimeIds = useMemo(() => {
    const value = runDetail?.execution_target_busy_runtime_ids ?? runDetail?.route?.busy_runtime_ids ?? [];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  }, [runDetail?.execution_target_busy_runtime_ids, runDetail?.route?.busy_runtime_ids]);
  const executionTargetBusyRuntimeLabels = useMemo(() => {
    const value = runDetail?.execution_target_busy_runtime_labels ?? runDetail?.route?.busy_runtime_labels ?? [];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  }, [runDetail?.execution_target_busy_runtime_labels, runDetail?.route?.busy_runtime_labels]);
  const executionTargetQueuedAheadCount = useMemo(
    () => Math.max(0, Number(runDetail?.execution_target_queued_ahead_count ?? runDetail?.route?.queued_ahead_count ?? 0)),
    [runDetail?.execution_target_queued_ahead_count, runDetail?.route?.queued_ahead_count],
  );
  const executionTargetEstimatedWaitBand = useMemo(() => {
    const value = String(
      runDetail?.execution_target_estimated_wait_band
      ?? runDetail?.route?.estimated_wait_band
      ?? '',
    ).trim().toLowerCase();
    if (value === 'short' || value === 'moderate' || value === 'long') return value;
    return null;
  }, [runDetail?.execution_target_estimated_wait_band, runDetail?.route?.estimated_wait_band]);
  const executionTargetWaitingForRuntime = useMemo(
    () => Boolean(runDetail?.execution_target_waiting_for_runtime ?? runDetail?.route?.waiting_for_runtime),
    [runDetail?.execution_target_waiting_for_runtime, runDetail?.route?.waiting_for_runtime],
  );
  const executionTargetWaitingForCapacity = useMemo(
    () => Boolean(runDetail?.execution_target_waiting_for_capacity ?? runDetail?.route?.waiting_for_capacity),
    [runDetail?.execution_target_waiting_for_capacity, runDetail?.route?.waiting_for_capacity],
  );
  const requestedExecutionTargetLabel = useMemo(
    () => formatExecutionTargetLabel(executionTargetRequested),
    [executionTargetRequested],
  );
  const selectedExecutionTargetLabel = useMemo(
    () => formatExecutionTargetLabel(executionTargetSelected),
    [executionTargetSelected],
  );
  const explicitRiskSignal = useMemo(
    () => formatRiskSignal(executionSummary?.risk_level),
    [executionSummary?.risk_level],
  );
  const toolAccountRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];
    const connectorBinding = contractConnectorBinding;
    const toolLabel = [
      String(connectorBinding?.label || '').trim(),
      String(connectorBinding?.channel || '').trim(),
    ].filter(Boolean).join(' · ');
    const accountLabel = [
      String(connectorBinding?.identity_label || '').trim(),
      String(connectorBinding?.routing_scope || '').trim(),
    ].filter(Boolean).join(' · ');
    const requestedAiLabel = [
      contractProviderModel?.requested_provider ? formatProviderLabel(contractProviderModel.requested_provider) : 'Unknown',
      String(contractProviderModel?.requested_model || '').trim(),
    ].filter(Boolean).join(' · ');
    const effectiveAiLabel = [
      contractProviderModel?.effective_provider ? formatProviderLabel(contractProviderModel.effective_provider) : 'Unknown',
      String(contractProviderModel?.effective_model || '').trim(),
    ].filter(Boolean).join(' · ');

    rows.push({
      label: 'Tool',
      value: toolLabel || 'No connected tool is recorded yet.',
    });
    rows.push({
      label: 'Account',
      value: accountLabel || 'No account is recorded yet.',
    });
    rows.push({
      label: 'Requested AI',
      value: requestedAiLabel || 'Unknown',
    });
    rows.push({
      label: 'Effective AI',
      value: effectiveAiLabel || 'Unknown',
    });
    return rows;
  }, [
    contractConnectorBinding,
    contractProviderModel?.effective_model,
    contractProviderModel?.effective_provider,
    contractProviderModel?.requested_model,
    contractProviderModel?.requested_provider,
  ]);
  const workflowNodeStates = useMemo(() => {
    const payload = runDetail?.node_states;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const counts = payload?.counts && typeof payload.counts === 'object' ? payload.counts : {};
    const activeNodeId = String(payload?.active_node_id || '').trim() || null;
    const finalNodeId = String(payload?.final_node_id || '').trim() || null;
    const activeNode = items.find((item) => String(item?.node_id || '').trim() === activeNodeId) || null;
    const finalNode = items.find((item) => String(item?.node_id || '').trim() === finalNodeId) || null;
    const total = Object.values(counts).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0) || items.length;
    return {
      items,
      counts,
      total,
      activeNode,
      finalNode,
    };
  }, [runDetail?.node_states]);
  const diagnosisRows = useMemo(() => {
    if (!runDiagnostics) return [];
    const rows: Array<{ label: string; value: string }> = [];
    if (runDiagnostics.blocked_on) {
      rows.push({
        label: 'Blocked on',
        value: formatDiagnosticCategoryLabel(runDiagnostics.category),
      });
    }
    if (runDiagnostics.local_target || runDiagnostics.local_status) {
      rows.push({
        label: 'Local execution',
        value: formatLocalExecutionStatus(runDiagnostics.local_status),
      });
    }
    if (runDiagnostics.local_last_heartbeat_at) {
      rows.push({
        label: 'Last machine heartbeat',
        value: formatDateTime(runDiagnostics.local_last_heartbeat_at),
      });
    }
    if (runDiagnostics.scheduled) {
      rows.push({
        label: 'Started by schedule',
        value: runDiagnostics.schedule_id || 'Yes',
      });
    }
    if (typeof runDiagnostics.retry_sequence === 'number' || runDiagnostics.retry_of_run_id) {
      rows.push({
        label: 'Retry lineage',
        value: runDiagnostics.retry_of_run_id
          ? `Retry ${Math.max(1, Number(runDiagnostics.retry_sequence || 1))} of ${runDiagnostics.retry_of_run_id}`
          : `Retry ${Math.max(1, Number(runDiagnostics.retry_sequence || 1))}`,
      });
    }
    if (runDiagnostics.resumed_after_restart) {
      rows.push({
        label: 'Recovery',
        value: runDiagnostics.browser_resume_supported
          ? 'Resume queued from saved checkpoint'
          : 'Resume queued after runtime restart',
      });
    }
    if (runDiagnostics.failure_event) {
      rows.push({
        label: 'Failure source',
        value: runDiagnostics.failure_event.replace(/_/g, ' '),
      });
    }
    return rows;
  }, [runDiagnostics]);
  const retryableFailedChildren = Math.max(0, Number(runDetail?.delegation_summary?.retryable_failed_children || 0));
  const canResumeRun = effectiveStatus === 'waiting_for_input' && !pendingConfirmation?.approval_id && Boolean(runDiagnostics?.browser_resume_supported);
  const needsLocalMachineAttention = ['local_runtime_wait', 'local_capacity_wait', 'local_queue', 'local_running'].includes(String(runDiagnostics?.category || ''));
  const plainLanguageSummary = useMemo(() => {
    if (executionTargetWaitingForCapacity) {
      return compactText(
        executionTargetReason,
        'Capable local machines are online, but they are busy right now. Platform will start this run as soon as one frees up.',
        260,
      );
    }
    if (executionTargetWaitingForRuntime) {
      return compactText(
        executionTargetReason,
        'This task needs a local machine with the right capabilities before it can begin.',
        260,
      );
    }
    if (pendingConfirmation?.approval_id) {
      return 'Platform paused before the next action so you can review it first.';
    }
    if (isFailureStatus(effectiveStatus)) {
      return compactText(previewText, 'The task stopped before a final result was produced.', 260);
    }
    if (previewText) {
      return compactText(previewText, previewText, 260);
    }
    if (isSuccessStatus(effectiveStatus)) {
      return 'The task finished, but no result preview was recorded.';
    }
    return currentStatus.label;
  }, [
    currentStatus.label,
    effectiveStatus,
    executionTargetReason,
    executionTargetWaitingForCapacity,
    executionTargetWaitingForRuntime,
    previewText,
    pendingConfirmation?.approval_id,
  ]);
  const heroTitle = useMemo(() => {
    if (pendingConfirmation?.approval_id) return 'Confirmation required';
    if (executionTargetWaitingForCapacity) return 'Waiting for machine capacity';
    if (executionTargetWaitingForRuntime) return 'Waiting for the right machine';
    if (isFailureStatus(effectiveStatus)) return 'Run failed';
    if (isSuccessStatus(effectiveStatus) && previewText) return 'Result ready';
    if (isSuccessStatus(effectiveStatus)) return 'Run finished';
    return 'Task in progress';
  }, [
    effectiveStatus,
    executionTargetWaitingForCapacity,
    executionTargetWaitingForRuntime,
    previewText,
    pendingConfirmation?.approval_id,
  ]);
  const noResultState = useMemo(
    () =>
      !previewText
      && !pendingConfirmation?.approval_id
      && (isSuccessStatus(effectiveStatus) || isFailureStatus(effectiveStatus)),
    [effectiveStatus, pendingConfirmation?.approval_id, previewText],
  );
  const CurrentStatusIcon = currentStatus.icon;

  const handleResolveApproval = useCallback(async (decision: 'Proceed' | 'Hold') => {
    if (!runId || !pendingConfirmation?.approval_id) return;
    setApprovalBusy(decision);
    setActionNotice('');
    try {
      await ensureControlPlaneSession();
      const response = await fetch('/api/approvals/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          approvalId: pendingConfirmation.approval_id,
          decision,
          note: 'Resolved from Platform run view',
        }),
      });
      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || 'Failed to resolve this confirmation.');
      }
      setActionNotice(decision === 'Proceed' ? 'Confirmed. The run can continue.' : 'Declined. The run will stay blocked.');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to resolve this confirmation.');
    } finally {
      setApprovalBusy(null);
    }
  }, [load, pendingConfirmation?.approval_id, runId]);

  const handleResumeRun = useCallback(async () => {
    if (!runId) return;
    setResumeBusy(true);
    setActionNotice('');
    setError('');
    try {
      await ensureControlPlaneSession();
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(payload?.detail || 'Failed to resume this run.');
      }
      setActionNotice('Resume requested. The run is re-entering execution from its saved checkpoint.');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to resume this run.');
    } finally {
      setResumeBusy(false);
    }
  }, [load, runId]);

  const handleRetryFailedDelegation = useCallback(async () => {
    if (!runId) return;
    setRetryBusy(true);
    setActionNotice('');
    setError('');
    try {
      await ensureControlPlaneSession();
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/delegate/retry-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || 'Failed to retry failed child runs.');
      }
      const payload = await response.json().catch(() => null) as { items?: unknown[] } | null;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setActionNotice(
        items.length > 0
          ? `Created ${items.length} retry run${items.length === 1 ? '' : 's'} for failed child work.`
          : 'Retry run requested.',
      );
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to retry failed child runs.');
    } finally {
      setRetryBusy(false);
    }
  }, [load, runId]);

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <div className="orion-page-header">
        <div className="orion-page-title-wrap">
          <div className="orion-page-title">Run</div>
          <div className="orion-page-subtitle">See the result, confirmation state, and routing context for this task.</div>
        </div>
        <div className="orion-page-actions">
          <Link href="/executions" className="btn-secondary">Back to Runs</Link>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <section className="orion-panel">
        {loading ? (
          <div className="hekor-run-loading">
            <Loader2 size={18} className="hekor-spin" />
            <span>Loading the task…</span>
          </div>
        ) : error ? (
          <div className="orion-empty">
            <div className="orion-empty-title">Run unavailable</div>
            <div className="orion-empty-copy">{error}</div>
          </div>
        ) : (
          <div className="hekor-run-layout">
            <div className={`orion-panel hekor-run-hero${isFailureStatus(effectiveStatus) ? ' is-danger' : isSuccessStatus(effectiveStatus) ? ' is-success' : ''}`.trim()}>
              <div className="hekor-run-hero-head">
                <div className="hekor-run-status-icon">
                  <CurrentStatusIcon size={18} />
                </div>
                <div className="hekor-run-hero-topline">
                  <span className="hekor-run-hero-kicker">{currentStatus.label}</span>
                  {explicitRiskSignal ? (
                    <span className="hekor-run-risk-badge">{explicitRiskSignal}</span>
                  ) : null}
                </div>
              </div>

              <div className="hekor-run-hero-copy">
                <div className="hekor-run-hero-title">{heroTitle}</div>
                <div className="hekor-run-status-note">
                  {currentStatus.toolLabel || contractConnectorMutation?.system_label || contractConnectorBinding?.label || 'Platform'}
                </div>
                <div className="hekor-run-hero-summary">{plainLanguageSummary}</div>
              </div>

              {previewText ? (
                <div className="hekor-run-hero-result">
                  <div className="hekor-run-hero-result-title">Result preview</div>
                  <div className="hekor-run-output-copy">{previewText}</div>
                </div>
              ) : null}

              {noResultState ? (
                <div className="orion-panel muted hekor-run-no-result">
                  <div className="orion-panel-title">No result preview yet</div>
                  <div className="orion-panel-copy">
                    {isFailureStatus(effectiveStatus)
                      ? 'This run stopped before it produced a final preview.'
                      : 'This run finished, but the current payload does not include a previewable result.'}
                  </div>
                </div>
              ) : null}

              {(pendingConfirmation?.approval_id || canResumeRun || retryableFailedChildren > 0 || needsLocalMachineAttention) ? (
                <div className="orion-panel muted" style={{ marginTop: 14 }}>
                  <div className="orion-panel-title">Recommended actions</div>
                  <div className="orion-panel-copy">
                    {runDiagnostics?.next_step || 'Use the controls below to unblock this run faster.'}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {pendingConfirmation?.approval_id ? (
                      <>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => void handleResolveApproval('Proceed')}
                          disabled={approvalBusy !== null || resumeBusy || retryBusy}
                        >
                          {approvalBusy === 'Proceed' ? 'Confirming…' : 'Confirm once'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void handleResolveApproval('Hold')}
                          disabled={approvalBusy !== null || resumeBusy || retryBusy}
                        >
                          {approvalBusy === 'Hold' ? 'Declining…' : 'Decline'}
                        </button>
                        <Link href="/approvals" className="btn-secondary">Open approvals</Link>
                      </>
                    ) : null}
                    {canResumeRun ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void handleResumeRun()}
                        disabled={resumeBusy || approvalBusy !== null || retryBusy}
                      >
                        {resumeBusy ? 'Resuming…' : 'Resume run'}
                      </button>
                    ) : null}
                    {retryableFailedChildren > 0 ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void handleRetryFailedDelegation()}
                        disabled={retryBusy || approvalBusy !== null || resumeBusy}
                      >
                        {retryBusy ? 'Retrying…' : `Retry failed (${String(retryableFailedChildren)})`}
                      </button>
                    ) : null}
                    {needsLocalMachineAttention ? (
                      <>
                        <Link href="/machines" className="btn-secondary">Open machines</Link>
                        <Link href="/health" className="btn-secondary">Open machine health</Link>
                      </>
                    ) : null}
                    <Link href={`/runs/${encodeURIComponent(runId)}/inspect`} className="btn-secondary">Open inspect</Link>
                  </div>
                  {actionNotice ? (
                    <div style={{ marginTop: 10, color: 'var(--success-fg)', fontSize: 12 }}>{actionNotice}</div>
                  ) : null}
                </div>
              ) : null}
            </div>

              <div className="hekor-run-summary-grid">
              <div className="orion-panel muted">
                <div className="orion-panel-title">Diagnosis</div>
                <div className="orion-panel-copy">
                  {compactText(
                    runDiagnostics?.headline || runDiagnostics?.summary,
                    'The platform has not recorded a diagnosis summary for this run yet.',
                    180,
                  )}
                </div>
                {runDiagnostics?.summary && runDiagnostics.summary !== runDiagnostics.headline ? (
                  <div className="hekor-run-route-note">{compactText(runDiagnostics.summary, '', 180)}</div>
                ) : null}
                {runDiagnostics?.next_step ? (
                  <div className="hekor-run-route-note">Next step: {compactText(runDiagnostics.next_step, '', 180)}</div>
                ) : null}
                {diagnosisRows.length > 0 ? (
                  <div className="hekor-run-info-list" style={{ marginTop: 10 }}>
                    {diagnosisRows.map((item) => (
                      <div key={`diagnosis:${item.label}`} className="hekor-run-info-row">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="orion-panel muted">
                <div className="orion-panel-title">What happened</div>
                <div className="orion-panel-copy">{plainLanguageSummary}</div>
                {executionSummary?.next_action ? (
                  <div className="hekor-run-route-note">Next step: {executionSummary.next_action}</div>
                ) : null}
                {typeof executionSummary?.estimated_time_saved_minutes === 'number' ? (
                  <div className="hekor-run-route-note">Estimated time saved: about {executionSummary.estimated_time_saved_minutes} minutes.</div>
                ) : null}
              </div>

              <div className="orion-panel muted">
                <div className="orion-panel-title">Task</div>
                <div className="orion-panel-copy">{compactText(runDetail?.context?.user_goal, 'No task description available.', 180)}</div>
              </div>

              <div className="orion-panel muted">
                <div className="orion-panel-title">Tools and accounts</div>
                <div className="hekor-run-info-list">
                  {toolAccountRows.map((item) => (
                    <div key={item.label} className="hekor-run-info-row">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="orion-panel muted">
                <div className="orion-panel-title">Execution</div>
                <div className="hekor-run-info-list">
                  <div className="hekor-run-info-row">
                    <span>Requested</span>
                    <strong>{requestedExecutionTargetLabel}</strong>
                  </div>
                  <div className="hekor-run-info-row">
                    <span>Running on</span>
                    <strong>{selectedExecutionTargetLabel}</strong>
                  </div>
                </div>
                {executionTargetReason ? (
                  <div className="hekor-run-route-note">{compactText(executionTargetReason, '', 180)}</div>
                ) : null}
                {executionTargetFallback ? (
                  <div className="hekor-run-route-note">{compactText(executionTargetFallback, '', 180)}</div>
                ) : null}
              </div>

              <div className="orion-panel muted">
                <div className="orion-panel-title">Evidence</div>
                <div className="hekor-run-info-list">
                  {contractEvidenceItems.length > 0 ? contractEvidenceItems.map((item, index) => (
                    <div key={String(item.id || `${item.label || 'evidence'}:${index}`)} className="hekor-run-info-row">
                      <span>{String(item.label || 'Evidence').trim() || 'Evidence'}</span>
                      <strong>{String(item.value || 'Not recorded').trim() || 'Not recorded'}</strong>
                    </div>
                  )) : (
                    <div className="hekor-run-info-row">
                      <span>Status</span>
                      <strong>{contractApprovalOutcome?.label || 'No evidence recorded yet.'}</strong>
                    </div>
                  )}
                </div>
              </div>

              {workflowNodeStates.items.length > 0 ? (
                <div className="orion-panel muted">
                  <div className="orion-panel-title">Workflow progress</div>
                  <div className="hekor-run-info-list">
                    <div className="hekor-run-info-row">
                      <span>Active node</span>
                      <strong>{workflowNodeStates.activeNode?.label || 'No active node'}</strong>
                    </div>
                    <div className="hekor-run-info-row">
                      <span>Final node</span>
                      <strong>{workflowNodeStates.finalNode?.label || 'Not finished yet'}</strong>
                    </div>
                    <div className="hekor-run-info-row">
                      <span>Nodes tracked</span>
                      <strong>{String(workflowNodeStates.total)}</strong>
                    </div>
                  </div>
                  <div className="hekor-run-route-note">
                    {workflowNodeStates.activeNode
                      ? `${formatWorkflowNodeStatus(workflowNodeStates.activeNode.status)} · ${compactText(workflowNodeStates.activeNode.summary, 'Node is executing.', 120)}`
                      : workflowNodeStates.finalNode
                      ? `${formatWorkflowNodeStatus(workflowNodeStates.finalNode.status)} · ${compactText(workflowNodeStates.finalNode.summary, 'Workflow reached its final node.', 120)}`
                      : 'Open inspect to review node-by-node execution.'}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(workflowNodeStates.counts).map(([status, count]) => (
                      <span key={`run-node-count:${status}`} className="orion-chip">
                        {count} {formatWorkflowNodeStatus(status)}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Link href={`/runs/${encodeURIComponent(runId)}/inspect?focus=workflow`} className="btn-secondary">
                      Open workflow inspect
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            {executionTargetWaitingForRuntime || executionTargetWaitingForCapacity ? (
              <div className="orion-panel hekor-run-waiting-panel">
                <div className="orion-panel-title">
                  {executionTargetWaitingForCapacity ? 'Waiting on machine capacity' : 'Waiting on machine capabilities'}
                </div>
                <div className="orion-panel-copy">
                  {compactText(
                    executionTargetReason,
                    executionTargetWaitingForCapacity
                      ? 'This task can run locally, but all capable machines are currently busy.'
                      : 'This task needs a local machine with the right capabilities before it can start.',
                    220,
                  )}
                </div>
                {executionTargetRequiredCapabilities.length > 0 ? (
                  <div className="hekor-run-capability-block">
                    <div className="hekor-run-capability-title">Required</div>
                    <div className="hekor-run-capability-row">
                      {executionTargetRequiredCapabilities.map((item) => (
                        <span key={`required:${item}`} className="hekor-run-capability-chip">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {executionTargetMissingCapabilities.length > 0 ? (
                  <div className="hekor-run-capability-block">
                    <div className="hekor-run-capability-title">Missing online now</div>
                    <div className="hekor-run-capability-row">
                      {executionTargetMissingCapabilities.map((item) => (
                        <span key={`missing:${item}`} className="hekor-run-capability-chip is-warning">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {executionTargetWaitingForCapacity && (executionTargetBusyRuntimeLabels.length > 0 || executionTargetBusyRuntimeIds.length > 0) ? (
                  <div className="hekor-run-capability-block">
                    <div className="hekor-run-capability-title">Busy machines</div>
                    <div className="hekor-run-capability-row">
                      {(executionTargetBusyRuntimeLabels.length > 0 ? executionTargetBusyRuntimeLabels : executionTargetBusyRuntimeIds).map((item) => (
                        <span key={`busy:${item}`} className="hekor-run-capability-chip">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {executionTargetWaitingForCapacity && (executionTargetQueuedAheadCount > 0 || executionTargetEstimatedWaitBand) ? (
                  <div className="hekor-run-capability-block">
                    <div className="hekor-run-capability-title">Queue outlook</div>
                    <div className="orion-panel-copy">
                      {executionTargetQueuedAheadCount > 0
                        ? `${executionTargetQueuedAheadCount} similar local run${executionTargetQueuedAheadCount === 1 ? ' is' : 's are'} ahead.`
                        : 'No similar local runs are ahead right now.'}
                      {executionTargetEstimatedWaitBand ? ` Expected wait: ${executionTargetEstimatedWaitBand}.` : ''}
                    </div>
                  </div>
                ) : null}
                <div className="hekor-run-route-note">
                  {executionTargetWaitingForCapacity
                    ? 'A capable local machine is already online. This run will start as soon as one becomes available.'
                    : 'Bring a capable local machine online or switch future tasks to Automatic when local access is not required.'}
                </div>
              </div>
            ) : null}

            {pendingConfirmation?.approval_id ? (
              <div className="orion-panel hekor-run-approval">
                <div className="orion-panel-title">Confirmation required</div>
                <div className="orion-panel-copy">{compactText(pendingConfirmation.prompt, 'Review the next action before the run continues.', 220)}</div>
                {/* There is no structured change preview in the current confirmation payload, so
                    this block stays grounded in the prompt plus the tool/account context. */}
                <div className="hekor-run-info-list">
                  <div className="hekor-run-info-row">
                    <span>Tool and account</span>
                    <strong>{toolAccountRows[0]?.value !== 'No connected tool is recorded yet.' ? `${toolAccountRows[0]?.value} · ${toolAccountRows[1]?.value}` : toolAccountRows[1]?.value}</strong>
                  </div>
                  <div className="hekor-run-info-row">
                    <span>Action</span>
                    <strong>{Array.isArray(pendingConfirmation.actions) && pendingConfirmation.actions.length > 0 ? pendingConfirmation.actions.join(', ') : 'Not recorded'}</strong>
                  </div>
                  <div className="hekor-run-info-row">
                    <span>Target</span>
                    <strong>{pendingConfirmation.target || 'Not recorded'}</strong>
                  </div>
                  <div className="hekor-run-info-row">
                    <span>Scope</span>
                    <strong>{String(pendingConfirmation.scope || 'once').trim().toLowerCase() === 'once' ? 'One-time for this pending step' : String(pendingConfirmation.scope || 'Unknown')}</strong>
                  </div>
                  <div className="hekor-run-info-row">
                    <span>Requested</span>
                    <strong>{formatDateTime(pendingConfirmation.requested_at)}</strong>
                  </div>
                  <div className="hekor-run-info-row">
                    <span>Expires</span>
                    <strong>{formatDateTime(pendingConfirmation.expires_at)}</strong>
                  </div>
                </div>
                <div className="orion-panel-copy" style={{ marginTop: 10 }}>
                  {pendingConfirmation.consequence || 'This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again.'}
                </div>
                {Array.isArray(pendingConfirmation.metadata?.approval_labels) && pendingConfirmation.metadata?.approval_labels.length ? (
                  <div className="hekor-run-capability-block">
                    <div className="hekor-run-capability-title">Review signals</div>
                    <div className="hekor-run-capability-row">
                      {pendingConfirmation.metadata?.approval_labels
                        ?.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
                        .map((item) => (
                          <span key={`approval-label:${item}`} className="hekor-run-capability-chip">
                            {item}
                          </span>
                        ))}
                    </div>
                  </div>
                ) : null}
                <div className="hekor-run-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleResolveApproval('Proceed')}
                    disabled={approvalBusy !== null}
                  >
                    {approvalBusy === 'Proceed' ? (
                      <>
                        <Loader2 size={14} className="hekor-spin" />
                        Confirming…
                      </>
                    ) : (
                      'Confirm once'
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void handleResolveApproval('Hold')}
                    disabled={approvalBusy !== null}
                  >
                    {approvalBusy === 'Hold' ? (
                      <>
                        <Loader2 size={14} className="hekor-spin" />
                        Declining…
                      </>
                    ) : (
                      'Decline'
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {previewText ? (
              <div className="orion-panel hekor-run-output">
                <div className="orion-panel-title">Output preview</div>
                <div className="hekor-run-output-copy">{previewText}</div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
