'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Activity } from 'lucide-react';
import {
  AUTH_STREAM_CLOSED,
  openAuthenticatedEventStream,
  type AuthenticatedEventStreamConnection,
} from '@/lib/authenticatedEventStream';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { RunLiveEventFeed } from '@/components/orion/runs/RunLiveEventFeed';
import {
  buildRunLiveTimelineEvents,
  parseRunLiveEventJson,
  type RunLiveFeedMode,
  type RunLiveReplayEvent,
  type RunLiveStreamState,
} from '@/components/orion/runs/runLiveCockpitModel';

const TERMINAL_RUN_STATUSES = new Set(['completed', 'success', 'failed', 'error', 'stopped', 'timeout', 'cancelled']);

export function RunLiveCockpitPanel({
  runId,
  loading = false,
  runStatus,
  replayEvents,
  sectionRef,
  focusedStyle,
  active = false,
  headerAccessory,
  onLiveEventsChange,
  onStreamMetaChange,
  onRefreshRunState,
}: {
  runId: string;
  loading?: boolean;
  runStatus?: string | null;
  replayEvents?: RunLiveReplayEvent[] | null;
  sectionRef?: RefObject<HTMLElement | null>;
  focusedStyle?: CSSProperties;
  active?: boolean;
  headerAccessory?: ReactNode;
  onLiveEventsChange?: (events: RunLiveReplayEvent[]) => void;
  onStreamMetaChange?: (state: RunLiveStreamState, error: string | null) => void;
  onRefreshRunState?: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<RunLiveFeedMode>('timeline');
  const [liveEvents, setLiveEvents] = useState<RunLiveReplayEvent[]>([]);
  const [streamState, setStreamState] = useState<RunLiveStreamState>('idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamRef = useRef<AuthenticatedEventStreamConnection | null>(null);

  useEffect(() => {
    onLiveEventsChange?.(liveEvents);
  }, [liveEvents, onLiveEventsChange]);

  useEffect(() => {
    onStreamMetaChange?.(streamState, streamError);
  }, [onStreamMetaChange, streamError, streamState]);

  useEffect(() => {
    if (!loading) return;
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    setLiveEvents([]);
    setStreamState('idle');
    setStreamError(null);
  }, [loading, runId]);

  useEffect(() => {
    const normalizedStatus = String(runStatus || '').trim().toLowerCase();
    if (!runId || loading) return;
    if (TERMINAL_RUN_STATUSES.has(normalizedStatus)) {
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
      setStreamState('closed');
      setStreamError(null);
      return;
    }
    setStreamState('connecting');
    setStreamError(null);
    let activeConnection = true;
    let source: AuthenticatedEventStreamConnection | null = null;

    void (async () => {
      await ensureControlPlaneSession();
      if (!activeConnection) return;
      const streamUrl = `/api/runs/${encodeURIComponent(runId)}/stream`;
      source = openAuthenticatedEventStream({
        url: streamUrl,
        onOpen: () => {
          setStreamState('connected');
          setStreamError(null);
        },
        onEvent: (event) => {
          if (event.event === 'pause') {
            void onRefreshRunState?.();
            return;
          }
          if (event.event !== 'log') return;
          const parsed = parseRunLiveEventJson(String(event.data || ''));
          if (!parsed) return;
          setLiveEvents((prev) => {
            const eventId = String(parsed.event_id || '').trim();
            if (eventId && prev.some((item) => String(item.event_id || '').trim() === eventId)) return prev;
            const next = [...prev, parsed];
            if (next.length > 800) return next.slice(next.length - 800);
            return next;
          });
          const eventName = String(parsed.event || '').trim().toLowerCase();
          if (
            eventName === 'run_complete'
            || eventName === 'run_error'
            || eventName === 'run_stopped'
            || eventName === 'timeout'
            || eventName.startsWith('approval_')
          ) {
            if (
              eventName === 'run_complete'
              || eventName === 'run_error'
              || eventName === 'run_stopped'
              || eventName === 'timeout'
            ) {
              source?.close();
              if (streamRef.current === source) streamRef.current = null;
              setStreamState('closed');
              setStreamError(null);
            }
            void onRefreshRunState?.();
          }
        },
        onError: () => {
          const latestStatus = String(runStatus || '').trim().toLowerCase();
          if (TERMINAL_RUN_STATUSES.has(latestStatus) || source?.readyState === AUTH_STREAM_CLOSED) {
            source?.close();
            if (streamRef.current === source) streamRef.current = null;
            setStreamState('closed');
            setStreamError(null);
            void onRefreshRunState?.();
            return;
          }
          void onRefreshRunState?.();
          setStreamState('disconnected');
          setStreamError('Live stream disconnected. Waiting for reconnect...');
        },
        onClose: () => {
          if (streamRef.current === source) streamRef.current = null;
        },
      });
      streamRef.current = source;
    })();

    return () => {
      activeConnection = false;
      source?.close();
      if (streamRef.current === source) streamRef.current = null;
      setStreamState('idle');
    };
  }, [loading, onRefreshRunState, runId, runStatus]);

  const timelineEvents = useMemo(
    () => buildRunLiveTimelineEvents(replayEvents, liveEvents),
    [liveEvents, replayEvents],
  );

  return (
    <article
      ref={sectionRef}
      className="orion-panel"
      style={{
        minHeight: 280,
        scrollMarginTop: 92,
        ...(active && focusedStyle ? focusedStyle : null),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} />
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Live cockpit
          </span>
        </div>
        {headerAccessory}
      </div>
      <RunLiveEventFeed
        mode={mode}
        onModeChange={setMode}
        timelineEvents={timelineEvents}
      />
    </article>
  );
}
