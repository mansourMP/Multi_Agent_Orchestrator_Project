'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Search,
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
  pending_approval?: ApprovalState;
  result_data?: unknown;
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
  return String(value || '').trim() || 'Hekor AI';
}

function formatRiskSignal(value: string | null | undefined): string | null {
  const risk = String(value || '').trim().toLowerCase();
  if (risk === 'high') return 'Risk signal: High';
  if (risk === 'medium') return 'Risk signal: Medium';
  if (risk === 'low') return 'Risk signal: Low';
  return null;
}

function formatExecutionTargetLabel(value: string | null | undefined): string {
  const target = String(value || '').trim().toLowerCase();
  if (target === 'local_companion' || target === 'local') return 'Local machine';
  if (target === 'cloud') return 'Cloud runtime';
  return 'Automatic';
}

function formatStatusLabel(
  detail: RunDetailPayload | null,
  historyItem: HistoryItem | null,
  replayPayload: ReplayPayload['item'],
  liveEvents: ReplayEvent[],
): { label: string; toolLabel: string | null; icon: typeof Bot } {
  const waitingForRuntime = Boolean(
    detail?.execution_target_waiting_for_runtime
      ?? detail?.route?.waiting_for_runtime,
  );
  const waitingForCapacity = Boolean(
    detail?.execution_target_waiting_for_capacity
      ?? detail?.route?.waiting_for_capacity,
  );
  const latestEvent = liveEvents[liveEvents.length - 1] || replayPayload?.events?.[replayPayload.events.length - 1] || null;
  const latestText = [
    String(latestEvent?.message || '').trim(),
    String(latestEvent?.event || '').trim(),
    String(detail?.connector_binding?.label || '').trim(),
    String(detail?.context?.user_goal || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (waitingForCapacity) {
    return { label: 'Waiting for machine capacity...', toolLabel: 'Local runtime', icon: Bot };
  }
  if (waitingForRuntime) {
    return { label: 'Waiting for a capable machine...', toolLabel: 'Local runtime', icon: Bot };
  }
  if (detail?.pending_approval?.approval_id) {
    return { label: 'Waiting for your approval...', toolLabel: null, icon: ShieldCheck };
  }
  if (/email|gmail|inbox|mail/.test(latestText)) {
    return { label: 'Reading your emails...', toolLabel: 'Gmail', icon: Mail };
  }
  if (/search|web|browser|research|competitor/.test(latestText)) {
    return { label: 'Searching the web...', toolLabel: 'Web', icon: Search };
  }
  if (/draft|prepare|reply|summary|report|write/.test(latestText)) {
    return { label: 'Preparing your draft...', toolLabel: 'Draft', icon: FileText };
  }

  const status = String(detail?.status || replayPayload?.status || historyItem?.status || '').toLowerCase();
  if (status === 'completed') {
    return { label: 'Done', toolLabel: null, icon: CheckCircle2 };
  }
  return { label: 'Planning your task...', toolLabel: null, icon: Bot };
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
  const [liveEvents, setLiveEvents] = useState<ReplayEvent[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<'Proceed' | 'Hold' | null>(null);

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
    () => formatStatusLabel(runDetail, historyItem, replayItem, liveEvents),
    [historyItem, liveEvents, replayItem, runDetail],
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
    const connectorBinding = runDetail?.connector_binding;
    const toolLabel = [
      String(connectorBinding?.label || '').trim(),
      String(connectorBinding?.channel || '').trim(),
    ].filter(Boolean).join(' · ');
    const accountLabel = [
      String(connectorBinding?.identity_label || '').trim(),
      String(connectorBinding?.routing_scope || '').trim(),
    ].filter(Boolean).join(' · ');
    const aiLabel = [
      formatProviderLabel(runDetail?.active_profile_provider || historyItem?.active_profile_provider || null),
      String(runDetail?.active_profile_model || historyItem?.active_profile_model || '').trim(),
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
      label: 'AI source',
      value: aiLabel || 'Hekor AI',
    });
    return rows;
  }, [
    historyItem?.active_profile_model,
    historyItem?.active_profile_provider,
    runDetail?.active_profile_model,
    runDetail?.active_profile_provider,
    runDetail?.connector_binding,
  ]);
  const plainLanguageSummary = useMemo(() => {
    if (executionTargetWaitingForCapacity) {
      return compactText(
        executionTargetReason,
        'Capable local machines are online, but they are busy right now. Hekor will start this run as soon as one frees up.',
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
    if (runDetail?.pending_approval?.approval_id) {
      return 'Hekor paused before the next action so you can review it first.';
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
    runDetail?.pending_approval?.approval_id,
  ]);
  const heroTitle = useMemo(() => {
    if (runDetail?.pending_approval?.approval_id) return 'Approval needed';
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
    runDetail?.pending_approval?.approval_id,
  ]);
  const noResultState = useMemo(
    () =>
      !previewText
      && !runDetail?.pending_approval?.approval_id
      && (isSuccessStatus(effectiveStatus) || isFailureStatus(effectiveStatus)),
    [effectiveStatus, previewText, runDetail?.pending_approval?.approval_id],
  );
  const CurrentStatusIcon = currentStatus.icon;

  const handleResolveApproval = useCallback(async (decision: 'Proceed' | 'Hold') => {
    if (!runId || !runDetail?.pending_approval?.approval_id) return;
    setApprovalBusy(decision);
    try {
      await ensureControlPlaneSession();
      const response = await fetch('/api/approvals/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          approvalId: runDetail.pending_approval.approval_id,
          decision,
          note: 'Resolved from Hekor run view',
        }),
      });
      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || 'Failed to resolve this approval.');
      }
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to resolve this approval.');
    } finally {
      setApprovalBusy(null);
    }
  }, [load, runDetail?.pending_approval?.approval_id, runId]);

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <div className="orion-page-header">
        <div className="orion-page-title-wrap">
          <div className="orion-page-title">Run</div>
          <div className="orion-page-subtitle">See the result, approvals, and routing context for this task.</div>
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
                  {currentStatus.toolLabel || runDetail?.connector_binding?.label || 'Hekor Agent'}
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
            </div>

            <div className="hekor-run-summary-grid">
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

            {runDetail?.pending_approval?.approval_id ? (
              <div className="orion-panel hekor-run-approval">
                <div className="orion-panel-title">Approval needed</div>
                <div className="orion-panel-copy">{compactText(runDetail.pending_approval.prompt, 'Review the next action before the run continues.', 220)}</div>
                {/* There is no structured change preview in the current approval payload, so
                    this block stays grounded in the approval prompt plus the tool/account context. */}
                <div className="hekor-run-info-list">
                  <div className="hekor-run-info-row">
                    <span>Tool and account</span>
                    <strong>{toolAccountRows[0]?.value !== 'No connected tool is recorded yet.' ? `${toolAccountRows[0]?.value} · ${toolAccountRows[1]?.value}` : toolAccountRows[1]?.value}</strong>
                  </div>
                  <div className="hekor-run-info-row">
                    <span>Requested</span>
                    <strong>{formatDateTime(runDetail.pending_approval.requested_at)}</strong>
                  </div>
                  <div className="hekor-run-info-row">
                    <span>Expires</span>
                    <strong>{formatDateTime(runDetail.pending_approval.expires_at)}</strong>
                  </div>
                </div>
                {Array.isArray(runDetail.pending_approval.metadata?.approval_labels) && runDetail.pending_approval.metadata?.approval_labels.length ? (
                  <div className="hekor-run-capability-block">
                    <div className="hekor-run-capability-title">Review signals</div>
                    <div className="hekor-run-capability-row">
                      {runDetail.pending_approval.metadata.approval_labels
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
                        Approving…
                      </>
                    ) : (
                      'Approve'
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
                        Dismissing…
                      </>
                    ) : (
                      'Dismiss'
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
