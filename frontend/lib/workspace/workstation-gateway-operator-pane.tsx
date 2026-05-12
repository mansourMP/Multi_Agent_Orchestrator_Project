'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { DataBadge } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSection,
} from '@/lib/ui/form-controls';
import {
  WorkstationActionButton,
  WorkstationSurfaceCard,
  WorkstationSurfaceList,
  WorkstationSurfaceListItem,
  WorkstationSurfaceNotice,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

type GatewayRegistrationRecord = Record<string, unknown> & {
  gateway_id?: string | null;
  display_name?: string | null;
  platform?: string | null;
  status?: string | null;
  connection_status?: string | null;
  device_trust_state?: string | null;
  capabilities?: unknown;
  last_seen_at?: string | null;
};

type GatewayPairingIntentRecord = Record<string, unknown> & {
  pairing_token?: string | null;
  expires_at?: string | null;
  display_name?: string | null;
  platform?: string | null;
};

type GatewayDoctorCheckRecord = Record<string, unknown> & {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
};

type GatewayDoctorPayload = Record<string, unknown> & {
  status?: string | null;
  checks?: GatewayDoctorCheckRecord[];
  approvals?: Record<string, unknown> | null;
  checkpoint?: Record<string, unknown> | null;
  browser?: Record<string, unknown> | null;
  specialists?: Record<string, unknown> | null;
  providers?: Record<string, unknown> | null;
  quota?: Record<string, unknown> | null;
};

type PersonalChannelStateRecord = Record<string, unknown> & {
  status?: string | null;
  qr_code?: string | null;
  login_hint?: string | null;
  linked_name?: string | null;
  linked_jid?: string | null;
  linked_phone?: string | null;
  linked_username?: string | null;
  connected_at?: string | null;
};

type PersonalChannelViewPayload = Record<string, unknown> & {
  state?: PersonalChannelStateRecord | null;
  recent_messages?: Array<Record<string, unknown>>;
};

type GatewayApprovalRecord = Record<string, unknown> & {
  approval_id?: string | null;
  capability_id?: string | null;
  status?: string | null;
  run_id?: string | null;
  note?: string | null;
};

type GatewayApprovalsPayload = Record<string, unknown> & {
  pending_count?: number | null;
  retryable_count?: number | null;
  items?: GatewayApprovalRecord[];
};

type GatewayBrowserSessionRecord = Record<string, unknown> & {
  browser_session_id?: string | null;
  status?: string | null;
  session_profile?: string | null;
  current_url?: string | null;
  resume_supported?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type GatewayBrowserSessionsPayload = Record<string, unknown> & {
  items?: GatewayBrowserSessionRecord[];
};

type PairingDraft = {
  displayName: string;
  platform: string;
};

type ChannelDraft = {
  phoneNumber: string;
  apiId: string;
  apiHash: string;
  loginCode: string;
  password: string;
  remoteJid: string;
  text: string;
};

type ChannelKind = 'whatsapp' | 'telegram';

type GatewayOperatorSection = 'all' | 'status' | 'channels' | 'approvals' | 'activity';
type MyComputerStatusLabel = 'Not connected' | 'Pairing' | 'Online' | 'Reconnecting' | 'Needs your OK' | 'Offline' | 'Revoked';
type CapabilitySurfaceItem = {
  id: 'files' | 'shell' | 'browser' | 'screenshots' | 'clipboard' | 'telegram' | 'whatsapp' | 'ollama';
  label: string;
  description: string;
  available: boolean;
};

type CertificationLaneItem = {
  id: 'phone_web' | 'gateway_truth' | 'approvals' | 'degraded_states' | 'channel_recovery';
  title: string;
  subtitle: string;
  description: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
};

type GatewayPrimaryAction = {
  label: 'Connect this computer' | 'Reconnect' | 'Approve action' | 'Revoke access';
  tone: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  action:
    | { kind: 'connect' }
    | { kind: 'reconnect' }
    | { kind: 'open_approvals' }
    | { kind: 'revoke' };
};

type GatewayOperatorState = {
  id: 'not_connected' | 'pairing' | 'online' | 'reconnecting' | 'needs_approval' | 'offline' | 'revoked';
  label: MyComputerStatusLabel;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  detail: string;
  primaryAction: GatewayPrimaryAction;
};

function buildQueryString(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

function readString(value: unknown, fallback = 'Unknown'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function humanizeToken(value: unknown, fallback = 'Unknown'): string {
  const token = String(value ?? '').trim();
  if (!token) {
    return fallback;
  }
  return token
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTimestamp(value: unknown): string {
  const token = String(value ?? '').trim();
  if (!token) {
    return 'Not available';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(token));
  } catch {
    return token;
  }
}

function formatRelativeTimestamp(value: unknown): string {
  const token = String(value ?? '').trim();
  if (!token) {
    return 'Not available';
  }
  const parsed = Date.parse(token);
  if (!Number.isFinite(parsed)) {
    return token;
  }
  const deltaMs = Date.now() - parsed;
  const future = deltaMs < 0;
  const deltaMinutes = Math.round(Math.abs(deltaMs) / 60000);
  if (deltaMinutes < 1) {
    return future ? 'In under a minute' : 'Just now';
  }
  if (deltaMinutes < 60) {
    return future ? `In ${deltaMinutes} min` : `${deltaMinutes} min ago`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return future ? `In ${deltaHours} hr` : `${deltaHours} hr ago`;
  }
  const deltaDays = Math.round(deltaHours / 24);
  return future ? `In ${deltaDays} day${deltaDays === 1 ? '' : 's'}` : `${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`;
}

function statusTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const status = String(value ?? '').trim().toLowerCase();
  if (['healthy', 'active', 'connected', 'attached', 'executed', 'approved', 'pass'].includes(status)) {
    return 'success';
  }
  if (['approval_required', 'pending', 'requested', 'warn', 'waiting_for_input', 'attach_required', 'degraded'].includes(status)) {
    return 'warning';
  }
  if (['blocked', 'revoked', 'rejected', 'fail', 'attach_failed', 'offline', 'not_attached'].includes(status)) {
    return 'danger';
  }
  if (['fallback_ready'].includes(status)) {
    return 'accent';
  }
  return 'neutral';
}

function sortGatewayApprovals(items: GatewayApprovalRecord[]): GatewayApprovalRecord[] {
  return [...items].sort((left, right) => {
    const leftPending = String(left.status ?? '').trim().toLowerCase() === 'pending';
    const rightPending = String(right.status ?? '').trim().toLowerCase() === 'pending';
    if (leftPending !== rightPending) {
      return leftPending ? -1 : 1;
    }
    return String(left.approval_id ?? '').localeCompare(String(right.approval_id ?? ''));
  });
}

function sortBrowserSessions(items: GatewayBrowserSessionRecord[]): GatewayBrowserSessionRecord[] {
  return [...items].sort((left, right) => {
    const leftStatus = String(left.status ?? '').trim().toLowerCase();
    const rightStatus = String(right.status ?? '').trim().toLowerCase();
    if (leftStatus !== rightStatus) {
      if (leftStatus === 'active' || leftStatus === 'attached') {
        return -1;
      }
      if (rightStatus === 'active' || rightStatus === 'attached') {
        return 1;
      }
    }
    return String(left.browser_session_id ?? '').localeCompare(String(right.browser_session_id ?? ''));
  });
}

function summarizeWhatsappState(state: PersonalChannelStateRecord | null | undefined): string {
  if (!state) {
    return 'This computer has not reported WhatsApp status yet.';
  }
  if (state.qr_code) {
    return 'A WhatsApp pairing QR is ready on this computer.';
  }
  if (String(state.status ?? '').trim().toLowerCase() === 'connected') {
    const linkedName = readString(state.linked_name, '');
    const linkedJid = readString(state.linked_jid, '');
    const linkedLabel = linkedName || linkedJid || 'Linked account';
    return `${linkedLabel} is connected on the paired computer.`;
  }
  return `WhatsApp personal is ${humanizeToken(state.status, 'Idle')}.`;
}

function summarizeTelegramState(state: PersonalChannelStateRecord | null | undefined): string {
  if (!state) {
    return 'This computer has not reported Telegram status yet.';
  }
  if (state.login_hint) {
    return 'Telegram is waiting for a login code or confirmation.';
  }
  if (String(state.status ?? '').trim().toLowerCase() === 'connected') {
    const linkedName = readString(state.linked_name, '');
    const linkedUsername = readString(state.linked_username, '');
    const linkedPhone = readString(state.linked_phone, '');
    const linkedLabel = linkedName || linkedUsername || linkedPhone || 'Linked account';
    return `${linkedLabel} is connected on the paired computer.`;
  }
  return `Telegram personal is ${humanizeToken(state.status, 'Idle')}.`;
}

function summarizeDoctorFacet(value: unknown): {
  status: string;
  summary: string;
} {
  const record = readRecord(value);
  return {
    status: humanizeToken(readString(record.status, 'unknown'), 'Unknown'),
    summary: readString(record.summary, 'No detail reported yet.'),
  };
}

function gatewayPairingCommand(token: unknown): string {
  const pairingToken = readString(token, '');
  if (!pairingToken) {
    return 'Pairing token unavailable';
  }
  const shellQuote = (value: string): string => `'${String(value).replace(/'/g, "'\\''")}'`;
  const normalizeGatewayApiBase = (value: string): string => {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) {
      return 'http://127.0.0.1:8001/api';
    }
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  };
  const isProductionLike = ['production', 'prod', 'staging'].includes(
    readString(process.env.NEXT_PUBLIC_EMPYRALIS_DEPLOY_ENV, '').toLowerCase(),
  ) || process.env.NODE_ENV === 'production';
  const apiUrl = (() => {
    const explicitRuntimeBase =
      process.env.NEXT_PUBLIC_ORION_API_URL
      ?? process.env.NEXT_PUBLIC_API_URL
      ?? '';
    if (explicitRuntimeBase.trim()) {
      return normalizeGatewayApiBase(explicitRuntimeBase);
    }
    if (typeof window === 'undefined') {
      return isProductionLike ? '' : 'http://127.0.0.1:8001/api';
    }
    const hostname = String(window.location.hostname || '').trim().toLowerCase();
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
      return 'http://127.0.0.1:8001/api';
    }
    return normalizeGatewayApiBase(window.location.origin);
  })();
  if (!apiUrl) {
    return 'Gateway API URL unavailable. Set NEXT_PUBLIC_ORION_API_URL or NEXT_PUBLIC_API_URL before pairing.';
  }
  return [
    'cd "$(git rev-parse --show-toplevel)/empyralis-gateway"',
    'npm run build',
    `export EMPYRALIS_GATEWAY_API_URL=${shellQuote(apiUrl)}`,
    `export EMPYRALIS_GATEWAY_PAIRING_TOKEN=${shellQuote(pairingToken)}`,
    'npm start',
  ].join('\n');
}

function detectGatewayPlatform(): string {
  if (typeof navigator === 'undefined') {
    return 'macos';
  }
  const source = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (source.includes('win')) {
    return 'windows';
  }
  if (source.includes('linux')) {
    return 'linux';
  }
  return 'macos';
}

const GATEWAY_SETUP_STEPS = [
  {
    title: 'Install Empyralis Companion',
    description: 'The companion keeps the local engine running in the background. The terminal command below is the current launch setup path.',
  },
  {
    title: 'Pair this computer',
    description: 'Pairing creates one revocable device identity. The cloud never needs inbound access to your machine.',
  },
  {
    title: 'Grant local permissions only when needed',
    description: 'Files, browser, screenshots, clipboard, and terminal access stay controlled by this paired device.',
  },
] as const;

const GATEWAY_PERMISSION_CHECKLIST = [
  'Files',
  'Browser',
  'Screenshots',
  'Clipboard',
  'Terminal',
] as const;

const GATEWAY_MODE_SUMMARIES = [
  {
    title: 'Default',
    subtitle: 'Recommended',
    description: 'Sage can use safe tools automatically. Risky actions still pause for approval before they touch your computer or send anything externally.',
  },
  {
    title: 'Full Access',
    subtitle: 'This computer only',
    description: 'Sage can continue inside your paired computer with broad local access for the session. It is still audited, revocable, and never applies to hosted cloud computers.',
  },
] as const;

function gatewayConnectionSummary(gateways: GatewayRegistrationRecord[]): string {
  if (gateways.length === 0) {
    return 'No computers connected';
  }
  const onlineCount = gateways.filter((gateway) =>
    String(gateway.connection_status ?? gateway.status ?? '').trim().toLowerCase() === 'online',
  ).length;
  return onlineCount > 0 ? `${gateways.length} · ${onlineCount} online` : `${gateways.length} · Offline`;
}

function gatewayTrustSummary(selectedGateway: GatewayRegistrationRecord | null): {
  deviceLabel: string;
  platformLabel: string;
  lastSeenLabel: string;
  lastConnectedLabel: string;
  trustLabel: string;
} {
  return {
    deviceLabel: selectedGateway
      ? readString(selectedGateway.display_name, 'This computer')
      : 'This computer',
    platformLabel: selectedGateway
      ? humanizeToken(selectedGateway.platform, 'Unknown platform')
      : 'Unknown platform',
    lastSeenLabel: formatRelativeTimestamp(selectedGateway?.last_seen_at),
    lastConnectedLabel: formatTimestamp(selectedGateway?.last_seen_at),
    trustLabel: humanizeToken(selectedGateway?.device_trust_state, selectedGateway ? 'Trusted device' : 'Not paired'),
  };
}

function normalizeCapabilityTokenSet(values: string[]): Set<string> {
  return new Set(
    values
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function tokenSetHasAny(tokens: Set<string>, fragments: string[]): boolean {
  for (const token of tokens) {
    if (fragments.some((fragment) => token.includes(fragment))) {
      return true;
    }
  }
  return false;
}

function summarizeMyComputerCapabilities(
  selectedGatewayCapabilities: string[],
  providerItems: Record<string, unknown>[],
): CapabilitySurfaceItem[] {
  const capabilityTokens = normalizeCapabilityTokenSet(selectedGatewayCapabilities);
  const providerTokens = new Set(
    providerItems
      .flatMap((item) => [readString(item.id, ''), readString(item.label, ''), readString(item.state, '')])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const ollamaProviderAvailable = providerItems.some((item) => {
    const id = readString(item.id, '').trim().toLowerCase();
    const label = readString(item.label, '').trim().toLowerCase();
    const state = readString(item.state, '').trim().toLowerCase();
    if (!(id.includes('ollama') || label.includes('ollama'))) {
      return false;
    }
    return state === 'active' || state === 'configured' || state === 'ready' || state === 'connected' || state === 'usable';
  });
  const hasFiles = tokenSetHasAny(capabilityTokens, ['file.', 'files.', 'fs.', 'workspace.file', 'local.file']);
  const hasShell = tokenSetHasAny(capabilityTokens, ['shell.', 'terminal.', '.exec', 'command.run']);
  const hasBrowser = tokenSetHasAny(capabilityTokens, ['browser.', 'web.', 'session.', 'navigator.']);
  const hasScreenshots = tokenSetHasAny(capabilityTokens, ['screenshot', 'screen.capture', 'browser.capture']);
  const hasClipboard = tokenSetHasAny(capabilityTokens, ['clipboard.']);
  const hasTelegram = tokenSetHasAny(capabilityTokens, ['telegram']);
  const hasWhatsApp = tokenSetHasAny(capabilityTokens, ['whatsapp']);
  const hasOllama = ollamaProviderAvailable
    || tokenSetHasAny(capabilityTokens, ['ollama'])
    || Array.from(providerTokens).some((token) => token.includes('ollama'));

  return [
    {
      id: 'files',
      label: 'Files',
      description: 'Read and list local files from this computer.',
      available: hasFiles,
    },
    {
      id: 'shell',
      label: 'Shell',
      description: 'Run safe terminal commands on this computer.',
      available: hasShell,
    },
    {
      id: 'browser',
      label: 'Browser',
      description: 'Use local browser sessions and actions.',
      available: hasBrowser,
    },
    {
      id: 'screenshots',
      label: 'Screenshots',
      description: 'Capture visual snapshots during local work.',
      available: hasScreenshots,
    },
    {
      id: 'clipboard',
      label: 'Clipboard',
      description: 'Read/write clipboard content when allowed.',
      available: hasClipboard,
    },
    {
      id: 'telegram',
      label: 'Telegram',
      description: 'Use personal Telegram through this connected computer.',
      available: hasTelegram,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      description: 'Use personal WhatsApp through this connected computer.',
      available: hasWhatsApp,
    },
    {
      id: 'ollama',
      label: 'Ollama',
      description: 'Use local Ollama models when available on this computer.',
      available: hasOllama,
    },
  ];
}

function summarizeMyComputerStatus(params: {
  gateways: GatewayRegistrationRecord[];
  selectedGateway: GatewayRegistrationRecord | null;
  doctorStatus: string;
  approvalsPendingCount: number;
  busyActionKey: string | null;
  pairingIntentActive: boolean;
}): GatewayOperatorState {
  const {
    gateways,
    selectedGateway,
    doctorStatus,
    approvalsPendingCount,
    busyActionKey,
    pairingIntentActive,
  } = params;
  if (gateways.length === 0) {
    if (pairingIntentActive || busyActionKey === 'pairing') {
      return {
        id: 'pairing',
        label: 'Pairing',
        tone: 'warning',
        detail: 'A short-lived connection request is ready. Open the desktop app on this computer to finish pairing.',
        primaryAction: {
          label: 'Connect this computer',
          tone: 'primary',
          disabled: true,
          action: { kind: 'connect' },
        },
      };
    }
    return {
      id: 'not_connected',
      label: 'Not connected',
      tone: 'neutral',
      detail: 'Connect this computer when Sage needs trusted local access.',
      primaryAction: {
        label: 'Connect this computer',
        tone: 'primary',
        action: { kind: 'connect' },
      },
    };
  }

  const selected = selectedGateway ?? gateways[0] ?? null;
  const connection = String(selected?.connection_status ?? selected?.status ?? '').trim().toLowerCase();
  const trust = String(selected?.device_trust_state ?? '').trim().toLowerCase();
  const doctor = String(doctorStatus ?? '').trim().toLowerCase();
  const revoked = ['revoked'].includes(connection) || ['revoked'].includes(trust);
  if (revoked) {
    return {
      id: 'revoked',
      label: 'Revoked',
      tone: 'danger',
      detail: 'Access from this computer was revoked. Pair it again before Sage can use any local tools.',
      primaryAction: {
        label: 'Reconnect',
        tone: 'primary',
        action: { kind: 'reconnect' },
      },
    };
  }
  if (approvalsPendingCount > 0) {
    return {
      id: 'needs_approval',
      label: 'Needs your OK',
      tone: 'warning',
      detail: 'Sage is waiting for approval before continuing local actions.',
      primaryAction: {
        label: 'Approve action',
        tone: 'primary',
        action: { kind: 'open_approvals' },
      },
    };
  }
  if (
    busyActionKey?.startsWith('pairing')
    || ['connecting', 'reconnecting', 'resuming', 'attach_required', 'pending'].includes(connection)
    || ['connecting', 'reconnecting', 'resuming', 'degraded', 'warning'].includes(doctor)
  ) {
    return {
      id: 'reconnecting',
      label: 'Reconnecting',
      tone: 'warning',
      detail: 'This computer is reconnecting or waiting for the desktop app to finish attaching.',
      primaryAction: {
        label: 'Reconnect',
        tone: 'primary',
        disabled: busyActionKey === 'pairing',
        action: { kind: 'reconnect' },
      },
    };
  }
  const online = ['online', 'connected', 'attached', 'healthy', 'active', 'pass'].includes(connection)
    || ['online', 'healthy', 'pass'].includes(doctor);
  if (online) {
    return {
      id: 'online',
      label: 'Online',
      tone: 'success',
      detail: 'Sage can use this computer now.',
      primaryAction: {
        label: 'Revoke access',
        tone: 'danger',
        disabled: busyActionKey === `revoke:${String(selected?.gateway_id ?? '').trim()}`,
        action: { kind: 'revoke' },
      },
    };
  }
  return {
    id: 'offline',
    label: 'Offline',
    tone: 'danger',
    detail: 'This computer is not ready for local tasks yet.',
    primaryAction: {
      label: 'Reconnect',
      tone: 'primary',
      action: { kind: 'reconnect' },
    },
  };
}

function doctorDisplayStatus(status: unknown): { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' } {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (['healthy', 'pass', 'online'].includes(normalized)) {
    return { label: 'Healthy', tone: 'success' };
  }
  if (['warn', 'warning', 'degraded', 'issues_found', 'offline', 'fail', 'failed', 'blocked'].includes(normalized)) {
    return { label: 'Issues found', tone: normalized === 'offline' || normalized === 'fail' || normalized === 'failed' || normalized === 'blocked' ? 'danger' : 'warning' };
  }
  return { label: 'Unknown', tone: 'neutral' };
}

function channelRecoveryLane(params: {
  whatsappState: string;
  telegramState: string;
}): CertificationLaneItem {
  const whatsapp = params.whatsappState;
  const telegram = params.telegramState;
  const states = [whatsapp, telegram].filter(Boolean);
  const configured = states.some((state) => !['', 'idle', 'unknown'].includes(state));
  const reconnecting = states.some((state) => ['connecting', 'reconnecting', 'resuming', 'pending', 'code_required', 'pairing_code_required'].includes(state));
  const failed = states.some((state) => ['offline', 'failed', 'fail', 'revoked', 'error', 'blocked'].includes(state));
  const connected = states.some((state) => ['connected', 'active', 'ready'].includes(state));
  if (failed) {
    return {
      id: 'channel_recovery',
      title: 'Channel recovery',
      subtitle: 'Needs attention',
      description: 'A personal channel is offline or blocked. Recover it here without opening developer tools.',
      tone: 'danger',
    };
  }
  if (reconnecting) {
    return {
      id: 'channel_recovery',
      title: 'Channel recovery',
      subtitle: 'Recovery in progress',
      description: 'A personal channel is reconnecting or waiting for login confirmation on the paired computer.',
      tone: 'warning',
    };
  }
  if (connected) {
    return {
      id: 'channel_recovery',
      title: 'Channel recovery',
      subtitle: 'Ready',
      description: 'Telegram and WhatsApp recovery stays available from phone and web when this computer is online.',
      tone: 'success',
    };
  }
  return {
    id: 'channel_recovery',
    title: 'Channel recovery',
    subtitle: configured ? 'Standby' : 'Not configured',
    description: 'Personal Channels are optional. Configure them here when Sage should use this computer to deliver messages.',
    tone: configured ? 'neutral' : 'accent',
  };
}

function buildCertificationLanes(params: {
  myComputerStatus: { label: MyComputerStatusLabel; tone: 'neutral' | 'success' | 'warning' | 'danger'; detail: string };
  doctorStatus: string;
  doctorChecks: GatewayDoctorCheckRecord[];
  approvalsPendingCount: number;
  whatsappState: string;
  telegramState: string;
}): CertificationLaneItem[] {
  const degradedChecks = params.doctorChecks.filter((check) => {
    const status = String(check.status ?? '').trim().toLowerCase();
    return ['warn', 'warning', 'degraded', 'issues_found', 'offline', 'fail', 'failed', 'blocked'].includes(status);
  });
  const degradedTone = degradedChecks.some((check) => ['offline', 'fail', 'failed', 'blocked'].includes(String(check.status ?? '').trim().toLowerCase()))
    ? 'danger'
    : degradedChecks.length > 0 || ['warn', 'warning', 'degraded', 'issues_found'].includes(params.doctorStatus)
      ? 'warning'
      : 'success';
  return [
    {
      id: 'phone_web',
      title: 'Phone/web command center',
      subtitle: 'Ready',
      description: 'Approvals, recovery, and computer status stay in the product so users do not need a terminal.',
      tone: 'success',
    },
    {
      id: 'gateway_truth',
      title: 'Computer online/offline status',
      subtitle: params.myComputerStatus.label,
      description: params.myComputerStatus.detail,
      tone: params.myComputerStatus.tone,
    },
    {
      id: 'approvals',
      title: 'Approval boundary',
      subtitle: params.approvalsPendingCount > 0 ? `${params.approvalsPendingCount} waiting` : 'Clear',
      description: params.approvalsPendingCount > 0
        ? 'Risky local or external actions are paused until the owner approves them from the product shell.'
        : 'No risky local actions are waiting right now.',
      tone: params.approvalsPendingCount > 0 ? 'warning' : 'success',
    },
    {
      id: 'degraded_states',
      title: 'Degraded-state clarity',
      subtitle: degradedChecks.length > 0 ? `${degradedChecks.length} issue${degradedChecks.length === 1 ? '' : 's'} surfaced` : 'Clear',
      description: degradedChecks.length > 0
        ? degradedChecks.map((check) => readString(check.summary, humanizeToken(check.id, 'Gateway check'))).slice(0, 2).join(' · ')
        : 'Gateway health, browser attach, provider reachability, and quota checks are currently readable and quiet.',
      tone: degradedTone,
    },
    channelRecoveryLane({
      whatsappState: params.whatsappState,
      telegramState: params.telegramState,
    }),
  ];
}

function gatewayCapabilityLabels(gateway: GatewayRegistrationRecord | null): string[] {
  const values = Array.isArray(gateway?.capabilities) ? gateway?.capabilities : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const label = readString(value, '');
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    out.push(label);
  }
  return out.sort((left, right) => left.localeCompare(right));
}

function defaultChannelDraft(text: string): ChannelDraft {
  return {
    phoneNumber: '',
    apiId: '',
    apiHash: '',
    loginCode: '',
    password: '',
    remoteJid: '',
    text,
  };
}

export function WorkstationGatewayOperatorPane({
  initialSection = 'all',
}: {
  initialSection?: GatewayOperatorSection;
}) {
  const router = useRouter();
  const services = useWorkspaceServices();
  const { bootstrap } = useWorkspaceBoundary();
  const workspaceId = bootstrap.workspace.id;

  const [gateways, setGateways] = useState<GatewayRegistrationRecord[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<GatewayDoctorPayload | null>(null);
  const [whatsapp, setWhatsapp] = useState<PersonalChannelViewPayload | null>(null);
  const [telegram, setTelegram] = useState<PersonalChannelViewPayload | null>(null);
  const [approvals, setApprovals] = useState<GatewayApprovalsPayload | null>(null);
  const [browserSessions, setBrowserSessions] = useState<GatewayBrowserSessionsPayload | null>(null);
  const [pairingDraft, setPairingDraft] = useState<PairingDraft>({
    displayName: 'My device',
    platform: 'macos',
  });
  const [pairingIntent, setPairingIntent] = useState<GatewayPairingIntentRecord | null>(null);
  const [loadingRegistrations, setLoadingRegistrations] = useState(true);
  const [registrationsTimedOut, setRegistrationsTimedOut] = useState(false);
  const [loadingGatewayDetail, setLoadingGatewayDetail] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manualSetupVisible, setManualSetupVisible] = useState(false);
  const [advancedDiagnosticsVisible, setAdvancedDiagnosticsVisible] = useState(false);
  const [channelDrafts, setChannelDrafts] = useState<Record<ChannelKind, ChannelDraft>>({
    whatsapp: defaultChannelDraft('Empyralis gateway test from this computer.'),
    telegram: defaultChannelDraft('Empyralis gateway test from this computer.'),
  });

  const selectedGateway = useMemo(
    () =>
      gateways.find((gateway) => String(gateway.gateway_id ?? '').trim() === String(selectedGatewayId ?? '').trim()) ?? null,
    [gateways, selectedGatewayId],
  );

  const selectedGatewayCapabilities = useMemo(
    () => gatewayCapabilityLabels(selectedGateway),
    [selectedGateway],
  );
  const selectedCapabilitySet = useMemo(
    () => new Set(selectedGatewayCapabilities),
    [selectedGatewayCapabilities],
  );
  const whatsappConfigureAvailable = selectedCapabilitySet.has('channel.whatsapp.personal.configure');
  const whatsappOutboundAvailable = selectedCapabilitySet.has('channel.whatsapp.personal.outbound');
  const telegramConfigureAvailable = selectedCapabilitySet.has('channel.telegram.personal.configure');
  const telegramOutboundAvailable = selectedCapabilitySet.has('channel.telegram.personal.outbound');

  const pendingApprovals = useMemo(
    () => sortGatewayApprovals(Array.isArray(approvals?.items) ? approvals?.items : []),
    [approvals],
  );

  const browserItems = useMemo(
    () => sortBrowserSessions(Array.isArray(browserSessions?.items) ? browserSessions?.items : []),
    [browserSessions],
  );

  useEffect(() => {
    setPairingDraft((current) => ({
      ...current,
      platform: detectGatewayPlatform(),
    }));
  }, []);

  useEffect(() => {
    if (!loadingRegistrations) {
      setRegistrationsTimedOut(false);
      return () => {};
    }
    const timeoutId = window.setTimeout(() => {
      setRegistrationsTimedOut(true);
      setLoadingRegistrations(false);
    }, 5_000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadingRegistrations]);

  async function requestPayload<T>(
    path: string,
    init?: RequestInit,
    allowStatuses: number[] = [],
  ): Promise<T | null> {
    return services.client.requestJson<T>({
      path,
      init,
      allowStatuses,
    });
  }

  async function requestOptionalPayload<T>(path: string): Promise<T | null> {
    try {
      return await requestPayload<T>(path, undefined, [403, 404]);
    } catch {
      return null;
    }
  }

  async function copyToClipboard(label: string, value: string): Promise<void> {
    const text = readString(value, '');
    if (!text) {
      setErrorMessage(`${label} is not available yet.`);
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setErrorMessage(null);
      setStatusMessage(`${label} copied. Paste it into Terminal and press Return.`);
    } catch {
      setErrorMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function refreshRegistrations(showLoading = false): Promise<void> {
    if (showLoading) {
      setRegistrationsTimedOut(false);
      setLoadingRegistrations(true);
    }
    const payload = await requestPayload<Record<string, unknown>>(
      `/api/gateway/registrations${buildQueryString({ workspace_id: workspaceId })}`,
    );
    const items = Array.isArray(payload?.items)
      ? payload.items.filter((item): item is GatewayRegistrationRecord => Boolean(item) && typeof item === 'object')
      : [];
    setGateways(items);
    setLoadingRegistrations(false);
    setSelectedGatewayId((current) => {
      if (current && items.some((item) => String(item.gateway_id ?? '').trim() === current)) {
        return current;
      }
      return String(items[0]?.gateway_id ?? '').trim() || null;
    });
  }

  async function refreshGatewayDetail(gatewayId: string, showLoading = false, forceProviderProbe = false): Promise<void> {
    if (!gatewayId) {
      setDoctor(null);
      setWhatsapp(null);
      setTelegram(null);
      setApprovals(null);
      setBrowserSessions(null);
      return;
    }
    if (showLoading) {
      setLoadingGatewayDetail(true);
    }
    const nextDoctor = await requestPayload<GatewayDoctorPayload>(
        `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/doctor${forceProviderProbe ? '?force_provider_probe=1' : ''}`,
    );
    const [
      nextWhatsapp,
      nextTelegram,
      nextApprovals,
      nextBrowserSessions,
    ] = await Promise.all([
      requestOptionalPayload<PersonalChannelViewPayload>(
        `/api/personal-channels/whatsapp/gateways/${encodeURIComponent(gatewayId)}`,
      ),
      requestOptionalPayload<PersonalChannelViewPayload>(
        `/api/personal-channels/telegram/gateways/${encodeURIComponent(gatewayId)}`,
      ),
      requestOptionalPayload<GatewayApprovalsPayload>(
        `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/approvals`,
      ),
      requestOptionalPayload<GatewayBrowserSessionsPayload>(
        `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/browser/sessions`,
      ),
    ]);
    setDoctor(nextDoctor);
    setWhatsapp(nextWhatsapp);
    setTelegram(nextTelegram);
    setApprovals(nextApprovals);
    setBrowserSessions(nextBrowserSessions);
    setErrorMessage(null);
    setLoadingGatewayDetail(false);
  }

  useEffect(() => {
    let cancelled = false;
    void refreshRegistrations(true).catch((error) => {
      if (cancelled) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Connected computers are unavailable right now.');
      setLoadingRegistrations(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedGatewayId) {
      setDoctor(null);
      setWhatsapp(null);
      setTelegram(null);
      setApprovals(null);
      setBrowserSessions(null);
      return;
    }
    let cancelled = false;
    void refreshGatewayDetail(selectedGatewayId, true).catch((error) => {
      if (cancelled) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Device connection state is unavailable right now.');
      setLoadingGatewayDetail(false);
    });
    const intervalId = window.setInterval(() => {
      void refreshGatewayDetail(selectedGatewayId, false).catch((error) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Device connection state is unavailable right now.');
      });
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedGatewayId]);

  async function handleCreatePairingIntent() {
    setBusyActionKey('pairing');
    setErrorMessage(null);
    try {
      const payload = await requestPayload<GatewayPairingIntentRecord>(
        '/api/gateway/pairings/intents',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            display_name: pairingDraft.displayName.trim() || undefined,
            platform: pairingDraft.platform || undefined,
          }),
        },
      );
      setPairingIntent(payload);
      setStatusMessage('Computer pairing is ready. Run the command below on this device to connect it to Sage.');
      await refreshRegistrations(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create a computer pairing token.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleResolveApproval(approvalId: string, decision: 'approved' | 'rejected') {
    if (!selectedGatewayId) {
      return;
    }
    setBusyActionKey(`approval:${approvalId}:${decision}`);
    setErrorMessage(null);
    try {
      await requestPayload<Record<string, unknown>>(
        `/api/gateway/registrations/${encodeURIComponent(selectedGatewayId)}/approvals/${encodeURIComponent(approvalId)}/resolve`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            decision,
            note: decision === 'approved'
              ? 'Approved from the device connection page.'
              : 'Rejected from the device connection page.',
          }),
        },
      );
      setStatusMessage(
        decision === 'approved'
          ? 'Permission accepted and the blocked work resumed.'
          : 'Permission rejected and the blocked work stopped.',
      );
      await refreshGatewayDetail(selectedGatewayId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not resolve the local permission request.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleRevokeGateway() {
    if (!selectedGatewayId || !selectedGateway) {
      return;
    }
    const deviceLabel = readString(selectedGateway.display_name, 'this computer');
    const confirmed = window.confirm(
      `Revoke ${deviceLabel}? Sage will stop using this computer until it is paired again.`,
    );
    if (!confirmed) {
      return;
    }
    setBusyActionKey(`revoke:${selectedGatewayId}`);
    setErrorMessage(null);
    try {
      await requestPayload<Record<string, unknown>>(
        `/api/gateway/registrations/${encodeURIComponent(selectedGatewayId)}/revoke`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            reason: 'Revoked from the device connection page.',
          }),
        },
      );
      setStatusMessage(`${deviceLabel} revoked. Local tools from that computer are now unavailable.`);
      setSelectedGatewayId(null);
      setDoctor(null);
      setWhatsapp(null);
      setTelegram(null);
      setApprovals(null);
      setBrowserSessions(null);
      await refreshRegistrations(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not revoke this computer.');
    } finally {
      setBusyActionKey(null);
    }
  }

  function updateChannelDraft(channel: ChannelKind, patch: Partial<ChannelDraft>) {
    setChannelDrafts((current) => ({
      ...current,
      [channel]: {
        ...current[channel],
        ...patch,
      },
    }));
  }

  async function handleConfigureWhatsApp() {
    if (!selectedGatewayId) {
      return;
    }
    const draft = channelDrafts.whatsapp;
    if (!draft.phoneNumber.trim()) {
      setErrorMessage('Enter the WhatsApp phone number before requesting pairing.');
      return;
    }
    setBusyActionKey('channel:whatsapp:setup');
    setErrorMessage(null);
    try {
      await requestPayload<Record<string, unknown>>(
        `/api/personal-channels/whatsapp/gateways/${encodeURIComponent(selectedGatewayId)}/setup`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            phone_number: draft.phoneNumber.trim(),
          }),
        },
      );
      setStatusMessage('WhatsApp pairing requested. Check the channel state for QR or pairing-code instructions.');
      await refreshGatewayDetail(selectedGatewayId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'WhatsApp pairing could not be requested.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleConfigureTelegram() {
    if (!selectedGatewayId) {
      return;
    }
    const draft = channelDrafts.telegram;
    const apiId = Number.parseInt(draft.apiId.trim(), 10);
    const payload: Record<string, unknown> = {};
    if (Number.isFinite(apiId)) {
      payload.api_id = apiId;
    }
    if (draft.apiHash.trim()) {
      payload.api_hash = draft.apiHash.trim();
    }
    if (draft.phoneNumber.trim()) {
      payload.phone_number = draft.phoneNumber.trim();
    }
    if (draft.loginCode.trim()) {
      payload.login_code = draft.loginCode.trim();
    }
    if (draft.password.trim()) {
      payload.password = draft.password.trim();
    }
    if (Object.keys(payload).length === 0) {
      setErrorMessage('Enter Telegram API details, phone number, or login code before requesting setup.');
      return;
    }
    setBusyActionKey('channel:telegram:setup');
    setErrorMessage(null);
    try {
      await requestPayload<Record<string, unknown>>(
        `/api/personal-channels/telegram/gateways/${encodeURIComponent(selectedGatewayId)}/setup`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      setStatusMessage('Telegram setup requested. Check the channel state for login-code or confirmation instructions.');
      await refreshGatewayDetail(selectedGatewayId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Telegram setup could not be requested.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleSendChannelTest(channel: ChannelKind) {
    if (!selectedGatewayId) {
      return;
    }
    const draft = channelDrafts[channel];
    if (!draft.remoteJid.trim() || !draft.text.trim()) {
      setErrorMessage(`Enter a ${channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'} recipient and test message first.`);
      return;
    }
    const endpointChannel = channel === 'whatsapp' ? 'whatsapp' : 'telegram';
    const actionKey = `channel:${channel}:send-test`;
    setBusyActionKey(actionKey);
    setErrorMessage(null);
    try {
      await requestPayload<Record<string, unknown>>(
        `/api/personal-channels/${endpointChannel}/gateways/${encodeURIComponent(selectedGatewayId)}/messages`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            remote_jid: draft.remoteJid.trim(),
            text: draft.text.trim(),
            idempotency_key: `gateway-operator-${channel}-${Date.now().toString(36)}`,
          }),
        },
      );
      setStatusMessage(`${channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'} test message dispatched through this computer.`);
      await refreshGatewayDetail(selectedGatewayId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The channel test message could not be sent.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleBrowserControl(
    browserSessionId: string,
    action: 'takeover' | 'resume' | 'interrupt',
  ) {
    if (!selectedGatewayId) {
      return;
    }
    const actionKey = `browser:${browserSessionId}:${action}`;
    setBusyActionKey(actionKey);
    setErrorMessage(null);
    try {
      const payload = await requestPayload<Record<string, unknown>>(
        `/api/gateway/registrations/${encodeURIComponent(selectedGatewayId)}/browser/sessions/${encodeURIComponent(browserSessionId)}/${action}`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            run_id: `gateway-operator-${action}-${Date.now().toString(36)}`,
            trace_id: `gateway-operator-${action}-${Date.now().toString(36)}`,
            note: action === 'interrupt'
              ? 'Interrupted from the device connection page.'
              : action === 'takeover'
                ? 'Takeover requested from the device connection page.'
                : 'Resume requested from the device connection page.',
          }),
        },
      );
      const resultStatus = readString((payload as Record<string, unknown> | null)?.status, humanizeToken(action));
      setStatusMessage(`${humanizeToken(action)} request sent. Browser status: ${resultStatus}.`);
      await refreshGatewayDetail(selectedGatewayId, false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not control the local browser session.');
    } finally {
      setBusyActionKey(null);
    }
  }

  const doctorChecks = Array.isArray(doctor?.checks)
    ? doctor.checks.filter((item): item is GatewayDoctorCheckRecord => Boolean(item) && typeof item === 'object')
    : [];

  const doctorStatus = readString(doctor?.status, selectedGateway ? readString(selectedGateway.status, 'unknown') : 'unknown');
  const doctorStatusDisplay = doctorDisplayStatus(doctorStatus);
  const checkpointStatus = summarizeDoctorFacet(doctor?.checkpoint);
  const browserLaneStatus = summarizeDoctorFacet(doctor?.browser);
  const specialistStatus = summarizeDoctorFacet(doctor?.specialists);
  const providerStatus = summarizeDoctorFacet(doctor?.providers);
  const quotaStatus = summarizeDoctorFacet(doctor?.quota);
  const approvalsPendingCount = Number(approvals?.pending_count ?? 0);
  const browserSessionCount = browserItems.length;
  const whatsappRecentCount = Array.isArray(whatsapp?.recent_messages) ? whatsapp.recent_messages.length : 0;
  const telegramRecentCount = Array.isArray(telegram?.recent_messages) ? telegram.recent_messages.length : 0;
  const specialistItems = Array.isArray(readRecord(doctor?.specialists).items)
    ? (readRecord(doctor?.specialists).items as Record<string, unknown>[])
    : [];
  const providerItems = Array.isArray(readRecord(doctor?.providers).items)
    ? (readRecord(doctor?.providers).items as Record<string, unknown>[])
    : [];
  const myComputerStatus = summarizeMyComputerStatus({
    gateways,
    selectedGateway,
    doctorStatus,
    approvalsPendingCount,
    busyActionKey,
    pairingIntentActive: Boolean(pairingIntent),
  });
  const trustSummary = gatewayTrustSummary(selectedGateway);
  const platformToken = String(selectedGateway?.platform ?? pairingDraft.platform ?? '').trim().toLowerCase();
  const normalDeviceTitle = platformToken.includes('mac') || platformToken.includes('darwin')
    ? 'This Mac'
    : platformToken.includes('windows')
      ? 'This Windows PC'
      : platformToken.includes('linux')
        ? 'This Linux computer'
        : 'This computer';
  const normalTrustLabel = myComputerStatus.id === 'online'
    ? (['Trusted', 'Verified'].includes(trustSummary.trustLabel) ? 'Verified' : trustSummary.trustLabel)
    : trustSummary.trustLabel;
  const normalDeviceLine = `${myComputerStatus.label} · ${normalTrustLabel} · Last seen ${trustSummary.lastSeenLabel}`;
  const certificationLanes = buildCertificationLanes({
    myComputerStatus,
    doctorStatus: String(doctorStatus ?? '').trim().toLowerCase(),
    doctorChecks,
    approvalsPendingCount,
    whatsappState: String(whatsapp?.state?.status ?? (whatsapp?.state?.qr_code ? 'pending' : 'idle')).trim().toLowerCase(),
    telegramState: String(telegram?.state?.status ?? (telegram?.state?.login_hint ? 'pending' : 'idle')).trim().toLowerCase(),
  });
  const myComputerCapabilities = summarizeMyComputerCapabilities(selectedGatewayCapabilities, providerItems);
  const showStatusSection = initialSection === 'all' || initialSection === 'status';
  const showChannelsSection = initialSection === 'all' || initialSection === 'channels';
  const showApprovalsSection = initialSection === 'all' || initialSection === 'approvals';
  const showActivitySection = initialSection === 'all' || initialSection === 'activity';
  const pairingDeviceLabel = pairingDraft.platform === 'macos'
    ? 'Mac'
    : pairingDraft.platform === 'windows'
      ? 'Windows PC'
      : pairingDraft.platform === 'linux'
        ? 'Linux computer'
        : 'computer';

  const handlePrimaryAction = () => {
    switch (myComputerStatus.primaryAction.action.kind) {
      case 'connect':
      case 'reconnect':
        void handleCreatePairingIntent();
        return;
      case 'open_approvals':
        if (showApprovalsSection) {
          const firstPendingId = String(pendingApprovals[0]?.approval_id ?? '').trim();
          if (firstPendingId && typeof document !== 'undefined') {
            document.getElementById(`gateway-approval-${firstPendingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        router.push(`/w/${encodeURIComponent(workspaceId)}/gateway-approvals`);
        return;
      case 'revoke':
        void handleRevokeGateway();
        return;
      default:
    }
  };

  return (
    <div className="gateway-operator-pane app-stack-3">
      <WorkstationSurfaceCard
        title={normalDeviceTitle}
        description={normalDeviceLine}
        actions={(
          <WorkstationActionButton
            type="button"
            tone="primary"
            onClick={() => {
              setManageOpen(true);
            }}
          >
            Manage
          </WorkstationActionButton>
        )}
      >
        {statusMessage ? <WorkstationSurfaceNotice tone="success">{statusMessage}</WorkstationSurfaceNotice> : null}
        {errorMessage ? <WorkstationSurfaceNotice tone="danger">{errorMessage}</WorkstationSurfaceNotice> : null}

        <WorkstationSurfaceStatGrid>
          <WorkstationSurfaceStat
            label="State"
            value={<DataBadge tone={myComputerStatus.tone}>{myComputerStatus.label}</DataBadge>}
            hint={myComputerStatus.detail}
          />
          <WorkstationSurfaceStat
            label="Last seen"
            value={trustSummary.lastSeenLabel}
            hint={trustSummary.lastConnectedLabel}
          />
          <WorkstationSurfaceStat
            label="Trust"
            value={trustSummary.trustLabel}
            hint="Revocable device trust for local work"
          />
        </WorkstationSurfaceStatGrid>

        {advancedDiagnosticsVisible ? (
          <FormSection
          title="What Sage can use on this computer"
          description="Capability groups from this paired computer, shown without protocol or token detail."
        >
          <WorkstationSurfaceList>
            {myComputerCapabilities.map((capability) => (
              <WorkstationSurfaceListItem
                key={capability.id}
                title={capability.label}
                description={capability.description}
                actions={(
                  <DataBadge tone={capability.available ? 'success' : 'neutral'}>
                    {capability.available ? 'Available' : 'Not available'}
                  </DataBadge>
                )}
              />
            ))}
          </WorkstationSurfaceList>
          </FormSection>
        ) : null}

        {manualSetupVisible ? (
          <FormSection
          title={`Connect or reconnect this ${pairingDeviceLabel}`}
          description="Create a short-lived connection request when this computer is not connected, reconnecting, or revoked."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormField label="Device label" hint="Human-readable name shown in operator surfaces.">
              <FormInput
                value={pairingDraft.displayName}
                onChange={(event) => {
                  setPairingDraft((current) => ({
                    ...current,
                    displayName: event.currentTarget.value,
                  }));
                }}
                placeholder="My MacBook"
              />
            </FormField>
            <FormReadout
              label="Platform"
              value={`${humanizeToken(pairingDraft.platform, 'Detected device')} · auto-detected`}
            />
          </FormGrid>
          <div className="settings-action-row">
            <WorkstationActionButton
              type="button"
              disabled={busyActionKey === 'pairing'}
              onClick={() => {
              void handleCreatePairingIntent();
            }}
          >
              {busyActionKey === 'pairing' ? 'Creating connection…' : 'Connect this computer'}
            </WorkstationActionButton>
          </div>
          </FormSection>
        ) : null}

        {advancedDiagnosticsVisible ? (
          <FormSection
          title="How this trust lane works"
          description="Default keeps risky local and external actions behind approval. Full Access only applies to a paired user-owned computer."
        >
          <WorkstationSurfaceList>
            {GATEWAY_MODE_SUMMARIES.map((mode) => (
              <WorkstationSurfaceListItem
                key={mode.title}
                title={mode.title}
                subtitle={mode.subtitle}
                description={mode.description}
                actions={(
                  <DataBadge tone={mode.title === 'Default' ? 'success' : 'warning'}>
                    {mode.title === 'Default' ? 'Safe default' : 'Owner approved'}
                  </DataBadge>
                )}
              />
            ))}
          </WorkstationSurfaceList>
          <div className="app-inline-actions app-inline-actions--tight app-inline-actions--wrap">
            {GATEWAY_PERMISSION_CHECKLIST.map((permission) => (
              <DataBadge key={permission} tone="neutral">{permission}</DataBadge>
            ))}
          </div>
          </FormSection>
        ) : null}

        {manualSetupVisible && pairingIntent ? (
          <FormSection
            title="Advanced terminal setup"
            description="Fallback setup for advanced users. Copy one command, paste it into Terminal, and press Return."
            className="gateway-pairing-command-section"
          >
            <FormGrid>
              <FormReadout
                label="Expires"
                value={formatTimestamp(pairingIntent.expires_at)}
              />
              <FormReadout
                label="Suggested device"
                value={readString(pairingIntent.display_name, 'Unlabeled device')}
              />
              <FormReadout
                label="Platform"
                value={humanizeToken(pairingIntent.platform, 'Unknown')}
              />
            </FormGrid>
            <div className="gateway-pairing-command-card">
              <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                <div className="gateway-pairing-command-card__copy">
                  <strong>Run on this computer</strong>
                  <span>Use this only if Empyralis Companion is not already connected.</span>
                </div>
                <div className="app-inline-actions app-inline-actions--tight">
                  <WorkstationActionButton
                    type="button"
                    onClick={() => {
                      void copyToClipboard('Companion command', gatewayPairingCommand(pairingIntent.pairing_token));
                    }}
                  >
                    Copy setup command
                  </WorkstationActionButton>
                </div>
              </div>
              <pre className="gateway-pairing-command">
                <code>{gatewayPairingCommand(pairingIntent.pairing_token)}</code>
              </pre>
            </div>
          </FormSection>
        ) : null}

        {advancedDiagnosticsVisible && loadingRegistrations && !registrationsTimedOut ? (
          <WorkstationSurfaceNotice tone="neutral">Loading connected computers…</WorkstationSurfaceNotice>
        ) : advancedDiagnosticsVisible && gateways.length === 0 ? (
          <EmptyPanel
            title="No computers connected yet"
            body="Pair this computer when you want Sage to use local files, browser sessions, screenshots, clipboard, terminal, or personal channels."
          />
        ) : advancedDiagnosticsVisible ? (
          <WorkstationSurfaceList>
            {gateways.map((gateway) => {
              const gatewayId = String(gateway.gateway_id ?? '').trim();
              const selected = gatewayId === selectedGatewayId;
              return (
                <WorkstationSurfaceListItem
                  key={gatewayId}
                  title={readString(gateway.display_name, gatewayId)}
                  subtitle={`${humanizeToken(gateway.platform, 'Unknown platform')}${selected ? ' · This device' : ''}`}
                  description={`Trust ${humanizeToken(gateway.device_trust_state, 'unknown')} · last seen ${formatRelativeTimestamp(gateway.last_seen_at)}`}
                  actions={(
                    <div className="app-inline-actions app-inline-actions--tight">
                      <DataBadge tone={statusTone(gateway.connection_status ?? gateway.status)}>
                        {humanizeToken(gateway.connection_status ?? gateway.status, 'Unknown')}
                      </DataBadge>
                      <WorkstationActionButton
                        type="button"
                        tone={selected ? 'secondary' : 'primary'}
                        onClick={() => setSelectedGatewayId(gatewayId)}
                      >
                        {selected ? 'Selected' : 'Inspect'}
                      </WorkstationActionButton>
                    </div>
                  )}
                />
              );
            })}
          </WorkstationSurfaceList>
        ) : null}
      </WorkstationSurfaceCard>

      <CommandSheet
        open={manageOpen}
        title="Manage this computer"
        description="Reconnect, revoke trust, or open advanced setup only when needed."
        onClose={() => setManageOpen(false)}
      >
        <div className="app-stack-3">
          <WorkstationSurfaceNotice tone={myComputerStatus.tone === 'danger' ? 'danger' : myComputerStatus.tone === 'warning' ? 'warning' : myComputerStatus.tone === 'success' ? 'success' : 'neutral'}>
            {normalDeviceTitle} · {normalDeviceLine}
          </WorkstationSurfaceNotice>
          <div className="settings-action-row">
            {myComputerStatus.primaryAction.action.kind === 'open_approvals' ? (
              <WorkstationActionButton
                type="button"
                tone="primary"
                disabled={Boolean(myComputerStatus.primaryAction.disabled)}
                onClick={() => {
                  setManageOpen(false);
                  handlePrimaryAction();
                }}
              >
                Approve action
              </WorkstationActionButton>
            ) : null}
            <WorkstationActionButton
              type="button"
              tone="primary"
              disabled={busyActionKey === 'pairing'}
              onClick={() => {
                setManageOpen(false);
                setManualSetupVisible(true);
                void handleCreatePairingIntent();
              }}
            >
              {busyActionKey === 'pairing' ? 'Creating connection…' : selectedGateway ? 'Reconnect' : 'Connect this computer'}
            </WorkstationActionButton>
            {selectedGateway ? (
              <WorkstationActionButton
                type="button"
                tone="danger"
                disabled={busyActionKey === `revoke:${selectedGatewayId}`}
                onClick={() => {
                  setManageOpen(false);
                  void handleRevokeGateway();
                }}
              >
                {busyActionKey === `revoke:${selectedGatewayId}` ? 'Revoking…' : 'Revoke access'}
              </WorkstationActionButton>
            ) : null}
            <WorkstationActionButton
              type="button"
              tone="secondary"
              onClick={() => {
                setManageOpen(false);
                setManualSetupVisible(true);
                if (!pairingIntent) {
                  void handleCreatePairingIntent();
                }
              }}
            >
              Manual setup
            </WorkstationActionButton>
            <WorkstationActionButton
              type="button"
              tone="secondary"
              onClick={() => {
                setStatusMessage(null);
                setErrorMessage(null);
                setManageOpen(false);
                setAdvancedDiagnosticsVisible(true);
                void refreshRegistrations(true)
                  .then(() => (selectedGatewayId ? refreshGatewayDetail(selectedGatewayId, false, true) : undefined))
                  .catch((error) => {
                    setErrorMessage(error instanceof Error ? error.message : 'Could not refresh device connection state.');
                  });
              }}
            >
              Advanced diagnostics
            </WorkstationActionButton>
          </div>
        </div>
      </CommandSheet>

      {selectedGateway && showStatusSection && advancedDiagnosticsVisible ? (
        <WorkstationSurfaceCard
          title="Connection details"
          description="Trust, health, reconnect posture, and advanced diagnostics for the selected computer."
        >
          {loadingGatewayDetail ? (
            <WorkstationSurfaceNotice tone="neutral">Refreshing local device diagnostics…</WorkstationSurfaceNotice>
          ) : null}

          <FormGrid>
            <FormReadout label="Computer" value={readString(selectedGateway.display_name, 'This computer')} />
            <FormReadout label="State" value={<DataBadge tone={myComputerStatus.tone}>{myComputerStatus.label}</DataBadge>} />
            <FormReadout label="Platform" value={humanizeToken(selectedGateway.platform, 'Unknown')} />
            <FormReadout label="Trust state" value={trustSummary.trustLabel} />
            <FormReadout label="Last connected" value={trustSummary.lastConnectedLabel} />
            <FormReadout label="Last seen" value={trustSummary.lastSeenLabel} />
            <FormReadout label="Health" value={<DataBadge tone={doctorStatusDisplay.tone}>{doctorStatusDisplay.label}</DataBadge>} />
            <FormReadout label="Browser readiness" value={<DataBadge tone={statusTone(readRecord(doctor?.browser).status)}>{browserLaneStatus.status}</DataBadge>} />
            <FormReadout label="AI model reachability" value={<DataBadge tone={statusTone(readRecord(doctor?.providers).status)}>{providerStatus.status}</DataBadge>} />
            <FormReadout label="Needs your OK waiting" value={String(approvalsPendingCount)} />
          </FormGrid>

          <FormSection
            title="Launch certification lanes"
            description="Phone and web should make computer status, approvals, recovery, and channel health obvious."
          >
            <WorkstationSurfaceList>
              {certificationLanes.map((lane) => (
                <WorkstationSurfaceListItem
                  key={lane.id}
                  title={lane.title}
                  subtitle={lane.subtitle}
                  description={lane.description}
                  actions={(
                    <DataBadge tone={lane.tone}>
                      {lane.subtitle}
                    </DataBadge>
                  )}
                />
              ))}
            </WorkstationSurfaceList>
          </FormSection>

          <FormSection
            title="Revoke this computer"
            description="Revocation is immediate and server-side. The computer must be paired again before Sage can use its local tools or personal channels."
          >
            <div className="settings-action-row">
              <WorkstationActionButton
                type="button"
                tone="danger"
                disabled={busyActionKey === `revoke:${selectedGatewayId}`}
                onClick={() => {
                  void handleRevokeGateway();
                }}
              >
                {busyActionKey === `revoke:${selectedGatewayId}` ? 'Revoking…' : 'Revoke access'}
              </WorkstationActionButton>
            </div>
          </FormSection>

          {(readRecord(doctor?.checkpoint).status || readRecord(doctor?.browser).status || readRecord(doctor?.specialists).status || readRecord(doctor?.providers).status || readRecord(doctor?.quota).status) ? (
            <WorkstationSurfaceList>
              <WorkstationSurfaceListItem
                title="Resume readiness"
                subtitle={checkpointStatus.status}
                description={checkpointStatus.summary}
                actions={(
                  <DataBadge tone={statusTone(readRecord(doctor?.checkpoint).status)}>
                    {checkpointStatus.status}
                  </DataBadge>
                )}
              />
              <WorkstationSurfaceListItem
                title="Browser connection"
                subtitle={browserLaneStatus.status}
                description={browserLaneStatus.summary}
                actions={(
                  <DataBadge tone={statusTone(readRecord(doctor?.browser).status)}>
                    {browserLaneStatus.status}
                  </DataBadge>
                )}
              />
              <WorkstationSurfaceListItem
                title="Build assistant health"
                subtitle={specialistStatus.status}
                description={specialistStatus.summary}
                actions={(
                  <DataBadge tone={statusTone(readRecord(doctor?.specialists).status)}>
                    {specialistStatus.status}
                  </DataBadge>
                )}
              />
              <WorkstationSurfaceListItem
                title="Model provider reachability"
                subtitle={providerStatus.status}
                description={providerStatus.summary}
                actions={(
                  <DataBadge tone={statusTone(readRecord(doctor?.providers).status)}>
                    {providerStatus.status}
                  </DataBadge>
                )}
              />
              <WorkstationSurfaceListItem
                title="Usage limit"
                subtitle={quotaStatus.status}
                description={quotaStatus.summary}
                actions={(
                  <DataBadge tone={statusTone(readRecord(doctor?.quota).status)}>
                    {quotaStatus.status}
                  </DataBadge>
                )}
              />
            </WorkstationSurfaceList>
          ) : null}

          {specialistItems.length > 0 ? (
            <WorkstationSurfaceList>
              {specialistItems.map((item) => (
                <WorkstationSurfaceListItem
                  key={readString(item.deployed_agent_id, readString(item.name, 'specialist'))}
                  title={readString(item.name, 'Build assistant')}
                  subtitle={humanizeToken(item.deployment_state, 'Unknown')}
                  description={readString(item.summary, 'No detail available.')}
                  actions={(
                    <DataBadge tone={statusTone(item.status)}>
                      {humanizeToken(item.status, 'Unknown')}
                    </DataBadge>
                  )}
                />
              ))}
            </WorkstationSurfaceList>
          ) : null}

          {providerItems.length > 0 ? (
            <WorkstationSurfaceList>
              {providerItems.map((item) => (
                <WorkstationSurfaceListItem
                  key={readString(item.id, readString(item.label, 'provider'))}
                  title={readString(item.label, 'AI model provider')}
                  subtitle={humanizeToken(item.state, 'Unknown')}
                  description={readString(item.state_detail, 'No AI model provider detail available.')}
                  actions={(
                    <DataBadge tone={statusTone(item.state === 'active' ? 'pass' : 'fail')}>
                      {humanizeToken(item.state, 'Unknown')}
                    </DataBadge>
                  )}
                />
              ))}
            </WorkstationSurfaceList>
          ) : null}

          {doctorChecks.length > 0 ? (
            <WorkstationSurfaceList>
              {doctorChecks.map((check) => (
                <WorkstationSurfaceListItem
                  key={readString(check.id, 'check')}
                  title={humanizeToken(check.id, 'Check')}
                  description={readString(check.summary, 'No detail available.')}
                  actions={(
                    <DataBadge tone={statusTone(check.status)}>
                      {humanizeToken(check.status, 'Unknown')}
                    </DataBadge>
                  )}
                />
              ))}
            </WorkstationSurfaceList>
          ) : (
            <EmptyPanel
              title="No device checks yet"
              body="Pair and connect this computer to populate health and personal channel status."
            />
          )}
        </WorkstationSurfaceCard>
      ) : null}

      {selectedGateway && showChannelsSection && advancedDiagnosticsVisible ? (
        <WorkstationSurfaceCard
          title="Personal Channels"
          description="Current login, linked identity, and recent activity for personal WhatsApp and Telegram on this computer."
        >
          <WorkstationSurfaceNotice tone="neutral">
            Telegram and WhatsApp are the live personal channels on this paired computer. Signal is next, iMessage waits for a stable Mac bridge, and Discord stays in the Studio/business lane.
          </WorkstationSurfaceNotice>
          <WorkstationSurfaceList>
            <WorkstationSurfaceListItem
              title="WhatsApp personal"
              subtitle={whatsapp?.state?.linked_name || whatsapp?.state?.linked_jid || (whatsapp?.state?.qr_code ? 'QR ready' : humanizeToken(whatsapp?.state?.status, 'Idle'))}
              description={`${summarizeWhatsappState(whatsapp?.state)}${whatsappRecentCount > 0 ? ` · ${whatsappRecentCount} recent message${whatsappRecentCount === 1 ? '' : 's'} loaded.` : ''}`}
              actions={(
                <DataBadge tone={statusTone(whatsapp?.state?.status ?? (whatsapp?.state?.qr_code ? 'pending' : 'idle'))}>
                  {whatsapp?.state?.qr_code ? 'QR ready' : humanizeToken(whatsapp?.state?.status, 'Idle')}
                </DataBadge>
              )}
            />
            {whatsapp?.state?.qr_code ? (
              <FormReadout
                label="WhatsApp pairing"
                value="QR ready to scan on this computer"
              />
            ) : null}
            <WorkstationSurfaceListItem
              title="Telegram personal"
              subtitle={telegram?.state?.linked_name || telegram?.state?.linked_username || (telegram?.state?.login_hint ? 'Code required' : humanizeToken(telegram?.state?.status, 'Idle'))}
              description={`${summarizeTelegramState(telegram?.state)}${telegramRecentCount > 0 ? ` · ${telegramRecentCount} recent message${telegramRecentCount === 1 ? '' : 's'} loaded.` : ''}`}
              actions={(
                <DataBadge tone={statusTone(telegram?.state?.status ?? (telegram?.state?.login_hint ? 'pending' : 'idle'))}>
                  {telegram?.state?.login_hint ? 'Code required' : humanizeToken(telegram?.state?.status, 'Idle')}
                </DataBadge>
              )}
            />
            {telegram?.state?.login_hint ? (
              <FormReadout
                label="Telegram login hint"
                value={readString(telegram.state.login_hint, 'Waiting for this computer to confirm Telegram login.')}
              />
            ) : null}
          </WorkstationSurfaceList>
          <FormSection
            title="WhatsApp setup and test"
            description="Request local WhatsApp pairing on this computer, then send a controlled test message through the user-owned session."
          >
            <FormGrid columns="repeat(2, minmax(0, 1fr))">
              <FormField label="Phone number" hint="Used only by this computer to request WhatsApp pairing.">
                <FormInput
                  value={channelDrafts.whatsapp.phoneNumber}
                  onChange={(event) => updateChannelDraft('whatsapp', { phoneNumber: event.currentTarget.value })}
                  placeholder="8618657105303"
                />
              </FormField>
              <FormField label="Recipient" hint="Phone number or chat identifier for the controlled test.">
                <FormInput
                  value={channelDrafts.whatsapp.remoteJid}
                  onChange={(event) => updateChannelDraft('whatsapp', { remoteJid: event.currentTarget.value })}
                  placeholder="8618657105303"
                />
              </FormField>
              <FormField label="Test message" hint="This is sent through the paired device and audited.">
                <FormInput
                  value={channelDrafts.whatsapp.text}
                  onChange={(event) => updateChannelDraft('whatsapp', { text: event.currentTarget.value })}
                />
              </FormField>
              <FormReadout
                label="Logout/revoke"
                value="Use Revoke access for this computer to immediately disable WhatsApp local tools."
              />
            </FormGrid>
            <div className="settings-action-row">
              <WorkstationActionButton
                type="button"
                tone="secondary"
                disabled={!whatsappConfigureAvailable || busyActionKey === 'channel:whatsapp:setup'}
                onClick={() => {
                  void handleConfigureWhatsApp();
                }}
              >
                {busyActionKey === 'channel:whatsapp:setup' ? 'Requesting…' : 'Request pairing'}
              </WorkstationActionButton>
              <WorkstationActionButton
                type="button"
                disabled={!whatsappOutboundAvailable || busyActionKey === 'channel:whatsapp:send-test'}
                onClick={() => {
                  void handleSendChannelTest('whatsapp');
                }}
              >
                {busyActionKey === 'channel:whatsapp:send-test' ? 'Sending…' : 'Send test'}
              </WorkstationActionButton>
            </div>
          </FormSection>
          <FormSection
            title="Telegram setup and test"
            description="Configure the local Telegram session on this computer, then send a controlled test message through the user-owned session."
          >
            <FormGrid columns="repeat(2, minmax(0, 1fr))">
              <FormField label="Telegram app ID" hint="Used only for this computer's Telegram login.">
                <FormInput
                  type="number"
                  value={channelDrafts.telegram.apiId}
                  onChange={(event) => updateChannelDraft('telegram', { apiId: event.currentTarget.value })}
                  placeholder="123456"
                />
              </FormField>
              <FormField label="Telegram app secret" hint="Stored only in this computer's Telegram setup path.">
                <FormInput
                  type="password"
                  value={channelDrafts.telegram.apiHash}
                  onChange={(event) => updateChannelDraft('telegram', { apiHash: event.currentTarget.value })}
                  placeholder="Telegram app secret"
                />
              </FormField>
              <FormField label="Phone number" hint="Used by Telegram login on this computer.">
                <FormInput
                  value={channelDrafts.telegram.phoneNumber}
                  onChange={(event) => updateChannelDraft('telegram', { phoneNumber: event.currentTarget.value })}
                  placeholder="+8618657105303"
                />
              </FormField>
              <FormField label="Login code" hint="Enter only when Telegram asks for a code.">
                <FormInput
                  value={channelDrafts.telegram.loginCode}
                  onChange={(event) => updateChannelDraft('telegram', { loginCode: event.currentTarget.value })}
                />
              </FormField>
              <FormField label="2FA password" hint="Optional. Required only for Telegram accounts with 2FA enabled.">
                <FormInput
                  type="password"
                  value={channelDrafts.telegram.password}
                  onChange={(event) => updateChannelDraft('telegram', { password: event.currentTarget.value })}
                />
              </FormField>
              <FormField label="Recipient" hint="Telegram user, chat, or channel for the controlled test.">
                <FormInput
                  value={channelDrafts.telegram.remoteJid}
                  onChange={(event) => updateChannelDraft('telegram', { remoteJid: event.currentTarget.value })}
                  placeholder="123456789"
                />
              </FormField>
              <FormField label="Test message" hint="This is sent through the paired device and audited.">
                <FormInput
                  value={channelDrafts.telegram.text}
                  onChange={(event) => updateChannelDraft('telegram', { text: event.currentTarget.value })}
                />
              </FormField>
              <FormReadout
                label="Logout/revoke"
                value="Use Revoke access for this computer to immediately disable Telegram local tools."
              />
            </FormGrid>
            <div className="settings-action-row">
              <WorkstationActionButton
                type="button"
                tone="secondary"
                disabled={!telegramConfigureAvailable || busyActionKey === 'channel:telegram:setup'}
                onClick={() => {
                  void handleConfigureTelegram();
                }}
              >
                {busyActionKey === 'channel:telegram:setup' ? 'Requesting…' : 'Request setup'}
              </WorkstationActionButton>
              <WorkstationActionButton
                type="button"
                disabled={!telegramOutboundAvailable || busyActionKey === 'channel:telegram:send-test'}
                onClick={() => {
                  void handleSendChannelTest('telegram');
                }}
              >
                {busyActionKey === 'channel:telegram:send-test' ? 'Sending…' : 'Send test'}
              </WorkstationActionButton>
            </div>
          </FormSection>
        </WorkstationSurfaceCard>
      ) : null}

      {selectedGateway && showApprovalsSection && advancedDiagnosticsVisible ? (
        <WorkstationSurfaceCard
          title="Needs your OK requests"
          description="Resolve risky local actions without leaving the product shell."
        >
          {pendingApprovals.length === 0 ? (
            <EmptyPanel
              title="No permission requests waiting"
              body="Risky local actions will appear here with explicit approve and reject controls."
            />
          ) : (
            <WorkstationSurfaceList>
              {pendingApprovals.map((approval) => {
                const approvalId = String(approval.approval_id ?? '').trim();
                const busyApprove = busyActionKey === `approval:${approvalId}:approved`;
                const busyReject = busyActionKey === `approval:${approvalId}:rejected`;
                const busy = busyApprove || busyReject;
                return (
                  <WorkstationSurfaceListItem
                    key={approvalId}
                    title={humanizeToken(approval.capability_id, 'Local permission request')}
                    subtitle={`${approvalId} · Run ${readString(approval.run_id, 'unlinked')}`}
                    description={readString(approval.note, 'Needs your OK before Sage can continue on the paired device.')}
                    actions={(
                      <div className="app-inline-actions app-inline-actions--tight">
                        <DataBadge tone={statusTone(approval.status)}>
                          {humanizeToken(approval.status, 'Pending')}
                        </DataBadge>
                        <WorkstationActionButton
                          type="button"
                          tone="secondary"
                          disabled={busy}
                          onClick={() => {
                            void handleResolveApproval(approvalId, 'approved');
                          }}
                        >
                          {busyApprove ? 'Approving…' : 'Approve'}
                        </WorkstationActionButton>
                        <WorkstationActionButton
                          type="button"
                          tone="danger"
                          disabled={busy}
                          onClick={() => {
                            void handleResolveApproval(approvalId, 'rejected');
                          }}
                        >
                          {busyReject ? 'Rejecting…' : 'Reject'}
                        </WorkstationActionButton>
                      </div>
                    )}
                  />
                );
              })}
            </WorkstationSurfaceList>
          )}
        </WorkstationSurfaceCard>
      ) : null}

      {selectedGateway && showActivitySection && advancedDiagnosticsVisible ? (
        <WorkstationSurfaceCard
          title="Device activity"
          description="Inspect governed browser sessions and recent local browser activity without dropping into raw APIs."
        >
          {browserItems.length === 0 ? (
            <EmptyPanel
              title="No device activity tracked"
              body="Once this computer starts or attaches a browser session, it will appear here with governed control actions."
            />
          ) : (
            <WorkstationSurfaceList>
              {browserItems.map((session) => {
                const browserSessionId = String(session.browser_session_id ?? '').trim();
                const sessionMode = humanizeToken((session.metadata || {}).browser_session_mode, 'Managed profile');
                const resumeSupported = Boolean(session.resume_supported ?? true);
                return (
                  <WorkstationSurfaceListItem
                    key={browserSessionId}
                    title={readString(session.session_profile, browserSessionId)}
                    subtitle={`${sessionMode} · ${resumeSupported ? 'Resume ready' : 'Resume unavailable'} · ${browserSessionId}`}
                    description={readString(session.current_url, 'No active URL reported yet.')}
                    actions={(
                      <div className="app-inline-actions app-inline-actions--tight">
                        <DataBadge tone={statusTone(session.status)}>
                          {humanizeToken(session.status, 'Unknown')}
                        </DataBadge>
                        <WorkstationActionButton
                          type="button"
                          tone="secondary"
                          disabled={Boolean(busyActionKey)}
                          onClick={() => {
                            void handleBrowserControl(browserSessionId, 'takeover');
                          }}
                        >
                          {busyActionKey === `browser:${browserSessionId}:takeover` ? 'Working…' : 'Takeover'}
                        </WorkstationActionButton>
                        <WorkstationActionButton
                          type="button"
                          tone="secondary"
                          disabled={Boolean(busyActionKey) || !resumeSupported}
                          onClick={() => {
                            void handleBrowserControl(browserSessionId, 'resume');
                          }}
                        >
                          {busyActionKey === `browser:${browserSessionId}:resume` ? 'Working…' : 'Resume'}
                        </WorkstationActionButton>
                        <WorkstationActionButton
                          type="button"
                          tone="danger"
                          disabled={Boolean(busyActionKey)}
                          onClick={() => {
                            void handleBrowserControl(browserSessionId, 'interrupt');
                          }}
                        >
                          {busyActionKey === `browser:${browserSessionId}:interrupt` ? 'Working…' : 'Interrupt'}
                        </WorkstationActionButton>
                      </div>
                    )}
                  />
                );
              })}
            </WorkstationSurfaceList>
          )}
        </WorkstationSurfaceCard>
      ) : null}
    </div>
  );
}
