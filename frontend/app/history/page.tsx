'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Download, History, Loader2, Play, RefreshCw } from 'lucide-react';
import { AGENT_ROLE_OPTIONS, isAgentRoleId } from '../page.catalog';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

const ORION_API_URL = process.env.NEXT_PUBLIC_ORION_API_URL || 'http://127.0.0.1:8001';
const ORION_API_KEY = process.env.NEXT_PUBLIC_ORION_API_KEY || '';

type HistoryItem = {
  run_id: string;
  engine?: string;
  status?: string;
  created_at?: string;
  completed_at?: string;
  duration_ms?: number;
  time_to_first_value_ms?: number;
  hitl_wait_total_ms?: number;
  workflow_id?: string | null;
  workspace_id?: string | null;
  pack_id?: string | null;
  trust_mode?: string | null;
  execution_target_requested?: string | null;
  execution_target_selected?: string | null;
  execution_target_reason?: string | null;
  execution_target_fallback?: string | null;
  user_goal?: string | null;
  result_summary?: string | null;
  usage_provider?: string | null;
  usage_model?: string | null;
  usage_total_tokens_est?: number | null;
  usage_cost_band?: string | null;
  agent_role?: string | null;
  connector_binding?: {
    channel?: string | null;
    label?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null;
};

type ReplayEvent = {
  ts?: string;
  level?: string;
  event?: string;
  message?: string;
  data?: unknown;
};

type ReplayItem = HistoryItem & {
  context?: Record<string, unknown>;
  usage_masked?: Record<string, unknown>;
  result_data?: Record<string, unknown>;
  replay_request?: Record<string, unknown>;
  events?: ReplayEvent[];
};

function formatMs(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return '--';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatTokens(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '--';
  return value.toLocaleString();
}

function shortId(id?: string | null): string {
  if (!id) return '--';
  return id.slice(0, 8);
}

function formatDate(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

function statusMeta(status?: string): {
  label: string;
  color: string;
  border: string;
  bg: string;
} {
  const value = String(status || 'unknown').toLowerCase();

  if (value === 'completed') {
    return {
      label: 'Completed',
      color: 'var(--success-fg)',
      border: '1px solid var(--success-border)',
      bg: 'var(--success-bg)',
    };
  }

  if (value === 'running' || value === 'starting') {
    return {
      label: 'Running',
      color: 'var(--primary-base)',
      border: '1px solid var(--primary-border-soft)',
      bg: 'var(--primary-soft)',
    };
  }

  if (value === 'waiting_for_input' || value === 'waiting') {
    return {
      label: 'Waiting',
      color: 'var(--warning-fg)',
      border: '1px solid var(--warning-border)',
      bg: 'var(--warning-bg)',
    };
  }

  if (value === 'failed' || value === 'error' || value === 'timeout') {
    return {
      label: 'Failed',
      color: 'var(--error-fg)',
      border: '1px solid var(--error-border)',
      bg: 'var(--error-bg)',
    };
  }

  return {
    label: value.toUpperCase(),
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    bg: 'var(--bg-element)',
  };
}

function historyAgentLabel(roleId?: string | null): string {
  const value = String(roleId || '').trim();
  if (!isAgentRoleId(value)) return '--';
  return AGENT_ROLE_OPTIONS.find((item) => item.id === value)?.label || value;
}

function connectorBindingText(
  binding?: {
    channel?: string | null;
    label?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null,
): string {
  if (!binding) return '';
  const parts = [
    String(binding.channel || '').trim(),
    String(binding.identity_label || binding.label || '').trim(),
    String(binding.routing_scope || '').trim(),
  ].filter(Boolean);
  return parts.join(' · ');
}

function connectorChannelValue(
  binding?: {
    channel?: string | null;
  } | null,
): string {
  return String(binding?.channel || '').trim().toLowerCase();
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [selected, setSelected] = useState<ReplayItem | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [reRunBusy, setReRunBusy] = useState(false);

  const buildHeaders = useCallback((withJson = false): HeadersInit => {
    const headers = new Headers();
    if (withJson) headers.set('Content-Type', 'application/json');
    const key = readRuntimeApiKeyFromStorage(ORION_API_KEY);
    if (key) headers.set('X-API-Key', key);
    return headers;
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusParam = selectedStatus === 'all' ? '' : `&status=${encodeURIComponent(selectedStatus)}`;
      const res = await fetch(`${ORION_API_URL}/history/runs?limit=100${statusParam}`, {
        headers: buildHeaders(false),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to load run history.');
      }
      const payload = await res.json();
      const nextItems = Array.isArray(payload?.items) ? payload.items : [];
      setItems(nextItems as HistoryItem[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load run history.');
    } finally {
      setLoading(false);
    }
  }, [buildHeaders, selectedStatus]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const openReplay = useCallback(
    async (runId: string) => {
      setReplayLoading(true);
      setReplayError(null);
      try {
        const res = await fetch(`${ORION_API_URL}/runs/${runId}/replay`, {
          headers: buildHeaders(false),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || 'Failed to load replay.');
        }
        const payload = await res.json();
        const item = payload?.item;
        if (!item || typeof item !== 'object') {
          throw new Error('Replay payload is invalid.');
        }
        setSelected(item as ReplayItem);
      } catch (e: unknown) {
        setReplayError(e instanceof Error ? e.message : 'Failed to load replay.');
      } finally {
        setReplayLoading(false);
      }
    },
    [buildHeaders],
  );

  const rerunFromReplay = useCallback(async () => {
    if (!selected?.run_id) return;
    setReRunBusy(true);
    setReplayError(null);
    try {
      const res = await fetch(`${ORION_API_URL}/runs/${selected.run_id}/replay`, {
        method: 'POST',
        headers: buildHeaders(true),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to start replay run.');
      }
      const payload = await res.json();
      const nextRunId = typeof payload?.run_id === 'string' ? payload.run_id : null;
      await loadHistory();
      if (nextRunId) {
        await openReplay(nextRunId);
      }
    } catch (e: unknown) {
      setReplayError(e instanceof Error ? e.message : 'Failed to start replay run.');
    } finally {
      setReRunBusy(false);
    }
  }, [buildHeaders, loadHistory, openReplay, selected?.run_id]);

  const exportReplay = useCallback(() => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orion-replay-${selected.run_id || 'run'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [selected]);

  const statusOptions = useMemo(
    () => ['all', 'completed', 'failed', 'timeout', 'running', 'waiting_for_input'],
    [],
  );
  const summary = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc.total += 1;
          const value = String(item.status || '').toLowerCase();
          if (value === 'completed') acc.completed += 1;
          else if (value === 'waiting_for_input' || value === 'waiting') acc.waiting += 1;
          else if (value === 'failed' || value === 'error' || value === 'timeout') acc.failed += 1;
          return acc;
        },
        { total: 0, completed: 0, waiting: 0, failed: 0 },
      ),
    [items],
  );

  const channelOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      const channel = connectorChannelValue(item.connector_binding);
      if (channel) values.add(channel);
    });
    return Array.from(values).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesAgent = selectedAgent === 'all' || String(item.agent_role || '').trim() === selectedAgent;
      const matchesChannel =
        selectedChannel === 'all' || connectorChannelValue(item.connector_binding) === selectedChannel;
      return matchesAgent && matchesChannel;
    });
  }, [items, selectedAgent, selectedChannel]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<History size={18} />}
        title="History"
        subtitle="Replay archive and rerun trail."
        meta={
          !loading && items.length > 0 ? (
            <>
              <span>{filteredItems.length} visible</span>
              <span>{items.length} total</span>
            </>
          ) : undefined
        }
        actions={
          <button className="orion-btn orion-btn-ghost" onClick={() => void loadHistory()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <section className="orion-panel">
        <div className="orion-toolbar">
          <div className="orion-toolbar-group">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="input"
            style={{ height: 38, borderRadius: 10, width: 170 }}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'All statuses' : status}
              </option>
            ))}
          </select>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="input"
            style={{ height: 38, borderRadius: 10, width: 170 }}
          >
            <option value="all">All agents</option>
            {AGENT_ROLE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="input"
            style={{ height: 38, borderRadius: 10, width: 170 }}
          >
            <option value="all">All channels</option>
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
          </div>
        </div>
      </section>

      {!loading && filteredItems.length > 0 ? (
        <MetricStrip
          minWidth={118}
          items={[
            { label: 'Runs', value: summary.total },
            { label: 'Completed', value: summary.completed },
            { label: 'Waiting', value: summary.waiting },
            { label: 'Failed', value: summary.failed },
          ]}
        />
      ) : null}

      {error && (
        <section
          className="orion-panel"
          style={{
            borderColor: 'var(--error-border)',
            background: 'var(--error-bg)',
            color: 'var(--error-fg)',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
        </section>
      )}

      {loading ? (
        <section className="orion-panel muted orion-surface-lift" style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Loading run history...
          </div>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="orion-empty">
          <div className="orion-empty-title">{items.length === 0 ? 'No runs yet' : 'No runs match these filters'}</div>
          <div className="orion-empty-copy">
            {items.length === 0 ? 'Completed runs will appear here.' : 'Change the agent, channel, or status filters.'}
          </div>
        </section>
      ) : (
        <section className="orion-list">
          {filteredItems.map((item) => {
            const status = statusMeta(item.status);
            const bindingText = connectorBindingText(item.connector_binding);
            return (
              <article
                key={item.run_id}
                className="orion-list-row orion-surface-lift"
                onClick={() => void openReplay(item.run_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    void openReplay(item.run_id);
                  }
                }}
              >
                <div className="orion-list-row-main" style={{ gap: 6 }}>
                  <div className="orion-list-row-title" style={{ fontFamily: 'var(--font-mono)' }}>
                    {shortId(item.run_id)}
                  </div>
                  <div className="orion-list-row-subtitle">{item.result_summary || 'No summary'}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Clock3 size={11} />
                      {formatDate(item.created_at)}
                    </span>
                    <span>Agent {historyAgentLabel(item.agent_role)}</span>
                    {bindingText ? <span>Channel {bindingText}</span> : null}
                    <span>Duration {formatMs(item.duration_ms)}</span>
                    <span>Pack {item.pack_id || '--'}</span>
                    <span>
                      Route {(item.execution_target_selected || '--').toString()}
                      {item.execution_target_fallback ? ' (fallback)' : ''}
                    </span>
                    <span>
                      {(item.usage_provider || '--').toString()} / {(item.usage_model || '--').toString()}
                    </span>
                    <span>Tokens {formatTokens(item.usage_total_tokens_est)}</span>
                    <span>Cost {item.usage_cost_band || '--'}</span>
                  </div>
                </div>

                <div className="orion-toolbar-group" onClick={(event) => event.stopPropagation()}>
                  <span
                    className="orion-chip"
                    style={{ border: status.border, background: status.bg, color: status.color }}
                  >
                    {status.label}
                  </span>
                  <button className="orion-btn orion-btn-ghost" onClick={() => void openReplay(item.run_id)}>
                    Inspect
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {selected && (
        <div className="orion-modal-overlay" onClick={() => setSelected(null)}>
          <section
            className="orion-modal"
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(940px, 96vw)', maxHeight: '88vh', overflow: 'auto' }}
          >
            <header className="orion-panel-header" style={{ marginBottom: 0 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>Execution Replay</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  run_id: {selected.run_id}
                </div>
              </div>
              <div className="orion-toolbar-group">
                <button className="orion-btn orion-btn-ghost" onClick={exportReplay}>
                  <Download size={14} />
                  Export
                </button>
                <button className="orion-btn orion-btn-primary" onClick={() => void rerunFromReplay()} disabled={reRunBusy}>
                  {reRunBusy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
                  {reRunBusy ? 'Starting...' : 'Rerun'}
                </button>
                <button className="orion-btn" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            </header>

            {replayLoading ? (
              <div style={{ padding: 22, color: 'var(--text-tertiary)' }}>Loading replay...</div>
            ) : (
              <>
                {replayError && (
                  <div
                    style={{
                      borderRadius: 10,
                      border: '1px solid var(--error-border)',
                      background: 'var(--error-bg)',
                      color: 'var(--error-fg)',
                      padding: '10px 12px',
                      fontSize: 12,
                    }}
                  >
                    {replayError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                  <div className="orion-panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Status</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>{selected.status || '--'}</div>
                  </div>
                  <div className="orion-panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Pack</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>{selected.pack_id || '--'}</div>
                  </div>
                  <div className="orion-panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Agent</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>{historyAgentLabel(selected.agent_role)}</div>
                  </div>
                  <div className="orion-panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Duration</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>{formatMs(selected.duration_ms)}</div>
                  </div>
                  <div className="orion-panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Time-to-first-value</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                      {formatMs(selected.time_to_first_value_ms)}
                    </div>
                  </div>
                  <div className="orion-panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Provider / model</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                      {String(
                        (selected.usage_masked?.provider as string | undefined) || selected.usage_provider || '--',
                      )}
                      {' / '}
                      {String(
                        (selected.usage_masked?.model as string | undefined) || selected.usage_model || '--',
                      )}
                    </div>
                  </div>
                  <div className="orion-panel" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Tokens / cost</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                      {formatTokens(
                        (selected.usage_masked?.total_tokens_est as number | undefined) ||
                          selected.usage_total_tokens_est,
                      )}
                      {' / '}
                      {String(
                        (selected.usage_masked?.cost_band as string | undefined) || selected.usage_cost_band || '--',
                      )}
                    </div>
                  </div>
                </div>

                <div className="orion-panel" style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {selected.result_summary || 'No summary available.'}
                </div>

                <div className="orion-panel" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Routing</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Requested: {String(selected.execution_target_requested || '--')}
                    <br />
                    Selected: {String(selected.execution_target_selected || '--')}
                    <br />
                    Reason: {String(selected.execution_target_reason || '--')}
                    <br />
                    Fallback: {String(selected.execution_target_fallback || 'none')}
                    <br />
                    Channel: {connectorBindingText(selected.connector_binding) || '--'}
                  </div>
                </div>

                <div className="orion-log" style={{ maxHeight: 360 }}>
                  {(selected.events || []).length === 0 ? (
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>No event timeline available.</div>
                  ) : (
                    (selected.events || []).map((event, index) => {
                      const lvl = String(event.level || 'info').toLowerCase();
                      const color = lvl === 'error' ? 'var(--error-fg)' : lvl === 'warn' ? 'var(--warning-fg)' : 'var(--primary-base)';
                      return (
                        <div
                          key={`${event.ts || index}-${index}`}
                          className="orion-log-entry"
                          style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ color, fontSize: 11, fontWeight: 700 }}>
                              {String(event.event || 'event').toUpperCase()}
                            </span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                              {event.ts ? new Date(event.ts).toLocaleTimeString() : '--'}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{String(event.message || '')}</div>
                        </div>
                      );
                    })
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
