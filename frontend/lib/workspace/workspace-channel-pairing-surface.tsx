'use client';

import { useEffect, useMemo, useState } from 'react';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

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
    helpText: 'Open the Telegram bot chat, paste the pairing command, then send your next message there.',
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

function summarizeLinkStatus(links: ChannelLinkRecord[]): string {
  const activeCount = links.filter((link) => link.status === 'active').length;
  const revokedCount = links.filter((link) => link.status === 'revoked').length;
  return `${activeCount} active · ${revokedCount} revoked`;
}

export function WorkspaceChannelPairingSurface({
  featureId,
}: {
  featureId: ChannelPairingFeatureId;
}) {
  const { bootstrap, hasCapability, shellProfile, routeManifest } = useWorkspaceBoundary();
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
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionProvider, setActionProvider] = useState<ChannelProvider | null>(null);
  const [revokingLinkId, setRevokingLinkId] = useState<string | null>(null);

  const canPairChannels = hasCapability('channel_pairing_enabled');
  const activeLinks = useMemo(
    () => linksResponse.links.filter((link) => link.status === 'active'),
    [linksResponse.links],
  );
  const revokedLinks = useMemo(
    () => linksResponse.links.filter((link) => link.status === 'revoked'),
    [linksResponse.links],
  );

  const title = featureId === 'settings' ? 'Channel Pairing' : 'Workspace Integrations';
  const intro =
    featureId === 'settings'
      ? 'Create pairing codes, review active links, and revoke or relink channel identities from workspace-backed settings.'
      : 'Telegram and WhatsApp pairing is managed from backend truth here, under the same workspace boundary and capability model.';

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
      if (!options.silent) {
        setStatusMessage(`Refreshed channel link state from the backend. ${summarizeLinkStatus(payload.links)}`);
      }
      return payload;
    } catch (error) {
      const fallback = services.persistence.getJson<ChannelLinksResponse>(linksCacheKey);
      if (fallback) {
        setLinksResponse(fallback);
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

  useEffect(() => {
    services.persistence.setJson(intentsCacheKey, intentByProvider);
  }, [intentByProvider, intentsCacheKey, services]);

  const createIntent = async (provider: ChannelProvider) => {
    if (!canPairChannels) {
      setErrorMessage('Channel pairing is blocked for this workspace membership.');
      return;
    }
    if (!hasCapability(CHANNEL_PROVIDER_DEFINITIONS[provider].capabilityKey)) {
      setErrorMessage(`${CHANNEL_PROVIDER_DEFINITIONS[provider].label} is not enabled for this workspace plan.`);
      return;
    }

    const providerActiveLinks = activeLinks.filter((link) => link.provider === provider);
    let allowRelink = false;
    if (providerActiveLinks.length > 0) {
      allowRelink = window.confirm(
        `${CHANNEL_PROVIDER_DEFINITIONS[provider].label} already has an active link in this workspace. Create a re-link code anyway?`,
      );
      if (!allowRelink) {
        setStatusMessage(`Re-link cancelled for ${CHANNEL_PROVIDER_DEFINITIONS[provider].label}.`);
        return;
      }
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
      setStatusMessage(
        `${CHANNEL_PROVIDER_DEFINITIONS[provider].label} pairing code created. Expires ${formatTimestamp(payload.intent.expires_at)}.`,
      );
      await refreshLinks({ silent: true }).catch(() => undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create channel pairing code.');
    } finally {
      setActionProvider(null);
    }
  };

  const revokeLink = async (link: ChannelLinkRecord) => {
    const confirmed = window.confirm(
      `Revoke ${CHANNEL_PROVIDER_DEFINITIONS[link.provider as ChannelProvider]?.label ?? link.provider} link ${link.external_subject_hint ?? link.link_id}?`,
    );
    if (!confirmed) {
      return;
    }

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
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem 3rem',
        display: 'grid',
        gap: '1.5rem',
      }}
    >
      <header style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>{title}</h1>
        <p style={{ margin: 0, maxWidth: '58rem', lineHeight: 1.6 }}>{intro}</p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
          gap: '0.9rem',
        }}
      >
        <SummaryCard label="Workspace" value={bootstrap.workspace.label} />
        <SummaryCard label="Shell Profile" value={shellProfile.label} />
        <SummaryCard label="Pairing Capability" value={canPairChannels ? 'enabled' : 'blocked'} />
        <SummaryCard label="Link Status" value={summarizeLinkStatus(linksResponse.links)} />
      </section>

      {statusMessage ? <StatusBanner tone="info" message={statusMessage} /> : null}
      {errorMessage ? <StatusBanner tone="error" message={errorMessage} /> : null}

      {!canPairChannels ? (
        <section
          style={{
            display: 'grid',
            gap: '0.5rem',
            padding: '1rem',
            borderRadius: '1rem',
            border: '1px solid #fecaca',
            background: '#fef2f2',
          }}
        >
          <strong>Channel pairing is blocked for this workspace.</strong>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Pairing codes require a member-or-higher workspace role and an enabled Telegram or WhatsApp channel entitlement.
          </p>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Active shell default route remains <code>{routeManifest.defaultRoute}</code>.
          </p>
        </section>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))',
          gap: '1rem',
        }}
      >
        {(Object.keys(CHANNEL_PROVIDER_DEFINITIONS) as ChannelProvider[]).map((provider) => {
          const definition = CHANNEL_PROVIDER_DEFINITIONS[provider];
          const providerLinks = activeLinks.filter((link) => link.provider === provider);
          const latestIntent = intentByProvider[provider];
          const providerEnabled = hasCapability(definition.capabilityKey);

          return (
            <section
              key={provider}
              style={{
                display: 'grid',
                gap: '0.85rem',
                padding: '1rem',
                borderRadius: '1rem',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
              }}
            >
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <strong>{definition.label}</strong>
                <span style={{ color: '#475569', lineHeight: 1.5 }}>{definition.helpText}</span>
              </div>

              <div style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontSize: '0.92rem' }}>
                <span>Plan enabled: <strong>{providerEnabled ? 'yes' : 'no'}</strong></span>
                <span>Active links: <strong>{providerLinks.length}</strong></span>
                <span>Command: <code>{definition.commandExample}</code></span>
              </div>

              <button
                type="button"
                disabled={!providerEnabled || actionProvider === provider || loading}
                onClick={() => {
                  void createIntent(provider);
                }}
                style={buttonStyle({ muted: false, disabled: !providerEnabled || actionProvider === provider || loading })}
              >
                {actionProvider === provider
                  ? 'Creating pairing code...'
                  : providerLinks.length > 0
                    ? 'Create re-link code'
                    : 'Create pairing code'}
              </button>

              {latestIntent && isIntentActive(latestIntent) ? (
                <div
                  style={{
                    display: 'grid',
                    gap: '0.45rem',
                    padding: '0.85rem',
                    borderRadius: '0.85rem',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <strong>Latest pairing code</strong>
                  <code style={{ fontSize: '1rem' }}>{latestIntent.pairing_code}</code>
                  <span style={{ color: '#1e3a8a', lineHeight: 1.5 }}>{latestIntent.instructions}</span>
                  <span style={{ color: '#334155', fontSize: '0.9rem' }}>
                    Expires {formatTimestamp(latestIntent.expires_at)}
                    {latestIntent.allow_relink ? ' · relink enabled' : ''}
                  </span>
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {providerLinks.length > 0 ? (
                  providerLinks.map((link) => (
                    <div
                      key={link.link_id}
                      style={{
                        display: 'grid',
                        gap: '0.4rem',
                        padding: '0.85rem',
                        borderRadius: '0.85rem',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <span>
                        Linked subject: <strong>{link.external_subject_hint ?? link.link_id}</strong>
                      </span>
                      <span>Linked at: {formatTimestamp(link.linked_at)}</span>
                      <span>Scopes: {link.scopes.join(', ') || 'default'}</span>
                      <button
                        type="button"
                        disabled={revokingLinkId === link.link_id}
                        onClick={() => {
                          void revokeLink(link);
                        }}
                        style={buttonStyle({ muted: true, disabled: revokingLinkId === link.link_id })}
                      >
                        {revokingLinkId === link.link_id ? 'Revoking...' : 'Revoke link'}
                      </button>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: '0.85rem',
                      borderRadius: '0.85rem',
                      background: '#f8fafc',
                      border: '1px dashed #cbd5e1',
                      color: '#475569',
                    }}
                  >
                    No active {definition.label} links for this workspace yet.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </section>

      <section
        style={{
          display: 'grid',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: '1rem',
          border: '1px solid #cbd5e1',
          background: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <strong>Workspace-backed channel links</strong>
          <button
            type="button"
            onClick={() => {
              void refreshLinks();
            }}
            disabled={loading}
            style={buttonStyle({ muted: true, disabled: loading })}
          >
            {loading ? 'Refreshing...' : 'Refresh backend state'}
          </button>
        </div>

        <pre
          style={{
            margin: 0,
            padding: '1rem',
            borderRadius: '0.85rem',
            background: '#0f172a',
            color: '#e2e8f0',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(
            {
              workspaceId,
              shellProfileId: shellProfile.id,
              canPairChannels,
              routeManifestDefaultRoute: routeManifest.defaultRoute,
              activeLinks,
              revokedLinks,
              cachedIntentProviders: Object.keys(intentByProvider).filter((provider) =>
                isIntentActive(intentByProvider[provider as ChannelProvider]),
              ),
              serviceSnapshot: services.snapshot(),
            },
            null,
            2,
          )}
        </pre>
      </section>

      {revokedLinks.length > 0 ? (
        <section
          style={{
            display: 'grid',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: '1rem',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
          }}
        >
          <strong>Revoked link history</strong>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {revokedLinks.map((link) => (
              <div
                key={link.link_id}
                style={{
                  display: 'grid',
                  gap: '0.3rem',
                  padding: '0.8rem',
                  borderRadius: '0.85rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <span>
                  {CHANNEL_PROVIDER_DEFINITIONS[link.provider as ChannelProvider]?.label ?? link.provider} · {link.external_subject_hint ?? link.link_id}
                </span>
                <span>Revoked at: {formatTimestamp(link.revoked_at)}</span>
                <span>Reason: {link.revoked_reason ?? 'No reason recorded.'}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: '1rem',
        borderRadius: '1rem',
        border: '1px solid #cbd5e1',
        background: '#ffffff',
        display: 'grid',
        gap: '0.35rem',
      }}
    >
      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBanner({
  message,
  tone,
}: {
  message: string;
  tone: 'info' | 'error';
}) {
  const background = tone === 'error' ? '#fef2f2' : '#eff6ff';
  const border = tone === 'error' ? '#fecaca' : '#bfdbfe';
  const color = tone === 'error' ? '#991b1b' : '#1d4ed8';

  return (
    <section
      style={{
        padding: '0.95rem 1rem',
        borderRadius: '1rem',
        border: `1px solid ${border}`,
        background,
        color,
      }}
    >
      {message}
    </section>
  );
}

function buttonStyle({
  muted,
  disabled,
}: {
  muted: boolean;
  disabled: boolean;
}): React.CSSProperties {
  return {
    border: '1px solid #94a3b8',
    borderRadius: '999px',
    background: disabled ? '#e2e8f0' : muted ? '#f8fafc' : '#0f172a',
    color: disabled ? '#64748b' : muted ? '#0f172a' : '#f8fafc',
    padding: '0.55rem 0.95rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
  };
}
