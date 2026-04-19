'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { joinClassNames } from '@/lib/ui/primitives';
import { WorkstationSageConnectorsPane } from '@/lib/workspace/workstation-sage-connectors-pane';
import { WorkstationSageProvidersPane } from '@/lib/workspace/workstation-sage-providers-pane';
import { WorkstationSageToolsPane } from '@/lib/workspace/workstation-sage-tools-pane';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import type {
  ProviderCatalogRecord,
  ProviderProfileRecord,
  VaultCredentialRecord,
} from '@/lib/workspace/workstation-client';

type SageSettingsTabId = 'providers' | 'tools' | 'connectors';

const SAGE_SETTINGS_TABS: Array<{
  id: SageSettingsTabId;
  label: string;
}> = [
  { id: 'providers', label: 'Providers' },
  { id: 'tools', label: 'Tools' },
  { id: 'connectors', label: 'Connectors' },
];

const SAGE_PROVIDER_IDS = new Set([
  'openai',
  'anthropic',
  'gemini',
  'mistral',
  'deepseek',
  'qwen',
  'ollama',
]);

const SAGE_CONNECTOR_CARD_DEFINITIONS = [
  { id: 'gmail', connectorIds: ['google_workspace'] },
  { id: 'google_calendar', connectorIds: ['google_workspace'] },
  { id: 'slack', connectorIds: ['slack'] },
  { id: 'github', connectorIds: ['github'] },
  { id: 'notion', connectorIds: ['notion'] },
  { id: 'microsoft_365', connectorIds: ['microsoft_365'] },
  { id: 'whatsapp', provider: 'whatsapp' as const },
  { id: 'telegram', provider: 'telegram' as const },
];

type SageSettingsCounts = {
  providersConnected: number;
  toolsEnabled: number;
  connectorsActive: number;
};

function isSageSettingsTabId(value: string | null): value is SageSettingsTabId {
  return value === 'providers' || value === 'tools' || value === 'connectors';
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeProviderCatalog(payload: unknown): ProviderCatalogRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.providers)
    ? record.providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeProviderProfiles(payload: unknown): ProviderProfileRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is ProviderProfileRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeVaultCredentials(payload: unknown): VaultCredentialRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is VaultCredentialRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeToolsEnabledCount(payload: unknown): number {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const tools = Array.isArray(record.tools) ? record.tools : [];
  return tools.reduce((count, item) => {
    if (!item || typeof item !== 'object') {
      return count;
    }
    const candidate = item as Record<string, unknown>;
    return candidate.enabled === false ? count : count + 1;
  }, 0);
}

function normalizeChannelLinks(payload: unknown): Array<Record<string, unknown>> {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.links)
    ? record.links.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function sortProfiles(profiles: ProviderProfileRecord[]): ProviderProfileRecord[] {
  return [...profiles].sort((left, right) => {
    const leftPriority = Number(left.priority ?? 100);
    const rightPriority = Number(right.priority ?? 100);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return readString(left.id).localeCompare(readString(right.id));
  });
}

function sortCredentials(credentials: VaultCredentialRecord[]): VaultCredentialRecord[] {
  return [...credentials].sort((left, right) =>
    readString(right.updated_at ?? right.created_at).localeCompare(readString(left.updated_at ?? left.created_at)));
}

function isSecretlessConnection(providerId: string, profile: ProviderProfileRecord | null): boolean {
  const authMode = readString(profile?.auth_mode).toLowerCase();
  if (authMode === 'local_cli' || authMode === 'none') {
    return true;
  }
  if (providerId === 'ollama' && readString(profile?.health).toLowerCase() !== 'disabled') {
    return true;
  }
  return false;
}

export function WorkstationSageSettingsPane() {
  const searchParams = useSearchParams();
  const { bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const [selectedTab, setSelectedTab] = useState<SageSettingsTabId>(() => {
    const requestedTab = searchParams.get('tab');
    return isSageSettingsTabId(requestedTab) ? requestedTab : 'providers';
  });
  const [counts, setCounts] = useState<SageSettingsCounts | null>(null);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (isSageSettingsTabId(requestedTab) && requestedTab !== selectedTab) {
      setSelectedTab(requestedTab);
    }
  }, [searchParams, selectedTab]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      services.client.listProviderCatalog(),
      services.client.listProviderProfiles(),
      services.client.listVaultCredentials(),
      services.client.getSageToolPolicy(),
      services.client.listConnectorsVault(),
      fetch(`/api/channel-pairing/links?workspace_id=${encodeURIComponent(bootstrap.workspace.id)}&include_revoked=true`, {
        credentials: 'same-origin',
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          return {};
        }
        return payload;
      }),
    ]).then(([catalogPayload, profilesPayload, credentialsPayload, toolsPayload, connectorsPayload, channelLinksPayload]) => {
      if (cancelled) {
        return;
      }
      const providers = normalizeProviderCatalog(catalogPayload).filter((provider) =>
        SAGE_PROVIDER_IDS.has(readString(provider.id).toLowerCase()));
      const profiles = normalizeProviderProfiles(profilesPayload);
      const credentials = normalizeVaultCredentials(credentialsPayload);
      const connectedProviders = providers.reduce((count, provider) => {
        const providerId = readString(provider.id).toLowerCase();
        const profile = sortProfiles(profiles.filter((item) => readString(item.provider).toLowerCase() === providerId))[0] ?? null;
        const credential = sortCredentials(credentials.filter((item) => readString(item.provider).toLowerCase() === providerId))[0] ?? null;
        return credential || isSecretlessConnection(providerId, profile) ? count + 1 : count;
      }, 0);

      const connectorVault = normalizeVaultCredentials(connectorsPayload);
      const connectedConnectorIds = new Set(
        connectorVault.map((item) => readString(item.connector).toLowerCase()).filter(Boolean),
      );
      const activeChannelProviders = new Set(
        normalizeChannelLinks(channelLinksPayload)
          .filter((item) => readString(item.status, 'active').toLowerCase() === 'active')
          .map((item) => readString(item.provider).toLowerCase())
          .filter(Boolean),
      );
      const activeConnectors = SAGE_CONNECTOR_CARD_DEFINITIONS.reduce((count, definition) => {
        const connected = definition.provider
          ? activeChannelProviders.has(definition.provider)
          : (definition.connectorIds ?? []).some((connectorId) => connectedConnectorIds.has(connectorId));
        return connected ? count + 1 : count;
      }, 0);

      setCounts({
        providersConnected: connectedProviders,
        toolsEnabled: normalizeToolsEnabledCount(toolsPayload),
        connectorsActive: activeConnectors,
      });
    }).catch(() => {
      if (!cancelled) {
        setCounts(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bootstrap.workspace.id, services.client]);

  const summaryLabel = useMemo(() => {
    if (!counts) {
      return null;
    }
    return `${counts.providersConnected} provider${counts.providersConnected === 1 ? '' : 's'} connected · ${counts.toolsEnabled} tool${counts.toolsEnabled === 1 ? '' : 's'} enabled · ${counts.connectorsActive} connector${counts.connectorsActive === 1 ? '' : 's'} active`;
  }, [counts]);

  return (
    <div className="sage-settings-shell">
      {summaryLabel ? (
        <div className="sage-settings-summary">{summaryLabel}</div>
      ) : null}
      <div className="sage-settings-tabs" role="tablist" aria-label="Sage settings">
        {SAGE_SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedTab === tab.id}
            className={joinClassNames(
              'sage-settings-tabs__item',
              selectedTab === tab.id && 'sage-settings-tabs__item--active',
            )}
            onClick={() => setSelectedTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {selectedTab === 'providers' ? <WorkstationSageProvidersPane /> : null}
      {selectedTab === 'tools' ? <WorkstationSageToolsPane /> : null}
      {selectedTab === 'connectors' ? <WorkstationSageConnectorsPane /> : null}
    </div>
  );
}
