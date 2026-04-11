'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Cpu, Laptop, PauseCircle, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import DoctorPreflightNotice from '@/components/orion/DoctorPreflightNotice';
import { PageDialog } from '@/components/orion/page/PageDialog';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { Button } from '@/components/ui/button';
import { ApiError, fetchRuntimeMachines, hardKillMachine } from '@/lib/api';
import { fetchDoctorRunGate, type DoctorRunGateDecision } from '@/lib/doctorPreflight';

type RuntimeMachine = {
  tenant_id?: string;
  workspace_id?: string;
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
  current_lease_holder?: string | null;
  last_seen_at?: string | null;
  registered_at?: string | null;
  last_registered_at?: string | null;
  note?: string | null;
  enrollment_state?: string | null;
  enrollment_requested_at?: string | null;
  enrollment_updated_at?: string | null;
  bootstrap_error?: string | null;
  machine_enrollment_scope?: string | null;
  permission_probe?: Record<string, {
    status?: string | null;
    source?: string | null;
    detail?: string | null;
    updated_at?: string | null;
  }>;
  permission_probe_updated_at?: string | null;
  control_state?: string | null;
  control_state_updated_at?: string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  safe_mode_status?: {
    active?: boolean;
    scope?: string | null;
    reason?: string | null;
  };
  kill_switch_status?: {
    active?: boolean;
    scope?: string | null;
    reason?: string | null;
  };
};

type RuntimeMachinesPayload = {
  scope?: string;
  summary?: {
    known?: number;
    online?: number;
    busy?: number;
    idle?: number;
    offline?: number;
    suspended?: number;
    revoked?: number;
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

type MachineEnrollmentIntent = {
  machine_id: string;
  token: string;
  runtime_url: string;
  worker_config: {
    worker_id: string;
    runtime_type: string;
    display_name: string;
    execution_targets: string[];
    policy_mode: string;
  };
};

type DesktopBridge = {
  desktop?: boolean;
  bootstrapMachineEnrollment?: (intent: MachineEnrollmentIntent) => Promise<unknown>;
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
  const controlState = String(machine.control_state || '').trim().toLowerCase();
  if (controlState === 'revoked') return 'red';
  if (controlState === 'suspended') return 'yellow';
  const enrollmentState = String(machine.enrollment_state || '').trim().toLowerCase();
  if (enrollmentState === 'failed') return 'red';
  if (enrollmentState && enrollmentState !== 'healthy') return 'yellow';
  if (machine.online && machine.status === 'busy') return 'yellow';
  if (machine.online) return 'green';
  if (machine.status === 'offline') return 'red';
  return 'grey';
}

function enrollmentLabel(machine: RuntimeMachine): string {
  const controlState = String(machine.control_state || '').trim().toLowerCase();
  if (controlState === 'revoked') return 'Revoked';
  if (controlState === 'suspended') return 'Suspended';
  const state = String(machine.enrollment_state || '').trim().toLowerCase();
  if (!state || state === 'healthy') {
    return machine.online ? (machine.status === 'busy' ? 'Busy' : 'Online') : 'Offline';
  }
  if (state === 'awaiting_local_acceptance') return 'Waiting for desktop';
  if (state === 'installing') return 'Installing';
  if (state === 'starting') return 'Starting';
  if (state === 'registering') return 'Registering';
  if (state === 'failed') return 'Failed';
  return state;
}

function hasPendingEnrollment(machine: RuntimeMachine): boolean {
  return ['requested', 'awaiting_local_acceptance', 'installing', 'starting', 'registering'].includes(
    String(machine.enrollment_state || '').trim().toLowerCase(),
  );
}

function permissionTone(status?: string | null): 'green' | 'yellow' | 'red' | 'grey' {
  const token = String(status || '').trim().toLowerCase();
  if (token === 'granted') return 'green';
  if (token === 'denied') return 'red';
  if (token === 'unknown') return 'yellow';
  return 'grey';
}

function formatPermissionStatus(status?: string | null): string {
  const token = String(status || '').trim().toLowerCase();
  if (token === 'granted') return 'Granted';
  if (token === 'denied') return 'Denied';
  if (token === 'unknown') return 'Pending probe';
  if (token === 'unsupported') return 'Not available';
  return 'Unknown';
}

function policySummary(policy?: { active?: boolean; scope?: string | null; reason?: string | null }): string {
  if (!policy?.active) return 'Normal';
  const scope = String(policy.scope || '').trim();
  const reason = String(policy.reason || '').trim();
  if (scope && reason) return `${scope} · ${reason}`;
  if (scope) return scope;
  if (reason) return reason;
  return 'Active';
}

export default function MachinesPage() {
  const [payload, setPayload] = useState<RuntimeMachinesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doctorDecision, setDoctorDecision] = useState<DoctorRunGateDecision | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [revokingMachineId, setRevokingMachineId] = useState<string | null>(null);
  const [controllingMachineId, setControllingMachineId] = useState<string | null>(null);
  const [hardKillingMachineId, setHardKillingMachineId] = useState<string | null>(null);
  const [hardKillTarget, setHardKillTarget] = useState<RuntimeMachine | null>(null);
  const [enrollMessage, setEnrollMessage] = useState('');
  const modalPortalTarget = typeof document !== 'undefined' ? document.body : null;

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

  useEffect(() => {
    const hasPending = (payload?.items ?? []).some((machine) => hasPendingEnrollment(machine));
    if (!hasPending) return undefined;
    const timer = window.setInterval(() => {
      void loadMachines();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadMachines, payload]);

  const handleEnroll = useCallback(async () => {
    setEnrolling(true);
    setError('');
    setEnrollMessage('');
    try {
      const nextOrdinal = (payload?.summary?.known ?? payload?.items?.length ?? 0) + 1;
      const response = await fetch('/api/machines/enrollment-intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runtime_type: 'local_companion',
          display_name: `Empyralist Machine ${nextOrdinal}`,
          execution_targets: ['local_companion'],
          note: 'Enrolled from Machines UI',
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((body as { detail?: string } | null)?.detail || 'Unable to enroll a machine.');
      }
      const intent = body as MachineEnrollmentIntent;
      await loadMachines();
      const bridge = typeof window !== 'undefined'
        ? (window as Window & { empyralisDesktop?: DesktopBridge }).empyralisDesktop
        : undefined;
      if (bridge?.desktop && typeof bridge.bootstrapMachineEnrollment === 'function') {
        setEnrollMessage('Installing local worker...');
        await bridge.bootstrapMachineEnrollment(intent);
        setEnrollMessage('Local worker installed and running.');
      } else {
        setEnrollMessage('Open the Empyralis desktop app on this machine to finish enrollment.');
      }
      await loadMachines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enroll a machine.');
    } finally {
      setEnrolling(false);
    }
  }, [loadMachines, payload?.items?.length, payload?.summary?.known]);

  const handleRevoke = useCallback(async (machineId: string) => {
    const normalized = String(machineId || '').trim();
    if (!normalized) return;
    setRevokingMachineId(normalized);
    setError('');
    setEnrollMessage('');
    try {
      const response = await fetch(`/api/machines/${encodeURIComponent(normalized)}`, {
        method: 'DELETE',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((body as { detail?: string } | null)?.detail || 'Unable to revoke this machine.');
      }
      setEnrollMessage('Machine revoked. Active local work will pause before the next action and new leases are blocked.');
      await loadMachines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke this machine.');
    } finally {
      setRevokingMachineId(null);
    }
  }, [loadMachines]);

  const handleControl = useCallback(async (machineId: string, action: 'suspend' | 'resume') => {
    const normalized = String(machineId || '').trim();
    if (!normalized) return;
    setControllingMachineId(normalized);
    setError('');
    setEnrollMessage('');
    try {
      const response = await fetch(`/api/machines/${encodeURIComponent(normalized)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: action === 'suspend' ? 'Suspended from fleet controls.' : 'Resumed from fleet controls.',
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((body as { detail?: string } | null)?.detail || `Unable to ${action} this machine.`);
      }
      setEnrollMessage(action === 'suspend' ? 'Machine suspended. New leases are blocked and active local work will pause.' : 'Machine resumed and ready for new local work.');
      await loadMachines();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} this machine.`);
    } finally {
      setControllingMachineId(null);
    }
  }, [loadMachines]);

  const handleHardKillMachine = useCallback(async () => {
    const machineId = String(hardKillTarget?.runtime_id || '').trim();
    if (!machineId) return;
    setHardKillingMachineId(machineId);
    setError('');
    setEnrollMessage('');
    try {
      await hardKillMachine(machineId, 'Hard interrupt requested from fleet controls.');
      setEnrollMessage('Hard interrupt requested. Active work on this machine is being terminated immediately.');
      setHardKillTarget(null);
      await loadMachines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to hard kill this machine.');
    } finally {
      setHardKillingMachineId(null);
    }
  }, [hardKillTarget?.runtime_id, loadMachines]);

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

  useEffect(() => {
    if (!hardKillTarget) return;
    const matchingMachine = machines.find((machine) => machine.runtime_id === hardKillTarget.runtime_id) || null;
    if (!matchingMachine) {
      setHardKillTarget(null);
      return;
    }
    const controlState = String(matchingMachine.control_state || '').trim().toLowerCase();
    if (controlState === 'interrupting' || controlState === 'revoked' || !matchingMachine.online) {
      setHardKillTarget(null);
    }
  }, [hardKillTarget, machines]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Runtime overview"
        title={machines.length > 0 ? `${summary.online ?? 0} machine${(summary.online ?? 0) === 1 ? '' : 's'} online` : 'No machines registered yet'}
        copy={
          machines.length > 0
            ? 'Monitor every registered runtime that can execute work for Platform. Local and headless execution both flow through this machine registry.'
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
            <button type="button" className="orion-btn orion-btn-primary" onClick={() => void handleEnroll()} disabled={enrolling}>
              <Laptop size={14} />
              {enrolling ? 'Installing...' : 'Enroll machine'}
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
          <div className="orion-machines-kpi-card">
            <div className="orion-machines-kpi-label">Suspended</div>
            <div className="orion-machines-kpi-value">{summary.suspended ?? 0}</div>
          </div>
          <div className="orion-machines-kpi-card">
            <div className="orion-machines-kpi-label">Revoked</div>
            <div className="orion-machines-kpi-value">{summary.revoked ?? 0}</div>
          </div>
        </div>
      </section>

      {enrollMessage ? <div className="orion-page-state-detail">{enrollMessage}</div> : null}

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
              : 'Install or start the local runtime on this device. Once it appears here, Platform can run work locally when needed.'
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
            <button type="button" className="btn-primary" onClick={() => void handleEnroll()} disabled={enrolling}>
              {enrolling ? 'Installing...' : 'Enroll machine'}
            </button>
          </div>
          {enrollMessage ? <div className="orion-page-state-detail">{enrollMessage}</div> : null}
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
          copy="Platform is ready for runtimes, but no local or headless machine has registered yet."
          actions={
            <>
              <button type="button" className="btn-primary" onClick={() => void handleEnroll()} disabled={enrolling}>
                {enrolling ? 'Installing...' : 'Enroll machine'}
              </button>
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
                  {enrollmentLabel(machine)}
                </span>
              </div>

              <div className="orion-machine-card-meta">
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Enrollment</span>
                  <span className="orion-machine-meta-value">
                    {enrollmentLabel(machine)}
                    {machine.bootstrap_error ? ` · ${machine.bootstrap_error}` : ''}
                  </span>
                </div>
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
                  <span className="orion-machine-meta-label">Control</span>
                  <span className="orion-machine-meta-value">
                    {String(machine.control_state || 'active').trim().toLowerCase() === 'revoked'
                      ? `Revoked${machine.revoked_reason ? ` · ${machine.revoked_reason}` : ''}`
                      : String(machine.control_state || 'active').trim().toLowerCase() === 'suspended'
                        ? `Suspended${machine.suspended_reason ? ` · ${machine.suspended_reason}` : ''}`
                        : 'Active'}
                  </span>
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
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Lease holder</span>
                  <span className="orion-machine-meta-value">{machine.current_lease_holder || 'None'}</span>
                </div>
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Safe mode</span>
                  <span className="orion-machine-meta-value">{policySummary(machine.safe_mode_status)}</span>
                </div>
                <div className="orion-machine-meta-row">
                  <span className="orion-machine-meta-label">Kill switch</span>
                  <span className="orion-machine-meta-value">{policySummary(machine.kill_switch_status)}</span>
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

              <div className="orion-machine-card-section">
                <div className="orion-machine-section-label">Permissions</div>
                <div className="orion-machine-card-meta">
                  {[
                    ['screen_recording', 'Screen recording'],
                    ['accessibility', 'Accessibility'],
                    ['browser_session', 'Browser / session'],
                    ['shell', 'Shell'],
                  ].map(([permissionKey, label]) => {
                    const entry = machine.permission_probe?.[permissionKey];
                    return (
                      <div key={`${machine.runtime_id}-${permissionKey}`} className="orion-machine-meta-row">
                        <span className="orion-machine-meta-label">{label}</span>
                        <span className="orion-machine-meta-value">
                          <span className="orion-chip" data-status-tone={permissionTone(entry?.status)}>
                            {formatPermissionStatus(entry?.status)}
                          </span>
                          {entry?.detail ? ` · ${entry.detail}` : ''}
                        </span>
                      </div>
                    );
                  })}
                  {machine.permission_probe_updated_at ? (
                    <div className="orion-machine-meta-row">
                      <span className="orion-machine-meta-label">Permission probe</span>
                      <span className="orion-machine-meta-value">{formatTimestamp(machine.permission_probe_updated_at)}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {machine.note ? <div className="orion-machine-card-note">{machine.note}</div> : null}

              <div className="orion-inline-actions" style={{ marginTop: 14 }}>
                {String(machine.control_state || '').trim().toLowerCase() === 'suspended' ? (
                  <button
                    type="button"
                    className="orion-btn orion-btn-ghost"
                    onClick={() => void handleControl(machine.runtime_id, 'resume')}
                    disabled={controllingMachineId === machine.runtime_id}
                  >
                    <Play size={14} />
                    {controllingMachineId === machine.runtime_id ? 'Resuming...' : 'Resume'}
                  </button>
                ) : String(machine.control_state || '').trim().toLowerCase() !== 'revoked' ? (
                  <button
                    type="button"
                    className="orion-btn orion-btn-ghost"
                    onClick={() => void handleControl(machine.runtime_id, 'suspend')}
                    disabled={controllingMachineId === machine.runtime_id}
                  >
                    <PauseCircle size={14} />
                    {controllingMachineId === machine.runtime_id ? 'Suspending...' : 'Suspend'}
                  </button>
                ) : null}
                {machine.online && !['interrupting', 'revoked'].includes(String(machine.control_state || '').trim().toLowerCase()) ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setHardKillTarget(machine)}
                    disabled={hardKillingMachineId === machine.runtime_id}
                  >
                    {hardKillingMachineId === machine.runtime_id ? 'Interrupting...' : 'Kill Machine'}
                  </Button>
                ) : null}
                <button
                  type="button"
                  className="orion-btn orion-btn-ghost"
                  onClick={() => void handleRevoke(machine.runtime_id)}
                  disabled={String(machine.control_state || '').trim().toLowerCase() === 'revoked' || revokingMachineId === machine.runtime_id}
                >
                  {revokingMachineId === machine.runtime_id ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      <PageDialog
        open={Boolean(hardKillTarget)}
        portalTarget={modalPortalTarget}
        title="Kill Machine"
        onClose={() => {
          if (!hardKillingMachineId) setHardKillTarget(null);
        }}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setHardKillTarget(null)} disabled={Boolean(hardKillingMachineId)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleHardKillMachine()} disabled={Boolean(hardKillingMachineId)}>
              {hardKillingMachineId ? 'Interrupting...' : 'Confirm Kill Machine'}
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            This sends an immediate hard interrupt to <strong>{hardKillTarget?.display_name || hardKillTarget?.runtime_id || 'this machine'}</strong> and terminates any active work as quickly as the runtime can enforce it.
          </div>
          <div>
            Runtime: <strong>{hardKillTarget?.runtime_id || 'Unknown'}</strong>
          </div>
          <div>
            Status: <strong>{hardKillTarget ? enrollmentLabel(hardKillTarget) : 'Unknown'}</strong>
          </div>
        </div>
      </PageDialog>
      {enrollMessage && !error ? <div className="orion-page-state-detail">{enrollMessage}</div> : null}
    </div>
  );
}
