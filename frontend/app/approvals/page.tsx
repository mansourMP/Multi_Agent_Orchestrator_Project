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
  requestedAt: string | null;
  expiresAt: string | null;
  correlationId: string | null;
  labels: string[];
  capabilities: string[];
  agentRole?: string | null;
  agentLabel?: string | null;
  connectorText?: string;
  taskSummary?: string | null;
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
  user_goal?: string | null;
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

function approvalSensitivitySignal(row: PendingApproval): { label: string; tone: 'default' | 'warning' } | null {
  const signals = [...row.labels, ...row.capabilities]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  if (signals.length === 0) return null;
  const joined = signals.join(' ');
  if (/(send|outbound|calendar|crm|email|message|follow|booking|publish|write)/.test(joined)) {
    return { label: 'Sensitivity signal: Elevated', tone: 'warning' };
  }
  return { label: 'Sensitivity signal: Review', tone: 'default' };
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [runtimeKey, setRuntimeKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [audit, setAudit] = useState<ApprovalAudit[]>([]);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
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
      const [pendingRes, historyRes, auditRes] = await Promise.all([
        fetch(`${ORION_API_URL}/approvals?limit=40&workspace_id=default`, { headers }),
        fetch(`${ORION_API_URL}/history/runs?limit=40&workspace_id=default`, { headers }),
        fetch(`${ORION_API_URL}/approvals/audit?limit=30`, { headers }),
      ]);

      const pendingPayload = pendingRes.ok ? await pendingRes.json() : null;
      const historyPayload = historyRes.ok ? await historyRes.json() : null;
      const auditPayload = auditRes.ok ? await auditRes.json() : null;

      const historyItems = Array.isArray(historyPayload?.items) ? (historyPayload.items as HistoryRunItem[]) : [];
      const historyByRunId = historyItems.reduce<Record<string, HistoryRunItem>>((acc, item) => {
        const runId = String(item?.run_id || '').trim();
        if (runId) acc[runId] = item;
        return acc;
      }, {});
      const pendingItemsRaw: unknown[] = Array.isArray((pendingPayload as { items?: unknown[] } | null)?.items)
        ? ((pendingPayload as { items: unknown[] }).items)
        : [];
      const nextPending = pendingItemsRaw.reduce<PendingApproval[]>((acc, item: unknown) => {
        const record = item as Record<string, unknown>;
        const runId = String(record?.run_id || '').trim();
        const approvalId = String(record?.approval_id || '').trim();
        if (!runId || !approvalId) return acc;
        const historyItem = historyByRunId[runId];
        const agentRole = String(record?.agent_role || historyItem?.agent_role || '').trim() || null;
        acc.push({
          runId,
          approvalId,
          prompt: String(record?.prompt || 'Approval requested.').trim() || 'Approval requested.',
          status: String(record?.status || 'waiting'),
          requestedAt: String(record?.requested_at || '').trim() || null,
          expiresAt: String(record?.expires_at || '').trim() || null,
          correlationId: String(record?.correlation_id || '').trim() || null,
          labels: Array.isArray(record?.labels)
            ? record.labels.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [],
          capabilities: Array.isArray(record?.capabilities)
            ? record.capabilities.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [],
          agentRole,
          agentLabel: agentRoleLabel(agentRole),
          connectorText: connectorBindingText(historyItem?.connector_binding || null),
          taskSummary: String(historyItem?.user_goal || '').trim() || null,
        });
        return acc;
      }, []);

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

  const renderPendingCard = (row: PendingApproval, featured = false) => {
    const approveKey = `${row.runId}:${row.approvalId}:Proceed`;
    const holdKey = `${row.runId}:${row.approvalId}:Hold`;
    const busy = Boolean(actionBusy[approveKey] || actionBusy[holdKey]);
    const tone = toneForLabel(row.status);
    const sensitivity = approvalSensitivitySignal(row);

    return (
      <article
        key={`${row.runId}:${row.approvalId}${featured ? ':featured' : ''}`}
        className={`orion-panel hekor-approval-card${featured ? ' is-featured' : ''}`.trim()}
      >
        <div className="hekor-approval-card-head">
          <div className="hekor-approval-card-copy">
            <div className="hekor-approval-card-kicker">Approval needed</div>
            <div className="hekor-approval-card-title">{compactText(row.prompt, 'Approval requested.', featured ? 260 : 220)}</div>
            {row.taskSummary ? (
              <div className="hekor-approval-card-summary">Task: {compactText(row.taskSummary, row.taskSummary, 180)}</div>
            ) : null}
          </div>
          <div className="hekor-approval-card-badges">
            <span
              className="hekor-approval-badge"
              style={{ color: tone.color, border: tone.border, background: tone.background }}
            >
              {formatDecisionLabel(row.status)}
            </span>
            {sensitivity ? (
              <span className={`hekor-approval-badge${sensitivity.tone === 'warning' ? ' is-warning' : ''}`.trim()}>
                {sensitivity.label}
              </span>
            ) : null}
          </div>
        </div>

        <div className="hekor-approval-card-grid">
          <div className="hekor-approval-detail">
            <span>Tool and account</span>
            <strong>{row.connectorText || 'No tool or account is recorded yet.'}</strong>
          </div>
          <div className="hekor-approval-detail">
            <span>Requested</span>
            <strong>{fmtTime(row.requestedAt)}</strong>
          </div>
          <div className="hekor-approval-detail">
            <span>Expires</span>
            <strong>{fmtTime(row.expiresAt)}</strong>
          </div>
          <div className="hekor-approval-detail">
            <span>Audit trail</span>
            <strong>
              run {row.runId.slice(0, 8)} · approval {row.approvalId.slice(0, 8)}
            </strong>
          </div>
        </div>

        <div className="hekor-approval-card-chip-row">
          {row.agentLabel && row.agentLabel !== '--' ? <span className="orion-chip">{row.agentLabel}</span> : null}
          {row.connectorText ? <span className="orion-chip">{row.connectorText}</span> : null}
          {row.correlationId ? <span className="orion-chip">Trace {row.correlationId}</span> : null}
        </div>

        {/* The current approval payload does not include a structured change preview or
            authoritative risk field, so this card stays within prompt, tool context,
            and conservative review signals derived from labels/capabilities. */}
        {row.labels.length > 0 || row.capabilities.length > 0 ? (
          <div className="hekor-approval-signals">
            <div className="hekor-approval-signals-title">Review signals</div>
            <div className="hekor-approval-card-chip-row">
              {row.labels.map((item) => (
                <span key={`${row.approvalId}:label:${item}`} className="orion-chip">{item}</span>
              ))}
              {row.capabilities.map((item) => (
                <span key={`${row.approvalId}:capability:${item}`} className="orion-chip">{item}</span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="hekor-approval-card-actions">
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => void resolveApproval(row, 'Proceed')}
          >
            <Check size={12} />
            Approve
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => void resolveApproval(row, 'Hold')}
          >
            Hold
          </button>
          <button
            className="btn-secondary"
            onClick={() => router.push(`/runs/${encodeURIComponent(row.runId)}`)}
          >
            <ExternalLink size={12} />
            Review full context
          </button>
        </div>
      </article>
    );
  };

  const renderAuditCard = (item: ApprovalAudit) => {
    const tone = toneForLabel(item.decision);
    return (
      <article key={item.id} className="orion-panel hekor-approval-audit-card">
        <div className="hekor-approval-audit-head">
          <div>
            <div className="hekor-approval-audit-title">{item.stage || 'Approval stage'}</div>
            <div className="hekor-approval-audit-meta">{fmtTime(item.ts)} · {item.actor || 'system'}</div>
          </div>
          <span
            className="hekor-approval-badge"
            style={{ color: tone.color, border: tone.border, background: tone.background }}
          >
            {formatDecisionLabel(item.decision)}
          </span>
        </div>

        <div className="hekor-approval-card-chip-row">
          {item.agentLabel && item.agentLabel !== '--' ? <span className="orion-chip">{item.agentLabel}</span> : null}
          {item.connectorText ? <span className="orion-chip">{item.connectorText}</span> : null}
          {item.runId ? <span className="orion-chip">Run {item.runId.slice(0, 8)}</span> : null}
        </div>

        <div className="hekor-approval-audit-note">{compactText(item.note || 'No note recorded.', 'No note recorded.', 200)}</div>

        <div className="hekor-approval-card-actions">
          {item.runId ? (
            <button
              className="btn-secondary"
              onClick={() => router.push(`/runs/${encodeURIComponent(item.runId || '')}`)}
            >
              Review run
            </button>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<ClipboardCheck size={18} />}
        title="Approvals"
        subtitle="Review actions before Hekor continues."
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

      <section className="orion-panel muted hekor-approvals-filters">
        <div className="orion-panel-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="orion-panel-title">Filter approvals</div>
            <div className="orion-panel-copy">Narrow the list by worker or channel, then review the actions that are waiting.</div>
          </div>
        </div>
        <div className="orion-toolbar">
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

      {leadPending ? (
        <section className="hekor-approval-section">
          <div className="orion-panel-title">Needs review now</div>
          <div className="orion-panel-copy">This is the next approval blocking work.</div>
          {renderPendingCard(leadPending, true)}
        </section>
      ) : (
        <section className="orion-panel">
          <div className="orion-panel-title">
            {pending.length === 0 ? 'Nothing needs approval right now' : 'No approvals match these filters'}
          </div>
          <div className="orion-panel-copy">
            {pending.length === 0
              ? 'New approval requests will appear here when a run pauses for review.'
              : 'Change the filters to see the approvals that match this view.'}
          </div>
        </section>
      )}

      {filteredPending.length > 1 ? (
        <section className="hekor-approval-section">
          <div className="orion-panel-title">More approvals waiting</div>
          <div className="orion-panel-copy">Review these after the current top request.</div>
          <div className="hekor-approval-card-list">
            {filteredPending.slice(1).map((row) => renderPendingCard(row))}
          </div>
        </section>
      ) : null}

      <section className="hekor-approval-section">
        <div className="orion-panel-title">Recent decisions</div>
        <div className="orion-panel-copy">Audit trail for approved and held actions.</div>
        {filteredAudit.length === 0 ? (
          <section className="orion-panel">
            <div className="orion-panel-copy">
              {audit.length === 0 ? 'No approval history is recorded yet.' : 'No history items match these filters.'}
            </div>
          </section>
        ) : (
          <div className="hekor-approval-audit-list">
            {filteredAudit.slice(0, 40).map((item) => renderAuditCard(item))}
          </div>
        )}
      </section>
    </div>
  );
}
