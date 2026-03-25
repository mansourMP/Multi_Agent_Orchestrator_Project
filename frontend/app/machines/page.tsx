'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Cpu, Laptop, RefreshCw, Server, ShieldCheck, Workflow } from 'lucide-react';
import DoctorPreflightNotice from '@/components/orion/DoctorPreflightNotice';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { ApiError, fetchRuntimeMachines } from '@/lib/api';
import { fetchDoctorRunGate, type DoctorRunGateDecision } from '@/lib/doctorPreflight';

type RuntimeMachine = {
  runtime_id: string;
  runtime_type: string;
  display_name: string;
  platform?: string | null;
  capabilities: string[];
  execution_targets: string[];
  trust_state?: string | null;
  instance_id?: string | null;
  capability_digest?: string | null;
  session_issued_at?: string | null;
  status: string;
  online: boolean;
  current_task_id?: string | null;
  last_seen_at?: string | null;
  registered_at?: string | null;
  last_registered_at?: string | null;
  note?: string | null;
};

type RuntimeMachinesPayload = {
  scope?: string;
  summary?: {
    known?: number;
    online?: number;
    busy?: number;
    idle?: number;
    offline?: number;
    pending_runs?: number;
    claimed_runs?: number;
  };
  capability_queue?: {
    waiting_count?: number;
    online_capabilities?: string[];
    items?: Array<{
      run_id?: string;
      user_goal?: string;
      outcome_pack?: string;
      required_capabilities?: string[];
      missing_capabilities?: string[];
      waiting_state?: string;
      waiting_reason?: string;
      busy_runtime_labels?: string[];
      queued_ahead_count?: number;
      estimated_wait_band?: string;
    }>;
  };
  items?: RuntimeMachine[];
};

function formatRuntimeType(value: string): string {
  const token = String(value || '').trim().toLowerCase();
  if (!token) return 'Runtime';
  if (token === 'local') return 'Local runtime';
  if (token === 'headless') return 'Headless runtime';
  if (token === 'cloud') return 'Cloud runtime';
  return `${token.charAt(0).toUpperCase()}${token.slice(1)} runtime`;
}

function formatTimestamp(value?: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function relativeRuntimeTime(value?: string | null): string {
  if (!value) return 'No heartbeat yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No heartbeat yet';
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (deltaSeconds < 60) return 'Seen just now';
  if (deltaSeconds < 3600) return `Seen ${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `Seen ${Math.floor(deltaSeconds / 3600)}h ago`;
  return `Seen ${Math.floor(deltaSeconds / 86400)}d ago`;
}

function statusTone(machine: RuntimeMachine): 'green' | 'yellow' | 'red' | 'grey' {
  if (machine.online && machine.status === 'busy') return 'yellow';
  if (machine.online) return 'green';
  if (machine.status === 'offline') return 'red';
  return 'grey';
}

export default function MachinesPage() {
  const [payload, setPayload] = useState<RuntimeMachinesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doctorDecision, setDoctorDecision] = useState<DoctorRunGateDecision | null>(null);

  const loadMachines = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [next, doctorGate] = await Promise.all([
        fetchRuntimeMachines() as Promise<RuntimeMachinesPayload>,
        fetchDoctorRunGate({ executionTarget: 'auto' }),
      ]);
      setPayload(next);
      setDoctorDecision(doctorGate);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to load runtime machines.';
      setError(message);
      setPayload(null);
      setDoctorDecision(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMachines();
  }, [loadMachines]);

  const machines = useMemo(() => payload?.items ?? [], [payload]);
  const summary = payload?.summary ?? {};
  const capabilityQueue = payload?.capability_queue ?? {};
  const localMachineOnline = useMemo(
    () => machines.some((machine) => machine.online && ['local', 'local_companion'].includes(String(machine.runtime_type || '').trim().toLowerCase())),
    [machines],
  );
  const hasKnownMachines = (summary.known ?? 0) > 0 || machines.length > 0;
  const capabilityCount = useMemo(() => {
    const set = new Set<string>();
    machines.forEach((item) => {
      item.capabilities.forEach((capability) => {
        if (capability) set.add(capability);
      });
    });
    return set.size;
  }, [machines]);
  const capabilityWaitingItems = capabilityQueue.items ?? [];
  const capabilityWaitingCount = capabilityQueue.waiting_count ?? 0;
  const onlineCapabilities = capabilityQueue.online_capabilities ?? [];

  return (
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Runtime overview"
        title={machines.length > 0 ? `${summary.online ?? 0} machine${(summary.online ?? 0) === 1 ? '' : 's'} online` : 'No machines registered yet'}
        copy={
          machines.length > 0
            ? 'Monitor every registered runtime that can execute work for Hekor. Local and headless execution both flow through this machine registry.'
            : 'Install or start a runtime to unlock local or headless execution outside the browser.'
        }
        actions={
          <div className="orion-inline-actions">
            <Link href="/health" className="orion-btn orion-btn-ghost">
              <ShieldCheck size={14} />
              Health
            </Link>
            <button type="button" className="orion-btn orion-btn-ghost" onClick={() => void loadMachines()}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        }
        aside={
          <>
            <PageHeroCard label="Queue pressure">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{summary.pending_runs ?? 0}</div>
                  <div className="orion-home-side-note">Pending</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{summary.claimed_runs ?? 0}</div>
                  <div className="orion-home-side-note">Claimed</div>
                </div>
              </div>
              <div className="orion-runs-overview-side-note">
                Local companion jobs are already flowing through this bridge. Headless and cloud runtimes can use the same contract next.
              </div>
            </PageHeroCard>
            <DoctorPreflightNotice decision={doctorDecision} showWhenPass actionLabel="Open Health" />
          </>
        }
        className="orion-machines-overview"
      />

      <section className="orion-panel muted orion-machines-kpi-panel">
        <div className="orion-machines-kpi-grid">
          <div className="orion-machines-kpi-card">
            <div className="orion-machines-kpi-label">Known</div>
            <div className="orion-machines-kpi-value">{summary.known ?? 0}</div>
          </div>
          <div className="orion-machines-kpi-card">
            <div className="orion-machines-kpi-label">Online</div>
            <div className="orion-machines-kpi-value">{summary.online ?? 0}</div>
          </div>
          <div className="orion-machines-kpi-card">
            <div className="orion-machines-kpi-label">Busy</div>
            <div className="orion-machines-kpi-value">{summary.busy ?? 0}</div>
          </div>
          <div className="orion-machines-kpi-card">
            <div className="orion-machines-kpi-label">Capabilities</div>
            <div className="orion-machines-kpi-value">{capabilityCount}</div>
          </div>
        </div>
      </section>

      {!loading && !error && localMachineOnline && capabilityWaitingCount > 0 ? (
        <PageSection
          title="Runs waiting on machine capabilities"
          description={`${capabilityWaitingCount} local run${capabilityWaitingCount === 1 ? '' : 's'} are queued because they are missing required capabilities or waiting for capacity on capable machines.`}
          className="orion-machines-capability-panel"
          muted
        >
          <div className="orion-machines-capability-list">
            {capabilityWaitingItems.map((item) => (
              <div key={item.run_id} className="orion-machines-capability-item">
                <div className="orion-machines-capability-item-head">
                  <div className="orion-machines-capability-item-title">
                    {String(item.user_goal || item.outcome_pack || item.run_id || 'Queued local run')}
                  </div>
                  {item.run_id ? (
                    <Link href={`/runs/${item.run_id}`} className="orion-inline-link">
                      Open run
                    </Link>
                  ) : null}
                </div>
                <div className="orion-machines-capability-row">
                  <span className="orion-machine-section-label">Why it is waiting</span>
                  <div className="orion-panel-copy">{String(item.waiting_reason || 'Waiting for a capable local machine.')}</div>
                </div>
                <div className="orion-machines-capability-row">
                  <span className="orion-machine-section-label">Required</span>
                  <div className="orion-machine-chip-row">
                    {(item.required_capabilities ?? []).map((capability) => (
                      <span key={`${item.run_id}-required-${capability}`} className="orion-chip" data-status-tone="grey">
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
                {(item.waiting_state || '') === 'capacity' ? (
                  <div className="orion-machines-capability-row">
                    <span className="orion-machine-section-label">Busy machines</span>
                    <div className="orion-machine-chip-row">
                      {(item.busy_runtime_labels ?? []).map((runtimeLabel) => (
                        <span key={`${item.run_id}-busy-${runtimeLabel}`} className="orion-chip" data-status-tone="yellow">
                          {runtimeLabel}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="orion-machines-capability-row">
                    <span className="orion-machine-section-label">Missing online now</span>
                    <div className="orion-machine-chip-row">
                      {(item.missing_capabilities ?? []).map((capability) => (
                        <span key={`${item.run_id}-missing-${capability}`} className="orion-chip" data-status-tone="red">
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(item.waiting_state || '') === 'capacity' ? (
                  <div className="orion-machines-capability-row">
                    <span className="orion-machine-section-label">Queue outlook</span>
                    <div className="orion-panel-copy">
                      {Number(item.queued_ahead_count || 0) > 0
                        ? `${Number(item.queued_ahead_count || 0)} similar local run${Number(item.queued_ahead_count || 0) === 1 ? ' is' : 's are'} ahead.`
                        : 'No similar local runs are ahead right now.'}
                      {typeof item.estimated_wait_band === 'string' && item.estimated_wait_band.trim()
                        ? ` Expected wait: ${String(item.estimated_wait_band).trim().toLowerCase()}.`
                        : ''}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="orion-machines-capability-footer">
            <div className="orion-machine-section-label">Online capability pool</div>
            <div className="orion-machine-chip-row">
              {onlineCapabilities.length > 0 ? (
                onlineCapabilities.map((capability) => (
                  <span key={`online-capability-${capability}`} className="orion-chip" data-status-tone="grey">
                    {capability}
                  </span>
                ))
              ) : (
                <span className="orion-machine-empty">No online machine capabilities reported yet.</span>
              )}
            </div>
          </div>
        </PageSection>
      ) : null}

      {!loading && !error && !localMachineOnline ? (
        <PageSection
          title={hasKnownMachines ? 'Bring a local machine online' : 'Connect this machine'}
          description={
            hasKnownMachines
              ? 'A runtime is registered, but no local machine is online right now. Bring one online to unlock local execution.'
              : 'Install or start the local runtime on this device. Once it appears here, Hekor can run work locally when needed.'
          }
          className="orion-machines-connect-panel"
          muted
        >
          <div className="orion-machines-connect-steps">
            <div className="orion-machines-connect-step">
              <div className="orion-machines-connect-step-index">1</div>
              <div>
                <div className="orion-machines-connect-step-title">Open Health</div>
                <div className="orion-machines-connect-step-copy">Check runtime health and start the local stack on this device if it is offline.</div>
              </div>
            </div>
            <div className="orion-machines-connect-step">
              <div className="orion-machines-connect-step-index">2</div>
              <div>
                <div className="orion-machines-connect-step-title">Confirm the machine appears here</div>
                <div className="orion-machines-connect-step-copy">Return to this page and make sure the machine shows as online before routing work locally.</div>
              </div>
            </div>
            <div className="orion-machines-connect-step">
              <div className="orion-machines-connect-step-index">3</div>
              <div>
                <div className="orion-machines-connect-step-title">Run with Local machine</div>
                <div className="orion-machines-connect-step-copy">Choose the Local machine route in Setup, Builder, or Workflows when work should stay on this device.</div>
              </div>
            </div>
          </div>

          <div className="orion-state-actions">
            <Link href="/health" className="btn-primary">
              Open Health
            </Link>
            <Link href="/setup" className="btn-secondary">
              New task
            </Link>
            <button type="button" className="btn-secondary" onClick={() => void loadMachines()}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </PageSection>
      ) : null}

      {loading ? (
        <PageStatePanel
          variant="loading"
          title="Loading machines..."
        />
      ) : error ? (
        <PageStatePanel
          variant="error"
          icon={<AlertCircle size={18} />}
          title="Machines are unavailable"
          copy={
            <>
              <span>The runtime registry could not be loaded right now. If the runtime is offline, bring it back up, then retry.</span>
              <span className="orion-page-state-detail">{error}</span>
            </>
          }
          actions={
            <>
              <button type="button" className="btn-secondary" onClick={() => void loadMachines()}>
                <RefreshCw size={14} />
                Retry
              </button>
              <Link href="/health" className="btn-primary">
                Open Health
              </Link>
            </>
          }
        />
      ) : machines.length === 0 ? (
        <PageStatePanel
          variant="empty"
          icon={<Cpu size={18} />}
          title="No machines registered"
          copy="Hekor is ready for runtimes, but no local or headless machine has registered yet."
          actions={
            <>
              <Link href="/setup" className="btn-primary">
                New task
              </Link>
              <Link href="/health" className="btn-secondary">
                Check runtime
              </Link>
            </>
          }
        />
      ) : (
        <section className="orion-machines-grid">
          {machines.map((machine) => (
            <article key={machine.runtime_id} className="orion-panel muted orion-machine-card">
              <div className="orion-machine-card-header">
                <div className="orion-machine-card-title-wrap">
                  <div className="orion-machine-card-title">{machine.display_name || machine.runtime_id}</div>
                  <div className="orion-machine-card-subtitle">
                    {formatRuntimeType(machine.runtime_type)}
                    {machine.platform ? ` · ${machine.platform}` : ''}
                  </div>
                </div>
                <span className="orion-chip" data-status-tone={statusTone(machine)}>
                  {machine.online ? (machine.status === 'busy' ? 'Busy' : 'Online') : 'Offline'}
                </span>
              </div>

              <div className="orion-machine-card-meta">
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Trust</span>
                  <span className="orion-machine-meta-value">
                    {String(machine.trust_state || '').trim() === 'verified' ? 'Verified session' : 'Unverified'}
                  </span>
                </div>
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Runtime ID</span>
                  <span className="orion-machine-meta-value">{machine.runtime_id}</span>
                </div>
                {machine.instance_id ? (
                  <div className="orion-machine-meta-row">
                    <span className="orion-machine-meta-label">Instance</span>
                    <span className="orion-machine-meta-value">{machine.instance_id}</span>
                  </div>
                ) : null}
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Heartbeat</span>
                  <span className="orion-machine-meta-value">{relativeRuntimeTime(machine.last_seen_at)}</span>
                </div>
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Registered</span>
                  <span className="orion-machine-meta-value">{formatTimestamp(machine.registered_at || machine.last_registered_at)}</span>
                </div>
                {machine.session_issued_at ? (
                  <div className="orion-machine-meta-row">
                    <span className="orion-machine-meta-label">Session issued</span>
                    <span className="orion-machine-meta-value">{formatTimestamp(machine.session_issued_at)}</span>
                  </div>
                ) : null}
                {machine.capability_digest ? (
                  <div className="orion-machine-meta-row">
                    <span className="orion-machine-meta-label">Capability digest</span>
                    <span className="orion-machine-meta-value">{machine.capability_digest}</span>
                  </div>
                ) : null}
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Current task</span>
                  <span className="orion-machine-meta-value">
                    {machine.current_task_id ? (
                      <Link href={`/runs/${machine.current_task_id}`} className="orion-inline-link">
                        {machine.current_task_id}
                      </Link>
                    ) : (
                      'Idle'
                    )}
                  </span>
                </div>
              </div>

              <div className="orion-machine-card-section">
                <div className="orion-machine-section-label">Execution targets</div>
                <div className="orion-machine-chip-row">
                  {(machine.execution_targets.length > 0 ? machine.execution_targets : ['local']).map((target) => (
                    <span key={target} className="orion-chip" data-status-tone="grey">
                      {target}
                    </span>
                  ))}
                </div>
              </div>

              <div className="orion-machine-card-section">
                <div className="orion-machine-section-label">Capabilities</div>
                <div className="orion-machine-chip-row">
                  {machine.capabilities.length > 0 ? (
                    machine.capabilities.map((capability) => (
                      <span key={capability} className="orion-chip" data-status-tone="grey">
                        {capability}
                      </span>
                    ))
                  ) : (
                    <span className="orion-machine-empty">No capability manifest reported yet.</span>
                  )}
                </div>
              </div>

              {machine.note ? (
                <div className="orion-machine-card-note">
                  <Workflow size={14} />
                  {machine.note}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
