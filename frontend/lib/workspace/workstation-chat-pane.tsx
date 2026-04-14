'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppButton, AppNotice } from '@/lib/ui/primitives';
import { ScrollRegion } from '@/lib/ui/scroll-region';
import { ChatComposer } from '@/lib/workspace/chat-composer';
import { ChatInlineStateCard } from '@/lib/workspace/chat-inline-state-card';
import {
  ChatMessage,
  type WorkstationChatArtifactReference,
  type WorkstationChatMessageRecord,
} from '@/lib/workspace/chat-message';
import { SageTraceView } from '@/lib/workspace/sage-trace-view';
import {
  resolveWorkstationApproval,
  subscribeWorkstationApprovalResolved,
} from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationClientError,
  type WorkstationAgentTraceEvent,
  type WorkstationAgentTraceRecord,
  type WorkstationSessionActor,
  type WorkstationTurnResponse,
} from '@/lib/workspace/workstation-client';

type CanonicalChatThreadState = {
  threadId: string;
  title: string;
  messages: WorkstationChatMessageRecord[];
};

type CanonicalRunSummary = Record<string, unknown> & {
  run_id?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type CanonicalApprovalSummary = Record<string, unknown> & {
  approval_id?: string | null;
  id?: string | null;
  status?: string | null;
  prompt?: string | null;
};

type LiveTraceTransport = 'external' | 'trace-stream';

type LiveTraceState = {
  traceId: string | null;
  transport: LiveTraceTransport;
  trace: WorkstationAgentTraceRecord | null;
  events: WorkstationAgentTraceEvent[];
};

const PRIMARY_THREAD_ID = 'primary';
const ACTIVE_THREAD_QUERY_KEY = 'chat:canonical:active-thread';
const RUNS_QUERY_KEY = 'chat:canonical:runs';
const APPROVALS_QUERY_KEY = 'chat:canonical:approvals';

function threadQueryKey(threadId: string): string {
  return `chat:canonical:thread:${threadId}`;
}

function normalizeArtifactReferences(metadata: Record<string, unknown>): WorkstationChatArtifactReference[] {
  const candidates: WorkstationChatArtifactReference[] = [];
  const pushArtifact = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      candidates.push({
        id: value.trim(),
        label: value.trim(),
      });
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    const id = String(record.artifact_id ?? record.id ?? '').trim();
    if (!id) {
      return;
    }

    candidates.push({
      id,
      label: String(record.label ?? record.file_name ?? id),
      kind: typeof record.kind === 'string' ? record.kind : null,
      mediaType: typeof record.media_type === 'string' ? record.media_type : null,
    });
  };

  const maybeCollections = [
    metadata.artifacts,
    metadata.generated_artifacts,
    metadata.outputs,
    metadata.attachments,
  ];

  for (const collection of maybeCollections) {
    if (Array.isArray(collection)) {
      for (const item of collection) {
        pushArtifact(item);
      }
    }
  }

  if (Array.isArray(metadata.artifact_ids)) {
    for (const artifactId of metadata.artifact_ids) {
      pushArtifact(artifactId);
    }
  }

  const seen = new Set<string>();
  return candidates.filter((artifact) => {
    if (seen.has(artifact.id)) {
      return false;
    }
    seen.add(artifact.id);
    return true;
  });
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function traceEventKey(event: WorkstationAgentTraceEvent, index: number): string {
  const explicit = readString(event.id);
  if (explicit) {
    return explicit;
  }
  const traceId = readString(event.trace_id) || 'trace';
  const seq = readNumber(event.seq, index + 1);
  const eventType = readString(event.event_type) || 'trace.event';
  return `${traceId}:${seq}:${eventType}:${index}`;
}

function mergeTraceEvents(
  current: WorkstationAgentTraceEvent[],
  incoming: WorkstationAgentTraceEvent[],
): WorkstationAgentTraceEvent[] {
  const next = new Map<string, WorkstationAgentTraceEvent>();
  current.forEach((event, index) => {
    next.set(traceEventKey(event, index), event);
  });
  incoming.forEach((event, index) => {
    next.set(traceEventKey(event, current.length + index), event);
  });
  return Array.from(next.values()).sort((left, right) => {
    const leftSeq = readNumber(left.seq, 0);
    const rightSeq = readNumber(right.seq, 0);
    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }
    return traceEventKey(left, 0).localeCompare(traceEventKey(right, 0));
  });
}

function isTerminalTraceEvent(eventType: string): boolean {
  return eventType === 'trace.completed' || eventType === 'trace.failed';
}

function normalizeTraceStreamEvent(payload: Record<string, unknown>): WorkstationAgentTraceEvent | null {
  const eventType = readString(payload.event_type);
  if (!eventType) {
    return null;
  }
  return {
    id: readString(payload.id) || null,
    trace_id: readString(payload.trace_id) || null,
    seq: readNumber(payload.seq, 0),
    ts: readString(payload.ts) || null,
    event_type: eventType,
    persisted: Boolean(payload.persisted),
    agent_id: readString(payload.agent_id) || null,
    parent_id: readString(payload.parent_id) || null,
    item_id: readString(payload.item_id) || null,
    tool_call_id: readString(payload.tool_call_id) || null,
    child_run_id: readString(payload.child_run_id) || null,
    approval_id: readString(payload.approval_id) || null,
    artifact_id: readString(payload.artifact_id) || null,
    data: readObject(payload.data),
  };
}

function buildLiveTraceRecord({
  traceId,
  workspaceId,
  threadId,
  rootAgentId,
}: {
  traceId: string | null;
  workspaceId: string;
  threadId: string;
  rootAgentId?: string | null;
}): WorkstationAgentTraceRecord {
  return {
    id: traceId,
    workspace_id: workspaceId,
    thread_id: threadId,
    root_agent_id: readString(rootAgentId) || 'sage',
    surface: 'web',
  };
}

function normalizeCanonicalChatThread(
  payload: unknown,
  threadId: string,
): CanonicalChatThreadState {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const turns = Array.isArray(record.turns) ? record.turns : [];
  const messages = turns.flatMap((turn, index): WorkstationChatMessageRecord[] => {
    if (!turn || typeof turn !== 'object') {
      return [];
    }

    const entry = turn as Record<string, unknown>;
    const metadata =
      entry.metadata && typeof entry.metadata === 'object'
        ? entry.metadata as Record<string, unknown>
        : {};

    return [{
      id: String(entry.id ?? `${threadId}:message:${index}`),
      role: String(entry.role ?? 'assistant'),
      content: String(entry.content ?? ''),
      status: typeof entry.status === 'string' ? entry.status : null,
      createdAt: typeof entry.created_at === 'string' ? entry.created_at : null,
      runId: typeof entry.run_id === 'string' ? entry.run_id : null,
      approvals: Array.isArray(entry.approvals) ? entry.approvals as Record<string, unknown>[] : [],
      interventions: Array.isArray(entry.interventions) ? entry.interventions as Record<string, unknown>[] : [],
      artifacts: normalizeArtifactReferences(metadata),
      metadata,
    }];
  });

  return {
    threadId: String(record.id ?? record.thread_id ?? threadId),
    title: String(record.title ?? 'Chat'),
    messages,
  };
}

function normalizeCanonicalRunItems(payload: unknown): CanonicalRunSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is CanonicalRunSummary => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeCanonicalApprovalItems(payload: unknown): CanonicalApprovalSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is CanonicalApprovalSummary => Boolean(item) && typeof item === 'object')
    : [];
}

function createCanonicalAssistantMessage(
  response: WorkstationTurnResponse,
  threadId: string,
): WorkstationChatMessageRecord | null {
  const reply = String(response.reply ?? '').trim();
  const approvals = Array.isArray(response.approvals) ? response.approvals : [];
  const interventions = Array.isArray(response.interventions) ? response.interventions : [];
  const runId = typeof response.run_id === 'string' ? response.run_id : null;
  const metadata =
    response.metadata && typeof response.metadata === 'object'
      ? response.metadata as Record<string, unknown>
      : {};
  const synthesizedReply = reply
    || (approvals.length > 0
      ? 'Approval is required before this run can continue.'
      : interventions.length > 0
        ? 'Execution needs operator intervention before it can continue.'
        : runId
          ? 'Run accepted. Execution has started.'
          : `Turn ${String(response.status ?? 'completed')}.`);

  if (!synthesizedReply.trim()) {
    return null;
  }

  return {
    id: `${threadId}:assistant:${Date.now()}`,
    role: 'assistant',
    content: synthesizedReply,
    status: typeof response.status === 'string' ? response.status : 'completed',
    createdAt: new Date().toISOString(),
    runId,
    approvals,
    interventions,
    artifacts: normalizeArtifactReferences(metadata),
    metadata,
  };
}

function createCanonicalUserMessage(text: string, threadId: string): WorkstationChatMessageRecord {
  return {
    id: `${threadId}:user:${Date.now()}`,
    role: 'user',
    content: text,
    status: 'completed',
    createdAt: new Date().toISOString(),
    runId: null,
    approvals: [],
    interventions: [],
    artifacts: [],
    metadata: {},
  };
}

function createStreamingAssistantMessage(
  text: string,
  threadId: string,
  traceId: string | null,
): WorkstationChatMessageRecord | null {
  if (!text) {
    return null;
  }

  return {
    id: `${threadId}:assistant:streaming`,
    role: 'assistant',
    content: text,
    status: 'streaming',
    createdAt: new Date().toISOString(),
    runId: null,
    approvals: [],
    interventions: [],
    artifacts: [],
    metadata: traceId ? { trace_id: traceId } : {},
  };
}

function summarizeRuns(runs: CanonicalRunSummary[]): string {
  if (runs.length === 0) {
    return 'No active runs yet';
  }
  const latest = runs[0];
  return `${runs.length} tracked · latest ${String(latest.status ?? 'unknown')}`;
}

function summarizeApprovals(approvals: CanonicalApprovalSummary[]): string {
  if (approvals.length === 0) {
    return 'No pending approvals';
  }
  return `${approvals.length} awaiting action`;
}

export function WorkstationChatPane() {
  const { bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const actor = useMemo<WorkstationSessionActor>(() => ({
    type: 'user',
    id: bootstrap.account.id,
    display_name: bootstrap.account.displayName ?? bootstrap.account.email,
  }), [bootstrap.account.displayName, bootstrap.account.email, bootstrap.account.id]);

  const [activeThreadId, setActiveThreadId] = useState<string>(() =>
    services.queryClient.peek<string>(ACTIVE_THREAD_QUERY_KEY) ?? PRIMARY_THREAD_ID,
  );
  const [thread, setThread] = useState<CanonicalChatThreadState>(() =>
    services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(activeThreadId)) ?? {
      threadId: activeThreadId,
      title: 'Chat',
      messages: [],
    },
  );
  const [draft, setDraft] = useState('');
  const [runs, setRuns] = useState<CanonicalRunSummary[]>(
    () => services.queryClient.peek<CanonicalRunSummary[]>(RUNS_QUERY_KEY) ?? [],
  );
  const [approvals, setApprovals] = useState<CanonicalApprovalSummary[]>(
    () => services.queryClient.peek<CanonicalApprovalSummary[]>(APPROVALS_QUERY_KEY) ?? [],
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<WorkstationChatMessageRecord | null>(null);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const [liveTrace, setLiveTrace] = useState<LiveTraceState | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isWideViewport, setIsWideViewport] = useState(false);

  const writeThreadState = (nextThread: CanonicalChatThreadState) => {
    services.queryClient.set(threadQueryKey(nextThread.threadId), nextThread);
    services.queryClient.set(ACTIVE_THREAD_QUERY_KEY, nextThread.threadId);
    setActiveThreadId(nextThread.threadId);
    setThread(nextThread);
  };

  const writeOverview = ({
    nextRuns,
    nextApprovals,
  }: {
    nextRuns: CanonicalRunSummary[];
    nextApprovals: CanonicalApprovalSummary[];
  }) => {
    services.queryClient.set(RUNS_QUERY_KEY, nextRuns);
    services.queryClient.set(APPROVALS_QUERY_KEY, nextApprovals);
    setRuns(nextRuns);
    setApprovals(nextApprovals);
  };

  const loadThread = async (requestedThreadId = activeThreadId) => {
    const payload = await services.client.getThread({
      threadId: requestedThreadId,
      allowMissing: true,
    });
    const nextThread = normalizeCanonicalChatThread(payload, requestedThreadId);
    writeThreadState(nextThread);
    return nextThread;
  };

  const loadOverview = async () => {
    const runsRequest = services.client.listRuns({
      limit: 12,
    }).then(normalizeCanonicalRunItems);
    const approvalsRequest = services.client.listApprovals({
      limit: 24,
    }).then(normalizeCanonicalApprovalItems);

    const [nextRuns, nextApprovals] = await Promise.all([runsRequest, approvalsRequest]);
    writeOverview({ nextRuns, nextApprovals });
  };

  const refreshCanonicalState = async (requestedThreadId = activeThreadId) => {
    const [nextThread] = await Promise.all([
      loadThread(requestedThreadId),
      loadOverview(),
    ]);
    return nextThread;
  };

  const handleResolveApproval = async (approvalId: string, resolution: 'approved' | 'rejected') => {
    if (!approvalId || resolvingApprovalId) {
      return;
    }
    setResolvingApprovalId(approvalId);
    setStatusMessage(null);
    try {
      await resolveWorkstationApproval(services.client, {
        approvalId,
        resolution,
      });
      services.streams.touchActivity();
    } catch (error) {
      setStatusMessage(
        error instanceof WorkstationClientError || error instanceof Error
          ? error.message
          : 'Approval resolution failed.',
      );
    } finally {
      setResolvingApprovalId(null);
    }
  };

  useEffect(() => {
    const cachedThread = services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(activeThreadId));
    if (cachedThread) {
      setThread(cachedThread);
    }
  }, [activeThreadId, services]);

  useEffect(() => subscribeWorkstationApprovalResolved((detail) => {
    void refreshCanonicalState(activeThreadId)
      .then(() => {
        setStatusMessage(detail.message);
      })
      .catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : detail.message);
      });
  }), [activeThreadId]);

  useEffect(() => {
    if (streamState.activity.version === 0) {
      return;
    }
    void refreshCanonicalState(activeThreadId).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : 'Chat refresh failed.');
    });
  }, [activeThreadId, streamState.activity.version]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        await refreshCanonicalState(activeThreadId);
        if (!cancelled) {
          setStatusMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : 'Chat is unavailable right now.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, bootstrap.workspace.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const wideQuery = window.matchMedia('(min-width: 1200px)');

    const updateViewport = () => {
      setIsMobileViewport(mobileQuery.matches);
      setIsWideViewport(wideQuery.matches);
    };

    updateViewport();

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', updateViewport);
      wideQuery.addEventListener('change', updateViewport);
      return () => {
        mobileQuery.removeEventListener('change', updateViewport);
        wideQuery.removeEventListener('change', updateViewport);
      };
    }

    mobileQuery.addListener(updateViewport);
    wideQuery.addListener(updateViewport);
    return () => {
      mobileQuery.removeListener(updateViewport);
      wideQuery.removeListener(updateViewport);
    };
  }, []);

  const streamingAssistantMessage = useMemo(
    () => createStreamingAssistantMessage(
      streamingAssistantText,
      liveTrace?.trace?.thread_id && readString(liveTrace.trace.thread_id)
        ? String(liveTrace.trace.thread_id)
        : activeThreadId,
      liveTrace?.traceId ?? null,
    ),
    [activeThreadId, liveTrace?.trace?.thread_id, liveTrace?.traceId, streamingAssistantText],
  );

  const showTrace = Boolean(liveTrace) && !isMobileViewport && isWideViewport;

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    const requestedThreadId = activeThreadId;
    const pendingMessage = createCanonicalUserMessage(message, requestedThreadId);
    setIsSending(true);
    setStatusMessage(null);
    setPendingUserMessage(pendingMessage);
    setStreamingAssistantText('');
    setLiveTrace(null);

    try {
      let observedTraceId: string | null = null;
      let observedThreadId = requestedThreadId;
      let terminalTraceSeen = false;
      const onTraceEvent = (traceEvent: WorkstationAgentTraceEvent) => {
        observedTraceId = readString(traceEvent.trace_id) || observedTraceId;
        terminalTraceSeen = terminalTraceSeen || isTerminalTraceEvent(readString(traceEvent.event_type));
        setLiveTrace((current) => {
          const nextEvents = mergeTraceEvents(current?.events ?? [], [traceEvent]);
          const traceId = readString(traceEvent.trace_id) || current?.traceId || observedTraceId;
          const currentTrace = current?.trace ?? buildLiveTraceRecord({
            traceId,
            workspaceId: bootstrap.workspace.id,
            threadId: observedThreadId,
            rootAgentId: readString(traceEvent.agent_id) || 'sage',
          });
          return {
            traceId,
            transport: current?.transport ?? 'external',
            trace: {
              ...currentTrace,
              id: traceId ?? currentTrace.id ?? null,
              thread_id: readString(currentTrace.thread_id) || observedThreadId,
              root_agent_id: readString(currentTrace.root_agent_id) || readString(traceEvent.agent_id) || 'sage',
            },
            events: nextEvents,
          };
        });
      };

      const { renewed, response } = await services.client.submitTurnStreamWithSessionRetry({
        actor,
        threadId: requestedThreadId,
        message,
        channel: 'web',
        source: 'workstation_chat_pane',
        onEvent: (event) => {
          if (event.event === 'trace') {
            const traceEvent = normalizeTraceStreamEvent(event.payload);
            if (traceEvent) {
              onTraceEvent(traceEvent);
            }
            return;
          }

          if (event.event === 'chunk') {
            const delta = readString(event.payload.delta);
            if (delta) {
              setStreamingAssistantText((current) => `${current}${delta}`);
            }
            return;
          }

          if (event.event === 'final') {
            const finalThreadId = readString(event.payload.thread_id);
            if (finalThreadId) {
              observedThreadId = finalThreadId;
            }
            const metadata = readObject(event.payload.metadata);
            const finalTraceId = readString(metadata.trace_id);
            if (finalTraceId) {
              observedTraceId = finalTraceId;
            }
          }
        },
      });

      const responseMetadata =
        response.metadata && typeof response.metadata === 'object'
          ? { ...(response.metadata as Record<string, unknown>) }
          : {};
      const traceId = readString(responseMetadata.trace_id) || observedTraceId;
      if (traceId) {
        responseMetadata.trace_id = traceId;
      }
      const normalizedResponse: WorkstationTurnResponse = {
        ...response,
        thread_id: String(response.thread_id ?? observedThreadId ?? requestedThreadId),
        metadata: responseMetadata,
      };
      const nextThreadId = String(normalizedResponse.thread_id ?? requestedThreadId);
      const optimisticUserMessage = createCanonicalUserMessage(message, nextThreadId);
      const nextMessages = [...thread.messages, optimisticUserMessage];
      const assistantMessage = createCanonicalAssistantMessage(normalizedResponse, nextThreadId);

      setLiveTrace((current) => {
        if (!traceId && !current) {
          return null;
        }
        const currentTrace = current?.trace ?? buildLiveTraceRecord({
          traceId,
          workspaceId: bootstrap.workspace.id,
          threadId: nextThreadId,
          rootAgentId: current?.trace?.root_agent_id ? String(current.trace.root_agent_id) : 'sage',
        });
        return {
          traceId,
          transport: normalizedResponse.run_id && traceId && !terminalTraceSeen ? 'trace-stream' : (current?.transport ?? 'external'),
          trace: {
            ...currentTrace,
            id: traceId ?? currentTrace.id ?? null,
            thread_id: nextThreadId,
          },
          events: current?.events ?? [],
        };
      });

      writeThreadState({
        ...thread,
        threadId: nextThreadId,
        messages: nextMessages,
      });
      setPendingUserMessage(null);
      setStreamingAssistantText('');
      setDraft('');
      services.streams.touchActivity();
      const canonicalThread = await refreshCanonicalState(nextThreadId)
        .catch(() => null);
      if (canonicalThread && canonicalThread.messages.length >= nextMessages.length) {
        writeThreadState(canonicalThread);
      } else if (assistantMessage) {
        writeThreadState({
          ...thread,
          threadId: nextThreadId,
          messages: [...nextMessages, assistantMessage],
        });
      }
      setStatusMessage(
        Array.isArray(normalizedResponse.approvals) && normalizedResponse.approvals.length > 0
          ? 'Turn submitted. Approval is now pending.'
          : Array.isArray(normalizedResponse.interventions) && normalizedResponse.interventions.length > 0
            ? 'Turn submitted. Intervention is required before execution can continue.'
            : renewed
              ? 'Turn submitted after renewing the scoped workstation session.'
              : null,
      );
    } catch (error) {
      setPendingUserMessage(null);
      setStreamingAssistantText('');
      setStatusMessage(
        error instanceof WorkstationClientError || error instanceof Error
          ? error.message
          : 'Could not send this message.',
      );
    } finally {
      setIsSending(false);
    }
  };

  const liveTraceView = liveTrace ? (
    <SageTraceView
      traceId={liveTrace.traceId}
      mode="live"
      liveTransport={liveTrace.transport === 'trace-stream' ? 'trace-stream' : 'external'}
      initialTrace={liveTrace.trace}
      initialEvents={liveTrace.transport === 'trace-stream' ? liveTrace.events : null}
      additiveEvents={liveTrace.transport === 'external' ? liveTrace.events : null}
    />
  ) : null;

  return (
    <main data-workstation-surface="chat" data-workstation-chat="pane" className="app-chat-page">
      <header className="app-chat-header">
        <div className="app-chat-header__copy">
          <span className="app-chat-header__kicker">Conversation</span>
          <h1 className="app-chat-header__title">{thread.title || bootstrap.workspace.label}</h1>
          <p className="app-chat-header__subtitle">
            Canonical thread state, approvals, runs, and generated outputs stay attached to the same conversation.
          </p>
        </div>

        <AppButton
          type="button"
          tone="secondary"
          onClick={() => {
            void refreshCanonicalState(activeThreadId).catch((error) => {
              setStatusMessage(error instanceof Error ? error.message : 'Refresh failed.');
            });
          }}
        >
          Refresh
        </AppButton>
      </header>

      <section className="app-chat-summary" aria-label="Conversation state">
        <span className="app-chat-pill">{thread.messages.length} messages</span>
        <span className="app-chat-pill">{summarizeRuns(runs)}</span>
        <span className="app-chat-pill">{summarizeApprovals(approvals)}</span>
        <span className="app-chat-pill">Activity {streamState.activity.connectionState}</span>
        <span className="app-chat-pill">Notifications {streamState.notifications.connectionState}</span>
      </section>

      {statusMessage ? (
        <AppNotice tone={/failed|unavailable|error/i.test(statusMessage) ? 'danger' : 'neutral'}>
          {statusMessage}
        </AppNotice>
      ) : null}

      <section className="app-chat-thread">
        <ScrollRegion className="app-chat-thread__scroll">
          <div className="app-chat-thread__body">
            {isLoading && thread.messages.length === 0 ? (
              <AppNotice>Loading canonical conversation history.</AppNotice>
            ) : null}

            {!isLoading && thread.messages.length === 0 && !pendingUserMessage ? (
              <section className="app-chat-empty">
                <strong className="app-chat-empty__title">No conversation yet</strong>
                <span className="app-chat-empty__body">
                  The first turn will create the canonical thread history and begin populating runs, approvals, and outputs.
                </span>
              </section>
            ) : null}

            {thread.messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                resolvingApprovalId={resolvingApprovalId}
                onResolveApproval={(approvalId, resolution) => {
                  void handleResolveApproval(approvalId, resolution);
                }}
              />
            ))}

            {pendingUserMessage ? (
              <ChatMessage
                key={pendingUserMessage.id}
                message={pendingUserMessage}
                resolvingApprovalId={resolvingApprovalId}
                onResolveApproval={(approvalId, resolution) => {
                  void handleResolveApproval(approvalId, resolution);
                }}
              />
            ) : null}

            {streamingAssistantMessage ? (
              <ChatMessage
                key={streamingAssistantMessage.id}
                message={streamingAssistantMessage}
                resolvingApprovalId={resolvingApprovalId}
                onResolveApproval={(approvalId, resolution) => {
                  void handleResolveApproval(approvalId, resolution);
                }}
              />
            ) : null}

            {showTrace && liveTraceView ? (
              <div className="app-chat-trace">
                {liveTraceView}
              </div>
            ) : null}
          </div>
        </ScrollRegion>
      </section>

      <ChatComposer
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={() => {
          void sendMessage();
        }}
        busy={isSending}
        disabled={isLoading}
        statusMessage={statusMessage}
      />
    </main>
  );
}
