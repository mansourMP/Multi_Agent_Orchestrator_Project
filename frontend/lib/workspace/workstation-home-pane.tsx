'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { ChatInlineStateCard } from '@/lib/workspace/chat-inline-state-card';
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

function preferredRuntimeLabel(runtimeTargets: Array<Record<string, unknown>> | Array<{ label: string; preferred: boolean }>): string {
  const preferred = runtimeTargets.find((target) => Boolean(target.preferred)) ?? runtimeTargets[0] ?? null;
  return preferred ? readString((preferred as Record<string, unknown>).label, 'Cloud runtime') : 'Cloud runtime';
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
          <ListDetailPanel eyebrow="Sage" title="Loading briefing" subtitle="Hydrating the next action and carry-forward context.">
            <SkeletonBlock height="2.6rem" />
            <SkeletonBlock height="2.6rem" />
            <SkeletonBlock height="2.6rem" />
          </ListDetailPanel>
          <ListDetailPanel eyebrow="Signals" title="Loading latest signal">
            <SkeletonBlock height="4.4rem" />
          </ListDetailPanel>
        </div>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Context" title="Loading workspace posture">
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
  const latestActivity = state.activity[0] ?? null;
  const primaryRuntime = preferredRuntimeLabel(bootstrap.runtime.runtimeTargets);
  const operatingMode = readString(bootstrap.workspaceTraits.operatingMode, 'standard');
  const complianceMode = readString(bootstrap.workspaceTraits.complianceMode, 'standard');
  const serviceState = latestRun
    ? readString(latestRun.result_summary ?? latestRun.status, 'Execution state is attached to chat.')
    : 'Structured outputs will appear once Sage completes work from chat.';
  const latestSignal = latestNotification ?? latestActivity;

  return (
    <WorkstationSurfaceRoot surface="workstation-home">
      <ListDetailShell
        title="Sage briefing"
        subtitle="Home is the briefing layer only. Chat is the working surface where Sage keeps the live thread."
        actions={(
          <div className="app-inline-actions">
            <AppButton
              type="button"
              onClick={() => {
                router.push(`/w/${encodeURIComponent(bootstrap.workspace.id)}/sage`);
              }}
            >
              Open Sage
            </AppButton>
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                void refresh(false);
              }}
            >
              Refresh
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
                  eyebrow="Sage"
                  title="Continue in chat"
                  subtitle="Scan the next action here, then move into Chat where Sage keeps the live thread, memory, and execution."
                >
                  <div className="app-stack-3">
                    <ChatInlineStateCard
                      tone={latestApproval ? 'warning' : 'neutral'}
                      eyebrow="Next action"
                      title={latestApproval ? 'Approval is waiting' : 'No approval is blocking Sage'}
                      meta={latestApproval ? readString(latestApproval.status, 'pending') : `${state.approvals.length} pending`}
                      actions={latestApproval ? <Link href={`/w/${encodeURIComponent(bootstrap.workspace.id)}/approvals`} className="app-inline-link">Open approvals</Link> : null}
                    >
                      {latestApproval
                        ? readString(latestApproval.prompt, 'An approval decision is waiting before Sage can continue.')
                        : 'Sage can continue without an operator decision right now.'}
                    </ChatInlineStateCard>
                    <ChatInlineStateCard
                      tone={latestRun ? statusTone(latestRun.status) : 'neutral'}
                      eyebrow="Execution"
                      title={latestRun ? readString(latestRun.run_id, 'Latest run') : 'No active execution yet'}
                      meta={latestRun ? formatTimestamp(latestRun.created_at) : 'Idle'}
                      actions={latestRun ? <Link href={`/w/${encodeURIComponent(bootstrap.workspace.id)}/runs`} className="app-inline-link">Open runs</Link> : null}
                    >
                      {latestRun
                        ? readString(latestRun.result_summary, `${readString(latestRun.status, 'unknown')} execution state.`)
                        : 'The first chat turn that starts execution will surface here and stay attached to Sage.'}
                    </ChatInlineStateCard>
                    <ChatInlineStateCard
                      tone="neutral"
                      eyebrow="Memory"
                      title="What Sage will carry into chat"
                      meta={primaryRuntime}
                    >
                      Sage keeps the workspace posture, runtime target, approvals, and outputs attached to the live chat thread instead of splitting them into a second home workflow.
                    </ChatInlineStateCard>
                    <ChatInlineStateCard
                      tone={latestRun ? 'success' : 'neutral'}
                      eyebrow="Services"
                      title={latestRun ? 'Structured work is active' : 'No structured work yet'}
                      meta={bootstrap.entitlements.plan}
                    >
                      {serviceState}
                    </ChatInlineStateCard>
                  </div>
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Signals"
                  title="Latest signal"
                  subtitle="Only the newest notification or activity stays here. The rest belongs in Chat and Work."
                >
                  {!latestSignal ? (
                    <EmptyPanel
                      title="Nothing new yet"
                      body="The next notification or activity created by Sage will appear here as a lightweight briefing signal."
                    />
                  ) : (
                    <div className="app-stack-3">
                      <div className="app-card-button">
                        <strong className="app-card-button__title">
                          {readString(latestSignal.title ?? latestSignal.event_type ?? latestSignal.action, 'Signal')}
                        </strong>
                        <span className="app-card-button__subtitle">
                          {readString(latestSignal.summary ?? latestSignal.text, 'No signal summary is available.')}
                        </span>
                        <span className="app-card-button__meta">
                          {formatTimestamp(latestSignal.created_at)}
                        </span>
                      </div>
                    </div>
                  )}
                </ListDetailPanel>
              </div>
            )}
            secondary={(
              <div className="app-stack-4">
                <ListDetailPanel
                  eyebrow="Context"
                  title="Workspace posture"
                  subtitle={`${bootstrap.workspace.label} · ${bootstrap.workspace.kind} workspace`}
                >
                  <div className="app-stack-3">
                    <ContextField label="Primary surface" value="Chat" />
                    <ContextField label="Runtime target" value={primaryRuntime} />
                    <ContextField label="Plan" value={bootstrap.entitlements.plan} />
                    <ContextField label="Operating mode" value={operatingMode} />
                    <ContextField label="Compliance mode" value={complianceMode} />
                    <ContextField label="Runtime mode" value={bootstrap.runtime.deploymentMode} />
                  </div>
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Focus"
                  title="Stay in one working surface"
                  subtitle="Home should only point you back to Chat, not create a second operating console."
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
                  {!latestApproval && latestRun ? (
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
                  {!latestApproval && !latestRun && !latestNotification ? (
                    <EmptyPanel
                      title="Sage is clear to start"
                      body="Open Chat to begin the next turn. Home does not maintain a second workflow anymore."
                    />
                  ) : null}
                </ListDetailPanel>
              </div>
            )}
          />
        )}
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
