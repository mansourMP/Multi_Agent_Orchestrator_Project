'use client';

import { useEffect, useMemo, useState } from 'react';

import { DataBadge } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import {
  resolveWorkstationApproval,
  subscribeWorkstationApprovalResolved,
} from '@/lib/workspace/workstation-approval-events';
import { WorkstationClientError } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationActionButton,
  WorkstationSurfaceCard,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type ApprovalRecord = Record<string, unknown> & {
  approval_id?: string | null;
  id?: string | null;
  run_id?: string | null;
  status?: string | null;
  prompt?: string | null;
};

function normalizeApprovalItems(payload: unknown): ApprovalRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is ApprovalRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function approvalTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'approved') {
    return 'success';
  }
  if (status === 'requested' || status === 'pending') {
    return 'warning';
  }
  if (status === 'rejected') {
    return 'danger';
  }
  return 'neutral';
}

function isPendingApproval(status: unknown): boolean {
  const normalized = String(status ?? '').trim().toLowerCase();
  return normalized === 'requested' || normalized === 'pending';
}

function sortApprovals(items: ApprovalRecord[]): ApprovalRecord[] {
  return [...items].sort((left, right) => {
    const leftPending = isPendingApproval(left.status);
    const rightPending = isPendingApproval(right.status);
    if (leftPending !== rightPending) {
      return rightPending ? 1 : -1;
    }
    const leftId = String(left.approval_id ?? left.id ?? '');
    const rightId = String(right.approval_id ?? right.id ?? '');
    return leftId.localeCompare(rightId);
  });
}

export function WorkstationApprovalsPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const [items, setItems] = useState<ApprovalRecord[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const payload = await services.client.listApprovals({ limit: 80 });
    setItems(sortApprovals(normalizeApprovalItems(payload)));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((loadError) => {
      if (cancelled) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Approvals are unavailable right now.');
      setIsLoading(false);
    });

    const unsubscribe = subscribeWorkstationApprovalResolved((event) => {
      if (cancelled) {
        return;
      }
      setStatusMessage(event.message);
      setItems((previous) =>
        previous.filter((item) => String(item.approval_id ?? item.id ?? '').trim() !== event.approvalId),
      );
      void refresh(false).catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Approvals are unavailable right now.');
        setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [services.client]);

  useEffect(() => {
    if (streamState.activity.version === 0) {
      return;
    }
    void refresh(false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Approvals are unavailable right now.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedApprovalId(null);
      return;
    }
    if (selectedApprovalId && items.some((item) => String(item.approval_id ?? item.id ?? '').trim() === selectedApprovalId)) {
      return;
    }
    setSelectedApprovalId(String(items[0].approval_id ?? items[0].id ?? '').trim() || null);
  }, [items, selectedApprovalId]);

  const selectedApproval = useMemo(
    () => items.find((item) => String(item.approval_id ?? item.id ?? '').trim() === selectedApprovalId) ?? null,
    [items, selectedApprovalId],
  );

  const pendingCount = useMemo(
    () => items.filter((item) => isPendingApproval(item.status)).length,
    [items],
  );

  async function handleResolve(item: ApprovalRecord, resolution: 'approved' | 'rejected') {
    const approvalId = String(item.approval_id ?? item.id ?? '').trim();
    if (!approvalId || resolvingApprovalId) {
      return;
    }
    setResolvingApprovalId(approvalId);
    setError(null);
    try {
      await resolveWorkstationApproval(services.client, { approvalId, resolution });
      setItems((previous) =>
        previous.filter((entry) => String(entry.approval_id ?? entry.id ?? '').trim() !== approvalId),
      );
      services.streams.touchActivity();
      setStatusMessage(
        resolution === 'approved'
          ? 'Approval accepted. Sage resumed the blocked work.'
          : 'Approval rejected. Sage stopped the blocked work.',
      );
    } catch (resolveError) {
      setError(
        resolveError instanceof WorkstationClientError || resolveError instanceof Error
          ? resolveError.message
          : 'Approval resolution failed.',
      );
    } finally {
      setResolvingApprovalId(null);
    }
  }

  return (
    <WorkstationSurfaceRoot surface="approvals">
      <WorkstationSurfaceCard
        title="Approvals"
        description="Single-purpose queue for decisions Sage cannot make without you."
        actions={(
          <WorkstationActionButton
            type="button"
            tone="secondary"
            onClick={() => {
              void refresh(false);
            }}
          >
            Refresh
          </WorkstationActionButton>
        )}
      >
        {statusMessage ? <WorkstationSurfaceNotice tone="success">{statusMessage}</WorkstationSurfaceNotice> : null}
        {error ? <WorkstationSurfaceNotice tone="danger">Approvals could not refresh. Use Refresh to try again.</WorkstationSurfaceNotice> : null}

        <WorkstationSurfaceStatGrid>
          <WorkstationSurfaceStat
            label="Pending approvals"
            value={String(pendingCount)}
            hint="Needs explicit decision to continue"
          />
          <WorkstationSurfaceStat
            label="Total approvals"
            value={String(items.length)}
            hint="Visible in this workspace"
          />
        </WorkstationSurfaceStatGrid>

        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="4.8rem" />
            <SkeletonBlock height="4.8rem" />
            <SkeletonBlock height="4.8rem" />
          </div>
        ) : items.length === 0 ? (
          <EmptyPanel
            title="No approvals waiting"
            body="When Sage needs your permission, the request will appear here with clear approve and reject actions."
          />
        ) : (
          <div className="app-stack-3">
            {items.map((item, index) => {
              const approvalId = String(item.approval_id ?? item.id ?? '').trim() || `approval-${index}`;
              const selected = approvalId === selectedApprovalId;
              const resolving = resolvingApprovalId === approvalId;
              return (
                <article
                  key={approvalId}
                  className={`app-card-button${selected ? ' app-card-button--selected' : ''}`}
                >
                  <button
                    type="button"
                    className="app-card-button__title"
                    onClick={() => setSelectedApprovalId(approvalId)}
                  >
                    {readString(item.prompt, 'Approval request')}
                  </button>
                  <span className="app-card-button__subtitle">{approvalId}</span>
                  <span className="app-card-button__meta">Run: {readString(item.run_id, 'Awaiting run linkage')}</span>
                  <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                    <DataBadge tone={approvalTone(item.status)}>{readString(item.status, 'pending')}</DataBadge>
                    <div className="app-inline-actions app-inline-actions--tight">
                      <WorkstationActionButton
                        type="button"
                        tone="secondary"
                        disabled={resolving}
                        onClick={() => {
                          void handleResolve(item, 'approved');
                        }}
                      >
                        {resolving ? 'Working…' : 'Approve'}
                      </WorkstationActionButton>
                      <WorkstationActionButton
                        type="button"
                        tone="danger"
                        disabled={resolving}
                        onClick={() => {
                          void handleResolve(item, 'rejected');
                        }}
                      >
                        Reject
                      </WorkstationActionButton>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </WorkstationSurfaceCard>

      <WorkstationSurfaceCard
        title={selectedApproval ? 'Approval detail' : 'Decision detail'}
        description={selectedApproval ? 'Review the selected request context before deciding.' : 'Select an approval to inspect detail.'}
      >
        {!selectedApproval ? (
          <EmptyPanel
            title="No approval selected"
            body="Select a request from the queue to review the context before you decide."
          />
        ) : (
          <div className="app-meta-list">
            <div className="app-meta-item">
              <span className="app-meta-label">Request</span>
              <span className="app-meta-value app-meta-value--body">{readString(selectedApproval.prompt, 'Approval request')}</span>
            </div>
            <div className="app-meta-item">
              <span className="app-meta-label">Status</span>
              <span className="app-meta-value app-meta-value--secondary">{readString(selectedApproval.status, 'pending')}</span>
            </div>
            <div className="app-meta-item">
              <span className="app-meta-label">Run id</span>
              <span className="app-meta-value app-meta-value--mono">{readString(selectedApproval.run_id, 'Awaiting run linkage')}</span>
            </div>
          </div>
        )}
      </WorkstationSurfaceCard>
    </WorkstationSurfaceRoot>
  );
}
