'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  ChevronLeft,
  FolderOpen,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  AGENT_ROLE_OPTIONS,
  CONNECTOR_CATALOG,
  type ConnectorCatalogEntry,
  type ConnectorCatalogStatus,
  DEFAULT_CONNECTOR_LABELS,
  DEFAULT_CONNECTOR_OPTIONS,
  type AgentRoleId,
  type ConnectorId,
  isConnectorId,
} from '../page.catalog';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import AiAccountsPanel from '@/components/orion/connections/AiAccountsPanel';
import { ConnectorLogoMark } from '@/components/orion/connections/ConnectionMarks';
import { PageFilterBar } from '@/components/orion/page/PageFilterBar';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';

const WORKSPACE_ID = 'default';
const RUNTIME_TIMEOUT_MS = 3500;

type ConnectorRow = {
  id: string;
  label: string;
  connector: ConnectorId;
  workspace_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type ConnectModalState = {
  label: string;
  connector: ConnectorId;
  agentRole: '' | AgentRoleId;
  googleUseLocalAuth: boolean;
  botToken: string;
  chatId: string;
  webhookUrl: string;
  discordBotToken: string;
  discordChannelId: string;
  discordGuildId: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
  accessToken: string;
  instagramAccountId: string;
  instagramPageId: string;
  calendarId: string;
  timezone: string;
};

type TestResult = {
  ok?: boolean;
  status?: number;
  message?: string;
  warning?: string | null;
  profile?: {
    emailAddress?: string | null;
    displayName?: string | null;
    mail?: string | null;
    userPrincipalName?: string | null;
  } | null;
  mail_access?: boolean;
  calendar_access?: boolean;
  files_access?: boolean;
  warnings?: string[];
  calendars_preview?: Array<{ id?: string; name?: string }>;
  drive?: { id?: string; driveType?: string; webUrl?: string } | null;
};

type MicrosoftDriveItem = {
  id?: string;
  name?: string;
  kind?: string;
  path?: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
};

type MicrosoftDriveBrowserState = {
  open: boolean;
  loading: boolean;
  path: string;
  items: MicrosoftDriveItem[];
  error: string;
};

type GoogleDriveItem = {
  id?: string;
  name?: string;
  kind?: string;
  path?: string;
  webUrl?: string;
  size?: number;
  modifiedTime?: string;
  mimeType?: string;
};

type GoogleDriveBrowserState = {
  open: boolean;
  loading: boolean;
  path: string;
  items: GoogleDriveItem[];
  error: string;
};

type DesktopBridge = {
  openExternal?: (target: string) => Promise<boolean>;
};

type ConnectorVisual = {
  assetSrc?: string;
  bg: string;
  border: string;
};

const EMPTY_FORM: ConnectModalState = {
  label: '',
  connector: 'google_workspace',
  agentRole: '',
  googleUseLocalAuth: true,
  botToken: '',
  chatId: '',
  webhookUrl: '',
  discordBotToken: '',
  discordChannelId: '',
  discordGuildId: '',
  accountSid: '',
  authToken: '',
  fromNumber: 'whatsapp:',
  toNumber: 'whatsapp:',
  accessToken: '',
  instagramAccountId: '',
  instagramPageId: '',
  calendarId: 'primary',
  timezone: 'UTC',
};

const ASSET_TILE_BG = 'var(--bg-element)';
const ASSET_TILE_BORDER = 'var(--border-subtle)';

const CONNECTOR_VISUALS: Record<string, ConnectorVisual> = {
  google_workspace: {
    assetSrc: '/connector-logos/google-workspace.svg',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  telegram_bot: {
    assetSrc: '/connector-logos/telegram.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  wechat_work: {
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  whatsapp_twilio: {
    assetSrc: '/connector-logos/whatsapp-business.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  discord_bot: {
    assetSrc: '/connector-logos/discord.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  instagram_business: {
    assetSrc: '/connector-logos/meta-business.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  microsoft_365: {
    assetSrc: '/connector-logos/microsoft-365.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  x_twitter: {
    assetSrc: '/connector-logos/x.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  youtube: {
    assetSrc: '/connector-logos/youtube.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  tiktok_business: {
    assetSrc: '/connector-logos/tiktok.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  custom_api: {
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
  discord: {
    assetSrc: '/connector-logos/discord.png',
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  },
};

function formatDate(value?: string | null): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function connectorLabel(value: ConnectorId): string {
  return DEFAULT_CONNECTOR_LABELS[value] || value;
}

function catalogEntryForConnector(connector: ConnectorId): ConnectorCatalogEntry | null {
  for (const section of CONNECTOR_CATALOG) {
    const item = section.items.find((entry) => entry.connector === connector || entry.id === connector);
    if (item) return item;
  }
  return null;
}

function resolveCatalogConnectorId(item: Pick<ConnectorCatalogEntry, 'id' | 'connector'>): ConnectorId | null {
  if (item.connector) return item.connector;
  if (isConnectorId(item.id)) return item.id;
  if (item.id === 'discord') return 'discord_bot';
  return null;
}

function connectorVisual(id: string): ConnectorVisual {
  return CONNECTOR_VISUALS[id] || {
    bg: ASSET_TILE_BG,
    border: ASSET_TILE_BORDER,
  };
}

function ConnectorMark({ id, size }: { id: string; size: number }) {
  const visual = connectorVisual(id);
  if (!visual.assetSrc) {
    return <ConnectorLogoMark id={id as Parameters<typeof ConnectorLogoMark>[0]['id']} size={size} />;
  }
  const innerSize = Math.round(size * (visual.assetSrc ? 0.88 : 0.76));

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.24)),
        background: visual.bg,
        border: `1px solid ${visual.border}`,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <Image
        src={visual.assetSrc}
        alt=""
        aria-hidden="true"
        unoptimized
        width={innerSize}
        height={innerSize}
        style={{
          width: innerSize,
          height: innerSize,
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

function agentRoleLabel(value?: unknown): string {
  const role = AGENT_ROLE_OPTIONS.find((item) => item.id === value);
  return role?.label || 'Shared';
}

function rowIdentity(row: ConnectorRow): string {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const value = String(
    (metadata as Record<string, unknown>).emailAddress
      || (metadata as Record<string, unknown>).email
      || (metadata as Record<string, unknown>).userPrincipalName
      || (metadata as Record<string, unknown>).chat_id
      || (metadata as Record<string, unknown>).channel_id
      || (metadata as Record<string, unknown>).instagram_account_id
      || (metadata as Record<string, unknown>).page_id
      || (metadata as Record<string, unknown>).from_number
      || (metadata as Record<string, unknown>).calendar_id
      || ''
  ).trim();
  return value || 'Shared access';
}

function rowPaused(row: ConnectorRow): boolean {
  const paused = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>).paused : false;
  return paused === true;
}

function rowAssignedRole(row: ConnectorRow): '' | AgentRoleId {
  const raw = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>).agent_role : '';
  return AGENT_ROLE_OPTIONS.some((item) => item.id === raw) ? (raw as AgentRoleId) : '';
}

function rowRoutingLabel(row: ConnectorRow): string {
  const assigned = rowAssignedRole(row);
  return assigned ? `Used by ${agentRoleLabel(assigned)}` : 'Available to shared workflows';
}

function busyActionLabel(value: string): string {
  if (value === 'test') return 'Checking access and scopes…';
  if (value === 'pause') return 'Saving connector state…';
  if (value === 'assign') return 'Updating worker ownership…';
  if (value === 'remove') return 'Removing this connection…';
  if (value === 'google-doc') return 'Creating a Google Doc…';
  if (value === 'google-sheet') return 'Creating a Google Sheet…';
  return '';
}

function googleDriveOpenLabel(item: GoogleDriveItem): string {
  const mimeType = String(item.mimeType || '').toLowerCase();
  if (mimeType.startsWith('application/vnd.google-apps')) return 'Open in Google';
  return 'Open file';
}

function microsoftDriveOpenLabel(): string {
  return 'Open in Microsoft';
}

function normalizeConnectionsError(message?: string | null): string {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();
  if (
    !normalized ||
    lowered === 'failed to fetch' ||
    lowered.includes('networkerror') ||
    lowered.includes('load failed') ||
    lowered.includes('aborted') ||
    lowered.includes('timed out')
  ) {
    return 'Couldn’t reach the local runtime. Start Empyralist services to load system access and integration status.';
  }
  return normalized;
}

function statusStyles(active: boolean) {
  if (active) {
    return {
      color: 'var(--success-fg)',
      border: '1px solid var(--success-border)',
      background: 'var(--success-bg)',
    };
  }
  return {
    color: 'var(--warning-fg)',
    border: '1px solid var(--warning-border)',
    background: 'var(--warning-bg)',
  };
}

function capabilityTone(enabled: boolean): React.CSSProperties {
  return enabled
    ? { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' }
    : { color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' };
}

function microsoftDisplayAccount(row: ConnectorRow, test?: TestResult): string {
  const testValue = String(test?.profile?.mail || test?.profile?.userPrincipalName || '').trim();
  if (testValue) return testValue;
  return rowIdentity(row);
}

function googleDisplayAccount(row: ConnectorRow, test?: TestResult): string {
  const testValue = String(test?.profile?.emailAddress || '').trim();
  if (testValue) return testValue;
  return rowIdentity(row);
}

function microsoftSuiteSummary(row: ConnectorRow, test?: TestResult) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  const driveId = String(test?.drive?.id || metadata.drive_id || '').trim();
  const driveType = String(test?.drive?.driveType || metadata.drive_type || '').trim();
  const accountName = String(test?.profile?.displayName || metadata.displayName || '').trim();
  const calendars = Array.isArray(test?.calendars_preview) ? test.calendars_preview : [];
  return {
    accountName: accountName || 'Microsoft workspace account',
    accountEmail: microsoftDisplayAccount(row, test),
    driveLabel: driveType ? `${driveType} drive` : driveId ? 'OneDrive ready' : 'OneDrive pending',
    driveId,
    calendars,
  };
}

function googleSuiteSummary(row: ConnectorRow, test?: TestResult) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  const driveType = String(test?.drive?.driveType || metadata.drive_type || '').trim();
  const calendars = Array.isArray(test?.calendars_preview) ? test.calendars_preview : [];
  return {
    accountName: 'Google Workspace account',
    accountEmail: googleDisplayAccount(row, test),
    driveLabel: driveType || (test?.files_access ? 'Google Drive ready' : 'Drive scope pending'),
    calendars,
  };
}

type SuiteCapability = {
  label: string;
  note: string;
  enabled: boolean;
};

function googleSuiteCapabilities(test?: TestResult): SuiteCapability[] {
  return [
    { label: 'Gmail', note: 'Draft and send customer follow-up', enabled: true },
    { label: 'Calendar', note: 'Create booking events and holds', enabled: test?.calendar_access === true },
    { label: 'Drive', note: 'Browse files and open Google assets', enabled: test?.files_access === true },
    { label: 'Docs', note: 'Create Google Docs directly from the connector', enabled: test?.files_access === true },
    { label: 'Sheets', note: 'Create Google Sheets for shared tracking', enabled: test?.files_access === true },
  ];
}

function microsoftSuiteCapabilities(test?: TestResult): SuiteCapability[] {
  return [
    { label: 'Outlook', note: 'Draft and send customer follow-up', enabled: test?.mail_access === true },
    { label: 'Calendar', note: 'Create booking events and holds', enabled: test?.calendar_access === true },
    { label: 'OneDrive', note: 'Browse and sync remote files', enabled: test?.files_access === true },
    { label: 'Excel', note: 'Run Spreadsheet Ops on OneDrive files', enabled: test?.files_access === true },
    { label: 'Word', note: 'Create and update .docx through Document Studio', enabled: test?.files_access === true },
    { label: 'PowerPoint', note: 'Create and update .pptx decks natively', enabled: test?.files_access === true },
  ];
}

function suiteReadinessLabel(capabilities: SuiteCapability[]): string {
  const readyCount = capabilities.filter((capability) => capability.enabled).length;
  return `${readyCount}/${capabilities.length} suite actions ready`;
}

type CatalogViewFilter = 'all' | 'connected' | 'available';
type ConnectorRoadmapTier = 'core' | 'next' | 'later';

function connectorRoadmapTier(entry: ConnectorCatalogEntry): ConnectorRoadmapTier {
  if (
    entry.id === 'google_workspace'
    || entry.id === 'microsoft_365'
    || entry.id === 'telegram_bot'
    || entry.id === 'wechat_work'
    || entry.id === 'whatsapp_twilio'
    || entry.id === 'discord'
    || entry.id === 'discord_bot'
    || entry.id === 'custom_api'
  ) {
    return 'core';
  }
  if (
    entry.id === 'instagram_business'
    || entry.id === 'x_twitter'
    || entry.id === 'youtube'
    || entry.id === 'tiktok_business'
  ) {
    return 'next';
  }
  return 'later';
}

const CONNECTOR_CHIP_STYLE_NEUTRAL: React.CSSProperties = {
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-element)',
};

const CONNECTOR_CHIP_STYLE_SUBTLE: React.CSSProperties = {
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-element)',
};

const ROADMAP_TIER_META: Record<ConnectorRoadmapTier, { label: string; description: string; style: React.CSSProperties }> = {
  core: {
    label: 'Direct support',
    description: 'Managed directly in Platform.',
    style: CONNECTOR_CHIP_STYLE_NEUTRAL,
  },
  next: {
    label: 'Planned next',
    description: 'Prioritized after the core set.',
    style: CONNECTOR_CHIP_STYLE_SUBTLE,
  },
  later: {
    label: 'Long-tail',
    description: 'Added when demand is proven.',
    style: CONNECTOR_CHIP_STYLE_SUBTLE,
  },
};

function buildPackLaunchHref(args: {
  pack: string;
  goal?: string;
  primary?: string;
  secondary?: string;
  tertiary?: string;
  deck?: 'context' | 'control' | 'inspect';
}): string {
  const params = new URLSearchParams();
  params.set('pack', args.pack);
  params.set('deck', args.deck || 'control');
  if (args.goal) params.set('goal', args.goal);
  if (args.primary) params.set('primary', args.primary);
  if (args.secondary) params.set('secondary', args.secondary);
  if (args.tertiary) params.set('tertiary', args.tertiary);
  return `/workspace?${params.toString()}`;
}

const CONNECTOR_CATALOG_BADGES: Record<ConnectorCatalogStatus, { label: string; style: React.CSSProperties }> = {
  native_now: {
    label: 'Ready now',
    style: CONNECTOR_CHIP_STYLE_NEUTRAL,
  },
  provider_next: {
    label: 'Planned',
    style: CONNECTOR_CHIP_STYLE_SUBTLE,
  },
  custom_build: {
    label: 'Custom',
    style: CONNECTOR_CHIP_STYLE_SUBTLE,
  },
};

const CONNECTOR_DIRECTORY_STATUS_META: Record<ConnectorCatalogStatus, { label: string; note: string }> = {
  native_now: {
    label: 'Ready now',
    note: 'Can be connected now',
  },
  provider_next: {
    label: 'Planned',
    note: 'Will follow after core coverage',
  },
  custom_build: {
    label: 'Custom',
    note: 'Needs a tailored connection flow',
  },
};

function connectorTierLabel(tier: ConnectorRoadmapTier): string {
  if (tier === 'core') return 'Direct support';
  if (tier === 'next') return 'Planned next';
  return 'Long-tail';
}

function CredentialsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [catalogViewFilter, setCatalogViewFilter] = useState<CatalogViewFilter>('all');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalLockedConnector, setModalLockedConnector] = useState<ConnectorId | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState<ConnectModalState>(EMPTY_FORM);
  const [rowBusy, setRowBusy] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [driveBrowsers, setDriveBrowsers] = useState<Record<string, MicrosoftDriveBrowserState>>({});
  const [googleDriveBrowsers, setGoogleDriveBrowsers] = useState<Record<string, GoogleDriveBrowserState>>({});
  const [configuredRowId, setConfiguredRowId] = useState('');
  const [focusedCatalogId, setFocusedCatalogId] = useState<string>('');
  const [showTelegramAdvanced, setShowTelegramAdvanced] = useState(false);
  const focusedCatalogEntryRef = useRef<HTMLDivElement | null>(null);
  const modalScrollLockRef = useRef(0);
  const onboardingModalOpenedRef = useRef(false);
  const onboardingMode = searchParams.get('onboarding') === '1';
  const requestedConnector = String(searchParams.get('connector') || '').trim();
  const returnTo = String(searchParams.get('return_to') || '/setup').trim() || '/setup';
  const desktopBridge = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const scopedWindow = window as typeof window & { orionDesktop?: DesktopBridge; empyralisDesktop?: DesktopBridge };
    return scopedWindow.orionDesktop || scopedWindow.empyralisDesktop || null;
  }, []);

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), RUNTIME_TIMEOUT_MS);
      const res = await controlPlaneFetch(`/api/control-plane/connectors?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to load integrations.'));
      }
      const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
      const normalized: ConnectorRow[] = items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          id: String(item.id || ''),
          label: String(item.label || 'Untitled connector'),
          connector: String(item.connector || '') as ConnectorId,
          workspace_id: item.workspace_id ? String(item.workspace_id) : null,
          metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {},
          created_at: item.created_at ? String(item.created_at) : undefined,
          updated_at: item.updated_at ? String(item.updated_at) : undefined,
        }))
        .filter((item) => item.id && item.connector);
      setConnectors(normalized);
    } catch (error) {
      setPageError(normalizeConnectionsError(error instanceof Error ? error.message : 'Failed to load integrations.'));
    } finally {
      setLoading(false);
    }
  }, [controlPlaneFetch]);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  const summary = useMemo(() => {
    return connectors.reduce(
      (acc, row) => {
        acc.total += 1;
        if (rowPaused(row)) acc.paused += 1;
        else acc.active += 1;
        if (rowAssignedRole(row)) acc.assigned += 1;
        return acc;
      },
      { total: 0, active: 0, paused: 0, assigned: 0 },
    );
  }, [connectors]);

  const focusedCatalogEntry = useMemo(() => {
    if (!focusedCatalogId) return null;
    for (const section of CONNECTOR_CATALOG) {
      const item = section.items.find((entry) => entry.id === focusedCatalogId);
      if (item) return item;
    }
    return null;
  }, [focusedCatalogId]);

  useEffect(() => {
    if (!focusedCatalogId || !focusedCatalogEntryRef.current) return;
    focusedCatalogEntryRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusedCatalogId]);

  useEffect(() => {
    if (!showAddModal) return;

    const body = document.body;
    const html = document.documentElement;
    const scrollbarCompensation = window.innerWidth - html.clientWidth;

    const previous = {
      bodyClassName: body.className,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      htmlOverflow: html.style.overflow,
    };

    modalScrollLockRef.current = window.scrollY;
    body.classList.add('orion-modal-open');
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarCompensation > 0) {
      body.style.paddingRight = `${scrollbarCompensation}px`;
    }

    return () => {
      body.className = previous.bodyClassName;
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.paddingRight = previous.bodyPaddingRight;
      window.scrollTo(0, modalScrollLockRef.current);
    };
  }, [showAddModal]);

  useEffect(() => {
    if (!requestedConnector || onboardingModalOpenedRef.current) return;
    if (!isConnectorId(requestedConnector)) return;
    onboardingModalOpenedRef.current = true;
    openCreateModal(requestedConnector, DEFAULT_CONNECTOR_LABELS[requestedConnector]);
  }, [requestedConnector]);

  const connectedConnectorIds = useMemo(() => new Set(connectors.map((row) => row.connector)), [connectors]);
  const connectorDirectoryItems = useMemo(() => {
    return CONNECTOR_CATALOG.flatMap((section) =>
      section.items
        .filter((item) => !(section.id === 'native_now' && item.id === 'instagram_business'))
        .map((item) => ({ ...item, sectionId: section.id })),
    );
  }, []);
  const filteredDirectoryItems = useMemo(() => {
    return connectorDirectoryItems.filter((item) => {
      const connectorId = resolveCatalogConnectorId(item);
      const connected = connectorId ? connectedConnectorIds.has(connectorId) : false;
      const matchesView =
        catalogViewFilter === 'all'
          ? true
          : catalogViewFilter === 'connected'
            ? connected
            : !connected;
      return matchesView;
    });
  }, [catalogViewFilter, connectedConnectorIds, connectorDirectoryItems]);
  const directoryCounts = useMemo(
    () =>
      connectorDirectoryItems.reduce(
        (acc, item) => {
          const connectorId = resolveCatalogConnectorId(item);
          const connected = connectorId ? connectedConnectorIds.has(connectorId) : false;
          acc.all += 1;
          if (connected) acc.connected += 1;
          else acc.available += 1;
          return acc;
        },
        { all: 0, connected: 0, available: 0 },
      ),
    [connectedConnectorIds, connectorDirectoryItems],
  );
  const googleSuiteRow = useMemo(() => connectors.find((row) => row.connector === 'google_workspace' && !rowPaused(row)) || connectors.find((row) => row.connector === 'google_workspace') || null, [connectors]);
  const microsoftSuiteRow = useMemo(() => connectors.find((row) => row.connector === 'microsoft_365' && !rowPaused(row)) || connectors.find((row) => row.connector === 'microsoft_365') || null, [connectors]);
  const integrationOverview = useMemo(() => {
    const connectedSuiteCount = [googleSuiteRow, microsoftSuiteRow].filter(Boolean).length;
    return {
      connectedSuiteCount,
      activeCount: summary.active,
      availableCount: directoryCounts.available,
      connectedCount: directoryCounts.connected,
    };
  }, [directoryCounts.available, directoryCounts.connected, googleSuiteRow, microsoftSuiteRow, summary.active]);
  const selectedConnectorRow = useMemo(() => {
    const selectedConnectorId = focusedCatalogEntry ? resolveCatalogConnectorId(focusedCatalogEntry) : null;
    if (!selectedConnectorId) return null;
    return connectors.find((row) => row.id === configuredRowId && row.connector === selectedConnectorId)
      || connectors.find((row) => row.connector === selectedConnectorId && !rowPaused(row))
      || connectors.find((row) => row.connector === selectedConnectorId)
      || null;
  }, [configuredRowId, connectors, focusedCatalogEntry]);

  function openGoogleSuiteDrive() {
    if (!googleSuiteRow) return;
    const targetId = `connector-row-${googleSuiteRow.id}`;
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    void handleBrowseGoogleDrive(googleSuiteRow);
  }

  function openMicrosoftSuiteDrive() {
    if (!microsoftSuiteRow) return;
    const targetId = `connector-row-${microsoftSuiteRow.id}`;
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    void handleBrowseMicrosoftDrive(microsoftSuiteRow);
  }

  function openConnectedRow(connectorId: ConnectorId) {
    const matchingCatalogEntry = connectorDirectoryItems.find((item) => resolveCatalogConnectorId(item) === connectorId);
    const targetRow =
      connectors.find((row) => row.connector === connectorId && !rowPaused(row))
      || connectors.find((row) => row.connector === connectorId)
      || null;
    if (!targetRow) return;
    if (matchingCatalogEntry) setFocusedCatalogId(matchingCatalogEntry.id);
    setConfiguredRowId(targetRow.id);
  }

  function setBusy(id: string, action: string | null) {
    setRowBusy((prev) => {
      const next = { ...prev };
      if (!action) delete next[id];
      else next[id] = action;
      return next;
    });
  }

  async function patchConnector(id: string, payload: { label?: string; metadata?: Record<string, unknown> }) {
    const res = await controlPlaneFetch(`/api/control-plane/connectors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ workspace_id: WORKSPACE_ID, ...payload }),
    });
    const raw = await res.text().catch(() => '');
    const body = raw ? JSON.parse(raw) : {};
    if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to update connector.'));
    return body as ConnectorRow;
  }

  async function handleAssignRole(row: ConnectorRow, nextRole: '' | AgentRoleId) {
    setBusy(row.id, 'assign');
    setPageError('');
    try {
      await patchConnector(row.id, {
        metadata: {
          agent_role: nextRole || null,
        },
      });
      await loadConnectors();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to assign connector.');
    } finally {
      setBusy(row.id, null);
    }
  }

  async function handleTogglePaused(row: ConnectorRow) {
    setBusy(row.id, 'pause');
    setPageError('');
    try {
      await patchConnector(row.id, {
        metadata: {
          paused: !rowPaused(row),
        },
      });
      await loadConnectors();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to update connector state.');
    } finally {
      setBusy(row.id, null);
    }
  }

  async function handleTest(row: ConnectorRow) {
    setBusy(row.id, 'test');
    setPageError('');
    try {
      const res = await controlPlaneFetch(`/api/control-plane/connectors/${encodeURIComponent(row.id)}/test?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
        method: 'POST',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Integration test failed.'));
      setTestResults((prev) => ({
        ...prev,
        [row.id]: {
          ok: Boolean(body?.ok),
          status: typeof body?.status === 'number' ? body.status : undefined,
          message: typeof body?.message === 'string' ? body.message : 'Validation complete.',
          warning: typeof body?.warning === 'string' ? body.warning : null,
          profile: body?.profile && typeof body.profile === 'object' ? body.profile as TestResult['profile'] : null,
          mail_access: body?.mail_access === true,
          calendar_access: body?.calendar_access === true,
          files_access: body?.files_access === true,
          warnings: Array.isArray(body?.warnings) ? body.warnings.filter((item: unknown): item is string => typeof item === 'string') : [],
          calendars_preview: Array.isArray(body?.calendars_preview) ? body.calendars_preview as TestResult['calendars_preview'] : [],
          drive: body?.drive && typeof body.drive === 'object' ? body.drive as TestResult['drive'] : null,
        },
      }));
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [row.id]: {
          ok: false,
          message: error instanceof Error ? error.message : 'Integration test failed.',
        },
      }));
    } finally {
      setBusy(row.id, null);
    }
  }

  async function handleBrowseMicrosoftDrive(row: ConnectorRow, nextPath = '') {
    setDriveBrowsers((prev) => ({
      ...prev,
      [row.id]: {
        open: true,
        loading: true,
        path: nextPath || 'onedrive:/',
        items: prev[row.id]?.items || [],
        error: '',
      },
    }));
    try {
      const params = new URLSearchParams({ workspace_id: WORKSPACE_ID });
      if (nextPath && nextPath !== 'onedrive:/') params.set('path', nextPath);
      const res = await controlPlaneFetch(`/api/connectors/${encodeURIComponent(row.id)}/microsoft-drive?${params.toString()}`);
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to browse OneDrive.'));
      setDriveBrowsers((prev) => ({
        ...prev,
        [row.id]: {
          open: true,
          loading: false,
          path: typeof body?.path === 'string' ? body.path : (nextPath || 'onedrive:/'),
          items: Array.isArray(body?.items) ? body.items as MicrosoftDriveItem[] : [],
          error: '',
        },
      }));
    } catch (error) {
      setDriveBrowsers((prev) => ({
        ...prev,
        [row.id]: {
          open: true,
          loading: false,
          path: nextPath || prev[row.id]?.path || 'onedrive:/',
          items: prev[row.id]?.items || [],
          error: error instanceof Error ? error.message : 'Failed to browse OneDrive.',
        },
      }));
    }
  }

  async function handleBrowseGoogleDrive(row: ConnectorRow, nextPath = '') {
    setGoogleDriveBrowsers((prev) => ({
      ...prev,
      [row.id]: {
        open: true,
        loading: true,
        path: nextPath || 'gdrive:/',
        items: prev[row.id]?.items || [],
        error: '',
      },
    }));
    try {
      const params = new URLSearchParams({ workspace_id: WORKSPACE_ID });
      if (nextPath && nextPath !== 'gdrive:/') params.set('path', nextPath);
      const res = await controlPlaneFetch(`/api/control-plane/connectors/${encodeURIComponent(row.id)}/google-drive?${params.toString()}`);
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to browse Google Drive.'));
      setGoogleDriveBrowsers((prev) => ({
        ...prev,
        [row.id]: {
          open: true,
          loading: false,
          path: typeof body?.path === 'string' ? body.path : (nextPath || 'gdrive:/'),
          items: Array.isArray(body?.items) ? body.items as GoogleDriveItem[] : [],
          error: '',
        },
      }));
    } catch (error) {
      setGoogleDriveBrowsers((prev) => ({
        ...prev,
        [row.id]: {
          open: true,
          loading: false,
          path: nextPath || prev[row.id]?.path || 'gdrive:/',
          items: prev[row.id]?.items || [],
          error: error instanceof Error ? error.message : 'Failed to browse Google Drive.',
        },
      }));
    }
  }

  function collapseDriveBrowser(rowId: string) {
    setDriveBrowsers((prev) => ({
      ...prev,
      [rowId]: {
        open: false,
        loading: false,
        path: prev[rowId]?.path || 'onedrive:/',
        items: prev[rowId]?.items || [],
        error: '',
      },
    }));
  }

  function collapseGoogleDriveBrowser(rowId: string) {
    setGoogleDriveBrowsers((prev) => ({
      ...prev,
      [rowId]: {
        open: false,
        loading: false,
        path: prev[rowId]?.path || 'gdrive:/',
        items: prev[rowId]?.items || [],
        error: '',
      },
    }));
  }

  async function openProviderExternal(target: string, fallbackLabel: string) {
    const url = String(target || '').trim();
    if (!url) return;
    setPageError('');
    try {
      if (desktopBridge?.openExternal) {
        const opened = await desktopBridge.openExternal(url);
        if (opened) return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : `Could not open ${fallbackLabel}.`,
      );
    }
  }

  async function handleCreateGoogleWorkspaceAsset(row: ConnectorRow, kind: 'doc' | 'sheet') {
    const action = kind === 'doc' ? 'google-doc' : 'google-sheet';
    const label = kind === 'doc' ? 'Google Doc' : 'Google Sheet';
    setBusy(row.id, action);
    setPageError('');
    try {
      const title = `${label} ${new Date().toLocaleDateString()}`;
      const path = kind === 'doc' ? 'google-doc' : 'google-sheet';
      const res = await controlPlaneFetch(
        `/api/control-plane/connectors/${encodeURIComponent(row.id)}/${path}?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`,
        {
          method: 'POST',
          body: JSON.stringify({ title }),
        },
      );
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || `Failed to create ${label}.`));
      const webUrl = String(body?.webUrl || '').trim();
      if (webUrl) {
        await openProviderExternal(webUrl, label);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : `Failed to create ${label}.`);
    } finally {
      setBusy(row.id, null);
    }
  }

  async function handleRemove(row: ConnectorRow) {
    setBusy(row.id, 'remove');
    setPageError('');
    try {
      const res = await controlPlaneFetch(`/api/control-plane/connectors/${encodeURIComponent(row.id)}?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
        method: 'DELETE',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to remove connector.'));
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setDriveBrowsers((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setGoogleDriveBrowsers((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await loadConnectors();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to remove connector.');
    } finally {
      setBusy(row.id, null);
    }
  }

  function resetModal() {
    setForm(EMPTY_FORM);
    setModalLockedConnector(null);
    setCreateError('');
    setShowTelegramAdvanced(false);
    setShowAddModal(false);
  }

  function openGenericCreateModal() {
    setForm({
      ...EMPTY_FORM,
      label: connectorLabel(EMPTY_FORM.connector),
    });
    setModalLockedConnector(null);
    setCreateError('');
    setShowTelegramAdvanced(false);
    setShowAddModal(true);
  }

  function openCreateModal(connector: ConnectorId, label?: string) {
    setForm({
      ...EMPTY_FORM,
      connector,
      label: label || connectorLabel(connector),
    });
    setModalLockedConnector(connector);
    setCreateError('');
    setShowTelegramAdvanced(false);
    setShowAddModal(true);
  }

function buildCredentialsPayload(state: ConnectModalState): Record<string, unknown> {
  if (state.connector === 'microsoft_365') {
    return {
      access_token: state.accessToken.trim(),
    };
  }
  if (state.connector === 'telegram_bot') {
    return {
      bot_token: state.botToken.trim(),
      chat_id: state.chatId.trim(),
    };
  }
  if (state.connector === 'wechat_work') {
    return {
      webhook_url: state.webhookUrl.trim(),
    };
  }
  if (state.connector === 'discord_bot') {
    return {
      bot_token: state.discordBotToken.trim(),
      channel_id: state.discordChannelId.trim(),
      guild_id: state.discordGuildId.trim(),
    };
  }
  if (state.connector === 'whatsapp_twilio') {
    return {
      account_sid: state.accountSid.trim(),
      auth_token: state.authToken.trim(),
      from_number: state.fromNumber.trim(),
      to_number: state.toNumber.trim(),
    };
  }
  if (state.connector === 'instagram_business') {
    return {
      access_token: state.accessToken.trim(),
      instagram_account_id: state.instagramAccountId.trim(),
      page_id: state.instagramPageId.trim(),
    };
  }
  if (state.googleUseLocalAuth) {
    return {
      auth_mode: 'gws_local',
      gws_config_dir: '.gws-config',
      calendar_id: state.calendarId.trim() || 'primary',
      timezone: state.timezone.trim() || 'UTC',
    };
  }
  return {
    access_token: state.accessToken.trim(),
    calendar_id: state.calendarId.trim() || 'primary',
    timezone: state.timezone.trim() || 'UTC',
  };
  }

  async function handleCreateConnector() {
    if (form.connector === 'microsoft_365' && !form.accessToken.trim()) {
      setCreateError('Enter a Microsoft Graph access token with mail, calendar, and files scopes.');
      return;
    }
    if (form.connector === 'google_workspace' && !form.googleUseLocalAuth && !form.accessToken.trim()) {
      setCreateError('Enter a Google Workspace access token, or switch back to Local gws auth for the authenticated CLI session on this Mac.');
      return;
    }
    if (form.connector === 'wechat_work' && !form.webhookUrl.trim()) {
      setCreateError('Enter the WeChat Work webhook URL.');
      return;
    }
    if (form.connector === 'telegram_bot' && !form.botToken.trim()) {
      setCreateError('Paste the Telegram bot token first.');
      return;
    }
    setCreateBusy(true);
    setCreateError('');
    try {
      const res = await controlPlaneFetch('/api/control-plane/connectors', {
        method: 'POST',
        body: JSON.stringify({
          label: form.label.trim() || connectorLabel(form.connector),
          connector: form.connector,
          workspace_id: WORKSPACE_ID,
          credentials: buildCredentialsPayload(form),
          metadata: form.agentRole ? { agent_role: form.agentRole } : {},
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to create connector.'));
      resetModal();
      await loadConnectors();
      if (onboardingMode) {
        router.push(returnTo);
      }
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create connector.');
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="orion-page-shell is-integrations-page orion-animate-in">
      <PageHero
        kicker="Integrations"
        title="Start with one or two tools, not the whole directory."
        copy="Most teams start with Google Workspace, Microsoft 365, or Telegram. Add more tools later when a task actually depends on them."
        actions={
          <>
            {onboardingMode ? (
              <Link href={returnTo} className="btn-secondary">
                <ChevronLeft size={14} />
                Return to setup
              </Link>
            ) : null}
            <button className="btn-primary" onClick={openGenericCreateModal}>
              <Plus size={14} />
              Add tool
            </button>
            <button className="btn-secondary" onClick={() => void loadConnectors()}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </>
        }
        aside={
          <>
            <PageHeroCard label="Current access">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{integrationOverview.activeCount}</div>
                  <div className="orion-home-side-note">Connected tools</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{integrationOverview.availableCount}</div>
                  <div className="orion-home-side-note">Ready to connect</div>
                </div>
              </div>
              <div className="orion-runs-overview-side-note">
                {integrationOverview.connectedSuiteCount > 0
                  ? `${integrationOverview.connectedSuiteCount} core suite${integrationOverview.connectedSuiteCount === 1 ? '' : 's'} already connected.`
                  : 'No core suites connected yet. Start with Google Workspace or Microsoft 365.'}
              </div>
            </PageHeroCard>
            <PageHeroCard label="Best first tools">
              <div className="orion-home-mini-list">
                <button type="button" className="orion-home-mini-link" onClick={() => openCreateModal('google_workspace', 'Google Workspace')}>
                  <span>Google Workspace</span>
                  <ArrowUpRight size={13} />
                </button>
                <button type="button" className="orion-home-mini-link" onClick={() => openCreateModal('microsoft_365', 'Microsoft 365')}>
                  <span>Microsoft 365</span>
                  <ArrowUpRight size={13} />
                </button>
                <button type="button" className="orion-home-mini-link" onClick={() => openCreateModal('telegram_bot', 'Telegram')}>
                  <span>Telegram alerts</span>
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </PageHeroCard>
          </>
        }
      />

      <PageFilterBar
        title="Tool directory"
        description="Choose the tools Platform can use. Connect a tool only when a task depends on it."
        summary={summary.total > 0 ? <span className="orion-chip">{summary.active} active</span> : null}
        actions={
          <>
            <button className="btn-secondary" style={{ minHeight: 34, paddingInline: 10 }} onClick={() => void loadConnectors()}>
              <RefreshCw size={13} />
              Refresh
            </button>
            <button className="btn-primary" style={{ minHeight: 34, paddingInline: 12 }} onClick={openGenericCreateModal}>
              <Plus size={13} />
              Add tool
            </button>
          </>
        }
      >
        <div className="orion-segmented" style={{ padding: 0, borderBottom: 0 }}>
          {[
            ['all', 'All', directoryCounts.all],
            ['connected', 'Connected', directoryCounts.connected],
            ['available', 'Ready to connect', directoryCounts.available],
          ].map(([value, label, count]) => {
            const active = catalogViewFilter === value;
            return (
              <button
                key={value}
                className={`orion-segmented-btn${active ? ' is-active' : ''}`}
                onClick={() => setCatalogViewFilter(value as CatalogViewFilter)}
              >
                {label}
                <span className={`orion-segmented-badge${active ? ' is-active' : ''}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </PageFilterBar>

        {filteredDirectoryItems.length === 0 ? (
          <PageStatePanel
            variant="filtered-empty"
            title="No tools match this filter"
            copy="Try another filter or switch back to the full directory."
            className="orion-state-panel"
            actions={
              <button
                className="orion-btn orion-btn-ghost"
                onClick={() => {
                  setCatalogViewFilter('all');
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="orion-integration-directory">
            {filteredDirectoryItems.map((item) => {
              const tier = connectorRoadmapTier(item);
              const tierMeta = ROADMAP_TIER_META[tier];
              const badge = CONNECTOR_CATALOG_BADGES[item.status];
              const statusMeta = CONNECTOR_DIRECTORY_STATUS_META[item.status];
              const cardConnectorId = resolveCatalogConnectorId(item);
              const canCreateFromCard = Boolean(cardConnectorId);
              const isFocused = focusedCatalogEntry?.id === item.id;
              const isConnected = cardConnectorId ? connectedConnectorIds.has(cardConnectorId) : false;
              const cardMetaCopy = isConnected ? 'Connected in this workspace' : statusMeta.note;
              return (
                <article
                  key={item.id}
                  className={`orion-connector-card orion-integration-card${isFocused ? ' is-focused' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFocusedCatalogId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setFocusedCatalogId(item.id);
                    }
                  }}
                >
                  <div className="orion-integration-card-head">
                    <div className="orion-integration-card-main">
                      <ConnectorMark id={item.id} size={52} />
                      <div className="orion-integration-card-copy">
                        <div className="orion-integration-card-kicker">{connectorTierLabel(tier)}</div>
                        <div className="orion-integration-card-title">{item.label}</div>
                        <div className="orion-integration-card-note">{item.note}</div>
                      </div>
                    </div>
                  </div>

                  <div className="orion-integration-card-foot">
                    <div className="orion-integration-card-meta">
                      <span className="orion-integration-card-meta-note">{cardMetaCopy}</span>
                    </div>
                    <div className="orion-integration-card-actions">
                      {isConnected ? (
                        <span
                          className="orion-chip"
                          style={{
                            minHeight: 24,
                            color: 'var(--tone-success)',
                            border: '1px solid var(--success-border)',
                            background: 'var(--bg-element)',
                          }}
                        >
                          Connected
                        </span>
                      ) : (
                        <span className="orion-chip" style={{ ...badge.style, minHeight: 24 }}>
                          {statusMeta.label}
                        </span>
                      )}
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 32, paddingInline: 12 }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canCreateFromCard) {
                            setFocusedCatalogId((current) => (current === item.id ? '' : item.id));
                            return;
                          }
                          if (isConnected) {
                            openConnectedRow(cardConnectorId!);
                          } else {
                            openCreateModal(cardConnectorId!, item.label);
                          }
                        }}
                        title={isConnected ? `Manage ${item.label}` : `Connect ${item.label}`}
                      >
                        {isConnected ? <ArrowUpRight size={14} /> : <Plus size={14} />}
                        {isConnected ? 'Manage' : 'Connect'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {focusedCatalogEntry ? (
          (() => {
            const focusedConnectorId = resolveCatalogConnectorId(focusedCatalogEntry);
            const canAddFocused = Boolean(focusedConnectorId);
            return (
              <div
                ref={focusedCatalogEntryRef}
                className="orion-focus-panel"
              >
                <div className="orion-focus-panel-head">
                  <div className="orion-focus-panel-main">
                    <ConnectorMark id={focusedCatalogEntry.id} size={44} />
                    <div className="orion-focus-panel-copy">
                      <div className="orion-focus-panel-title">{focusedCatalogEntry.label}</div>
                      <div className="orion-focus-panel-note">{focusedCatalogEntry.note}</div>
                    </div>
                  </div>
                  <div className="orion-focus-panel-actions">
                    <span className="orion-chip" style={{ ...ROADMAP_TIER_META[connectorRoadmapTier(focusedCatalogEntry)].style, minHeight: 24 }}>
                      {ROADMAP_TIER_META[connectorRoadmapTier(focusedCatalogEntry)].label}
                    </span>
                    <span className="orion-chip" style={{ ...CONNECTOR_CATALOG_BADGES[focusedCatalogEntry.status].style, minHeight: 24 }}>
                      {CONNECTOR_CATALOG_BADGES[focusedCatalogEntry.status].label}
                    </span>
                    <button
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 34, paddingInline: 12 }}
                      onClick={() => setFocusedCatalogId('')}
                    >
                      Close details
                    </button>
                  </div>
                </div>

                <div className="orion-focus-panel-body">{focusedCatalogEntry.detail}</div>

                <div className="orion-focus-callout">
                  <div className="orion-focus-callout-label">When to connect this</div>
                  <div className="orion-focus-callout-copy">
                    {focusedCatalogEntry.status === 'provider_next' && focusedConnectorId
                      ? 'You can connect this here today. Deeper tool-specific actions can be added later if real usage proves they matter.'
                      : focusedCatalogEntry.status === 'provider_next'
                        ? 'Keep this as a near-term integration. Add it natively only when real usage proves it matters.'
                        : focusedCatalogEntry.status === 'custom_build'
                          ? 'This needs a custom connection flow with its own setup and approval rules.'
                          : 'This tool is ready now. You can connect it, test access, pause it, and remove it from this page.'}
                  </div>
                </div>

                <div className="orion-focus-panel-cta-row">
                  {canAddFocused ? (
                    <button
                      className="orion-btn orion-btn-primary"
                      style={{ minHeight: 40, minWidth: 160, paddingInline: 14 }}
                      onClick={() => openCreateModal(focusedConnectorId!, focusedCatalogEntry.label)}
                    >
                      <Plus size={13} />
                      {focusedCatalogEntry.status === 'provider_next' ? `Connect ${focusedCatalogEntry.label}` : `Add ${focusedCatalogEntry.label}`}
                    </button>
                  ) : null}
                  {focusedCatalogEntry.id === 'google_workspace' ? (
                    <>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 40, paddingInline: 14 }}
                        onClick={openGoogleSuiteDrive}
                        disabled={!googleSuiteRow}
                        title={!googleSuiteRow ? 'Connect Google Workspace first to browse Drive.' : undefined}
                      >
                        <FolderOpen size={13} />
                        Open Drive
                      </button>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 40, paddingInline: 14 }}
                        onClick={() => googleSuiteRow && void handleCreateGoogleWorkspaceAsset(googleSuiteRow, 'doc')}
                        disabled={!googleSuiteRow || rowBusy[googleSuiteRow.id] === 'google-doc'}
                        title={!googleSuiteRow ? 'Connect Google Workspace first to create Docs from here.' : undefined}
                      >
                        <Plus size={13} />
                        {googleSuiteRow && rowBusy[googleSuiteRow.id] === 'google-doc' ? 'Creating…' : 'Create Google Doc'}
                      </button>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 40, paddingInline: 14 }}
                        onClick={() => googleSuiteRow && void handleCreateGoogleWorkspaceAsset(googleSuiteRow, 'sheet')}
                        disabled={!googleSuiteRow || rowBusy[googleSuiteRow.id] === 'google-sheet'}
                        title={!googleSuiteRow ? 'Connect Google Workspace first to create Sheets from here.' : undefined}
                      >
                        <Plus size={13} />
                        {googleSuiteRow && rowBusy[googleSuiteRow.id] === 'google-sheet' ? 'Creating…' : 'Create Google Sheet'}
                      </button>
                      <Link href="/artifacts" className="orion-btn orion-btn-ghost" style={{ minHeight: 40, paddingInline: 14 }}>
                        <ArrowUpRight size={13} />
                        Open Outputs
                      </Link>
                    </>
                  ) : null}
                  {focusedCatalogEntry.id === 'microsoft_365' ? (
                    <>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 40, paddingInline: 14 }}
                        onClick={openMicrosoftSuiteDrive}
                        disabled={!microsoftSuiteRow}
                        title={!microsoftSuiteRow ? 'Connect Microsoft 365 first to browse OneDrive.' : undefined}
                      >
                        <FolderOpen size={13} />
                        Open OneDrive
                      </button>
                      {microsoftSuiteRow ? (
                        <>
                          <Link
                            href={buildPackLaunchHref({
                              pack: 'document-studio-v1',
                              goal: 'Create a Word document in Microsoft 365 for the current task.',
                              primary: 'onedrive:/Documents/new-document.docx',
                              secondary: 'create',
                              tertiary: JSON.stringify([{ title: 'Executive summary', body: 'Key points to write into the document.' }], null, 2),
                            })}
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 40, paddingInline: 14 }}
                          >
                            <Plus size={13} />
                            Create Word doc
                          </Link>
                          <Link
                            href={buildPackLaunchHref({
                              pack: 'document-studio-v1',
                              goal: 'Create a PowerPoint deck in Microsoft 365 for the current task.',
                              primary: 'onedrive:/Decks/new-deck.pptx',
                              secondary: 'create',
                              tertiary: JSON.stringify([{ title: 'Opening slide', bullets: ['Objective', 'Key update', 'Next step'] }], null, 2),
                            })}
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 40, paddingInline: 14 }}
                          >
                            <Plus size={13} />
                            Create PowerPoint deck
                          </Link>
                          <Link
                            href={buildPackLaunchHref({
                              pack: 'spreadsheet-ops-v1',
                              goal: 'Review or update a Microsoft 365 spreadsheet safely.',
                              primary: 'onedrive:/Sales/customers.xlsx',
                              secondary: 'read',
                              tertiary: JSON.stringify({ sheet: 'Sheet1' }, null, 2),
                            })}
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 40, paddingInline: 14 }}
                          >
                            <ArrowUpRight size={13} />
                            Run Spreadsheet Ops
                          </Link>
                        </>
                      ) : (
                        <>
                          <button className="orion-btn orion-btn-ghost" style={{ minHeight: 40, paddingInline: 14, opacity: 0.55 }} disabled title="Connect Microsoft 365 first to create Word documents from here.">
                            <Plus size={13} />
                            Create Word doc
                          </button>
                          <button className="orion-btn orion-btn-ghost" style={{ minHeight: 40, paddingInline: 14, opacity: 0.55 }} disabled title="Connect Microsoft 365 first to create PowerPoint decks from here.">
                            <Plus size={13} />
                            Create PowerPoint deck
                          </button>
                          <button className="orion-btn orion-btn-ghost" style={{ minHeight: 40, paddingInline: 14, opacity: 0.55 }} disabled title="Connect Microsoft 365 first to run Spreadsheet Ops on OneDrive files.">
                            <ArrowUpRight size={13} />
                            Run Spreadsheet Ops
                          </button>
                        </>
                      )}
                      <Link href="/artifacts" className="orion-btn orion-btn-ghost" style={{ minHeight: 40, paddingInline: 14 }}>
                        <ArrowUpRight size={13} />
                        Open Outputs
                      </Link>
                    </>
                  ) : null}
                </div>
                {focusedCatalogEntry.id === 'google_workspace' && !googleSuiteRow ? (
                  <div className="orion-focus-panel-hint">
                    Connect Google Workspace first, then this detail will light up with Drive, Docs, Sheets, and account checks.
                  </div>
                ) : null}
                {focusedCatalogEntry.id === 'microsoft_365' && !microsoftSuiteRow ? (
                  <div className="orion-focus-panel-hint">
                    Connect Microsoft 365 first, then this detail will light up with OneDrive, Word, PowerPoint, Excel, and account checks.
                  </div>
                ) : null}
              </div>
            );
          })()
        ) : null}
      

      <PageSection
        title="AI providers"
        description="Manage saved AI accounts and choose what Platform should use by default."
        className="orion-home-list-panel"
      >
        <AiAccountsPanel workspaceId={WORKSPACE_ID} />
      </PageSection>

      {pageError && connectors.length > 0 ? (
        <PageStatePanel
          variant="error"
          title="Couldn't load this section."
          copy={pageError}
          actions={
            <button type="button" className="btn-secondary" onClick={() => void loadConnectors()}>
              Retry
            </button>
          }
          className="orion-state-panel"
        />
      ) : null}

      {loading ? (
        <PageStatePanel variant="loading" title="Loading integrations…" />
      ) : pageError && connectors.length === 0 ? (
        <PageStatePanel
          variant="error"
          title="Couldn't load this section."
          copy={pageError}
          actions={
            <button className="btn-secondary" onClick={() => void loadConnectors()}>
              <RefreshCw size={14} />
              Retry
            </button>
          }
          className="orion-state-panel"
        />
      ) : connectors.length === 0 ? (
        <PageStatePanel
          variant="empty"
          title="No tools connected yet"
          copy="Start with one tool your first task depends on. You can add more later."
          actions={
            <>
              <button className="btn-primary" onClick={() => openCreateModal('google_workspace', 'Google Workspace')}>
                <Plus size={14} />
                Connect Google Workspace
              </button>
              <button className="btn-secondary" onClick={() => openCreateModal('telegram_bot', 'Telegram')}>
                <Plus size={14} />
                Connect Telegram
              </button>
              <button className="btn-secondary" onClick={openGenericCreateModal}>
                <Plus size={14} />
                Browse all tools
              </button>
            </>
          }
          className="orion-state-panel"
        />
      ) : selectedConnectorRow ? (
        (() => {
          const row = selectedConnectorRow;
          const paused = rowPaused(row);
          const assignedRole = rowAssignedRole(row);
          const busyAction = rowBusy[row.id] || '';
          const test = testResults[row.id];
          const googleDriveBrowser = googleDriveBrowsers[row.id];
          const driveBrowser = driveBrowsers[row.id];
          const busyCopy = busyActionLabel(busyAction);
          const isSuite = row.connector === 'google_workspace' || row.connector === 'microsoft_365';
          const isConfiguredOpen = configuredRowId === row.id;
          const googleSuite = row.connector === 'google_workspace' ? googleSuiteSummary(row, test) : null;
          const microsoftSuite = row.connector === 'microsoft_365' ? microsoftSuiteSummary(row, test) : null;
          const suiteCapabilities = row.connector === 'google_workspace'
            ? googleSuiteCapabilities(test)
            : row.connector === 'microsoft_365'
              ? microsoftSuiteCapabilities(test)
              : [];
          const filesPanelOpen = row.connector === 'google_workspace' ? Boolean(googleDriveBrowser?.open) : Boolean(driveBrowser?.open);
          const filesPanelLoading = row.connector === 'google_workspace' ? Boolean(googleDriveBrowser?.loading) : Boolean(driveBrowser?.loading);

          return (
            <div id={`connector-row-${row.id}`} className="orion-connector-detail-card">
              <div className="orion-connector-detail-header">
                <ConnectorMark id={row.connector} size={58} />
                <div className="orion-connector-detail-copy">
                  <div className="orion-connector-detail-title-row">
                    <div className="orion-list-row-title">{row.label}</div>
                    <span className="orion-chip" style={statusStyles(!paused)}>
                      {paused ? 'Paused' : 'Active'}
                    </span>
                  </div>
                  <div className="orion-list-row-subtitle">
                    {rowIdentity(row)} • Added {formatDate(row.created_at)}
                  </div>
                  {test ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: test.ok ? 'var(--success-fg)' : 'var(--warning-fg)' }}>
                      {test.message}
                      {test.warning ? <span style={{ color: 'var(--text-secondary)' }}> • {test.warning}</span> : null}
                    </div>
                  ) : isSuite ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                      Test this once, then open files or launch work from the actions here.
                    </div>
                  ) : null}
                  {busyCopy ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{busyCopy}</div>
                  ) : null}
                </div>
                <div className="orion-connector-detail-actions">
                  <div className="orion-connector-detail-action-row">
                    {row.connector === 'google_workspace' ? (
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 34, paddingInline: 12 }}
                        onClick={() => {
                          if (googleDriveBrowser?.open) {
                            collapseGoogleDriveBrowser(row.id);
                          } else {
                            void handleBrowseGoogleDrive(row);
                          }
                        }}
                        disabled={Boolean(busyAction) || filesPanelLoading}
                      >
                        {filesPanelOpen ? <ChevronLeft size={13} /> : <FolderOpen size={13} />}
                        {filesPanelLoading ? 'Loading…' : filesPanelOpen ? 'Hide files' : 'Open files'}
                      </button>
                    ) : null}
                    {row.connector === 'microsoft_365' ? (
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 34, paddingInline: 12 }}
                        onClick={() => {
                          if (driveBrowser?.open) {
                            collapseDriveBrowser(row.id);
                          } else {
                            void handleBrowseMicrosoftDrive(row);
                          }
                        }}
                        disabled={Boolean(busyAction) || filesPanelLoading}
                      >
                        {filesPanelOpen ? <ChevronLeft size={13} /> : <FolderOpen size={13} />}
                        {filesPanelLoading ? 'Loading…' : filesPanelOpen ? 'Hide files' : 'Open files'}
                      </button>
                    ) : null}
                    {!isSuite ? (
                      <button className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 12 }} onClick={() => void handleTest(row)} disabled={Boolean(busyAction)}>
                        <ShieldCheck size={13} />
                        {busyAction === 'test' ? 'Testing…' : (test ? 'Retest' : 'Test')}
                      </button>
                    ) : null}
                    <button
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 34, paddingInline: 12 }}
                      onClick={() => setConfiguredRowId((current) => (current === row.id ? '' : row.id))}
                    >
                      {isConfiguredOpen ? 'Hide setup' : 'Configure'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="orion-connector-detail-content">
                <details className="orion-connector-inline-details">
                  <summary>Details</summary>
                  <div className="orion-connector-inline-meta">
                    <span className="orion-chip" style={{ minHeight: 24 }}>
                      {connectorLabel(row.connector)}
                    </span>
                    {isSuite ? (
                      <span className="orion-chip" style={CONNECTOR_CHIP_STYLE_SUBTLE}>
                        {suiteReadinessLabel(suiteCapabilities)}
                      </span>
                    ) : null}
                    <span className="orion-chip" style={CONNECTOR_CHIP_STYLE_SUBTLE}>
                      {assignedRole ? `Used by ${agentRoleLabel(assignedRole)}` : 'Shared'}
                    </span>
                    <span className="orion-connector-inline-note">{rowRoutingLabel(row)}</span>
                  </div>
                </details>

                {isConfiguredOpen ? (
                  <div className="orion-connector-config-panel">
                    <div className="orion-connector-config-head">
                      <div className="orion-connector-config-copy">
                        <div className="orion-connector-config-kicker">
                          Configure
                        </div>
                        <div className="orion-connector-config-note">
                          Choose who uses this connection, test it, or pause it.
                        </div>
                      </div>
                      <div className="orion-connector-config-actions">
                        <select
                          className="input"
                          value={assignedRole}
                          disabled={Boolean(busyAction)}
                          onChange={(event) => {
                            void handleAssignRole(row, (event.target.value || '') as '' | AgentRoleId);
                          }}
                          style={{ minWidth: 188, minHeight: 34, paddingInline: 10 }}
                        >
                          <option value="">Shared access</option>
                          {AGENT_ROLE_OPTIONS.map((role) => (
                            <option key={role.id} value={role.id}>{role.label}</option>
                          ))}
                        </select>
                        <button className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 10 }} onClick={() => void handleTest(row)} disabled={Boolean(busyAction)}>
                          <ShieldCheck size={13} />
                          {busyAction === 'test' ? 'Testing…' : (test ? 'Retest' : 'Test')}
                        </button>
                        <button className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 10 }} onClick={() => void handleTogglePaused(row)} disabled={Boolean(busyAction)}>
                          {paused ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                          {busyAction === 'pause' ? 'Saving…' : paused ? 'Resume' : 'Pause'}
                        </button>
                        <button className="orion-btn orion-btn-danger" style={{ minHeight: 34, paddingInline: 10 }} onClick={() => void handleRemove(row)} disabled={Boolean(busyAction)}>
                          <Trash2 size={13} />
                          {busyAction === 'remove' ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                    {isSuite ? (
                      <div className="orion-connector-suite-panel">
                        <div className="orion-connector-suite-account">
                          <div className="orion-connector-suite-account-title">
                            {googleSuite?.accountName || microsoftSuite?.accountName}
                          </div>
                          <div className="orion-connector-suite-account-note">
                            {googleSuite?.accountEmail || microsoftSuite?.accountEmail} · {googleSuite?.driveLabel || microsoftSuite?.driveLabel}
                          </div>
                        </div>
                        <div className="orion-connector-suite-grid">
                          {suiteCapabilities.map((capability) => (
                            <div key={capability.label} className="orion-connector-suite-capability">
                              <div className="orion-connector-suite-capability-head">
                                <div className="orion-connector-suite-capability-title">{capability.label}</div>
                                <span className="orion-chip" style={capabilityTone(capability.enabled)}>
                                  {capability.enabled ? 'Ready' : 'Scope needed'}
                                </span>
                              </div>
                              <div className="orion-connector-suite-capability-note">{capability.note}</div>
                            </div>
                          ))}
                        </div>
                        {(googleSuite?.calendars.length || microsoftSuite?.calendars.length) ? (
                          <div className="orion-connector-suite-calendars">
                            {(googleSuite?.calendars || microsoftSuite?.calendars || []).slice(0, 3).map((calendar, index) => (
                              <span
                                key={`${calendar.id || calendar.name || 'calendar'}:${index}`}
                                className="orion-chip"
                                style={CONNECTOR_CHIP_STYLE_SUBTLE}
                              >
                                Calendar · {String(calendar.name || calendar.id || 'Untitled')}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {row.connector === 'google_workspace' && googleDriveBrowser?.open ? (
                  <div className="orion-drive-browser-panel">
                    <div className="orion-drive-browser-head">
                      <div className="orion-drive-browser-title-wrap">
                        <div className="orion-drive-browser-kicker">
                          Google Drive
                        </div>
                        <div className="orion-drive-browser-path">{googleDriveBrowser.path || 'gdrive:/'}</div>
                      </div>
                      <div className="orion-drive-browser-toolbar">
                        {googleDriveBrowser.path && googleDriveBrowser.path !== 'gdrive:/' ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 32, paddingInline: 10 }}
                            onClick={() => {
                              const current = String(googleDriveBrowser.path || 'gdrive:/');
                              const normalized = current.replace(/^gdrive:\//, '').replace(/\/$/, '');
                              const parts = normalized ? normalized.split('/') : [];
                              parts.pop();
                              const parent = parts.length ? `gdrive:/${parts.join('/')}` : 'gdrive:/';
                              void handleBrowseGoogleDrive(row, parent);
                            }}
                          >
                            <ChevronLeft size={13} />
                            Up
                          </button>
                        ) : null}
                        <button className="orion-btn orion-btn-ghost" style={{ minHeight: 32, paddingInline: 10 }} onClick={() => void handleBrowseGoogleDrive(row, googleDriveBrowser.path)}>
                          <RefreshCw size={13} />
                          Refresh
                        </button>
                      </div>
                    </div>
                    <div className="orion-drive-browser-copy">
                      Open folders here inside Empyralis. Google Docs, Sheets, and other provider-native files will hand off to your default browser when you open them.
                    </div>
                    {googleDriveBrowser.error ? (
                      <div className="orion-drive-browser-error">
                        {googleDriveBrowser.error}
                      </div>
                    ) : null}
                    <div className="orion-drive-browser-list">
                      {googleDriveBrowser.items.length === 0 && !googleDriveBrowser.loading ? (
                        <div className="orion-drive-browser-empty">No items in this folder.</div>
                      ) : null}
                      {googleDriveBrowser.items.map((item, index) => {
                        const itemPath = String(item.path || '').trim();
                        const isFolder = String(item.kind || '').toLowerCase() === 'folder';
                        return (
                          <div key={String(item.id || itemPath || index)} className="orion-drive-browser-item">
                            <div className="orion-drive-browser-item-copy">
                              <div className="orion-drive-browser-item-title">
                                {item.name || 'Untitled'}
                              </div>
                              <div className="orion-drive-browser-item-path">
                                {itemPath || 'gdrive:/'}
                              </div>
                            </div>
                            <div className="orion-drive-browser-item-actions">
                              {isFolder ? (
                                <button className="orion-btn orion-btn-ghost" style={{ minHeight: 30, paddingInline: 10 }} onClick={() => void handleBrowseGoogleDrive(row, itemPath)}>
                                  <FolderOpen size={13} />
                                  Open
                                </button>
                              ) : null}
                              {item.webUrl ? (
                                <button
                                  className="orion-btn orion-btn-ghost"
                                  style={{ minHeight: 30, paddingInline: 10 }}
                                  onClick={() => void openProviderExternal(String(item.webUrl), String(item.name || 'Google Drive file'))}
                                >
                                  <ArrowUpRight size={13} />
                                  {googleDriveOpenLabel(item)}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {row.connector === 'microsoft_365' && driveBrowser?.open ? (
                  <div className="orion-drive-browser-panel">
                    <div className="orion-drive-browser-head">
                      <div className="orion-drive-browser-title-wrap">
                        <div className="orion-drive-browser-kicker">
                          OneDrive
                        </div>
                        <div className="orion-drive-browser-path">{driveBrowser.path || 'onedrive:/'}</div>
                      </div>
                      <div className="orion-drive-browser-toolbar">
                        {driveBrowser.path && driveBrowser.path !== 'onedrive:/' ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 32, paddingInline: 10 }}
                            onClick={() => {
                              const current = String(driveBrowser.path || 'onedrive:/');
                              const normalized = current.replace(/^onedrive:\//, '').replace(/\/$/, '');
                              const parts = normalized ? normalized.split('/') : [];
                              parts.pop();
                              const parent = parts.length ? `onedrive:/${parts.join('/')}` : 'onedrive:/';
                              void handleBrowseMicrosoftDrive(row, parent);
                            }}
                          >
                            <ChevronLeft size={13} />
                            Up
                          </button>
                        ) : null}
                        <button className="orion-btn orion-btn-ghost" style={{ minHeight: 32, paddingInline: 10 }} onClick={() => void handleBrowseMicrosoftDrive(row, driveBrowser.path)}>
                          <RefreshCw size={13} />
                          Refresh
                        </button>
                      </div>
                    </div>
                    <div className="orion-drive-browser-copy">
                      Use these paths directly in Spreadsheet Ops, for example <span style={{ color: 'var(--text-primary)' }}>onedrive:/Sales/customers.xlsx</span>. Microsoft files open through the native Microsoft web editors when you hand off.
                    </div>
                    {driveBrowser.error ? (
                      <div className="orion-drive-browser-error">
                        {driveBrowser.error}
                      </div>
                    ) : null}
                    <div className="orion-drive-browser-list">
                      {driveBrowser.items.length === 0 && !driveBrowser.loading ? (
                        <div className="orion-drive-browser-empty">No items in this folder.</div>
                      ) : null}
                      {driveBrowser.items.map((item, index) => {
                        const itemPath = String(item.path || '').trim();
                        const isFolder = String(item.kind || '').toLowerCase() === 'folder';
                        return (
                          <div key={String(item.id || itemPath || index)} className="orion-drive-browser-item">
                            <div className="orion-drive-browser-item-copy">
                              <div className="orion-drive-browser-item-title">
                                {item.name || 'Untitled'}
                              </div>
                              <div className="orion-drive-browser-item-path">
                                {itemPath || 'onedrive:/'}
                              </div>
                            </div>
                            <div className="orion-drive-browser-item-actions">
                              {isFolder ? (
                                <button className="orion-btn orion-btn-ghost" style={{ minHeight: 30, paddingInline: 10 }} onClick={() => void handleBrowseMicrosoftDrive(row, itemPath)}>
                                  <FolderOpen size={13} />
                                  Open
                                </button>
                              ) : null}
                              {item.webUrl ? (
                                <button
                                  className="orion-btn orion-btn-ghost"
                                  style={{ minHeight: 30, paddingInline: 10 }}
                                  onClick={() => void openProviderExternal(String(item.webUrl), String(item.name || 'Microsoft file'))}
                                >
                                  <ArrowUpRight size={13} />
                                  {microsoftDriveOpenLabel()}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })()
      ) : null}
      {showAddModal ? (
        <div className="orion-modal-overlay is-centered" onClick={resetModal}>
          <div
            className="orion-modal orion-credentials-modal"
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const modalEntry = catalogEntryForConnector(form.connector);
              const title = modalLockedConnector ? `Connect ${connectorLabel(form.connector)}` : 'Add connection';
              const isTelegramOnboarding = form.connector === 'telegram_bot' && onboardingMode;
              const copy = modalLockedConnector
                ? (isTelegramOnboarding
                    ? 'Finish Telegram in three steps, then send one message to your bot to start receiving notifications.'
                    : (modalEntry?.detail || 'Create a runtime connection for this service and assign it if needed.'))
                : 'Create a runtime connection and optionally assign it to one worker.';
              return (
            <div className="orion-panel-header orion-modal-header orion-credentials-modal-header">
              <div className="orion-credentials-modal-title-group">
                <ConnectorMark id={form.connector} size={52} />
                <div>
                  <h2 className="orion-modal-title">{title}</h2>
                  <p className="orion-modal-copy">{copy}</p>
                </div>
              </div>
              <button className="orion-icon-btn orion-credentials-modal-close" onClick={resetModal} aria-label="Close connector dialog">
                <X size={16} />
              </button>
            </div>
              );
            })()}

            <div className="orion-credentials-modal-body">
              {form.connector === 'telegram_bot' && onboardingMode ? (
                <div className="orion-credentials-modal-card is-telegram-onboarding">
                  <div className="orion-credentials-modal-eyebrow">
                    Telegram setup
                  </div>
                  <div className="orion-credentials-modal-steps">
                    <div className="orion-credentials-modal-step">
                      <strong>Step 1:</strong> Create a Telegram bot at <Link href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: 'var(--primary-base)', textDecoration: 'underline' }}>t.me/BotFather</Link>
                    </div>
                    <label className="orion-credentials-modal-field">
                      <span className="orion-credentials-modal-step-title">Step 2: Paste your bot token here</span>
                      <input className="input" value={form.botToken} onChange={(event) => setForm((prev) => ({ ...prev, botToken: event.target.value }))} placeholder="123456:ABC..." />
                    </label>
                    <div className="orion-credentials-modal-step">
                      <strong>Step 3:</strong> Send any message to your bot to activate
                    </div>
                  </div>
                </div>
              ) : null}

              {modalLockedConnector ? (
                <div className="orion-credentials-modal-card is-service-summary">
                  <div className="orion-credentials-modal-eyebrow">Service</div>
                  <div className="orion-credentials-modal-service-title">{connectorLabel(form.connector)}</div>
                  <div className="orion-credentials-modal-service-copy">
                    {catalogEntryForConnector(form.connector)?.note || 'Connector-specific setup'}
                  </div>
                </div>
              ) : (
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Service</span>
                  <select
                    className="input"
                    value={form.connector}
                    onChange={(event) =>
                      setForm({
                        ...EMPTY_FORM,
                        connector: event.target.value as ConnectorId,
                        label: connectorLabel(event.target.value as ConnectorId),
                      })}
                  >
                    {DEFAULT_CONNECTOR_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {(form.connector !== 'telegram_bot' || !onboardingMode) ? (
                <div className="orion-credentials-modal-form-grid">
                  <label className="orion-credentials-modal-field">
                    <span className="orion-credentials-modal-label">Label</span>
                    <input className="input" value={form.label} onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))} placeholder={connectorLabel(form.connector)} />
                  </label>

                  <label className="orion-credentials-modal-field">
                    <span className="orion-credentials-modal-label">Assign to worker</span>
                    <select className="input" value={form.agentRole} onChange={(event) => setForm((prev) => ({ ...prev, agentRole: (event.target.value || '') as '' | AgentRoleId }))}>
                      <option value="">Shared access</option>
                      {AGENT_ROLE_OPTIONS.map((role) => (
                        <option key={role.id} value={role.id}>{role.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {form.connector === 'telegram_bot' ? (
                <>
                  {!onboardingMode ? (
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bot token</span>
                      <input className="input" value={form.botToken} onChange={(event) => setForm((prev) => ({ ...prev, botToken: event.target.value }))} placeholder="123456:ABC..." />
                    </label>
                  ) : null}

                  <button
                    type="button"
                    className="orion-btn orion-btn-ghost orion-credentials-modal-advanced-toggle"
                    onClick={() => setShowTelegramAdvanced((prev) => !prev)}
                  >
                    {showTelegramAdvanced ? 'Hide Advanced' : 'Advanced'}
                  </button>

                  {showTelegramAdvanced ? (
                    <>
                      {onboardingMode ? (
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Label</span>
                          <input className="input" value={form.label} onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))} placeholder={connectorLabel(form.connector)} />
                        </label>
                      ) : null}
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Chat ID</span>
                        <input className="input" value={form.chatId} onChange={(event) => setForm((prev) => ({ ...prev, chatId: event.target.value }))} placeholder="1932934047" />
                      </label>
                      {onboardingMode ? (
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assign to worker</span>
                          <select className="input" value={form.agentRole} onChange={(event) => setForm((prev) => ({ ...prev, agentRole: (event.target.value || '') as '' | AgentRoleId }))}>
                            <option value="">Shared access</option>
                            {AGENT_ROLE_OPTIONS.map((role) => (
                              <option key={role.id} value={role.id}>{role.label}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}

              {form.connector === 'wechat_work' ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Paste the WeChat Work incoming webhook URL. The Test action sends a real message to that webhook.
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Webhook URL</span>
                    <input className="input" value={form.webhookUrl} onChange={(event) => setForm((prev) => ({ ...prev, webhookUrl: event.target.value }))} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
                  </label>
                </>
              ) : null}

              {form.connector === 'discord_bot' ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Use the bot token plus the target channel. Guild ID is optional but helps keep ownership clear.
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bot token</span>
                    <input className="input" value={form.discordBotToken} onChange={(event) => setForm((prev) => ({ ...prev, discordBotToken: event.target.value }))} placeholder="Discord bot token" />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Channel ID</span>
                      <input className="input" value={form.discordChannelId} onChange={(event) => setForm((prev) => ({ ...prev, discordChannelId: event.target.value }))} placeholder="123456789012345678" />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Guild ID</span>
                      <input className="input" value={form.discordGuildId} onChange={(event) => setForm((prev) => ({ ...prev, discordGuildId: event.target.value }))} placeholder="Optional guild ID" />
                    </label>
                  </div>
                </>
              ) : null}

              {form.connector === 'whatsapp_twilio' ? (
                <>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account SID</span>
                    <input className="input" value={form.accountSid} onChange={(event) => setForm((prev) => ({ ...prev, accountSid: event.target.value }))} placeholder="AC..." />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Auth token</span>
                    <input className="input" value={form.authToken} onChange={(event) => setForm((prev) => ({ ...prev, authToken: event.target.value }))} placeholder="Twilio auth token" />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>From number</span>
                      <input className="input" value={form.fromNumber} onChange={(event) => setForm((prev) => ({ ...prev, fromNumber: event.target.value }))} placeholder="whatsapp:+14155238886" />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Allowed sender / To number</span>
                      <input className="input" value={form.toNumber} onChange={(event) => setForm((prev) => ({ ...prev, toNumber: event.target.value }))} placeholder="whatsapp:+15551234567 or whatsapp:*" />
                    </label>
                  </div>
                </>
              ) : null}

              {form.connector === 'instagram_business' ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Connect a business account with a real Graph API access token. Page ID is optional but recommended for cleaner routing later.
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Access token</span>
                    <textarea className="input" rows={4} value={form.accessToken} onChange={(event) => setForm((prev) => ({ ...prev, accessToken: event.target.value }))} placeholder="Instagram Business / Meta Graph access token" />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Instagram account ID</span>
                      <input className="input" value={form.instagramAccountId} onChange={(event) => setForm((prev) => ({ ...prev, instagramAccountId: event.target.value }))} placeholder="1784..." />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Page ID</span>
                      <input className="input" value={form.instagramPageId} onChange={(event) => setForm((prev) => ({ ...prev, instagramPageId: event.target.value }))} placeholder="Optional page ID" />
                    </label>
                  </div>
                </>
              ) : null}

              {form.connector === 'microsoft_365' ? (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      borderRadius: 14,
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-element)',
                      padding: 14,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Microsoft 365 suite</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Connect one Microsoft Graph account and use it across Outlook, Calendar, OneDrive, Excel, Word, and PowerPoint workflows. This keeps the suite understandable now instead of splitting it into six separate fake connectors.
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 8 }}>
                      {[
                        ['Outlook', 'Email drafts and send'],
                        ['Calendar', 'Booking and scheduling'],
                        ['OneDrive', 'Remote file storage'],
                        ['Excel', 'Spreadsheet Ops'],
                        ['Word', 'Document Studio docs'],
                        ['PowerPoint', 'Document Studio decks'],
                      ].map(([label, note]) => (
                        <div
                          key={label}
                          style={{
                            display: 'grid',
                            gap: 4,
                            borderRadius: 12,
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-surface)',
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{note}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Expected scopes: mail, calendar, and files. If any of those are missing, the connector will still save, but the suite card will show what still needs access.
                    </div>
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Graph access token</span>
                    <textarea className="input" rows={4} value={form.accessToken} onChange={(event) => setForm((prev) => ({ ...prev, accessToken: event.target.value }))} placeholder="Microsoft Graph access token with mail, calendar, and files scopes" />
                  </label>
                </>
              ) : null}

              {form.connector === 'google_workspace' ? (
                <>
                  <div className="orion-credentials-modal-card is-google-mode">
                    <div className="orion-credentials-modal-eyebrow">Authentication mode</div>
                    <div className="orion-credentials-modal-toggle-row">
                    <button
                      type="button"
                      className={`orion-credentials-modal-toggle-btn${form.googleUseLocalAuth ? ' is-active' : ''}`}
                      onClick={() => setForm((prev) => ({ ...prev, googleUseLocalAuth: true }))}
                    >
                      Local gws auth
                    </button>
                    <button
                      type="button"
                      className={`orion-credentials-modal-toggle-btn${!form.googleUseLocalAuth ? ' is-active' : ''}`}
                      onClick={() => setForm((prev) => ({ ...prev, googleUseLocalAuth: false }))}
                    >
                      Pasted token
                    </button>
                    </div>
                    <div className="orion-credentials-modal-note">
                    {form.googleUseLocalAuth
                      ? 'Use the authenticated Google Workspace CLI session stored in .gws-config on this machine.'
                      : 'Fallback mode for temporary raw Google access tokens.'}
                    </div>
                  </div>
                  {!form.googleUseLocalAuth ? (
                  <label className="orion-credentials-modal-field">
                    <span className="orion-credentials-modal-label">Access token</span>
                    <textarea className="input" rows={4} value={form.accessToken} onChange={(event) => setForm((prev) => ({ ...prev, accessToken: event.target.value }))} placeholder="ya29.a0..." />
                  </label>
                  ) : null}
                  <div className="orion-credentials-modal-form-grid">
                    <label className="orion-credentials-modal-field">
                      <span className="orion-credentials-modal-label">Calendar ID</span>
                      <input className="input" value={form.calendarId} onChange={(event) => setForm((prev) => ({ ...prev, calendarId: event.target.value }))} placeholder="primary" />
                    </label>
                    <label className="orion-credentials-modal-field">
                      <span className="orion-credentials-modal-label">Timezone</span>
                      <input className="input" value={form.timezone} onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))} placeholder="UTC" />
                    </label>
                  </div>
                </>
              ) : null}

              {createError ? (
                <div style={{ fontSize: 12, color: 'var(--warning-fg)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 10, padding: '10px 12px' }}>
                  {createError}
                </div>
              ) : null}
            </div>

            <div className="orion-modal-footer orion-credentials-modal-footer">
              <button className="orion-btn orion-btn-ghost" onClick={resetModal}>Cancel</button>
              <button className="orion-btn orion-btn-primary" onClick={() => void handleCreateConnector()} disabled={createBusy}>
                {createBusy ? 'Connecting…' : form.connector === 'telegram_bot' && onboardingMode ? 'Done' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CredentialsPage() {
  return (
    <Suspense fallback={<div className="orion-page-shell orion-animate-in" />}>
      <CredentialsPageContent />
    </Suspense>
  );
}
