'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { DataBadge, DataTable, DataTableCell, DataTableHeader, DataTableHeaderCell, DataTableRow } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type SummaryState = {
  isLoading: boolean;
  error: string | null;
  runs: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  activity: Record<string, unknown>[];
};

function readItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'No timestamp recorded';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function collectSectionError(result: PromiseSettledResult<unknown>, fallback: string): string | null {
  if (result.status === 'fulfilled') {
    return null;
  }
  return result.reason instanceof Error ? result.reason.message : fallback;
}

function statusTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'running' || status === 'queued' || status === 'queued_local') {
    return 'accent';
  }
  if (status === 'waiting_for_input' || status === 'pending' || status === 'requested') {
    return 'warning';
  }
  if (status === 'completed' || status === 'approved' || status === 'read') {
    return 'success';
  }
  if (status === 'failed' || status === 'rejected' || status === 'unread') {
    return 'danger';
  }
  return 'neutral';
}

function ContextField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="app-form-readout">
      <span className="app-form-readout__label">{label}</span>
      <span className="app-form-readout__value">{value}</span>
    </div>
  );
}

function LoadingOverview() {
  return (
    <ListDetailColumns
      primary={(
        <div className="app-stack-4">
          <ListDetailPanel eyebrow="Overview" title="Loading workspace queues" subtitle="Hydrating canonical overview panels.">
            <SkeletonBlock height="2.6rem" />
            <SkeletonBlock height="2.6rem" />
            <SkeletonBlock height="2.6rem" />
          </ListDetailPanel>
          <ListDetailPanel eyebrow="Signals" title="Loading notification flow">
            <SkeletonBlock height="4.4rem" />
            <SkeletonBlock height="4.4rem" />
          </ListDetailPanel>
        </div>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Context" title="Loading workspace context">
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkstationHomePane() {
  const { bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const router = useRouter();
  const [state, setState] = useState<SummaryState>({
    isLoading: true,
    error: null,
    runs: [],
    approvals: [],
    notifications: [],
    activity: [],
  });

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setState((current) => ({ ...current, isLoading: true, error: null }));
    }
    const results = await Promise.allSettled([
      services.client.listRuns({ limit: 6 }),
      services.client.listApprovals({ limit: 6 }),
      services.client.listNotifications({ limit: 6 }),
      services.client.listActivityTimeline({ limit: 6 }),
    ]);

    const errors = [
      collectSectionError(results[0], 'Recent runs are unavailable.'),
      collectSectionError(results[1], 'Approvals are unavailable.'),
      collectSectionError(results[2], 'Notifications are unavailable.'),
      collectSectionError(results[3], 'Activity is unavailable.'),
    ].filter((value): value is string => Boolean(value));

    setState((current) => ({
      isLoading: false,
      error: errors.length > 0 ? errors.join(' ') : null,
      runs: results[0].status === 'fulfilled' ? readItems(results[0].value) : current.runs,
      approvals: results[1].status === 'fulfilled' ? readItems(results[1].value) : current.approvals,
      notifications: results[2].status === 'fulfilled' ? readItems(results[2].value) : current.notifications,
      activity: results[3].status === 'fulfilled' ? readItems(results[3].value) : current.activity,
    }));
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((error) => {
      if (!cancelled) {
        setState((current) => ({
          ...current,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Workstation overview is unavailable.',
        }));
      }
    });
    const unsubscribe = subscribeWorkstationApprovalResolved(() => {
      void refresh(false).catch((error) => {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Workstation overview is unavailable.',
          }));
        }
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [services.client]);

  useEffect(() => {
    if (streamState.activity.version === 0 && streamState.notifications.version === 0) {
      return;
    }
    void refresh(false).catch((error) => {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Workstation overview is unavailable.',
      }));
    });
  }, [services.client, streamState.activity.version, streamState.notifications.version]);

  const latestRun = state.runs[0] ?? null;
  const latestApproval = state.approvals[0] ?? null;
  const latestNotification = state.notifications[0] ?? null;

  return (
    <WorkstationSurfaceRoot surface="workstation-home">
      <ListDetailShell
        title="Workspace overview"
        subtitle="Queue health, operator attention, and canonical workspace signals in one dense operational view."
        actions={(
          <div className="app-inline-actions">
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                void refresh(false);
              }}
            >
              Refresh
            </AppButton>
            <AppButton
              type="button"
              onClick={() => {
                router.push(`/w/${encodeURIComponent(bootstrap.workspace.id)}/chat`);
              }}
            >
              Open chat
            </AppButton>
          </div>
        )}
      >
        {state.error ? (
          <StateBanner
            tone="danger"
            title="Overview is degraded"
            detail="One or more canonical sections did not load cleanly. The last good data remains visible below."
          >
            {state.error}
          </StateBanner>
        ) : null}

        {state.isLoading ? (
          <LoadingOverview />
        ) : (
          <ListDetailColumns
            primary={(
              <div className="app-stack-4">
                <ListDetailPanel
                  eyebrow="Attention"
                  title="Approval queue"
                  subtitle="Operator decisions that will unblock execution."
                  actions={<Link href={`/w/${encodeURIComponent(bootstrap.workspace.id)}/approvals`} className="app-inline-link">Open queue</Link>}
                >
                  {state.approvals.length === 0 ? (
                    <EmptyPanel
                      title="No pending approvals"
                      body="New approval requests will appear here as soon as a run pauses for operator input."
                    />
                  ) : (
                    <DataTable>
                      <DataTableHeader columns="minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 0.8fr)">
                        <DataTableHeaderCell>Request</DataTableHeaderCell>
                        <DataTableHeaderCell>Status</DataTableHeaderCell>
                        <DataTableHeaderCell>Run</DataTableHeaderCell>
                      </DataTableHeader>
                      {state.approvals.map((item, index) => (
                        <DataTableRow
                          key={readString(item.approval_id ?? item.id, `approval-${index}`)}
                          columns="minmax(0, 1.2fr) minmax(0, 0.6fr) minmax(0, 0.8fr)"
                        >
                          <DataTableCell
                            primary={readString(item.prompt, 'Approval request')}
                            secondary={readString(item.approval_id ?? item.id, 'No identifier recorded')}
                          />
                          <DataTableCell primary={<DataBadge tone={statusTone(item.status)}>{readString(item.status, 'pending')}</DataBadge>} />
                          <DataTableCell primary={readString(item.run_id, 'Awaiting run linkage')} mono />
                        </DataTableRow>
                      ))}
                    </DataTable>
                  )}
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Execution"
                  title="Recent runs"
                  subtitle="Canonical execution history for the current workspace."
                  actions={<Link href={`/w/${encodeURIComponent(bootstrap.workspace.id)}/runs`} className="app-inline-link">Open runs</Link>}
                >
                  {state.runs.length === 0 ? (
                    <EmptyPanel
                      title="No runs recorded"
                      body="The first successful turn will populate recent execution history here."
                    />
                  ) : (
                    <DataTable>
                      <DataTableHeader columns="minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 0.8fr)">
                        <DataTableHeaderCell>Run</DataTableHeaderCell>
                        <DataTableHeaderCell>Status</DataTableHeaderCell>
                        <DataTableHeaderCell>Created</DataTableHeaderCell>
                      </DataTableHeader>
                      {state.runs.map((item, index) => (
                        <DataTableRow
                          key={readString(item.run_id, `run-${index}`)}
                          columns="minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 0.8fr)"
                        >
                          <DataTableCell
                            primary={readString(item.run_id, 'Run')}
                            secondary={readString(item.result_summary, 'Canonical execution record')}
                            mono
                          />
                          <DataTableCell primary={<DataBadge tone={statusTone(item.status)}>{readString(item.status, 'unknown')}</DataBadge>} />
                          <DataTableCell primary={formatTimestamp(item.created_at)} />
                        </DataTableRow>
                      ))}
                    </DataTable>
                  )}
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Signals"
                  title="Notifications"
                  subtitle="Incoming workspace alerts and operator-facing system messages."
                  actions={<Link href={`/w/${encodeURIComponent(bootstrap.workspace.id)}/notifications`} className="app-inline-link">Open feed</Link>}
                >
                  {state.notifications.length === 0 ? (
                    <EmptyPanel
                      title="No notifications"
                      body="Workspace notifications will surface here when operators or system events need attention."
                    />
                  ) : (
                    <div className="app-stack-3">
                      {state.notifications.map((item, index) => (
                        <div
                          key={readString(item.id, `notification-${index}`)}
                          className="app-card-button"
                        >
                          <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                            <strong className="app-card-button__title">
                              {readString(item.title ?? item.event_type, 'Notification')}
                            </strong>
                            <DataBadge tone={item.read_at ? 'neutral' : 'accent'}>
                              {item.read_at ? 'Read' : 'Unread'}
                            </DataBadge>
                          </div>
                          <span className="app-card-button__subtitle">
                            {readString(item.summary ?? item.text, 'No notification summary is available.')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ListDetailPanel>
              </div>
            )}
            secondary={(
              <div className="app-stack-4">
                <ListDetailPanel
                  eyebrow="Context"
                  title={bootstrap.workspace.label}
                  subtitle={`${bootstrap.workspace.kind} workspace · ${bootstrap.entitlements.plan} plan`}
                >
                  <div className="app-stack-3">
                    <ContextField label="Shell profile" value={bootstrap.shellHints.preferredProfile} />
                    <ContextField label="Default route" value={bootstrap.shellHints.defaultRoute} />
                    <ContextField label="Runtime mode" value={bootstrap.runtime.deploymentMode} />
                    <ContextField label="Unread notifications" value={String(streamState.notifications.unreadCount)} />
                    <ContextField label="Activity entries" value={String(streamState.activity.totalCount)} />
                    <ContextField label="Notification stream" value={streamState.notifications.connectionState} />
                    <ContextField label="Activity stream" value={streamState.activity.connectionState} />
                  </div>
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Now"
                  title="Current operator picture"
                  subtitle="Highest-signal items across execution, approvals, and system traffic."
                >
                  {latestApproval ? (
                    <StateBanner
                      tone="warning"
                      title={readString(latestApproval.prompt, 'Approval is waiting')}
                      detail={readString(latestApproval.approval_id ?? latestApproval.id, 'No approval identifier recorded')}
                    >
                      The next approval in queue is still waiting on an operator decision.
                    </StateBanner>
                  ) : null}
                  {latestRun ? (
                    <StateBanner
                      tone={statusTone(latestRun.status) === 'accent' ? 'neutral' : statusTone(latestRun.status) as 'neutral' | 'success' | 'warning' | 'danger'}
                      title={readString(latestRun.run_id, 'Latest run')}
                      detail={formatTimestamp(latestRun.created_at)}
                    >
                      {readString(latestRun.status, 'unknown')}
                    </StateBanner>
                  ) : null}
                  {latestNotification ? (
                    <StateBanner
                      tone={latestNotification.read_at ? 'neutral' : 'warning'}
                      title={readString(latestNotification.title ?? latestNotification.event_type, 'Latest notification')}
                      detail={readString(latestNotification.channel, 'workspace')}
                    >
                      {readString(latestNotification.summary ?? latestNotification.text, 'No notification summary is available.')}
                    </StateBanner>
                  ) : null}
                  {state.activity.length === 0 ? (
                    <EmptyPanel
                      title="No recent activity"
                      body="Live activity will fill this panel once the workspace starts generating events."
                    />
                  ) : (
                    <div className="app-stack-3">
                      {state.activity.slice(0, 4).map((item, index) => (
                        <div
                          key={readString(item.id, `activity-${index}`)}
                          className="app-card-button"
                        >
                          <strong className="app-card-button__title">
                            {readString(item.title ?? item.action, 'Activity')}
                          </strong>
                          <span className="app-card-button__subtitle">
                            {readString(item.summary, 'No activity summary is available.')}
                          </span>
                          <span className="app-card-button__meta">
                            {formatTimestamp(item.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ListDetailPanel>
              </div>
            )}
          />
        )}
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
