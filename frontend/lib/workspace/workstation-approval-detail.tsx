'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppButton, AppNotice, AppTextarea } from '@/lib/ui/primitives';
import {
  resolveWorkstationApproval,
  subscribeWorkstationApprovalResolved,
} from '@/lib/workspace/workstation-approval-events';
import {
  type WorkstationApprovalDetailPayload,
  type WorkstationRunDetailPayload,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import {
  StageDetailField,
  StageDetailFieldGrid,
  StageDetailLayout,
  StageDetailSection,
} from '@/lib/workspace/stage-detail-layout';
import {
  WorkstationRunDetail,
  runPayloadIsActive,
  runPayloadIsTerminal,
} from '@/lib/workspace/workstation-run-detail';

function canResolveApproval(detail: WorkstationApprovalDetailPayload | null): boolean {
  const status = String(detail?.status ?? '').trim().toLowerCase();
  return status === 'requested' || status === 'pending';
}

export type WorkstationApprovalDetailProps = {
  approvalId: string;
};

export function WorkstationApprovalDetail({
  approvalId,
}: WorkstationApprovalDetailProps) {
  const services = useWorkspaceServices();
  const [detail, setDetail] = useState<WorkstationApprovalDetailPayload | null>(null);
  const [relatedRunDetail, setRelatedRunDetail] = useState<WorkstationRunDetailPayload | null>(null);
  const [reason, setReason] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void services.client.getApprovalDetail({ approvalId })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setDetail(payload as WorkstationApprovalDetailPayload | null);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setDetail(null);
        setError(loadError instanceof Error ? loadError.message : 'Approval detail is unavailable.');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [approvalId, refreshNonce, services.client]);

  useEffect(() => subscribeWorkstationApprovalResolved((event) => {
    if (event.approvalId === approvalId) {
      setStatusMessage(event.message);
      setRefreshNonce((value) => value + 1);
    }
  }), [approvalId]);

  const relatedRunId = useMemo(() => {
    const explicit = String(detail?.run_id ?? '').trim();
    if (explicit) {
      return explicit;
    }
    const nested = detail?.run && typeof detail.run === 'object'
      ? String((detail.run as Record<string, unknown>).run_id ?? '').trim()
      : '';
    return nested || null;
  }, [detail]);

  const postResolutionState = useMemo(() => {
    const resolution = String(detail?.resolution ?? '').trim().toLowerCase();
    if (resolution === 'approved' && runPayloadIsActive(relatedRunDetail)) {
      return 'Run resumed';
    }
    if (resolution === 'rejected' && runPayloadIsTerminal(relatedRunDetail)) {
      return 'Run stopped';
    }
    return null;
  }, [detail?.resolution, relatedRunDetail]);

  async function handleResolve(resolution: 'approved' | 'rejected') {
    if (isResolving) {
      return;
    }
    setIsResolving(true);
    setError(null);
    try {
      await resolveWorkstationApproval(services.client, {
        approvalId,
        resolution,
        reason,
      });
      setStatusMessage(
        resolution === 'approved'
          ? 'Approval approved. Run resumed.'
          : 'Approval rejected. Run stopped.',
      );
      setRefreshNonce((value) => value + 1);
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : 'Approval resolution failed.');
    } finally {
      setIsResolving(false);
    }
  }

  if (isLoading) {
    return (
      <div data-workstation-approval-detail="loading">
        <AppNotice>Loading approval detail.</AppNotice>
      </div>
    );
  }

  if (error) {
    return (
      <div data-workstation-approval-detail="error">
        <AppNotice tone="danger">{error}</AppNotice>
      </div>
    );
  }

  if (!detail) {
    return (
      <div data-workstation-approval-detail="empty">
        <AppNotice>Approval detail is unavailable for this selection.</AppNotice>
      </div>
    );
  }

  const resolution = String(detail.resolution ?? '').trim().toLowerCase();
  const noticeMessage = postResolutionState ?? statusMessage ?? null;
  const noticeTone: 'neutral' | 'success' | 'warning' | 'danger' =
    resolution === 'rejected'
      ? 'warning'
      : resolution === 'approved'
        ? 'success'
        : 'neutral';

  return (
    <div data-workstation-approval-detail="pane" style={{ display: 'grid', gap: '1rem' }}>
      <StageDetailLayout
        eyebrow="Approval"
        title={String(detail.prompt ?? 'Approval request')}
        subtitle={String(detail.approval_id ?? approvalId)}
        notice={noticeMessage ? {
          tone: noticeTone,
          message: noticeMessage,
        } : null}
        actions={(
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                setRefreshNonce((value) => value + 1);
              }}
            >
              Refresh
            </AppButton>
            {canResolveApproval(detail) ? (
              <>
                <AppButton
                  type="button"
                  disabled={isResolving}
                  onClick={() => {
                    void handleResolve('approved');
                  }}
                >
                  {isResolving ? 'Resolving…' : 'Approve'}
                </AppButton>
                <AppButton
                  type="button"
                  tone="danger"
                  disabled={isResolving}
                  onClick={() => {
                    void handleResolve('rejected');
                  }}
                >
                  Reject
                </AppButton>
              </>
            ) : null}
          </div>
        )}
      >
        <StageDetailSection title="Decision context">
          <StageDetailFieldGrid>
            <StageDetailField label="Status" value={String(detail.status ?? 'requested')} tone={canResolveApproval(detail) ? 'warning' : resolution === 'rejected' ? 'danger' : resolution === 'approved' ? 'success' : 'default'} />
            {detail.resolution ? (
              <StageDetailField label="Resolution" value={String(detail.resolution)} tone={resolution === 'rejected' ? 'danger' : resolution === 'approved' ? 'success' : 'default'} />
            ) : null}
            {detail.requested_at ? (
              <StageDetailField label="Requested" value={String(detail.requested_at)} />
            ) : null}
            {detail.resolved_at ? (
              <StageDetailField label="Resolved" value={String(detail.resolved_at)} />
            ) : null}
          </StageDetailFieldGrid>
        </StageDetailSection>

        {canResolveApproval(detail) ? (
          <StageDetailSection
            title="Resolution note"
            description="This note is optional and will be attached to the approval decision."
          >
            <AppTextarea
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              rows={3}
              placeholder="Optional operator note"
            />
          </StageDetailSection>
        ) : null}
      </StageDetailLayout>

      {relatedRunId ? (
        <WorkstationRunDetail
          runId={relatedRunId}
          embedded
          onLoaded={setRelatedRunDetail}
        />
      ) : null}
    </div>
  );
}
