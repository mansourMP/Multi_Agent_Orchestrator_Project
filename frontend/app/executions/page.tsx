'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Download,
  Eye,
  RefreshCw,
  Search,
} from 'lucide-react';
import { AGENT_ROLE_OPTIONS, isAgentRoleId } from '@/app/page.catalog';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { fetchExecution, fetchExecutions } from '@/lib/api';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

const ORION_API_URL = process.env.NEXT_PUBLIC_ORION_API_URL || 'http://127.0.0.1:8001';

type ExecutionRecord = {
  id: string;
  source?: 'backend' | 'runtime';
  status?: string;
  triggeredBy?: string;
  createdAt?: string;
  durationMs?: number | null;
  userGoal?: string | null;
  workflow?: {
    name?: string | null;
    definition?: {
      meta?: {
        operator?: {
          agentRole?: string | null;
        } | null;
      } | null;
    } | null;
  } | null;
};

type RuntimeRunMeta = {
  run_id: string;
  status?: string;
  user_goal?: string | null;
  created_at?: string | null;
  duration_ms?: number | null;
  agent_role?: string | null;
  parent_run_id?: string | null;
  child_run_count?: number;
  delegation_next_action?: string | null;
  delegation_ready?: boolean;
  delegation_summary?: {
    retryable_failed_children?: number;
    ready_for_merge?: boolean;
    failed_run_ids?: string[];
  } | null;
  connector_binding?: {
    channel?: string | null;
    label?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null;
};

type RuntimeHistoryItem = {
  run_id?: unknown;
  status?: unknown;
  user_goal?: unknown;
  created_at?: unknown;
  duration_ms?: unknown;
  agent_role?: unknown;
  parent_run_id?: unknown;
  child_run_count?: unknown;
  delegation_next_action?: unknown;
  delegation_ready?: unknown;
  delegation_summary?: unknown;
  connector_binding?:
    | {
        channel?: unknown;
        label?: unknown;
        identity_label?: unknown;
        routing_scope?: unknown;
      }
    | unknown;
};

type ExecutionStep = {
  id?: string;
  nodeType?: string;
  status?: string;
  output?: unknown;
  toolCalls?: Array<{ toolName?: string }>;
};

type ExecutionDetail = ExecutionRecord & {
  steps?: ExecutionStep[];
  output?: {
    logs?: string[];
  } | null;
  logs?: string[];
};

type StatusMeta = {
  label: string;
  color: string;
  border: string;
  bg: string;
};

type ReplayStepRow = {
  id: string;
  title: string;
  status: StatusMeta;
  tools: string;
  output: string;
};

function toDateLabel(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function toDurationLabel(durationMs?: number | null): string {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs)) return '—';
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function titleCaseWords(value?: string | null): string {
  return String(value || '')
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusMeta(status?: string): StatusMeta {
  if (status === 'success' || status === 'completed') {
    return {
      label: 'Success',
      color: 'var(--success-fg)',
      border: '1px solid var(--success-border)',
      bg: 'var(--success-bg)',
    };
  }

  if (status === 'running') {
    return {
      label: 'Running',
      color: 'var(--primary-base)',
      border: '1px solid var(--primary-border-soft)',
      bg: 'var(--primary-soft)',
    };
  }

  if (status === 'failed' || status === 'error') {
    return {
      label: 'Failed',
      color: 'var(--error-fg)',
      border: '1px solid var(--error-border)',
      bg: 'var(--error-bg)',
    };
  }

  return {
    label: 'Unknown',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    bg: 'var(--bg-element)',
  };
}

function toReplayOutputPreview(value: unknown): string {
  const text =
    typeof value === 'string'
      ? value
      : value == null
      ? ''
      : JSON.stringify(value, null, 2);
  if (!text.trim()) return 'No output';
  if (text.length <= 260) return text;
  return `${text.slice(0, 257)}...`;
}

function executionAgentRoleLabel(execution?: ExecutionRecord | ExecutionDetail | null): string {
  const roleId = String(execution?.workflow?.definition?.meta?.operator?.agentRole || '').trim();
  if (!isAgentRoleId(roleId)) return '--';
  return AGENT_ROLE_OPTIONS.find((item) => item.id === roleId)?.label || roleId;
}

function connectorBindingText(meta?: RuntimeRunMeta | null): string {
  const binding = meta?.connector_binding;
  if (!binding) return '';
  const channel = String(binding.channel || '').trim();
  const identity = String(binding.identity_label || binding.label || '').trim();
  const scope = String(binding.routing_scope || '').trim();
  const parts = [channel, identity, scope].filter(Boolean);
  return parts.join(' · ');
}

function connectorChannelValue(meta?: RuntimeRunMeta | null): string {
  return String(meta?.connector_binding?.channel || '').trim().toLowerCase();
}

function executionTimestampValue(execution: ExecutionRecord): number {
  const raw = execution.createdAt;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function isRecentExecution(execution: ExecutionRecord): boolean {
  const ts = executionTimestampValue(execution);
  if (!ts) return false;
  return Date.now() - ts <= 24 * 60 * 60 * 1000;
}

export default function ExecutionsPage() {
  const router = useRouter();
  const [focusedRunId, setFocusedRunId] = useState('');
  const autoOpenedRunRef = useRef<string>('');
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [runtimeRunMeta, setRuntimeRunMeta] = useState<Record<string, RuntimeRunMeta>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionDetail | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = String(new URLSearchParams(window.location.search).get('focus') || '').trim();
    setFocusedRunId(next);
  }, []);

  useEffect(() => {
    void loadExecutions();
  }, []);

  useEffect(() => {
    if (!focusedRunId) return;
    setQuery(focusedRunId);
  }, [focusedRunId]);

  async function loadExecutions() {
    try {
      setLoading(true);
      const runtimeKey = readRuntimeApiKeyFromStorage('');
      const runtimeHeaders = new Headers();
      if (runtimeKey) runtimeHeaders.set('X-API-Key', runtimeKey);
      const [data, runtimeHistory] = await Promise.all([
        fetchExecutions(),
        runtimeKey
          ? fetch(`${ORION_API_URL}/history/runs?limit=200&workspace_id=default`, { headers: runtimeHeaders })
              .then(async (res) => (res.ok ? res.json() : { items: [] }))
              .catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ]);
      const runtimeItems: RuntimeHistoryItem[] = Array.isArray(runtimeHistory?.items)
        ? (runtimeHistory.items as RuntimeHistoryItem[])
        : [];
      const metaByRunId = runtimeItems.reduce<Record<string, RuntimeRunMeta>>((acc, item) => {
        const runId = String(item?.run_id || '').trim();
        if (!runId) return acc;
        acc[runId] = {
          run_id: runId,
          status: String(item?.status || '').trim() || undefined,
          user_goal: String(item?.user_goal || '').trim() || null,
          created_at: String(item?.created_at || '').trim() || null,
          duration_ms: typeof item?.duration_ms === 'number' ? item.duration_ms : null,
          agent_role: String(item?.agent_role || '').trim() || null,
          parent_run_id: String(item?.parent_run_id || '').trim() || null,
          child_run_count: Number(item?.child_run_count || 0),
          delegation_next_action: String(item?.delegation_next_action || '').trim() || null,
          delegation_ready: Boolean(item?.delegation_ready),
          delegation_summary:
            item?.delegation_summary && typeof item.delegation_summary === 'object'
              ? item.delegation_summary
              : null,
          connector_binding: item?.connector_binding && typeof item.connector_binding === 'object'
            ? item.connector_binding
            : null,
        };
        return acc;
      }, {});
      setRuntimeRunMeta(metaByRunId);
      const backendExecutions = (Array.isArray(data) ? data : []).map((item) => ({
        ...item,
        source: 'backend' as const,
      }));
      const backendById = new Set(backendExecutions.map((item) => item.id));
      const runtimeFallbacks: ExecutionRecord[] = runtimeItems
        .filter((item) => {
          const runId = String(item?.run_id || '').trim();
          return runId && !backendById.has(runId);
        })
        .map((item) => {
          const runId = String(item?.run_id || '').trim();
          const userGoal = String(item?.user_goal || '').trim();
          const agentRole = String(item?.agent_role || '').trim();
          const connectorBinding =
            item?.connector_binding && typeof item.connector_binding === 'object'
              ? item.connector_binding
              : null;
          const channel =
            connectorBinding && 'channel' in connectorBinding
              ? String(connectorBinding.channel || '').trim()
              : '';
          return {
            id: runId,
            source: 'runtime',
            status: String(item?.status || '').trim() || 'unknown',
            triggeredBy: channel || 'Manual',
            createdAt: String(item?.created_at || '').trim() || undefined,
            durationMs: typeof item?.duration_ms === 'number' ? item.duration_ms : null,
            userGoal: userGoal || null,
            workflow: {
              name: userGoal || `Run ${runId.slice(0, 8)}`,
              definition: {
                meta: {
                  operator: {
                    agentRole: agentRole || null,
                  },
                },
              },
            },
          };
        });
      setExecutions([...backendExecutions, ...runtimeFallbacks]);
    } catch (error) {
      console.error(error);
      setExecutions([]);
      setRuntimeRunMeta({});
    } finally {
      setLoading(false);
    }
  }

  const openExecutionDetail = useCallback(async (executionId: string) => {
    const record = executions.find((item) => item.id === executionId);
    if (record?.source === 'runtime') {
      router.push(`/runs/${encodeURIComponent(executionId)}/inspect?focus=timeline`);
      return;
    }
    try {
      setDetailLoading(true);
      const detail = await fetchExecution(executionId);
      setSelectedExecution(detail as ExecutionDetail);
    } catch (error) {
      console.error(error);
    } finally {
      setDetailLoading(false);
    }
  }, [executions, router]);

  useEffect(() => {
    if (!focusedRunId || loading) return;
    if (autoOpenedRunRef.current === focusedRunId) return;
    const exists = executions.some((item) => item.id === focusedRunId);
    if (!exists) return;
    autoOpenedRunRef.current = focusedRunId;
    void openExecutionDetail(focusedRunId);
  }, [focusedRunId, loading, executions, openExecutionDetail]);

  const filteredExecutions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return executions.filter((execution) => {
      const workflowName = execution.workflow?.name || execution.userGoal || 'Untitled Run';
      const status = execution.status || 'unknown';

      const matchesQuery =
        normalizedQuery.length === 0 ||
        workflowName.toLowerCase().includes(normalizedQuery) ||
        execution.id.toLowerCase().includes(normalizedQuery);

      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesAgent =
        agentFilter === 'all' ||
        String(execution.workflow?.definition?.meta?.operator?.agentRole || '').trim() === agentFilter;
      const matchesChannel =
        channelFilter === 'all' || connectorChannelValue(runtimeRunMeta[execution.id]) === channelFilter;

      return matchesQuery && matchesStatus && matchesAgent && matchesChannel;
    }).sort((a, b) => {
      const aStatus = String(a.status || '').toLowerCase();
      const bStatus = String(b.status || '').toLowerCase();
      const aRunning = aStatus === 'running' ? 1 : 0;
      const bRunning = bStatus === 'running' ? 1 : 0;
      if (aRunning !== bRunning) return bRunning - aRunning;
      return executionTimestampValue(b) - executionTimestampValue(a);
    });
  }, [agentFilter, channelFilter, executions, query, runtimeRunMeta, statusFilter]);

  const channelOptions = useMemo(() => {
    const values = new Set<string>();
    executions.forEach((execution) => {
      const channel = connectorChannelValue(runtimeRunMeta[execution.id]);
      if (channel) values.add(channel);
    });
    return Array.from(values).sort();
  }, [executions, runtimeRunMeta]);

  const runSummary = useMemo(() => {
    return executions.reduce(
      (acc, execution) => {
        const status = String(execution.status || '').toLowerCase();
        acc.total += 1;
        if (status === 'running') acc.running += 1;
        if (status === 'failed' || status === 'error') acc.failed += 1;
        if (status === 'completed' || status === 'success') acc.completed += 1;
        return acc;
      },
      { total: 0, running: 0, failed: 0, completed: 0 },
    );
  }, [executions]);

  const recentRunCount = useMemo(
    () => executions.filter((execution) => isRecentExecution(execution)).length,
    [executions],
  );

  const orchestratorRunCount = useMemo(
    () =>
      executions.filter(
        (execution) =>
          String(execution.workflow?.definition?.meta?.operator?.agentRole || '').trim() === 'orchestrator',
      ).length,
    [executions],
  );

  const tokenSummary = useMemo(() => {
    if (!selectedExecution) return 0;
    const logs = selectedExecution.output?.logs || selectedExecution.logs || [];

    return logs.reduce((sum, line) => {
      const match = line.match(/TOKENS:.*total=(\d+)/);
      if (!match) return sum;
      return sum + Number(match[1]);
    }, 0);
  }, [selectedExecution]);

  const replayRows = useMemo<ReplayStepRow[]>(() => {
    if (!selectedExecution) return [];
    const steps = Array.isArray(selectedExecution.steps) ? selectedExecution.steps : [];
    return steps.map((step, index) => {
      const tools = (step.toolCalls || [])
        .map((tool) => String(tool.toolName || '').trim())
        .filter(Boolean)
        .join(', ');
      return {
        id: String(step.id || `step-${index}`),
        title: String(step.nodeType || `Step ${index + 1}`),
        status: statusMeta(step.status),
        tools: tools || '--',
        output: toReplayOutputPreview(step.output),
      };
    });
  }, [selectedExecution]);

  const exportExecution = () => {
    if (!selectedExecution) return;

    const payload = new Blob([JSON.stringify(selectedExecution, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(payload);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `execution-${selectedExecution.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Activity size={18} />}
        title="Runs"
        subtitle="See what ran, what finished, and where work needs a closer look."
        meta={
          <>
            <span>{filteredExecutions.length} visible</span>
            <span>{executions.length} total</span>
          </>
        }
        actions={
          <button className="orion-btn orion-btn-ghost" onClick={() => void loadExecutions()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <MetricStrip
        minWidth={160}
        items={[
          { label: 'Total', value: String(runSummary.total) },
          { label: 'Running', value: String(runSummary.running) },
          { label: 'Completed', value: String(runSummary.completed) },
          { label: 'Failed', value: String(runSummary.failed) },
          { label: 'Recent 24h', value: String(recentRunCount) },
          { label: 'Orchestrator', value: String(orchestratorRunCount) },
        ]}
      />

      <section className="orion-panel muted" style={{ display: 'grid', gap: 12 }}>
        <div className="orion-panel-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="orion-panel-title">Find a run</div>
            <div className="orion-panel-copy">Search by run, status, worker, or channel.</div>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            alignItems: 'end',
          }}
        >
          <div className="orion-toolbar-input-wrap" style={{ gridColumn: '1 / -1', minWidth: 0 }}>
            <Search size={14} className="icon" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input"
              placeholder="Search by run ID, goal, or summary"
              style={{ height: 42, borderRadius: 11, paddingLeft: 36 }}
            />
          </div>
          <select
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{ height: 42, minWidth: 0, width: '100%', borderRadius: 11 }}
          >
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="error">Error</option>
          </select>

          <select
            className="input"
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            style={{ height: 42, minWidth: 0, width: '100%', borderRadius: 11 }}
          >
            <option value="all">All workers</option>
            {AGENT_ROLE_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
            style={{ height: 42, minWidth: 0, width: '100%', borderRadius: 11 }}
          >
            <option value="all">All channels</option>
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {filteredExecutions.length} of {executions.length} runs
        </div>
      </section>

      {loading ? (
        <section className="orion-panel muted" style={{ minHeight: 140, display: 'grid', placeItems: 'center' }}>
          <div style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>Loading runs...</div>
        </section>
      ) : filteredExecutions.length === 0 ? (
        <section className="orion-panel" style={{ padding: '18px 20px', display: 'grid', gap: 6, justifyItems: 'start' }}>
          <div className="orion-empty-title" style={{ marginBottom: 0 }}>No runs found</div>
          <div className="orion-empty-copy">Run history will appear here.</div>
          <Link href="/" className="orion-btn orion-btn-primary" style={{ minHeight: 34, paddingInline: 12 }}>
            Open Home
          </Link>
        </section>
      ) : (
        <section className="orion-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="orion-panel-header"
            style={{
              marginBottom: 0,
              padding: '16px 18px 12px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <div className="orion-panel-title">Run history</div>
              <div className="orion-panel-copy">Open a run to inspect results, replay steps, and delegated work when you need more detail.</div>
            </div>
          </div>
          {filteredExecutions.map((execution) => {
            const workflowName = execution.workflow?.name || execution.userGoal || 'Untitled Run';
            const status = statusMeta(execution.status);
            const runMeta = runtimeRunMeta[execution.id];
            const bindingText = connectorBindingText(runMeta);
            const parentRunId = String(runMeta?.parent_run_id || '').trim();
            const childRunCount = Number(runMeta?.child_run_count || 0);
            const retryableFailedChildren = Number(runMeta?.delegation_summary?.retryable_failed_children || 0);
            const readyForMerge = Boolean(runMeta?.delegation_summary?.ready_for_merge || runMeta?.delegation_ready);
            const delegationNextAction = String(runMeta?.delegation_next_action || '').trim();
            const isOrchestrator = String(execution.workflow?.definition?.meta?.operator?.agentRole || '').trim() === 'orchestrator';
            const isRecent = isRecentExecution(execution);
            const routeLabel = execution.triggeredBy || 'Manual';
            const runChips = [
              isOrchestrator ? 'Orchestrator' : null,
              isRecent ? 'Recent' : null,
              bindingText ? `Channel ${bindingText}` : null,
            ].filter(Boolean);

            return (
              <article
                key={execution.id}
                className="orion-list-row"
                style={{
                  padding: '14px 16px',
                  alignItems: 'start',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  className="orion-btn orion-btn-ghost"
                  onClick={() => void openExecutionDetail(execution.id)}
                  style={{
                    minWidth: 0,
                    flex: '1 1 460px',
                    justifyContent: 'flex-start',
                    minHeight: 44,
                    padding: '0 2px',
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                  }}
                >
                  <div style={{ minWidth: 0, textAlign: 'left', display: 'grid', gap: 6 }}>
                    <div>
                      <div className="orion-list-row-title" style={{ fontSize: 14 }}>{workflowName}</div>
                      <div className="orion-list-row-subtitle" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {execution.id}
                      </div>
                    </div>
                    {runChips.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {runChips.map((chip) => (
                          <span
                            key={`${execution.id}:${chip}`}
                            className="orion-chip"
                            style={
                              chip === 'Recent'
                                ? { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' }
                                : chip === 'Orchestrator'
                                  ? { color: 'var(--primary-base)', border: '1px solid var(--primary-border-soft)', background: 'var(--primary-soft)' }
                                  : undefined
                            }
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      <span>Agent {executionAgentRoleLabel(execution)}</span>
                      {parentRunId ? <span>Child of {parentRunId.slice(0, 8)}</span> : null}
                      {!parentRunId && childRunCount > 0 ? <span>Delegated {childRunCount} child run{childRunCount === 1 ? '' : 's'}</span> : null}
                    </div>
                    {!parentRunId && delegationNextAction ? (
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                        Next action: {titleCaseWords(delegationNextAction)}
                      </div>
                    ) : null}
                    {!parentRunId && retryableFailedChildren > 0 ? (
                      <div style={{ fontSize: 11.5, color: 'var(--warning-fg)' }}>
                        {retryableFailedChildren} failed child run{retryableFailedChildren === 1 ? '' : 's'} can be retried
                      </div>
                    ) : null}
                    {!parentRunId && readyForMerge ? (
                      <div style={{ fontSize: 11.5, color: 'var(--success-fg)' }}>
                        Ready for merge
                      </div>
                    ) : null}
                  </div>
                </button>

                <div style={{ display: 'grid', gap: 10, justifyItems: 'end', flex: '0 1 360px', minWidth: 280 }}>
                  <div style={{ display: 'grid', gap: 8, width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          minHeight: 24,
                          padding: '0 9px',
                          borderRadius: 999,
                          fontSize: 11,
                          color: status.color,
                          border: status.border,
                          background: status.bg,
                          fontWeight: 700,
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: status.color,
                          }}
                        />
                        {status.label}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, width: '100%' }}>
                      <div style={{ display: 'grid', gap: 3, justifyItems: 'end' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Started</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{toDateLabel(execution.createdAt)}</div>
                      </div>
                      <div style={{ display: 'grid', gap: 3, justifyItems: 'end' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Duration</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{toDurationLabel(execution.durationMs)}</div>
                      </div>
                      <div style={{ display: 'grid', gap: 3, justifyItems: 'end' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Route</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{routeLabel}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {execution.source === 'runtime' ? null : (
                      <button
                        className="orion-btn orion-btn-ghost"
                        onClick={() => void openExecutionDetail(execution.id)}
                        style={{ minHeight: 30, padding: '0 10px', fontSize: 11 }}
                      >
                        <Eye size={12} />
                        Replay
                      </button>
                    )}
                    <Link
                      className="orion-btn orion-btn-ghost"
                      href={`/runs/${encodeURIComponent(execution.id)}/inspect?focus=timeline`}
                      style={{ minHeight: 30, padding: '0 10px', fontSize: 11 }}
                    >
                      Inspect
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {selectedExecution && (
        <div className="orion-modal-overlay" onClick={() => setSelectedExecution(null)}>
          <section className="orion-modal" onClick={(event) => event.stopPropagation()}>
            <header className="orion-panel-header" style={{ marginBottom: 0 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800 }}>Run Replay</h2>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {selectedExecution.workflow?.name || 'Untitled Automation'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Agent {executionAgentRoleLabel(selectedExecution)}
                </div>
                {connectorBindingText(runtimeRunMeta[selectedExecution.id]) ? (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Channel {connectorBindingText(runtimeRunMeta[selectedExecution.id])}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'inline-flex', gap: 8 }}>
                <button className="orion-btn orion-btn-ghost" onClick={exportExecution}>
                  <Download size={14} />
                  Export
                </button>
                <Link className="orion-btn orion-btn-ghost" href={`/runs/${encodeURIComponent(selectedExecution.id)}/inspect?focus=timeline`}>
                  Inspect
                </Link>
                <button className="orion-btn" onClick={() => setSelectedExecution(null)}>
                  Close
                </button>
              </div>
            </header>

            {detailLoading ? (
              <div style={{ color: 'var(--text-tertiary)' }}>Loading execution detail…</div>
            ) : (
              <>
                {tokenSummary > 0 && (
                  <div
                    className="orion-chip"
                    style={{
                      width: 'fit-content',
                      border: '1px solid var(--primary-border-soft)',
                      background: 'var(--primary-soft)',
                      color: 'var(--primary-base)',
                    }}
                  >
                    Token total: {tokenSummary}
                  </div>
                )}

                <div style={{ maxHeight: 440, overflow: 'auto', paddingRight: 4 }}>
                  {replayRows.length === 0 ? (
                    <div className="orion-empty" style={{ padding: 24 }}>
                      <div className="orion-empty-title">No run steps recorded</div>
                    </div>
                  ) : (
                    <div
                      style={{
                        borderRadius: 10,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-panel)',
                        overflowX: 'auto',
                      }}
                    >
                      <div
                        style={{
                          minWidth: 780,
                          display: 'grid',
                          gridTemplateColumns: 'minmax(180px,1.3fr) 110px minmax(140px,0.9fr) minmax(280px,2fr)',
                          gap: 10,
                          padding: '8px 10px',
                          borderBottom: '1px solid var(--border-default)',
                          fontSize: 10,
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          fontWeight: 800,
                        }}
                      >
                        <span>Step</span>
                        <span>Status</span>
                        <span>Tools</span>
                        <span>Output</span>
                      </div>
                      {replayRows.map((step, index) => (
                        <div
                          key={`${step.id}:${index}`}
                          className="orion-log-entry"
                          style={{
                            minWidth: 780,
                            display: 'grid',
                            gridTemplateColumns: 'minmax(180px,1.3fr) 110px minmax(140px,0.9fr) minmax(280px,2fr)',
                            gap: 10,
                            padding: '9px 10px',
                            borderBottom: '1px solid var(--border-default)',
                            alignItems: 'start',
                          }}
                        >
                          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>{step.title}</span>
                          <span
                            className="orion-chip"
                            style={{
                              width: 'fit-content',
                              color: step.status.color,
                              border: step.status.border,
                              background: step.status.bg,
                            }}
                          >
                            {step.status.label}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{step.tools}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>
                            {step.output}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {!loading && executions.length > 0 && filteredExecutions.length === 0 && (
        <div
          style={{
            width: 'fit-content',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--warning-fg)',
            background: 'var(--warning-bg)',
            borderLeft: '2px solid var(--warning-border)',
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          <AlertTriangle size={12} />
          Filters are hiding all runs
        </div>
      )}
    </div>
  );
}
