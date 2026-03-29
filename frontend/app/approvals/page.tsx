'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, RefreshCw } from 'lucide-react';
import { AGENT_ROLE_OPTIONS, isAgentRoleId } from '../page.catalog';
import { PageFilterBar } from '@/components/orion/page/PageFilterBar';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { MetricStrip } from '@/components/ui/MetricStrip';

type PendingApproval = {
  runId: string;
  approvalId: string;
  prompt: string;
  status: string;
  scope: string;
  reusable: boolean;
  consequence?: string | null;
  actions: string[];
  target?: string | null;
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
  if (normalized === 'proceed' || normalized === 'approved') return 'Confirmed';
  if (normalized === 'hold' || normalized === 'reject' || normalized === 'declined') return 'Declined';
  if (normalized === 'blocked' || normalized === 'denied' || normalized === 'escalated') return 'Blocked by policy';
  if (normalized === 'waiting' || normalized === 'waiting_for_input') return 'Confirmation required';
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
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [audit, setAudit] = useState<ApprovalAudit[]>([]);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureControlPlaneSession();
      const overviewRes = await fetch('/api/approvals/overview', { cache: 'no-store' });
      const overviewPayload = await overviewRes.json().catch(() => null);
      if (!overviewRes.ok) {
        const detail =
          overviewPayload && typeof overviewPayload.detail === 'string' && overviewPayload.detail.trim()
            ? overviewPayload.detail.trim()
            : 'Failed to load confirmations.';
        throw new Error(detail);
      }

      const overviewRecord =
        overviewPayload && typeof overviewPayload === 'object'
          ? (overviewPayload as {
              pending?: { items?: unknown[] } | null;
              history?: { items?: unknown[] } | null;
              audit?: { items?: unknown[] } | null;
            })
          : {};
      const pendingPayload = overviewRecord.pending ?? null;
      const historyPayload = overviewRecord.history ?? null;
      const auditPayload = overviewRecord.audit ?? null;

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
          prompt: String(record?.prompt || 'Confirmation required.').trim() || 'Confirmation required.',
          status: String(record?.status || 'waiting'),
          scope: String(record?.scope || 'once').trim().toLowerCase() || 'once',
          reusable: Boolean(record?.reusable),
          consequence: String(record?.consequence || '').trim() || null,
          actions: Array.isArray(record?.actions)
            ? record.actions.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [],
          target: String(record?.target || '').trim() || null,
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
      const message = nextError instanceof Error ? nextError.message : 'Failed to load confirmations.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveApproval = useCallback(
    async (row: PendingApproval, decision: 'Proceed' | 'Hold') => {
      const key = `${row.runId}:${row.approvalId}:${decision}`;
      setActionBusy((prev) => ({ ...prev, [key]: true }));
      try {
        await ensureControlPlaneSession();
        const res = await fetch('/api/approvals/resolve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            runId: row.runId,
            approvalId: row.approvalId,
            decision,
            note: 'Resolved from confirmations inbox',
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            payload && typeof payload.detail === 'string' && payload.detail.trim()
              ? payload.detail.trim()
              : 'Confirmation action failed.',
          );
        }
        await refresh();
      } catch (nextError: unknown) {
        const message = nextError instanceof Error ? nextError.message : 'Confirmation action failed.';
        setError(message);
      } finally {
        setActionBusy((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [refresh],
  );

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
  const latestDecision = filteredAudit[0] ?? audit[0] ?? null;

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
            <div className="hekor-approval-card-kicker">Confirmation required</div>
            <div className="hekor-approval-card-title">{compactText(row.prompt, 'Confirmation required.', featured ? 260 : 220)}</div>
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
            <span>Action</span>
            <strong>{row.actions.join(', ') || 'Not recorded'}</strong>
          </div>
          <div className="hekor-approval-detail">
            <span>Target</span>
            <strong>{row.target || 'Not recorded'}</strong>
          </div>
          <div className="hekor-approval-detail">
            <span>Scope</span>
            <strong>{row.scope === 'once' ? 'One-time for this pending step' : row.scope}</strong>
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
              run {row.runId.slice(0, 8)} · confirmation {row.approvalId.slice(0, 8)}
            </strong>
          </div>
        </div>

        <div className="hekor-approval-detail" style={{ marginTop: 12 }}>
          <span>Consequence</span>
          <strong>{row.consequence || 'This confirmation applies only to this pending step in this run.'}</strong>
        </div>

        <div className="hekor-approval-card-chip-row">
          {row.agentLabel && row.agentLabel !== '--' ? <span className="orion-chip">{row.agentLabel}</span> : null}
          {row.connectorText ? <span className="orion-chip">{row.connectorText}</span> : null}
          {row.correlationId ? <span className="orion-chip">Trace {row.correlationId}</span> : null}
        </div>

        {/* The current confirmation payload does not include a structured change preview or
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
            Confirm once
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => void resolveApproval(row, 'Hold')}
          >
            Decline
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
            <div className="hekor-approval-audit-title">{item.stage || 'Confirmation stage'}</div>
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
      <PageHero
        kicker="Confirmations"
        title="Review the next blocked step before Hekor continues."
        copy="Focus on the next blocking confirmation first, then clear the rest of the queue with the same decision rules."
        actions={
          <button className="orion-btn" onClick={() => void refresh()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
        aside={
          <>
            <PageHeroCard label="Current queue">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{filteredPending.length}</div>
                  <div className="orion-home-side-note">Waiting now</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{approvalsNeedingAttention}</div>
                  <div className="orion-home-side-note">Held recently</div>
                </div>
              </div>
              <div className="orion-runs-overview-side-note">
                {leadPending ? 'One confirmation is currently blocking work.' : 'Nothing is blocking work right now.'}
              </div>
            </PageHeroCard>
            <PageHeroCard label="Latest decision">
              <div className="orion-home-side-empty">
                {latestDecision
                  ? `${formatDecisionLabel(latestDecision.decision)} · ${fmtTime(latestDecision.ts)}`
                  : 'No confirmation history yet.'}
              </div>
            </PageHeroCard>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Pending', value: String(filteredPending.length) },
          { label: 'History', value: String(filteredAudit.length) },
          { label: 'Agents', value: agentFilter === 'all' ? 'All' : agentRoleLabel(agentFilter) },
          { label: 'Channels', value: channelFilter === 'all' ? 'All' : channelFilter },
          { label: 'Declined', value: String(approvalsNeedingAttention) },
        ]}
      />

      {error ? (
        <PageStatePanel
          variant="error"
          title="Confirmations refresh failed"
          copy={error}
          actions={
            <button type="button" className="orion-btn" onClick={() => void refresh()}>
              Retry
            </button>
          }
        />
      ) : null}

      <PageFilterBar
        title="Filter confirmations"
        description="Narrow the queue by worker or channel, then review the blocking items in order."
        summary={
          <span className="orion-toolbar-summary">
            {loading ? 'Refreshing…' : `${filteredPending.length} pending · ${filteredAudit.length} history`}
          </span>
        }
        className="hekor-approvals-filters"
      >
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
          </div>
        </div>
      </PageFilterBar>

      {leadPending ? (
        <PageSection
          title="Needs review now"
          description="This is the next confirmation currently blocking work."
          className="hekor-approval-section"
        >
          {renderPendingCard(leadPending, true)}
        </PageSection>
      ) : (
        <PageStatePanel
          variant={pending.length === 0 ? 'empty' : 'filtered-empty'}
          title={pending.length === 0 ? 'Nothing needs confirmation right now' : 'No confirmations match these filters'}
          copy={
            pending.length === 0
              ? 'New confirmation requests will appear here when a run pauses for review.'
              : 'Change the filters to see the confirmations that match this view.'
          }
        />
      )}

      {filteredPending.length > 1 ? (
        <PageSection
          title="More confirmations waiting"
          description="Review these after the current top request."
          className="hekor-approval-section"
        >
          <div className="hekor-approval-card-list">
            {filteredPending.slice(1).map((row) => renderPendingCard(row))}
          </div>
        </PageSection>
      ) : null}

      <PageSection
        title="Recent decisions"
        description="Audit trail for approved and held actions."
        className="hekor-approval-section"
      >
        {filteredAudit.length === 0 ? (
          <PageStatePanel
            variant={audit.length === 0 ? 'empty' : 'filtered-empty'}
            title={audit.length === 0 ? 'No confirmation history yet' : 'No history items match these filters'}
            copy={audit.length === 0 ? 'Confirmed and declined actions will appear here once Hekor records them.' : 'Change the filters to see the decision history that matches this view.'}
          />
        ) : (
          <div className="hekor-approval-audit-list">
            {filteredAudit.slice(0, 40).map((item) => renderAuditCard(item))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
