'use client';

import type { WorkstationClient } from '@/lib/workspace/workstation-client';

export type WorkstationApprovalResolution = 'approved' | 'rejected';

export type WorkstationApprovalResolutionEventDetail = {
  approvalId: string;
  runId: string | null;
  resolution: WorkstationApprovalResolution;
  message: string;
};

const WORKSTATION_APPROVAL_RESOLVED_EVENT = 'workstation:approval-resolved';

export function subscribeWorkstationApprovalResolved(
  listener: (detail: WorkstationApprovalResolutionEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<WorkstationApprovalResolutionEventDetail>).detail;
    if (detail) {
      listener(detail);
    }
  };

  window.addEventListener(WORKSTATION_APPROVAL_RESOLVED_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(WORKSTATION_APPROVAL_RESOLVED_EVENT, handler as EventListener);
  };
}

export function emitWorkstationApprovalResolved(
  detail: WorkstationApprovalResolutionEventDetail,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<WorkstationApprovalResolutionEventDetail>(
      WORKSTATION_APPROVAL_RESOLVED_EVENT,
      { detail },
    ),
  );
}

export async function resolveWorkstationApproval(
  client: WorkstationClient,
  options: {
    approvalId: string;
    resolution: WorkstationApprovalResolution;
    reason?: string;
  },
): Promise<Record<string, unknown> | null> {
  const payload = await client.resolveApproval({
    approvalId: options.approvalId,
    payload: {
      approval_id: options.approvalId,
      decision: options.resolution,
      resolution: options.resolution,
      reason: options.reason?.trim() || undefined,
    },
  });

  const resolvedRunId = String(payload?.run_id ?? '').trim() || null;
  emitWorkstationApprovalResolved({
    approvalId: options.approvalId,
    runId: resolvedRunId,
    resolution: options.resolution,
    message:
      options.resolution === 'approved'
        ? 'Approval approved. Run resumed.'
        : 'Approval rejected. Run stopped.',
  });
  return payload;
}
