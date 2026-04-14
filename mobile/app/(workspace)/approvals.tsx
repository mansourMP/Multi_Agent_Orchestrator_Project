import React, { useEffect, useState } from 'react';

import { View } from 'react-native';

import { useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import { AppButton } from '../../src/ui/primitives';
import { ListDetailScreen } from '../../src/ui/list-detail';
import {
  SurfaceErrorScreen,
  SurfaceLoadingScreen,
  SurfaceNoticeCard,
} from '../../src/ui/state-screens';

export default function ApprovalsScreen() {
  const runtimeState = useMobileRuntimeState();
  const surface = runtimeState.shellModel?.surfaces.runsApprovals ?? null;
  const [result, setResult] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; body: string; tone?: 'accent' | 'success' | 'warning' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!surface || !surface.approvalsAvailable) {
      return undefined;
    }

    void surface.loadApprovals({ refresh: true }).then((nextResult) => {
      if (cancelled) {
        return;
      }
      setResult(nextResult);
      setSelectedId(nextResult.data?.[0]?.id ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [surface]);

  if (!surface || !surface.approvalsAvailable) {
    return (
      <SurfaceErrorScreen
        title="Approvals are unavailable"
        body="This workspace is not configured for mobile approval review."
      />
    );
  }

  if (!result) {
    return (
      <SurfaceLoadingScreen
        title="Loading approvals"
        body="Syncing pending decisions and recent approval requests."
      />
    );
  }

  if (result.status === 'error' && result.data.length === 0) {
    return (
      <SurfaceErrorScreen
        title="Approvals could not be loaded"
        body={result.statusMessage ?? 'The approval queue is unavailable right now.'}
      />
    );
  }

  return (
    <ListDetailScreen
      badge="Approvals"
      title="Decision queue"
      body="Review and resolve pending run blockers directly from the mobile workspace."
      items={result.data}
      selectedId={selectedId}
      onSelect={setSelectedId}
      emptyTitle="No approvals waiting"
      emptyBody="This workspace does not have any pending decisions right now."
      notice={notice
        ? (
          <SurfaceNoticeCard
            title={notice.title}
            body={notice.body}
            tone={notice.tone}
          />
        )
        : result.statusMessage
          ? (
            <SurfaceNoticeCard
              title={result.status === 'degraded' ? 'Using cached approvals' : 'Approvals updated'}
              body={result.statusMessage}
              tone={result.status === 'degraded' ? 'warning' : 'accent'}
            />
          )
          : undefined}
      renderDetailActions={(item) => (
        <View style={{ gap: 10 }}>
          <AppButton
            label="Approve"
            onPress={() => {
              void surface.respondToApproval({
                approvalId: item.id,
                decision: 'approved',
              }).then((response) => {
                setResult((current: any) => ({
                  ...(current ?? result),
                  data: response.approvals,
                }));
                setSelectedId(response.approvals[0]?.id ?? null);
                setNotice({
                  title: 'Approved',
                  body: `${item.title} has been approved and removed from the pending queue.`,
                  tone: 'success',
                });
              });
            }}
          />
          <AppButton
            label="Reject"
            tone="secondary"
            onPress={() => {
              void surface.respondToApproval({
                approvalId: item.id,
                decision: 'rejected',
              }).then((response) => {
                setResult((current: any) => ({
                  ...(current ?? result),
                  data: response.approvals,
                }));
                setSelectedId(response.approvals[0]?.id ?? null);
                setNotice({
                  title: 'Rejected',
                  body: `${item.title} has been rejected and removed from the pending queue.`,
                  tone: 'warning',
                });
              });
            }}
          />
        </View>
      )}
    />
  );
}
