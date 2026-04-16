'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import { FormField, FormGrid, FormInput, FormSection, FormTextarea } from '@/lib/ui/form-controls';
import { AppButton, AppNotice } from '@/lib/ui/primitives';
import { ScrollRegion } from '@/lib/ui/scroll-region';
import { ChatComposer } from '@/lib/workspace/chat-composer';
import { ChatInlineStateCard } from '@/lib/workspace/chat-inline-state-card';
import {
  ChatMessage,
  type WorkstationChatArtifactReference,
  type WorkstationChatMessageRecord,
} from '@/lib/workspace/chat-message';
import type { WorkspaceBootstrapRuntimeTarget } from '@/lib/workspace/workspace-bootstrap';
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
  type WorkstationSageMemoryRecord,
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

type SageMemoryCategoryRecord = {
  id: string;
  label: string;
  description: string;
  count: number;
};

type SageMemorySnapshot = {
  items: WorkstationSageMemoryRecord[];
  categories: SageMemoryCategoryRecord[];
  summary: Record<string, unknown>;
  updatedAt: string | null;
};

type RecentThreadSummary = {
  threadId: string;
  title: string;
  updatedAt: string | null;
};

type SageMemoryDraft = {
  entryId: string | null;
  category: string;
  title: string;
  content: string;
  pinned: boolean;
};

type RuntimeSummaryCard = {
  tone: 'neutral' | 'accent' | 'success' | 'warning';
  title: string;
  meta: string;
  body: string;
  preferredPill: string;
  localPill: string;
};

type SendFailureNotice = {
  message: string;
  retryable: boolean;
};

const PRIMARY_THREAD_ID = 'primary';
const ACTIVE_THREAD_QUERY_KEY = 'chat:canonical:active-thread';
const RUNS_QUERY_KEY = 'chat:canonical:runs';
const APPROVALS_QUERY_KEY = 'chat:canonical:approvals';
const SAGE_MEMORY_QUERY_KEY = 'chat:canonical:sage-memory';
const RECENT_THREADS_QUERY_KEY = 'chat:canonical:recent-threads';

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

function normalizeTimelineItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function deriveRecentThreads(
  timelineItems: Record<string, unknown>[],
  activeThreadId: string,
): RecentThreadSummary[] {
  const ordered = new Map<string, RecentThreadSummary>();

  if (activeThreadId.trim()) {
    ordered.set(activeThreadId, {
      threadId: activeThreadId,
      title: activeThreadId === PRIMARY_THREAD_ID ? 'Primary thread' : activeThreadId,
      updatedAt: null,
    });
  }

  for (const item of timelineItems) {
    const threadId = readString(item.thread_id);
    if (!threadId) {
      continue;
    }
    if (ordered.has(threadId)) {
      continue;
    }
    ordered.set(threadId, {
      threadId,
      title: readString(item.title) || readString(item.summary) || `Thread ${threadId.slice(0, 8)}`,
      updatedAt: readString(item.created_at) || readString(item.ts) || null,
    });
    if (ordered.size >= 8) {
      break;
    }
  }

  return Array.from(ordered.values());
}

function readExecutionTarget(metadata: Record<string, unknown>): string {
  const selected = metadata.execution_target_selected ?? metadata.execution_target;
  return typeof selected === 'string' ? selected.trim().toLowerCase() : '';
}

function firstInterventionMessage(interventions: unknown[]): string {
  const first = Array.isArray(interventions) ? interventions[0] : null;
  if (!first || typeof first !== 'object') {
    return '';
  }
  const record = first as Record<string, unknown>;
  const token = record.message ?? record.detail ?? record.reason;
  return typeof token === 'string' ? token.trim() : '';
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
  const executionTarget = readExecutionTarget(metadata);
  const interventionMessage = firstInterventionMessage(interventions);
  const synthesizedReply = reply
    || (approvals.length > 0
      ? executionTarget === 'local_companion'
        ? 'Approval is required before Sage can use the local companion.'
        : 'Approval is required before Sage can continue.'
      : interventions.length > 0
        ? /supervisor not running/i.test(interventionMessage)
          ? 'Local companion is unavailable right now, so Sage could not start device work.'
          : 'Sage needs your help before it can continue.'
        : runId
          ? executionTarget === 'local_companion'
            ? 'Task accepted. Sage started work with the local companion.'
            : 'Task accepted. Sage started working on it.'
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

function countArtifacts(messages: WorkstationChatMessageRecord[]): number {
  return messages.reduce((count, message) => count + message.artifacts.length, 0);
}

function preferredRuntimeTarget(runtimeTargets: WorkspaceBootstrapRuntimeTarget[]): WorkspaceBootstrapRuntimeTarget | null {
  return runtimeTargets.find((target) => target.preferred) ?? runtimeTargets[0] ?? null;
}

function localCompanionTarget(runtimeTargets: WorkspaceBootstrapRuntimeTarget[]): WorkspaceBootstrapRuntimeTarget | null {
  return runtimeTargets.find((target) => target.id === 'local_companion') ?? null;
}

function summarizeRuntimeCard(runtimeTargets: WorkspaceBootstrapRuntimeTarget[]): RuntimeSummaryCard {
  const preferred = preferredRuntimeTarget(runtimeTargets);
  const local = localCompanionTarget(runtimeTargets);
  const preferredLabel = preferred?.label ?? 'Cloud runtime';
  const preferredStatus = preferred?.statusLabel ?? (preferred?.online ? 'Ready' : 'Unavailable');

  if (!local || !local.available) {
    return {
      tone: 'neutral',
      title: `${preferredLabel} is carrying Sage`,
      meta: `${preferredStatus} · cloud-first`,
      body: 'Sage stays in cloud mode until a local companion is paired. Device work will not start from this workspace yet.',
      preferredPill: `${preferredLabel} · ${preferredStatus}`,
      localPill: 'Local companion · needs pairing',
    };
  }

  if (!local.online) {
    return {
      tone: 'warning',
      title: 'Local companion is paired but offline',
      meta: `${preferredLabel} remains active`,
      body: local.statusReason || 'Sage will stay in cloud mode until the local companion reconnects.',
      preferredPill: `${preferredLabel} · ${preferredStatus}`,
      localPill: `Local companion · ${local.statusLabel ?? 'Offline'}`,
    };
  }

  if (!local.healthy) {
    return {
      tone: 'warning',
      title: 'Local companion needs attention',
      meta: `${preferredLabel} remains active`,
      body: local.statusReason || 'Sage will avoid device work until the local companion is healthy again.',
      preferredPill: `${preferredLabel} · ${preferredStatus}`,
      localPill: `Local companion · ${local.statusLabel ?? 'Needs attention'}`,
    };
  }

  return {
    tone: 'success',
    title: 'Local companion is ready',
    meta: `${local.sampleAttachmentLabel ?? local.label} · explicit approval`,
    body: 'Sage still uses cloud execution for ordinary turns. If a step needs device work, Sage pauses for explicit approval before using the local companion.',
    preferredPill: `${preferredLabel} · ${preferredStatus}`,
    localPill: `Local companion · ${local.statusLabel ?? 'Ready'}`,
  };
}

function latestRunSummary(run: CanonicalRunSummary | undefined): string {
  if (!run) {
    return 'No active run is attached to this thread yet.';
  }
  const runId = readString(run.run_id) || 'Run';
  const status = readString(run.status) || 'unknown';
  return `${runId} is ${status}.`;
}

function latestApprovalSummary(approval: CanonicalApprovalSummary | undefined): string {
  if (!approval) {
    return 'No approval is blocking Sage right now.';
  }
  return readString(approval.prompt) || 'A pending approval is attached to this thread.';
}

function normalizeSageMemorySnapshot(payload: unknown): SageMemorySnapshot {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const items = Array.isArray(record.items)
    ? record.items.filter((item): item is WorkstationSageMemoryRecord => Boolean(item) && typeof item === 'object')
    : [];
  const categories = Array.isArray(record.categories)
    ? record.categories.flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const category = item as Record<string, unknown>;
      const id = readString(category.id);
      const label = readString(category.label);
      if (!id || !label) {
        return [];
      }
      return [{
        id,
        label,
        description: readString(category.description),
        count: readNumber(category.count, 0),
      } satisfies SageMemoryCategoryRecord];
    })
    : [];
  return {
    items,
    categories,
    summary: readObject(record.summary),
    updatedAt: readString(record.updated_at) || null,
  };
}

function defaultSageMemoryDraft(): SageMemoryDraft {
  return {
    entryId: null,
    category: 'profile_fact',
    title: '',
    content: '',
    pinned: false,
  };
}

function memoryCategoryLabel(
  categories: SageMemoryCategoryRecord[],
  categoryId: string,
): string {
  return categories.find((item) => item.id === categoryId)?.label ?? categoryId.replace(/_/g, ' ');
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Not recorded';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
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
  const [recentThreads, setRecentThreads] = useState<RecentThreadSummary[]>(
    () => services.queryClient.peek<RecentThreadSummary[]>(RECENT_THREADS_QUERY_KEY) ?? [{
      threadId: PRIMARY_THREAD_ID,
      title: 'Primary thread',
      updatedAt: null,
    }],
  );
  const [memorySnapshot, setMemorySnapshot] = useState<SageMemorySnapshot>(
    () => services.queryClient.peek<SageMemorySnapshot>(SAGE_MEMORY_QUERY_KEY) ?? normalizeSageMemorySnapshot(null),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sendFailureNotice, setSendFailureNotice] = useState<SendFailureNotice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [hasEnteredConversationFlow, setHasEnteredConversationFlow] = useState(false);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [mutatingMemory, setMutatingMemory] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<WorkstationChatMessageRecord | null>(null);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const [liveTrace, setLiveTrace] = useState<LiveTraceState | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isWideViewport, setIsWideViewport] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState<string>('all');
  const [selectedExecutionPlacement, setSelectedExecutionPlacement] = useState<'local' | 'cloud'>(() => {
    const localTarget = localCompanionTarget(bootstrap.runtime.runtimeTargets);
    return localTarget && localTarget.available && localTarget.online && localTarget.healthy ? 'local' : 'cloud';
  });
  const [permissionMode, setPermissionMode] = useState<'auto' | 'approval'>(() => {
    const localTarget = localCompanionTarget(bootstrap.runtime.runtimeTargets);
    return localTarget && localTarget.available && localTarget.online && localTarget.healthy ? 'approval' : 'auto';
  });
  const [isApprovalsSheetOpen, setIsApprovalsSheetOpen] = useState(false);
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<SageMemoryDraft>(() => defaultSageMemoryDraft());
  const [pendingDeleteMemoryId, setPendingDeleteMemoryId] = useState<string | null>(null);

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

  const writeMemorySnapshot = (nextSnapshot: SageMemorySnapshot) => {
    services.queryClient.set(SAGE_MEMORY_QUERY_KEY, nextSnapshot);
    setMemorySnapshot(nextSnapshot);
  };

  const writeRecentThreads = (items: RecentThreadSummary[]) => {
    services.queryClient.set(RECENT_THREADS_QUERY_KEY, items);
    setRecentThreads(items);
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
    const timelineRequest = services.client.listActivityTimeline({
      limit: 40,
    }).then(normalizeTimelineItems);

    const [nextRuns, nextApprovals, timelineItems] = await Promise.all([
      runsRequest,
      approvalsRequest,
      timelineRequest,
    ]);
    writeOverview({ nextRuns, nextApprovals });
    writeRecentThreads(deriveRecentThreads(timelineItems, activeThreadId));
  };

  const loadMemory = async () => {
    const payload = await services.client.listSageMemory();
    const nextSnapshot = normalizeSageMemorySnapshot(payload);
    writeMemorySnapshot(nextSnapshot);
    return nextSnapshot;
  };

  const refreshCanonicalState = async (requestedThreadId = activeThreadId) => {
    const [nextThread] = await Promise.all([
      loadThread(requestedThreadId),
      loadOverview(),
      loadMemory(),
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

  const openCreateMemory = (categoryId?: string) => {
    setMemoryDraft({
      ...defaultSageMemoryDraft(),
      category: categoryId || 'profile_fact',
    });
    setIsMemorySheetOpen(true);
  };

  const openEditMemory = (entry: WorkstationSageMemoryRecord) => {
    setMemoryDraft({
      entryId: readString(entry.id) || null,
      category: readString(entry.category) || 'profile_fact',
      title: readString(entry.title),
      content: readString(entry.content),
      pinned: Boolean(entry.pinned),
    });
    setIsMemorySheetOpen(true);
  };

  const submitMemoryDraft = async () => {
    if (mutatingMemory) {
      return;
    }
    const category = readString(memoryDraft.category);
    const title = readString(memoryDraft.title);
    const content = readString(memoryDraft.content);
    if (!category || !title || !content) {
      setStatusMessage('Memory entries need a category, title, and content.');
      return;
    }
    setMutatingMemory(memoryDraft.entryId || 'new');
    setStatusMessage(null);
    try {
      const payload = memoryDraft.entryId
        ? await services.client.updateSageMemoryEntry({
          entryId: memoryDraft.entryId,
          category,
          title,
          content,
          pinned: memoryDraft.pinned,
        })
        : await services.client.createSageMemoryEntry({
          category,
          title,
          content,
          pinned: memoryDraft.pinned,
        });
      writeMemorySnapshot(normalizeSageMemorySnapshot(payload));
      setIsMemorySheetOpen(false);
      setMemoryDraft(defaultSageMemoryDraft());
      setStatusMessage(memoryDraft.entryId ? 'Memory corrected.' : 'Memory saved.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Memory update failed.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const toggleMemoryPinned = async (entry: WorkstationSageMemoryRecord) => {
    const entryId = readString(entry.id);
    if (!entryId || mutatingMemory) {
      return;
    }
    setMutatingMemory(entryId);
    setStatusMessage(null);
    try {
      const payload = await services.client.setSageMemoryEntryPinned({
        entryId,
        pinned: !Boolean(entry.pinned),
      });
      writeMemorySnapshot(normalizeSageMemorySnapshot(payload));
      setStatusMessage(Boolean(entry.pinned) ? 'Memory unpinned.' : 'Memory pinned.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not update memory pin state.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const confirmDeleteMemory = async () => {
    if (!pendingDeleteMemoryId || mutatingMemory) {
      return;
    }
    setMutatingMemory(pendingDeleteMemoryId);
    setStatusMessage(null);
    try {
      const payload = await services.client.deleteSageMemoryEntry({
        entryId: pendingDeleteMemoryId,
      });
      writeMemorySnapshot(normalizeSageMemorySnapshot(payload));
      setPendingDeleteMemoryId(null);
      setStatusMessage('Memory forgotten.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not forget memory.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const openRecentThread = async (threadId: string) => {
    const nextThreadId = readString(threadId);
    if (!nextThreadId || nextThreadId === activeThreadId || isSending) {
      return;
    }
    setHasEnteredConversationFlow(true);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      setActiveThreadId(nextThreadId);
      await refreshCanonicalState(nextThreadId);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not open this thread.');
    } finally {
      setIsLoading(false);
    }
  };

  const startNewThread = async () => {
    if (isSending) {
      return;
    }
    setHasEnteredConversationFlow(true);
    const nextThreadId = `thread-${Date.now()}`;
    setDraft('');
    setStatusMessage(null);
    setPendingUserMessage(null);
    setStreamingAssistantText('');
    setLiveTrace(null);
    setIsLoading(true);
    try {
      setActiveThreadId(nextThreadId);
      await refreshCanonicalState(nextThreadId);
      writeRecentThreads([
        {
          threadId: nextThreadId,
          title: 'New thread',
          updatedAt: new Date().toISOString(),
        },
        ...recentThreads.filter((item) => item.threadId !== nextThreadId).slice(0, 7),
      ]);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not start a new thread.');
    } finally {
      setIsLoading(false);
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

  const hasConversationContent = thread.messages.length > 0
    || Boolean(pendingUserMessage)
    || Boolean(streamingAssistantMessage)
    || Boolean(liveTrace);
  const showConversationContext = hasConversationContent || hasEnteredConversationFlow;
  const showFirstImpression = !showConversationContext;
  const showTrace = showConversationContext && Boolean(liveTrace) && !isMobileViewport && isWideViewport;
  const showBlankTranscript = !isLoading
    && thread.messages.length === 0
    && !pendingUserMessage
    && !streamingAssistantMessage
    && !liveTrace;
  const latestRun = runs[0];
  const latestApproval = approvals[0];
  const artifactCount = useMemo(() => countArtifacts(thread.messages), [thread.messages]);
  const assistantTurnCount = useMemo(
    () => thread.messages.filter((message) => message.role !== 'user').length,
    [thread.messages],
  );
  const runtimeCard = useMemo(
    () => summarizeRuntimeCard(bootstrap.runtime.runtimeTargets),
    [bootstrap.runtime.runtimeTargets],
  );
  const localRuntimeTarget = useMemo(
    () => localCompanionTarget(bootstrap.runtime.runtimeTargets),
    [bootstrap.runtime.runtimeTargets],
  );
  const localCompanionConnected = Boolean(
    localRuntimeTarget
    && localRuntimeTarget.available
    && localRuntimeTarget.online
    && localRuntimeTarget.healthy,
  );
  const structuredServicesState = artifactCount > 0
    ? `${artifactCount} attached output${artifactCount === 1 ? '' : 's'} in this thread`
    : 'No app updates yet';
  const nextStepTitle = approvals.length > 0
    ? 'Approval is waiting'
    : latestRun
      ? 'Task is in progress'
      : 'Sage is ready for the next turn';
  const nextStepMeta = approvals.length > 0
    ? `${approvals.length} waiting`
    : latestRun
      ? readString(latestRun.status) || 'unknown'
      : 'Idle';
  const memoryMeta = assistantTurnCount > 0
    ? `${assistantTurnCount} Sage repl${assistantTurnCount === 1 ? 'y' : 'ies'} retained`
    : 'The first turn will establish memory';
  const serviceTone = artifactCount > 0 ? 'success' : 'neutral';
  const serviceTitle = artifactCount > 0 ? 'App updates are available' : 'No app updates yet';
  const serviceBody = artifactCount > 0
    ? 'Sage saved new output in this thread so you can keep building from it.'
    : 'When Sage creates reusable output, it will show up here.';
  const memoryItems = memorySnapshot.items;
  const pinnedMemoryCount = readNumber(memorySnapshot.summary.pinned_count, 0);
  const totalMemoryCount = readNumber(memorySnapshot.summary.total_count, 0);
  const memoryCardTitle = totalMemoryCount > 0 ? 'What Sage will carry forward' : 'No explicit memory saved yet';
  const memoryCardBody = totalMemoryCount > 0
    ? memoryItems.slice(0, 2).map((item) => `${readString(item.title)}: ${readString(item.summary || item.content)}`).join(' · ')
    : 'Save profile facts, active work, app state, or long-term preferences here when you want Sage to carry them forward explicitly.';
  const filteredMemoryItems = useMemo(
    () => memoryItems.filter((item) => memoryFilter === 'all' || readString(item.category) === memoryFilter),
    [memoryFilter, memoryItems],
  );
  const visibleMemoryItems = filteredMemoryItems.slice(0, 6);
  const pendingDeleteMemory = pendingDeleteMemoryId
    ? memoryItems.find((item) => readString(item.id) === pendingDeleteMemoryId) ?? null
    : null;

  useEffect(() => {
    if (!localCompanionConnected && selectedExecutionPlacement === 'local') {
      setSelectedExecutionPlacement('cloud');
    }
  }, [localCompanionConnected, selectedExecutionPlacement]);

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }
    setHasEnteredConversationFlow(true);

    const requestedThreadId = activeThreadId;
    const pendingMessage = createCanonicalUserMessage(message, requestedThreadId);
    setIsSending(true);
    setStatusMessage(null);
    setSendFailureNotice(null);
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
        runtimeTarget: selectedExecutionPlacement === 'local' ? 'local_companion' : 'cloud',
        policyContext: {
          session_mode: permissionMode === 'auto' ? 'agent' : 'copilot',
          trust_mode: permissionMode === 'auto' ? 'auto' : 'guarded',
          approval_ui: 'sheet',
        },
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
      const responseExecutionTarget = readExecutionTarget(responseMetadata);
      const responseInterventionMessage = firstInterventionMessage(normalizedResponse.interventions ?? []);
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
          ? responseExecutionTarget === 'local_companion'
            ? 'Turn submitted. Sage is waiting for approval before using the local companion.'
            : 'Turn submitted. Approval is now pending.'
          : Array.isArray(normalizedResponse.interventions) && normalizedResponse.interventions.length > 0
            ? /supervisor not running/i.test(responseInterventionMessage)
              ? 'Turn submitted, but the local companion is unavailable. Sage stayed paused instead of starting device work.'
              : 'Turn submitted. Your input is needed before Sage can continue.'
            : responseExecutionTarget === 'local_companion'
              ? 'Turn submitted. Sage routed this work to the local companion.'
            : renewed
              ? 'Turn submitted after refreshing your session.'
              : null,
      );
      setSendFailureNotice(null);
    } catch (error) {
      setPendingUserMessage(null);
      setStreamingAssistantText('');
      const message = error instanceof WorkstationClientError || error instanceof Error
        ? error.message
        : 'Could not send this message.';
      setSendFailureNotice({
        message,
        retryable: error instanceof WorkstationClientError
          ? error.retryable
          : true,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main
      data-workstation-surface="chat"
      data-workstation-chat="pane"
      className={`app-chat-page app-chat-page--surface${showFirstImpression ? ' app-chat-page--first-impression' : ''}`}
    >
      <section className={`app-chat-thread app-chat-thread--surface${showBlankTranscript || showFirstImpression ? ' app-chat-thread--blank' : ''}`}>
        <ScrollRegion className="app-chat-thread__scroll">
          <div className="app-chat-thread__body">
            {thread.messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
              />
            ))}

            {pendingUserMessage ? (
              <ChatMessage
                key={pendingUserMessage.id}
                message={pendingUserMessage}
              />
            ) : null}

            {streamingAssistantMessage ? (
              <ChatMessage
                key={streamingAssistantMessage.id}
                message={streamingAssistantMessage}
              />
            ) : null}
          </div>
        </ScrollRegion>
      </section>

      {sendFailureNotice ? (
        <AppNotice
          tone="warning"
          role="status"
          aria-live="polite"
        >
          <span>{sendFailureNotice.message}</span>
          {sendFailureNotice.retryable ? <span>Draft kept. Try again when ready.</span> : null}
        </AppNotice>
      ) : null}

      <ChatComposer
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={() => {
          void sendMessage();
        }}
        executionPlacement={selectedExecutionPlacement === 'local' ? 'Local' : 'Cloud'}
        onToggleExecutionPlacement={() => {
          if (!localCompanionConnected) {
            return;
          }
          setSelectedExecutionPlacement((current) => (current === 'local' ? 'cloud' : 'local'));
        }}
        executionPlacementDisabled={!localCompanionConnected}
        pendingApprovalsCount={approvals.length}
        onOpenApprovals={() => {
          setIsApprovalsSheetOpen(true);
        }}
        permissionMode={permissionMode === 'auto' ? 'Auto-run' : 'Requires approval'}
        onTogglePermissionMode={() => {
          setPermissionMode((current) => (current === 'auto' ? 'approval' : 'auto'));
        }}
        busy={isSending}
      />

      <CommandSheet
        open={isApprovalsSheetOpen}
        title="Approvals"
        description="Review pending approval requests attached to this conversation."
        onClose={() => {
          setIsApprovalsSheetOpen(false);
        }}
      >
        <div className="app-stack-3">
          {approvals.length === 0 ? (
            <AppNotice>No pending approvals.</AppNotice>
          ) : approvals.map((approval, index) => (
            <section key={readString(approval.approval_id) || readString(approval.id) || `approval-${index}`} className="app-surface-notice">
              <strong className="app-surface-title">{readString(approval.prompt) || `Approval ${index + 1}`}</strong>
              <span className="app-surface-description">
                {readString(approval.status) || 'pending'}
              </span>
            </section>
          ))}
          <div>
            <Link href={`/w/${encodeURIComponent(bootstrap.workspace.id)}/approvals`} className="app-link-button app-link-button--primary">
              Open approvals
            </Link>
          </div>
        </div>
      </CommandSheet>

      <CommandSheet
        open={isMemorySheetOpen}
        title={memoryDraft.entryId ? 'Correct memory' : 'Save memory'}
        description="Memory saves are explicit here. Save only facts or context Sage should carry into future turns."
        onClose={() => {
          setIsMemorySheetOpen(false);
          setMemoryDraft(defaultSageMemoryDraft());
        }}
        actions={(
          <>
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                setIsMemorySheetOpen(false);
                setMemoryDraft(defaultSageMemoryDraft());
              }}
              disabled={Boolean(mutatingMemory)}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              tone="primary"
              onClick={() => {
                void submitMemoryDraft();
              }}
              disabled={Boolean(mutatingMemory)}
            >
              {mutatingMemory ? 'Saving…' : memoryDraft.entryId ? 'Save correction' : 'Save memory'}
            </AppButton>
          </>
        )}
      >
        <FormSection
          title="Memory entry"
          description="Choose the category carefully so Sage can use this memory the right way."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormField label="Category">
              <select
                className="app-select"
                value={memoryDraft.category}
                onChange={(event) => {
                  const nextCategory = event.currentTarget.value;
                  setMemoryDraft((current) => ({
                    ...current,
                    category: nextCategory,
                  }));
                }}
              >
                {memorySnapshot.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Pin now">
              <div className="app-inline-actions app-inline-actions--tight">
                <AppButton
                  type="button"
                  tone={memoryDraft.pinned ? 'primary' : 'secondary'}
                  onClick={() => {
                    setMemoryDraft((current) => ({
                      ...current,
                      pinned: !current.pinned,
                    }));
                  }}
                >
                  {memoryDraft.pinned ? 'Pinned' : 'Pin memory'}
                </AppButton>
              </div>
            </FormField>
          </FormGrid>
          <FormGrid columns="1fr">
            <FormField label="Title" hint="Short enough to scan quickly in future turns.">
              <FormInput
                value={memoryDraft.title}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setMemoryDraft((current) => ({
                    ...current,
                    title: nextValue,
                  }));
                }}
                placeholder="Example: Preferred working style"
              />
            </FormField>
            <FormField label="Content" hint="Keep it factual and explicit. Avoid dumping raw notes.">
              <FormTextarea
                rows={5}
                value={memoryDraft.content}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setMemoryDraft((current) => ({
                    ...current,
                    content: nextValue,
                  }));
                }}
                placeholder="Example: Prefers concise status updates and direct next steps."
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </CommandSheet>

      <ConfirmDialog
        open={Boolean(pendingDeleteMemory)}
        title="Forget memory?"
        body={pendingDeleteMemory
          ? `Sage will remove "${readString(pendingDeleteMemory.title) || 'this memory'}" from explicit carry-forward memory.`
          : 'Sage will remove this memory.'}
        confirmLabel="Forget memory"
        busy={Boolean(mutatingMemory)}
        onConfirm={() => {
          void confirmDeleteMemory();
        }}
        onCancel={() => {
          setPendingDeleteMemoryId(null);
        }}
      />
    </main>
  );
}
