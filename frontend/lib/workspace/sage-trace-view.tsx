'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { DataBadge } from '@/lib/ui/data-table';
import { Modal } from '@/lib/ui/modal';
import {
  AppButton,
  AppEmptyState,
  AppNotice,
  AppSurfaceCard,
} from '@/lib/ui/primitives';
import type {
  WorkstationAgentTraceEvent,
  WorkstationAgentTraceRecord,
  WorkstationAgentTraceReplayPayload,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

type TraceMode = 'live' | 'replay';
type TraceLiveTransport = 'trace-stream' | 'external';

type TraceEvent = WorkstationAgentTraceEvent & {
  id: string;
  event_type: string;
  seq: number;
  persisted: boolean;
  data: Record<string, unknown>;
};

type PlanItemView = {
  id: string;
  seq: number;
  index: number;
  title: string;
  kind: string;
  owner: string;
  status: string;
  summary: string;
  rationale: string;
  reasoning: string;
};

type ToolCardView = {
  id: string;
  seq: number;
  toolCallId: string;
  itemId: string | null;
  toolName: string;
  capabilityId: string;
  connectorId: string;
  argsPreview: Record<string, unknown>;
  progressMessages: string[];
  queries: Array<{
    provider: string;
    query: string;
    filters: Record<string, unknown>;
  }>;
  results: Array<Record<string, unknown>>;
  browserActions: Array<{
    action: string;
    targetSummary: string;
    url: string | null;
  }>;
  screenshots: Array<{
    artifactId: string | null;
    caption: string;
    width: number;
    height: number;
  }>;
  resultStatus: string;
  resultSummary: string;
  artifactIds: string[];
};

type DelegationCardView = {
  id: string;
  seq: number;
  childRunId: string;
  itemId: string | null;
  specialistId: string;
  specialistName: string;
  taskSummary: string;
  status: string;
  resultSummary: string;
};

export type SageTraceViewProps = {
  traceId?: string | null;
  mode: TraceMode;
  liveTransport?: TraceLiveTransport;
  initialTrace?: WorkstationAgentTraceRecord | null;
  initialEvents?: WorkstationAgentTraceEvent[] | null;
  additiveEvents?: WorkstationAgentTraceEvent[] | null;
  className?: string;
};

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function traceEventKey(event: WorkstationAgentTraceEvent, index: number): string {
  const explicit = readString(event.id);
  if (explicit) {
    return explicit;
  }
  const seq = readNumber(event.seq, index + 1);
  const eventType = readString(event.event_type, 'trace.event');
  const traceId = readString(event.trace_id, 'trace');
  return `${traceId}:${seq}:${eventType}:${index}`;
}

function normalizeTraceEvent(event: WorkstationAgentTraceEvent, index: number): TraceEvent | null {
  if (!event || typeof event !== 'object') {
    return null;
  }
  const eventType = readString(event.event_type);
  if (!eventType) {
    return null;
  }
  return {
    ...event,
    id: traceEventKey(event, index),
    event_type: eventType,
    seq: readNumber(event.seq, index + 1),
    persisted: Boolean(event.persisted),
    data: readObject(event.data),
  };
}

function mergeTraceEvents(current: TraceEvent[], incoming: WorkstationAgentTraceEvent[] | null | undefined): TraceEvent[] {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return current;
  }
  const next = new Map<string, TraceEvent>();
  for (const event of current) {
    next.set(event.id, event);
  }
  incoming.forEach((event, index) => {
    const normalized = normalizeTraceEvent(event, current.length + index);
    if (normalized) {
      next.set(normalized.id, normalized);
    }
  });
  return Array.from(next.values()).sort((left, right) => {
    if (left.seq !== right.seq) {
      return left.seq - right.seq;
    }
    return left.id.localeCompare(right.id);
  });
}

function isTerminalEvent(eventType: string): boolean {
  return eventType === 'trace.completed' || eventType === 'trace.failed';
}

function isSageRootAgent(rootAgentId: string | null): boolean {
  return readString(rootAgentId) === 'sage';
}

function isComputerEvent(eventType: string): boolean {
  return (
    eventType === 'browser.action'
    || eventType === 'browser.screenshot'
    || eventType.startsWith('computer.')
  );
}

function shouldRenderEvent(rootAgentId: string | null, eventType: string): boolean {
  if (eventType === 'assistant.message.delta') {
    return false;
  }
  if (!isSageRootAgent(rootAgentId) && isComputerEvent(eventType)) {
    return false;
  }
  return true;
}

function badgeToneForStatus(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const normalized = readString(status).toLowerCase();
  if (normalized === 'ok' || normalized === 'done' || normalized === 'completed' || normalized === 'success') {
    return 'success';
  }
  if (normalized === 'running' || normalized === 'queued' || normalized === 'active' || normalized === 'open') {
    return 'accent';
  }
  if (normalized === 'failed' || normalized === 'error' || normalized === 'rejected') {
    return 'danger';
  }
  if (normalized === 'blocked' || normalized === 'needs_input' || normalized === 'paused') {
    return 'warning';
  }
  return 'neutral';
}

function formatDuration(durationMs: unknown): string {
  const value = readNumber(durationMs, 0);
  if (value <= 0) {
    return '0s';
  }
  if (value < 1_000) {
    return `${value}ms`;
  }
  return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}s`;
}

function formatTimestamp(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarizeRootAgent(rootAgentId: string | null): string {
  const normalized = readString(rootAgentId);
  if (!normalized) {
    return 'Agent trace';
  }
  if (normalized === 'sage') {
    return 'Sage trace';
  }
  if (normalized.startsWith('specialist:')) {
    return 'Specialist trace';
  }
  if (normalized.startsWith('deployed:')) {
    return 'Deployed agent trace';
  }
  return 'Agent trace';
}

function kindLabel(kind: string): string {
  const normalized = readString(kind).toLowerCase();
  if (!normalized) {
    return 'step';
  }
  return normalized.replace(/_/g, ' ');
}

function planOwnerLabel(owner: string): string {
  const normalized = readString(owner);
  if (!normalized || normalized === 'sage') {
    return 'Sage';
  }
  return normalized;
}

function buildPlanModel(events: TraceEvent[]) {
  let planTitle = '';
  let planSummary = '';
  const items = new Map<string, PlanItemView>();
  let lastPlanItemId: string | null = null;

  for (const event of events) {
    if (event.event_type === 'plan.started') {
      planTitle = readString(event.data.title, planTitle || 'Sage Plan');
      planSummary = readString(event.data.summary, planSummary);
      continue;
    }
    if (event.event_type === 'plan.item.created') {
      const itemId = readString(event.item_id, event.id);
      items.set(itemId, {
        id: itemId,
        seq: event.seq,
        index: readNumber(event.data.index, items.size + 1),
        title: readString(event.data.title, 'Planned step'),
        kind: readString(event.data.kind, 'respond'),
        owner: readString(event.data.owner, 'sage'),
        status: 'queued',
        summary: '',
        rationale: readString(event.data.rationale_summary),
        reasoning: '',
      });
      lastPlanItemId = itemId;
      continue;
    }
    if (event.event_type === 'plan.item.updated') {
      const itemId = readString(event.item_id);
      const item = items.get(itemId);
      if (!item) {
        continue;
      }
      item.status = readString(event.data.status, item.status);
      item.summary = readString(event.data.summary, item.summary);
      continue;
    }
    if (event.event_type === 'reasoning.summary.delta') {
      const targetId = readString(event.item_id, lastPlanItemId ?? '');
      if (!targetId) {
        continue;
      }
      const item = items.get(targetId);
      if (!item) {
        continue;
      }
      const delta = readString(event.data.delta);
      item.reasoning = item.reasoning ? `${item.reasoning}${delta}` : delta;
    }
  }

  return {
    title: planTitle || (items.size > 0 ? 'Sage Plan' : ''),
    summary: planSummary,
    items: Array.from(items.values()).sort((left, right) => {
      if (left.index !== right.index) {
        return left.index - right.index;
      }
      return left.seq - right.seq;
    }),
  };
}

function buildToolCards(events: TraceEvent[]) {
  const cards = new Map<string, ToolCardView>();

  for (const event of events) {
    const toolCallId = readString(event.tool_call_id);
    if (!toolCallId) {
      continue;
    }
    const existing = cards.get(toolCallId) ?? {
      id: toolCallId,
      seq: event.seq,
      toolCallId,
      itemId: readString(event.item_id) || null,
      toolName: 'Tool',
      capabilityId: '',
      connectorId: '',
      argsPreview: {},
      progressMessages: [],
      queries: [],
      results: [],
      browserActions: [],
      screenshots: [],
      resultStatus: '',
      resultSummary: '',
      artifactIds: [],
    };
    if (event.seq < existing.seq) {
      existing.seq = event.seq;
    }
    if (event.event_type === 'tool.started') {
      existing.toolName = readString(event.data.tool_name, existing.toolName);
      existing.capabilityId = readString(event.data.capability_id, existing.capabilityId);
      existing.connectorId = readString(event.data.connector_id, existing.connectorId);
      existing.argsPreview = readObject(event.data.args_preview);
    } else if (event.event_type === 'tool.progress') {
      const message = readString(event.data.message);
      if (message) {
        existing.progressMessages.push(message);
      }
    } else if (event.event_type === 'search.query') {
      existing.queries.push({
        provider: readString(event.data.provider, 'web'),
        query: readString(event.data.query, 'search'),
        filters: readObject(event.data.filters),
      });
    } else if (event.event_type === 'search.results') {
      existing.results.push(...readArray(event.data.results).map((item) => readObject(item)));
    } else if (event.event_type === 'browser.action') {
      existing.browserActions.push({
        action: readString(event.data.action, 'action'),
        targetSummary: readString(event.data.target_summary, 'Browser action'),
        url: readString(event.data.url) || null,
      });
    } else if (event.event_type === 'browser.screenshot') {
      existing.screenshots.push({
        artifactId: readString(event.artifact_id) || null,
        caption: readString(event.data.caption, 'Screenshot'),
        width: readNumber(event.data.width),
        height: readNumber(event.data.height),
      });
    } else if (event.event_type === 'tool.result') {
      existing.resultStatus = readString(event.data.status, existing.resultStatus);
      existing.resultSummary = readString(event.data.summary, existing.resultSummary);
      existing.artifactIds = readArray(event.data.artifact_ids)
        .map((item) => readString(item))
        .filter(Boolean);
    }
    cards.set(toolCallId, existing);
  }

  return Array.from(cards.values()).sort((left, right) => left.seq - right.seq);
}

function buildDelegationCards(events: TraceEvent[]) {
  const cards = new Map<string, DelegationCardView>();

  for (const event of events) {
    const childRunId = readString(event.child_run_id);
    if (!childRunId) {
      continue;
    }
    const existing = cards.get(childRunId) ?? {
      id: childRunId,
      seq: event.seq,
      childRunId,
      itemId: readString(event.item_id) || null,
      specialistId: '',
      specialistName: 'Specialist',
      taskSummary: '',
      status: 'running',
      resultSummary: '',
    };
    if (event.seq < existing.seq) {
      existing.seq = event.seq;
    }
    if (event.event_type === 'delegation.started') {
      existing.specialistId = readString(event.data.specialist_id, existing.specialistId);
      existing.specialistName = readString(event.data.specialist_name, existing.specialistName);
      existing.taskSummary = readString(event.data.task_summary, existing.taskSummary);
      existing.status = 'running';
    } else if (event.event_type === 'delegation.finished') {
      existing.status = readString(event.data.status, existing.status || 'completed');
      existing.resultSummary = readString(event.data.result_summary, existing.resultSummary);
    }
    cards.set(childRunId, existing);
  }

  return Array.from(cards.values()).sort((left, right) => left.seq - right.seq);
}

function EventMetaLine({ timestamp }: { timestamp: string | null }) {
  if (!timestamp) {
    return null;
  }
  return (
    <div style={{ color: 'var(--app-text-tertiary)', fontSize: '0.74rem' }}>
      {timestamp}
    </div>
  );
}

export function SageTraceView({
  traceId = null,
  mode,
  liveTransport = 'trace-stream',
  initialTrace = null,
  initialEvents = null,
  additiveEvents = null,
  className,
}: SageTraceViewProps) {
  const services = useWorkspaceServices();
  const [trace, setTrace] = useState<WorkstationAgentTraceRecord | null>(initialTrace);
  const [events, setEvents] = useState<TraceEvent[]>(() => mergeTraceEvents([], initialEvents));
  const [isLoading, setIsLoading] = useState(mode === 'replay' && !initialTrace && (!initialEvents || initialEvents.length === 0));
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'open' | 'complete' | 'error'>(
    mode === 'live'
      ? (liveTransport === 'trace-stream' && traceId ? 'connecting' : 'open')
      : 'idle',
  );
  const [isExpanded, setIsExpanded] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; caption: string } | null>(null);
  const autoCollapsedRef = useRef(false);

  useEffect(() => {
    if (initialTrace) {
      setTrace(initialTrace);
    }
  }, [initialTrace]);

  useEffect(() => {
    if (!initialEvents || initialEvents.length === 0) {
      return;
    }
    setEvents((current) => mergeTraceEvents(current, initialEvents));
  }, [initialEvents]);

  useEffect(() => {
    if (!additiveEvents || additiveEvents.length === 0) {
      return;
    }
    setEvents((current) => mergeTraceEvents(current, additiveEvents));
  }, [additiveEvents]);

  useEffect(() => {
    if (mode !== 'replay' || !traceId || initialTrace) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void services.client.getTraceReplay({ traceId, allowMissing: true })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const replay = payload as WorkstationAgentTraceReplayPayload | null;
        setTrace(replay?.trace ?? null);
        setEvents((current) => mergeTraceEvents(current, replay?.events));
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Trace replay is unavailable.');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialTrace, mode, services.client, traceId]);

  useEffect(() => {
    if (mode !== 'live') {
      setConnectionState('idle');
      return;
    }
    if (liveTransport === 'external') {
      setConnectionState('open');
      return;
    }
    if (!traceId) {
      return;
    }
    const source = services.client.openTraceStream(traceId);
    let terminalSeen = false;
    setConnectionState('connecting');
    setError(null);

    source.onopen = () => {
      setConnectionState('open');
    };

    source.addEventListener('trace', (event) => {
      try {
        const payload = JSON.parse(String((event as MessageEvent).data ?? '{}')) as WorkstationAgentTraceEvent;
        const incoming = normalizeTraceEvent(payload, 0);
        if (!incoming) {
          return;
        }
        setEvents((current) => mergeTraceEvents(current, [incoming]));
        setTrace((current) => (
          current
            ? current
            : {
                id: incoming.trace_id ?? traceId,
                workspace_id: services.client.scope.workspaceId,
                root_agent_id: incoming.agent_id ?? null,
              }
        ));
        if (isTerminalEvent(incoming.event_type)) {
          terminalSeen = true;
          setConnectionState('complete');
          source.close();
        }
      } catch {
        setError('Trace stream payload could not be parsed.');
      }
    });

    source.onerror = () => {
      if (!terminalSeen) {
        setConnectionState('error');
      }
    };

    return () => {
      source.close();
    };
  }, [liveTransport, mode, services.client, traceId]);

  useEffect(() => {
    if (mode !== 'live' || liveTransport !== 'external') {
      return;
    }
    const hasTerminal = events.some((event) => isTerminalEvent(event.event_type));
    setConnectionState(hasTerminal ? 'complete' : 'open');
  }, [events, liveTransport, mode]);

  const rootAgentId = useMemo(() => {
    const traceRoot = readString(trace?.root_agent_id);
    if (traceRoot) {
      return traceRoot;
    }
    return readString(events[0]?.agent_id) || null;
  }, [events, trace]);

  const visibleEvents = useMemo(
    () => events.filter((event) => shouldRenderEvent(rootAgentId, event.event_type)),
    [events, rootAgentId],
  );

  const routedEvent = useMemo(
    () => visibleEvents.find((event) => event.event_type === 'trace.routed') ?? null,
    [visibleEvents],
  );

  const terminalEvent = useMemo(
    () => [...visibleEvents].reverse().find((event) => isTerminalEvent(event.event_type)) ?? null,
    [visibleEvents],
  );

  useEffect(() => {
    if (!terminalEvent || autoCollapsedRef.current) {
      return;
    }
    setIsExpanded(false);
    autoCollapsedRef.current = true;
  }, [terminalEvent]);

  const planModel = useMemo(() => buildPlanModel(visibleEvents), [visibleEvents]);
  const toolCards = useMemo(() => buildToolCards(visibleEvents), [visibleEvents]);
  const delegationCards = useMemo(() => buildDelegationCards(visibleEvents), [visibleEvents]);

  const approvalEvents = useMemo(
    () => visibleEvents.filter((event) => event.event_type === 'approval.requested' || event.event_type === 'approval.resolved'),
    [visibleEvents],
  );

  const artifactEvents = useMemo(
    () => visibleEvents.filter((event) => event.event_type === 'artifact.created'),
    [visibleEvents],
  );

  const failureEvent = useMemo(
    () => visibleEvents.find((event) => event.event_type === 'trace.failed') ?? null,
    [visibleEvents],
  );

  const completedEvent = useMemo(
    () => visibleEvents.find((event) => event.event_type === 'trace.completed') ?? null,
    [visibleEvents],
  );

  const summary = useMemo(() => ({
    stepCount: planModel.items.length + toolCards.length + delegationCards.length + approvalEvents.length + artifactEvents.length,
    toolCount: toolCards.length,
    duration: completedEvent ? formatDuration(completedEvent.data.duration_ms) : null,
    outcome: completedEvent
      ? readString(completedEvent.data.outcome, 'success')
      : failureEvent
        ? 'failed'
        : readString(trace?.outcome, mode === 'live' ? 'running' : 'replay'),
  }), [approvalEvents.length, artifactEvents.length, completedEvent, delegationCards.length, failureEvent, mode, planModel.items.length, toolCards.length, trace?.outcome]);

  const connectionBadge = mode === 'live'
    ? (
      <DataBadge tone={connectionState === 'open' ? 'accent' : connectionState === 'complete' ? 'success' : connectionState === 'error' ? 'danger' : 'neutral'}>
        {connectionState}
      </DataBadge>
    )
    : <DataBadge tone="neutral">replay</DataBadge>;

  const traceLabel = summarizeRootAgent(rootAgentId);

  const summaryStrip = (
    <div
      data-sage-trace-summary="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        flexWrap: 'wrap',
        padding: '0.8rem 0.9rem',
        borderRadius: '1rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
        <DataBadge tone={badgeToneForStatus(summary.outcome)}>{summary.outcome}</DataBadge>
        <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem' }}>
          {summary.stepCount} steps
        </span>
        <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem' }}>
          {summary.toolCount} tools
        </span>
        {summary.duration ? (
          <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem' }}>
            {summary.duration}
          </span>
        ) : null}
      </div>
      {terminalEvent ? (
        <AppButton
          type="button"
          tone="secondary"
          onClick={() => {
            setIsExpanded((value) => !value);
          }}
        >
          {isExpanded ? 'Collapse trace' : 'View full trace'}
        </AppButton>
      ) : null}
    </div>
  );

  return (
    <>
      <AppSurfaceCard
        title={traceLabel}
        description={traceId ? `Trace ${traceId}` : 'Live execution trace'}
        actions={connectionBadge}
        className={className}
        data-sage-trace-view="true"
        data-sage-trace-mode={mode}
        data-sage-trace-root-agent={rootAgentId ?? 'unknown'}
      >
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {routedEvent ? (
            <div
              data-sage-trace-routed="true"
              style={{
                display: 'flex',
                gap: '0.45rem',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <DataBadge tone="accent">{readString(routedEvent.data.runtime_target, readString(trace?.runtime_target, 'runtime'))}</DataBadge>
              <DataBadge tone="neutral">{readString(routedEvent.data.provider, readString(trace?.provider, 'provider'))}</DataBadge>
              <DataBadge tone="neutral">{readString(routedEvent.data.model, readString(trace?.model, 'model'))}</DataBadge>
            </div>
          ) : null}

          {summaryStrip}

          {error ? (
            <AppNotice tone="danger">{error}</AppNotice>
          ) : null}

          {isLoading ? (
            <AppNotice>Loading trace replay.</AppNotice>
          ) : null}

          {!isLoading && visibleEvents.length === 0 ? (
            <AppEmptyState
              title="No trace events yet"
              body="As execution work is recorded, the live or replay trace will populate here."
            />
          ) : null}

          {isExpanded ? (
            <div style={{ display: 'grid', gap: '0.95rem' }}>
              {planModel.items.length > 0 ? (
                <section
                  data-sage-trace-plan="true"
                  style={{
                    display: 'grid',
                    gap: '0.7rem',
                    padding: '0.9rem',
                    borderRadius: '1rem',
                    border: '1px solid var(--app-border-subtle)',
                    background: 'color-mix(in srgb, var(--app-bg-panel) 84%, var(--app-bg-overlay) 16%)',
                  }}
                >
                  <div style={{ display: 'grid', gap: '0.18rem' }}>
                    <strong style={{ color: 'var(--app-text-primary)' }}>{planModel.title || 'Sage Plan'}</strong>
                    {planModel.summary ? (
                      <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                        {planModel.summary}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {planModel.items.map((item) => (
                      <article
                        key={item.id}
                        data-sage-trace-plan-item={item.id}
                        style={{
                          display: 'grid',
                          gap: '0.45rem',
                          padding: '0.8rem 0.85rem',
                          borderRadius: '0.95rem',
                          border: '1px solid var(--app-border-subtle)',
                          background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <strong style={{ color: 'var(--app-text-primary)' }}>
                            {item.index}. {item.title}
                          </strong>
                          <DataBadge tone="neutral">{kindLabel(item.kind)}</DataBadge>
                          <DataBadge tone="accent">{planOwnerLabel(item.owner)}</DataBadge>
                          <DataBadge tone={badgeToneForStatus(item.status)}>{item.status}</DataBadge>
                        </div>
                        {item.rationale ? (
                          <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                            {item.rationale}
                          </div>
                        ) : null}
                        {item.summary ? (
                          <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                            {item.summary}
                          </div>
                        ) : null}
                        {item.reasoning ? (
                          <details data-sage-trace-reasoning={item.id}>
                            <summary style={{ cursor: 'pointer', color: 'var(--app-text-tertiary)', fontSize: '0.8rem' }}>
                              Why this step
                            </summary>
                            <div style={{ marginTop: '0.45rem', color: 'var(--app-text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                              {item.reasoning}
                            </div>
                          </details>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {toolCards.map((tool) => (
                <article
                  key={tool.id}
                  data-sage-trace-tool-card={tool.toolCallId}
                  style={{
                    display: 'grid',
                    gap: '0.6rem',
                    padding: '0.9rem',
                    borderRadius: '1rem',
                    border: '1px solid var(--app-border-subtle)',
                    background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 80%, var(--app-bg-overlay) 20%)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--app-text-primary)' }}>{tool.toolName}</strong>
                    <DataBadge tone={tool.resultStatus ? badgeToneForStatus(tool.resultStatus) : 'accent'}>
                      {tool.resultStatus || 'running'}
                    </DataBadge>
                    {tool.connectorId ? <DataBadge tone="neutral">{tool.connectorId}</DataBadge> : null}
                  </div>
                  {Object.keys(tool.argsPreview).length > 0 ? (
                    <details>
                      <summary style={{ cursor: 'pointer', color: 'var(--app-text-tertiary)', fontSize: '0.8rem' }}>
                        Tool arguments
                      </summary>
                      <pre
                        style={{
                          margin: '0.45rem 0 0',
                          padding: '0.7rem',
                          overflowX: 'auto',
                          borderRadius: '0.85rem',
                          background: 'color-mix(in srgb, var(--app-bg-canvas) 84%, var(--app-bg-overlay) 16%)',
                          color: 'var(--app-text-secondary)',
                          fontSize: '0.78rem',
                        }}
                      >
                        {JSON.stringify(tool.argsPreview, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  {tool.progressMessages.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.28rem' }}>
                      {tool.progressMessages.map((message, index) => (
                        <span key={`${tool.id}:progress:${index}`} style={{ color: 'var(--app-text-secondary)', fontSize: '0.82rem' }}>
                          {message}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {tool.queries.map((query, index) => (
                    <div key={`${tool.id}:query:${index}`} style={{ display: 'grid', gap: '0.35rem' }}>
                      <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem' }}>
                        Searching: <strong style={{ color: 'var(--app-text-primary)' }}>{query.query}</strong>
                      </div>
                      {tool.results.length > 0 && index === tool.queries.length - 1 ? (
                        <details>
                          <summary style={{ cursor: 'pointer', color: 'var(--app-text-tertiary)', fontSize: '0.8rem' }}>
                            Sources ({Math.min(tool.results.length, 5)})
                          </summary>
                          <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.45rem' }}>
                            {tool.results.slice(0, 5).map((result, resultIndex) => (
                              <article
                                key={`${tool.id}:result:${resultIndex}`}
                                style={{
                                  display: 'grid',
                                  gap: '0.18rem',
                                  padding: '0.65rem 0.7rem',
                                  borderRadius: '0.85rem',
                                  border: '1px solid var(--app-border-subtle)',
                                  background: 'color-mix(in srgb, var(--app-bg-panel) 84%, var(--app-bg-overlay) 16%)',
                                }}
                              >
                                <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.82rem' }}>
                                  {readString(result.title, `Source ${resultIndex + 1}`)}
                                </strong>
                                {readString(result.url) ? (
                                  <a
                                    href={readString(result.url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: 'var(--app-accent)', fontSize: '0.78rem', overflowWrap: 'anywhere' }}
                                  >
                                    {readString(result.url)}
                                  </a>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ))}
                  {tool.browserActions.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      {tool.browserActions.map((action, index) => (
                        <div key={`${tool.id}:action:${index}`} style={{ color: 'var(--app-text-secondary)', fontSize: '0.82rem' }}>
                          {action.action}: {action.targetSummary}
                          {action.url ? ` (${action.url})` : ''}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {tool.screenshots.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
                      {tool.screenshots.map((shot, index) => {
                        const src = shot.artifactId ? services.client.artifactFileUrl(shot.artifactId) : '';
                        return (
                          <button
                            key={`${tool.id}:shot:${index}`}
                            type="button"
                            onClick={() => {
                              if (src) {
                                setLightboxImage({ src, caption: shot.caption });
                              }
                            }}
                            style={{
                              display: 'grid',
                              gap: '0.35rem',
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              textAlign: 'left',
                              cursor: src ? 'pointer' : 'default',
                            }}
                          >
                            <div
                              style={{
                                width: '9rem',
                                height: '5.8rem',
                                overflow: 'hidden',
                                borderRadius: '0.9rem',
                                border: '1px solid var(--app-border-subtle)',
                                background: 'color-mix(in srgb, var(--app-bg-canvas) 86%, var(--app-bg-overlay) 14%)',
                              }}
                            >
                              {src ? (
                                <img
                                  src={src}
                                  alt={shot.caption || 'Browser screenshot'}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : null}
                            </div>
                            <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.78rem' }}>
                              {shot.caption || 'Screenshot'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {tool.resultSummary ? (
                    <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                      {tool.resultSummary}
                    </div>
                  ) : null}
                  {tool.artifactIds.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      {tool.artifactIds.map((artifactId) => (
                        <a
                          key={artifactId}
                          href={services.client.artifactFileUrl(artifactId)}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: '1.45rem',
                            padding: '0.12rem 0.45rem',
                            borderRadius: '999px',
                            border: '1px solid var(--app-border-subtle)',
                            background: 'color-mix(in srgb, var(--app-bg-panel) 84%, var(--app-bg-overlay) 16%)',
                            color: 'var(--app-text-secondary)',
                            fontSize: '0.76rem',
                            textDecoration: 'none',
                          }}
                        >
                          Artifact {artifactId}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}

              {delegationCards.map((delegation) => (
                <article
                  key={delegation.id}
                  data-sage-trace-delegation-card={delegation.childRunId}
                  style={{
                    display: 'grid',
                    gap: '0.45rem',
                    padding: '0.9rem',
                    borderRadius: '1rem',
                    border: '1px solid var(--app-border-subtle)',
                    background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 80%, var(--app-bg-overlay) 20%)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--app-text-primary)' }}>{delegation.specialistName}</strong>
                    <DataBadge tone={badgeToneForStatus(delegation.status)}>{delegation.status}</DataBadge>
                  </div>
                  {delegation.taskSummary ? (
                    <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                      {delegation.taskSummary}
                    </div>
                  ) : null}
                  {delegation.resultSummary ? (
                    <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                      {delegation.resultSummary}
                    </div>
                  ) : null}
                </article>
              ))}

              {approvalEvents.map((event) => (
                <article
                  key={event.id}
                  data-sage-trace-approval-card={event.approval_id ?? event.id}
                  style={{
                    display: 'grid',
                    gap: '0.35rem',
                    padding: '0.9rem',
                    borderRadius: '1rem',
                    border: '1px solid color-mix(in srgb, var(--app-warning) 35%, var(--app-border-subtle) 65%)',
                    background: 'color-mix(in srgb, var(--app-warning) 8%, var(--app-bg-panel) 92%)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--app-text-primary)' }}>
                      {event.event_type === 'approval.requested' ? readString(event.data.title, 'Approval requested') : 'Approval resolved'}
                    </strong>
                    <DataBadge tone={event.event_type === 'approval.requested' ? 'warning' : badgeToneForStatus(readString(event.data.decision, 'resolved'))}>
                      {event.event_type === 'approval.requested' ? 'pending' : readString(event.data.decision, 'resolved')}
                    </DataBadge>
                  </div>
                  {readString(event.data.description || event.data.note) ? (
                    <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                      {readString(event.data.description || event.data.note)}
                    </div>
                  ) : null}
                  <EventMetaLine timestamp={formatTimestamp(event.ts)} />
                </article>
              ))}

              {artifactEvents.length > 0 ? (
                <section style={{ display: 'grid', gap: '0.5rem' }}>
                  <strong style={{ color: 'var(--app-text-primary)' }}>Artifacts</strong>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {artifactEvents.map((event) => (
                      <a
                        key={event.id}
                        href={event.artifact_id ? services.client.artifactFileUrl(event.artifact_id) : '#'}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          minHeight: '1.6rem',
                          padding: '0.14rem 0.5rem',
                          borderRadius: '999px',
                          border: '1px solid var(--app-border-subtle)',
                          background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
                          color: 'var(--app-text-secondary)',
                          fontSize: '0.76rem',
                          textDecoration: 'none',
                        }}
                      >
                        <span>{readString(event.data.kind, 'artifact')}</span>
                        <strong style={{ color: 'var(--app-text-primary)' }}>{readString(event.data.title, event.artifact_id ?? 'artifact')}</strong>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {failureEvent ? (
                <AppNotice tone="danger" data-sage-trace-failure="true">
                  {readString(failureEvent.data.message, 'Trace failed.')}
                  {readString(failureEvent.data.retryable).toLowerCase() === 'true' ? ' Retryable.' : ''}
                </AppNotice>
              ) : null}
            </div>
          ) : null}
        </div>
      </AppSurfaceCard>

      <Modal
        open={Boolean(lightboxImage)}
        title={lightboxImage?.caption || 'Screenshot'}
        description="Trace screenshot preview"
        onClose={() => {
          setLightboxImage(null);
        }}
        size="large"
      >
        {lightboxImage ? (
          <img
            src={lightboxImage.src}
            alt={lightboxImage.caption || 'Trace screenshot'}
            style={{
              width: '100%',
              maxHeight: '70vh',
              objectFit: 'contain',
              borderRadius: '0.9rem',
              border: '1px solid var(--app-border-subtle)',
              background: 'color-mix(in srgb, var(--app-bg-canvas) 88%, var(--app-bg-overlay) 12%)',
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
