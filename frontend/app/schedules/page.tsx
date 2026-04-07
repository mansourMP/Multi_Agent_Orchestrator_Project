'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { AGENT_ROLE_OPTIONS } from '@/app/page.catalog';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { ApiError, fetchWorkflows, type WorkflowRecordShape } from '@/lib/api';

type ScheduleItem = {
  id: string;
  name?: string;
  enabled?: boolean;
  cron?: string | null;
  timezone?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_run_id?: string | null;
  last_error?: string | null;
  run_request?: Record<string, unknown> | null;
  run_log?: Array<Record<string, unknown>>;
};

type ScheduleMode = 'cron' | 'interval';

const DEFAULT_WORKSPACE_ID = 'default';

function fmt(value?: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

function intervalHoursToCron(hours: number): string {
  const safe = Math.max(1, Math.min(24, Math.floor(hours || 1)));
  if (safe === 24) return '0 9 * * *';
  return `0 */${safe} * * *`;
}

export default function SchedulesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecordShape[]>([]);
  const [mode, setMode] = useState<ScheduleMode>('interval');
  const [name, setName] = useState('Daily follow-up');
  const [agentRole, setAgentRole] = useState('orchestrator');
  const [workflowId, setWorkflowId] = useState('');
  const [prompt, setPrompt] = useState('Review open work and send the next actions.');
  const [intervalHours, setIntervalHours] = useState('24');
  const [cron, setCron] = useState('0 9 * * *');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await ensureControlPlaneSession();
      const [scheduleRes, workflowRows] = await Promise.all([
        fetch(`/api/control-plane/schedules?workspace_id=${encodeURIComponent(DEFAULT_WORKSPACE_ID)}`, {
          cache: 'no-store',
        }),
        fetchWorkflows(DEFAULT_WORKSPACE_ID).catch(() => []),
      ]);
      const schedulePayload = await scheduleRes.json().catch(() => ({ items: [] }));
      if (!scheduleRes.ok) {
        throw new Error(String((schedulePayload as { detail?: string }).detail || 'Failed to load schedules.'));
      }
      const nextItems = Array.isArray((schedulePayload as { items?: unknown[] }).items)
        ? ((schedulePayload as { items: unknown[] }).items as ScheduleItem[])
        : [];
      setItems(nextItems);
      setWorkflows(Array.isArray(workflowRows) ? workflowRows : []);
    } catch (nextError) {
      setError(nextError instanceof ApiError || nextError instanceof Error ? nextError.message : 'Failed to load schedules.');
      setItems([]);
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upcomingItems = useMemo(
    () => items.filter((item) => item.next_run_at).sort((a, b) => String(a.next_run_at || '').localeCompare(String(b.next_run_at || ''))),
    [items],
  );
  const recentItems = useMemo(
    () => items.filter((item) => item.last_run_at || item.last_error).sort((a, b) => String(b.last_run_at || '').localeCompare(String(a.last_run_at || ''))),
    [items],
  );

  const handleCreate = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      await ensureControlPlaneSession();
      const effectiveCron = mode === 'cron' ? cron.trim() : intervalHoursToCron(Number(intervalHours));
      const response = await fetch('/api/control-plane/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Scheduled run',
          workspace_id: DEFAULT_WORKSPACE_ID,
          enabled: true,
          cron: effectiveCron,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          wake_mode: 'active',
          delivery: 'runtime',
          run_request: {
            workspace_id: DEFAULT_WORKSPACE_ID,
            agent_role: agentRole,
            user_goal: prompt.trim() || 'Run the scheduled task.',
            workflow_id: workflowId || undefined,
            metadata: {
              source: 'schedules_ui',
              workflow_id: workflowId || undefined,
            },
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload as { detail?: string } | null)?.detail || 'Failed to create schedule.');
      }
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to create schedule.');
    } finally {
      setSaving(false);
    }
  }, [agentRole, cron, intervalHours, load, mode, name, prompt, workflowId]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Schedules"
        title="Scheduled runs"
        copy="Create recurring runs against a prompt or workflow, then monitor what is queued next and what ran recently."
        actions={
          <button type="button" className="orion-btn orion-btn-ghost" onClick={() => void load()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      {error ? (
        <PageStatePanel
          variant="error"
          title="Schedule surface is unavailable"
          copy={error}
          actions={
            <button type="button" className="orion-btn orion-btn-ghost" onClick={() => void load()}>
              Retry
            </button>
          }
        />
      ) : null}

      <PageSection
        title="Create a scheduled run"
        description="Pick an agent, choose a workflow or a direct prompt, then decide whether this runs on a cron schedule or a simple interval."
      >
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Name</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Agent</span>
            <select className="input" value={agentRole} onChange={(event) => setAgentRole(event.target.value)}>
              {AGENT_ROLE_OPTIONS.map((role) => (
                <option key={role.id} value={role.id}>{role.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Workflow</span>
            <select className="input" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)}>
              <option value="">Prompt only</option>
              {workflows.map((workflow) => (
                <option key={String(workflow.id || '')} value={String(workflow.id || '')}>
                  {String(workflow.name || workflow.id || 'Untitled workflow')}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Mode</span>
            <select className="input" value={mode} onChange={(event) => setMode(event.target.value as ScheduleMode)}>
              <option value="interval">Interval</option>
              <option value="cron">Cron</option>
            </select>
          </label>
          {mode === 'interval' ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Every N hours</span>
              <input className="input" value={intervalHours} onChange={(event) => setIntervalHours(event.target.value)} />
            </label>
          ) : (
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Cron</span>
              <input className="input" value={cron} onChange={(event) => setCron(event.target.value)} />
            </label>
          )}
        </div>
        <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <span>Prompt</span>
          <textarea className="input" rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="orion-btn orion-btn-primary" onClick={() => void handleCreate()} disabled={saving}>
            <CalendarClock size={14} />
            {saving ? 'Creating…' : 'Create schedule'}
          </button>
        </div>
      </PageSection>

      {loading ? (
        <PageStatePanel variant="loading" title="Loading schedules…" />
      ) : (
        <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <PageSection
            title="Upcoming"
            description="The next runs currently planned by the scheduler."
          >
            {upcomingItems.length === 0 ? (
              <div className="orion-panel-copy">No upcoming schedules yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {upcomingItems.map((item) => (
                  <article key={item.id} className="orion-panel muted">
                    <div style={{ fontWeight: 700 }}>{item.name || item.id}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                      Next run {fmt(item.next_run_at)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {item.cron || 'No cron recorded'} · {item.timezone || 'UTC'}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </PageSection>

          <PageSection
            title="Recent"
            description="Last observed runs and errors from the schedule log."
          >
            {recentItems.length === 0 ? (
              <div className="orion-panel-copy">No recent scheduled runs yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recentItems.map((item) => (
                  <article key={item.id} className="orion-panel muted">
                    <div style={{ fontWeight: 700 }}>{item.name || item.id}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                      Last run {fmt(item.last_run_at)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: item.last_error ? 'var(--warning-fg)' : 'var(--text-tertiary)' }}>
                      {item.last_error || (item.last_run_id ? `Run ${item.last_run_id}` : 'No recent issues')}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </PageSection>
        </section>
      )}
    </div>
  );
}
