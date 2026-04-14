'use client';

import { useEffect, useState } from 'react';

import { AppButton, AppNotice } from '@/lib/ui/primitives';
import { SageTraceView } from '@/lib/workspace/sage-trace-view';
import {
  type WorkstationAgentTraceReplayPayload,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

export type WorkstationTraceDetailProps = {
  traceId: string;
  embedded?: boolean;
  onLoaded?: (payload: WorkstationAgentTraceReplayPayload | null) => void;
};

export function WorkstationTraceDetail({
  traceId,
  embedded = false,
  onLoaded,
}: WorkstationTraceDetailProps) {
  const services = useWorkspaceServices();
  const [detail, setDetail] = useState<WorkstationAgentTraceReplayPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void services.client.getTraceReplay({ traceId })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const nextDetail = payload as WorkstationAgentTraceReplayPayload | null;
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
        setError(loadError instanceof Error ? loadError.message : 'Trace replay is unavailable.');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoaded, refreshNonce, services.client, traceId]);

  if (isLoading) {
    return (
      <div data-workstation-trace-detail="loading">
        <AppNotice>Loading trace replay.</AppNotice>
      </div>
    );
  }

  if (error) {
    return (
      <div data-workstation-trace-detail="error">
        <AppNotice tone="danger">{error}</AppNotice>
      </div>
    );
  }

  if (!detail?.trace) {
    return (
      <div data-workstation-trace-detail="empty">
        <AppNotice>Trace replay is unavailable for this selection.</AppNotice>
      </div>
    );
  }

  return (
    <div data-workstation-trace-detail="pane" className="app-stack-4">
      <div className="app-inline-actions app-inline-actions--end">
        <AppButton
          type="button"
          tone="secondary"
          onClick={() => {
            setRefreshNonce((value) => value + 1);
          }}
        >
          Refresh
        </AppButton>
      </div>
      <SageTraceView
        key={`${traceId}:${refreshNonce}`}
        traceId={traceId}
        mode="replay"
        initialTrace={detail.trace}
        initialEvents={detail.events ?? []}
        className={embedded ? 'workstation-trace-detail-embedded' : undefined}
      />
    </div>
  );
}
