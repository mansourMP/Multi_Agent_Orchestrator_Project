'use client';

import { useRouter } from 'next/navigation';

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
} from './utils';

export function AgentIntegrationsSections({
  providerCatalog,
  connectorCards,
  runtimeAttachments,
  hasGatewayOnlineTarget,
  hasCloudComputerAvailableTarget,
  workspaceId,
}: {
  providerCatalog: ProviderCatalogSnapshot[];
  connectorCards: AgentIntegrationConnectorCard[];
  runtimeAttachments: RuntimeAttachmentSnapshot[];
  hasGatewayOnlineTarget: boolean;
  hasCloudComputerAvailableTarget: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
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
  return (
    <div className="studio-agent-integrations">
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
