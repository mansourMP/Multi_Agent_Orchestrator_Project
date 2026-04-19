'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  FileText,
  Globe,
  type LucideIcon,
  Mail,
  Search,
  TerminalSquare,
} from 'lucide-react';

import { AppNotice, joinClassNames } from '@/lib/ui/primitives';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import type { VaultCredentialRecord } from '@/lib/workspace/workstation-client';

type SageToolDefinition = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  requiresConnector?: string[];
  requirementLabel?: string;
};

type SageToolSnapshot = {
  key: string;
  enabled: boolean;
};

const SAGE_TOOL_DEFINITIONS: SageToolDefinition[] = [
  {
    key: 'web_search',
    label: 'Web Search',
    description: 'Sage can look things up online',
    icon: Search,
  },
  {
    key: 'http_request',
    label: 'HTTP Requests',
    description: 'Sage can call external APIs',
    icon: Globe,
  },
  {
    key: 'gmail',
    label: 'Gmail',
    description: 'Sage can read and send email',
    icon: Mail,
    requiresConnector: ['google_workspace'],
    requirementLabel: 'Requires Gmail connection',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    description: 'Sage can create and read events',
    icon: CalendarDays,
    requiresConnector: ['google_workspace', 'microsoft_365'],
    requirementLabel: 'Requires Calendar connection',
  },
  {
    key: 'file_access',
    label: 'File Access',
    description: 'Sage can read files you share',
    icon: FileText,
  },
  {
    key: 'code_execution',
    label: 'Code Execution',
    description: 'Sage can run code',
    icon: TerminalSquare,
  },
];

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeSageToolPolicy(payload: unknown): SageToolSnapshot[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const tools = Array.isArray(record.tools) ? record.tools : [];
  return tools.flatMap((item) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const key = readString(candidate.key);
    if (!key) {
      return [];
    }
    return [{
      key,
      enabled: candidate.enabled !== false,
    }];
  });
}

function normalizeConnectorVault(payload: unknown): VaultCredentialRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is VaultCredentialRecord => Boolean(item) && typeof item === 'object')
    : [];
}

export function WorkstationSageToolsPane({
  onBlockedRequirementAction,
}: {
  onBlockedRequirementAction?: (toolKey: string) => void;
} = {}) {
  const services = useWorkspaceServices();
  const [tools, setTools] = useState<SageToolSnapshot[]>([]);
  const [connectors, setConnectors] = useState<VaultCredentialRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingToolKey, setSavingToolKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function loadState(): Promise<void> {
    const [toolPayload, connectorPayload] = await Promise.all([
      services.client.getSageToolPolicy(),
      services.client.listConnectorsVault(),
    ]);
    setTools(normalizeSageToolPolicy(toolPayload));
    setConnectors(normalizeConnectorVault(connectorPayload));
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void loadState()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Sage tools are unavailable right now.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const enabledToolKeys = useMemo(
    () => new Set(tools.filter((item) => item.enabled).map((item) => item.key)),
    [tools],
  );
  const connectedConnectorIds = useMemo(
    () => new Set(connectors.map((item) => readString(item.connector).toLowerCase()).filter(Boolean)),
    [connectors],
  );

  async function handleToggle(definition: SageToolDefinition): Promise<void> {
    const nextEnabled = !enabledToolKeys.has(definition.key);
    setSavingToolKey(definition.key);
    setError(null);
    setStatus(null);
    try {
      const payload = await services.client.updateSageToolPolicy({
        tool: definition.key,
        enabled: nextEnabled,
      });
      setTools(normalizeSageToolPolicy(payload));
      setStatus(`${definition.label} is now ${nextEnabled ? 'enabled' : 'disabled'} for Sage.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Tool policy update failed.');
    } finally {
      setSavingToolKey(null);
    }
  }

  return (
    <div className="sage-settings-panel">
      {status ? <AppNotice tone="success">{status}</AppNotice> : null}
      {error ? <AppNotice tone="warning">{error}</AppNotice> : null}

      <div className="sage-tool-list" role="list">
        {SAGE_TOOL_DEFINITIONS.map((definition) => {
          const Icon = definition.icon;
          const enabled = enabledToolKeys.has(definition.key);
          const disabledByRequirement = Boolean(definition.requiresConnector?.length)
            && !(definition.requiresConnector ?? []).some((connectorId) => connectedConnectorIds.has(connectorId));
          const showBlockedAction = enabled && disabledByRequirement;
          return (
            <article key={definition.key} className="sage-tool-row" role="listitem">
              <div className="sage-tool-row__identity">
                <span className="sage-tool-row__icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <div className="sage-tool-row__copy">
                  <strong className="sage-tool-row__title">{definition.label}</strong>
                  <p className="sage-tool-row__description">{definition.description}</p>
                </div>
              </div>
              <div className="sage-tool-row__actions">
                <button
                  type="button"
                  className={joinClassNames(
                    'sage-tool-toggle',
                    enabled && 'sage-tool-toggle--enabled',
                  )}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${definition.label}`}
                  disabled={(disabledByRequirement && !enabled) || savingToolKey === definition.key || isLoading}
                  onClick={() => {
                    void handleToggle(definition);
                  }}
                >
                  <span className="sage-tool-toggle__thumb" />
                </button>
              </div>
              {showBlockedAction ? (
                <div className="sage-tool-row__blocked">
                  <span>{definition.requirementLabel}</span>
                  <button
                    type="button"
                    className="sage-tool-row__blocked-link"
                    onClick={() => {
                      onBlockedRequirementAction?.(definition.key);
                    }}
                  >
                    Connect →
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {isLoading ? (
          <div className="sage-settings-empty">
            Loading Sage tool controls…
          </div>
        ) : null}
      </div>
    </div>
  );
}
