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
import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
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
  if (token === 'setup_needed' || token === 'degraded') {
    return 'warning';
  }
  if (token === 'disabled') {
    return 'neutral';
  }
  return 'danger';
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

  if (!hasCapability('workspace_admin_enabled')) {
    return (
      <div data-workstation-surface="admin/channel-operations">
        <ListDetailShell
          title="Channel operations"
          subtitle="Workspace-scoped Telegram and WhatsApp delivery health."
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

  const providers = [
    payload?.channels.telegram,
    payload?.channels.whatsapp,
  ].filter((provider): provider is ChannelOperationsProviderRecord => Boolean(provider));

  return (
    <div data-workstation-surface="admin/channel-operations">
      <ListDetailShell
        title="Channel operations"
        subtitle="Operator view for Telegram and WhatsApp runtime health, delivery backlog, and recent event flow."
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
                eyebrow="Providers"
                title="Provider health"
                subtitle="Connector readiness and webhook health for each supported provider."
              >
                {providers.length === 0 ? (
                  <EmptyPanel
                    title="No provider state"
                    body="Channel operations payload is empty for this workspace."
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
                eyebrow="Connectors"
                title="Active bindings"
                subtitle="Connector health and last runtime activity bound to this workspace."
              >
                {providers.every((provider) => provider.connectors.length === 0) ? (
                  <EmptyPanel
                    title="No connector bindings"
                    body="No Telegram or WhatsApp connectors are attached to this workspace yet."
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
                eyebrow="Events"
                title="Recent channel events"
                subtitle="Latest workspace-scoped inbound and outbound activity."
              >
                {!payload?.events.recent.length ? (
                  <EmptyPanel
                    title="No recent events"
                    body="No recent Telegram or WhatsApp events are recorded for this workspace."
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
                eyebrow="Queue"
                title="Delivery summary"
                subtitle="Durable queue pressure and workspace-specific delivery load."
              >
                <FormGrid columns="repeat(2, minmax(0, 1fr))">
                  <FormReadout label="Workspace pending" value={String(payload?.delivery.workspace_summary.pending_count ?? 0)} />
                  <FormReadout label="Workspace retries" value={String(payload?.delivery.workspace_summary.retry_count_total ?? 0)} />
                  <FormReadout label="Runtime undelivered" value={String(payload?.delivery.runtime_summary.undelivered_count ?? 0)} />
                  <FormReadout label="Poisoned" value={String(payload?.delivery.runtime_summary.poisoned_count ?? 0)} />
                </FormGrid>
              </ListDetailPanel>

              <ListDetailPanel
                eyebrow="Issues"
                title="Provider issues"
                subtitle="Current connector or provider-level issues visible to workspace operators."
              >
                {providers.every((provider) => provider.issues.length === 0) ? (
                  <EmptyPanel
                    title="No current issues"
                    body="No Telegram or WhatsApp issues are currently recorded for this workspace."
                  />
                ) : (
                  <div className="app-stack-3">
                    {providers.flatMap((provider) =>
                      provider.issues.map((issue) => (
                        <StateBanner
                          key={`${provider.provider}:${issue.code ?? issue.message ?? 'issue'}`}
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
                eyebrow="Failures"
                title="Pairing failures and dead letters"
                subtitle="Recent failures that still need operator attention."
              >
                {!(payload?.events.pairing_failures.length || payload?.delivery.dead_letters.length) ? (
                  <EmptyPanel
                    title="No recent failures"
                    body="Pairing failures and dead-letter events will surface here when intervention is required."
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
