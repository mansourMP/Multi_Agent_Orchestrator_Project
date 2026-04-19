'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppButton } from '@/lib/ui/primitives';
import { CommandSheet } from '@/lib/ui/command-sheet';
import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import { DataBadge, DataTable, DataTableCell, DataTableHeader, DataTableHeaderCell, DataTableRow } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { ModalSection } from '@/lib/ui/modal';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type ChannelPairingFeatureId = 'settings' | 'integrations';
type ChannelProvider = 'telegram' | 'whatsapp';

type ChannelLinkRecord = {
  link_id: string;
  provider: string;
  external_subject_hint?: string | null;
  workspace_id: string;
  scopes: string[];
  linked_at?: number | null;
  revoked_at?: number | null;
  revoked_reason?: string | null;
  status: 'active' | 'revoked';
};

type ChannelPairingIntentRecord = {
  intent_id: string;
  provider: string;
  workspace_id: string;
  scopes: string[];
  allow_relink: boolean;
  created_at: number;
  expires_at: number;
  pairing_code: string;
  instructions: string;
};

type ChannelLinksResponse = {
  ok: boolean;
  links: ChannelLinkRecord[];
};

type ChannelPairingIntentResponse = {
  ok: boolean;
  intent: ChannelPairingIntentRecord;
};

const CHANNEL_PROVIDER_DEFINITIONS: Record<
  ChannelProvider,
  {
    label: string;
    commandExample: string;
    helpText: string;
    capabilityKey: string;
  }
> = {
  telegram: {
    label: 'Telegram',
    commandExample: '/pair EMP-ABCD-EFGH',
    helpText: 'Open the Telegram bot chat, paste the pairing command, then continue your conversation there.',
    capabilityKey: 'telegram_channel_enabled',
  },
  whatsapp: {
    label: 'WhatsApp',
    commandExample: 'pair EMP-ABCD-EFGH',
    helpText: 'Open the WhatsApp channel, paste the pairing command, then continue your conversation there.',
    capabilityKey: 'whatsapp_channel_enabled',
  },
};

function formatTimestamp(value: number | null | undefined): string {
  if (!value) {
    return 'n/a';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value * 1000));
  } catch {
    return String(value);
  }
}

function isIntentActive(intent: ChannelPairingIntentRecord | null | undefined): boolean {
  return Boolean(intent && intent.expires_at * 1000 > Date.now());
}

function isTechnicalIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return /^https?:\/\//i.test(trimmed)
    || /^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(trimmed)
    || /^[A-Za-z0-9_-]{18,}$/.test(trimmed);
}

function truncateTechnicalIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function channelLinkDisplayLabel(link: ChannelLinkRecord): string {
  const hint = String(link.external_subject_hint || '').trim();
  if (hint) {
    return isTechnicalIdentifier(hint) ? truncateTechnicalIdentifier(hint) : hint;
  }
  return `Linked user ${truncateTechnicalIdentifier(link.link_id)}`;
}

function summarizeLinkStatus(links: ChannelLinkRecord[]): string {
  const activeCount = links.filter((link) => link.status === 'active').length;
  const revokedCount = links.filter((link) => link.status === 'revoked').length;
  return `${activeCount} active · ${revokedCount} revoked`;
}

async function requestChannelPairingJson<T>(
  services: ReturnType<typeof useWorkspaceServices>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = services.disposables.trackAbortController(new AbortController());
  const headers = new Headers(init.headers ?? {});
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    signal: init.signal ?? controller.signal,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as T & { detail?: string; error?: string } : {} as T;
  if (!response.ok) {
    const detail =
      typeof (payload as { detail?: string }).detail === 'string'
        ? (payload as { detail?: string }).detail
        : typeof (payload as { error?: string }).error === 'string'
          ? (payload as { error?: string }).error
          : `Channel pairing request failed with status ${response.status}.`;
    throw new Error(detail);
  }

  return payload;
}

function IntegrationsSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <div className="app-stack-4">
          <ListDetailPanel eyebrow="Providers" title="Loading provider state">
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
          </ListDetailPanel>
          <ListDetailPanel eyebrow="Links" title="Loading linked channels">
            <SkeletonBlock height="2.8rem" />
            <SkeletonBlock height="2.8rem" />
            <SkeletonBlock height="2.8rem" />
          </ListDetailPanel>
        </div>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Selection" title="Loading pairing detail">
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkspaceChannelPairingSurface({
  featureId,
}: {
  featureId: ChannelPairingFeatureId;
}) {
  const { bootstrap, hasCapability, shellProfile } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const workspaceId = bootstrap.workspace.id;
  const linksCacheKey = 'channel-pairing:links';
  const intentsCacheKey = 'channel-pairing:intents';

  const initialLinks = useMemo(
    () =>
      services.queryClient.peek<ChannelLinksResponse>(linksCacheKey)
      ?? services.persistence.getJson<ChannelLinksResponse>(linksCacheKey)
      ?? { ok: true, links: [] },
    [services],
  );
  const initialIntents = useMemo(
    () =>
      services.persistence.getJson<Partial<Record<ChannelProvider, ChannelPairingIntentRecord | null>>>(intentsCacheKey)
      ?? {},
    [services],
  );

  const [linksResponse, setLinksResponse] = useState<ChannelLinksResponse>(initialLinks);
  const [intentByProvider, setIntentByProvider] = useState<Partial<Record<ChannelProvider, ChannelPairingIntentRecord | null>>>(initialIntents);
  const [selectedProvider, setSelectedProvider] = useState<ChannelProvider>('telegram');
  const [loading, setLoading] = useState(false);
  const [isLoadedOnce, setIsLoadedOnce] = useState(initialLinks.links.length > 0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionProvider, setActionProvider] = useState<ChannelProvider | null>(null);
  const [pendingRelinkProvider, setPendingRelinkProvider] = useState<ChannelProvider | null>(null);
  const [revokingLinkId, setRevokingLinkId] = useState<string | null>(null);
  const [pendingRevokeLink, setPendingRevokeLink] = useState<ChannelLinkRecord | null>(null);
  const [codeSheetProvider, setCodeSheetProvider] = useState<ChannelProvider | null>(null);

  useEffect(() => {
    services.persistence.setJson(intentsCacheKey, intentByProvider);
  }, [intentByProvider, intentsCacheKey, services]);

  const canPairChannels = hasCapability('channel_pairing_enabled');
  const activeLinks = useMemo(
    () => linksResponse.links.filter((link) => link.status === 'active'),
    [linksResponse.links],
  );
  const revokedLinks = useMemo(
    () => linksResponse.links.filter((link) => link.status === 'revoked'),
    [linksResponse.links],
  );
  const selectedDefinition = CHANNEL_PROVIDER_DEFINITIONS[selectedProvider];
  const selectedIntent = intentByProvider[selectedProvider] ?? null;
  const selectedProviderLinks = activeLinks.filter((link) => link.provider === selectedProvider);
  const providerEnabled = hasCapability(selectedDefinition.capabilityKey);
  const visibleProviders: ChannelProvider[] = featureId === 'integrations' ? ['telegram'] : ['telegram', 'whatsapp'];

  async function refreshLinks(options: { silent?: boolean } = {}): Promise<ChannelLinksResponse> {
    if (!options.silent) {
      setLoading(true);
    }
    setErrorMessage(null);

    try {
      const payload = await requestChannelPairingJson<ChannelLinksResponse>(
        services,
        `/api/channel-pairing/links?workspace_id=${encodeURIComponent(workspaceId)}&include_revoked=true`,
      );
      services.queryClient.set(linksCacheKey, payload);
      services.persistence.setJson(linksCacheKey, payload);
      setLinksResponse(payload);
      setIsLoadedOnce(true);
      if (!options.silent) {
        setStatusMessage(`Refreshed channel link state from the backend. ${summarizeLinkStatus(payload.links)}`);
      }
      return payload;
    } catch (error) {
      const fallback = services.persistence.getJson<ChannelLinksResponse>(linksCacheKey);
      if (fallback) {
        setLinksResponse(fallback);
        setIsLoadedOnce(true);
        setStatusMessage('Showing cached pairing state because the backend is temporarily unreachable.');
      }
      const message = error instanceof Error ? error.message : 'Could not load channel links.';
      setErrorMessage(message);
      throw error;
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void refreshLinks({ silent: initialLinks.links.length > 0 }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const createIntentRequest = async (provider: ChannelProvider, allowRelink: boolean) => {
    if (!canPairChannels) {
      setErrorMessage('Channel pairing is blocked for this workspace membership.');
      return;
    }
    if (!hasCapability(CHANNEL_PROVIDER_DEFINITIONS[provider].capabilityKey)) {
      setErrorMessage(`${CHANNEL_PROVIDER_DEFINITIONS[provider].label} is not enabled for this workspace plan.`);
      return;
    }

    setActionProvider(provider);
    setErrorMessage(null);
    try {
      const payload = await requestChannelPairingJson<ChannelPairingIntentResponse>(
        services,
        '/api/channel-pairing/intents',
        {
          method: 'POST',
          body: JSON.stringify({
            provider,
            workspace_id: workspaceId,
            allow_relink: allowRelink,
            metadata: {
              source: 'frontend_v2',
              surface: featureId,
            },
          }),
        },
      );
      setIntentByProvider((current) => ({
        ...current,
        [provider]: payload.intent,
      }));
      setSelectedProvider(provider);
      setCodeSheetProvider(provider);
      setStatusMessage(
        `${CHANNEL_PROVIDER_DEFINITIONS[provider].label} pairing code created. Expires ${formatTimestamp(payload.intent.expires_at)}.`,
      );
      await refreshLinks({ silent: true }).catch(() => undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create channel pairing code.');
    } finally {
      setActionProvider(null);
      setPendingRelinkProvider(null);
    }
  };

  const createIntent = async (provider: ChannelProvider) => {
    const providerLinks = activeLinks.filter((link) => link.provider === provider);
    if (providerLinks.length > 0) {
      setPendingRelinkProvider(provider);
      return;
    }
    await createIntentRequest(provider, false);
  };

  const revokeLink = async (link: ChannelLinkRecord) => {
    setRevokingLinkId(link.link_id);
    setErrorMessage(null);
    try {
      await requestChannelPairingJson<{ ok: boolean; link: ChannelLinkRecord }>(
        services,
        `/api/channel-pairing/links/${encodeURIComponent(link.link_id)}/revoke`,
        {
          method: 'POST',
          body: JSON.stringify({
            confirm: true,
            reason: `Revoked from ${featureId} surface in the frontend v2 shell.`,
          }),
        },
      );
      setStatusMessage(
        `${CHANNEL_PROVIDER_DEFINITIONS[link.provider as ChannelProvider]?.label ?? link.provider} link revoked.`,
      );
      await refreshLinks({ silent: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not revoke channel link.');
    } finally {
      setRevokingLinkId(null);
      setPendingRevokeLink(null);
    }
  };

  const title = featureId === 'settings' ? 'Channel pairing' : 'Studio · Channels';
  const intro =
    featureId === 'settings'
      ? 'Generate pairing codes, review active links, and manage channel identities from workspace-backed settings.'
      : 'Connect customer channels, manage linked identities, and keep launch-ready coverage in one place.';

  return (
    <WorkstationSurfaceRoot surface={featureId}>
      <ListDetailShell
        title={title}
        subtitle={intro}
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              void refreshLinks();
            }}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </AppButton>
        )}
      >
        <StateBanner
          tone={canPairChannels ? 'neutral' : 'warning'}
          title={canPairChannels ? 'Channel connections are available' : 'Channel connections are blocked'}
          detail={`${bootstrap.workspace.label} · shell profile ${shellProfile.label}`}
        >
          {canPairChannels
            ? `Link status ${summarizeLinkStatus(linksResponse.links)}.`
            : 'Pairing codes require the correct workspace role and channel access settings.'}
        </StateBanner>

        {statusMessage ? (
          <StateBanner tone="success" title={featureId === 'integrations' ? 'Channels updated' : 'Integrations updated'}>
            {statusMessage}
          </StateBanner>
        ) : null}
        {errorMessage ? (
          <StateBanner tone="danger" title={featureId === 'integrations' ? 'Channels need attention' : 'Integrations need attention'}>
            {errorMessage}
          </StateBanner>
        ) : null}

        {(!isLoadedOnce && loading) ? (
          <IntegrationsSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <div className="app-stack-4">
                <ListDetailPanel
                  eyebrow="Providers"
                  title="Connected channel providers"
                  subtitle="Select a provider to review readiness, active links, and the latest pairing code."
                >
                  <div className="app-stack-3">
                    {visibleProviders.map((provider) => {
                      const definition = CHANNEL_PROVIDER_DEFINITIONS[provider];
                      const providerLinks = activeLinks.filter((link) => link.provider === provider);
                      const enabled = hasCapability(definition.capabilityKey);
                      const selected = provider === selectedProvider;
                      return (
                        <button
                          key={provider}
                          type="button"
                          onClick={() => setSelectedProvider(provider)}
                          className={`app-card-button${selected ? ' app-card-button--selected' : ''}`}
                        >
                          <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                            <strong className="app-card-button__title">{definition.label}</strong>
                            <DataBadge tone={!enabled ? 'warning' : providerLinks.length > 0 ? 'success' : 'accent'}>
                              {!enabled ? 'Disabled' : providerLinks.length > 0 ? `${providerLinks.length} linked` : 'Ready'}
                            </DataBadge>
                          </div>
                          <span className="app-card-button__subtitle">
                            {definition.helpText}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Links"
                  title="Active channel links"
                  subtitle={`${activeLinks.length} active links currently connected to this workspace.`}
                >
                  {activeLinks.length === 0 ? (
                    <EmptyPanel
                      title="No active links"
                      body="Generate a pairing code, paste it into Telegram, and your first linked account will appear here."
                    />
                  ) : (
                    <DataTable>
                      <DataTableHeader columns="minmax(0, 0.75fr) minmax(0, 1fr) minmax(0, 0.9fr) auto">
                        <DataTableHeaderCell>Provider</DataTableHeaderCell>
                        <DataTableHeaderCell>Linked subject</DataTableHeaderCell>
                        <DataTableHeaderCell>Linked</DataTableHeaderCell>
                        <DataTableHeaderCell align="end">Actions</DataTableHeaderCell>
                      </DataTableHeader>
                      {activeLinks.map((link) => (
                        <DataTableRow
                          key={link.link_id}
                          columns="minmax(0, 0.75fr) minmax(0, 1fr) minmax(0, 0.9fr) auto"
                        >
                          <DataTableCell primary={CHANNEL_PROVIDER_DEFINITIONS[link.provider as ChannelProvider]?.label ?? link.provider} />
                          <DataTableCell
                            primary={channelLinkDisplayLabel(link)}
                            secondary={link.scopes.join(', ') || 'default scopes'}
                          />
                          <DataTableCell primary={formatTimestamp(link.linked_at)} />
                          <DataTableCell
                            align="end"
                            primary={(
                              <div className="app-inline-actions app-inline-actions--end app-inline-actions--tight">
                                <AppButton
                                  type="button"
                                  tone="secondary"
                                  onClick={() => {
                                    setSelectedProvider('telegram');
                                  }}
                                >
                                  {link.provider === 'telegram' ? 'Inspect' : 'Telegram only'}
                                </AppButton>
                                <AppButton
                                  type="button"
                                  tone="danger"
                                  onClick={() => setPendingRevokeLink(link)}
                                  disabled={revokingLinkId === link.link_id}
                                >
                                  {revokingLinkId === link.link_id ? 'Revoking…' : 'Revoke'}
                                </AppButton>
                              </div>
                            )}
                          />
                        </DataTableRow>
                      ))}
                    </DataTable>
                  )}
                </ListDetailPanel>

                {revokedLinks.length > 0 ? (
                  <ListDetailPanel
                    eyebrow="History"
                    title="Revoked link history"
                    subtitle={`${revokedLinks.length} revoked links retained for workspace traceability.`}
                  >
                    <div className="app-stack-3">
                      {revokedLinks.map((link) => (
                        <div
                          key={link.link_id}
                          className="app-card-button"
                        >
                          <strong className="app-card-button__title">
                            {CHANNEL_PROVIDER_DEFINITIONS[link.provider as ChannelProvider]?.label ?? link.provider} · {channelLinkDisplayLabel(link)}
                          </strong>
                          <span className="app-card-button__subtitle">
                            Revoked {formatTimestamp(link.revoked_at)} · {link.revoked_reason ?? 'No reason recorded.'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ListDetailPanel>
                ) : null}
              </div>
            )}
            secondary={(
              <ListDetailPanel
                eyebrow="Selection"
                title={`${selectedDefinition.label} pairing`}
                subtitle="Current provider readiness, latest pairing code, and active workspace link status."
                actions={(
                  <div className="app-inline-actions">
                    {selectedIntent && isIntentActive(selectedIntent) ? (
                      <AppButton
                        type="button"
                        tone="secondary"
                        onClick={() => setCodeSheetProvider(selectedProvider)}
                      >
                        View code
                      </AppButton>
                    ) : null}
                    <AppButton
                      type="button"
                      disabled={!providerEnabled || actionProvider === selectedProvider || loading}
                      onClick={() => {
                        void createIntent(selectedProvider);
                      }}
                    >
                      {actionProvider === selectedProvider
                        ? 'Creating…'
                        : selectedProviderLinks.length > 0
                          ? 'Create re-link code'
                          : 'Create pairing code'}
                    </AppButton>
                  </div>
                )}
              >
                <StateBanner
                  tone={!providerEnabled ? 'warning' : selectedProviderLinks.length > 0 ? 'success' : 'neutral'}
                  title={!providerEnabled ? 'Provider disabled for this plan' : selectedProviderLinks.length > 0 ? 'Provider linked' : 'Provider ready to pair'}
                  detail={`${selectedProviderLinks.length} active links · command ${selectedDefinition.commandExample}`}
                >
                  {selectedDefinition.helpText}
                </StateBanner>

                <FormGrid>
                  <FormReadout label="Workspace" value={bootstrap.workspace.label} />
                  <FormReadout label="Shell profile" value={shellProfile.label} />
                  <FormReadout label="Command" value={selectedDefinition.commandExample} />
                  <FormReadout label="Plan enabled" value={providerEnabled ? 'Yes' : 'No'} />
                  <FormReadout label="Active links" value={String(selectedProviderLinks.length)} />
                  <FormReadout label="Latest code" value={selectedIntent && isIntentActive(selectedIntent) ? selectedIntent.pairing_code : 'No active code'} />
                </FormGrid>
                {featureId === 'integrations' ? (
                  <FormReadout label="Additional channels" value="More channel options are coming soon." />
                ) : null}

                {selectedProviderLinks.length === 0 ? (
                  <EmptyPanel
                    title={`No active ${selectedDefinition.label} links`}
                    body={`Generate a pairing code and link your first ${selectedDefinition.label} identity to this workspace.`}
                  />
                ) : (
                  <div className="app-stack-3">
                    {selectedProviderLinks.map((link) => (
                      <div
                        key={link.link_id}
                        className="app-card-button"
                      >
                        <strong className="app-card-button__title">{channelLinkDisplayLabel(link)}</strong>
                        <span className="app-card-button__subtitle">
                          Linked {formatTimestamp(link.linked_at)} · scopes {link.scopes.join(', ') || 'default'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ListDetailPanel>
            )}
          />
        )}
      </ListDetailShell>

      <CommandSheet
        open={Boolean(codeSheetProvider && intentByProvider[codeSheetProvider] && isIntentActive(intentByProvider[codeSheetProvider] ?? null))}
        title={codeSheetProvider ? `${CHANNEL_PROVIDER_DEFINITIONS[codeSheetProvider].label} pairing code` : 'Pairing code'}
        description="Copy the pairing code and follow the provider-specific command instructions in the linked channel."
        onClose={() => setCodeSheetProvider(null)}
        actions={<AppButton type="button" tone="secondary" onClick={() => setCodeSheetProvider(null)}>Done</AppButton>}
      >
        {codeSheetProvider && intentByProvider[codeSheetProvider] ? (
          <>
            <ModalSection title="Pairing code" description="Paste this exact code into the selected provider chat to complete the link.">
              <FormGrid columns="1fr">
                <FormReadout label="Code" value={intentByProvider[codeSheetProvider]?.pairing_code ?? 'n/a'} />
                <FormReadout label="Expires" value={formatTimestamp(intentByProvider[codeSheetProvider]?.expires_at ?? null)} />
                <FormReadout label="Command" value={CHANNEL_PROVIDER_DEFINITIONS[codeSheetProvider].commandExample} />
              </FormGrid>
            </ModalSection>
            <ModalSection title="Instructions" description="Follow these steps to complete the link in your selected channel.">
              <div className="app-meta-value app-meta-value--body">
                {intentByProvider[codeSheetProvider]?.instructions ?? CHANNEL_PROVIDER_DEFINITIONS[codeSheetProvider].helpText}
              </div>
            </ModalSection>
          </>
        ) : null}
      </CommandSheet>

      <ConfirmDialog
        open={Boolean(pendingRelinkProvider)}
        title="Create re-link code"
        body={pendingRelinkProvider ? `${CHANNEL_PROVIDER_DEFINITIONS[pendingRelinkProvider].label} already has an active link in this workspace. Create a re-link code anyway?` : 'Create a re-link code anyway?'}
        confirmLabel="Create re-link code"
        confirmTone="primary"
        busy={pendingRelinkProvider ? actionProvider === pendingRelinkProvider : false}
        onCancel={() => setPendingRelinkProvider(null)}
        onConfirm={() => {
          if (!pendingRelinkProvider) {
            return;
          }
          void createIntentRequest(pendingRelinkProvider, true);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingRevokeLink)}
        title="Revoke linked channel"
        body={pendingRevokeLink ? `Revoke ${CHANNEL_PROVIDER_DEFINITIONS[pendingRevokeLink.provider as ChannelProvider]?.label ?? pendingRevokeLink.provider} link ${channelLinkDisplayLabel(pendingRevokeLink)}?` : 'Revoke linked channel?'}
        confirmLabel="Revoke link"
        busy={pendingRevokeLink ? revokingLinkId === pendingRevokeLink.link_id : false}
        onCancel={() => setPendingRevokeLink(null)}
        onConfirm={() => {
          if (!pendingRevokeLink) {
            return;
          }
          void revokeLink(pendingRevokeLink);
        }}
      />
    </WorkstationSurfaceRoot>
  );
}
