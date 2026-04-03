'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, LoaderCircle, PauseCircle, PlayCircle, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  CONNECTOR_CATALOG,
  DEFAULT_CONNECTOR_LABELS,
  type ConnectorCatalogEntry,
  type ConnectorId,
  isConnectorId,
} from '../page.catalog';
import AiAccountsPanel from '@/components/orion/connections/AiAccountsPanel';
import { ConnectorLogoMark } from '@/components/orion/connections/ConnectionMarks';
import ConnectorSetupDialog from '@/components/orion/connections/ConnectorSetupDialog';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

const WORKSPACE_ID = 'default';
const CONNECTOR_STATUS_TIMEOUT_MS = 3500;

type ConnectorRow = {
  id: string;
  label: string;
  connector: ConnectorId;
  workspace_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type TestResult = {
  ok?: boolean;
  status?: number;
  message?: string;
  warning?: string | null;
};

function formatDate(value?: string | null): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function connectorLabel(value: ConnectorId): string {
  return DEFAULT_CONNECTOR_LABELS[value] || value;
}

function resolveCatalogConnectorId(item: Pick<ConnectorCatalogEntry, 'id' | 'connector'>): ConnectorId | null {
  if (item.connector) return item.connector;
  if (isConnectorId(item.id)) return item.id;
  if (item.id === 'discord') return 'discord_bot';
  return null;
}

function rowIdentity(row: ConnectorRow): string {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const value = String(
    (metadata as Record<string, unknown>).team_name
      || (metadata as Record<string, unknown>).team_id
      || (metadata as Record<string, unknown>).display_name
      || (metadata as Record<string, unknown>).account_id
      || (metadata as Record<string, unknown>).region
      || (metadata as Record<string, unknown>).access_key_hint
      || (metadata as Record<string, unknown>).workspace_name
      || (metadata as Record<string, unknown>).workspace_id
      || (metadata as Record<string, unknown>).organization_name
      || (metadata as Record<string, unknown>).organization_id
      || (metadata as Record<string, unknown>).username
      || (metadata as Record<string, unknown>).emailAddress
      || (metadata as Record<string, unknown>).email
      || (metadata as Record<string, unknown>).userPrincipalName
      || (metadata as Record<string, unknown>).host
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
    return 'Couldn’t reach the local runtime. Start Empyralist services to load integration status.';
  }
  return normalized;
}

function CredentialsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [rowBusy, setRowBusy] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [expandedItemId, setExpandedItemId] = useState('');
  const [dialogConnector, setDialogConnector] = useState<ConnectorId | null>(null);
  const [dialogLabel, setDialogLabel] = useState('');

  const onboardingMode = searchParams.get('onboarding') === '1';
  const requestedConnector = String(searchParams.get('connector') || '').trim();
  const returnTo = String(searchParams.get('return_to') || '/setup').trim() || '/setup';

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
      const timeoutId = window.setTimeout(() => controller.abort(), CONNECTOR_STATUS_TIMEOUT_MS);
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
      const normalized = items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item): ConnectorRow | null => {
          const connector = String(item.connector || '') as ConnectorId;
          if (!connector) return null;
          return {
            id: String(item.id || ''),
            label: String(item.label || connectorLabel(connector)),
            connector,
            workspace_id: item.workspace_id ? String(item.workspace_id) : null,
            metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {},
            created_at: item.created_at ? String(item.created_at) : undefined,
            updated_at: item.updated_at ? String(item.updated_at) : undefined,
          };
        })
        .filter((item: ConnectorRow | null): item is ConnectorRow => Boolean(item?.id));
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

  useEffect(() => {
    if (!requestedConnector || !isConnectorId(requestedConnector)) return;
    setDialogConnector(requestedConnector);
    setDialogLabel(DEFAULT_CONNECTOR_LABELS[requestedConnector] || requestedConnector);
  }, [requestedConnector]);

  const connectorItems = useMemo(() => {
    return CONNECTOR_CATALOG.flatMap((section) => section.items).filter((item) => Boolean(resolveCatalogConnectorId(item)));
  }, []);

  const connectorState = useMemo(() => {
    const byConnector = new Map<ConnectorId, ConnectorRow[]>();
    for (const row of connectors) {
      const items = byConnector.get(row.connector) || [];
      items.push(row);
      byConnector.set(row.connector, items);
    }
    const resolved = new Map<ConnectorId, ConnectorRow>();
    for (const [connector, rows] of byConnector.entries()) {
      const preferred = rows.find((row) => !rowPaused(row)) || rows[0];
      if (preferred) resolved.set(connector, preferred);
    }
    return resolved;
  }, [connectors]);

  const setBusy = useCallback((id: string, action: string | null) => {
    setRowBusy((current) => {
      const next = { ...current };
      if (!action) delete next[id];
      else next[id] = action;
      return next;
    });
  }, []);

  const patchConnector = useCallback(async (id: string, payload: { label?: string; metadata?: Record<string, unknown> }) => {
    const res = await controlPlaneFetch(`/api/control-plane/connectors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ workspace_id: WORKSPACE_ID, ...payload }),
    });
    const raw = await res.text().catch(() => '');
    const body = raw ? JSON.parse(raw) : {};
    if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to update connector.'));
  }, [controlPlaneFetch]);

  const handleTest = useCallback(async (row: ConnectorRow) => {
    setBusy(row.id, 'test');
    setPageError('');
    setNotice('');
    try {
      const res = await controlPlaneFetch(`/api/control-plane/connectors/${encodeURIComponent(row.id)}/test?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
        method: 'POST',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Integration test failed.'));
      setTestResults((current) => ({
        ...current,
        [row.id]: {
          ok: Boolean(body?.ok),
          status: typeof body?.status === 'number' ? body.status : undefined,
          message: typeof body?.message === 'string' ? body.message : 'Validation complete.',
          warning: typeof body?.warning === 'string' ? body.warning : null,
        },
      }));
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [row.id]: {
          ok: false,
          message: error instanceof Error ? error.message : 'Integration test failed.',
        },
      }));
    } finally {
      setBusy(row.id, null);
    }
  }, [controlPlaneFetch, setBusy]);

  const handleTogglePaused = useCallback(async (row: ConnectorRow) => {
    setBusy(row.id, 'pause');
    setPageError('');
    setNotice('');
    try {
      await patchConnector(row.id, {
        metadata: { paused: !rowPaused(row) },
      });
      await loadConnectors();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to update connector state.');
    } finally {
      setBusy(row.id, null);
    }
  }, [loadConnectors, patchConnector, setBusy]);

  const handleRemove = useCallback(async (row: ConnectorRow) => {
    setBusy(row.id, 'remove');
    setPageError('');
    setNotice('');
    try {
      const res = await controlPlaneFetch(`/api/control-plane/connectors/${encodeURIComponent(row.id)}?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
        method: 'DELETE',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to remove connector.'));
      setTestResults((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setExpandedItemId('');
      await loadConnectors();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to remove connector.');
    } finally {
      setBusy(row.id, null);
    }
  }, [controlPlaneFetch, loadConnectors, setBusy]);

  const handleOpenDialog = useCallback((connector: ConnectorId, label: string) => {
    setDialogConnector(connector);
    setDialogLabel(label);
    setNotice('');
    setPageError('');
  }, []);

  const handleDialogSaved = useCallback(async () => {
    await loadConnectors();
    setNotice('Connector saved.');
    if (onboardingMode) {
      router.push(returnTo);
    }
  }, [loadConnectors, onboardingMode, returnTo, router]);

  return (
    <div className="orion-page-shell is-integrations-page orion-animate-in">
      <section className="orion-integrations-header">
        <div className="orion-integrations-header-copy">
          <h1 className="orion-integrations-title">Integrations</h1>
          <p className="orion-integrations-subtitle">Connect your tools and AI providers</p>
        </div>
        <div className="orion-integrations-header-actions">
          {onboardingMode ? (
            <Link href={returnTo} className="orion-btn orion-btn-ghost">
              <ChevronLeft size={14} />
              Return to setup
            </Link>
          ) : null}
          <button type="button" className="orion-btn orion-btn-secondary" onClick={() => void loadConnectors()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </section>

      <section className="orion-integrations-section">
        <div className="orion-integrations-section-label">AI Providers</div>
        <div className="orion-integrations-panel">
          <AiAccountsPanel workspaceId={WORKSPACE_ID} />
        </div>
      </section>

      <section className="orion-integrations-section">
        <div className="orion-integrations-section-label">Connectors</div>
        {pageError ? <div className="orion-integrations-feedback is-error">{pageError}</div> : null}
        {notice ? <div className="orion-integrations-feedback is-success">{notice}</div> : null}
        <div className="orion-integrations-panel">
          {loading ? (
            <div className="orion-integrations-list">
              <div className="orion-integration-row is-last">
                <div className="orion-integration-row-main">
                  <LoaderCircle size={16} className="orion-spin" />
                  <div className="orion-integration-row-copy">
                    <div className="orion-integration-row-name">Loading connectors…</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="orion-integrations-list">
              {connectorItems.map((item, index) => {
                const connectorId = resolveCatalogConnectorId(item);
                if (!connectorId) return null;
                const connectedRow = connectorState.get(connectorId) || null;
                const connected = Boolean(connectedRow);
                const expanded = expandedItemId === item.id && Boolean(connectedRow);
                const test = connectedRow ? testResults[connectedRow.id] : undefined;
                const busyAction = connectedRow ? rowBusy[connectedRow.id] || '' : '';

                return (
                  <div key={item.id}>
                    <div className={`orion-integration-row${index === connectorItems.length - 1 && !expanded ? ' is-last' : ''}`}>
                      <div className="orion-integration-row-main">
                        <ConnectorLogoMark id={connectorId} size={20} />
                        <div className="orion-integration-row-copy">
                          <div className="orion-integration-row-name">{item.label}</div>
                          <div className="orion-integration-row-description" title={item.note}>
                            {item.note}
                          </div>
                        </div>
                      </div>
                      <div className="orion-integration-row-actions">
                        <span className={`orion-integration-status ${connected ? 'is-connected' : 'is-idle'}`}>
                          <span className="orion-integration-status-dot" />
                          <span className="orion-integration-status-text">{connected ? 'Connected' : 'Not connected'}</span>
                        </span>
                        <button
                          type="button"
                          className="orion-btn orion-btn-secondary orion-integration-action"
                          onClick={() => {
                            if (connectedRow) {
                              setExpandedItemId((current) => (current === item.id ? '' : item.id));
                              return;
                            }
                            handleOpenDialog(connectorId, item.label);
                          }}
                        >
                          {connected ? 'Configure' : 'Connect'}
                        </button>
                      </div>
                    </div>

                    {expanded && connectedRow ? (
                      <div className={`orion-connector-inline-panel${index === connectorItems.length - 1 ? ' is-last' : ''}`}>
                        <div className="orion-connector-inline-copy">
                          <div className="orion-connector-inline-title">{connectedRow.label}</div>
                          <div className="orion-connector-inline-meta">
                            {rowIdentity(connectedRow)} • Added {formatDate(connectedRow.created_at)} • {rowPaused(connectedRow) ? 'Paused' : 'Active'}
                          </div>
                          {test?.message ? (
                            <div className={`orion-connector-inline-note${test.ok === false ? ' is-error' : ''}`}>
                              {test.message}
                              {test.warning ? ` • ${test.warning}` : ''}
                            </div>
                          ) : null}
                        </div>
                        <div className="orion-connector-inline-actions">
                          <button
                            type="button"
                            className="orion-btn orion-btn-secondary orion-integration-action"
                            onClick={() => void handleTest(connectedRow)}
                            disabled={Boolean(busyAction)}
                          >
                            <ShieldCheck size={14} />
                            {busyAction === 'test' ? 'Testing…' : 'Test'}
                          </button>
                          <button
                            type="button"
                            className="orion-btn orion-btn-secondary orion-integration-action"
                            onClick={() => void handleTogglePaused(connectedRow)}
                            disabled={Boolean(busyAction)}
                          >
                            {rowPaused(connectedRow) ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                            {rowPaused(connectedRow) ? 'Resume' : 'Pause'}
                          </button>
                          <button
                            type="button"
                            className="orion-btn orion-btn-danger orion-integration-action"
                            onClick={() => void handleRemove(connectedRow)}
                            disabled={Boolean(busyAction)}
                          >
                            <Trash2 size={14} />
                            {busyAction === 'remove' ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ConnectorSetupDialog
        open={Boolean(dialogConnector)}
        connector={dialogConnector}
        displayLabel={dialogLabel}
        workspaceId={WORKSPACE_ID}
        onboardingMode={onboardingMode}
        returnTo={returnTo}
        onClose={() => setDialogConnector(null)}
        onSaved={handleDialogSaved}
      />
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
