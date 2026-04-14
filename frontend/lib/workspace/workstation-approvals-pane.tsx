'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { DataBadge, DataTable, DataTableCell, DataTableHeader, DataTableHeaderCell, DataTableRow } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import {
  resolveWorkstationApproval,
  subscribeWorkstationApprovalResolved,
} from '@/lib/workspace/workstation-approval-events';
import { WorkstationClientError } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  readWorkstationStageRouteState,
  writeWorkstationStageRouteState,
} from '@/lib/workspace/workstation-stage-router';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

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
  return typeof value === 'string' && value.trim() ? value : fallback;
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

function ApprovalSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <ListDetailPanel eyebrow="Queue" title="Loading approvals">
          <SkeletonBlock height="2.8rem" />
          <SkeletonBlock height="2.8rem" />
          <SkeletonBlock height="2.8rem" />
        </ListDetailPanel>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Selection" title="Loading approval context">
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkstationApprovalsPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stageRouteState = useMemo(() => readWorkstationStageRouteState(searchParams), [searchParams]);
  const [items, setItems] = useState<ApprovalRecord[]>([]);
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
    setItems(normalizeApprovalItems(payload));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'Approval queue is unavailable.');
        setIsLoading(false);
      }
    });
    const unsubscribe = subscribeWorkstationApprovalResolved((event) => {
      if (cancelled) {
        return;
      }
      setStatusMessage(event.message);
      setItems((previousItems) =>
        previousItems.filter((item) => String(item.approval_id ?? item.id ?? '').trim() !== event.approvalId),
      );
      void refresh(false).catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Approval queue is unavailable.');
          setIsLoading(false);
        }
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
      setError(loadError instanceof Error ? loadError.message : 'Approval queue is unavailable.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  async function handleResolve(item: ApprovalRecord, resolution: 'approved' | 'rejected') {
    const approvalId = String(item.approval_id ?? item.id ?? '').trim();
    if (!approvalId || resolvingApprovalId) {
      return;
    }
    setResolvingApprovalId(approvalId);
    setError(null);
    try {
      await resolveWorkstationApproval(services.client, {
        approvalId,
        resolution,
      });
      setItems((previousItems) =>
        previousItems.filter((entry) => String(entry.approval_id ?? entry.id ?? '').trim() !== approvalId),
      );
      services.streams.touchActivity();
      setStatusMessage(
        resolution === 'approved'
          ? 'Approval approved. Run resumed.'
          : 'Approval rejected. Run stopped.',
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

  const selectedApproval = useMemo(() => {
    if (items.length === 0) {
      return null;
    }
    if (stageRouteState?.kind === 'approval') {
      return items.find((item) => String(item.approval_id ?? item.id ?? '').trim() === stageRouteState.id) ?? items[0];
    }
    return items[0];
  }, [items, stageRouteState]);

  const selectedApprovalId = String(selectedApproval?.approval_id ?? selectedApproval?.id ?? '').trim();
  const inspectorFocused = stageRouteState?.kind === 'approval' && stageRouteState.id === selectedApprovalId;

  const focusApproval = (approvalId: string) => {
    router.replace(
      writeWorkstationStageRouteState(pathname, searchParams, {
        source: 'route',
        kind: 'approval',
        id: approvalId,
      }),
      { scroll: false },
    );
  };

  return (
    <WorkstationSurfaceRoot surface="approvals">
      <ListDetailShell
        title="Approvals"
        subtitle="Operator decision queue for runs that are paused and awaiting input."
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              void refresh(false);
            }}
          >
            Refresh
          </AppButton>
        )}
      >
        {statusMessage ? (
          <StateBanner
            tone={/rejected|stopped/i.test(statusMessage) ? 'warning' : 'success'}
            title="Approval queue updated"
            detail="The queue and related run focus were refreshed after the last resolution."
          >
            {statusMessage}
          </StateBanner>
        ) : null}
        {error ? (
          <StateBanner
            tone="danger"
            title="Approval queue is degraded"
            detail="The queue could not be fully refreshed from canonical approval state."
          >
            {error}
          </StateBanner>
        ) : null}

        {isLoading ? (
          <ApprovalSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <ListDetailPanel
                eyebrow="Queue"
                title="Pending operator decisions"
                subtitle={`${items.length} approvals currently visible in the workspace queue.`}
              >
                {items.length === 0 ? (
                  <EmptyPanel
                    title="No approvals pending"
                    body="When a run pauses for operator confirmation, it will surface here immediately."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 1.25fr) minmax(0, 0.6fr) minmax(0, 0.8fr) auto">
                      <DataTableHeaderCell>Request</DataTableHeaderCell>
                      <DataTableHeaderCell>Status</DataTableHeaderCell>
                      <DataTableHeaderCell>Run</DataTableHeaderCell>
                      <DataTableHeaderCell align="end">Actions</DataTableHeaderCell>
                    </DataTableHeader>
                    {items.map((item, index) => {
                      const approvalId = String(item.approval_id ?? item.id ?? '').trim() || `approval-${index}`;
                      const selected = approvalId === selectedApprovalId;
                      const resolving = resolvingApprovalId === approvalId;
                      return (
                        <DataTableRow
                          key={approvalId}
                          columns="minmax(0, 1.25fr) minmax(0, 0.6fr) minmax(0, 0.8fr) auto"
                          selected={selected}
                        >
                          <DataTableCell
                            primary={readString(item.prompt, 'Approval request')}
                            secondary={approvalId}
                          />
                          <DataTableCell primary={<DataBadge tone={approvalTone(item.status)}>{readString(item.status, 'pending')}</DataBadge>} />
                          <DataTableCell primary={readString(item.run_id, 'Awaiting run linkage')} mono />
                          <DataTableCell
                            align="end"
                            primary={(
                              <div className="app-inline-actions app-inline-actions--end app-inline-actions--tight">
                                <AppButton
                                  type="button"
                                  tone="secondary"
                                  className="app-button--compact"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    focusApproval(approvalId);
                                  }}
                                >
                                  {selected ? 'Selected' : 'Focus'}
                                </AppButton>
                                <AppButton
                                  type="button"
                                  className="app-button--compact"
                                  disabled={resolving}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleResolve(item, 'approved');
                                  }}
                                >
                                  {resolving ? 'Working…' : 'Approve'}
                                </AppButton>
                                <AppButton
                                  type="button"
                                  tone="danger"
                                  className="app-button--compact"
                                  disabled={resolving}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleResolve(item, 'rejected');
                                  }}
                                >
                                  Reject
                                </AppButton>
                              </div>
                            )}
                          />
                        </DataTableRow>
                      );
                    })}
                  </DataTable>
                )}
              </ListDetailPanel>
            )}
            secondary={(
              <ListDetailPanel
                eyebrow="Selection"
                title={selectedApproval ? readString(selectedApproval.prompt, selectedApprovalId || 'Approval') : 'No approval selected'}
                subtitle={selectedApprovalId || 'Choose an approval from the queue to focus the inspector.'}
                actions={selectedApprovalId ? (
                  <AppButton
                    type="button"
                    tone={inspectorFocused ? 'secondary' : 'primary'}
                    onClick={() => {
                      if (selectedApprovalId) {
                        focusApproval(selectedApprovalId);
                      }
                    }}
                  >
                    {inspectorFocused ? 'Inspector focused' : 'Focus in inspector'}
                  </AppButton>
                ) : undefined}
              >
                {!selectedApproval ? (
                  <EmptyPanel
                    title="No selected approval"
                    body="When the approval queue is populated, the currently focused request will appear here with quick context."
                  />
                ) : (
                  <>
                    <StateBanner
                      tone={approvalTone(selectedApproval.status) as 'neutral' | 'success' | 'warning' | 'danger'}
                      title={readString(selectedApproval.status, 'pending')}
                      detail={readString(selectedApproval.run_id, 'Awaiting run linkage')}
                    >
                      Operator action here updates the canonical approval record and the related run state.
                    </StateBanner>
                    <div className="app-meta-list">
                      <div className="app-meta-item">
                        <span className="app-meta-label">Approval id</span>
                        <span className="app-meta-value app-meta-value--mono">{selectedApprovalId}</span>
                      </div>
                      <div className="app-meta-item">
                        <span className="app-meta-label">Run</span>
                        <span className="app-meta-value app-meta-value--secondary">{readString(selectedApproval.run_id, 'Awaiting run linkage')}</span>
                      </div>
                    </div>
                  </>
                )}
              </ListDetailPanel>
            )}
          />
        )}
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
