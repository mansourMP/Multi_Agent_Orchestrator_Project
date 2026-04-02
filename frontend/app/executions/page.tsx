'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  Eye,
  PlayCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { AGENT_ROLE_OPTIONS, isAgentRoleId } from '@/app/page.catalog';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { API_BASE } from '@/lib/config';
import { fetchExecutionHistory, fetchExecutions } from '@/lib/api';
import { humanizeUiError, UI_ERROR_COPY } from '@/lib/uiError';

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
  tool_capabilities?: Array<{
    id?: string | null;
    label?: string | null;
    connected?: boolean;
    authenticated?: boolean | null;
    runtime_usable?: boolean | null;
    read_actions?: string[];
    write_actions?: string[];
    approval_required_actions?: string[];
  }>;
  approval_outcome?: {
    status?: string | null;
    label?: string | null;
  } | null;
  evidence_items?: Array<{
    id?: string | null;
    label?: string | null;
    value?: string | null;
  }>;
  active_profile_id?: string | null;
  active_profile_label?: string | null;
  active_profile_provider?: string | null;
  active_profile_model?: string | null;
  requested_provider?: string | null;
  effective_provider?: string | null;
  requested_model?: string | null;
  effective_model?: string | null;
  provider_overridden?: boolean;
  model_overridden?: boolean;
  fallback_used?: boolean;
  graph_kind?: string | null;
  active_node_id?: string | null;
  final_node_id?: string | null;
  workflow_node_count?: number;
  node_state_counts?: Record<string, unknown> | null;
};

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
    tool_capabilities:
      Array.isArray(incoming.tool_capabilities) && incoming.tool_capabilities.length > 0
        ? incoming.tool_capabilities
        : base.tool_capabilities || [],
    approval_outcome: incoming.approval_outcome || base.approval_outcome || null,
    evidence_items:
      Array.isArray(incoming.evidence_items) && incoming.evidence_items.length > 0
        ? incoming.evidence_items
        : base.evidence_items || [],
    active_profile_id: incoming.active_profile_id || base.active_profile_id || null,
    active_profile_label: incoming.active_profile_label || base.active_profile_label || null,
    active_profile_provider: incoming.active_profile_provider || base.active_profile_provider || null,
    active_profile_model: incoming.active_profile_model || base.active_profile_model || null,
    requested_provider: incoming.requested_provider || base.requested_provider || null,
    effective_provider: incoming.effective_provider || base.effective_provider || null,
    requested_model: incoming.requested_model || base.requested_model || null,
    effective_model: incoming.effective_model || base.effective_model || null,
    provider_overridden: incoming.provider_overridden ?? base.provider_overridden,
    model_overridden: incoming.model_overridden ?? base.model_overridden,
    fallback_used: incoming.fallback_used ?? base.fallback_used,
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
  tool_capabilities?: unknown;
  approval_outcome?:
    | {
        status?: unknown;
        label?: unknown;
      }
    | unknown;
  evidence_items?: unknown;
  active_profile_id?: unknown;
  active_profile_label?: unknown;
  active_profile_provider?: unknown;
  active_profile_model?: unknown;
  requested_provider?: unknown;
  effective_provider?: unknown;
  requested_model?: unknown;
  effective_model?: unknown;
  provider_overridden?: unknown;
  model_overridden?: unknown;
  fallback_used?: unknown;
  graph_kind?: unknown;
  active_node_id?: unknown;
  final_node_id?: unknown;
  workflow_node_count?: unknown;
  node_state_counts?: unknown;
};

type StatusMeta = {
  label: string;
  color: string;
  border: string;
  bg: string;
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

function humanizeProviderLabel(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'anthropic') return 'Anthropic';
  if (normalized === 'gemini') return 'Gemini';
  if (normalized === 'vertex') return 'Vertex AI';
  if (normalized === 'codex_cli') return 'Codex/OpenAI';
  if (normalized === 'claude_code_cli') return 'Claude Code';
  return titleCaseWords(normalized);
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

function executionAgentRoleLabel(execution?: ExecutionRecord | null): string {
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
  const requestedProvider = humanizeProviderLabel(meta.requested_provider || null);
  const requestedModel = String(meta.requested_model || '').trim();
  const effectiveProvider = humanizeProviderLabel(meta.effective_provider || meta.active_profile_provider || null);
  const effectiveModel = String(meta.effective_model || meta.active_profile_model || '').trim();
  if (meta.fallback_used && (requestedProvider || requestedModel || effectiveProvider || effectiveModel)) {
    return `Requested ${requestedProvider || 'Unknown'} · ${requestedModel || 'Unknown'} → Effective ${effectiveProvider || 'Unknown'} · ${effectiveModel || 'Unknown'}`;
  }
  const label = String(meta.active_profile_label || '').trim();
  if (label && effectiveModel) return `Effective ${label} · ${effectiveModel}`;
  if (label && effectiveProvider) return `Effective ${label} · ${effectiveProvider}`;
  if (effectiveProvider || effectiveModel) return `Effective ${effectiveProvider || 'Unknown'} · ${effectiveModel || 'Unknown'}`;
  if (requestedProvider || requestedModel) return `Requested ${requestedProvider || 'Unknown'} · ${requestedModel || 'Unknown'}`;
  return '';
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

function executionTaskSummary(execution: ExecutionRecord): string {
  const goal = String(execution.userGoal || '').replace(/\s+/g, ' ').trim();
  if (goal) return goal;
  const workflowName = String(execution.workflow?.name || '').replace(/\s+/g, ' ').trim();
  if (workflowName && workflowName.toLowerCase() !== 'untitled run') return workflowName;
  return 'No task description recorded for this run.';
}

function executionStateNote(execution: ExecutionRecord): string {
  const status = String(execution.status || '').trim().toLowerCase();
  if (status === 'failed' || status === 'error') {
    return 'Review what blocked this task and decide the next step.';
  }
  if (status === 'running') {
    return 'Platform is still working on this task.';
  }
  if (status === 'success' || status === 'completed') {
    return 'Completed. Open the run to review the result.';
  }
  return 'Open the run to review the latest activity.';
}

function startedFromLabel(execution: ExecutionRecord, meta?: RuntimeRunMeta | null): string {
  const channel = connectorChannelValue(meta);
  if (channel) return titleCaseWords(channel);
  const triggeredBy = String(execution.triggeredBy || '').trim();
  if (!triggeredBy || triggeredBy.toLowerCase() === 'direct') return 'Manual';
  return titleCaseWords(triggeredBy);
}

function formatNodeStateLabel(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '--';
  if (normalized === 'waiting_human') return 'Waiting';
  return normalized.replace(/_/g, ' ');
}

function workflowProgressSummary(meta?: RuntimeRunMeta | null): string {
  if (!meta || Number(meta.workflow_node_count || 0) <= 0) return '';
  const counts = meta.node_state_counts && typeof meta.node_state_counts === 'object' ? meta.node_state_counts : null;
  if (!counts) return `${meta.workflow_node_count} workflow nodes tracked.`;
  const ordered = ['running', 'waiting_human', 'failed', 'succeeded', 'skipped']
    .map((key) => {
      const value = Number((counts as Record<string, unknown>)[key] || 0);
      if (!value) return '';
      return `${value} ${formatNodeStateLabel(key)}`;
    })
    .filter(Boolean);
  return ordered.length > 0
    ? `${ordered.join(' · ')}`
    : `${meta.workflow_node_count} workflow nodes tracked.`;
}

export default function ExecutionsPage() {
  const router = useRouter();
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [runtimeRunMeta, setRuntimeRunMeta] = useState<Record<string, RuntimeRunMeta>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  useEffect(() => {
    void loadExecutions();
  }, []);

  async function loadExecutions() {
    try {
      setLoading(true);
      setLoadError('');
      const [data, runtimeHistory] = await Promise.all([
        fetchExecutions(),
        fetchExecutionHistory(200, 'default').catch(() => ({ items: [] })),
      ]);
      const runtimeItems: RuntimeHistoryItem[] = Array.isArray(runtimeHistory?.items)
        ? (runtimeHistory.items as RuntimeHistoryItem[])
        : [];
      const metaByRunId: Record<string, RuntimeRunMeta> = {};
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
          tool_capabilities: Array.isArray(item?.tool_capabilities)
            ? item.tool_capabilities.reduce<NonNullable<RuntimeRunMeta['tool_capabilities']>>((acc: NonNullable<RuntimeRunMeta['tool_capabilities']>, entry: unknown) => {
                if (!entry || typeof entry !== 'object') return acc;
                const record = entry as Record<string, unknown>;
                const id = String(record.id || '').trim();
                if (!id) return acc;
                acc.push({
                  id,
                  label: String(record.label || id).trim() || id,
                  connected: Boolean(record.connected),
                  authenticated: typeof record.authenticated === 'boolean' ? record.authenticated : null,
                  runtime_usable: typeof record.runtime_usable === 'boolean' ? record.runtime_usable : null,
                  read_actions: Array.isArray(record.read_actions) ? record.read_actions.map((value) => String(value || '').trim()).filter(Boolean) : [],
                  write_actions: Array.isArray(record.write_actions) ? record.write_actions.map((value) => String(value || '').trim()).filter(Boolean) : [],
                  approval_required_actions: Array.isArray(record.approval_required_actions)
                    ? record.approval_required_actions.map((value) => String(value || '').trim()).filter(Boolean)
                    : [],
                });
                return acc;
              }, [])
            : [],
          approval_outcome:
            item?.approval_outcome && typeof item.approval_outcome === 'object'
              ? item.approval_outcome as RuntimeRunMeta['approval_outcome']
              : null,
          evidence_items: Array.isArray(item?.evidence_items)
            ? item.evidence_items.reduce<NonNullable<RuntimeRunMeta['evidence_items']>>((acc, entry) => {
                if (!entry || typeof entry !== 'object') return acc;
                const record = entry as Record<string, unknown>;
                const label = String(record.label || '').trim();
                const value = String(record.value || '').trim();
                if (!label || !value) return acc;
                acc.push({
                  id: String(record.id || '').trim() || null,
                  label,
                  value,
                });
                return acc;
              }, [])
            : [],
          active_profile_id: String(item?.active_profile_id || '').trim() || null,
          active_profile_label: String(item?.active_profile_label || '').trim() || null,
          active_profile_provider: String(item?.active_profile_provider || '').trim() || null,
          active_profile_model: String(item?.active_profile_model || '').trim() || null,
          requested_provider: String(item?.requested_provider || '').trim() || null,
          effective_provider: String(item?.effective_provider || '').trim() || null,
          requested_model: String(item?.requested_model || '').trim() || null,
          effective_model: String(item?.effective_model || '').trim() || null,
          provider_overridden: typeof item?.provider_overridden === 'boolean' ? item.provider_overridden : undefined,
          model_overridden: typeof item?.model_overridden === 'boolean' ? item.model_overridden : undefined,
          fallback_used: typeof item?.fallback_used === 'boolean' ? item.fallback_used : undefined,
          graph_kind: String(item?.graph_kind || '').trim() || null,
          active_node_id: String(item?.active_node_id || '').trim() || null,
          final_node_id: String(item?.final_node_id || '').trim() || null,
          workflow_node_count: typeof item?.workflow_node_count === 'number' ? item.workflow_node_count : 0,
          node_state_counts:
            item?.node_state_counts && typeof item.node_state_counts === 'object'
              ? item.node_state_counts as Record<string, unknown>
              : null,
        });
      });
      setRuntimeRunMeta(metaByRunId);
      const backendExecutions = (Array.isArray(data) ? data : []).map((item) => ({
        ...item,
        source: 'backend' as const,
      }));
      setExecutions(backendExecutions);
    } catch (error) {
      setExecutions([]);
      setRuntimeRunMeta({});
      setLoadError(error instanceof Error ? error.message : `Cannot reach the backend API on ${API_BASE}.`);
    } finally {
      setLoading(false);
    }
  }

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
        title: `${runSummary.failed} task${runSummary.failed === 1 ? '' : 's'} need attention`,
        note: 'Start with blocked or failed work before launching anything new.',
      };
    }
    if (runSummary.running > 0) {
      return {
        title: `${runSummary.running} task${runSummary.running === 1 ? '' : 's'} in progress`,
        note: 'Live work is active now. Open a run below to review progress and results.',
      };
    }
    if (runSummary.recent > 0) {
      return {
        title: `${runSummary.recent} task${runSummary.recent === 1 ? '' : 's'} ran in the last 24 hours`,
        note: 'Recent work is ready to review below, with the result and timeline one click away.',
      };
    }
    return {
      title: 'No active work right now',
      note: 'The queue is quiet. Start a task or use the filters below to review past runs.',
    };
  }, [runSummary]);
  const executionLoadDetail = loadError ? humanizeUiError(loadError) : '';
  const showExecutionLoadDetail = Boolean(executionLoadDetail && executionLoadDetail !== UI_ERROR_COPY.backend);

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
        title="History"
        subtitle="Everything that has run and needs review"
        actions={
          <button className="orion-btn orion-btn-ghost" onClick={() => void loadExecutions()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <section className="orion-panel orion-runs-overview">
          <div className="orion-runs-overview-main">
          <div className="orion-home-overview-kicker">History overview</div>
          <div className="orion-runs-overview-title">{activeSummary.title}</div>
          <div className="orion-runs-overview-copy">{activeSummary.note}</div>
          <div className="orion-home-overview-actions">
            <Link href="/setup" className="btn-primary">
              <PlayCircle size={14} />
              New Task
            </Link>
            <Link href="/approvals" className="btn-secondary">
              <Eye size={14} />
              Approvals
            </Link>
            <Link href="/workflows" className="btn-secondary">
              Reusable workflows
            </Link>
          </div>
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
            <div className="orion-home-side-label">At a glance</div>
            <div className="orion-home-side-stats">
              <div>
                <div className="orion-home-side-value">{filteredExecutions.length}</div>
                <div className="orion-home-side-note">Visible now</div>
              </div>
              <div>
                <div className="orion-home-side-value">{channelOptions.length}</div>
                <div className="orion-home-side-note">Tools in use</div>
              </div>
            </div>
            <div className="orion-runs-overview-side-note">
              {runSummary.failed > 0
                ? 'Runs that need attention stay at the top so review starts where it matters.'
                : 'Use the filters below to isolate one task, assistant, tool, or run state.'}
            </div>
          </div>
        </aside>
      </section>

      <section className="orion-panel muted" style={{ display: 'grid', gap: 12 }}>
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="orion-panel-title">Find in History</div>
            <div className="orion-panel-copy">Search by task or run ID, then narrow by state, assistant, or tool.</div>
          </div>
        </div>
        <div className="orion-toolbar-grid">
          <div className="orion-toolbar-input-wrap orion-toolbar-grid-search">
            <Search size={14} className="icon" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input"
              placeholder="Search by task, workflow name, or run ID..."
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
            <option value="all">All assistants</option>
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
            <option value="all">All tools</option>
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
        <section className="orion-panel muted orion-state-panel">
          <div className="orion-state-icon" aria-hidden="true">
            <AlertCircle size={18} />
          </div>
          <div className="orion-panel-title">History is unavailable</div>
          <div className="orion-panel-copy">{UI_ERROR_COPY.backend}</div>
          {showExecutionLoadDetail ? (
            <div className="orion-panel-copy" style={{ marginTop: -4 }}>{executionLoadDetail}</div>
          ) : null}
          <div className="orion-state-actions">
            <button type="button" className="btn-secondary" onClick={() => void loadExecutions()}>
              <RefreshCw size={14} />
              Retry
            </button>
            <Link href="/" className="btn-primary">
              Open Chat
            </Link>
          </div>
        </section>
      ) : filteredExecutions.length === 0 ? (
        <section className="orion-empty">
          <div className="orion-empty-title">{executions.length === 0 ? 'No runs yet' : 'No runs match these filters'}</div>
          <div className="orion-empty-copy orion-empty-copy-spaced">
            {executions.length === 0
              ? 'Start one task to see progress, approvals, and outcomes here.'
              : 'Try another search or clear the current filters to see more runs.'}
          </div>
          <div className="orion-inline-actions">
            {executions.length === 0 ? (
              <Link href="/setup" className="btn-primary">
                Start a task
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
              <div className="orion-panel-title">Recent runs</div>
              <div className="orion-panel-copy">Open any run to review the result and decide what to do next.</div>
            </div>
          </div>
          {filteredExecutions.map((execution) => {
            const workflowName = execution.workflow?.name || execution.userGoal || 'Untitled Run';
            const status = statusMeta(execution.status);
            const runMeta = runtimeRunMeta[execution.id];
            const taskSummary = executionTaskSummary(execution);
            const stateNote = executionStateNote(execution);
            const bindingText = connectorBindingText(runMeta);
            const parentRunId = String(runMeta?.parent_run_id || '').trim();
            const childRunCount = Number(runMeta?.child_run_count || 0);
            const retryableFailedChildren = Number(runMeta?.delegation_summary?.retryable_failed_children || 0);
            const readyForMerge = Boolean(runMeta?.delegation_summary?.ready_for_merge || runMeta?.delegation_ready);
            const delegationNextAction = String(runMeta?.delegation_next_action || '').trim();
            const runtimeProfile = runtimeProfileText(runMeta);
            const workflowProgress = workflowProgressSummary(runMeta);
            const isOrchestrator = String(execution.workflow?.definition?.meta?.operator?.agentRole || '').trim() === 'orchestrator';
            const isRecent = isRecentExecution(execution);
            const routeLabel = startedFromLabel(execution, runMeta);
            const runChips = [
              isOrchestrator ? 'Coordinated' : null,
              isRecent ? 'Recent' : null,
            ].filter(Boolean);

            return (
              <article
                key={execution.id}
                className="orion-list-row orion-run-row"
              >
                <button
                  className="orion-btn orion-btn-ghost orion-run-row-trigger"
                  onClick={() => router.push(`/runs/${encodeURIComponent(execution.id)}`)}
                >
                  <div className="orion-run-row-body">
                    <div>
                      <div className="orion-list-row-title">{workflowName}</div>
                      <div className="orion-list-row-subtitle orion-run-id">
                        {execution.id}
                      </div>
                    </div>
                    <div className="orion-run-summary">{taskSummary}</div>
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
                      <span>Assistant {executionAgentRoleLabel(execution)}</span>
                      {bindingText ? <span>Tool {bindingText}</span> : null}
                      {runtimeProfile ? <span>{runtimeProfile}</span> : null}
                      {parentRunId ? <span>Part of {parentRunId.slice(0, 8)}</span> : null}
                      {!parentRunId && childRunCount > 0 ? <span>{childRunCount} linked task{childRunCount === 1 ? '' : 's'}</span> : null}
                    </div>
                    <div className="orion-run-note">{stateNote}</div>
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
                    {workflowProgress ? (
                      <div className="orion-run-note">
                        Workflow: {workflowProgress}
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
                        <div className="orion-run-stat-label">Started from</div>
                        <div className="orion-run-stat-value">{routeLabel}</div>
                      </div>
                    </div>
                  </div>

                  <div className="orion-run-actions">
                    <Link
                      className="orion-btn orion-btn-secondary orion-run-action-btn"
                      href={`/runs/${encodeURIComponent(execution.id)}`}
                    >
                      Open run
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
