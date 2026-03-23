'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Download,
  Eye,
  RefreshCw,
  Search,
} from 'lucide-react';
import { AGENT_ROLE_OPTIONS, isAgentRoleId } from '@/app/page.catalog';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { API_BASE } from '@/lib/config';
import { fetchExecution, fetchExecutions } from '@/lib/api';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';
import { readSeededRuntimeRuns, RUNTIME_RUN_SEEDS_UPDATED_EVENT, type RuntimeRunSeed } from '@/lib/runtimeRunSeed';

const ORION_API_URL = process.env.NEXT_PUBLIC_ORION_API_URL ?? API_BASE;

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
  active_profile_id?: string | null;
  active_profile_label?: string | null;
  active_profile_provider?: string | null;
  active_profile_model?: string | null;
};

function toSeededRunMeta(seed: RuntimeRunSeed): RuntimeRunMeta {
  return {
    run_id: seed.run_id,
    status: String(seed.status || '').trim() || 'running',
    user_goal: seed.user_goal || null,
    created_at: seed.created_at || null,
    duration_ms: null,
    agent_role: seed.agent_role || null,
    parent_run_id: null,
    child_run_count: 0,
    delegation_next_action: null,
    delegation_ready: false,
    delegation_summary: null,
    connector_binding: null,
    active_profile_id: seed.active_profile_id || null,
    active_profile_label: seed.active_profile_label || null,
    active_profile_provider: seed.active_profile_provider || null,
    active_profile_model: seed.active_profile_model || null,
  };
}

function mergeRuntimeMeta(base: RuntimeRunMeta | undefined, incoming: RuntimeRunMeta): RuntimeRunMeta {
  if (!base) return incoming;
  return {
    ...base,
    ...incoming,
    status: incoming.status || base.status,
    user_goal: incoming.user_goal || base.user_goal,
    created_at: incoming.created_at || base.created_at,
    duration_ms: typeof incoming.duration_ms === 'number' ? incoming.duration_ms : base.duration_ms ?? null,
    agent_role: incoming.agent_role || base.agent_role,
    connector_binding: incoming.connector_binding || base.connector_binding || null,
    active_profile_id: incoming.active_profile_id || base.active_profile_id || null,
    active_profile_label: incoming.active_profile_label || base.active_profile_label || null,
    active_profile_provider: incoming.active_profile_provider || base.active_profile_provider || null,
    active_profile_model: incoming.active_profile_model || base.active_profile_model || null,
  };
}

function toSeedExecution(seed: RuntimeRunSeed): ExecutionRecord {
  return {
    id: seed.run_id,
    source: 'runtime',
    status: String(seed.status || '').trim() || 'running',
    triggeredBy: String(seed.triggered_by || '').trim() || 'Direct',
    createdAt: String(seed.created_at || '').trim() || undefined,
    durationMs: null,
    userGoal: String(seed.user_goal || '').trim() || null,
    workflow: {
      name: String(seed.workflow_name || seed.user_goal || `Run ${seed.run_id.slice(0, 8)}`).trim() || `Run ${seed.run_id.slice(0, 8)}`,
      definition: {
        meta: {
          operator: {
            agentRole: String(seed.agent_role || '').trim() || null,
          },
        },
      },
    },
  };
}

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
  active_profile_id?: unknown;
  active_profile_label?: unknown;
  active_profile_provider?: unknown;
  active_profile_model?: unknown;
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

function runtimeProfileText(meta?: RuntimeRunMeta | null): string {
  if (!meta) return '';
  const label = String(meta.active_profile_label || '').trim();
  const provider = String(meta.active_profile_provider || '').trim();
  const model = String(meta.active_profile_model || '').trim();
  if (label && model) return `${label} · ${model}`;
  if (label && provider) return `${label} · ${provider}`;
  if (label) return label;
  if (provider && model) return `${provider} · ${model}`;
  return provider || model;
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
  const [loadError, setLoadError] = useState('');
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
    if (typeof window === 'undefined') return undefined;
    const syncSeededRuns = () => {
      const seeds = readSeededRuntimeRuns();
      if (seeds.length === 0) return;
      setRuntimeRunMeta((current) => {
        const next = { ...current };
        seeds.forEach((seed) => {
          next[seed.run_id] = mergeRuntimeMeta(next[seed.run_id], toSeededRunMeta(seed));
        });
        return next;
      });
      setExecutions((current) => {
        const known = new Set(current.map((item) => item.id));
        const seeded = seeds.filter((seed) => !known.has(seed.run_id)).map((seed) => toSeedExecution(seed));
        if (seeded.length === 0) return current;
        return [...seeded, ...current];
      });
    };
    syncSeededRuns();
    window.addEventListener(RUNTIME_RUN_SEEDS_UPDATED_EVENT, syncSeededRuns);
    return () => window.removeEventListener(RUNTIME_RUN_SEEDS_UPDATED_EVENT, syncSeededRuns);
  }, []);

  useEffect(() => {
    if (!focusedRunId) return;
    setQuery(focusedRunId);
  }, [focusedRunId]);

  async function loadExecutions() {
    try {
      setLoading(true);
      setLoadError('');
      const seededRuns = readSeededRuntimeRuns();
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
      const metaByRunId = seededRuns.reduce<Record<string, RuntimeRunMeta>>((acc, seed) => {
        acc[seed.run_id] = toSeededRunMeta(seed);
        return acc;
      }, {});
      runtimeItems.forEach((item) => {
        const runId = String(item?.run_id || '').trim();
        if (!runId) return;
        metaByRunId[runId] = mergeRuntimeMeta(metaByRunId[runId], {
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
          active_profile_id: String(item?.active_profile_id || '').trim() || null,
          active_profile_label: String(item?.active_profile_label || '').trim() || null,
          active_profile_provider: String(item?.active_profile_provider || '').trim() || null,
          active_profile_model: String(item?.active_profile_model || '').trim() || null,
        });
      });
      setRuntimeRunMeta(metaByRunId);
      const backendExecutions = (Array.isArray(data) ? data : []).map((item) => ({
        ...item,
        source: 'backend' as const,
      }));
      const backendById = new Set(backendExecutions.map((item) => item.id));
      const runtimeById = new Set(runtimeItems.map((item) => String(item?.run_id || '').trim()).filter(Boolean));
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
      const seededFallbacks = seededRuns
        .filter((seed) => !backendById.has(seed.run_id) && !runtimeById.has(seed.run_id))
        .map((seed) => toSeedExecution(seed));
      setExecutions([...seededFallbacks, ...backendExecutions, ...runtimeFallbacks]);
    } catch (error) {
      console.error(error);
      setExecutions([]);
      setRuntimeRunMeta({});
      setLoadError(error instanceof Error ? error.message : 'Failed to load runs.');
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
        if (isRecentExecution(execution)) acc.recent += 1;
        return acc;
      },
      { total: 0, running: 0, failed: 0, completed: 0, recent: 0 },
    );
  }, [executions]);

  const activeSummary = useMemo(() => {
    if (runSummary.failed > 0) {
      return {
        title: `${runSummary.failed} run${runSummary.failed === 1 ? '' : 's'} need review`,
        note: 'Start with failed runs or blocked work before launching anything new.',
      };
    }
    if (runSummary.running > 0) {
      return {
        title: `${runSummary.running} run${runSummary.running === 1 ? '' : 's'} in progress`,
        note: 'Live execution is active now. Open the queue below to inspect current progress.',
      };
    }
    if (runSummary.recent > 0) {
      return {
        title: `${runSummary.recent} run${runSummary.recent === 1 ? '' : 's'} in the last 24 hours`,
        note: 'Recent execution history is available below, with profile and routing details.',
      };
    }
    return {
      title: 'No recent run pressure',
      note: 'The queue is quiet. Use filters below when you want to inspect historical execution.',
    };
  }, [runSummary]);

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

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setAgentFilter('all');
    setChannelFilter('all');
  };

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Activity size={18} />}
        title="Runs"
        subtitle="Monitor live execution, completed work, and anything that needs your attention."
        actions={
          <button className="orion-btn orion-btn-ghost" onClick={() => void loadExecutions()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <section className="orion-panel orion-runs-overview">
        <div className="orion-runs-overview-main">
          <div className="orion-home-overview-kicker">Operations overview</div>
          <div className="orion-runs-overview-title">{activeSummary.title}</div>
          <div className="orion-runs-overview-copy">{activeSummary.note}</div>
          <MetricStrip
            minWidth={142}
            items={[
              { label: 'Total', value: String(runSummary.total) },
              { label: 'In progress', value: String(runSummary.running) },
              { label: 'Completed', value: String(runSummary.completed) },
              { label: 'Needs review', value: String(runSummary.failed) },
              { label: 'Recent 24h', value: String(runSummary.recent) },
            ]}
          />
        </div>
        <aside className="orion-runs-overview-side">
          <div className="orion-home-side-card">
            <div className="orion-home-side-label">Queue state</div>
            <div className="orion-home-side-stats">
              <div>
                <div className="orion-home-side-value">{filteredExecutions.length}</div>
                <div className="orion-home-side-note">Visible now</div>
              </div>
              <div>
                <div className="orion-home-side-value">{channelOptions.length}</div>
                <div className="orion-home-side-note">Channels in use</div>
              </div>
            </div>
            <div className="orion-runs-overview-side-note">
              {runSummary.failed > 0
                ? 'Failed runs stay at the top of the queue so review starts where it matters.'
                : 'Use the filters below to isolate one owner, channel, or run state.'}
            </div>
          </div>
        </aside>
      </section>

      <section className="orion-panel muted" style={{ display: 'grid', gap: 12 }}>
        <div className="orion-panel-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="orion-panel-title">Operations view</div>
            <div className="orion-panel-copy">Search by goal or run ID, then narrow by status, handler, or channel.</div>
          </div>
        </div>
        <div className="orion-toolbar-grid">
          <div className="orion-toolbar-input-wrap orion-toolbar-grid-search">
            <Search size={14} className="icon" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input"
              placeholder="Search by goal, workflow name, or run ID..."
              style={{ paddingLeft: 36 }}
            />
          </div>
          <select
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{ minWidth: 0, width: '100%' }}
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
            style={{ minWidth: 0, width: '100%' }}
          >
            <option value="all">All handlers</option>
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
            style={{ minWidth: 0, width: '100%' }}
          >
            <option value="all">All channels</option>
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </div>
        <div className="orion-toolbar">
          <div className="orion-toolbar-summary">
            {filteredExecutions.length} of {executions.length} runs visible
          </div>
          {(query || statusFilter !== 'all' || agentFilter !== 'all' || channelFilter !== 'all') ? (
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </section>

      {loading ? (
        <section className="orion-panel muted orion-loading-panel">
          <div className="orion-loading-copy">Loading runs...</div>
        </section>
      ) : loadError ? (
        <section className="orion-empty">
          <div className="orion-empty-title">Couldn't load this section.</div>
          <div className="orion-empty-copy">{loadError}</div>
          <button type="button" className="btn-secondary" onClick={() => void loadExecutions()}>
            Retry
          </button>
        </section>
      ) : filteredExecutions.length === 0 ? (
        <section className="orion-empty">
          <div className="orion-empty-title">{executions.length === 0 ? 'No runs yet' : 'No runs match these filters'}</div>
          <div className="orion-empty-copy orion-empty-copy-spaced">
            {executions.length === 0
              ? 'Run a workflow to see execution history, approvals, and outcomes here.'
              : 'Try another search or clear the current filters to see more runs.'}
          </div>
          <div className="orion-inline-actions">
            {executions.length === 0 ? (
              <Link href="/" className="btn-secondary">
                Open Chat
              </Link>
            ) : (
              <button type="button" className="btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="orion-panel orion-panel-shell">
          <div className="orion-panel-header orion-panel-shell-header">
            <div>
              <div className="orion-panel-title">Execution queue</div>
              <div className="orion-panel-copy">Open any run to review results, inspect the full timeline, and decide the next action.</div>
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
            const runtimeProfile = runtimeProfileText(runMeta);
            const isOrchestrator = String(execution.workflow?.definition?.meta?.operator?.agentRole || '').trim() === 'orchestrator';
            const isRecent = isRecentExecution(execution);
            const routeLabel = execution.triggeredBy || 'Direct';
            const runChips = [
              isOrchestrator ? 'Coordinated' : null,
              isRecent ? 'Recent' : null,
              bindingText ? `Channel ${bindingText}` : null,
            ].filter(Boolean);

            return (
              <article
                key={execution.id}
                className="orion-list-row orion-run-row"
              >
                <button
                  className="orion-btn orion-btn-ghost orion-run-row-trigger"
                  onClick={() => void openExecutionDetail(execution.id)}
                >
                  <div className="orion-run-row-body">
                    <div>
                      <div className="orion-list-row-title">{workflowName}</div>
                      <div className="orion-list-row-subtitle orion-run-id">
                        {execution.id}
                      </div>
                    </div>
                    {runChips.length > 0 ? (
                      <div className="orion-run-chip-row">
                        {runChips.map((chip) => (
                          <span
                            key={`${execution.id}:${chip}`}
                            className="orion-chip"
                            style={
                              chip === 'Recent'
                                ? { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' }
                                : chip === 'Coordinated'
                                  ? { color: 'var(--primary-base)', border: '1px solid var(--primary-border-soft)', background: 'var(--primary-soft)' }
                                  : undefined
                            }
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="orion-run-meta">
                      <span>Owner {executionAgentRoleLabel(execution)}</span>
                      {runtimeProfile ? <span>Profile {runtimeProfile}</span> : null}
                      {parentRunId ? <span>Part of {parentRunId.slice(0, 8)}</span> : null}
                      {!parentRunId && childRunCount > 0 ? <span>{childRunCount} linked task{childRunCount === 1 ? '' : 's'}</span> : null}
                    </div>
                    {!parentRunId && delegationNextAction ? (
                      <div className="orion-run-note">
                        Next step: {titleCaseWords(delegationNextAction)}
                      </div>
                    ) : null}
                    {!parentRunId && retryableFailedChildren > 0 ? (
                      <div className="orion-run-note">
                        {retryableFailedChildren} linked task{retryableFailedChildren === 1 ? '' : 's'} need another try
                      </div>
                    ) : null}
                    {!parentRunId && readyForMerge ? (
                      <div className="orion-run-note">
                        Ready to wrap up
                      </div>
                    ) : null}
                  </div>
                </button>

                <div className="orion-run-side">
                  <div className="orion-run-side-top">
                    <div className="orion-run-status-wrap">
                      <span
                        className="orion-run-status"
                        style={{
                          color: status.color,
                          border: status.border,
                          background: status.bg,
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
                    <div className="orion-run-stat-grid">
                      <div className="orion-run-stat">
                        <div className="orion-run-stat-label">Started</div>
                        <div className="orion-run-stat-value">{toDateLabel(execution.createdAt)}</div>
                      </div>
                      <div className="orion-run-stat">
                        <div className="orion-run-stat-label">Duration</div>
                        <div className="orion-run-stat-value">{toDurationLabel(execution.durationMs)}</div>
                      </div>
                      <div className="orion-run-stat">
                        <div className="orion-run-stat-label">Route</div>
                        <div className="orion-run-stat-value">{routeLabel}</div>
                      </div>
                    </div>
                  </div>

                  <div className="orion-run-actions">
                    {execution.source === 'runtime' ? null : (
                      <button
                        className="orion-btn orion-btn-ghost orion-run-action-btn"
                        onClick={() => void openExecutionDetail(execution.id)}
                      >
                        <Eye size={12} />
                        Details
                      </button>
                    )}
                    <Link
                      className="orion-btn orion-btn-ghost orion-run-action-btn"
                      href={`/runs/${encodeURIComponent(execution.id)}/inspect?focus=timeline`}
                    >
                      Full timeline
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
                <h2 style={{ fontSize: 17, fontWeight: 800 }}>Run detail</h2>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {selectedExecution.workflow?.name || 'Untitled Workflow'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Handled by {executionAgentRoleLabel(selectedExecution)}
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
                  Full timeline
                </Link>
                <button className="orion-btn orion-btn-secondary" onClick={() => setSelectedExecution(null)}>
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
    </div>
  );
}
