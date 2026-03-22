'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ClipboardCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { AGENT_ROLE_OPTIONS, isAgentRoleId } from '../page.catalog';
import { API_BASE } from '@/lib/config';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';

const ORION_API_URL = API_BASE;

type PendingApproval = {
  runId: string;
  approvalId: string;
  prompt: string;
  status: string;
  expiresAt: string | null;
  agentRole?: string | null;
  agentLabel?: string | null;
  connectorText?: string;
};

type ApprovalAudit = {
  id: string;
  ts: string;
  stage: string;
  decision: string;
  actor: string;
  runId: string | null;
  note: string | null;
  agentRole?: string | null;
  agentLabel?: string | null;
  connectorText?: string;
};

type HistoryRunItem = {
  run_id: string;
  status?: string;
  agent_role?: string | null;
  connector_binding?: {
    channel?: string | null;
    label?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null;
};

function fmtTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function compactText(value?: string | null, fallback = '—', maxLength = 180): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatDecisionLabel(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Decision recorded';
  if (normalized === 'proceed' || normalized === 'approved') return 'Approved';
  if (normalized === 'hold') return 'Held';
  if (normalized === 'waiting' || normalized === 'waiting_for_input') return 'Waiting';
  return normalized.replace(/_/g, ' ');
}

function agentRoleLabel(roleId?: string | null): string {
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

function toneForLabel(value?: string | null): { color: string; border: string; background: string } {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'hold' || normalized === 'waiting' || normalized === 'waiting_for_input') {
    return { color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' };
  }
  if (normalized === 'proceed' || normalized === 'approved' || normalized === 'success' || normalized === 'completed') {
    return { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' };
  }
  return { color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-element)' };
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [runtimeKey, setRuntimeKey] = useState('replace-with-strong-key');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [audit, setAudit] = useState<ApprovalAudit[]>([]);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'audit'>('pending');
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  const headers = useMemo<HeadersInit>(() => {
    const next = new Headers();
    next.set('Content-Type', 'application/json');
    if (runtimeKey) next.set('X-API-Key', runtimeKey);
    return next;
  }, [runtimeKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, auditRes] = await Promise.all([
        fetch(`${ORION_API_URL}/history/runs?limit=40&workspace_id=default`, { headers }),
        fetch(`${ORION_API_URL}/approvals/audit?limit=30`, { headers }),
      ]);

      const historyPayload = historyRes.ok ? await historyRes.json() : null;
      const auditPayload = auditRes.ok ? await auditRes.json() : null;

      const historyItems = Array.isArray(historyPayload?.items) ? (historyPayload.items as HistoryRunItem[]) : [];
      const historyByRunId = historyItems.reduce<Record<string, HistoryRunItem>>((acc, item) => {
        const runId = String(item?.run_id || '').trim();
        if (runId) acc[runId] = item;
        return acc;
      }, {});
      const waitingRunIds = historyItems
        .filter((item: unknown) => String((item as Record<string, unknown>)?.status || '').toLowerCase() === 'waiting_for_input')
        .map((item: unknown) => String((item as Record<string, unknown>)?.run_id || '').trim())
        .filter(Boolean)
        .slice(0, 24);

      const pendingRows = await Promise.all(
        waitingRunIds.map(async (runId: string) => {
          try {
            const runRes = await fetch(`${ORION_API_URL}/runs/${encodeURIComponent(runId)}`, { headers });
            if (!runRes.ok) return null;
            const runPayload = await runRes.json().catch(() => null);
            const pendingApproval = runPayload?.pending_approval;
            if (!pendingApproval || typeof pendingApproval !== 'object') return null;
            const approvalId = String((pendingApproval as { approval_id?: unknown }).approval_id || '').trim();
            if (!approvalId) return null;
            const historyItem = historyByRunId[runId];
            return {
              runId,
              approvalId,
              prompt: String((pendingApproval as { prompt?: unknown }).prompt || 'Approval requested.').trim() || 'Approval requested.',
              status: String((pendingApproval as { status?: unknown }).status || 'waiting'),
              expiresAt: String((pendingApproval as { expires_at?: unknown }).expires_at || '').trim() || null,
              agentRole: String(runPayload?.agent_role || historyItem?.agent_role || '').trim() || null,
              agentLabel: agentRoleLabel(String(runPayload?.agent_role || historyItem?.agent_role || '').trim() || null),
              connectorText: connectorBindingText(
                (runPayload?.connector_binding as HistoryRunItem['connector_binding']) || historyItem?.connector_binding || null,
              ),
            } as PendingApproval;
          } catch {
            return null;
          }
        }),
      );

      const nextPending = pendingRows.filter((item): item is PendingApproval => item !== null);
      setPending(nextPending);

      const auditItemsRaw = Array.isArray(auditPayload?.items) ? auditPayload.items : [];
      const nextAudit = auditItemsRaw
        .map((item: unknown) => {
          const record = item as Record<string, unknown>;
          const id = String(record?.id || '').trim();
          const ts = String(record?.ts || '').trim();
          const stage = String(record?.stage || '').trim();
          if (!id || !ts || !stage) return null;
          return {
            id,
            ts,
            stage,
            decision: String(record?.decision || '').trim(),
            actor: String(record?.actor || '').trim(),
            runId: String(record?.run_id || '').trim() || null,
            note: String(record?.note || '').trim() || null,
            agentRole: String(
              (record?.run_id && historyByRunId[String(record.run_id)]?.agent_role) || '',
            ).trim() || null,
            agentLabel: agentRoleLabel(
              String((record?.run_id && historyByRunId[String(record.run_id)]?.agent_role) || '').trim() || null,
            ),
            connectorText: connectorBindingText(
              (record?.run_id && historyByRunId[String(record.run_id)]?.connector_binding) || null,
            ),
          } as ApprovalAudit;
        })
        .filter((item: ApprovalAudit | null): item is ApprovalAudit => item !== null);
      setAudit(nextAudit);
    } catch (nextError: unknown) {
      const message = nextError instanceof Error ? nextError.message : 'Failed to load approvals.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const resolveApproval = useCallback(
    async (row: PendingApproval, decision: 'Proceed' | 'Hold') => {
      const key = `${row.runId}:${row.approvalId}:${decision}`;
      setActionBusy((prev) => ({ ...prev, [key]: true }));
      try {
        const res = await fetch(
          `${ORION_API_URL}/runs/${encodeURIComponent(row.runId)}/approvals/${encodeURIComponent(row.approvalId)}/resolve`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ decision, note: 'Resolved from approvals inbox' }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || 'Approval action failed.');
        }
        await refresh();
      } catch (nextError: unknown) {
        const message = nextError instanceof Error ? nextError.message : 'Approval action failed.';
        setError(message);
      } finally {
        setActionBusy((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [headers, refresh],
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = readRuntimeApiKeyFromStorage('');
      if (stored && stored.trim()) setRuntimeKey(stored.trim());
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const channelOptions = useMemo(() => {
    const values = new Set<string>();
    [...pending, ...audit].forEach((item) => {
      const raw = String(item.connectorText || '').trim();
      if (!raw) return;
      const channel = raw.split('·')[0]?.trim().toLowerCase();
      if (channel) values.add(channel);
    });
    return Array.from(values).sort();
  }, [audit, pending]);

  const filteredPending = useMemo(() => {
    return pending.filter((row) => {
      const matchesAgent = agentFilter === 'all' || String(row.agentRole || '').trim() === agentFilter;
      const channel = String(row.connectorText || '').split('·')[0]?.trim().toLowerCase();
      const matchesChannel = channelFilter === 'all' || channel === channelFilter;
      return matchesAgent && matchesChannel;
    });
  }, [agentFilter, channelFilter, pending]);

  const filteredAudit = useMemo(() => {
    return audit.filter((row) => {
      const matchesAgent = agentFilter === 'all' || String(row.agentRole || '').trim() === agentFilter;
      const channel = String(row.connectorText || '').split('·')[0]?.trim().toLowerCase();
      const matchesChannel = channelFilter === 'all' || channel === channelFilter;
      return matchesAgent && matchesChannel;
    });
  }, [agentFilter, audit, channelFilter]);

  const approvalsNeedingAttention = useMemo(
    () => filteredAudit.filter((item) => String(item.decision || '').toLowerCase() === 'hold').length,
    [filteredAudit],
  );
  const leadPending = filteredPending[0] ?? null;
  const latestDecision = filteredAudit[0] ?? null;
  const pendingByAgent = useMemo(() => {
    const counts = filteredPending.reduce<Record<string, number>>((acc, row) => {
      const key = row.agentLabel && row.agentLabel !== '--' ? row.agentLabel : 'Unassigned';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [filteredPending]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<ClipboardCheck size={18} />}
        title="Approvals"
        subtitle="Needs permission."
        meta={
          <>
            <span>{filteredPending.length} pending</span>
            <span>{filteredAudit.length} in history</span>
          </>
        }
        actions={
          <button className="orion-btn orion-btn-ghost" onClick={() => void refresh()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <MetricStrip
        items={[
          { label: 'Pending', value: String(filteredPending.length) },
          { label: 'History', value: String(filteredAudit.length) },
          { label: 'Agents', value: agentFilter === 'all' ? 'All' : agentRoleLabel(agentFilter) },
          { label: 'Channels', value: channelFilter === 'all' ? 'All' : channelFilter },
          { label: 'On hold', value: String(approvalsNeedingAttention) },
        ]}
      />

      {error ? (
        <section className="orion-panel" style={{ borderColor: 'var(--error-border)', background: 'var(--error-bg)' }}>
          <div style={{ color: 'var(--error-fg)', fontSize: 12 }}>{error}</div>
        </section>
      ) : null}

      <section className="orion-grid-2">
        <article className="orion-panel">
          <div className="orion-panel-title">Next Decision</div>
          {leadPending ? (
            <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {leadPending.agentLabel && leadPending.agentLabel !== '--' ? <span className="orion-chip">{leadPending.agentLabel}</span> : null}
                {leadPending.connectorText ? <span className="orion-chip">Channel {leadPending.connectorText}</span> : null}
                <span className="orion-chip">Run {leadPending.runId.slice(0, 8)}</span>
              </div>
              <div style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                {compactText(leadPending.prompt, 'Approval requested.', 220)}
              </div>
              <div style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                <div>Status {formatDecisionLabel(leadPending.status)}</div>
                <div>Expires {fmtTime(leadPending.expiresAt)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="orion-btn orion-btn-success"
                  style={{ minHeight: 32, padding: '0 12px' }}
                  disabled={Boolean(actionBusy[`${leadPending.runId}:${leadPending.approvalId}:Proceed`]) || Boolean(actionBusy[`${leadPending.runId}:${leadPending.approvalId}:Hold`])}
                  onClick={() => void resolveApproval(leadPending, 'Proceed')}
                >
                  <Check size={12} />
                  Proceed
                </button>
                <button
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, padding: '0 12px' }}
                  disabled={Boolean(actionBusy[`${leadPending.runId}:${leadPending.approvalId}:Proceed`]) || Boolean(actionBusy[`${leadPending.runId}:${leadPending.approvalId}:Hold`])}
                  onClick={() => void resolveApproval(leadPending, 'Hold')}
                >
                  Hold
                </button>
                <button
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, padding: '0 12px' }}
                  onClick={() => router.push(`/runs/${encodeURIComponent(leadPending.runId)}/inspect?focus=approvals`)}
                >
                  <ExternalLink size={12} />
                  Open run
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>No decisions waiting</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Nothing is blocked on human approval right now.
              </div>
            </div>
          )}
        </article>

        <article className="orion-panel">
          <div className="orion-panel-title">Queue Snapshot</div>
          <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="orion-chip">{filteredPending.length} waiting</span>
              <span className="orion-chip">{approvalsNeedingAttention} held</span>
              <span className="orion-chip">{filteredAudit.length} in history</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Most affected lanes
              </div>
              {pendingByAgent.length > 0 ? pendingByAgent.map(([label, count]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-element)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{label}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{count} waiting</span>
                </div>
              )) : (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No lanes are currently blocked.</div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Latest recorded decision
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
                {latestDecision ? `${formatDecisionLabel(latestDecision.decision)} · ${latestDecision.stage || 'Approval stage'}` : 'No history yet'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {latestDecision
                  ? `${fmtTime(latestDecision.ts)} · ${compactText(latestDecision.note || latestDecision.actor || 'Decision recorded.', 'Decision recorded.', 120)}`
                  : 'Approved and held decisions will appear here after the first run pauses.'}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="orion-panel muted" style={{ display: 'grid', gap: 12 }}>
        <div className="orion-panel-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="orion-panel-title">Review decisions</div>
            <div className="orion-panel-copy">Switch between pending approvals and history, then narrow the list by worker or channel.</div>
          </div>
        </div>
        <div className="orion-toolbar">
          <div className="orion-toolbar-group">
            <button
              className={activeTab === 'pending' ? 'orion-btn orion-btn-primary' : 'orion-btn orion-btn-ghost'}
              onClick={() => setActiveTab('pending')}
              style={{ minHeight: 38 }}
            >
              Pending
              <span className="orion-chip" style={{ marginLeft: 4 }}>{filteredPending.length}</span>
            </button>
            <button
              className={activeTab === 'audit' ? 'orion-btn orion-btn-primary' : 'orion-btn orion-btn-ghost'}
              onClick={() => setActiveTab('audit')}
              style={{ minHeight: 38 }}
            >
              History
              <span className="orion-chip" style={{ marginLeft: 4 }}>{filteredAudit.length}</span>
            </button>
          </div>
          <div className="orion-toolbar-group">
            <select
              className="input"
              value={agentFilter}
              onChange={(event) => setAgentFilter(event.target.value)}
              style={{ height: 42, minWidth: 160, borderRadius: 11 }}
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
              style={{ height: 42, minWidth: 152, borderRadius: 11 }}
            >
              <option value="all">All channels</option>
              {channelOptions.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
            {loading ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</span> : null}
          </div>
        </div>
      </section>

      {activeTab === 'pending' ? (
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
              <div className="orion-panel-title">Pending approvals</div>
              <div className="orion-panel-copy">These runs are waiting for a human decision before they continue.</div>
            </div>
          </div>
          {filteredPending.length === 0 ? (
            <div style={{ padding: '16px 14px', display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
                {pending.length === 0 ? 'Nothing needs permission right now.' : 'No approvals match these filters.'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {pending.length === 0
                  ? `${filteredAudit.length} past decision${filteredAudit.length === 1 ? '' : 's'} available in History.`
                  : 'Change the filters or switch to History.'}
              </div>
            </div>
          ) : (
            <div>
              {filteredPending.map((row) => {
                const approveKey = `${row.runId}:${row.approvalId}:Proceed`;
                const holdKey = `${row.runId}:${row.approvalId}:Hold`;
                const busy = Boolean(actionBusy[approveKey] || actionBusy[holdKey]);
                const tone = toneForLabel(row.status);
                return (
                  <article
                    key={`${row.runId}:${row.approvalId}`}
                    className="orion-list-row"
                    style={{ padding: '14px 16px', alignItems: 'start', gap: 14, flexWrap: 'wrap' }}
                  >
                    <div style={{ minWidth: 0, flex: '1 1 460px', display: 'grid', gap: 6 }}>
                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            lineHeight: 1.45,
                          }}
                          title={row.prompt}
                        >
                          {compactText(row.prompt, 'Approval requested.', 220)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          run {row.runId.slice(0, 8)} · approval {row.approvalId.slice(0, 8)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.agentLabel && row.agentLabel !== '--' ? <span className="orion-chip">{row.agentLabel}</span> : null}
                        {row.connectorText ? <span className="orion-chip">Channel {row.connectorText}</span> : null}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 10, justifyItems: 'end', flex: '0 1 360px', minWidth: 280 }}>
                      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              minHeight: 24,
                              padding: '0 9px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              color: tone.color,
                              border: tone.border,
                              background: tone.background,
                            }}
                          >
                            {formatDecisionLabel(row.status)}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                          <div style={{ display: 'grid', gap: 3, justifyItems: 'end' }}>
                            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Expires</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{fmtTime(row.expiresAt)}</div>
                          </div>
                          <div style={{ display: 'grid', gap: 3, justifyItems: 'end' }}>
                            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Action</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>Human review</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          className="orion-btn orion-btn-success"
                          style={{ minHeight: 30, padding: '0 10px' }}
                          disabled={busy}
                          onClick={() => void resolveApproval(row, 'Proceed')}
                        >
                          <Check size={12} />
                          Approve
                        </button>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 30, padding: '0 10px' }}
                          disabled={busy}
                          onClick={() => void resolveApproval(row, 'Hold')}
                        >
                          Hold
                        </button>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 30, padding: '0 10px' }}
                          onClick={() => router.push(`/runs/${encodeURIComponent(row.runId)}/inspect?focus=approvals`)}
                        >
                          <ExternalLink size={12} />
                          Inspect
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
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
              <div className="orion-panel-title">Approval history</div>
              <div className="orion-panel-copy">Review past decisions and reopen the related run when you need more context.</div>
            </div>
          </div>
          {filteredAudit.length === 0 ? (
            <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
              {audit.length === 0 ? 'No approvals recorded yet.' : 'No approval history items match these filters.'}
            </div>
          ) : (
            <div>
              {filteredAudit.slice(0, 40).map((item) => {
                const tone = toneForLabel(item.decision);
                return (
                  <article
                    key={item.id}
                    className="orion-list-row"
                    style={{ padding: '14px 16px', alignItems: 'start', gap: 14, flexWrap: 'wrap' }}
                  >
                    <div style={{ minWidth: 0, flex: '1 1 460px', display: 'grid', gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{item.stage || 'Approval stage'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {fmtTime(item.ts)} · {item.actor || 'system'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {item.agentLabel && item.agentLabel !== '--' ? <span className="orion-chip">{item.agentLabel}</span> : null}
                        {item.connectorText ? <span className="orion-chip">Channel {item.connectorText}</span> : null}
                        {item.runId ? <span className="orion-chip">Run {item.runId.slice(0, 8)}</span> : null}
                      </div>
                      <div style={{ fontSize: 12, color: item.note ? 'var(--text-secondary)' : 'var(--text-tertiary)' }} title={item.note || ''}>
                        {compactText(item.note || 'No note recorded.', 'No note recorded.', 180)}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 10, justifyItems: 'end', flex: '0 1 240px', minWidth: 220 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 24,
                            padding: '0 9px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            color: tone.color,
                            border: tone.border,
                            background: tone.background,
                          }}
                        >
                          {formatDecisionLabel(item.decision)}
                        </span>
                      </div>
                      {item.runId ? (
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 30, padding: '0 10px' }}
                          onClick={() => router.push(`/runs/${encodeURIComponent(item.runId || '')}/inspect?focus=approvals`)}
                        >
                          Inspect
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
