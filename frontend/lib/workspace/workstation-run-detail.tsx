'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppButton, AppNotice } from '@/lib/ui/primitives';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { type WorkstationRunDetailPayload } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import {
  StageDetailField,
  StageDetailFieldGrid,
  StageDetailLayout,
  StageDetailSection,
} from '@/lib/workspace/stage-detail-layout';

function readRunStatus(payload: WorkstationRunDetailPayload | null): string {
  return String(payload?.status ?? 'unknown').trim().toLowerCase() || 'unknown';
}

function isTerminalRunStatus(status: string): boolean {
  return ['completed', 'failed', 'stopped', 'rejected', 'aborted', 'cancelled', 'canceled'].includes(status);
}

function describeRunState(payload: WorkstationRunDetailPayload | null): string | null {
  const status = readRunStatus(payload);
  if (!payload) {
    return null;
  }
  if (status === 'waiting_for_input') {
    return 'Waiting for approval input';
  }
  if (status === 'running' || status === 'queued' || status === 'queued_local') {
    return 'Run is active';
  }
  if (isTerminalRunStatus(status)) {
    return 'Run is in a terminal state';
  }
  return null;
}

function describeRunTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'running' || status === 'queued' || status === 'queued_local') {
    return 'success';
  }
  if (status === 'waiting_for_input') {
    return 'warning';
  }
  if (status === 'failed' || status === 'rejected' || status === 'aborted' || status === 'cancelled' || status === 'canceled') {
    return 'danger';
  }
  if (status === 'completed' || status === 'stopped') {
    return 'warning';
  }
  return 'neutral';
}

function scalarDiagnosticsEntries(payload: Record<string, unknown> | null): Array<[string, string]> {
  if (!payload) {
    return [];
  }
  return Object.entries(payload)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 4)
    .map(([key, value]) => [key, String(value)]);
}

export type WorkstationRunDetailProps = {
  runId: string;
  embedded?: boolean;
  onLoaded?: (payload: WorkstationRunDetailPayload | null) => void;
};

export function WorkstationRunDetail({
  runId,
  embedded = false,
  onLoaded,
}: WorkstationRunDetailProps) {
  const services = useWorkspaceServices();
  const [detail, setDetail] = useState<WorkstationRunDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void services.client.getRunDetail({ runId })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const nextDetail = payload as WorkstationRunDetailPayload | null;
        setDetail(nextDetail);
        onLoaded?.(nextDetail);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setDetail(null);
        onLoaded?.(null);
        setError(loadError instanceof Error ? loadError.message : 'Run detail is unavailable.');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoaded, refreshNonce, runId, services.client]);

  useEffect(() => subscribeWorkstationApprovalResolved((event) => {
    if (event.runId === runId) {
      setRefreshNonce((value) => value + 1);
    }
  }), [runId]);

  const status = useMemo(() => readRunStatus(detail), [detail]);
  const stateLabel = useMemo(() => describeRunState(detail), [detail]);

  if (isLoading) {
    return (
      <div data-workstation-run-detail="loading">
        <AppNotice>Loading run detail.</AppNotice>
      </div>
    );
  }

  if (error) {
    return (
      <div data-workstation-run-detail="error">
        <AppNotice tone="danger">{error}</AppNotice>
      </div>
    );
  }

  if (!detail) {
    return (
      <div data-workstation-run-detail="empty">
        <AppNotice>Run detail is unavailable for this selection.</AppNotice>
      </div>
    );
  }

  const diagnostics = detail.diagnostics && typeof detail.diagnostics === 'object'
    ? detail.diagnostics as Record<string, unknown>
    : null;
  const pendingConfirmation = detail.pending_confirmation && typeof detail.pending_confirmation === 'object'
    ? detail.pending_confirmation as Record<string, unknown>
    : null;
  const diagnosticEntries = scalarDiagnosticsEntries(diagnostics);

  return (
    <div data-workstation-run-detail="pane">
      <StageDetailLayout
        eyebrow={embedded ? 'Related run' : 'Run'}
        title={String(detail.run_id ?? runId)}
        subtitle={detail.result_summary ? String(detail.result_summary) : 'Canonical execution state for this run.'}
        notice={stateLabel ? {
          tone: describeRunTone(status),
          message: stateLabel,
        } : null}
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              setRefreshNonce((value) => value + 1);
            }}
          >
            Refresh
          </AppButton>
        )}
      >
        <StageDetailSection title="Execution">
          <StageDetailFieldGrid>
            <StageDetailField label="Status" value={status} tone={describeRunTone(status) === 'danger' ? 'danger' : describeRunTone(status) === 'warning' ? 'warning' : describeRunTone(status) === 'success' ? 'success' : 'default'} />
            <StageDetailField label="Source" value={detail.archived ? 'Archived snapshot' : 'Live run'} />
            <StageDetailField label="Approval state" value={pendingConfirmation ? 'Waiting for input' : 'No pending approval'} tone={pendingConfirmation ? 'warning' : 'default'} />
            <StageDetailField label="Run id" value={String(detail.run_id ?? runId)} mono />
          </StageDetailFieldGrid>
        </StageDetailSection>

        {detail.result_summary ? (
          <StageDetailSection title="Summary">
            <div className="app-meta-value app-meta-value--body">
              {String(detail.result_summary)}
            </div>
          </StageDetailSection>
        ) : null}

        {pendingConfirmation ? (
          <StageDetailSection title="Awaiting input" description="This run is paused until the required approval is resolved.">
            <StageDetailFieldGrid>
              <StageDetailField
                label="Approval"
                value={String(pendingConfirmation.approval_id ?? 'unknown')}
                mono
              />
            </StageDetailFieldGrid>
          </StageDetailSection>
        ) : null}

        {diagnostics || diagnosticEntries.length > 0 ? (
          <StageDetailSection title="Diagnostics" description="Selected execution metadata captured from the canonical run record.">
            <StageDetailFieldGrid>
              {typeof diagnostics?.category === 'string' ? (
                <StageDetailField label="Category" value={diagnostics.category} />
              ) : null}
              {diagnosticEntries
                .filter(([key]) => key !== 'category')
                .map(([key, value]) => (
                  <StageDetailField key={key} label={key.replace(/_/g, ' ')} value={value} />
                ))}
            </StageDetailFieldGrid>
          </StageDetailSection>
        ) : null}
      </StageDetailLayout>
    </div>
  );
}

export function runPayloadIsActive(payload: WorkstationRunDetailPayload | null): boolean {
  const status = readRunStatus(payload);
  return Boolean(payload) && !isTerminalRunStatus(status) && status !== 'waiting_for_input';
}

export function runPayloadIsTerminal(payload: WorkstationRunDetailPayload | null): boolean {
  return isTerminalRunStatus(readRunStatus(payload));
}
