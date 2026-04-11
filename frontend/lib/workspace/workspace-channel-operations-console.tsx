'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';

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
      last_delivery_error?: {
        event_id?: string | null;
        message?: string | null;
        last_attempted_at?: string | null;
        retry_count?: number | null;
      } | null;
    };
    workspace_summary: {
      pending_count: number;
      retry_count_total: number;
      max_retry_count: number;
      pending_by_channel: Record<string, number>;
      last_delivery_error?: {
        event_id?: string | null;
        message?: string | null;
        last_attempted_at?: string | null;
        retry_count?: number | null;
      } | null;
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

function statusTone(status: string | null | undefined): string {
  const token = String(status || '').trim().toLowerCase();
  if (token === 'live') {
    return '#166534';
  }
  if (token === 'disabled') {
    return '#6b7280';
  }
  if (token === 'setup_needed') {
    return '#92400e';
  }
  return '#991b1b';
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.2rem 0.55rem',
        borderRadius: '999px',
        background: '#f8fafc',
        border: `1px solid ${statusTone(status)}`,
        color: statusTone(status),
        fontSize: '0.82rem',
        fontWeight: 600,
      }}
    >
      {titleCase(status)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '1rem',
        padding: '1rem',
        background: '#ffffff',
        display: 'grid',
        gap: '0.35rem',
      }}
    >
      <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>{label}</span>
      <strong style={{ fontSize: '1.3rem', color: '#0f172a' }}>{value}</strong>
      <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>{hint}</span>
    </article>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '1.25rem',
        padding: '1.25rem',
        background: '#ffffff',
        display: 'grid',
        gap: '1rem',
      }}
    >
      <header style={{ display: 'grid', gap: '0.35rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>{title}</h2>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>{description}</p>
      </header>
      {children}
    </section>
  );
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
        setStatusMessage(`Refreshed operator state from backend truth at ${formatTimestamp(nextPayload.generated_at)}.`);
      }
    } catch (error) {
      const fallback =
        services.queryClient.peek<ChannelOperationsPayload>(cacheKey)
        ?? services.persistence.getJson<ChannelOperationsPayload>(cacheKey);
      if (fallback) {
        setPayload(fallback);
        setStatusMessage('Showing cached channel operations data because the backend is temporarily unreachable.');
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
      <main style={{ minHeight: '100vh', padding: '3rem', display: 'grid', gap: '0.75rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Channel Operations</h1>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
          This workspace membership does not have permission to inspect Telegram and WhatsApp operations.
        </p>
      </main>
    );
  }

  const telegram = payload?.channels.telegram;
  const whatsapp = payload?.channels.whatsapp;

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem',
        display: 'grid',
        gap: '1.25rem',
        background: '#f8fafc',
      }}
    >
      <header style={{ display: 'grid', gap: '0.6rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.7rem', color: '#0f172a' }}>Channel Operations Console</h1>
          <StatusBadge status={telegram?.workspace_status ?? 'setup_needed'} />
          <StatusBadge status={whatsapp?.workspace_status ?? 'setup_needed'} />
        </div>
        <p style={{ margin: 0, maxWidth: '70rem', color: '#475569', lineHeight: 1.6 }}>
          Workspace-scoped operator view for Telegram and WhatsApp. This surface reads connector health,
          webhook status, delivery backlog, recent channel events, and dead letters directly from backend runtime truth.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', color: '#64748b', fontSize: '0.88rem' }}>
          <span>Workspace: <strong style={{ color: '#0f172a' }}>{bootstrap.workspace.label}</strong></span>
          <span>Profile: <strong style={{ color: '#0f172a' }}>{shellProfile.label}</strong></span>
          <span>Plan: <strong style={{ color: '#0f172a' }}>{titleCase(bootstrap.entitlements.plan)}</strong></span>
          <span>Last refresh: <strong style={{ color: '#0f172a' }}>{formatTimestamp(payload?.generated_at)}</strong></span>
        </div>
        {statusMessage ? <p style={{ margin: 0, color: '#0369a1' }}>{statusMessage}</p> : null}
        {errorMessage ? <p style={{ margin: 0, color: '#b91c1c' }}>{errorMessage}</p> : null}
        {loading ? <p style={{ margin: 0, color: '#475569' }}>Loading channel operations state…</p> : null}
      </header>

      <div
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <MetricCard
          label="Telegram"
          value={titleCase(telegram?.workspace_status ?? 'setup_needed')}
          hint={telegram?.workspace_configured ? `${telegram.connectors.length} connector(s) in this workspace` : 'No Telegram connector configured for this workspace'}
        />
        <MetricCard
          label="WhatsApp"
          value={titleCase(whatsapp?.workspace_status ?? 'setup_needed')}
          hint={whatsapp?.workspace_configured ? `${whatsapp.connectors.length} connector(s) in this workspace` : 'No WhatsApp connector configured for this workspace'}
        />
        <MetricCard
          label="Pending Deliveries"
          value={String(payload?.delivery.workspace_summary.pending_count ?? 0)}
          hint={`Workspace queue · retries ${payload?.delivery.workspace_summary.retry_count_total ?? 0}`}
        />
        <MetricCard
          label="Recent Pairing Failures"
          value={String(payload?.events.pairing_failures.length ?? 0)}
          hint="Unpaired or failed pairing attempts seen in recent channel traffic"
        />
      </div>

      {[telegram, whatsapp].map((provider) => (
        <Section
          key={provider?.provider ?? 'unknown'}
          title={`${titleCase(provider?.provider)} Health`}
          description="Connector state, webhook contract, and runtime issues visible to workspace operators."
        >
          {!provider ? null : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <StatusBadge status={provider.workspace_status} />
                <span style={{ color: '#475569' }}>
                  Webhook: <strong style={{ color: '#0f172a' }}>{titleCase(String(provider.webhook.status || 'unknown'))}</strong>
                </span>
                <span style={{ color: '#475569' }}>
                  Configured: <strong style={{ color: '#0f172a' }}>{provider.workspace_configured ? 'Yes' : 'No'}</strong>
                </span>
              </div>
              <div style={{ display: 'grid', gap: '0.35rem', color: '#475569', fontSize: '0.92rem' }}>
                {'public_url_template' in provider.webhook && typeof provider.webhook.public_url_template === 'string' ? (
                  <div>Webhook template: <code>{provider.webhook.public_url_template}</code></div>
                ) : null}
                {'public_url' in provider.webhook && typeof provider.webhook.public_url === 'string' ? (
                  <div>Webhook URL: <code>{provider.webhook.public_url}</code></div>
                ) : null}
                {typeof provider.webhook.guidance === 'string' && provider.webhook.guidance ? (
                  <div>Guidance: {provider.webhook.guidance}</div>
                ) : null}
              </div>

              <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                <article style={{ border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1rem', display: 'grid', gap: '0.5rem' }}>
                  <strong style={{ color: '#0f172a' }}>Issues</strong>
                  {provider.issues.length === 0 ? (
                    <span style={{ color: '#166534' }}>No current issues recorded for this workspace.</span>
                  ) : provider.issues.map((issue) => (
                    <div key={`${issue.code}:${issue.connector_id ?? 'workspace'}`} style={{ display: 'grid', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <StatusBadge status={issue.severity ?? 'degraded'} />
                        <code>{issue.code || 'issue'}</code>
                      </div>
                      <span style={{ color: '#475569' }}>{issue.message || 'Issue detail unavailable.'}</span>
                    </div>
                  ))}
                </article>

                <article style={{ border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1rem', display: 'grid', gap: '0.5rem' }}>
                  <strong style={{ color: '#0f172a' }}>Connectors</strong>
                  {provider.connectors.length === 0 ? (
                    <span style={{ color: '#92400e' }}>No connectors are bound to this workspace yet.</span>
                  ) : provider.connectors.map((connector) => (
                    <div key={connector.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', display: 'grid', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        <strong style={{ color: '#0f172a' }}>{connector.label || connector.id}</strong>
                        <StatusBadge status={connector.profile_status ?? provider.workspace_status} />
                      </div>
                      {connector.last_run_id ? <span style={{ color: '#475569' }}>Last run: <code>{connector.last_run_id}</code></span> : null}
                      {connector.last_action ? <span style={{ color: '#475569' }}>Last action: <code>{connector.last_action}</code></span> : null}
                      {connector.last_processed_at ? <span style={{ color: '#475569' }}>Last processed: {formatTimestamp(connector.last_processed_at)}</span> : null}
                      {connector.last_error ? <span style={{ color: '#b91c1c' }}>Last error: {connector.last_error}</span> : null}
                      {connector.webhook_url ? <span style={{ color: '#475569' }}>Webhook: <code>{connector.webhook_url}</code></span> : null}
                    </div>
                  ))}
                </article>
              </div>
            </>
          )}
        </Section>
      ))}

      <Section
        title="Delivery Queue"
        description="Durable outbox backlog for this workspace plus runtime-wide queue pressure indicators."
      >
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <MetricCard
            label="Workspace Pending"
            value={String(payload?.delivery.workspace_summary.pending_count ?? 0)}
            hint={`By channel: ${Object.entries(payload?.delivery.workspace_summary.pending_by_channel ?? {}).map(([channel, count]) => `${channel} ${count}`).join(' · ') || 'none'}`}
          />
          <MetricCard
            label="Runtime Undelivered"
            value={String(payload?.delivery.runtime_summary.undelivered_count ?? 0)}
            hint={`Poisoned ${payload?.delivery.runtime_summary.poisoned_count ?? 0} · max retry ${payload?.delivery.runtime_summary.max_retry_count ?? 0}`}
          />
        </div>
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <strong style={{ color: '#0f172a' }}>Pending workspace deliveries</strong>
          {payload?.delivery.pending.length ? payload.delivery.pending.map((item) => (
            <div key={item.event_id} style={{ border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '0.85rem', display: 'grid', gap: '0.25rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <code>{item.event_id}</code>
                <StatusBadge status={String((item.payload || {}).channel || 'queued')} />
              </div>
              <span style={{ color: '#475569' }}>Retries: {item.retry_count} · Last attempt: {formatTimestamp(item.last_attempted_at)}</span>
              {item.last_delivery_error ? <span style={{ color: '#b91c1c' }}>{item.last_delivery_error}</span> : null}
            </div>
          )) : (
            <span style={{ color: '#166534' }}>No pending Telegram or WhatsApp final deliveries for this workspace.</span>
          )}
        </div>
      </Section>

      <Section
        title="Failures"
        description="Pairing failures from recent traffic and delivery dead letters that require operator attention."
      >
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <article style={{ border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1rem', display: 'grid', gap: '0.6rem' }}>
            <strong style={{ color: '#0f172a' }}>Pairing Failures</strong>
            {payload?.events.pairing_failures.length ? payload.events.pairing_failures.map((item) => (
              <div key={item.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', display: 'grid', gap: '0.2rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusBadge status={item.action ?? 'pairing_failed'} />
                  <code>{item.channel || 'channel'}</code>
                </div>
                <span style={{ color: '#475569' }}>{item.text || 'Pairing failure detail unavailable.'}</span>
                <span style={{ color: '#64748b' }}>{formatTimestamp(item.ts)}</span>
              </div>
            )) : (
              <span style={{ color: '#166534' }}>No recent pairing failures recorded.</span>
            )}
          </article>

          <article style={{ border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1rem', display: 'grid', gap: '0.6rem' }}>
            <strong style={{ color: '#0f172a' }}>Delivery Dead Letters</strong>
            {payload?.delivery.dead_letters.length ? payload.delivery.dead_letters.map((item) => (
              <div key={item.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', display: 'grid', gap: '0.2rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <code>{item.channel || 'channel'}</code>
                    <code>{item.reason || 'delivery_failed'}</code>
                </div>
                <span style={{ color: '#475569' }}>{item.text || 'Dead-letter detail unavailable.'}</span>
                <span style={{ color: '#64748b' }}>{formatTimestamp(item.ts)}</span>
              </div>
            )) : (
              <span style={{ color: '#166534' }}>No dead-lettered Telegram or WhatsApp events recorded for this workspace.</span>
            )}
          </article>
        </div>
      </Section>

      <Section
        title="Recent Channel Events"
        description="Latest inbound and outbound Telegram and WhatsApp activity for this workspace."
      >
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {payload?.events.recent.length ? payload.events.recent.map((item) => (
            <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '0.85rem', display: 'grid', gap: '0.25rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <code>{item.channel || 'channel'}</code>
                <code>{item.direction || 'unknown'}</code>
                <code>{item.action || item.event_type || 'event'}</code>
              </div>
              <span style={{ color: '#475569' }}>{item.text || 'Event text unavailable.'}</span>
              <span style={{ color: '#64748b' }}>
                {formatTimestamp(item.ts)}
                {item.run_id ? ` · run ${item.run_id}` : ''}
                {item.trace_id ? ` · trace ${item.trace_id}` : ''}
              </span>
            </div>
          )) : (
            <span style={{ color: '#475569' }}>No recent Telegram or WhatsApp events recorded for this workspace.</span>
          )}
        </div>
      </Section>
    </main>
  );
}
