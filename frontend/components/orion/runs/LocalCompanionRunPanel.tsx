'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { DESIGN_TOKENS, badgeStyle, bodyTextStyle, buttonStyle, mergeStyles, panelStyle, sectionTitleStyle } from '@/design-constraints';

type RunDiagnostics = {
  category?: string | null;
  summary?: string | null;
  local_target?: boolean;
  local_status?: string | null;
  local_last_heartbeat_at?: string | null;
} | null;

type RuntimeMachine = {
  runtime_id: string;
  display_name: string;
  capabilities: string[];
  status: string;
  online: boolean;
  note?: string | null;
  last_seen_at?: string | null;
};

type CapabilityQueueItem = {
  run_id?: string;
  waiting_state?: string;
  waiting_reason?: string;
  required_capabilities?: string[];
  missing_capabilities?: string[];
  busy_runtime_labels?: string[];
  queued_ahead_count?: number;
  estimated_wait_band?: string;
};

type RuntimeMachinesPayload = {
  summary?: {
    online?: number;
    busy?: number;
    pending_runs?: number;
    claimed_runs?: number;
  };
  capability_queue?: {
    online_capabilities?: string[];
    items?: CapabilityQueueItem[];
  };
  items?: RuntimeMachine[];
};

function formatTimestamp(value?: string | null): string {
  if (!value) return 'No heartbeat yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No heartbeat yet';
  return date.toLocaleString();
}

function formatLocalStatus(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Local state not recorded';
  if (normalized === 'waiting_for_runtime') return 'Waiting for the right machine';
  if (normalized === 'waiting_for_capacity') return 'Waiting for machine capacity';
  if (normalized === 'queued_local') return 'Queued for local machine';
  if (normalized === 'running_local') return 'Running on local machine';
  if (normalized === 'resuming_after_restart') return 'Queued to resume after restart';
  return normalized.replace(/_/g, ' ');
}

function machineLabel(machine: RuntimeMachine): string {
  return String(machine.display_name || machine.runtime_id || 'Machine').trim();
}

export function LocalCompanionRunPanel({
  runId,
  diagnostics,
  requiredCapabilities,
  missingCapabilities,
  busyRuntimeLabels,
}: {
  runId: string;
  diagnostics: RunDiagnostics;
  requiredCapabilities: string[];
  missingCapabilities: string[];
  busyRuntimeLabels: string[];
}) {
  const needsLocalDiagnostics = Boolean(
    diagnostics?.local_target
    || diagnostics?.local_status
    || requiredCapabilities.length > 0
    || missingCapabilities.length > 0
    || busyRuntimeLabels.length > 0,
  );
  const [payload, setPayload] = useState<RuntimeMachinesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!needsLocalDiagnostics) return;
    setLoading(true);
    setError('');
    try {
      await ensureControlPlaneSession();
      const response = await fetch('/api/runtime/machines', { cache: 'no-store' });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || 'Could not load local machine status.');
      }
      const nextPayload = await response.json().catch(() => null);
      setPayload((nextPayload && typeof nextPayload === 'object') ? (nextPayload as RuntimeMachinesPayload) : null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load local machine status.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [needsLocalDiagnostics]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = payload?.summary ?? {};
  const machines = useMemo(
    () => (Array.isArray(payload?.items) ? payload.items : []),
    [payload?.items],
  );
  const queueItems = useMemo(
    () => (Array.isArray(payload?.capability_queue?.items) ? payload?.capability_queue?.items : []),
    [payload?.capability_queue?.items],
  );
  const queueItem = queueItems.find((item) => String(item?.run_id || '').trim() === runId) || null;
  const onlineCapabilities = Array.isArray(payload?.capability_queue?.online_capabilities)
    ? payload?.capability_queue?.online_capabilities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  const onlineMachines = useMemo(
    () => machines.filter((item) => item && item.online),
    [machines],
  );
  const capableMachines = useMemo(() => {
    if (requiredCapabilities.length === 0) return onlineMachines;
    return onlineMachines.filter((machine) =>
      requiredCapabilities.every((capability) => machine.capabilities.includes(capability)),
    );
  }, [onlineMachines, requiredCapabilities]);
  const busyCapableMachines = useMemo(
    () => capableMachines.filter((machine) => String(machine.status || '').trim().toLowerCase() === 'busy'),
    [capableMachines],
  );
  const idleCapableMachines = useMemo(
    () => capableMachines.filter((machine) => String(machine.status || '').trim().toLowerCase() !== 'busy'),
    [capableMachines],
  );

  if (!needsLocalDiagnostics) return null;

  return (
    <div
      style={mergeStyles(panelStyle({ muted: true }), {
        marginTop: DESIGN_TOKENS.space[4],
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
      })}
    >
      <div style={mergeStyles(sectionTitleStyle(), { display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2] })}>
        <Cpu size={14} />
        Local companion diagnosis
      </div>
      <div style={bodyTextStyle()}>
        {String(queueItem?.waiting_reason || diagnostics?.summary || 'This run depends on a local companion machine.').trim()}
      </div>
      <div className="hekor-run-info-list">
        <div className="hekor-run-info-row">
          <span>Machine status</span>
          <strong>
            {loading
              ? 'Refreshing...'
              : `${Number(summary.online || 0)} online • ${Number(summary.busy || 0)} busy • ${Number(summary.pending_runs || 0)} queued`}
          </strong>
        </div>
        <div className="hekor-run-info-row">
          <span>This run</span>
          <strong>{formatLocalStatus(diagnostics?.local_status || queueItem?.waiting_state)}</strong>
        </div>
        <div className="hekor-run-info-row">
          <span>Last heartbeat</span>
          <strong>{formatTimestamp(diagnostics?.local_last_heartbeat_at)}</strong>
        </div>
        <div className="hekor-run-info-row">
          <span>Capable machines online</span>
          <strong>{String(capableMachines.length)}</strong>
        </div>
        {queueItem?.queued_ahead_count != null || queueItem?.estimated_wait_band ? (
          <div className="hekor-run-info-row">
            <span>Queue outlook</span>
            <strong>
              {Number(queueItem?.queued_ahead_count || 0) > 0
                ? `${Number(queueItem?.queued_ahead_count || 0)} ahead`
                : 'No similar runs ahead'}
              {queueItem?.estimated_wait_band ? ` • ${String(queueItem.estimated_wait_band)}` : ''}
            </strong>
          </div>
        ) : null}
      </div>

      {requiredCapabilities.length > 0 ? (
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
          <div style={{ ...bodyTextStyle('tertiary'), fontSize: DESIGN_TOKENS.type.size.caption }}>Required for this run</div>
          <div className="hekor-run-capability-row">
            {requiredCapabilities.map((item) => (
              <span key={`required:${item}`} style={badgeStyle('accent')}>{item}</span>
            ))}
          </div>
        </div>
      ) : null}

      {missingCapabilities.length > 0 ? (
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
          <div style={{ ...bodyTextStyle('tertiary'), fontSize: DESIGN_TOKENS.type.size.caption }}>Missing online now</div>
          <div className="hekor-run-capability-row">
            {missingCapabilities.map((item) => (
              <span key={`missing:${item}`} style={badgeStyle('warning')}>{item}</span>
            ))}
          </div>
        </div>
      ) : null}

      {busyCapableMachines.length > 0 || busyRuntimeLabels.length > 0 ? (
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
          <div style={{ ...bodyTextStyle('tertiary'), fontSize: DESIGN_TOKENS.type.size.caption }}>Busy capable machines</div>
          <div className="hekor-run-capability-row">
            {(busyCapableMachines.length > 0 ? busyCapableMachines.map(machineLabel) : busyRuntimeLabels).map((item) => (
              <span key={`busy:${item}`} style={badgeStyle('neutral')}>{item}</span>
            ))}
          </div>
        </div>
      ) : null}

      {idleCapableMachines.length > 0 ? (
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
          <div style={{ ...bodyTextStyle('tertiary'), fontSize: DESIGN_TOKENS.type.size.caption }}>Capable machines ready now</div>
          <div className="hekor-run-capability-row">
            {idleCapableMachines.slice(0, 6).map((machine) => (
              <span key={`ready:${machine.runtime_id}`} style={badgeStyle('success')}>{machineLabel(machine)}</span>
            ))}
          </div>
        </div>
      ) : null}

      {onlineCapabilities.length > 0 ? (
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
          <div style={{ ...bodyTextStyle('tertiary'), fontSize: DESIGN_TOKENS.type.size.caption }}>Capabilities online now</div>
          <div className="hekor-run-capability-row">
            {onlineCapabilities.slice(0, 10).map((item) => (
              <span key={`online-cap:${item}`} style={badgeStyle('neutral')}>{item}</span>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ color: DESIGN_TOKENS.color.danger, fontSize: DESIGN_TOKENS.type.size.caption }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} />
          {loading ? 'Refreshing…' : 'Refresh machine status'}
        </Button>
        <Link
          href="/machines"
          style={mergeStyles(
            { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
            buttonStyle({ tone: 'secondary', size: 'md' }),
          )}
        >
          Open machines
        </Link>
        <Link
          href="/health"
          style={mergeStyles(
            { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
            buttonStyle({ tone: 'secondary', size: 'md' }),
          )}
        >
          Open machine health
        </Link>
      </div>
    </div>
  );
}
