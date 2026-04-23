'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  DataBadge,
  DataTable,
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableRow,
} from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSection,
  FormSelect,
} from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

type ChannelIssueRecord = {
  code?: string | null;
  severity?: string | null;
  message?: string | null;
  connector_id?: string | null;
  occurred_at?: string | null;
};

type ChannelConnectorRecord = {
  id: string;
  label?: string | null;
  workspace_id?: string | null;
  profile_status?: string | null;
  profile_issue?: string | null;
  last_error?: string | null;
  last_error_at?: string | null;
  last_processed_at?: string | null;
  last_action?: string | null;
  last_run_id?: string | null;
  webhook_url?: string | null;
  last_message_sid?: string | null;
};

type ChannelOperationsProviderRecord = {
  provider: string;
  status: string;
  workspace_status: string;
  webhook: Record<string, unknown>;
  autopilot: Record<string, unknown>;
  connectors: ChannelConnectorRecord[];
  issues: ChannelIssueRecord[];
  workspace_configured: boolean;
  vault_error?: string | null;
  profile_issue?: string | null;
  last_error?: string | null;
};

type ChannelModeRecord = {
  id: string;
  family: string;
  label: string;
  mode_kind: string;
  strategy: string;
  setup_weight: string;
  provider: string;
  runtime_lane: string;
  configured: boolean;
  current_status: string;
  description: string;
  best_for: string;
  gateway_id?: string | null;
  linked_identity?: string | null;
  connector_count?: number | null;
  setup_hint?: string | null;
};

type ChannelFamilyRecord = {
  family: string;
  label: string;
  summary: string;
  active_mode?: string | null;
  modes: ChannelModeRecord[];
};

type PersonalChannelStateRecord = Record<string, unknown> & {
  status?: string | null;
  qr_code?: string | null;
  login_hint?: string | null;
  pairing_code?: string | null;
  linked_name?: string | null;
  linked_jid?: string | null;
  linked_phone?: string | null;
  linked_username?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PersonalChannelViewPayload = Record<string, unknown> & {
  state?: PersonalChannelStateRecord | null;
  recent_messages?: Array<Record<string, unknown>> | null;
};

type GatewayPairingIntentRecord = Record<string, unknown> & {
  pairing_token?: string | null;
  expires_at?: string | null;
  display_name?: string | null;
  platform?: string | null;
};

type QuickSetupDraft = {
  label: string;
  botToken: string;
  chatId: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
};

type PairingDraft = {
  displayName: string;
  platform: string;
};

type PersonalSetupDraft = {
  apiId: string;
  apiHash: string;
  phoneNumber: string;
  loginCode: string;
  password: string;
  customPairingCode: string;
};

type DeliveryPendingRecord = {
  event_id: string;
  event_type: string;
  workspace_id: string;
  retry_count: number;
  last_delivery_error?: string | null;
  last_attempted_at?: string | null;
  next_attempt_at?: string | null;
  payload?: Record<string, unknown>;
};

type DeadLetterRecord = {
  id: string;
  ts?: string | null;
  channel?: string | null;
  direction?: string | null;
  reason?: string | null;
  action?: string | null;
  connector_id?: string | null;
  run_id?: string | null;
  text?: string | null;
};

type ChannelEventRecord = {
  id: string;
  ts?: string | null;
  channel?: string | null;
  direction?: string | null;
  action?: string | null;
  event_type?: string | null;
  run_id?: string | null;
  text?: string | null;
  trace_id?: string | null;
};

type ChannelOperationsPayload = {
  ok: boolean;
  workspace_id: string;
  generated_at: string;
  channels: {
    telegram: ChannelOperationsProviderRecord;
    whatsapp: ChannelOperationsProviderRecord;
  };
  channel_families: {
    telegram: ChannelFamilyRecord;
    whatsapp: ChannelFamilyRecord;
  };
  delivery: {
    runtime_summary: {
      undelivered_count: number;
      poisoned_count: number;
      total_retry_count: number;
      max_retry_count: number;
    };
    workspace_summary: {
      pending_count: number;
      retry_count_total: number;
      max_retry_count: number;
      pending_by_channel: Record<string, number>;
    };
    pending: DeliveryPendingRecord[];
    dead_letters: DeadLetterRecord[];
  };
  events: {
    recent: ChannelEventRecord[];
    pairing_failures: ChannelEventRecord[];
  };
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'n/a';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function titleCase(token: string | null | undefined): string {
  const value = String(token || '').trim();
  if (!value) {
    return 'Unknown';
  }
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status: string | null | undefined): 'neutral' | 'success' | 'warning' | 'danger' {
  const token = String(status || '').trim().toLowerCase();
  if (token === 'live' || token === 'healthy' || token === 'ok') {
    return 'success';
  }
  if (
    token === 'setup_needed'
    || token === 'degraded'
    || token === 'connecting'
    || token === 'qr_required'
    || token === 'pairing_code_required'
    || token === 'authorization_required'
    || token === 'code_required'
  ) {
    return 'warning';
  }
  if (token === 'gateway_required' || token === 'idle') {
    return 'neutral';
  }
  if (token === 'disabled') {
    return 'neutral';
  }
  return 'danger';
}

function defaultQuickSetupDraft(mode: ChannelModeRecord): QuickSetupDraft {
  const familyLabel = titleCase(mode.family);
  return {
    label: `${familyLabel} Quick`,
    botToken: '',
    chatId: '',
    accountSid: '',
    authToken: '',
    fromNumber: '',
    toNumber: '',
  };
}

function createQuickSetupDraftMap(families: ChannelFamilyRecord[]): Record<string, QuickSetupDraft> {
  return families.reduce<Record<string, QuickSetupDraft>>((accumulator, family) => {
    for (const mode of family.modes) {
      accumulator[mode.id] = defaultQuickSetupDraft(mode);
    }
    return accumulator;
  }, {});
}

function defaultPersonalSetupDraft(): PersonalSetupDraft {
  return {
    apiId: '',
    apiHash: '',
    phoneNumber: '',
    loginCode: '',
    password: '',
    customPairingCode: '',
  };
}

function createPersonalSetupDraftMap(families: ChannelFamilyRecord[]): Record<string, PersonalSetupDraft> {
  return families.reduce<Record<string, PersonalSetupDraft>>((accumulator, family) => {
    for (const mode of family.modes) {
      accumulator[mode.id] = defaultPersonalSetupDraft();
    }
    return accumulator;
  }, {});
}

function setupActionLabel(mode: ChannelModeRecord): string {
  if (mode.mode_kind === 'personal') {
    return mode.gateway_id ? 'Inspect state' : 'Pair gateway';
  }
  return mode.configured ? 'Add connector' : 'Set up quick mode';
}

function channelIssueKey(
  provider: string,
  issue: ChannelIssueRecord,
  index: number,
): string {
  return [
    provider,
    issue.connector_id || 'workspace',
    issue.code || 'issue',
    issue.message || 'detail',
    issue.occurred_at || 'current',
    String(index),
  ].join(':');
}

async function requestChannelOperationsJson<T>(
  services: ReturnType<typeof useWorkspaceServices>,
  path: string,
): Promise<T> {
  const controller = services.disposables.trackAbortController(new AbortController());
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
    },
    signal: controller.signal,
    cache: 'no-store',
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as T & { detail?: string; error?: string } : {} as T;
  if (!response.ok) {
    const detail =
      typeof (payload as { detail?: string }).detail === 'string'
        ? (payload as { detail?: string }).detail
        : typeof (payload as { error?: string }).error === 'string'
          ? (payload as { error?: string }).error
          : `Channel operations request failed with status ${response.status}.`;
    throw new Error(detail);
  }

  return payload;
}

export function WorkspaceChannelOperationsConsole() {
  const { bootstrap, hasCapability, shellProfile } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const workspaceId = bootstrap.workspace.id;
  const cacheKey = 'channel-operations:console';
  const initialPayload = useMemo(
    () =>
      services.queryClient.peek<ChannelOperationsPayload>(cacheKey)
      ?? services.persistence.getJson<ChannelOperationsPayload>(cacheKey),
    [services],
  );

  const [payload, setPayload] = useState<ChannelOperationsPayload | null>(initialPayload);
  const [loading, setLoading] = useState(!initialPayload);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(() => {
    const telegramMode = initialPayload?.channel_families?.telegram?.modes?.[0]?.id;
    const whatsappMode = initialPayload?.channel_families?.whatsapp?.modes?.[0]?.id;
    return telegramMode || whatsappMode || null;
  });
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [quickSetupDrafts, setQuickSetupDrafts] = useState<Record<string, QuickSetupDraft>>(() =>
    createQuickSetupDraftMap(
      [
        initialPayload?.channel_families?.telegram,
        initialPayload?.channel_families?.whatsapp,
      ].filter((family): family is ChannelFamilyRecord => Boolean(family)),
    ),
  );
  const [personalSetupDrafts, setPersonalSetupDrafts] = useState<Record<string, PersonalSetupDraft>>(() =>
    createPersonalSetupDraftMap(
      [
        initialPayload?.channel_families?.telegram,
        initialPayload?.channel_families?.whatsapp,
      ].filter((family): family is ChannelFamilyRecord => Boolean(family)),
    ),
  );
  const [pairingDraft, setPairingDraft] = useState<PairingDraft>({
    displayName: 'My device',
    platform: 'macos',
  });
  const [pairingIntent, setPairingIntent] = useState<GatewayPairingIntentRecord | null>(null);
  const [pairingModeId, setPairingModeId] = useState<string | null>(null);
  const [personalModeDetails, setPersonalModeDetails] = useState<Record<string, PersonalChannelViewPayload | null>>({});

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

  async function refresh(options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) {
      setLoading(true);
    }
    setErrorMessage(null);
    try {
      const nextPayload = await requestChannelOperationsJson<ChannelOperationsPayload>(
        services,
        `/api/workspaces/${encodeURIComponent(workspaceId)}/channel-operations`,
      );
      services.queryClient.set(cacheKey, nextPayload);
      services.persistence.setJson(cacheKey, nextPayload);
      setPayload(nextPayload);
      if (!options.silent) {
        setStatusMessage(`Refreshed backend operator state at ${formatTimestamp(nextPayload.generated_at)}.`);
      }
    } catch (error) {
      const fallback =
        services.queryClient.peek<ChannelOperationsPayload>(cacheKey)
        ?? services.persistence.getJson<ChannelOperationsPayload>(cacheKey);
      if (fallback) {
        setPayload(fallback);
        setStatusMessage('Showing cached operator state because the backend is temporarily unreachable.');
      }
      setErrorMessage(error instanceof Error ? error.message : 'Could not load channel operations state.');
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void refresh({ silent: Boolean(initialPayload) });
    const dispose = services.realtime.registerPoller(() => {
      void refresh({ silent: true });
    }, 15000);
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, services]);

  const providers = [
    payload?.channels.telegram,
    payload?.channels.whatsapp,
  ].filter((provider): provider is ChannelOperationsProviderRecord => Boolean(provider));
  const channelFamilies = [
    payload?.channel_families?.telegram,
    payload?.channel_families?.whatsapp,
  ].filter((family): family is ChannelFamilyRecord => Boolean(family));

  useEffect(() => {
    if (channelFamilies.length === 0) {
      return;
    }
    const modes = channelFamilies.flatMap((family) => family.modes);
    setSelectedModeId((current) => {
      if (current && modes.some((mode) => mode.id === current)) {
        return current;
      }
      return modes[0]?.id ?? null;
    });
    setQuickSetupDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const mode of modes) {
        if (!next[mode.id]) {
          next[mode.id] = defaultQuickSetupDraft(mode);
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setPersonalSetupDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const mode of modes) {
        if (!next[mode.id]) {
          next[mode.id] = defaultPersonalSetupDraft();
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [channelFamilies]);

  const selectedMode = channelFamilies
    .flatMap((family) => family.modes)
    .find((mode) => mode.id === selectedModeId) ?? null;
  const selectedPersonalModeDetail = selectedMode ? personalModeDetails[selectedMode.id] ?? null : null;

  useEffect(() => {
    if (!selectedMode || selectedMode.mode_kind !== 'personal') {
      return;
    }
    void loadPersonalModeDetail(selectedMode).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load personal channel state.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMode?.id, selectedMode?.mode_kind, selectedMode?.gateway_id]);

  async function loadPersonalModeDetail(
    mode: ChannelModeRecord,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const gatewayId = String(mode.gateway_id ?? '').trim();
    if (!gatewayId) {
      setPersonalModeDetails((current) => ({
        ...current,
        [mode.id]: null,
      }));
      return;
    }
    if (!options.force && personalModeDetails[mode.id]) {
      return;
    }
    const path = mode.family === 'telegram'
      ? `/api/personal-channels/telegram/gateways/${encodeURIComponent(gatewayId)}`
      : `/api/personal-channels/whatsapp/gateways/${encodeURIComponent(gatewayId)}`;
    const detail = await requestPayload<PersonalChannelViewPayload>(path);
    setPersonalModeDetails((current) => ({
      ...current,
      [mode.id]: detail,
    }));
  }

  function handleSelectMode(mode: ChannelModeRecord) {
    setSelectedModeId(mode.id);
    setStatusMessage(null);
    setErrorMessage(null);
    if (mode.mode_kind === 'personal') {
      void loadPersonalModeDetail(mode).catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load personal channel state.');
      });
    }
  }

  function updateQuickSetupDraft(mode: ChannelModeRecord, patch: Partial<QuickSetupDraft>) {
    setQuickSetupDrafts((current) => ({
      ...current,
      [mode.id]: {
        ...(current[mode.id] ?? defaultQuickSetupDraft(mode)),
        ...patch,
      },
    }));
  }

  function updatePersonalSetupDraft(mode: ChannelModeRecord, patch: Partial<PersonalSetupDraft>) {
    setPersonalSetupDrafts((current) => ({
      ...current,
      [mode.id]: {
        ...(current[mode.id] ?? defaultPersonalSetupDraft()),
        ...patch,
      },
    }));
  }

  async function handleCreateQuickConnector(mode: ChannelModeRecord): Promise<void> {
    const draft = quickSetupDrafts[mode.id] ?? defaultQuickSetupDraft(mode);
    const connector = mode.family === 'telegram' ? 'telegram_bot' : 'whatsapp_twilio';
    const credentials = mode.family === 'telegram'
      ? {
          bot_token: draft.botToken.trim(),
          chat_id: draft.chatId.trim(),
        }
      : {
          account_sid: draft.accountSid.trim(),
          auth_token: draft.authToken.trim(),
          from_number: draft.fromNumber.trim(),
          to_number: draft.toNumber.trim(),
        };
    setBusyActionKey(`quick:${mode.id}`);
    setErrorMessage(null);
    try {
      await requestPayload<Record<string, unknown>>(
        `/api/connectors/vault?workspace_id=${encodeURIComponent(workspaceId)}`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            label: draft.label.trim() || defaultQuickSetupDraft(mode).label,
            connector,
            credentials,
            metadata: {
              channel_family: mode.family,
              mode_kind: mode.mode_kind,
              runtime_lane: mode.runtime_lane,
              setup_surface: 'workspace_channel_operations_console',
            },
          }),
        },
      );
      setQuickSetupDrafts((current) => ({
        ...current,
        [mode.id]: defaultQuickSetupDraft(mode),
      }));
      await refresh({ silent: true });
      setStatusMessage(`${titleCase(mode.family)} quick mode connector saved to this workspace.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save the quick-mode connector.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleCreatePairingIntent(mode: ChannelModeRecord): Promise<void> {
    setBusyActionKey(`pair:${mode.id}`);
    setErrorMessage(null);
    try {
      const detail = await requestPayload<GatewayPairingIntentRecord>(
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
      setPairingIntent(detail);
      setPairingModeId(mode.id);
      setStatusMessage('Gateway pairing token is ready. Finish registration from the local gateway on that device.');
      await refresh({ silent: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create the gateway pairing token.');
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleSubmitPersonalSetup(mode: ChannelModeRecord): Promise<void> {
    const draft = personalSetupDrafts[mode.id] ?? defaultPersonalSetupDraft();
    const apiIdToken = draft.apiId.trim();
    if (mode.family === 'telegram' && apiIdToken && !/^\d+$/.test(apiIdToken)) {
      setErrorMessage('Telegram API ID must be numeric.');
      return;
    }
    const path = mode.family === 'telegram'
      ? `/api/personal-channels/telegram/gateways/${encodeURIComponent(String(mode.gateway_id ?? '').trim())}/setup`
      : `/api/personal-channels/whatsapp/gateways/${encodeURIComponent(String(mode.gateway_id ?? '').trim())}/setup`;
    const payload = mode.family === 'telegram'
      ? {
          ...(apiIdToken ? { api_id: Number(apiIdToken) } : {}),
          ...(draft.apiHash.trim() ? { api_hash: draft.apiHash.trim() } : {}),
          ...(draft.phoneNumber.trim() ? { phone_number: draft.phoneNumber.trim() } : {}),
          ...(draft.loginCode.trim() ? { login_code: draft.loginCode.trim() } : {}),
          ...(draft.password.trim() ? { password: draft.password.trim() } : {}),
        }
      : {
          ...(draft.phoneNumber.trim() ? { phone_number: draft.phoneNumber.trim() } : {}),
          ...(draft.customPairingCode.trim() ? { custom_pairing_code: draft.customPairingCode.trim() } : {}),
        };
    if (!mode.gateway_id) {
      setErrorMessage('Pair a gateway first before sending personal login inputs.');
      return;
    }
    if (Object.keys(payload).length === 0) {
      setErrorMessage(`Enter at least one ${titleCase(mode.family)} personal setup field before saving.`);
      return;
    }
    setBusyActionKey(`personal:${mode.id}`);
    setErrorMessage(null);
    try {
      await requestPayload<Record<string, unknown>>(path, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      setPersonalSetupDrafts((current) => ({
        ...current,
        [mode.id]: {
          ...defaultPersonalSetupDraft(),
          apiId: current[mode.id]?.apiId ?? '',
          apiHash: '',
          phoneNumber: current[mode.id]?.phoneNumber ?? '',
          loginCode: '',
          password: '',
          customPairingCode: '',
        },
      }));
      await loadPersonalModeDetail(mode, { force: true });
      await refresh({ silent: true });
      setStatusMessage(`${titleCase(mode.family)} personal setup was sent to the paired gateway.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save personal setup to the paired gateway.');
    } finally {
      setBusyActionKey(null);
    }
  }

  if (!hasCapability('workspace_admin_enabled')) {
    return (
      <div data-workstation-surface="admin/channel-operations">
        <ListDetailShell
          className="app-studio-shell app-studio-shell--channel-operations"
          title="Channel operations"
          subtitle="Workspace-scoped Telegram and WhatsApp setup, delivery health, and channel state."
        >
          <StateBanner
            tone="warning"
            title="Access restricted"
            detail="This workspace membership does not have permission to inspect channel operations."
          />
        </ListDetailShell>
      </div>
    );
  }

  return (
    <div data-workstation-surface="admin/channel-operations">
      <ListDetailShell
        className="app-studio-shell app-studio-shell--channel-operations"
        title="Studio · Channels"
        subtitle="Choose the fast connector path or the paired gateway path, then review delivery health and recent channel activity."
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            disabled={loading}
            onClick={() => {
              void refresh();
            }}
          >
            Refresh
          </AppButton>
        )}
      >
        <StateBanner
          title="Workspace scope"
          detail={`Workspace ${bootstrap.workspace.label} · Profile ${shellProfile.label} · Plan ${titleCase(bootstrap.entitlements.plan)} · Last refresh ${formatTimestamp(payload?.generated_at)}`}
        />
        {statusMessage ? <StateBanner tone="success" title="Updated" detail={statusMessage} /> : null}
        {errorMessage ? <StateBanner tone="danger" title="Operator state degraded" detail={errorMessage} /> : null}
        {loading && !payload ? (
          <div className="app-stack-3">
            <SkeletonBlock height="3rem" />
            <SkeletonBlock height="6rem" />
            <SkeletonBlock height="6rem" />
          </div>
        ) : null}

        <ListDetailColumns
          primary={(
            <div className="app-stack-4">
              <ListDetailPanel
                className="studio-panel studio-panel--channels"
                eyebrow="Families"
                title="Channel setup modes"
                subtitle="Each family keeps both lanes: your real account through the paired gateway, or a faster cloud connector path for business-facing work."
              >
                {channelFamilies.length === 0 ? (
                  <EmptyPanel
                    title="No channel family state"
                    body="Refresh this workspace to load Telegram and WhatsApp mode recommendations."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 1.25fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1.15fr) minmax(9rem, 0.7fr)">
                      <DataTableHeaderCell>Family and mode</DataTableHeaderCell>
                      <DataTableHeaderCell>Lane</DataTableHeaderCell>
                      <DataTableHeaderCell>Setup</DataTableHeaderCell>
                      <DataTableHeaderCell>Current state</DataTableHeaderCell>
                      <DataTableHeaderCell>Action</DataTableHeaderCell>
                    </DataTableHeader>
                    {channelFamilies.flatMap((family) =>
                      family.modes.map((mode) => (
                        <DataTableRow
                          key={mode.id}
                          columns="minmax(0, 1.25fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1.15fr) minmax(9rem, 0.7fr)"
                        >
                          <DataTableCell
                            primary={`${family.label} · ${mode.label}`}
                            secondary={mode.description}
                            meta={
                              selectedModeId === mode.id
                                ? 'Selected below'
                                : family.active_mode === mode.mode_kind
                                  ? 'Active path in this workspace'
                                  : mode.best_for
                            }
                          />
                          <DataTableCell
                            primary={<DataBadge tone={mode.mode_kind === 'personal' ? 'accent' : 'neutral'}>{titleCase(mode.runtime_lane)}</DataBadge>}
                            secondary={titleCase(mode.provider)}
                            meta={mode.gateway_id ? `Gateway ${mode.gateway_id}` : mode.connector_count ? `${mode.connector_count} connector${mode.connector_count === 1 ? '' : 's'}` : undefined}
                          />
                          <DataTableCell
                            primary={<DataBadge tone={mode.setup_weight === 'light' ? 'success' : 'warning'}>{titleCase(mode.setup_weight)}</DataBadge>}
                            secondary={mode.strategy === 'recommended_for_sage' ? 'Best for Sage acting as you' : 'Best for fast setup'}
                            meta={mode.linked_identity || undefined}
                          />
                          <DataTableCell
                            primary={<DataBadge tone={statusTone(mode.current_status)}>{titleCase(mode.current_status)}</DataBadge>}
                            secondary={mode.setup_hint || 'No mode hint available'}
                          />
                          <DataTableCell
                            primary={(
                              <AppButton
                                type="button"
                                tone={selectedModeId === mode.id ? 'secondary' : 'primary'}
                                disabled={busyActionKey === `quick:${mode.id}` || busyActionKey === `pair:${mode.id}`}
                                onClick={() => {
                                  handleSelectMode(mode);
                                }}
                              >
                                {busyActionKey === `quick:${mode.id}` || busyActionKey === `pair:${mode.id}`
                                  ? 'Working…'
                                  : setupActionLabel(mode)}
                              </AppButton>
                            )}
                            secondary={selectedModeId === mode.id ? 'Open below' : undefined}
                          />
                        </DataTableRow>
                      )),
                    )}
                  </DataTable>
                )}
              </ListDetailPanel>

              <ListDetailPanel
                className="studio-panel studio-panel--channels"
                eyebrow="Mode setup"
                title={selectedMode ? `${titleCase(selectedMode.family)} · ${selectedMode.label}` : 'Select a mode'}
                subtitle={
                  selectedMode
                    ? selectedMode.setup_hint || 'Choose how this channel family should be enabled in the workspace.'
                    : 'Choose one mode above to configure quick setup or inspect the current personal gateway state.'
                }
              >
                {!selectedMode ? (
                  <EmptyPanel
                    title="No mode selected"
                    body="Pick Telegram or WhatsApp quick mode or personal mode above to continue."
                  />
                ) : selectedMode.mode_kind === 'quick' ? (
                  <div className="app-stack-4">
                    <FormGrid columns="repeat(2, minmax(0, 1fr))">
                      <FormReadout
                        label="Current state"
                        value={<DataBadge tone={statusTone(selectedMode.current_status)}>{titleCase(selectedMode.current_status)}</DataBadge>}
                      />
                      <FormReadout
                        label="Connector count"
                        value={String(selectedMode.connector_count ?? 0)}
                      />
                      <FormReadout
                        label="Lane"
                        value={titleCase(selectedMode.runtime_lane)}
                      />
                      <FormReadout
                        label="Provider"
                        value={titleCase(selectedMode.provider)}
                      />
                    </FormGrid>

                    <FormSection
                      title="Quick connector setup"
                      description={
                        selectedMode.family === 'telegram'
                          ? 'Create or add a Telegram bot connector from this shell. This is the fast business-facing path.'
                          : 'Create or add a Twilio WhatsApp connector from this shell. This is the fast business-facing path.'
                      }
                    >
                      <FormGrid columns="repeat(2, minmax(0, 1fr))">
                        <FormField label="Connector label" hint="Human-readable label shown in operator surfaces.">
                          <FormInput
                            value={(quickSetupDrafts[selectedMode.id] ?? defaultQuickSetupDraft(selectedMode)).label}
                            onChange={(event) => {
                              updateQuickSetupDraft(selectedMode, { label: event.currentTarget.value });
                            }}
                            placeholder={defaultQuickSetupDraft(selectedMode).label}
                          />
                        </FormField>

                        {selectedMode.family === 'telegram' ? (
                          <>
                            <FormField label="Bot token" hint="Paste the BotFather token for this quick-mode bot.">
                              <FormInput
                                value={(quickSetupDrafts[selectedMode.id] ?? defaultQuickSetupDraft(selectedMode)).botToken}
                                onChange={(event) => {
                                  updateQuickSetupDraft(selectedMode, { botToken: event.currentTarget.value });
                                }}
                                placeholder="123456789:ABC..."
                              />
                            </FormField>
                            <FormField label="Chat ID" hint="Use the numeric chat id that should receive quick-mode messages.">
                              <FormInput
                                value={(quickSetupDrafts[selectedMode.id] ?? defaultQuickSetupDraft(selectedMode)).chatId}
                                onChange={(event) => {
                                  updateQuickSetupDraft(selectedMode, { chatId: event.currentTarget.value });
                                }}
                                placeholder="1932934047"
                              />
                            </FormField>
                          </>
                        ) : (
                          <>
                            <FormField label="Account SID" hint="Twilio account SID for the WhatsApp sender.">
                              <FormInput
                                value={(quickSetupDrafts[selectedMode.id] ?? defaultQuickSetupDraft(selectedMode)).accountSid}
                                onChange={(event) => {
                                  updateQuickSetupDraft(selectedMode, { accountSid: event.currentTarget.value });
                                }}
                                placeholder="AC..."
                              />
                            </FormField>
                            <FormField label="Auth token" hint="Twilio auth token used to send WhatsApp messages.">
                              <FormInput
                                value={(quickSetupDrafts[selectedMode.id] ?? defaultQuickSetupDraft(selectedMode)).authToken}
                                onChange={(event) => {
                                  updateQuickSetupDraft(selectedMode, { authToken: event.currentTarget.value });
                                }}
                                placeholder="Twilio auth token"
                              />
                            </FormField>
                            <FormField label="From number" hint="Twilio WhatsApp sender number, including country code.">
                              <FormInput
                                value={(quickSetupDrafts[selectedMode.id] ?? defaultQuickSetupDraft(selectedMode)).fromNumber}
                                onChange={(event) => {
                                  updateQuickSetupDraft(selectedMode, { fromNumber: event.currentTarget.value });
                                }}
                                placeholder="whatsapp:+14155238886"
                              />
                            </FormField>
                            <FormField label="To number" hint="Destination number used for quick-mode tests and outbound flows.">
                              <FormInput
                                value={(quickSetupDrafts[selectedMode.id] ?? defaultQuickSetupDraft(selectedMode)).toNumber}
                                onChange={(event) => {
                                  updateQuickSetupDraft(selectedMode, { toNumber: event.currentTarget.value });
                                }}
                                placeholder="whatsapp:+8618657105303"
                              />
                            </FormField>
                          </>
                        )}
                      </FormGrid>
                      <div className="app-inline-actions">
                        <AppButton
                          type="button"
                          disabled={busyActionKey === `quick:${selectedMode.id}`}
                          onClick={() => {
                            void handleCreateQuickConnector(selectedMode);
                          }}
                        >
                          {busyActionKey === `quick:${selectedMode.id}`
                            ? 'Saving connector…'
                            : selectedMode.configured
                              ? 'Add connector'
                              : 'Save quick connector'}
                        </AppButton>
                      </div>
                    </FormSection>
                  </div>
                ) : (
                  <div className="app-stack-4">
                    <StateBanner
                      tone="warning"
                      title="Personal mode runs through the paired gateway"
                      detail="This surface now sends personal login inputs to the paired gateway. Linked-device pairing, QR scans, and phone confirmation still happen on your real device."
                    />

                    <FormGrid columns="repeat(2, minmax(0, 1fr))">
                      <FormReadout
                        label="Current state"
                        value={<DataBadge tone={statusTone(selectedMode.current_status)}>{titleCase(selectedMode.current_status)}</DataBadge>}
                      />
                      <FormReadout
                        label="Gateway"
                        value={selectedMode.gateway_id || 'Not paired yet'}
                      />
                      <FormReadout
                        label="Linked identity"
                        value={selectedMode.linked_identity || 'Not linked yet'}
                      />
                      <FormReadout
                        label="Recent messages"
                        value={String(Array.isArray(selectedPersonalModeDetail?.recent_messages) ? selectedPersonalModeDetail?.recent_messages.length : 0)}
                      />
                    </FormGrid>

                    {selectedMode.gateway_id ? (
                      <FormSection
                        title="Personal setup inputs"
                        description={
                          selectedMode.family === 'telegram'
                            ? 'Send Telegram personal credentials, login code, or 2FA password through the paired gateway. Blank fields are left unchanged.'
                            : 'Send WhatsApp personal phone setup through the paired gateway. Blank fields are left unchanged.'
                        }
                      >
                        <FormGrid columns="repeat(2, minmax(0, 1fr))">
                          {selectedMode.family === 'telegram' ? (
                            <>
                              <FormField label="API ID" hint="Telegram API development tools id for your personal account.">
                                <FormInput
                                  value={(personalSetupDrafts[selectedMode.id] ?? defaultPersonalSetupDraft()).apiId}
                                  onChange={(event) => {
                                    updatePersonalSetupDraft(selectedMode, { apiId: event.currentTarget.value });
                                  }}
                                  placeholder="123456"
                                />
                              </FormField>
                              <FormField label="API hash" hint="Telegram API hash for your personal account.">
                                <FormInput
                                  value={(personalSetupDrafts[selectedMode.id] ?? defaultPersonalSetupDraft()).apiHash}
                                  onChange={(event) => {
                                    updatePersonalSetupDraft(selectedMode, { apiHash: event.currentTarget.value });
                                  }}
                                  placeholder="Telegram API hash"
                                />
                              </FormField>
                              <FormField label="Phone number" hint="Your Telegram phone number, including country code.">
                                <FormInput
                                  value={(personalSetupDrafts[selectedMode.id] ?? defaultPersonalSetupDraft()).phoneNumber}
                                  onChange={(event) => {
                                    updatePersonalSetupDraft(selectedMode, { phoneNumber: event.currentTarget.value });
                                  }}
                                  placeholder="+8618657105303"
                                />
                              </FormField>
                              <FormField label="Login code" hint="One-time Telegram login code sent to your phone.">
                                <FormInput
                                  value={(personalSetupDrafts[selectedMode.id] ?? defaultPersonalSetupDraft()).loginCode}
                                  onChange={(event) => {
                                    updatePersonalSetupDraft(selectedMode, { loginCode: event.currentTarget.value });
                                  }}
                                  placeholder="12345"
                                />
                              </FormField>
                              <FormField label="2FA password" hint="Only needed if Telegram asks for your cloud password.">
                                <FormInput
                                  value={(personalSetupDrafts[selectedMode.id] ?? defaultPersonalSetupDraft()).password}
                                  onChange={(event) => {
                                    updatePersonalSetupDraft(selectedMode, { password: event.currentTarget.value });
                                  }}
                                  placeholder="Telegram 2FA password"
                                />
                              </FormField>
                            </>
                          ) : (
                            <>
                              <FormField label="Phone number" hint="Digits or international phone number used for Linked Devices pairing.">
                                <FormInput
                                  value={(personalSetupDrafts[selectedMode.id] ?? defaultPersonalSetupDraft()).phoneNumber}
                                  onChange={(event) => {
                                    updatePersonalSetupDraft(selectedMode, { phoneNumber: event.currentTarget.value });
                                  }}
                                  placeholder="8618657105303"
                                />
                              </FormField>
                              <FormField label="Custom pairing code" hint="Optional custom pairing code if you want to request a specific code pattern.">
                                <FormInput
                                  value={(personalSetupDrafts[selectedMode.id] ?? defaultPersonalSetupDraft()).customPairingCode}
                                  onChange={(event) => {
                                    updatePersonalSetupDraft(selectedMode, { customPairingCode: event.currentTarget.value });
                                  }}
                                  placeholder="Optional"
                                />
                              </FormField>
                            </>
                          )}
                        </FormGrid>
                        <div className="app-inline-actions">
                          <AppButton
                            type="button"
                            disabled={busyActionKey === `personal:${selectedMode.id}`}
                            onClick={() => {
                              void handleSubmitPersonalSetup(selectedMode);
                            }}
                          >
                            {busyActionKey === `personal:${selectedMode.id}` ? 'Sending setup…' : 'Save personal setup'}
                          </AppButton>
                        </div>
                      </FormSection>
                    ) : null}

                    {selectedMode.gateway_id ? (
                      <div className="app-inline-actions">
                        <AppButton
                          type="button"
                          tone="secondary"
                          disabled={busyActionKey === `inspect:${selectedMode.id}`}
                          onClick={() => {
                            setBusyActionKey(`inspect:${selectedMode.id}`);
                            setErrorMessage(null);
                            void loadPersonalModeDetail(selectedMode, { force: true })
                              .then(() => {
                                setStatusMessage(`${titleCase(selectedMode.family)} personal state refreshed from the paired gateway.`);
                              })
                              .catch((error) => {
                                setErrorMessage(error instanceof Error ? error.message : 'Could not refresh personal channel state.');
                              })
                              .finally(() => {
                                setBusyActionKey(null);
                              });
                          }}
                        >
                          {busyActionKey === `inspect:${selectedMode.id}` ? 'Refreshing…' : 'Refresh personal state'}
                        </AppButton>
                      </div>
                    ) : null}

                    {selectedPersonalModeDetail?.state?.login_hint ? (
                      <FormReadout
                        label="Login hint"
                        value={String(selectedPersonalModeDetail.state.login_hint)}
                      />
                    ) : null}
                    {selectedPersonalModeDetail?.state?.pairing_code ? (
                      <FormReadout
                        label="Pairing code"
                        value={<code>{String(selectedPersonalModeDetail.state.pairing_code)}</code>}
                      />
                    ) : null}
                    {selectedPersonalModeDetail?.state?.qr_code ? (
                      <FormReadout
                        label="QR payload"
                        value={<code>{String(selectedPersonalModeDetail.state.qr_code)}</code>}
                      />
                    ) : null}

                    <FormSection
                      title="Pair gateway"
                      description="Create a short-lived pairing token for the desktop or private host that will run empyralis-gateway."
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
                        <FormField label="Platform" hint="Used to help the operator identify the local gateway target.">
                          <FormSelect
                            value={pairingDraft.platform}
                            onChange={(event) => {
                              setPairingDraft((current) => ({
                                ...current,
                                platform: event.currentTarget.value,
                              }));
                            }}
                          >
                            <option value="macos">macOS</option>
                            <option value="windows">Windows</option>
                            <option value="linux">Linux</option>
                          </FormSelect>
                        </FormField>
                      </FormGrid>
                      <div className="app-inline-actions">
                        <AppButton
                          type="button"
                          disabled={busyActionKey === `pair:${selectedMode.id}`}
                          onClick={() => {
                            void handleCreatePairingIntent(selectedMode);
                          }}
                        >
                          {busyActionKey === `pair:${selectedMode.id}` ? 'Creating token…' : 'Create pairing token'}
                        </AppButton>
                      </div>
                    </FormSection>

                    {pairingModeId === selectedMode.id && pairingIntent ? (
                      <FormGrid columns="repeat(2, minmax(0, 1fr))">
                        <FormReadout
                          label="Pairing token"
                          value={<code>{String(pairingIntent.pairing_token || 'Unavailable')}</code>}
                        />
                        <FormReadout
                          label="Expires"
                          value={formatTimestamp(pairingIntent.expires_at)}
                        />
                        <FormReadout
                          label="Suggested device"
                          value={String(pairingIntent.display_name || 'Unlabeled device')}
                        />
                        <FormReadout
                          label="Platform"
                          value={titleCase(String(pairingIntent.platform || 'unknown'))}
                        />
                      </FormGrid>
                    ) : null}
                  </div>
                )}
              </ListDetailPanel>

              <ListDetailPanel
                className="studio-panel studio-panel--channels"
                eyebrow="Providers"
                title="Provider health"
                subtitle="Connector readiness, webhook state, and runtime health for each supported provider."
              >
                {providers.length === 0 ? (
                  <EmptyPanel
                    title="No provider state"
                    body="Connect a channel or refresh this workspace to load Telegram or WhatsApp health here."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 1.2fr) minmax(8rem, 0.85fr) minmax(9rem, 0.9fr) minmax(8rem, 0.7fr)">
                      <DataTableHeaderCell>Provider</DataTableHeaderCell>
                      <DataTableHeaderCell>Status</DataTableHeaderCell>
                      <DataTableHeaderCell>Webhook</DataTableHeaderCell>
                      <DataTableHeaderCell>Connectors</DataTableHeaderCell>
                    </DataTableHeader>
                    {providers.map((provider) => (
                      <DataTableRow
                        key={provider.provider}
                        columns="minmax(0, 1.2fr) minmax(8rem, 0.85fr) minmax(9rem, 0.9fr) minmax(8rem, 0.7fr)"
                      >
                        <DataTableCell
                          primary={titleCase(provider.provider)}
                          secondary={provider.workspace_configured ? 'Configured for this workspace' : 'Not configured'}
                          meta={provider.vault_error ? `Vault error: ${provider.vault_error}` : undefined}
                        />
                        <DataTableCell
                          primary={<DataBadge tone={statusTone(provider.workspace_status)}>{titleCase(provider.workspace_status)}</DataBadge>}
                          secondary={provider.profile_issue || provider.last_error || 'No current profile issue'}
                        />
                        <DataTableCell
                          primary={<DataBadge tone={statusTone(String(provider.webhook.status || 'unknown'))}>{titleCase(String(provider.webhook.status || 'unknown'))}</DataBadge>}
                          secondary={typeof provider.webhook.guidance === 'string' ? provider.webhook.guidance : 'Webhook guidance unavailable'}
                        />
                        <DataTableCell
                          primary={String(provider.connectors.length)}
                          secondary={provider.connectors.length === 1 ? 'connector' : 'connectors'}
                        />
                      </DataTableRow>
                    ))}
                  </DataTable>
                )}
              </ListDetailPanel>

              <ListDetailPanel
                className="studio-panel studio-panel--channels"
                eyebrow="Connectors"
                title="Workspace bindings"
                subtitle="Connected bindings and last runtime activity across this workspace."
              >
                {providers.every((provider) => provider.connectors.length === 0) ? (
                  <EmptyPanel
                    title="No connector bindings"
                    body="Connect Telegram or WhatsApp to this workspace to start seeing live connector health and delivery status."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 1.1fr) minmax(0, 1fr) minmax(10rem, 0.8fr)">
                      <DataTableHeaderCell>Connector</DataTableHeaderCell>
                      <DataTableHeaderCell>Health</DataTableHeaderCell>
                      <DataTableHeaderCell>Last activity</DataTableHeaderCell>
                    </DataTableHeader>
                    {providers.flatMap((provider) =>
                      provider.connectors.map((connector) => (
                        <DataTableRow
                          key={connector.id}
                          columns="minmax(0, 1.1fr) minmax(0, 1fr) minmax(10rem, 0.8fr)"
                        >
                          <DataTableCell
                            primary={connector.label || connector.id}
                            secondary={titleCase(provider.provider)}
                            meta={connector.webhook_url || undefined}
                          />
                          <DataTableCell
                            primary={<DataBadge tone={statusTone(connector.profile_status ?? provider.workspace_status)}>{titleCase(connector.profile_status ?? provider.workspace_status)}</DataBadge>}
                            secondary={connector.last_error || connector.profile_issue || 'No current connector issue'}
                          />
                          <DataTableCell
                            primary={formatTimestamp(connector.last_processed_at ?? connector.last_error_at)}
                            secondary={connector.last_action ? `Action ${connector.last_action}` : 'No action recorded'}
                            meta={connector.last_run_id ? `Run ${connector.last_run_id}` : undefined}
                          />
                        </DataTableRow>
                      )),
                    )}
                  </DataTable>
                )}
              </ListDetailPanel>

              <ListDetailPanel
                className="studio-panel studio-panel--channels"
                eyebrow="Events"
                title="Recent activity"
                subtitle="Latest workspace-scoped inbound and outbound channel events."
              >
                {!payload?.events.recent.length ? (
                  <EmptyPanel
                    title="No recent events"
                    body="When channel messages or deliveries start flowing, the latest events will appear here."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 1.1fr) minmax(0, 1.8fr) minmax(10rem, 0.8fr)">
                      <DataTableHeaderCell>Event</DataTableHeaderCell>
                      <DataTableHeaderCell>Detail</DataTableHeaderCell>
                      <DataTableHeaderCell>Timestamp</DataTableHeaderCell>
                    </DataTableHeader>
                    {payload.events.recent.slice(0, 20).map((event) => (
                      <DataTableRow
                        key={event.id}
                        columns="minmax(0, 1.1fr) minmax(0, 1.8fr) minmax(10rem, 0.8fr)"
                      >
                        <DataTableCell
                          primary={`${event.channel || 'channel'} · ${event.direction || 'unknown'}`}
                          secondary={event.action || event.event_type || 'event'}
                          meta={event.trace_id ? `Trace ${event.trace_id}` : undefined}
                        />
                        <DataTableCell
                          primary={event.text || 'Event detail unavailable.'}
                          secondary={event.run_id ? `Run ${event.run_id}` : 'No run reference'}
                        />
                        <DataTableCell primary={formatTimestamp(event.ts)} />
                      </DataTableRow>
                    ))}
                  </DataTable>
                )}
              </ListDetailPanel>
            </div>
          )}
          secondary={(
            <div className="app-stack-4">
              <ListDetailPanel
                className="studio-panel studio-panel--channels"
                eyebrow="Queue"
                title="Delivery load"
                subtitle="Durable queue pressure and workspace-specific send volume."
              >
                <FormGrid columns="repeat(2, minmax(0, 1fr))">
                  <FormReadout label="Workspace pending" value={String(payload?.delivery.workspace_summary.pending_count ?? 0)} />
                  <FormReadout label="Workspace retries" value={String(payload?.delivery.workspace_summary.retry_count_total ?? 0)} />
                  <FormReadout label="Runtime undelivered" value={String(payload?.delivery.runtime_summary.undelivered_count ?? 0)} />
                  <FormReadout label="Poisoned" value={String(payload?.delivery.runtime_summary.poisoned_count ?? 0)} />
                </FormGrid>
              </ListDetailPanel>

              <ListDetailPanel
                className="studio-panel studio-panel--channels"
                eyebrow="Issues"
                title="Current issues"
                subtitle="Connector or provider problems that need workspace attention."
              >
                {providers.every((provider) => provider.issues.length === 0) ? (
                  <EmptyPanel
                    title="No current issues"
                    body="If a connector degrades, a webhook fails, or delivery stalls, the issue will appear here."
                  />
                ) : (
                  <div className="app-stack-3">
                    {providers.flatMap((provider) =>
                      provider.issues.map((issue, index) => (
                        <StateBanner
                          key={channelIssueKey(provider.provider, issue, index)}
                          tone={statusTone(issue.severity)}
                          title={`${titleCase(provider.provider)} · ${issue.code || 'Issue'}`}
                          detail={issue.message || 'Issue detail unavailable.'}
                        >
                          {issue.connector_id ? `Connector ${issue.connector_id}` : ''}
                        </StateBanner>
                      )),
                    )}
                  </div>
                )}
              </ListDetailPanel>

              <ListDetailPanel
                className="studio-panel studio-panel--channels"
                eyebrow="Failures"
                title="Pairing failures and dead letters"
                subtitle="Recent failures that still need follow-up before messages can flow cleanly."
              >
                {!(payload?.events.pairing_failures.length || payload?.delivery.dead_letters.length) ? (
                  <EmptyPanel
                    title="No recent failures"
                    body="Pairing failures and dead letters will appear here only when operator action is needed."
                  />
                ) : (
                  <div className="app-stack-3">
                    {payload?.events.pairing_failures.slice(0, 6).map((event) => (
                      <StateBanner
                        key={`pairing:${event.id}`}
                        tone="warning"
                        title={`${event.channel || 'channel'} pairing failure`}
                        detail={event.text || 'Pairing failure detail unavailable.'}
                      >
                        {formatTimestamp(event.ts)}
                      </StateBanner>
                    ))}
                    {payload?.delivery.dead_letters.slice(0, 6).map((event) => (
                      <StateBanner
                        key={`dead:${event.id}`}
                        tone="danger"
                        title={`${event.channel || 'channel'} dead letter`}
                        detail={event.text || event.reason || 'Dead-letter detail unavailable.'}
                      >
                        {formatTimestamp(event.ts)}
                      </StateBanner>
                    ))}
                  </div>
                )}
              </ListDetailPanel>
            </div>
          )}
        />
      </ListDetailShell>
    </div>
  );
}
