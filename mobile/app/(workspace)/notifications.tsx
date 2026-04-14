import React, { useEffect, useState } from 'react';

import { useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import { ListDetailScreen } from '../../src/ui/list-detail';
import {
  SurfaceErrorScreen,
  SurfaceLoadingScreen,
  SurfaceNoticeCard,
} from '../../src/ui/state-screens';

export default function NotificationsScreen() {
  const runtimeState = useMobileRuntimeState();
  const surface = runtimeState.shellModel?.surfaces.notifications ?? null;
  const [result, setResult] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stopPolling: null | (() => void) = null;

    if (!surface) {
      return undefined;
    }

    void surface.loadNotifications({ refresh: true }).then((nextResult) => {
      if (cancelled) {
        return;
      }
      setResult(nextResult);
      setSelectedId(nextResult.data?.[0]?.id ?? null);
    });

    stopPolling = surface.startPolling({
      intervalMs: 45000,
      onUpdate(nextResult) {
        if (cancelled) {
          return;
        }
        setResult(nextResult);
        setSelectedId((current) => current ?? nextResult.data?.[0]?.id ?? null);
      },
    });

    return () => {
      cancelled = true;
      stopPolling?.();
    };
  }, [surface]);

  if (!surface) {
    return (
      <SurfaceErrorScreen
        title="Inbox unavailable"
        body="This workspace does not expose the mobile inbox feed."
      />
    );
  }

  if (!result) {
    return (
      <SurfaceLoadingScreen
        title="Loading inbox"
        body="Syncing workspace notices and operator alerts."
      />
    );
  }

  if (result.status === 'error' && result.data.length === 0) {
    return (
      <SurfaceErrorScreen
        title="Inbox could not be loaded"
        body={result.statusMessage ?? 'Notifications are unavailable right now.'}
      />
    );
  }

  return (
    <ListDetailScreen
      badge="Inbox"
      title="Workspace notifications"
      body="Operational notices, alerts, and reminders live here as a native mobile feed."
      items={result.data}
      selectedId={selectedId}
      onSelect={setSelectedId}
      emptyTitle="Inbox is clear"
      emptyBody="There are no notifications waiting for you."
      notice={result.statusMessage ? (
        <SurfaceNoticeCard
          title={result.status === 'degraded' ? 'Using cached inbox' : 'Inbox refreshed'}
          body={result.statusMessage}
          tone={result.status === 'degraded' ? 'warning' : 'accent'}
        />
      ) : undefined}
    />
  );
}
