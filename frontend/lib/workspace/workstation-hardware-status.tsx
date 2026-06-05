'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Gauge, Monitor, Settings, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { joinClassNames } from '@/lib/ui/primitives';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import type { WorkspaceBootstrapRuntimeTarget } from '@/lib/workspace/workspace-bootstrap';

type HardwareNativeRuntime = {
  os: string;
  arch: string;
  release: string;
  hostname: string;
  desktopSession: string;
  systemServiceMode: boolean;
};

type HardwareAttachment = {
  attachmentId: string;
  attachmentKind: string;
  label: string;
  online: boolean;
  healthy: boolean;
  status: string;
  statusReason: string | null;
  heartbeatAt: string | null;
  capabilities: string[];
  capabilityReadiness: Record<string, unknown>;
  nativeRuntime: HardwareNativeRuntime | null;
};

type HardwareSummary = {
  label: string;
  popoverTitle: string;
  status: string;
  statusLabel: string;
  tone: 'ready' | 'warning' | 'danger' | 'muted';
  icon: LucideIcon;
  detail: string;
};

type HardwareMenuRow = {
  id: string;
  label: string;
  detail: string;
  state: string;
  tone: HardwareSummary['tone'];
  icon: LucideIcon;
};

const HIDDEN_INFRASTRUCTURE_DETAIL_PATTERN = /\b(cloud|vps|server|hosted|not enabled|self[-\s]?hosted|runtime target)\b/i;

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

function readField(record: Record<string, unknown>, camelKey: string, snakeKey: string): unknown {
  return record[camelKey] ?? record[snakeKey];
}

function humanizeToken(value: string, fallback = ''): string {
  const text = readString(value, fallback);
  if (!text) {
    return fallback;
  }
  return text
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function safeHardwareDetail(value: string, fallback: string): string {
  const detail = readString(value);
  if (!detail || HIDDEN_INFRASTRUCTURE_DETAIL_PATTERN.test(detail)) {
    return fallback;
  }
  return detail;
}

function normalizeNativeRuntime(value: unknown): HardwareNativeRuntime | null {
  const record = readRecord(value);
  const os = readString(record.os);
  const arch = readString(record.arch);
  const desktopSession = readString(record.desktop_session);
  const systemServiceMode = readBoolean(record.system_service_mode);
  if (!os && !arch && !desktopSession && !systemServiceMode) {
    return null;
  }
  return {
    os,
    arch,
    release: readString(record.release),
    hostname: readString(record.hostname),
    desktopSession,
    systemServiceMode,
  };
}

function normalizeHardwareAttachments(payload: unknown): HardwareAttachment[] {
  const record = readRecord(payload);
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  const agentComputerKinds = new Set(['local_companion']);

  return attachments.flatMap((entry) => {
    const attachment = readRecord(entry);
    const attachmentKind = readString(readField(attachment, 'attachmentKind', 'attachment_kind'));
    if (!agentComputerKinds.has(attachmentKind)) {
      return [];
    }
    const attachmentId = readString(readField(attachment, 'attachmentId', 'attachment_id'), attachmentKind);
    return [{
      attachmentId,
      attachmentKind,
      label: readString(attachment.label, humanizeToken(attachmentKind)),
      online: readBoolean(attachment.online),
      healthy: readBoolean(attachment.healthy),
      status: readString(attachment.status, 'offline').toLowerCase(),
      statusReason: readOptionalString(readField(attachment, 'statusReason', 'status_reason')),
      heartbeatAt: readOptionalString(readField(attachment, 'heartbeatAt', 'heartbeat_at')),
      capabilities: readStringList(attachment.capabilities),
      capabilityReadiness: readRecord(readField(attachment, 'capabilityReadiness', 'capability_readiness')),
      nativeRuntime: normalizeNativeRuntime(readField(attachment, 'nativeRuntime', 'native_runtime')),
    }];
  });
}

function toneForStatus(status: string, online = false, healthy = false): HardwareSummary['tone'] {
  const normalized = readString(status).toLowerCase();
  if ((online && healthy) || ['ready', 'online', 'healthy', 'ok', 'available'].includes(normalized)) {
    return 'ready';
  }
  if (['busy', 'degraded', 'stale', 'warning', 'warn', 'reconnecting', 'registered', 'promptable'].includes(normalized)) {
    return 'warning';
  }
  if (['blocked', 'revoked', 'error', 'failed', 'fail', 'unhealthy', 'denied', 'restricted', 'offline', 'missing', 'unavailable'].includes(normalized)) {
    return 'danger';
  }
  return 'muted';
}

function offlineAttachmentStatus(rawStatus: string): string {
  const normalized = readString(rawStatus, 'offline').toLowerCase();
  if (['blocked', 'revoked', 'error', 'failed', 'fail', 'unhealthy', 'denied', 'restricted'].includes(normalized)) {
    return normalized;
  }
  return 'offline';
}

function inferredOsForAttachment(attachment: HardwareAttachment): string {
  const nativeOs = attachment.nativeRuntime?.os.toLowerCase() ?? '';
  if (nativeOs) {
    return nativeOs;
  }
  const label = attachment.label.toLowerCase();
  if (/\b(darwin|mac|macbook|imac)\b/.test(label) || label.includes('mac mini')) {
    return 'darwin';
  }
  if (/\b(win32|windows|windows pc)\b/.test(label)) {
    return 'windows';
  }
  if (/\b(linux|ubuntu|debian|fedora)\b/.test(label)) {
    return 'linux';
  }
  return '';
}

function friendlyOsName(os: string): string {
  const normalized = os.toLowerCase();
  if (normalized === 'darwin') {
    return 'Mac';
  }
  if (normalized === 'win32' || normalized.includes('windows')) {
    return 'Windows';
  }
  if (normalized.includes('linux')) {
    return 'Linux';
  }
  return humanizeToken(os);
}

function hardwareLabelForAttachment(attachment: HardwareAttachment): string {
  const os = inferredOsForAttachment(attachment);
  if (os === 'darwin') {
    return 'Agent Computer';
  }
  if (os === 'win32' || os.includes('windows')) {
    return 'Agent Computer';
  }
  if (os.includes('linux')) {
    return 'Agent Computer';
  }
  return 'Agent Computer';
}

function iconForAttachment(attachment: HardwareAttachment | null, target: WorkspaceBootstrapRuntimeTarget | null): LucideIcon {
  void attachment;
  void target;
  return Monitor;
}

function selectHardwareAttachment(attachments: HardwareAttachment[]): HardwareAttachment | null {
  const byKind = (kind: string) => attachments.filter((item) => item.attachmentKind === kind);
  return byKind('local_companion').find((item) => item.online)
    ?? byKind('local_companion')[0]
    ?? null;
}

function selectHardwareTarget(targets: WorkspaceBootstrapRuntimeTarget[]): WorkspaceBootstrapRuntimeTarget | null {
  const hardwareTargets = targets.filter((target) => {
    const id = readString(target.id).toLowerCase();
    const canonicalId = readString(target.canonicalId).toLowerCase();
    const kind = readString(target.kind).toLowerCase();
    const status = readString(target.status).toLowerCase();
    const isLocalAgentComputer = [
      id,
      canonicalId,
      kind,
    ].some((value) => (
      value === 'local_companion'
      || value === 'agent_computer'
      || value === 'user_device_gateway'
      || value === 'this_device'
      || value === 'this_mac'
    ));

    if (!isLocalAgentComputer) {
      return false;
    }
    return Boolean(
      target.available
      || target.online
      || target.healthy
      || target.preferred
      || ['ready', 'online', 'healthy', 'available', 'connected'].includes(status),
    );
  });
  return hardwareTargets.find((target) => target.preferred)
    ?? hardwareTargets.find((target) => target.online)
    ?? hardwareTargets[0]
    ?? null;
}

function buildSummary(
  attachment: HardwareAttachment | null,
  target: WorkspaceBootstrapRuntimeTarget | null,
  error: string | null,
): HardwareSummary {
  if (attachment) {
    const status = attachment.online
      ? attachment.healthy
        ? 'online'
        : 'degraded'
      : offlineAttachmentStatus(attachment.status);
    const runtimeBits = attachment.nativeRuntime
      ? [friendlyOsName(attachment.nativeRuntime.os), attachment.nativeRuntime.arch].filter(Boolean).join(' ')
      : friendlyOsName(inferredOsForAttachment(attachment)) || readString(target?.kind, 'Agent Computer');
    return {
      label: hardwareLabelForAttachment(attachment),
      popoverTitle: attachment.label || hardwareLabelForAttachment(attachment),
      status,
      statusLabel: humanizeToken(status),
      tone: toneForStatus(status, attachment.online, attachment.healthy),
      icon: iconForAttachment(attachment, target),
      detail: runtimeBits,
    };
  }

  if (target) {
    const status = target.online
      ? target.healthy
        ? 'online'
        : 'degraded'
      : target.status;
    return {
      label: 'Hardware',
      popoverTitle: target.publicLabel || target.label,
      status,
      statusLabel: target.statusLabel || humanizeToken(status, target.available ? 'Available' : 'Offline'),
      tone: toneForStatus(status, target.online, target.healthy),
      icon: iconForAttachment(null, target),
      detail: safeHardwareDetail(target.statusReason || target.description || target.kind, 'Connect this Mac in Hardware.'),
    };
  }

  return {
    label: 'Hardware',
    popoverTitle: 'Hardware',
    status: error ? 'unavailable' : 'unknown',
    statusLabel: error ? 'Unavailable' : 'Unknown',
    tone: error ? 'warning' : 'muted',
    icon: Monitor,
    detail: error || 'Connect this Mac in Hardware.',
  };
}

function topbarStateLabel(summary: HardwareSummary): string {
  if (summary.status === 'online') {
    return 'Connected';
  }
  if (summary.status === 'degraded') {
    return 'Needs attention';
  }
  if (['offline', 'unknown', 'unavailable', 'missing'].includes(summary.status)) {
    return 'Offline';
  }
  return summary.statusLabel;
}

function buildHardwareMenuRows(summary: HardwareSummary, stateLabel: string): HardwareMenuRow[] {
  const connected = summary.status === 'online';
  const needsAttention = summary.tone === 'warning' || summary.tone === 'danger';
  const localDetail = connected
    ? safeHardwareDetail(summary.detail, 'Verified with this workspace.')
    : safeHardwareDetail(summary.detail, 'Connect this Mac in Hardware.');
  return [
    {
      id: 'this-mac',
      label: 'This Mac',
      detail: localDetail,
      state: stateLabel,
      tone: summary.tone,
      icon: Monitor,
    },
    {
      id: 'permissions',
      label: 'Permissions',
      detail: connected || summary.status === 'degraded' ? 'Screen, input, and file access.' : 'Checked after this Mac connects.',
      state: needsAttention ? 'Review' : connected ? 'OK' : 'Pending',
      tone: needsAttention ? summary.tone : connected ? 'ready' : 'muted',
      icon: ShieldCheck,
    },
    {
      id: 'usage',
      label: 'Usage',
      detail: connected ? 'Computer sessions and actions from this workspace.' : 'Usage appears after Agent Computer connects.',
      state: connected ? 'Live' : 'Offline',
      tone: connected ? 'ready' : 'muted',
      icon: Gauge,
    },
    {
      id: 'recent-activity',
      label: 'Recent activity',
      detail: connected ? 'Hardware actions from this workspace.' : 'Shown after Agent Computer connects.',
      state: connected ? 'Idle' : 'Offline',
      tone: 'muted',
      icon: Activity,
    },
  ];
}

export function WorkstationHardwareStatus({
  runtimeTargets,
  hardwareHref,
}: {
  runtimeTargets: WorkspaceBootstrapRuntimeTarget[];
  hardwareHref: string;
}) {
  const services = useWorkspaceServices();
  const [attachments, setAttachments] = useState<HardwareAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadAttachments = async () => {
      try {
        const payload = await services.client.listRuntimeAttachments();
        if (!cancelled) {
          setAttachments(normalizeHardwareAttachments(payload));
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('Agent Computer details are unavailable.');
        }
      }
    };

    void loadAttachments();
    const interval = window.setInterval(() => {
      void loadAttachments();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [services.client]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectedAttachment = useMemo(() => selectHardwareAttachment(attachments), [attachments]);
  const selectedTarget = useMemo(() => selectHardwareTarget(runtimeTargets), [runtimeTargets]);
  const summary = useMemo(
    () => buildSummary(selectedAttachment, selectedTarget, error),
    [error, selectedAttachment, selectedTarget],
  );
  const StatusIcon = summary.icon;
  const stateLabel = topbarStateLabel(summary);
  const hardwareMenuRows = useMemo(
    () => buildHardwareMenuRows(summary, stateLabel),
    [stateLabel, summary],
  );

  return (
    <div
      ref={rootRef}
      className={joinClassNames('workstation-hardware-status', open && 'workstation-hardware-status--open')}
    >
      <button
        type="button"
        className={joinClassNames(
          'workstation-hardware-status__trigger',
          `workstation-hardware-status__trigger--${summary.tone}`,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`${summary.label} · ${stateLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="workstation-hardware-status__dot" aria-hidden="true" />
        <StatusIcon size={14} aria-hidden="true" />
      </button>

      {open ? (
        <section
          className="workstation-hardware-status__popover"
          role="dialog"
          aria-label="Hardware status"
        >
          <div className="workstation-hardware-status__menu" aria-label="Hardware status sections">
            {hardwareMenuRows.map((row) => {
              const RowIcon = row.icon;
              return (
                <Link
                  key={row.id}
                  href={hardwareHref}
                  className={joinClassNames(
                    'workstation-hardware-status__row',
                    row.id === 'this-mac' && 'workstation-hardware-status__row--selected',
                  )}
                  onClick={() => setOpen(false)}
                >
                  <span className="workstation-hardware-status__row-icon" aria-hidden="true">
                    <RowIcon size={14} strokeWidth={1.9} />
                  </span>
                  <span className="workstation-hardware-status__row-copy">
                    <strong>{row.label}</strong>
                    <small>{row.detail}</small>
                  </span>
                  <span className={joinClassNames('workstation-hardware-status__row-state', `workstation-hardware-status__row-state--${row.tone}`)}>
                    {row.state}
                  </span>
                </Link>
              );
            })}
          </div>

          {error ? <p className="workstation-hardware-status__notice">{error}</p> : null}

          <Link
            href={hardwareHref}
            className="workstation-hardware-status__settings"
            onClick={() => setOpen(false)}
          >
            <Settings size={14} aria-hidden="true" />
            <span>Manage hardware</span>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
