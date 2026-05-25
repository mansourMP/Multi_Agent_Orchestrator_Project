'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  AgentChannelBindingRecord,
  ChannelAccountRecord,
  ChannelCatalogItemRecord,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import type {
  AgentIntegrationConnectorCard,
  ProviderCatalogSnapshot,
  RuntimeAttachmentSnapshot,
} from './types';
import {
  AGENT_STUDIO_OBJECT_LABELS,
  STUDIO_RUNTIME_OPTIONS,
} from './constants';
import {
  providerIsReadyForStudio,
  readString,
} from './utils';

const STUDIO_CHANNEL_SURFACE_LANE = 'studio_business_connector';
const PERSONAL_CHANNEL_SURFACE_LANE = 'personal_gateway';

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

function channelAccountMatches(item: ChannelCatalogItemRecord, account: ChannelAccountRecord): boolean {
  const provider = readString(account.provider).toLowerCase();
  const accepted = new Set(
    [
      readString(item.account_provider),
      readString(item.connector_id),
      readString(item.provider),
      readString(item.channel_key) === 'whatsapp_business' ? 'twilio_whatsapp' : '',
      readString(item.channel_key) === 'microsoft_365' ? 'outlook' : '',
    ]
      .map((token) => token.toLowerCase())
      .filter(Boolean),
  );
  return Boolean(provider && accepted.has(provider));
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { status?: unknown }).status === 404);
}

export function AgentIntegrationsSections({
  providerCatalog,
  connectorCards,
  runtimeAttachments,
  hasGatewayOnlineTarget,
  hasCloudComputerAvailableTarget,
  workspaceId,
  selectedAgentId,
}: {
  providerCatalog: ProviderCatalogSnapshot[];
  connectorCards: AgentIntegrationConnectorCard[];
  runtimeAttachments: RuntimeAttachmentSnapshot[];
  hasGatewayOnlineTarget: boolean;
  hasCloudComputerAvailableTarget: boolean;
  workspaceId: string;
  selectedAgentId: string | null;
}) {
  const router = useRouter();
  const services = useWorkspaceServices();
  const [channelCatalog, setChannelCatalog] = useState<ChannelCatalogItemRecord[]>([]);
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [channelBindings, setChannelBindings] = useState<AgentChannelBindingRecord[]>([]);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelActionKey, setChannelActionKey] = useState<string | null>(null);
  const [channelNotice, setChannelNotice] = useState<string | null>(null);
  const connectedProviderCount = providerCatalog.filter((provider) => providerIsReadyForStudio(provider)).length;
  const hasHealthySelfHostedNode = runtimeAttachments.some((node) => Boolean(node.runtimeProfileId) && node.healthy && node.ownerApproved);
  const runtimeRows = STUDIO_RUNTIME_OPTIONS.map((option) => {
    if (option.value === 'managed_cloud') {
      return { option, ready: true, status: 'Default' };
    }
    if (option.value === 'hosted_hardware_pool') {
      return { option, ready: hasCloudComputerAvailableTarget, status: hasCloudComputerAvailableTarget ? 'Available' : 'Setup required' };
    }
    if (option.value === 'customer_local') {
      return { option, ready: hasGatewayOnlineTarget, status: hasGatewayOnlineTarget ? 'Computer online' : 'Setup required' };
    }
    return { option, ready: hasHealthySelfHostedNode, status: hasHealthySelfHostedNode ? 'Node healthy' : 'Setup required' };
  });
  const studioCatalog = useMemo(
    () => channelCatalog.filter((item) => {
      const surfaceSupport = readStringList(item.surface_support);
      const runtimeLane = readString(item.runtime_lane);
      return surfaceSupport.includes('studio') || runtimeLane === STUDIO_CHANNEL_SURFACE_LANE;
    }),
    [channelCatalog],
  );
  const businessChannelCatalog = useMemo(
    () => studioCatalog.filter((item) => readString(item.surface_kind, 'messaging_channel') === 'messaging_channel'),
    [studioCatalog],
  );
  const connectedAppCatalog = useMemo(
    () => studioCatalog.filter((item) => readString(item.surface_kind) === 'connected_app'),
    [studioCatalog],
  );
  const personalCatalog = useMemo(
    () => channelCatalog.filter((item) => readString(item.runtime_lane) === PERSONAL_CHANNEL_SURFACE_LANE),
    [channelCatalog],
  );
  const bindingByCatalogOrChannel = useMemo(() => {
    const out = new Map<string, AgentChannelBindingRecord>();
    channelBindings.forEach((binding) => {
      const catalogId = readString(binding.catalog_id);
      const channelKey = readString(binding.channel_key);
      if (catalogId) {
        out.set(catalogId, binding);
      }
      if (channelKey) {
        out.set(channelKey, binding);
      }
    });
    return out;
  }, [channelBindings]);

  async function loadChannelState() {
    if (!selectedAgentId) {
      setChannelBindings([]);
    }
    setChannelLoading(true);
    setChannelError(null);
    try {
      const [catalogPayload, accountsPayload] = await Promise.all([
        services.client.listStudioChannelCatalog(),
        services.client.listStudioChannelAccounts(),
      ]);
      let bindingsPayload: { items?: AgentChannelBindingRecord[] | null } = { items: [] };
      if (selectedAgentId) {
        try {
          bindingsPayload = await services.client.listAgentChannelBindings({ deployedAgentId: selectedAgentId });
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
        }
      }
      setChannelCatalog(Array.isArray(catalogPayload?.items) ? catalogPayload.items : []);
      setChannelAccounts(Array.isArray(accountsPayload?.items) ? accountsPayload.items : []);
      setChannelBindings(Array.isArray(bindingsPayload?.items) ? bindingsPayload.items : []);
    } catch (error) {
      setChannelError(error instanceof Error ? error.message : 'Unable to load channel setup.');
    } finally {
      setChannelLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      if (!active) {
        return;
      }
      await loadChannelState();
    }
    void load();
    return () => {
      active = false;
    };
  }, [selectedAgentId, services]);

  async function runChannelAction(
    actionKey: string,
    action: () => Promise<Record<string, unknown> | null>,
    notice: string,
  ) {
    setChannelActionKey(actionKey);
    setChannelError(null);
    setChannelNotice(null);
    try {
      await action();
      setChannelNotice(notice);
      await loadChannelState();
    } catch (error) {
      setChannelError(error instanceof Error ? error.message : 'Channel action failed.');
    } finally {
      setChannelActionKey(null);
    }
  }

  function renderCatalogSetupCard(item: ChannelCatalogItemRecord) {
    const channelKey = readString(item.channel_key);
    const bindingKey = readString(item.binding_channel_key, channelKey);
    const existing = bindingByCatalogOrChannel.get(channelKey) || bindingByCatalogOrChannel.get(bindingKey);
    const matchingAccount = channelAccounts.find((account) => channelAccountMatches(item, account)) ?? null;
    const needsAccount = Boolean(readString(item.account_provider) || readString(item.connector_id));
    const canBind = Boolean(selectedAgentId && !existing && (!needsAccount || matchingAccount) && readString(item.runtime_lane) !== PERSONAL_CHANNEL_SURFACE_LANE);
    const busyKey = `catalog:${channelKey}`;
    const busy = channelActionKey === busyKey;
    const surfaceKind = readString(item.surface_kind, 'messaging_channel');
    const surfaceLabel = surfaceKind === 'connected_app' ? 'connected app' : 'messaging channel';
    return (
      <article key={channelKey} className="studio-agent-integrations__provider-card">
        <div>
          <strong>{readString(item.label, channelKey)}</strong>
          <span>{surfaceLabel} · {readString(item.status, 'available').replace(/_/g, ' ')}</span>
          <span>{matchingAccount ? `Use ${readString(matchingAccount.label, 'saved account')}` : needsAccount ? 'Connect an account first' : 'No account required'}</span>
          <div className="sage-unified-expand__tag-row">
            {readStringList(item.capabilities).slice(0, 3).map((tag) => (
              <span key={tag} className="sage-unified-expand__tag">{tag.replace(/_/g, ' ')}</span>
            ))}
          </div>
          <div className="studio-agent-integrations__actions">
            <AppButton
              type="button"
              tone={canBind ? 'primary' : 'secondary'}
              disabled={!canBind || busy}
              onClick={() => runChannelAction(
                busyKey,
                () => services.client.createAgentChannelBinding({
                  deployedAgentId: selectedAgentId || '',
                  catalogId: channelKey,
                  accountRef: readString(matchingAccount?.account_ref) || null,
                }),
                surfaceKind === 'connected_app' ? 'Agent app binding created.' : 'Agent channel binding created.',
              )}
            >
              {existing ? 'Bound' : matchingAccount ? 'Use existing setup' : 'Setup required'}
            </AppButton>
          </div>
        </div>
        <span className={joinClassNames('studio-agent-integrations__status', existing && 'studio-agent-integrations__status--ready')}>
          {existing ? 'Bound' : readString(item.runtime_lane) === PERSONAL_CHANNEL_SURFACE_LANE ? 'Sage only' : readString(item.stage, 'planned')}
        </span>
      </article>
    );
  }

  return (
    <div className="studio-agent-integrations">
      <section className="studio-agent-integrations__section" aria-label="Agent channel bindings">
        <div className="studio-agent-integrations__head">
          <div>
            <span>Messaging</span>
            <strong>Per-agent message channels</strong>
            <p>Business channels are where customers talk to this agent. Saved accounts can be reused, but every agent gets its own route, status, and audit boundary.</p>
          </div>
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => router.push(`/w/${encodeURIComponent(workspaceId)}/channels`)}
          >
            Manage accounts
          </AppButton>
        </div>
        <div className="studio-agent-integrations__channel-summary">
          <span>{channelAccounts.length} reusable account{channelAccounts.length === 1 ? '' : 's'}</span>
          <span>{channelBindings.length} binding{channelBindings.length === 1 ? '' : 's'} on this agent</span>
          <span>{businessChannelCatalog.length} business channel{businessChannelCatalog.length === 1 ? '' : 's'}</span>
          <span>{connectedAppCatalog.length} connected app{connectedAppCatalog.length === 1 ? '' : 's'}</span>
          <span>{personalCatalog.length} personal channel{personalCatalog.length === 1 ? '' : 's'} kept in Sage</span>
        </div>
        {channelError ? (
          <div className="deployed-agents-overlay__empty">{channelError}</div>
        ) : null}
        {channelNotice ? (
          <div className="studio-agent-integrations__notice">{channelNotice}</div>
        ) : null}
        <div className="studio-agent-integrations__provider-grid">
          {channelLoading ? (
            <div className="deployed-agents-overlay__empty">Loading channel setup...</div>
          ) : channelBindings.length === 0 ? (
            <div className="deployed-agents-overlay__empty">No agent channel bindings yet. Use an existing account below to create a separate route for this agent.</div>
          ) : channelBindings.map((binding) => {
            const channelKey = readString(binding.channel_key);
            const enabled = binding.enabled !== false;
            const status = readString(binding.status, enabled ? 'enabled' : 'paused');
            const actionBusy = channelActionKey === `binding:${channelKey}`;
            return (
              <article key={channelKey} className="studio-agent-integrations__provider-card">
                <div>
                  <strong>{readString(binding.label, channelKey)}</strong>
                  <span>{readString(binding.account_label, 'No account label')} · {readString(binding.endpoint_key, 'No endpoint')}</span>
                  <span>{readString(binding.runtime_lane, STUDIO_CHANNEL_SURFACE_LANE)} · {binding.live_capable ? 'Live-capable adapter' : 'Foundation adapter'}</span>
                  <div className="studio-agent-integrations__actions">
                    <AppButton
                      type="button"
                      tone="secondary"
                      disabled={actionBusy}
                      onClick={() => runChannelAction(
                        `binding:${channelKey}`,
                        () => services.client.testAgentChannelBinding({ deployedAgentId: selectedAgentId || '', channelKey }),
                        'Dry-run channel test recorded.',
                      )}
                    >
                      Dry-run test
                    </AppButton>
                    <AppButton
                      type="button"
                      tone="secondary"
                      disabled={actionBusy}
                      onClick={() => runChannelAction(
                        `binding:${channelKey}`,
                        () => (enabled
                          ? services.client.pauseAgentChannelBinding({ deployedAgentId: selectedAgentId || '', channelKey })
                          : services.client.resumeAgentChannelBinding({ deployedAgentId: selectedAgentId || '', channelKey })),
                        enabled ? 'Channel binding paused.' : 'Channel binding resumed.',
                      )}
                    >
                      {enabled ? 'Pause' : 'Resume'}
                    </AppButton>
                    <AppButton
                      type="button"
                      tone="danger"
                      disabled={actionBusy}
                      onClick={() => runChannelAction(
                        `binding:${channelKey}`,
                        () => services.client.revokeAgentChannelBinding({ deployedAgentId: selectedAgentId || '', channelKey }),
                        'Channel binding revoked.',
                      )}
                    >
                      Revoke
                    </AppButton>
                  </div>
                </div>
                <span className={joinClassNames('studio-agent-integrations__status', enabled && status !== 'revoked' && 'studio-agent-integrations__status--ready')}>
                  {status}
                </span>
              </article>
            );
          })}
        </div>
        <div className="studio-agent-integrations__subhead">
          <strong>Business messaging channels</strong>
          <span>Official customer-safe channels for deployed Studio agents.</span>
        </div>
        <div className="studio-agent-integrations__provider-grid">
          {businessChannelCatalog.map(renderCatalogSetupCard)}
        </div>
        <div className="studio-agent-integrations__subhead">
          <strong>Connected apps and work systems</strong>
          <span>Apps the agent can read or act inside. These are not places where customers chat with the agent.</span>
        </div>
        <div className="studio-agent-integrations__provider-grid">
          {connectedAppCatalog.map(renderCatalogSetupCard)}
        </div>
        <div className="studio-agent-integrations__foot">
          Personal Telegram, WhatsApp, Signal, iMessage, and WeChat stay on Sage through Agent Computer. Studio uses official business/customer connectors only.
        </div>
      </section>

      <section className="studio-agent-integrations__section" aria-label="Model providers">
        <div className="studio-agent-integrations__head">
          <div>
            <span>Model providers</span>
            <strong>AI accounts this agent can use</strong>
            <p>Connect workspace API providers here. Personal subscription and local routes stay visible in Model, but require the matching workspace policy and runtime setup.</p>
          </div>
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => router.push(`/w/${encodeURIComponent(workspaceId)}/integrations`)}
          >
            Open provider setup
          </AppButton>
        </div>
        <div className="studio-agent-integrations__provider-grid">
          {providerCatalog.length === 0 ? (
            <div className="deployed-agents-overlay__empty">Connect a model provider before launch.</div>
          ) : providerCatalog.slice(0, 8).map((provider) => {
            const ready = providerIsReadyForStudio(provider);
            return (
              <article key={provider.id} className="studio-agent-integrations__provider-card">
                <div>
                  <strong>{provider.label}</strong>
                  <span>{provider.models.length} model{provider.models.length === 1 ? '' : 's'} available</span>
                </div>
                <span className={joinClassNames('studio-agent-integrations__status', ready && 'studio-agent-integrations__status--ready')}>
                  {ready ? 'Connected' : 'Setup required'}
                </span>
              </article>
            );
          })}
        </div>
        <div className="studio-agent-integrations__foot">
          {connectedProviderCount > 0 ? `${connectedProviderCount} provider${connectedProviderCount === 1 ? '' : 's'} connected for Business Agents.` : 'Connect a model provider before launch.'}
        </div>
      </section>

      <section className="studio-agent-integrations__section" aria-label="Runtime and deployment nodes">
        <div className="studio-agent-integrations__head">
          <div>
            <span>Runtime and deployment</span>
            <strong>Where Business Agents can run</strong>
            <p>Business Agents use Cloud worker by default. Agent Computer and customer-owned deployments require explicit setup.</p>
          </div>
        </div>
        <div className="studio-agent-integrations__provider-grid">
          {runtimeRows.map(({ option, ready, status }) => (
            <article key={option.value} className="studio-agent-integrations__provider-card">
              <div>
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </div>
              <span className={joinClassNames('studio-agent-integrations__status', ready && 'studio-agent-integrations__status--ready')}>
                {status}
              </span>
            </article>
          ))}
        </div>
        <div className="studio-agent-integrations__foot">
          Cloud worker is the production default. This Device, Cloud Computer, and Server/VPS are Agent Computer options.
        </div>
      </section>

      <section className="studio-agent-integrations__section" aria-label="Advanced agent platform">
        <div className="studio-agent-integrations__head">
          <div>
            <span>Advanced agent platform</span>
            <strong>External agents and groups</strong>
            <p>Native Studio Agents are available now. External runtimes and groups are reserved here so they stay governed, private, and approval-gated when they arrive.</p>
          </div>
        </div>
        <div className="studio-agent-integrations__provider-grid">
          <article className="studio-agent-integrations__provider-card studio-agent-integrations__provider-card--reserved">
            <div>
              <strong>Connect {AGENT_STUDIO_OBJECT_LABELS.external_agent_reserved}</strong>
              <span>Register an external runtime with identity, heartbeat, capability manifest, owner approval, logs, and revocation.</span>
            </div>
            <span className="studio-agent-integrations__status">Reserved</span>
          </article>
          <article className="studio-agent-integrations__provider-card studio-agent-integrations__provider-card--reserved">
            <div>
              <strong>{AGENT_STUDIO_OBJECT_LABELS.group_reserved}</strong>
              <span>Organize multiple agents later without adding group routing, schemas, or result aggregation in this pass.</span>
            </div>
            <span className="studio-agent-integrations__status">Coming later</span>
          </article>
        </div>
        <div className="studio-agent-integrations__foot">
          External agents start private, unverified, approval-gated, and revocable. Customer channels still live under channel setup.
        </div>
      </section>

      <section className="studio-agent-integrations__section" aria-label="Channels and systems">
        <div className="studio-agent-integrations__head">
          <div>
            <span>Channels and systems</span>
            <strong>Where the agent talks and what it can access</strong>
            <p>Use Actions for permissions. Use Integrations for accounts, channels, and external systems.</p>
          </div>
        </div>
        <div className="sage-unified-grid sage-unified-grid--4">
          {connectorCards.map((connector) => (
            <article key={connector.id} className="sage-unified-card deployed-agents-overlay__connector-card">
              <span className="sage-integration-brand" aria-hidden="true">
                <img src={connector.image} alt="" className="sage-integration-brand__image" />
              </span>
              <strong className="sage-unified-card__title">{connector.label}</strong>
              <span className={joinClassNames('sage-unified-card__status', connector.connected && 'sage-unified-card__status--connected')}>
                {connector.connected ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
                {connector.statusLabel}
              </span>
              <div className="sage-unified-expand__tag-row">
                {connector.capabilityTags.map((tag) => (
                  <span key={tag} className="sage-unified-expand__tag">{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
