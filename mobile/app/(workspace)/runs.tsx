import React, { useEffect, useMemo, useState } from 'react';

import { View } from 'react-native';

import { useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import { AppBadge, AppCaption, AppText, AppTitle } from '../../src/ui/primitives';
import { ListDetailScreen } from '../../src/ui/list-detail';
import {
  SurfaceErrorScreen,
  SurfaceLoadingScreen,
  SurfaceNoticeCard,
} from '../../src/ui/state-screens';

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function summarizeTraceEvent(event: Record<string, unknown>): string {
  const type = readString(event.event_type, 'trace.event');
  const data = event.data && typeof event.data === 'object'
    ? event.data as Record<string, unknown>
    : {};
  if (type === 'plan.started') {
    return readString(data.summary, readString(data.title, 'Plan started'));
  }
  if (type === 'plan.item.created') {
    return readString(data.title, 'Planned step');
  }
  if (type === 'tool.started') {
    return readString(data.tool_name, 'Tool started');
  }
  if (type === 'tool.result') {
    return readString(data.summary, readString(data.status, 'Tool result'));
  }
  if (type === 'search.query') {
    return `Searching: ${readString(data.query, 'query')}`;
  }
  if (type === 'search.results') {
    const results = Array.isArray(data.results) ? data.results.length : 0;
    return `${results} search results`;
  }
  if (type === 'delegation.started') {
    return readString(data.task_summary, readString(data.specialist_name, 'Delegation started'));
  }
  if (type === 'delegation.finished') {
    return readString(data.result_summary, readString(data.status, 'Delegation finished'));
  }
  if (type === 'approval.requested') {
    return readString(data.description, readString(data.title, 'Approval requested'));
  }
  if (type === 'approval.resolved') {
    return readString(data.decision, 'Approval resolved');
  }
  if (type === 'artifact.created') {
    return readString(data.title, readString(data.kind, 'Artifact created'));
  }
  if (type === 'trace.completed') {
    return readString(data.outcome, 'Completed');
  }
  if (type === 'trace.failed') {
    return readString(data.message, 'Trace failed');
  }
  return type.replace(/\./g, ' ');
}

export default function RunsScreen() {
  const runtimeState = useMobileRuntimeState();
  const surface = runtimeState.shellModel?.surfaces.runsApprovals ?? null;
  const [result, setResult] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [traceReplay, setTraceReplay] = useState<any>(null);
  const [traceReplayError, setTraceReplayError] = useState<string | null>(null);
  const [traceReplayLoading, setTraceReplayLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!surface) {
      return undefined;
    }

    void surface.loadWorkItems({ refresh: true }).then((nextResult) => {
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

  const selectedItem = useMemo(
    () => result?.data?.find((item: any) => item.id === selectedId) ?? result?.data?.[0] ?? null,
    [result?.data, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    if (!surface || !selectedItem || selectedItem.kind !== 'trace') {
      setTraceReplay(null);
      setTraceReplayError(null);
      setTraceReplayLoading(false);
      return undefined;
    }
    setTraceReplayLoading(true);
    setTraceReplayError(null);
    void surface.getTraceReplay({ traceId: selectedItem.id })
      .then((payload: any) => {
        if (cancelled) {
          return;
        }
        setTraceReplay(payload);
        setTraceReplayLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setTraceReplay(null);
        setTraceReplayError(error instanceof Error ? error.message : String(error));
        setTraceReplayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItem, surface]);

  if (!surface) {
    return (
      <SurfaceErrorScreen
        title="Runs are unavailable"
        body="This workspace does not expose mobile run history."
      />
    );
  }

  if (!result) {
    return (
      <SurfaceLoadingScreen
        title="Loading work"
        body="Syncing the execution queue and recent trace replays."
      />
    );
  }

  if (result.status === 'error' && result.data.length === 0) {
    return (
      <SurfaceErrorScreen
        title="Work could not be loaded"
        body={result.statusMessage ?? 'The execution queue is unavailable right now.'}
      />
    );
  }

  return (
    <ListDetailScreen
      badge="Work"
      title="Execution queue"
      body="Track runs and inspect replayable Sage traces without leaving the native shell."
      items={result.data}
      selectedId={selectedId}
      onSelect={setSelectedId}
      emptyTitle="No work yet"
      emptyBody="This workspace has not produced any runs or trace replays in the current history window."
      notice={result.statusMessage ? (
        <SurfaceNoticeCard
          title={result.status === 'degraded' ? 'Using cached work history' : 'Work queue updated'}
          body={result.statusMessage}
          tone={result.status === 'degraded' ? 'warning' : 'accent'}
        />
      ) : undefined}
      renderDetailBody={(item) => {
        if (item.kind !== 'trace') {
          return null;
        }

        const events = Array.isArray(traceReplay?.events) ? traceReplay.events : [];

        return (
          <View style={{ gap: 12 }}>
            <AppTitle>Trace replay</AppTitle>
            {traceReplayLoading ? (
              <AppText muted>Loading persisted trace events.</AppText>
            ) : null}
            {traceReplayError ? (
              <AppText muted>{traceReplayError}</AppText>
            ) : null}
            {!traceReplayLoading && !traceReplayError && events.length === 0 ? (
              <AppText muted>No persisted trace events are available for this replay.</AppText>
            ) : null}
            {events.map((event: any, index: number) => (
              <View
                key={String(event.id ?? `${item.id}:event:${index}`)}
                style={{
                  gap: 6,
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#232d3a',
                  backgroundColor: '#1d2531',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <AppTitle>{readString(event.event_type, 'trace.event')}</AppTitle>
                  <AppBadge tone="default">{String(event.seq ?? index + 1)}</AppBadge>
                </View>
                <AppText muted>{summarizeTraceEvent(event)}</AppText>
                {readString(event.ts) ? <AppCaption>{readString(event.ts)}</AppCaption> : null}
              </View>
            ))}
          </View>
        );
      }}
    />
  );
}
