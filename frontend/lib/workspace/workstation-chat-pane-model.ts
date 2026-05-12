import type { ComposerPreRunCostEstimate } from '@/lib/workspace/chat-composer';
import type {
  WorkstationChatArtifactReference,
  WorkstationChatMessageRecord,
} from '@/lib/workspace/chat-message';
import type { CodexTranscriptCell } from '@/lib/workspace/codex-chat/cells';
import { resolveModelContextWindow } from '@/lib/workspace/model-capabilities';
import type { WorkspaceBootstrapRuntimeTarget } from '@/lib/workspace/workspace-bootstrap';
import {
  WorkstationClientError,
  type WorkstationAgentTraceEvent,
  type WorkstationAgentTraceRecord,
  type ProviderCatalogModelRecord,
  type ProviderCatalogRecord,
  type ProviderProfileRecord,
  type VaultCredentialRecord,
  type WorkstationSageMemoryRecord,
  type WorkstationSageProfileRecord,
  type WorkstationTurnResponse,
} from '@/lib/workspace/workstation-client';
import type {
  CanonicalApprovalSummary,
  CanonicalChatThreadState,
  CanonicalRunSummary,
  ChatMachineTrust,
  ChatModelOption,
  ChatReasoningEffort,
  GatewayReadinessDoctorPayload,
  LiveActivityStepState,
  LiveTraceState,
  RecentThreadSummary,
  SageMemoryCategoryRecord,
  SageMemoryDraft,
  SageMemorySnapshot,
  SageProfileSnapshot,
  SageToolPolicyRecord,
  SendFailureNotice,
} from '@/lib/workspace/workstation-chat-pane-hooks';

export type StatusNoticeTone = 'neutral' | 'success' | 'warning';

export type RuntimeSummaryCard = {
  tone: 'neutral' | 'accent' | 'success' | 'warning';
  title: string;
  meta: string;
  body: string;
  preferredPill: string;
  localPill: string;
};

export type SageReadinessPill = {
  id: string;
  label: string;
  tone: 'muted' | 'warning' | 'danger';
  target: 'gateway' | 'integrations';
};

export type GatewayReadinessRegistration = Record<string, unknown> & {
  gateway_id?: string | null;
  status?: string | null;
  connection_status?: string | null;
};

export type ChatRuntimeTrustZone = 'shared_cloud' | 'user_owned_local' | 'owned_dedicated_runtime';

export const VALID_REASONING_LEVELS: ChatReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export const PRIMARY_THREAD_ID = 'primary';
export const CHAT_READ_TIMEOUT_MS = 8_000;
export const SAGE_SETUP_TIMEOUT_MS = 8_000;
export const CHAT_THINKING_RECOVERY_MS = 120_000;
export const ACTIVE_THREAD_QUERY_KEY = 'chat:canonical:active-thread';
export const ACTIVE_THREAD_STORAGE_PREFIX = 'empyralis.chat.active-thread.v1';
export const RUNS_QUERY_KEY = 'chat:canonical:runs';
export const APPROVALS_QUERY_KEY = 'chat:canonical:approvals';
export const SAGE_MEMORY_QUERY_KEY = 'chat:canonical:sage-memory';
export const SAGE_PROFILE_QUERY_KEY = 'chat:canonical:sage-profile';
export const RECENT_THREADS_QUERY_KEY = 'chat:canonical:recent-threads';

export function activeThreadStorageKey(workspaceId: string): string {
  return `${ACTIVE_THREAD_STORAGE_PREFIX}:${workspaceId}`;
}

export function readPersistedActiveThread(workspaceId: string): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const persisted = window.localStorage.getItem(activeThreadStorageKey(workspaceId));
    const threadId = readString(persisted);
    return threadId || null;
  } catch {
    return null;
  }
}

export function persistActiveThread(workspaceId: string, threadId: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  const normalizedThreadId = readString(threadId);
  if (!normalizedThreadId) {
    return;
  }
  try {
    window.localStorage.setItem(activeThreadStorageKey(workspaceId), normalizedThreadId);
  } catch {
    // Ignore storage write failures in constrained environments.
  }
}

export function threadQueryKey(threadId: string): string {
  return `chat:canonical:thread:${threadId}`;
}

export function normalizeArtifactReferences(metadata: Record<string, unknown>): WorkstationChatArtifactReference[] {
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

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readModelParameterCountBillions(...values: unknown[]): number | null {
  for (const value of values) {
    const text = readString(value).toLowerCase();
    if (!text) {
      continue;
    }
    const match = text.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*b(?:$|[^a-z0-9])/i);
    if (!match) {
      continue;
    }
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function isSmallOllamaSelection(providerId: unknown, modelId: unknown, modelLabel: unknown): boolean {
  if (readString(providerId).toLowerCase() !== 'ollama') {
    return false;
  }
  const parameterCount = readModelParameterCountBillions(modelId, modelLabel);
  if (parameterCount !== null) {
    return parameterCount < 7;
  }
  const modelText = `${readString(modelId)} ${readString(modelLabel)}`.toLowerCase();
  return [
    'llama3.2',
    'phi3',
    'gemma',
    'qwen2.5:1.5b',
    'qwen2.5:3b',
    'qwen3:1.7b',
    'qwen3:4b',
  ].some((marker) => modelText.includes(marker));
}

export function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function traceEventKey(event: WorkstationAgentTraceEvent, index: number): string {
  const explicit = readString(event.id);
  if (explicit) {
    return explicit;
  }
  const traceId = readString(event.trace_id) || 'trace';
  const seq = readNumber(event.seq, index + 1);
  const eventType = readString(event.event_type) || 'trace.event';
  return `${traceId}:${seq}:${eventType}:${index}`;
}

export function mergeTraceEvents(
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

export function isTerminalTraceEvent(eventType: string): boolean {
  return eventType === 'trace.completed' || eventType === 'trace.failed';
}

export function formatElapsedClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function resolveTraceStartedAtMs(liveTrace: LiveTraceState | null): number | null {
  const traceStartedAt = readString(liveTrace?.trace?.started_at);
  if (traceStartedAt) {
    const parsed = Date.parse(traceStartedAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  for (const event of liveTrace?.events ?? []) {
    const timestamp = readString(event.ts);
    if (!timestamp) {
      continue;
    }
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function resolveTraceDurationSeconds(liveTrace: LiveTraceState | null, traceStartedAtMs: number | null): number {
  if (!liveTrace) {
    return 0;
  }
  const orderedEvents = [...liveTrace.events].sort((left, right) => readNumber(left.seq, 0) - readNumber(right.seq, 0));
  for (let index = orderedEvents.length - 1; index >= 0; index -= 1) {
    const event = orderedEvents[index];
    const eventType = readString(event.event_type);
    if (!isTerminalTraceEvent(eventType)) {
      continue;
    }
    const durationMs = readNumber(readObject(event.data).duration_ms, 0);
    if (durationMs > 0) {
      return Math.max(0, Math.round(durationMs / 1000));
    }
    const endedAt = Date.parse(readString(event.ts));
    if (traceStartedAtMs && Number.isFinite(endedAt)) {
      return Math.max(0, Math.round((endedAt - traceStartedAtMs) / 1000));
    }
  }
  return 0;
}

export function summarizeLiveTraceStep(liveTrace: LiveTraceState | null): {
  label: string;
  state: 'running' | 'complete' | 'failed';
} {
  const shorten = (value: string, max = 40) => {
    const normalized = readString(value);
    if (!normalized) {
      return '';
    }
    return normalized.length > max ? `${normalized.slice(0, max).trim()}…` : normalized;
  };
  const fileTool = (toolName: string) => /file|read|write|document|pdf|excel|csv|sheet/i.test(toolName);
  const codeTool = (toolName: string) => /code|execute|run|shell|bash|python|script/i.test(toolName);
  if (!liveTrace) {
    return {
      label: 'Thinking...',
      state: 'running',
    };
  }

  const orderedEvents = [...liveTrace.events].sort((left, right) => readNumber(left.seq, 0) - readNumber(right.seq, 0));

  for (let index = orderedEvents.length - 1; index >= 0; index -= 1) {
    const event = orderedEvents[index];
    const eventType = readString(event.event_type);
    const data = readObject(event.data);

    if (eventType === 'trace.failed') {
      return {
        label: readString(data.summary) || readString(data.error) || 'Run failed',
        state: 'failed',
      };
    }
    if (eventType === 'trace.completed') {
      return {
        label: readString(data.summary) || readString(data.outcome) || 'Completed task',
        state: 'complete',
      };
    }
    if (eventType === 'search.query') {
      const query = shorten(readString(data.query));
      return {
        label: query ? `Searching the web for ${query}` : 'Searching the web',
        state: 'running',
      };
    }
    if (eventType.startsWith('computer.') || eventType === 'browser.action' || eventType === 'browser.screenshot') {
      return {
        label: 'Using the computer',
        state: 'running',
      };
    }
    if (eventType === 'tool.progress') {
      const toolName = readString(data.tool_name);
      if (fileTool(toolName)) {
        return {
          label: 'Reading file',
          state: 'running',
        };
      }
      if (codeTool(toolName)) {
        return {
          label: 'Executing code',
          state: 'running',
        };
      }
      return {
        label: readString(data.message) || (toolName ? `Running ${toolName}` : 'Running a tool'),
        state: 'running',
      };
    }
    if (eventType === 'tool.started') {
      const toolName = readString(data.tool_name);
      if (fileTool(toolName)) {
        return {
          label: 'Reading file',
          state: 'running',
        };
      }
      if (codeTool(toolName)) {
        return {
          label: 'Executing code',
          state: 'running',
        };
      }
      return {
        label: toolName ? `Running ${toolName}` : 'Running a tool',
        state: 'running',
      };
    }
    if (eventType === 'plan.item.updated' || eventType === 'plan.item.created') {
      return {
        label: readString(data.title) || readString(data.summary) || 'Thinking...',
        state: 'running',
      };
    }
    if (eventType === 'reasoning.summary.delta') {
      return {
        label: 'Thinking...',
        state: 'running',
      };
    }
    if (eventType === 'delegation.started') {
      return {
        label: 'Coordinating behind the scenes',
        state: 'running',
      };
    }
    if (eventType === 'approval.requested') {
      return {
        label: readString(data.prompt) || 'Waiting for approval',
        state: 'running',
      };
    }
    if (eventType === 'artifact.created') {
      return {
        label: readString(data.label) || 'Created an output',
        state: 'running',
      };
    }
  }

  return {
    label: 'Working...',
    state: 'running',
  };
}

export function normalizeTraceStreamEvent(payload: Record<string, unknown>): WorkstationAgentTraceEvent | null {
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

export function buildLiveTraceRecord({
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

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

export function isSyntheticTranscriptMessage(message: WorkstationChatMessageRecord): boolean {
  if (message.role === 'user') {
    return false;
  }
  const metadata = readObject(message.metadata);
  const displayKind = readString(metadata.display_kind).toLowerCase();
  if (displayKind === 'status_notice' || displayKind === 'local_access_notice' || displayKind === 'provider_error') {
    return true;
  }
  const normalized = readString(message.content).toLowerCase();
  if (!normalized) {
    return false;
  }
  if (isProviderRuntimeGateMessage(normalized)) {
    return true;
  }
  if (normalized.startsWith('turn submitted.')) {
    return true;
  }
  if (normalized === 'approval is required before sage can continue.') {
    return true;
  }
  if (normalized === 'sage needs your help before it can continue.') {
    return true;
  }
  if (normalized === 'sage cannot run that request in this workspace right now.') {
    return true;
  }
  if (
    normalized === 'sage hit a temporary error while generating the response. please try again in a moment.'
    || normalized === 'sage took too long to respond. please try again.'
    || normalized === 'sage is temporarily at capacity. please try again in a moment.'
    || normalized === 'capacity is busy right now. retry in a moment.'
    || normalized === 'the request could not finish. retry when ready.'
    || normalized === 'the request could not connect. retry when ready.'
    || normalized === "sage couldn't complete that turn."
    || normalized === 'not found'
    || normalized === 'thread not found.'
  ) {
    return true;
  }
  return (normalized.includes('local companion') || normalized.includes('gateway'))
    && (
      normalized.includes('approval is required')
      || normalized.includes('could not start device work')
      || normalized.includes('started work')
      || normalized.includes('started working on it')
    );
}

export function isProviderRuntimeGateMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const mentionsProviderSetup = (
    normalized.includes('provider')
    || normalized.includes('credential')
    || normalized.includes('api key')
    || normalized.includes('runtime')
    || normalized.includes('setup')
    || normalized.includes('configured')
  );
  return (
    normalized.includes('is selected for chat but is not available right now')
    || normalized.includes('is local-only and needs a connected computer')
    || normalized.includes('needs a connected computer')
    || normalized.includes('the selected provider is not ready')
    || normalized.includes('the selected provider is not available right now')
    || normalized.includes('connect a computer, switch to empyralis credits')
    || normalized.includes('required local runtime')
    || normalized.includes('no provider configured')
    || normalized.includes('provider setup required')
    || normalized.includes('missing provider')
    || normalized.includes('missing credential')
    || normalized.includes('missing api key')
    || (mentionsProviderSetup && normalized.includes('not configured'))
    || (mentionsProviderSetup && normalized.includes('not available'))
    || (mentionsProviderSetup && normalized.includes('not ready'))
    || (mentionsProviderSetup && normalized.includes('setup required'))
  );
}

export function isProviderGateSystemCell(cell: CodexTranscriptCell): boolean {
  if (cell.kind === 'error') {
    return isProviderRuntimeGateMessage(cell.message);
  }
  if (cell.kind === 'status') {
    const combined = `${readString(cell.label)} ${readString(cell.detail)}`;
    return isProviderRuntimeGateMessage(combined);
  }
  if (cell.kind === 'tool') {
    const combined = `${readString(cell.name)} ${readString(cell.result)}`;
    return isProviderRuntimeGateMessage(combined);
  }
  return false;
}

export function isProviderGateTranscriptCell(cell: CodexTranscriptCell): boolean {
  if (cell.kind === 'assistant') {
    return isProviderRuntimeGateMessage(readString(cell.content));
  }
  return isProviderGateSystemCell(cell);
}

export function normalizeStructuredRecordList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    const records = value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
    if (records.length > 0 || value.length === 0) {
      return records;
    }
    if (value.every((item) => typeof item === 'string')) {
      try {
        const parsed = JSON.parse((value as string[]).join(''));
        return Array.isArray(parsed)
          ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeCanonicalChatThread(
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
    const approvals = normalizeStructuredRecordList(entry.approvals);
    const interventions = normalizeStructuredRecordList(entry.interventions);
    const nextMetadata = { ...metadata };
    const resultMetadata = readObject(nextMetadata.result_metadata);
    const contextUsed = readObject(nextMetadata.context_used);
    const resultContextUsed = readObject(resultMetadata.context_used);
    if (!contextUsed && resultContextUsed) {
      nextMetadata.context_used = resultContextUsed;
    }
    const effectiveProvider = readString(nextMetadata.effective_provider)
      || readString(resultMetadata.provider)
      || readString(resultContextUsed.effective_provider);
    const effectiveModel = readString(nextMetadata.effective_model)
      || readString(resultMetadata.model)
      || readString(resultContextUsed.effective_model);
    if (effectiveProvider) {
      nextMetadata.effective_provider = effectiveProvider;
    }
    if (effectiveModel) {
      nextMetadata.effective_model = effectiveModel;
    }
    const providerFailureIntervention = findProviderFailureIntervention(interventions);
    const rawContent = String(entry.content ?? '');
    const content = rawContent.trim()
      ? rawContent
      : (
        String(entry.role ?? 'assistant') === 'assistant'
        && String(entry.status ?? '').trim().toLowerCase() === 'failed'
          ? "Sage couldn't complete that turn."
          : ''
      );
    if (!rawContent.trim() && providerFailureIntervention && typeof nextMetadata.display_kind !== 'string') {
      nextMetadata.display_kind = 'provider_error';
    }
    if (rawContent.trim() && isProviderRuntimeGateMessage(rawContent) && typeof nextMetadata.display_kind !== 'string') {
      nextMetadata.display_kind = 'provider_error';
    }

    return [{
      id: String(entry.id ?? `${threadId}:message:${index}`),
      role: String(entry.role ?? 'assistant'),
      content,
      status: typeof entry.status === 'string' ? entry.status : null,
      createdAt: typeof entry.created_at === 'string' ? entry.created_at : null,
      runId: typeof entry.run_id === 'string' ? entry.run_id : null,
      approvals,
      interventions,
      artifacts: normalizeArtifactReferences(nextMetadata),
      metadata: nextMetadata,
    }].filter((message) => !isSyntheticTranscriptMessage(message));
  });

  return {
    threadId: String(record.id ?? record.thread_id ?? threadId),
    title: String(record.title ?? 'Chat'),
    messages,
    session: null,
  };
}

export function normalizeCanonicalRunItems(payload: unknown): CanonicalRunSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is CanonicalRunSummary => Boolean(item) && typeof item === 'object')
    : [];
}

export function normalizeCanonicalApprovalItems(payload: unknown): CanonicalApprovalSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is CanonicalApprovalSummary => Boolean(item) && typeof item === 'object')
    : [];
}

export function normalizeProviderCatalogRecords(payload: unknown): ProviderCatalogRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const providers = (payload as Record<string, unknown>).providers;
  return Array.isArray(providers)
    ? providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
    : [];
}

export function normalizeProviderProfiles(payload: unknown): ProviderProfileRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is ProviderProfileRecord => Boolean(item) && typeof item === 'object')
    : [];
}

export function sortProviderProfiles(profiles: ProviderProfileRecord[]): ProviderProfileRecord[] {
  return [...profiles].sort((left, right) => {
    const leftPriority = Number(left.priority ?? 100);
    const rightPriority = Number(right.priority ?? 100);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return readString(left.id).localeCompare(readString(right.id));
  });
}

export function profileMetadataRecord(profile: ProviderProfileRecord | null | undefined): Record<string, unknown> {
  return profile && typeof profile.metadata === 'object' && profile.metadata
    ? profile.metadata as Record<string, unknown>
    : {};
}

export function normalizeTimelineItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

export function deriveRecentThreads(
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

export function summarizeThreadForHistory(thread: CanonicalChatThreadState, fallbackThreadId: string): RecentThreadSummary | null {
  const threadId = readString(thread.threadId) || readString(fallbackThreadId);
  if (!threadId) {
    return null;
  }
  const explicitTitle = readString(thread.title);
  const title = explicitTitle && explicitTitle !== 'Chat'
    ? explicitTitle
    : threadId === PRIMARY_THREAD_ID
      ? 'Primary thread'
      : threadId;
  const latestMessage = [...thread.messages].reverse().find((message) => readString(message.createdAt));
  return {
    threadId,
    title,
    updatedAt: readString(latestMessage?.createdAt) || null,
  };
}

export function readExecutionTarget(metadata: Record<string, unknown>): string {
  const selected = metadata.execution_target_selected ?? metadata.execution_target;
  return typeof selected === 'string' ? selected.trim().toLowerCase() : '';
}

export function resolveRuntimeTrustZone(
  runtimeTarget: WorkspaceBootstrapRuntimeTarget | null,
  machineTrust: ChatMachineTrust,
): ChatRuntimeTrustZone {
  if (!runtimeTarget || readString(runtimeTarget.executionTarget).toLowerCase() !== 'local_companion') {
    return 'shared_cloud';
  }
  const trustTier = readString(runtimeTarget.trustTier).toLowerCase();
  if (machineTrust === 'agent' || trustTier === 'paired_local_privileged') {
    return 'owned_dedicated_runtime';
  }
  return 'user_owned_local';
}

export function readProviderScopes(provider: ProviderCatalogRecord): string[] {
  const value = provider.provider_scopes;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readString(item).toLowerCase())
    .filter(Boolean);
}

export function isCatalogProviderRecord(provider: ProviderCatalogRecord): boolean {
  const providerId = readString(provider.id).toLowerCase();
  const kind = readString(provider.kind).toLowerCase();
  return Boolean(providerId) && (kind === '' || kind === 'provider') && provider.hidden !== true;
}

export const LAUNCH_CHAT_PROVIDER_PRIORITY = ['deepseek', 'gemini', 'openai', 'ollama_cloud', 'ollama'] as const;
export const LAUNCH_CHAT_PROVIDER_IDS = new Set<string>(LAUNCH_CHAT_PROVIDER_PRIORITY);
export const EMPYRALIS_TIER_IDS = ['light', 'pro', 'max'] as const;
export const EMPYRALIS_TIER_SET = new Set<string>(EMPYRALIS_TIER_IDS);
export const EMPYRALIS_TIER_LABELS: Record<typeof EMPYRALIS_TIER_IDS[number], string> = {
  light: 'Light',
  pro: 'Pro',
  max: 'Max',
};
export const USER_OWNED_SECTION_LABELS: Record<'local_ai' | 'my_api_key' | 'my_ai_account', string> = {
  local_ai: 'Local AI',
  my_api_key: 'My API Key',
  my_ai_account: 'My AI Account',
};
export const EMPYRALIS_TIER_ESTIMATED_CREDITS: Record<typeof EMPYRALIS_TIER_IDS[number], number> = {
  light: 6,
  pro: 12,
  max: 24,
};
export const VIRTUAL_RUNTIME_ESTIMATED_CREDITS: Record<'virtual_browser' | 'virtual_desktop' | 'virtual_code_sandbox', number> = {
  virtual_browser: 8,
  virtual_desktop: 15,
  virtual_code_sandbox: 10,
};
export const ARTIFACT_ESTIMATED_CREDITS = 2;

export type ChatHostedCreditState = {
  monthlyCreditCap: number;
  monthlyCreditsUsed: number;
  monthlyCreditsRemaining: number;
};

export function chatProviderPriority(provider: ProviderCatalogRecord): number {
  const providerId = readString(provider.id).toLowerCase();
  const index = LAUNCH_CHAT_PROVIDER_PRIORITY.indexOf(providerId as typeof LAUNCH_CHAT_PROVIDER_PRIORITY[number]);
  return index >= 0 ? index : LAUNCH_CHAT_PROVIDER_PRIORITY.length;
}

export function isLaunchChatProvider(provider: ProviderCatalogRecord): boolean {
  const providerId = readString(provider.id).toLowerCase();
  return LAUNCH_CHAT_PROVIDER_IDS.has(providerId);
}

export function sortLaunchChatProviders(providers: ProviderCatalogRecord[]): ProviderCatalogRecord[] {
  return [...providers].sort((left, right) => {
    const priorityDelta = chatProviderPriority(left) - chatProviderPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return (readString(left.label) || readString(left.id)).localeCompare(readString(right.label) || readString(right.id));
  });
}

export type ChatRouteKind = 'empyralis' | 'local_ai' | 'my_api_key' | 'my_ai_account';

export type ChatModelTierPolicyRecord = {
  hostedAiEnabled: boolean;
  tierAllowed: Record<'light' | 'pro' | 'max', boolean>;
  userOwnedAllowed: Record<'local_ai' | 'my_api_key' | 'my_ai_account', boolean>;
};

export function normalizeChatModelTierPolicy(payload: unknown): ChatModelTierPolicyRecord {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const tiers = source.tiers && typeof source.tiers === 'object'
    ? source.tiers as Record<string, unknown>
    : {};
  const userOwned = source.user_owned && typeof source.user_owned === 'object'
    ? source.user_owned as Record<string, unknown>
    : {};

  const readTierEnabled = (tier: 'light' | 'pro' | 'max', fallback: boolean): boolean => {
    const record = tiers[tier];
    if (!record || typeof record !== 'object') {
      return fallback;
    }
    const enabled = (record as Record<string, unknown>).enabled;
    return typeof enabled === 'boolean' ? enabled : fallback;
  };

  const readUserOwnedEnabled = (
    route: 'local_ai' | 'my_api_key' | 'my_ai_account',
    fallback: boolean,
  ): boolean => {
    const value = userOwned[route];
    return typeof value === 'boolean' ? value : fallback;
  };

  const hostedAiEnabled = typeof source.hosted_ai_enabled === 'boolean' ? source.hosted_ai_enabled : true;
  return {
    hostedAiEnabled,
    tierAllowed: {
      light: hostedAiEnabled && readTierEnabled('light', true),
      pro: hostedAiEnabled && readTierEnabled('pro', true),
      max: hostedAiEnabled && readTierEnabled('max', false),
    },
    userOwnedAllowed: {
      local_ai: readUserOwnedEnabled('local_ai', true),
      my_api_key: readUserOwnedEnabled('my_api_key', true),
      my_ai_account: readUserOwnedEnabled('my_ai_account', true),
    },
  };
}

export function providerRouteKind(provider: ProviderCatalogRecord): ChatRouteKind {
  const providerId = readString(provider.id).toLowerCase();
  const credentialPlane = readString(provider.credential_plane).toLowerCase();
  const defaultAuthMode = readString(provider.default_auth_mode).toLowerCase();
  const runtimeSource = readString(provider.runtime_active_source).toLowerCase();

  if (providerId === 'openai-codex' || runtimeSource.endsWith('cli') || defaultAuthMode === 'oauth_token') {
    return 'my_ai_account';
  }
  if (providerId === 'ollama' || provider.local_only === true || credentialPlane === 'local_runtime') {
    return 'local_ai';
  }
  if (credentialPlane === 'platform_runtime') {
    return 'empyralis';
  }
  return 'my_api_key';
}

export function isProviderEligibleForModelSelector(provider: ProviderCatalogRecord): boolean {
  if (!isCatalogProviderRecord(provider)) {
    return false;
  }
  if (!isLaunchChatProvider(provider)) {
    return false;
  }
  const scopes = readProviderScopes(provider);
  if (scopes.length > 0 && !scopes.includes('sage_personal')) {
    return false;
  }
  if (provider.local_only === true) {
    return provider.usable === true;
  }
  return provider.usable === true || provider.active === true;
}

export function isProviderEligibleForWorkspaceDefault(provider: ProviderCatalogRecord): boolean {
  if (!isCatalogProviderRecord(provider)) {
    return false;
  }
  if (!isLaunchChatProvider(provider)) {
    return false;
  }
  const scopes = readProviderScopes(provider);
  if (scopes.length > 0 && !scopes.includes('sage_personal')) {
    return false;
  }
  const state = readString(provider.state).toLowerCase();
  if (provider.usable === true || provider.active === true) {
    if (provider.local_only === true) {
      return provider.usable === true;
    }
    return true;
  }
  return state === 'configured';
}

export function workspaceDefaultModelOption(
  providers: ProviderCatalogRecord[] = [],
): ChatModelOption {
  const workspaceDefaultProvider = sortLaunchChatProviders(providers.filter(isProviderEligibleForWorkspaceDefault))[0] ?? null;
  return {
    id: 'default',
    label: 'Auto route',
    providerId: workspaceDefaultProvider ? readString(workspaceDefaultProvider.id) || null : null,
    providerLabel: workspaceDefaultProvider
      ? readString(workspaceDefaultProvider.label) || readString(workspaceDefaultProvider.id) || null
      : null,
    supportsReasoning: false,
    reasoningLevels: ['low', 'medium', 'high'],
    contextWindowTokens: null,
  };
}

export function disconnectedModelOption(): ChatModelOption {
  return workspaceDefaultModelOption();
}

export function providerRouteSuffix(provider: ProviderCatalogRecord | null | undefined): string | null {
  if (!provider || typeof provider !== 'object') {
    return null;
  }
  const providerId = readString(provider.id).toLowerCase();
  const credentialPlane = readString(provider.credential_plane).toLowerCase();
  const defaultAuthMode = readString(provider.default_auth_mode).toLowerCase();
  const runtimeSource = readString(provider.runtime_active_source).toLowerCase();

  if (providerId === 'openai-codex' || runtimeSource.endsWith('cli') || defaultAuthMode === 'oauth_token') {
    return 'CLI';
  }
  if (providerId === 'ollama' || provider.local_only === true || credentialPlane === 'local_runtime') {
    return 'Local';
  }
  if (credentialPlane === 'workspace_connection') {
    return 'Workspace key';
  }
  if (credentialPlane === 'platform_runtime') {
    return 'Hosted';
  }
  return null;
}

export function providerPathLabel(provider: ProviderCatalogRecord | null | undefined): string | null {
  if (!provider || typeof provider !== 'object') {
    return null;
  }
  const providerId = readString(provider.id).toLowerCase();
  const credentialPlane = readString(provider.credential_plane).toLowerCase();
  const defaultAuthMode = readString(provider.default_auth_mode).toLowerCase();
  const runtimeSource = readString(provider.runtime_active_source).toLowerCase();
  const providerLabel = readString(provider.label) || readString(provider.id);

  if (providerId === 'ollama') {
    return 'Connected computer · Ollama local';
  }
  if (providerId === 'openai-codex' || runtimeSource.endsWith('cli') || defaultAuthMode === 'oauth_token') {
    return 'Connected computer';
  }
  if (providerId === 'ollama_cloud') {
    return 'Ollama Cloud';
  }
  if (credentialPlane === 'platform_runtime') {
    return 'Empyralis credits';
  }
  if (credentialPlane === 'workspace_connection') {
    return 'Your AI account';
  }
  if (provider.local_only === true || credentialPlane === 'local_runtime') {
    return 'Connected computer';
  }
  return providerLabel || null;
}

export function providerSummaryLabel({
  provider,
  providerLabel,
  modelLabel,
}: {
  provider: ProviderCatalogRecord | null | undefined;
  providerLabel: string | null | undefined;
  modelLabel: string | null | undefined;
}): string {
  const pathLabel = providerPathLabel(provider);
  const resolvedProviderLabel = readString(provider?.label) || readString(providerLabel);
  const resolvedModelLabel = readString(modelLabel);
  const parts: string[] = [];
  if (pathLabel) {
    parts.push(pathLabel);
  }
  if (resolvedProviderLabel && !pathLabel?.toLowerCase().includes(resolvedProviderLabel.toLowerCase())) {
    parts.push(resolvedProviderLabel);
  }
  if (resolvedModelLabel) {
    parts.push(resolvedModelLabel);
  }
  return parts.join(' · ');
}

export function providerFailureMessageForProvider(provider: ProviderCatalogRecord | null | undefined): string {
  const credentialPlane = readString(provider?.credential_plane).toLowerCase();
  const providerId = readString(provider?.id).toLowerCase();
  const providerLabel = readString(provider?.label) || (providerId ? providerId : 'The selected provider');
  if (providerId === 'ollama' || provider?.local_only === true || credentialPlane === 'local_runtime') {
    return `${providerLabel} needs a connected computer in Integrations. Use Empyralis credits, connect a computer, or connect your own AI account.`;
  }
  if (credentialPlane === 'workspace_connection') {
    return 'Your AI account needs attention. Check the connection, quota, or selected model in Integrations.';
  }
  if (credentialPlane === 'platform_runtime') {
    return 'Empyralis credits are active, but the hosted AI model is temporarily unavailable. Try again or switch model.';
  }
  return 'The selected AI model is not available right now. Switch model or open Integrations.';
}

export function providerFailureActionsForProvider(
  provider: ProviderCatalogRecord | null | undefined,
  message: string,
): SendFailureNotice['actions'] {
  const normalized = message.trim().toLowerCase();
  const credentialPlane = readString(provider?.credential_plane).toLowerCase();
  const providerId = readString(provider?.id).toLowerCase();
  const localOnly = providerId === 'ollama'
    || provider?.local_only === true
    || credentialPlane === 'local_runtime'
    || normalized.includes('local-only')
    || normalized.includes('connected computer')
    || normalized.includes('gateway offline');
  if (localOnly) {
    return [
      { label: 'Open Integrations', target: 'integrations' },
      { label: 'Choose AI Model', target: 'integrations' },
      { label: 'Use Empyralis credits', target: 'integrations' },
    ];
  }
  const creditsOrKey = normalized.includes('api key')
    || normalized.includes('credential')
    || normalized.includes('quota')
    || normalized.includes('credits')
    || credentialPlane === 'workspace_connection';
  if (creditsOrKey) {
    return [
      { label: 'Manage credits', target: 'integrations' },
      { label: 'Connect AI account', target: 'integrations' },
      { label: 'Choose AI Model', target: 'integrations' },
    ];
  }
  return [{ label: 'Choose AI Model', target: 'integrations' }];
}

export function providerFailureNoticeForProvider(
  provider: ProviderCatalogRecord | null | undefined,
  message?: string | null,
): SendFailureNotice {
  const text = readString(message) || providerFailureMessageForProvider(provider);
  return {
    message: text,
    retryable: false,
    actions: providerFailureActionsForProvider(provider, text),
  };
}

export function providerReadyForChat(
  provider: ProviderCatalogRecord | null | undefined,
  {
    gatewayToolingOnline,
  }: {
    gatewayToolingOnline: boolean;
  },
): boolean {
  if (!provider || typeof provider !== 'object') {
    return false;
  }
  const providerId = readString(provider.id).toLowerCase();
  const credentialPlane = readString(provider.credential_plane).toLowerCase();
  const state = readString(provider.state).toLowerCase();
  const localOnly = providerId === 'ollama'
    || providerId === 'openai-codex'
    || provider.local_only === true
    || credentialPlane === 'local_runtime';

  if (localOnly) {
    return gatewayToolingOnline && provider.usable === true;
  }
  if (credentialPlane === 'platform_runtime') {
    return provider.platform_runtime_allowed !== false
      && (provider.usable === true || provider.active === true || state === 'configured');
  }
  return provider.workspace_connected === true
    || provider.usable === true
    || provider.active === true
    || state === 'configured';
}

export function modelOptionDisplayLabel(
  option: ChatModelOption,
  providerRecord: ProviderCatalogRecord | null,
): string {
  if (option.uiSection === 'empyralis' && EMPYRALIS_TIER_SET.has(readString(option.id).toLowerCase())) {
    return `${option.label} · Empyralis credits`;
  }
  if (
    option.uiSection === 'local_ai'
    || option.uiSection === 'my_api_key'
    || option.uiSection === 'my_ai_account'
  ) {
    return readString(option.label) || readString(option.id) || 'Model';
  }
  const baseLabel = option.id ? compactComposerLabel(option.label, option.id) : option.label;
  const providerLabel = compactComposerLabel(option.providerLabel || readString(providerRecord?.label), option.providerId || '');
  const routeSuffix = providerRouteSuffix(providerRecord);

  if (option.id === 'default') {
    const parts = ['Auto route'];
    if (providerLabel) {
      parts.push(providerLabel);
    }
    if (routeSuffix) {
      parts.push(routeSuffix);
    }
    return parts.join(' · ');
  }

  if (routeSuffix) {
    return `${baseLabel} · ${routeSuffix}`;
  }
  if (providerLabel && providerLabel.toLowerCase() !== baseLabel.toLowerCase()) {
    return `${baseLabel} · ${providerLabel}`;
  }
  return baseLabel;
}

export function normalizeChatModelOptions(payload: unknown): ChatModelOption[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const tierPolicy = normalizeChatModelTierPolicy(record.model_tier_policy);
  const providers = Array.isArray(record.providers)
    ? record.providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
    : [];
  const connectedProviders = sortLaunchChatProviders(providers.filter(isProviderEligibleForModelSelector));

  if (connectedProviders.length === 0) {
    return [disconnectedModelOption()];
  }

  const hostedProviders = connectedProviders.filter((provider) => providerRouteKind(provider) === 'empyralis');
  const userOwnedProviders = connectedProviders.filter((provider) => providerRouteKind(provider) !== 'empyralis');
  const hostedProvider = hostedProviders[0] ?? null;
  const allowedHostedTiers = EMPYRALIS_TIER_IDS.filter((tierId) => tierPolicy.tierAllowed[tierId]);
  const tierOptions: ChatModelOption[] = hostedProvider ? allowedHostedTiers.map((tierId) => {
    const preferredModelId = tierId === 'light' ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
    const models = Array.isArray(hostedProvider.models)
      ? hostedProvider.models.filter((item): item is ProviderCatalogModelRecord => Boolean(item) && typeof item === 'object')
      : [];
    const routeModel = models.find((item) => readString(item.id).toLowerCase() === preferredModelId) ?? null;
    const routeModelId = tierId;
    const contextWindowTokens = resolveModelContextWindow(
      routeModel?.id,
      Number(routeModel?.context_window_tokens ?? 0) || null,
    );
    const reasoningLevels: ChatReasoningEffort[] = tierId === 'light'
      ? ['medium']
      : tierId === 'pro'
        ? ['high']
        : ['max'];
    const defaultReasoningEffort: ChatReasoningEffort = tierId === 'light'
      ? 'medium'
      : tierId === 'pro'
        ? 'high'
        : 'max';
    return {
      id: tierId,
      label: EMPYRALIS_TIER_LABELS[tierId],
      providerId: readString(hostedProvider.id) || 'empyralis',
      providerLabel: readString(hostedProvider.label) || 'Empyralis',
      routeProviderId: 'empyralis',
      routeModelId,
      supportsReasoning: true,
      reasoningLevels,
      contextWindowTokens,
      defaultReasoningEffort,
      uiSection: 'empyralis',
    };
  }) : [];

  const userOwnedOptions = userOwnedProviders.flatMap((provider) => {
    const models = Array.isArray(provider.models)
      ? provider.models.filter((item): item is ProviderCatalogModelRecord => Boolean(item) && typeof item === 'object')
      : [];
    const providerId = readString(provider.id);
    const providerLabel = readString(provider.label) || providerId;
    const routeKind = providerRouteKind(provider);
    if (routeKind === 'empyralis') {
      return [];
    }
    if (!tierPolicy.userOwnedAllowed[routeKind]) {
      return [];
    }
    const routePathLabel = routeKind === 'local_ai'
      ? 'Connected computer'
      : routeKind === 'my_ai_account'
        ? 'My AI Account'
        : 'My API Key';
    return models.flatMap((model) => {
      const modelId = readString(model.id);
      if (!modelId || !providerId) {
        return [];
      }
      const supportsReasoning = model.supports_reasoning !== false;
      const label = `${providerLabel} · ${readString(model.label) || modelId} · ${routePathLabel}`;
      const defaultReasoningEffort: ChatReasoningEffort | null = supportsReasoning ? 'medium' : null;
      return [{
        id: `${routeKind}:${providerId}:${modelId}`,
        label,
        providerId,
        providerLabel: providerLabel || null,
        routeProviderId: providerId,
        routeModelId: modelId,
        supportsReasoning,
        reasoningLevels: resolveReasoningLevels(model, providerId, modelId, supportsReasoning),
        contextWindowTokens: resolveModelContextWindow(modelId, Number(model.context_window_tokens ?? 0) || null),
        defaultReasoningEffort,
        uiSection: routeKind,
      }];
    });
  });

  const uniqueUserOwned = new Map<string, ChatModelOption>();
  for (const option of userOwnedOptions) {
    if (!uniqueUserOwned.has(option.id)) {
      uniqueUserOwned.set(option.id, option);
    }
  }
  const normalizedUserOwned = Array.from(uniqueUserOwned.values());
  if (tierOptions.length > 0) {
    return [...tierOptions, ...normalizedUserOwned];
  }
  if (normalizedUserOwned.length > 0) {
    return normalizedUserOwned;
  }
  return [disconnectedModelOption()];
}

export function compactComposerLabel(label: string, fallback: string): string {
  const source = readString(label) || readString(fallback);
  if (!source) {
    return 'Auto route';
  }

  const gptMatch = source.match(/gpt[-\s]?(\d+(?:\.\d+)?)/i);
  if (gptMatch) {
    return `GPT-${gptMatch[1]}`;
  }

  if (/default workspace model/i.test(source)) {
    return 'Auto route';
  }

  const trimmed = source.split(/[(/]/, 1)[0]?.trim() || source;
  return trimmed.length > 18 ? `${trimmed.slice(0, 18).trim()}…` : trimmed;
}

export function normalizeHostedCreditValueForChat(
  record: Record<string, unknown>,
  usdKey: string,
  creditKey: string,
): number {
  const explicitCredits = readNumber(record[creditKey], Number.NaN);
  if (Number.isFinite(explicitCredits)) {
    return Math.max(0, explicitCredits);
  }
  const creditsPerUsd = Math.max(1, readNumber(record.credits_per_usd, 1000));
  return Math.max(0, readNumber(record[usdKey], 0) * creditsPerUsd);
}

export function normalizeHostedCreditStateForChat(summary: Record<string, unknown> | null): ChatHostedCreditState {
  const hosted = readObject(summary?.hosted_sage_ai);
  return {
    monthlyCreditCap: normalizeHostedCreditValueForChat(hosted, 'monthly_cap_usd', 'monthly_credit_cap'),
    monthlyCreditsUsed: normalizeHostedCreditValueForChat(hosted, 'monthly_cost_usd', 'monthly_credits_used'),
    monthlyCreditsRemaining: normalizeHostedCreditValueForChat(hosted, 'monthly_remaining_usd', 'monthly_credits_remaining'),
  };
}

export function hasArtifactStorageIntent(message: string): boolean {
  const normalized = readString(message).toLowerCase();
  if (!normalized) {
    return false;
  }
  return [
    'screenshot',
    'recording',
    'artifact',
    'download',
    'export',
    'pdf',
    'csv',
    'save file',
    'upload file',
    'trace',
  ].some((marker) => normalized.includes(marker));
}

export function resolveVirtualRuntimeKind(
  executionPlacement: string,
  message: string,
): 'virtual_browser' | 'virtual_desktop' | 'virtual_code_sandbox' | null {
  const runtimeToken = readString(executionPlacement).toLowerCase();
  const draftToken = readString(message).toLowerCase();
  if (runtimeToken.includes('virtual_desktop')) {
    return 'virtual_desktop';
  }
  if (runtimeToken.includes('virtual_code_sandbox') || runtimeToken.includes('sandbox')) {
    return 'virtual_code_sandbox';
  }
  if (runtimeToken.includes('virtual_browser') || runtimeToken.includes('browser')) {
    return 'virtual_browser';
  }
  if (
    runtimeToken.includes('cloud')
    && [
      'website',
      'portal',
      'browser',
      'crawl',
      'scrape',
      'monitor',
      'web',
    ].some((marker) => draftToken.includes(marker))
  ) {
    return 'virtual_browser';
  }
  return null;
}

export function estimatedAiTierCredits(tierId: string, draft: string): number {
  const tier = readString(tierId).toLowerCase() as typeof EMPYRALIS_TIER_IDS[number];
  if (!EMPYRALIS_TIER_SET.has(tier)) {
    return 0;
  }
  const base = EMPYRALIS_TIER_ESTIMATED_CREDITS[tier];
  const draftLength = Math.max(0, readString(draft).length);
  const lengthMultiplier = Math.min(2.5, 1 + draftLength / 1600);
  return Math.max(0, Math.round(base * lengthMultiplier));
}

export function buildPreRunCostEstimate({
  selectedModelOption,
  selectedExecutionPlacement,
  draft,
  hostedCreditState,
}: {
  selectedModelOption: ChatModelOption;
  selectedExecutionPlacement: string;
  draft: string;
  hostedCreditState: ChatHostedCreditState;
}): ComposerPreRunCostEstimate | null {
  const selectedTierId = readString(selectedModelOption.id).toLowerCase();
  const hostedTierSelected = selectedModelOption.uiSection === 'empyralis'
    && EMPYRALIS_TIER_SET.has(selectedTierId as typeof EMPYRALIS_TIER_IDS[number]);
  const aiCredits = hostedTierSelected ? estimatedAiTierCredits(selectedTierId, draft) : 0;
  const virtualRuntimeKind = resolveVirtualRuntimeKind(selectedExecutionPlacement, draft);
  const runtimeCredits = virtualRuntimeKind ? VIRTUAL_RUNTIME_ESTIMATED_CREDITS[virtualRuntimeKind] : 0;
  const artifactCredits = hasArtifactStorageIntent(draft) ? ARTIFACT_ESTIMATED_CREDITS : 0;
  const totalCredits = Math.max(0, aiCredits + runtimeCredits + artifactCredits);

  const detailParts: string[] = [];
  if (aiCredits > 0) {
    detailParts.push(`${readString(selectedModelOption.label) || 'Pro'} AI`);
  } else if (selectedModelOption.uiSection === 'my_api_key') {
    detailParts.push('My API Key route');
  } else if (selectedModelOption.uiSection === 'my_ai_account') {
    detailParts.push('My AI Account route');
  } else if (selectedModelOption.uiSection === 'local_ai') {
    detailParts.push('Local AI route');
  }
  if (runtimeCredits > 0) {
    if (virtualRuntimeKind === 'virtual_browser') {
      detailParts.push('cloud browser time');
    } else if (virtualRuntimeKind === 'virtual_desktop') {
      detailParts.push('cloud desktop time');
    } else {
      detailParts.push('cloud code sandbox time');
    }
  }
  if (artifactCredits > 0) {
    detailParts.push('artifact/storage');
  }

  const warnings: string[] = [];
  if (hostedTierSelected && hostedCreditState.monthlyCreditCap > 0) {
    const utilization = hostedCreditState.monthlyCreditsUsed / hostedCreditState.monthlyCreditCap;
    if (utilization >= 0.85) {
      warnings.push('Monthly cap near limit');
    }
    if (hostedCreditState.monthlyCreditsRemaining <= Math.max(totalCredits * 3, 75)) {
      warnings.push('Low balance');
    }
  }
  if (selectedTierId === 'max') {
    warnings.push('Max tier cost warning');
  }
  if (
    runtimeCredits > 0
    && (
      readString(draft).length > 300
      || /(monitor|crawl|scrape|batch|all pages|every item|run all)/i.test(draft)
    )
  ) {
    warnings.push('Long cloud computer task warning');
  }

  const detail = detailParts.length > 0
    ? `Includes ${detailParts.join(' + ')}`
    : 'No hosted AI credits expected for this route';

  if (!readString(draft) && warnings.length === 0) {
    return null;
  }

  return {
    estimateLabel: `Estimated: ~${Math.max(0, Math.round(totalCredits))} credits`,
    detail,
    warnings,
  };
}

export function inferReasoningLevels(
  providerId: string | null,
  modelId: string,
  supportsReasoning: boolean,
): ChatReasoningEffort[] {
  if (!supportsReasoning) {
    return ['medium'];
  }

  const normalizedProvider = readString(providerId).toLowerCase();
  const normalizedModel = readString(modelId).toLowerCase();

  if (normalizedProvider === 'ollama' || normalizedModel.includes('ollama/')) {
    return ['low', 'medium'];
  }

  if (
    normalizedModel.startsWith('o1')
    || normalizedModel.startsWith('o3')
    || normalizedModel.includes('/o1')
    || normalizedModel.includes('/o3')
    || normalizedModel.includes('claude')
  ) {
    return ['low', 'medium', 'high', 'xhigh'];
  }

  if (normalizedModel.includes('gpt-')) {
    return ['low', 'medium', 'high'];
  }

  return ['low', 'medium', 'high'];
}

export function formatContextWindowLabel(contextWindowTokens: number | null): string | null {
  if (!contextWindowTokens || contextWindowTokens <= 0) {
    return null;
  }
  const label = contextWindowTokens >= 1000
    ? `${Math.round(contextWindowTokens / 1000)}k`
    : String(contextWindowTokens);
  return `${label} context`;
}

export function resolveReasoningLevels(
  model: ProviderCatalogModelRecord,
  providerId: string | null,
  modelId: string,
  supportsReasoning: boolean,
): ChatReasoningEffort[] {
  const explicitLevels = Array.isArray(model.reasoning_levels)
    ? model.reasoning_levels
      .map((value) => readString(value).toLowerCase())
      .filter((value): value is ChatReasoningEffort => VALID_REASONING_LEVELS.includes(value as ChatReasoningEffort))
    : [];

  if (explicitLevels.length > 0) {
    return explicitLevels;
  }

  return inferReasoningLevels(providerId, modelId, supportsReasoning);
}
export function reasoningLabel(value: ChatReasoningEffort): string {
  switch (value) {
    case 'none':
      return 'None';
    case 'minimal':
      return 'Minimal';
    case 'low':
      return 'Low';
    case 'medium':
      return 'Medium';
    case 'high':
      return 'High';
    case 'xhigh':
      return 'Extra high';
    case 'max':
      return 'Max';
    default:
      return 'Medium';
  }
}

export function findProviderFailureIntervention(interventions: unknown[]): Record<string, unknown> | null {
  if (!Array.isArray(interventions)) {
    return null;
  }
  for (const item of interventions) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const kind = String(record.kind ?? record.type ?? '').trim().toLowerCase();
    const code = String(record.code ?? '').trim().toLowerCase();
    if (kind === 'provider_error' || kind === 'system_error' || code.includes('provider') || code.includes('credential')) {
      return record;
    }
  }
  return null;
}

export function createCanonicalAssistantMessage(
  response: WorkstationTurnResponse,
  threadId: string,
): WorkstationChatMessageRecord | null {
  const reply = String(response.reply ?? '').trim();
  const approvals = Array.isArray(response.approvals) ? response.approvals : [];
  const interventions = Array.isArray(response.interventions) ? response.interventions : [];
  const runId = typeof response.run_id === 'string' ? response.run_id : null;
  const metadata =
    response.metadata && typeof response.metadata === 'object'
      ? { ...(response.metadata as Record<string, unknown>) }
      : {};
  const responseRecord = response as Record<string, unknown>;
  const resultMetadata = readObject(metadata.result_metadata);
  const contextUsed = readObject(metadata.context_used);
  const resultContextUsed = readObject(resultMetadata.context_used);
  if (!contextUsed && resultContextUsed) {
    metadata.context_used = resultContextUsed;
  }
  const effectiveProvider = readString(responseRecord.provider)
    || readString(metadata.effective_provider)
    || readString(resultMetadata.provider)
    || readString(readObject(metadata.context_used).effective_provider);
  const effectiveModel = readString(responseRecord.model)
    || readString(metadata.effective_model)
    || readString(resultMetadata.model)
    || readString(readObject(metadata.context_used).effective_model);
  if (effectiveProvider) {
    metadata.effective_provider = effectiveProvider;
  }
  if (effectiveModel) {
    metadata.effective_model = effectiveModel;
  }
  const providerFailureIntervention = findProviderFailureIntervention(interventions);
  const content = reply || (
    String(response.status ?? '').trim().toLowerCase() === 'failed' || String(response.error ?? '').trim()
      ? "Sage couldn't complete that turn."
      : ''
  );
  if (!content) {
    return null;
  }
  if (!reply && providerFailureIntervention && typeof metadata.display_kind !== 'string') {
    metadata.display_kind = 'provider_error';
  }
  if (reply && isProviderRuntimeGateMessage(reply) && typeof metadata.display_kind !== 'string') {
    metadata.display_kind = 'provider_error';
  }

  return {
    id: `${threadId}:assistant:${Date.now()}`,
    role: 'assistant',
    content,
    status: typeof response.status === 'string' ? response.status : 'completed',
    createdAt: new Date().toISOString(),
    runId,
    approvals,
    interventions,
    artifacts: normalizeArtifactReferences(metadata),
    metadata,
  };
}

export function createCanonicalUserMessage(text: string, threadId: string): WorkstationChatMessageRecord {
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

export function createPendingUserMessage(
  text: string,
  threadId: string,
  clientRequestId: string,
): WorkstationChatMessageRecord {
  return {
    ...createCanonicalUserMessage(text, threadId),
    metadata: {
      client_request_id: clientRequestId,
      request_id: clientRequestId,
      pending_confirmation: true,
    },
  };
}

export function createClientTurnRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createIncompleteAssistantMessage(
  text: string,
  threadId: string,
  metadata: Record<string, unknown> = {},
): WorkstationChatMessageRecord | null {
  if (!text.trim()) {
    return null;
  }
  return {
    id: `${threadId}:assistant:partial:${Date.now()}`,
    role: 'assistant',
    content: text,
    status: 'incomplete',
    createdAt: new Date().toISOString(),
    runId: null,
    approvals: [],
    interventions: [],
    artifacts: normalizeArtifactReferences(metadata),
    metadata: {
      ...metadata,
      incomplete: true,
    },
  };
}

export function messageRequestId(message: WorkstationChatMessageRecord | null | undefined): string {
  if (!message) {
    return '';
  }
  return readString(readObject(message.metadata).client_request_id)
    || readString(readObject(message.metadata).request_id);
}

export function canonicalIncludesMessage(
  messages: WorkstationChatMessageRecord[],
  candidate: WorkstationChatMessageRecord | null | undefined,
): boolean {
  if (!candidate) {
    return false;
  }
  const candidateRequestId = messageRequestId(candidate);
  if (candidateRequestId) {
    if (messages.some((message) => messageRequestId(message) === candidateRequestId)) {
      return true;
    }
    // Some backend turn snapshots omit request ids for user turns. Fall back to role+content
    // so pending bubbles collapse instead of duplicating the same submitted text.
    const normalizedContent = readString(candidate.content);
    return messages.some((message) =>
      message.role === candidate.role
      && readString(message.content) === normalizedContent,
    );
  }
  const normalizedContent = readString(candidate.content);
  return messages.some((message) =>
    message.role === candidate.role
    && readString(message.content) === normalizedContent,
  );
}

export function projectedAssistantLooksSynthetic(
  cell: Extract<CodexTranscriptCell, { kind: 'assistant' }> | null,
): boolean {
  if (!cell) {
    return false;
  }
  return isProviderRuntimeGateMessage(readString(cell.content));
}

export function createActivityStepMessage(
  step: LiveActivityStepState,
  threadId: string,
): WorkstationChatMessageRecord {
  const detail = readString(step.detail);
  return {
    id: `${threadId}:activity:${step.id}`,
    role: 'assistant',
    content: detail ? `${step.label} · ${detail}` : step.label,
    status: step.status,
    createdAt: step.createdAt,
    runId: null,
    approvals: [],
    interventions: [],
    artifacts: [],
    metadata: {
      display_kind: 'activity_step',
      step_kind: step.kind,
      step_status: step.status,
    },
  };
}

export function upsertLiveActivityStep(
  current: LiveActivityStepState[],
  next: LiveActivityStepState,
): LiveActivityStepState[] {
  const stepKey = next.toolCallId || next.id;
  const existingIndex = current.findIndex((item) => (item.toolCallId || item.id) === stepKey);
  if (existingIndex < 0) {
    return [...current, next];
  }
  const updated = [...current];
  updated[existingIndex] = {
    ...updated[existingIndex],
    ...next,
    label: readString(next.label) || updated[existingIndex].label,
    detail: readString(next.detail) || updated[existingIndex].detail,
    createdAt: updated[existingIndex].createdAt,
  };
  return updated;
}

export function normalizeStepStatus(value: unknown): string {
  const normalized = readString(value).toLowerCase();
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') {
    return 'done';
  }
  if (normalized === 'error' || normalized === 'failed') {
    return 'error';
  }
  return 'active';
}

export function normalizeStepEvent(
  payload: Record<string, unknown>,
): LiveActivityStepState | null {
  const id = readString(payload.id);
  const label = readString(payload.label);
  if (!id || !label) {
    return null;
  }
  return {
    id,
    kind: readString(payload.kind) || 'tool',
    label,
    detail: readString(payload.detail),
    status: normalizeStepStatus(payload.status),
    toolCallId: null,
    createdAt: new Date().toISOString(),
  };
}

export function settleLiveActivitySteps(
  steps: LiveActivityStepState[],
  status: 'done' | 'error' = 'done',
): LiveActivityStepState[] {
  return steps.map((step) => ({
    ...step,
    status: step.status === 'active' ? status : step.status,
  }));
}

export function summarizeRuns(runs: CanonicalRunSummary[]): string {
  if (runs.length === 0) {
    return 'No active runs yet';
  }
  const latest = runs[0];
  return `${runs.length} tracked · latest ${String(latest.status ?? 'unknown')}`;
}

export function summarizeApprovals(approvals: CanonicalApprovalSummary[]): string {
  if (approvals.length === 0) {
    return 'No pending approvals';
  }
  return `${approvals.length} awaiting action`;
}

export function countArtifacts(messages: WorkstationChatMessageRecord[]): number {
  return messages.reduce((count, message) => count + message.artifacts.length, 0);
}

export function preferredRuntimeTarget(runtimeTargets: WorkspaceBootstrapRuntimeTarget[]): WorkspaceBootstrapRuntimeTarget | null {
  return runtimeTargets.find((target) => target.preferred) ?? runtimeTargets[0] ?? null;
}

export function localCompanionTarget(runtimeTargets: WorkspaceBootstrapRuntimeTarget[]): WorkspaceBootstrapRuntimeTarget | null {
  return runtimeTargets.find((target) => target.id === 'local_companion') ?? null;
}

export function localDevicePlatformLabel(platform: string | null, fallbackLabel: string | null): string {
  const normalized = String(platform || '').trim().toLowerCase();
  if (normalized === 'macos' || normalized === 'darwin') {
    return 'Mac';
  }
  if (normalized === 'windows' || normalized === 'win32') {
    return 'Windows';
  }
  if (normalized === 'linux') {
    return 'Linux';
  }
  const fallback = String(fallbackLabel || '').trim();
  return fallback || 'Device';
}

export function summarizeRuntimeCard(runtimeTargets: WorkspaceBootstrapRuntimeTarget[]): RuntimeSummaryCard {
  const preferred = preferredRuntimeTarget(runtimeTargets);
  const local = localCompanionTarget(runtimeTargets);
  const preferredLabel = preferred?.label ?? 'Cloud runtime';
  const preferredStatus = preferred?.statusLabel ?? (preferred?.online ? 'Ready' : 'Unavailable');

  if (!local || !local.available) {
    return {
      tone: 'neutral',
      title: `${preferredLabel} is carrying Sage`,
      meta: `${preferredStatus} · cloud-first`,
      body: 'Sage stays in cloud mode until a computer is connected. Computer work will not start from this workspace yet.',
      preferredPill: `${preferredLabel} · ${preferredStatus}`,
      localPill: 'Computer · needs connection',
    };
  }

  if (!local.online) {
    return {
      tone: 'warning',
      title: 'Connected computer is offline',
      meta: `${preferredLabel} remains active`,
      body: local.statusReason || 'Sage will stay in cloud mode until the connected computer reconnects.',
      preferredPill: `${preferredLabel} · ${preferredStatus}`,
      localPill: `Computer · ${local.statusLabel ?? 'Offline'}`,
    };
  }

  if (!local.healthy) {
    return {
      tone: 'warning',
      title: 'Connected computer needs attention',
      meta: `${preferredLabel} remains active`,
      body: local.statusReason || 'Sage will avoid computer work until the connection is healthy again.',
      preferredPill: `${preferredLabel} · ${preferredStatus}`,
      localPill: `Computer · ${local.statusLabel ?? 'Needs attention'}`,
    };
  }

  return {
    tone: 'success',
    title: 'Connected computer is ready',
    meta: `${local.sampleAttachmentLabel ?? local.label} · explicit approval`,
    body: 'Sage still uses cloud execution for ordinary turns. If a step needs device work, Sage pauses for explicit approval before using the connected computer.',
    preferredPill: `${preferredLabel} · ${preferredStatus}`,
    localPill: `Computer · ${local.statusLabel ?? 'Ready'}`,
  };
}

export function latestRunSummary(run: CanonicalRunSummary | undefined): string {
  if (!run) {
    return 'No active run is attached to this thread yet.';
  }
  const runId = readString(run.run_id) || 'Run';
  const status = readString(run.status) || 'unknown';
  return `${runId} is ${status}.`;
}

export function latestApprovalSummary(approval: CanonicalApprovalSummary | undefined): string {
  if (!approval) {
    return 'No approval is blocking Sage right now.';
  }
  return readString(approval.prompt) || 'A pending approval is attached to this thread.';
}

export function isGatewayBrowserMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes('browser attach')
    || normalized.includes('browser session')
    || normalized.includes('signed-in')
    || normalized.includes('localhost')
    || normalized.includes('private page')
    || normalized.includes('private session');
}

export function classifyStatusNotice(message: string): {
  tone: StatusNoticeTone;
  title: string;
  body: string;
  requiresLocalAccess: boolean;
  actionTarget: 'gateway' | 'integrations' | null;
  actionLabel: string | null;
} {
  if (/^(memory|notification|policy|service|channel).*(saved|updated|pinned|unpinned|forgotten|corrected)/i.test(message)) {
    return {
      tone: 'success',
      title: 'Updated',
      body: message,
      requiresLocalAccess: false,
      actionTarget: null,
      actionLabel: null,
    };
  }
  if (isGatewayBrowserMessage(message)) {
    return {
      tone: 'warning',
      title: 'Connected computer browser needed',
      body: 'Localhost pages, signed-in sites, and private browser sessions stay on the selected computer. Open Integrations to manage connected computer access.',
      requiresLocalAccess: true,
      actionTarget: 'integrations',
      actionLabel: 'Open Integrations',
    };
  }
  if (isLocalCompanionGateMessage(message)) {
    return {
      tone: 'warning',
      title: 'Connected computer attention needed',
      body: message,
      requiresLocalAccess: true,
      actionTarget: 'integrations',
      actionLabel: 'Open Integrations',
    };
  }
  if (/^turn submitted/i.test(message)) {
    return {
      tone: 'success',
      title: 'Submitted',
      body: message,
      requiresLocalAccess: false,
      actionTarget: null,
      actionLabel: null,
    };
  }
  if (isProviderRuntimeGateMessage(message) || /provider error|api key|credential|ollama/i.test(message)) {
    return {
      tone: 'warning',
      title: 'AI model attention needed',
      body: /api key|credential/i.test(message)
        ? 'Check your AI model key or quota in Integrations.'
        : 'Choose Empyralis credits, add an AI model key, or connect a computer.',
      requiresLocalAccess: false,
      actionTarget: 'integrations',
      actionLabel: 'Open Integrations',
    };
  }
  return {
    tone: 'neutral',
    title: 'Notice',
    body: message,
    requiresLocalAccess: false,
    actionTarget: null,
    actionLabel: null,
  };
}

export function isLocalCompanionGateMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes('local companion')
    || normalized.includes('gateway')
    || normalized.includes('local worker')
    || normalized.includes('requires local companion execution')
    || normalized.includes('requires gateway execution')
    || normalized.includes('cannot run that request in this workspace right now')
    || normalized.includes('path must stay inside local companion root')
    || normalized.includes('path must stay inside the gateway workspace folder');
}

export function browserReadinessPill(
  doctor: GatewayReadinessDoctorPayload | null,
  {
    gatewayOnline,
  }: {
    gatewayOnline: boolean;
  },
): SageReadinessPill | null {
  if (!gatewayOnline || !doctor) {
    return null;
  }
  const browserRecord = readObject(doctor.browser);
  const browserAttachRecord = readObject(doctor.browser_attach);
  const browserStatus = readString(browserRecord.status).toLowerCase();
  const attachStatus = readString(browserAttachRecord.status).toLowerCase();
  const attachApprovalRequiredCount = readNumber(browserAttachRecord.approval_required_count, 0);
  const attachFailedCount = readNumber(browserAttachRecord.failed_count, 0);
  const attachPendingCount = readNumber(browserAttachRecord.pending_count, 0);
  const attachCount = readNumber(browserAttachRecord.count, 0);

  if (attachApprovalRequiredCount > 0) {
    return {
      id: 'browser-approval',
      label: 'Browser: Needs your OK',
      tone: 'warning',
      target: 'integrations',
    };
  }
  if (attachFailedCount > 0 || attachStatus === 'fail') {
    return {
      id: 'browser-attach-failed',
      label: 'Browser: Attach failed',
      tone: 'danger',
      target: 'integrations',
    };
  }
  if (attachCount > 0 && attachPendingCount > 0) {
    return {
      id: 'browser-attach-pending',
      label: 'Browser: Finish attach',
      tone: 'warning',
      target: 'integrations',
    };
  }
  if (browserStatus === 'fail') {
    return {
      id: 'browser-unavailable',
      label: 'Browser: Unavailable',
      tone: 'danger',
      target: 'integrations',
    };
  }
  if (browserStatus === 'warn') {
    return {
      id: 'browser-attention',
      label: 'Browser: Needs attention',
      tone: 'warning',
      target: 'integrations',
    };
  }
  return null;
}

export function normalizeSageMemorySnapshot(payload: unknown): SageMemorySnapshot {
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

export function defaultSageProfileSnapshot(): SageProfileSnapshot {
  return {
    profile: {
      user_name: '',
      identity_summary: '',
      communication_style: '',
      recurring_responsibility: '',
      standing_rules: [],
      standing_rules_text: '',
    },
    bootstrap: {
      complete: false,
      answered_count: 0,
      total_count: 5,
      progress_label: '0/5',
      current_question: null,
    },
  };
}

export function normalizeSageProfileSnapshot(payload: unknown): SageProfileSnapshot {
  const record = payload && typeof payload === 'object' ? payload as WorkstationSageProfileRecord : {};
  const profileRecord = record.profile && typeof record.profile === 'object'
    ? record.profile as Record<string, unknown>
    : {};
  const bootstrapRecord = record.bootstrap && typeof record.bootstrap === 'object'
    ? record.bootstrap as Record<string, unknown>
    : {};
  const standingRules = Array.isArray(profileRecord.standing_rules)
    ? profileRecord.standing_rules.flatMap((item) => {
      const value = readString(item);
      return value ? [value] : [];
    })
    : [];
  const currentQuestionRecord = bootstrapRecord.current_question && typeof bootstrapRecord.current_question === 'object'
    ? bootstrapRecord.current_question as Record<string, unknown>
    : null;
  return {
    profile: {
      user_name: readString(profileRecord.user_name),
      identity_summary: readString(profileRecord.identity_summary),
      communication_style: readString(profileRecord.communication_style),
      recurring_responsibility: readString(profileRecord.recurring_responsibility),
      standing_rules: standingRules,
      standing_rules_text: readString(profileRecord.standing_rules_text) || standingRules.join('\n'),
    },
    bootstrap: {
      complete: Boolean(bootstrapRecord.complete),
      answered_count: readNumber(bootstrapRecord.answered_count, 0),
      total_count: Math.max(1, readNumber(bootstrapRecord.total_count, 5)),
      progress_label: readString(bootstrapRecord.progress_label) || `${readNumber(bootstrapRecord.answered_count, 0)}/${Math.max(1, readNumber(bootstrapRecord.total_count, 5))}`,
      current_question: currentQuestionRecord
        ? {
          id: readString(currentQuestionRecord.id),
          prompt: readString(currentQuestionRecord.prompt),
          placeholder: readString(currentQuestionRecord.placeholder),
        }
        : null,
    },
  };
}

export function humanizeSageSetupFailure(error: unknown, mode: 'load' | 'save'): string {
  if (error instanceof Error && /timed out|took too long/i.test(error.message)) {
    return mode === 'save'
      ? 'Sage setup took too long to save this answer. Retry in a moment.'
      : 'Sage setup took too long to load. You can retry instead of waiting on this screen.';
  }
  if (error instanceof WorkstationClientError) {
    if (error.status === 404) {
      return mode === 'save'
        ? 'Sage setup is temporarily unavailable right now, so this answer could not be saved.'
        : 'Sage setup is temporarily unavailable right now. Retry after the setup service is ready.';
    }
    if (error.status === 403) {
      return 'Sage setup is unavailable in this workspace right now.';
    }
    if (error.status >= 500 || error.status === 0 || error.retryable) {
      return mode === 'save'
        ? 'Sage setup could not save this answer right now. Retry in a moment.'
        : 'Sage setup is temporarily unavailable right now. Retry in a moment.';
    }
  }
  return mode === 'save'
    ? 'Sage setup could not save this answer right now. Retry when ready.'
    : 'Sage setup is temporarily unavailable right now. Retry when ready.';
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export function hostedCreditsFallbackProvider(): ProviderCatalogRecord {
  return {
    id: 'deepseek',
    kind: 'provider',
    label: 'DeepSeek',
    state: 'configured',
    usable: true,
    active: true,
    configured: true,
    hidden: false,
    default_model: 'deepseek-v4-flash',
    default_auth_mode: 'platform_runtime',
    credential_plane: 'platform_runtime',
    platform_runtime_allowed: true,
    provider_scopes: ['sage_personal'],
    sage_visible: true,
    models: [
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        provider: 'deepseek',
        supports_reasoning: false,
        reasoning_levels: ['medium'],
        context_window_tokens: 1_000_000,
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        provider: 'deepseek',
        supports_reasoning: true,
        reasoning_levels: ['high', 'max'],
        context_window_tokens: 1_000_000,
      },
      {
        id: 'deepseek-chat',
        label: 'DeepSeek Chat',
        provider: 'deepseek',
        supports_reasoning: true,
        reasoning_levels: ['low', 'medium', 'high'],
      },
    ],
  };
}

export function normalizeSageToolPolicy(payload: unknown): SageToolPolicyRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const tools = Array.isArray(record.tools) ? record.tools : [];
  return tools.flatMap((item) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const key = readString(candidate.key);
    if (!key) {
      return [];
    }
    return [{
      key,
      enabled: candidate.enabled !== false,
    }];
  });
}

export function normalizeConnectorVaultRecords(payload: unknown): VaultCredentialRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is VaultCredentialRecord => Boolean(item) && typeof item === 'object')
    : [];
}

export function toolPolicyEnabled(policy: SageToolPolicyRecord[], key: string): boolean {
  const record = policy.find((item) => item.key === key);
  return record ? record.enabled : false;
}

export function hasConnectedConnector(
  connectors: VaultCredentialRecord[],
  connectorIds: string[],
): boolean {
  const normalizedIds = new Set(connectorIds.map((item) => readString(item).toLowerCase()).filter(Boolean));
  return connectors.some((connector) => {
    const connectorId = readString(connector.connector || connector.provider).toLowerCase();
    if (!normalizedIds.has(connectorId)) {
      return false;
    }
    const metadata = readObject(connector.metadata);
    const verification = readObject(metadata.capability_verification);
    const runtimeUsable = verification.runtime_usable;
    const authenticated = verification.authenticated;
    if (typeof runtimeUsable === 'boolean') {
      return runtimeUsable;
    }
    if (typeof authenticated === 'boolean') {
      return authenticated;
    }
    return true;
  });
}

export function defaultSageMemoryDraft(): SageMemoryDraft {
  return {
    entryId: null,
    category: 'safe_general',
    title: '',
    content: '',
    pinned: false,
  };
}

export function isTransientBackgroundReadError(error: unknown): boolean {
  if (!(error instanceof WorkstationClientError)) {
    return false;
  }
  if (error.retryable) {
    return true;
  }
  return error.status === 0 || error.status >= 500;
}

export function shouldSuppressBackgroundRefreshNotice(error: unknown): boolean {
  if (isTransientBackgroundReadError(error)) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return /took too long to respond|could not connect|could not finish|capacity is busy/i.test(error.message);
}

export function memoryCategoryLabel(
  categories: SageMemoryCategoryRecord[],
  categoryId: string,
): string {
  return categories.find((item) => item.id === categoryId)?.label ?? categoryId.replace(/_/g, ' ');
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Not recorded';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function formatRelativeTime(value: string | null): string {
  if (!value) {
    return 'Just now';
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  const diffMs = parsed - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return formatter.format(diffDays, 'day');
  }
  const diffWeeks = Math.round(diffDays / 7);
  if (Math.abs(diffWeeks) < 5) {
    return formatter.format(diffWeeks, 'week');
  }
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return formatter.format(diffMonths, 'month');
  }
  const diffYears = Math.round(diffDays / 365);
  return formatter.format(diffYears, 'year');
}

export function runPreviewLabel(run: CanonicalRunSummary): string {
  const directCandidates = [
    run.first_user_message,
    run.message,
    run.prompt,
    run.input_preview,
    run.summary,
    run.result_summary,
    run.title,
  ];
  for (const candidate of directCandidates) {
    const value = readString(candidate);
    if (value) {
      return value;
    }
  }

  const metadata = readObject(run.metadata);
  const metadataCandidates = [
    metadata.first_user_message,
    metadata.message,
    metadata.prompt,
    metadata.input_preview,
    metadata.summary,
  ];
  for (const candidate of metadataCandidates) {
    const value = readString(candidate);
    if (value) {
      return value;
    }
  }

  return 'Continue the recent Sage thread';
}

export function runContextTitle(run: CanonicalRunSummary): string {
  const preview = runPreviewLabel(run);
  return preview.length > 48 ? `${preview.slice(0, 48).trim()}…` : preview;
}

export function resolveProviderModelContext({
  providers,
  selectedModelId,
  selectedModelLabel,
  selectedProviderId,
  modelOptions,
}: {
  providers: ProviderCatalogRecord[];
  selectedModelId: string;
  selectedModelLabel: string;
  selectedProviderId: string | null;
  modelOptions: ChatModelOption[];
}): {
  providerId: string | null;
  providerLabel: string | null;
  modelId: string | null;
  modelLabel: string | null;
} {
  const availableProviders = sortLaunchChatProviders(providers.filter(isProviderEligibleForModelSelector));
  const workspaceDefaultProviders = sortLaunchChatProviders(providers.filter(isProviderEligibleForWorkspaceDefault));
  const normalizedSelectedProviderId = readString(selectedProviderId);
  const selectedOption = modelOptions.find((option) => option.id === selectedModelId) ?? null;
  const selectedRouteProviderId = readString(selectedOption?.routeProviderId || selectedOption?.providerId);
  const selectedRouteModelId = readString(selectedOption?.routeModelId || selectedModelId);

  const findModelInProvider = (provider: ProviderCatalogRecord, modelId: string) => {
    const models = Array.isArray(provider.models)
      ? provider.models.filter((item): item is ProviderCatalogModelRecord => Boolean(item) && typeof item === 'object')
      : [];
    return models.find((model) => readString(model.id) === modelId) ?? null;
  };

  if (selectedModelId !== 'default') {
    if (selectedOption && selectedRouteProviderId && selectedRouteModelId) {
      const providerRecord = availableProviders.find((provider) => readString(provider.id) === selectedRouteProviderId) ?? null;
      const providerLabel = readString(providerRecord?.label) || readString(selectedOption.providerLabel) || selectedRouteProviderId;
      return {
        providerId: selectedRouteProviderId,
        providerLabel: providerLabel || null,
        modelLabel: readString(selectedOption.label) || selectedModelLabel || selectedRouteModelId,
        modelId: selectedRouteModelId,
      };
    }
    for (const provider of availableProviders) {
      const model = findModelInProvider(provider, selectedModelId);
      if (!model) {
        continue;
      }
      const providerLabel = readString(provider.label) || readString(provider.id);
      const modelLabel = readString(model.label) || readString(model.id);
      return {
        providerId: readString(provider.id) || null,
        providerLabel: providerLabel || null,
        modelLabel: modelLabel || null,
        modelId: readString(model.id) || null,
      };
    }
    if (normalizedSelectedProviderId && selectedModelLabel) {
      return {
        providerId: normalizedSelectedProviderId,
        providerLabel: normalizedSelectedProviderId,
        modelLabel: selectedModelLabel,
        modelId: selectedModelId,
      };
    }
    return {
      providerId: null,
      providerLabel: null,
      modelId: null,
      modelLabel: null,
    };
  }

  const orderedProviders = normalizedSelectedProviderId
    ? [
      ...workspaceDefaultProviders.filter((provider) => readString(provider.id) === normalizedSelectedProviderId),
      ...workspaceDefaultProviders.filter((provider) => readString(provider.id) !== normalizedSelectedProviderId),
    ]
    : workspaceDefaultProviders;

  for (const provider of orderedProviders) {
    const defaultModelId = readString(provider.default_model);
    if (!defaultModelId) {
      continue;
    }
    const model = findModelInProvider(provider, defaultModelId);
    const providerLabel = readString(provider.label) || readString(provider.id);
    const modelLabel = model
      ? readString(model.label) || readString(model.id)
      : readString(selectedModelLabel).replace(/^Workspace default \((.*)\)$/i, '$1');
    return {
      providerId: readString(provider.id) || null,
      providerLabel: providerLabel || null,
      modelLabel: modelLabel || null,
      modelId: model ? readString(model.id) || null : (defaultModelId || null),
    };
  }

  return {
    providerId: null,
    providerLabel: null,
    modelId: null,
    modelLabel: null,
  };
}

export function resolvePersistedSelectedModelId({
  providers,
  profiles,
  modelOptions,
}: {
  providers: ProviderCatalogRecord[];
  profiles: ProviderProfileRecord[];
  modelOptions: ChatModelOption[];
}): string {
  const optionById = new Map(
    modelOptions.map((option) => [readString(option.id), option] as const),
  );
  const availableModelIds = new Set(
    modelOptions
      .map((option) => readString(option.id))
      .filter((id) => id && id !== 'default'),
  );
  const eligibleProviderIds = new Set(
    providers
      .filter(isProviderEligibleForModelSelector)
      .map((provider) => readString(provider.id))
      .filter(Boolean),
  );

  for (const profile of sortProviderProfiles(profiles)) {
    const providerId = readString(profile.provider);
    if (!providerId || !eligibleProviderIds.has(providerId) || profile.enabled === false) {
      continue;
    }
    const metadata = profileMetadataRecord(profile);
    const selectionMode = readString(metadata.chat_model_selection).toLowerCase();
    const modelTier = readString(metadata.chat_model_tier).toLowerCase();
    if (selectionMode === 'explicit' && modelTier && availableModelIds.has(modelTier)) {
      return modelTier;
    }
    const modelId = readString(profile.model);
    if (selectionMode === 'explicit' && modelId && availableModelIds.has(modelId)) {
      return modelId;
    }
    if (selectionMode === 'explicit' && modelId) {
      const matchingOption = modelOptions.find((option) =>
        readString(option.routeProviderId || option.providerId) === providerId
        && readString(option.routeModelId || option.id) === modelId
      );
      if (matchingOption && optionById.has(readString(matchingOption.id))) {
        return readString(matchingOption.id);
      }
    }
  }

  return 'default';
}
