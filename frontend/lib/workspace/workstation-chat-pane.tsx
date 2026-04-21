'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

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
import {
  resolveModelContextWindow,
} from '@/lib/workspace/model-capabilities';
import { SageTraceView } from '@/lib/workspace/sage-trace-view';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';
import type { WorkspaceBootstrapRuntimeTarget } from '@/lib/workspace/workspace-bootstrap';
import {
  resolveWorkstationApproval,
  subscribeWorkstationApprovalResolved,
} from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { subscribeWorkstationProviderChanged } from '@/lib/workspace/workstation-provider-events';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationClientError,
  type WorkstationAgentTraceEvent,
  type WorkstationAgentTraceRecord,
  type ProviderCatalogModelRecord,
  type ProviderCatalogRecord,
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

type StatusNoticeTone = 'neutral' | 'success' | 'warning';

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

type ChatMachineTrust = 'personal' | 'agent';

type ChatAutonomyMode = 'approval' | 'full';

type ChatReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

type ChatModelOption = {
  id: string;
  label: string;
  providerId: string | null;
  providerLabel: string | null;
  supportsReasoning: boolean;
  reasoningLevels: ChatReasoningEffort[];
  contextWindowTokens: number | null;
};

const VALID_REASONING_LEVELS: ChatReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

const SYNTHETIC_TRANSCRIPT_MESSAGES = new Set([
  'Approval is required before Sage can use the local companion.',
  'Approval is required before Sage can continue.',
  'Local companion is unavailable right now, so Sage could not start device work.',
  'Sage needs your help before it can continue.',
  'Task accepted. Sage started work with the local companion.',
  'Task accepted. Sage started working on it.',
]);

const PRIMARY_THREAD_ID = 'primary';
const ACTIVE_THREAD_QUERY_KEY = 'chat:canonical:active-thread';
const ACTIVE_THREAD_STORAGE_PREFIX = 'empyralis.chat.active-thread.v1';
const RUNS_QUERY_KEY = 'chat:canonical:runs';
const APPROVALS_QUERY_KEY = 'chat:canonical:approvals';
const SAGE_MEMORY_QUERY_KEY = 'chat:canonical:sage-memory';
const RECENT_THREADS_QUERY_KEY = 'chat:canonical:recent-threads';

function activeThreadStorageKey(workspaceId: string): string {
  return `${ACTIVE_THREAD_STORAGE_PREFIX}:${workspaceId}`;
}

function readPersistedActiveThread(workspaceId: string): string | null {
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

function persistActiveThread(workspaceId: string, threadId: string): void {
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

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function formatElapsedClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function resolveTraceStartedAtMs(liveTrace: LiveTraceState | null): number | null {
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

function resolveTraceDurationSeconds(liveTrace: LiveTraceState | null, traceStartedAtMs: number | null): number {
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

function summarizeLiveTraceStep(liveTrace: LiveTraceState | null): {
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
        label: readString(data.summary) || readString(data.outcome) || 'Run complete',
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
        label: readString(data.task_summary) || readString(data.specialist_name) || 'Delegating work',
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

function isSyntheticTranscriptMessage(message: WorkstationChatMessageRecord): boolean {
  if (message.role === 'user') {
    return false;
  }
  return SYNTHETIC_TRANSCRIPT_MESSAGES.has(readString(message.content));
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
    }].filter((message) => !isSyntheticTranscriptMessage(message));
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

function normalizeProviderCatalogRecords(payload: unknown): ProviderCatalogRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const providers = (payload as Record<string, unknown>).providers;
  return Array.isArray(providers)
    ? providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
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

function isProviderEligibleForModelSelector(provider: ProviderCatalogRecord): boolean {
  const providerId = readString(provider.id).toLowerCase();
  if (!providerId || providerId === 'openai-codex') {
    return false;
  }
  return provider.usable === true || provider.active === true;
}

function isProviderEligibleForWorkspaceDefault(provider: ProviderCatalogRecord): boolean {
  const providerId = readString(provider.id).toLowerCase();
  if (!providerId || providerId === 'openai-codex') {
    return false;
  }
  const state = readString(provider.state).toLowerCase();
  if (provider.usable === true || provider.active === true) {
    return true;
  }
  return state === 'configured';
}

function workspaceDefaultModelOption(
  providers: ProviderCatalogRecord[] = [],
): ChatModelOption {
  const workspaceDefaultProvider = providers.find(isProviderEligibleForWorkspaceDefault) ?? null;
  return {
    id: 'default',
    label: 'Workspace default',
    providerId: workspaceDefaultProvider ? readString(workspaceDefaultProvider.id) || null : null,
    providerLabel: workspaceDefaultProvider
      ? readString(workspaceDefaultProvider.label) || readString(workspaceDefaultProvider.id) || null
      : null,
    supportsReasoning: false,
    reasoningLevels: ['low', 'medium', 'high'],
    contextWindowTokens: null,
  };
}

function disconnectedModelOption(): ChatModelOption {
  return workspaceDefaultModelOption();
}

function normalizeChatModelOptions(payload: unknown): ChatModelOption[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const providers = Array.isArray(record.providers)
    ? record.providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
    : [];
  const connectedProviders = providers.filter(isProviderEligibleForModelSelector);

  if (connectedProviders.length === 0) {
    return [disconnectedModelOption()];
  }

  const seen = new Set<string>();

  const options = connectedProviders.flatMap((provider) => {
    const models = Array.isArray(provider.models)
      ? provider.models.filter((item): item is ProviderCatalogModelRecord => Boolean(item) && typeof item === 'object')
      : [];
    const providerId = readString(provider.id) || null;
    const providerLabel = readString(provider.label) || providerId;

    return models.flatMap((model) => {
      const modelId = readString(model.id);
      if (!modelId || seen.has(modelId)) {
        return [];
      }
      seen.add(modelId);
      const supportsReasoning = model.supports_reasoning !== false;
      return [{
        id: modelId,
        label: readString(model.label) || modelId,
        providerId: readString(model.provider) || providerId,
        providerLabel: providerLabel || null,
        supportsReasoning,
        reasoningLevels: resolveReasoningLevels(model, providerId, modelId, supportsReasoning),
        contextWindowTokens: resolveModelContextWindow(modelId, Number(model.context_window_tokens ?? 0) || null),
      }];
    });
  });

  return options.length > 0 ? options : [workspaceDefaultModelOption(connectedProviders)];
}

function compactComposerLabel(label: string, fallback: string): string {
  const source = readString(label) || readString(fallback);
  if (!source) {
    return 'Default';
  }

  const gptMatch = source.match(/gpt[-\s]?(\d+(?:\.\d+)?)/i);
  if (gptMatch) {
    return `GPT-${gptMatch[1]}`;
  }

  if (/default workspace model/i.test(source)) {
    return 'Default';
  }

  const trimmed = source.split(/[(/]/, 1)[0]?.trim() || source;
  return trimmed.length > 18 ? `${trimmed.slice(0, 18).trim()}…` : trimmed;
}

function inferReasoningLevels(
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

function formatContextWindowLabel(contextWindowTokens: number | null): string | null {
  if (!contextWindowTokens || contextWindowTokens <= 0) {
    return null;
  }
  const label = contextWindowTokens >= 1000
    ? `${Math.round(contextWindowTokens / 1000)}k`
    : String(contextWindowTokens);
  return `${label} context`;
}

function resolveReasoningLevels(
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
function reasoningLabel(value: ChatReasoningEffort): string {
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
    default:
      return 'Medium';
  }
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

function findProviderFailureIntervention(interventions: unknown[]): Record<string, unknown> | null {
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
  if (!reply) {
    return null;
  }

  return {
    id: `${threadId}:assistant:${Date.now()}`,
    role: 'assistant',
    content: reply,
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

function localDevicePlatformLabel(platform: string | null, fallbackLabel: string | null): string {
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

function classifyStatusNotice(message: string): {
  tone: StatusNoticeTone;
  title: string;
  body: string;
  requiresLocalAccess: boolean;
} {
  if (/^(memory|notification|policy|service|channel).*(saved|updated|pinned|unpinned|forgotten|corrected)/i.test(message)) {
    return {
      tone: 'success',
      title: 'Updated',
      body: message,
      requiresLocalAccess: false,
    };
  }
  if (/^turn submitted/i.test(message)) {
    return {
      tone: 'success',
      title: 'Submitted',
      body: message,
      requiresLocalAccess: false,
    };
  }
  return {
    tone: 'neutral',
    title: 'Notice',
    body: message,
    requiresLocalAccess: false,
  };
}

function isLocalCompanionGateMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes('local companion')
    || normalized.includes('local worker')
    || normalized.includes('requires local companion execution')
    || normalized.includes('cannot run that request in this workspace right now')
    || normalized.includes('path must stay inside local companion root');
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

function isTransientBackgroundReadError(error: unknown): boolean {
  if (!(error instanceof WorkstationClientError)) {
    return false;
  }
  if (error.retryable) {
    return true;
  }
  return error.status === 0 || error.status >= 500;
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

function formatRelativeTime(value: string | null): string {
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

function runPreviewLabel(run: CanonicalRunSummary): string {
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

function runContextTitle(run: CanonicalRunSummary): string {
  const preview = runPreviewLabel(run);
  return preview.length > 48 ? `${preview.slice(0, 48).trim()}…` : preview;
}

function resolveProviderModelContext({
  providers,
  selectedModelId,
  selectedModelLabel,
  selectedProviderId,
}: {
  providers: ProviderCatalogRecord[];
  selectedModelId: string;
  selectedModelLabel: string;
  selectedProviderId: string | null;
}): {
  providerId: string | null;
  providerLabel: string | null;
  modelId: string | null;
  modelLabel: string | null;
} {
  const availableProviders = providers.filter(isProviderEligibleForModelSelector);
  const workspaceDefaultProviders = providers.filter(isProviderEligibleForWorkspaceDefault);
  const normalizedSelectedProviderId = readString(selectedProviderId);

  const findModelInProvider = (provider: ProviderCatalogRecord, modelId: string) => {
    const models = Array.isArray(provider.models)
      ? provider.models.filter((item): item is ProviderCatalogModelRecord => Boolean(item) && typeof item === 'object')
      : [];
    return models.find((model) => readString(model.id) === modelId) ?? null;
  };

  if (selectedModelId !== 'default') {
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

export function WorkstationChatPane() {
  const { bootstrap, routeManifest } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const desktop = useWorkstationDesktopBridge();
  const router = useRouter();
  const actor = useMemo<WorkstationSessionActor>(() => ({
    type: 'user',
    id: bootstrap.account.id,
    display_name: bootstrap.account.displayName ?? bootstrap.account.email,
  }), [bootstrap.account.displayName, bootstrap.account.email, bootstrap.account.id]);

  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const cachedThreadId = services.queryClient.peek<string>(ACTIVE_THREAD_QUERY_KEY);
    const persistedThreadId = readPersistedActiveThread(bootstrap.workspace.id);
    return cachedThreadId ?? persistedThreadId ?? PRIMARY_THREAD_ID;
  });
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
  const [titlebarActionsHost, setTitlebarActionsHost] = useState<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [hasEnteredConversationFlow, setHasEnteredConversationFlow] = useState(false);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [mutatingMemory, setMutatingMemory] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<WorkstationChatMessageRecord | null>(null);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const [liveTrace, setLiveTrace] = useState<LiveTraceState | null>(null);
  const [isLiveTraceExpanded, setIsLiveTraceExpanded] = useState(false);
  const [liveTraceElapsedSeconds, setLiveTraceElapsedSeconds] = useState(0);
  const [showLiveTraceCard, setShowLiveTraceCard] = useState(false);
  const [isLiveTraceCardFading, setIsLiveTraceCardFading] = useState(false);
  const [showCompletedTraceTimer, setShowCompletedTraceTimer] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState<string>('all');
  const [selectedExecutionPlacement] = useState<'local'>('local');
  const [machineTrust, setMachineTrust] = useState<ChatMachineTrust>('personal');
  const [autonomyMode, setAutonomyMode] = useState<ChatAutonomyMode>('approval');
  const [modelOptions, setModelOptions] = useState<ChatModelOption[]>([
    disconnectedModelOption(),
  ]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogRecord[]>([]);
  const [reasoningEffort, setReasoningEffort] = useState<ChatReasoningEffort>('medium');
  const [isApprovalsSheetOpen, setIsApprovalsSheetOpen] = useState(false);
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<SageMemoryDraft>(() => defaultSageMemoryDraft());
  const [pendingDeleteMemoryId, setPendingDeleteMemoryId] = useState<string | null>(null);

  const refreshProviderCatalog = useCallback(async () => {
    const applyProviderPayload = (payload: Record<string, unknown>) => {
      const normalizedProviders = normalizeProviderCatalogRecords(payload);
      setProviderCatalog(normalizedProviders);
      const nextOptions = normalizeChatModelOptions(payload);
      setModelOptions(nextOptions.length > 0 ? nextOptions : [workspaceDefaultModelOption(normalizedProviders)]);
    };

    try {
      applyProviderPayload(await services.client.listProviderCatalog());
      return;
    } catch {
      // Fall through to the older provider endpoint if the richer catalog is unavailable.
    }

    try {
      applyProviderPayload(await services.client.listProviders());
      return;
    } catch {
      setProviderCatalog((current) => current);
      setModelOptions((current) => (current.length > 0 ? current : [disconnectedModelOption()]));
    }
  }, [services.client]);

  const writeThreadState = (nextThread: CanonicalChatThreadState) => {
    services.queryClient.set(threadQueryKey(nextThread.threadId), nextThread);
    services.queryClient.set(ACTIVE_THREAD_QUERY_KEY, nextThread.threadId);
    persistActiveThread(bootstrap.workspace.id, nextThread.threadId);
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
    if (payload === null) {
      const cachedThread = services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(requestedThreadId));
      if (cachedThread && cachedThread.messages.length > 0) {
        setThread(cachedThread);
        return cachedThread;
      }
      if (thread.threadId === requestedThreadId && thread.messages.length > 0) {
        return thread;
      }
    }
    const nextThread = normalizeCanonicalChatThread(payload, requestedThreadId);
    writeThreadState(nextThread);
    return nextThread;
  };

  const loadOverview = async () => {
    const runsFallback = services.queryClient.peek<CanonicalRunSummary[]>(RUNS_QUERY_KEY) ?? runs;
    const approvalsFallback = services.queryClient.peek<CanonicalApprovalSummary[]>(APPROVALS_QUERY_KEY) ?? approvals;
    const recentThreadsFallback = services.queryClient.peek<RecentThreadSummary[]>(RECENT_THREADS_QUERY_KEY) ?? recentThreads;

    const runsRequest = services.client.listRuns({
      limit: 12,
    }).then(normalizeCanonicalRunItems).catch((error) => {
      if (isTransientBackgroundReadError(error)) {
        return runsFallback;
      }
      throw error;
    });
    const approvalsRequest = services.client.listApprovals({
      limit: 24,
    }).then(normalizeCanonicalApprovalItems).catch((error) => {
      if (
        error instanceof WorkstationClientError
        && error.status === 403
        && (
          (typeof error.detail === 'string'
            && error.detail.includes('Approvals are not included in this workspace plan.'))
          || (
            typeof error.detail === 'object'
            && error.detail
            && typeof (error.detail as { message?: unknown }).message === 'string'
            && String((error.detail as { message?: unknown }).message).includes('Approvals are not included in this workspace plan.')
          )
        )
      ) {
        return [] satisfies CanonicalApprovalSummary[];
      }
      if (isTransientBackgroundReadError(error)) {
        return approvalsFallback;
      }
      throw error;
    });
    const timelineRequest = services.client.listActivityTimeline({
      limit: 40,
    }).then(normalizeTimelineItems).catch((error) => {
      if (isTransientBackgroundReadError(error)) {
        return [] satisfies Record<string, unknown>[];
      }
      throw error;
    });

    const [nextRuns, nextApprovals, timelineItems] = await Promise.all([
      runsRequest,
      approvalsRequest,
      timelineRequest,
    ]);
    writeOverview({ nextRuns, nextApprovals });
    if (timelineItems.length > 0) {
      writeRecentThreads(deriveRecentThreads(timelineItems, activeThreadId));
      return;
    }
    if (recentThreadsFallback.length > 0) {
      writeRecentThreads(recentThreadsFallback);
      return;
    }
    writeRecentThreads(deriveRecentThreads([], activeThreadId));
  };

  const loadMemory = async () => {
    const cachedSnapshot = services.queryClient.peek<SageMemorySnapshot>(SAGE_MEMORY_QUERY_KEY) ?? memorySnapshot;
    const payload = await services.client.listSageMemory().catch((error) => {
      if (isTransientBackgroundReadError(error)) {
        return null;
      }
      throw error;
    });
    const nextSnapshot = payload === null
      ? cachedSnapshot
      : normalizeSageMemorySnapshot(payload);
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

  const startNewThread = async (seed?: {
    title?: string;
    sourceRunId?: string | null;
    sourceThreadId?: string | null;
  }) => {
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
          title: readString(seed?.title) || 'New thread',
          updatedAt: new Date().toISOString(),
        },
        ...recentThreads.filter((item) => item.threadId !== nextThreadId).slice(0, 7),
      ]);
      if (readString(seed?.sourceRunId) || readString(seed?.sourceThreadId)) {
        setStatusMessage('Started a new thread from recent activity.');
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not start a new thread.');
    } finally {
      setIsLoading(false);
    }
  };

  const openFirstRunTip = () => {
    openCreateMemory('profile_fact');
    setStatusMessage('Tip: Sage can carry forward explicit facts, active projects, and preferences you save here.');
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
    persistActiveThread(bootstrap.workspace.id, activeThreadId);
  }, [activeThreadId, bootstrap.workspace.id]);

  useEffect(() => {
    const rememberedThreadId = readPersistedActiveThread(bootstrap.workspace.id) ?? PRIMARY_THREAD_ID;
    if (rememberedThreadId !== activeThreadId) {
      setActiveThreadId(rememberedThreadId);
    }
  }, [activeThreadId, bootstrap.workspace.id]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    setTitlebarActionsHost(document.getElementById('workstation-titlebar-actions-slot'));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const storageKey = activeThreadStorageKey(bootstrap.workspace.id);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      const nextThreadId = readString(event.newValue);
      if (!nextThreadId || nextThreadId === activeThreadId) {
        return;
      }
      setActiveThreadId(nextThreadId);
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [activeThreadId, bootstrap.workspace.id]);

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
  const showTrace = showConversationContext && Boolean(liveTrace);
  const traceSummary = useMemo(() => summarizeLiveTraceStep(liveTrace), [liveTrace]);
  const traceStartedAtMs = useMemo(() => resolveTraceStartedAtMs(liveTrace), [liveTrace]);
  const traceDurationSeconds = useMemo(
    () => resolveTraceDurationSeconds(liveTrace, traceStartedAtMs),
    [liveTrace, traceStartedAtMs],
  );
  const liveTraceState = traceSummary.state;
  const traceTimerLabel = useMemo(() => {
    if (liveTraceState === 'complete') {
      return showCompletedTraceTimer ? `Took ${formatElapsedClock(traceDurationSeconds)}` : '';
    }
    if (liveTraceState === 'failed') {
      return traceDurationSeconds > 0 ? `Took ${formatElapsedClock(traceDurationSeconds)}` : '';
    }
    return formatElapsedClock(liveTraceElapsedSeconds);
  }, [liveTraceElapsedSeconds, liveTraceState, showCompletedTraceTimer, traceDurationSeconds]);
  const liveTraceFailureMessage = useMemo(() => {
    if (liveTraceState !== 'failed') {
      return '';
    }
    return traceSummary.label && traceSummary.label !== 'Run failed'
      ? traceSummary.label
      : 'Sage ran into a problem while working.';
  }, [liveTraceState, traceSummary.label]);
  const liveTraceTitle = useMemo(() => {
    if (liveTraceState === 'failed') {
      return liveTraceFailureMessage;
    }
    if (traceSummary.label) {
      return traceSummary.label;
    }
    if (liveTraceState === 'complete') {
      return 'Run complete';
    }
    return 'Thinking...';
  }, [liveTraceFailureMessage, liveTraceState, traceSummary.label]);
  const liveTraceStatusLabel = useMemo(() => {
    if (liveTraceState === 'complete') {
      return 'Complete';
    }
    if (liveTraceState === 'failed') {
      return 'Stopped';
    }
    return 'Thinking';
  }, [liveTraceState]);
  const liveTraceCardClassName = useMemo(() => {
    const classes = ['app-chat-live-trace'];
    if (liveTraceState === 'running') {
      classes.push('app-chat-live-trace--running');
    } else if (liveTraceState === 'complete') {
      classes.push('app-chat-live-trace--complete');
    } else if (liveTraceState === 'failed') {
      classes.push('app-chat-live-trace--failed');
    }
    if (isLiveTraceCardFading) {
      classes.push('app-chat-live-trace--fading');
    }
    return classes.join(' ');
  }, [isLiveTraceCardFading, liveTraceState]);

  useEffect(() => {
    if (!showTrace || !liveTrace) {
      setShowLiveTraceCard(false);
      setIsLiveTraceCardFading(false);
      setShowCompletedTraceTimer(false);
      setLiveTraceElapsedSeconds(0);
      return undefined;
    }

    setShowLiveTraceCard(true);
    setIsLiveTraceCardFading(false);
    const initialElapsed = liveTraceState === 'running'
      ? (traceStartedAtMs ? Math.max(0, Math.round((Date.now() - traceStartedAtMs) / 1000)) : 0)
      : traceDurationSeconds;
    setLiveTraceElapsedSeconds(initialElapsed);

    let intervalId: number | null = null;
    let timerHideId: number | null = null;
    let fadeId: number | null = null;
    let removeId: number | null = null;

    if (liveTraceState === 'running') {
      intervalId = window.setInterval(() => {
        const nextElapsed = traceStartedAtMs
          ? Math.max(0, Math.round((Date.now() - traceStartedAtMs) / 1000))
          : 0;
        setLiveTraceElapsedSeconds(nextElapsed);
      }, 1000);
    } else if (liveTraceState === 'complete') {
      setShowCompletedTraceTimer(true);
      timerHideId = window.setTimeout(() => {
        setShowCompletedTraceTimer(false);
      }, 3000);
      fadeId = window.setTimeout(() => {
        setIsLiveTraceCardFading(true);
      }, 5000);
      removeId = window.setTimeout(() => {
        setShowLiveTraceCard(false);
      }, 5350);
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      if (timerHideId) {
        window.clearTimeout(timerHideId);
      }
      if (fadeId) {
        window.clearTimeout(fadeId);
      }
      if (removeId) {
        window.clearTimeout(removeId);
      }
    };
  }, [liveTrace, liveTraceState, showTrace, traceDurationSeconds, traceStartedAtMs]);

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
  const localCompanionOnline = Boolean(
    localRuntimeTarget
    && localRuntimeTarget.online,
  );
  const localCompanionConnected = Boolean(
    localRuntimeTarget
    && localRuntimeTarget.available
    && localRuntimeTarget.online
    && localRuntimeTarget.healthy,
  );
  const selectedModelOption = useMemo(
    () => modelOptions.find((option) => option.id === selectedModel) ?? modelOptions[0] ?? {
      id: 'default',
      label: 'Workspace default',
      providerId: null,
      providerLabel: null,
      supportsReasoning: false,
      reasoningLevels: ['low', 'medium', 'high'],
      contextWindowTokens: null,
    },
    [modelOptions, selectedModel],
  );
  const selectedProviderContext = useMemo(
    () => resolveProviderModelContext({
      providers: providerCatalog,
      selectedModelId: selectedModel,
      selectedModelLabel: selectedModelOption.label,
      selectedProviderId: selectedModelOption.providerId,
    }),
    [providerCatalog, selectedModel, selectedModelOption.label, selectedModelOption.providerId],
  );
  const integrationsHref = useMemo(
    () => routeManifest.routeIndex.integrations?.href ?? `/w/${encodeURIComponent(bootstrap.workspace.id)}/integrations`,
    [bootstrap.workspace.id, routeManifest.routeIndex.integrations],
  );
  const runTargetOptions = useMemo(
    () => [
      {
        value: 'local',
        label: localCompanionOnline ? 'Local' : 'Local offline',
      },
    ],
    [localCompanionOnline],
  );
  const autonomyOptions = useMemo(
    () => [
      { value: 'approval', label: 'Default' },
      {
        value: 'full',
        label: 'Full access',
      },
    ],
    [],
  );
  const composerModelOptions = useMemo(
    () => {
      const connectedProviders = providerCatalog.filter(isProviderEligibleForModelSelector);
      if (connectedProviders.length <= 1) {
        return modelOptions.map((option) => ({
          value: option.id,
          label: option.id ? compactComposerLabel(option.label, option.id) : option.label,
          disabled: !option.id,
        }));
      }

      const groupedOptions: { label: string; options: { value: string; label: string; disabled: boolean }[] }[] = [];
      for (const provider of connectedProviders) {
        const providerId = readString(provider.id);
        const providerLabel = readString(provider.label) || providerId;
        const options = modelOptions
          .filter((option) => option.providerId === providerId)
          .map((option) => ({
            value: option.id,
            label: option.id ? compactComposerLabel(option.label, option.id) : option.label,
            disabled: !option.id,
          }));
        if (options.length > 0) {
          groupedOptions.push({
            label: providerLabel,
            options,
          });
        }
      }
      return groupedOptions;
    },
    [modelOptions, providerCatalog],
  );
  const reasoningOptions = useMemo(
    () => selectedModelOption.reasoningLevels.map((value) => ({
      value,
      label: reasoningLabel(value),
    })),
    [selectedModelOption.reasoningLevels],
  );
  const composerTargetLabel = useMemo(() => {
    const threadTitle = readString(thread.title);
    if (
      activeThreadId === PRIMARY_THREAD_ID
      || !threadTitle
      || threadTitle.toLowerCase() === 'chat'
      || threadTitle.toLowerCase() === 'primary thread'
    ) {
      return 'main';
    }
    return threadTitle.length > 18 ? `${threadTitle.slice(0, 18).trim()}…` : threadTitle;
  }, [activeThreadId, thread.title]);
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
  const visibleTranscriptMessages = useMemo(
    () => thread.messages.filter((message) => !isSyntheticTranscriptMessage(message)),
    [thread.messages],
  );
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
  const recentRunRows = useMemo(
    () => runs.slice(0, 3).map((run) => ({
      runId: readString(run.run_id) || null,
      threadId: readString(run.thread_id) || null,
      createdAt: readString(run.created_at) || null,
      preview: runPreviewLabel(run),
      title: runContextTitle(run),
    })),
    [runs],
  );
  const visibleMemoryItems = filteredMemoryItems.slice(0, 6);
  const pendingDeleteMemory = pendingDeleteMemoryId
    ? memoryItems.find((item) => readString(item.id) === pendingDeleteMemoryId) ?? null
    : null;
  const statusNotice = useMemo(
    () => (statusMessage ? classifyStatusNotice(statusMessage) : null),
    [statusMessage],
  );
  const localRuntimeTargetId = localCompanionOnline ? readString(localRuntimeTarget?.id) : null;
  const defaultReasoningEffort = useMemo<ChatReasoningEffort>(
    () => (selectedModelOption.reasoningLevels.includes('medium')
      ? 'medium'
      : selectedModelOption.reasoningLevels[0] ?? 'medium'),
    [selectedModelOption.reasoningLevels],
  );
  const contextReasoningLabel = useMemo(() => {
    switch (reasoningEffort) {
      case 'medium':
        return 'Normal';
      case 'high':
      case 'xhigh':
        return 'Extended thinking';
      case 'minimal':
        return 'Minimal';
      case 'low':
        return 'Low';
      case 'none':
        return 'None';
      default:
        return reasoningLabel(reasoningEffort);
    }
  }, [reasoningEffort]);
  const contextWindowLabel = useMemo(
    () => formatContextWindowLabel(selectedModelOption.contextWindowTokens),
    [selectedModelOption.contextWindowTokens],
  );
  const contextDeviceLabel = useMemo(() => {
    if (!desktop.localCompanion.present || !desktop.localCompanion.online) {
      return null;
    }
    return `${localDevicePlatformLabel(desktop.platform, desktop.localCompanion.label)} connected`;
  }, [desktop.localCompanion.label, desktop.localCompanion.online, desktop.localCompanion.present, desktop.platform]);
  const showContextStrip = true;

  useEffect(() => {
    let cancelled = false;
    void refreshProviderCatalog()
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) {
          return;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshProviderCatalog]);

  useEffect(() => subscribeWorkstationProviderChanged((detail) => {
    if (detail.workspaceId !== bootstrap.workspace.id) {
      return;
    }
    void refreshProviderCatalog();
  }), [bootstrap.workspace.id, refreshProviderCatalog]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return () => {};
    }
    const handleFocus = () => {
      void refreshProviderCatalog();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshProviderCatalog();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshProviderCatalog]);

  useEffect(() => {
    if (!modelOptions.some((option) => option.id === selectedModel)) {
      setSelectedModel(modelOptions[0]?.id ?? '');
    }
  }, [modelOptions, selectedModel]);

  useEffect(() => {
    if (!selectedModelOption.reasoningLevels.includes(reasoningEffort)) {
      setReasoningEffort(selectedModelOption.reasoningLevels.includes('medium')
        ? 'medium'
        : selectedModelOption.reasoningLevels[0] ?? 'medium');
    }
  }, [reasoningEffort, selectedModelOption.reasoningLevels]);

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
    setIsLiveTraceExpanded(false);
    setShowLiveTraceCard(false);
    setIsLiveTraceCardFading(false);
    setShowCompletedTraceTimer(false);
    setLiveTraceElapsedSeconds(0);
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
        runtimeTarget: localRuntimeTargetId || 'cloud',
        model: selectedModel === 'default' ? null : selectedModel,
        reasoningEffort,
        policyContext: {
          session_mode: autonomyMode === 'full' ? 'agent' : 'copilot',
          trust_mode: autonomyMode === 'full' ? 'auto' : 'guarded',
          approval_ui: 'card',
          interactive_approvals: autonomyMode !== 'full',
          machine_trust_declaration: machineTrust,
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
      const providerFailureIntervention = findProviderFailureIntervention(normalizedResponse.interventions ?? []);
      const nextThreadId = String(normalizedResponse.thread_id ?? requestedThreadId);
      const optimisticUserMessage = createCanonicalUserMessage(message, nextThreadId);
      const nextMessages = [...visibleTranscriptMessages, optimisticUserMessage];
      const assistantMessage = createCanonicalAssistantMessage(normalizedResponse, nextThreadId);
      const inlineProviderFailureMessage = !assistantMessage && providerFailureIntervention
        ? {
            id: `${nextThreadId}:assistant-error:${Date.now()}`,
            role: 'assistant',
            content: "Sage couldn't respond — provider error. Check your API key in Integrations.",
            status: 'failed',
            createdAt: new Date().toISOString(),
            runId: typeof normalizedResponse.run_id === 'string' ? normalizedResponse.run_id : null,
            approvals: [],
            interventions: Array.isArray(normalizedResponse.interventions) ? normalizedResponse.interventions : [],
            artifacts: [],
            metadata: {
              display_kind: 'provider_error',
              action_href: `/w/${encodeURIComponent(bootstrap.workspace.id)}/integrations`,
              action_label: 'Open Integrations',
              intervention_kind: String(providerFailureIntervention.kind ?? providerFailureIntervention.type ?? ''),
              intervention_code: String(providerFailureIntervention.code ?? ''),
            },
          } satisfies WorkstationChatMessageRecord
        : null;

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
      } else if (inlineProviderFailureMessage) {
        writeThreadState({
          ...thread,
          threadId: nextThreadId,
          messages: [...nextMessages, inlineProviderFailureMessage],
        });
      }
      setStatusMessage(
        Array.isArray(normalizedResponse.approvals) && normalizedResponse.approvals.length > 0
          ? responseExecutionTarget === 'local_companion'
            ? 'Turn submitted. Sage is waiting for approval before using the local companion.'
            : 'Turn submitted. Approval is now pending.'
          : Array.isArray(normalizedResponse.interventions) && normalizedResponse.interventions.length > 0
            ? 'Turn submitted. Your input is needed before Sage can continue.'
            : responseExecutionTarget === 'local_companion'
              ? 'Turn submitted. Sage routed this work to the local companion.'
            : responseExecutionTarget === 'cloud'
              ? 'Turn submitted. Sage is working in cloud mode.'
            : renewed
              ? 'Turn submitted after refreshing your session.'
              : null,
      );
      setSendFailureNotice(null);
    } catch (error) {
      setPendingUserMessage(null);
      setStreamingAssistantText('');
      const rawMessage = error instanceof WorkstationClientError || error instanceof Error
        ? error.message
        : 'Could not send this message.';
      const message = isLocalCompanionGateMessage(rawMessage)
        ? 'Could not send this message.'
        : rawMessage;
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
    <>
      {titlebarActionsHost ? createPortal(
        <AppButton
          type="button"
          tone="secondary"
          aria-label="New chat"
          className="workstation-titlebar__action"
          onClick={() => {
            void startNewThread();
          }}
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
        </AppButton>,
        titlebarActionsHost,
      ) : null}

      <main
        data-workstation-surface="chat"
        data-workstation-chat="pane"
        className={`app-chat-page app-chat-page--surface${showFirstImpression ? ' app-chat-page--first-impression' : ''}`}
      >
        <section className={`app-chat-thread app-chat-thread--surface${showBlankTranscript || showFirstImpression ? ' app-chat-thread--blank' : ''}`}>
          {showContextStrip ? (
            <div className="app-chat-context-strip" aria-label="Sage conversation context">
              {selectedProviderContext.providerLabel ? (
                <span>{selectedProviderContext.providerLabel}</span>
              ) : (
                <span>No provider</span>
              )}
              {selectedProviderContext.modelLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{selectedProviderContext.modelLabel}</span>
                </>
              ) : !selectedProviderContext.providerLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    className="app-chat-context-strip__link"
                    onClick={() => {
                      router.push(integrationsHref);
                    }}
                  >
                    Connect in Integrations
                  </button>
                </>
              ) : null}
              {selectedProviderContext.providerLabel === 'Ollama' && contextWindowLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Local</span>
                </>
              ) : null}
              {selectedProviderContext.providerLabel && reasoningEffort !== defaultReasoningEffort ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{contextReasoningLabel}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>{memoryItems.length} memory item{memoryItems.length === 1 ? '' : 's'}</span>
              {contextDeviceLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`app-chat-context-strip__device${desktop.localCompanion.online ? ' app-chat-context-strip__device--online' : ' app-chat-context-strip__device--offline'}`}
                  >
                    <span className="app-chat-context-strip__device-dot" aria-hidden="true" />
                    <span>{contextDeviceLabel}</span>
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          <ScrollRegion className="app-chat-thread__scroll">
            <div className="app-chat-thread__body">
              {showBlankTranscript ? (
                <div className="app-chat-empty-state">
                  {recentRunRows.length > 0 ? (
                    <div className="app-chat-empty-state__recent">
                      {recentRunRows.map((run, index) => (
                        <button
                          key={run.runId ?? run.threadId ?? `${run.createdAt ?? 'run'}:${index}`}
                          type="button"
                          className="app-chat-empty-run-row"
                          onClick={() => {
                            void startNewThread({
                              title: run.title,
                              sourceRunId: run.runId,
                              sourceThreadId: run.threadId,
                            });
                          }}
                        >
                          <span className="app-chat-empty-run-row__time">{formatRelativeTime(run.createdAt)}</span>
                          <span className="app-chat-empty-run-row__preview" title={run.preview}>
                            {run.preview}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="app-chat-empty-state__actions">
                    {!selectedProviderContext.providerLabel ? (
                      <button
                        type="button"
                        className="app-chat-empty-state__link"
                        onClick={() => {
                          router.push(integrationsHref);
                        }}
                      >
                        Connect a provider
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="app-chat-empty-state__link"
                      onClick={() => {
                        router.push(`/w/${encodeURIComponent(bootstrap.workspace.id)}/studio`);
                      }}
                    >
                      Create a specialist
                    </button>
                    <button
                      type="button"
                      className="app-chat-empty-state__link"
                      onClick={() => {
                        openFirstRunTip();
                      }}
                    >
                      Learn what Sage can do
                    </button>
                  </div>
                </div>
              ) : null}

              {visibleTranscriptMessages.map((message) => (
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

              {showTrace && liveTrace ? (
                <>
                  {showLiveTraceCard ? (
                    <section className={liveTraceCardClassName} aria-label="Live run trace">
                      <div className="app-chat-live-trace__summary">
                        <div className="app-chat-live-trace__presence">
                          <span className="app-chat-live-trace__orb" aria-hidden="true" />
                          <div className="app-chat-live-trace__copy">
                            <strong className="app-chat-live-trace__title">{liveTraceTitle}</strong>
                            <div className="app-chat-live-trace__meta">
                              <span className="app-chat-live-trace__status" data-state={liveTraceState}>
                                {liveTraceStatusLabel}
                              </span>
                              {traceTimerLabel ? (
                                <span className="app-chat-live-trace__timer">
                                  {traceTimerLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}
                  <div className="app-chat-live-trace__footer">
                    <button
                      type="button"
                      className="app-chat-live-trace__toggle"
                      onClick={() => {
                        setIsLiveTraceExpanded((value) => !value);
                      }}
                    >
                      {isLiveTraceExpanded ? 'Hide trace ↑' : 'View full trace ↓'}
                    </button>
                  </div>
                  {isLiveTraceExpanded ? (
                    <SageTraceView
                      traceId={liveTrace.traceId}
                      mode="live"
                      liveTransport={liveTrace.transport}
                      initialTrace={liveTrace.trace}
                      initialEvents={liveTrace.events}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </ScrollRegion>
        </section>

        <div className="app-chat-notices">
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

          {approvals.length > 0 ? (
            <div className="app-chat-inline-state-host">
              <ChatInlineStateCard
                tone="warning"
                eyebrow="Action Required"
                title={readString(latestApproval?.prompt) || 'Approval required'}
                meta={localCompanionConnected
                  ? 'Sage is paused until you decide whether it can continue on this machine.'
                  : 'Sage is paused until you approve or deny the next step.'}
                actions={(
                  <div className="app-chat-inline-state__actions">
                    {latestApproval && readString(latestApproval.approval_id || latestApproval.id) ? (
                      <>
                        <AppButton
                          type="button"
                          disabled={Boolean(resolvingApprovalId)}
                          onClick={() => {
                            void handleResolveApproval(readString(latestApproval.approval_id || latestApproval.id), 'approved');
                          }}
                        >
                          {resolvingApprovalId ? 'Allowing…' : 'Allow'}
                        </AppButton>
                        <AppButton
                          type="button"
                          tone="secondary"
                          disabled={Boolean(resolvingApprovalId)}
                          onClick={() => {
                            void handleResolveApproval(readString(latestApproval.approval_id || latestApproval.id), 'rejected');
                          }}
                        >
                          Deny
                        </AppButton>
                      </>
                    ) : null}
                    <AppButton
                      type="button"
                      tone="ghost"
                      onClick={() => {
                        setIsApprovalsSheetOpen(true);
                      }}
                    >
                      Review details
                    </AppButton>
                  </div>
                )}
              >
                <p className="app-chat-inline-state__body-copy">
                  {selectedExecutionPlacement === 'local'
                    ? 'This request needs device or filesystem access. In default-permission mode, Sage stays paused until you make a decision.'
                    : 'This request is waiting on explicit approval before Sage continues the next action.'}
                </p>
              </ChatInlineStateCard>
            </div>
          ) : null}

          {statusMessage ? (
            <AppNotice
              tone={statusNotice?.tone ?? 'neutral'}
              role="status"
              aria-live="polite"
              className="app-chat-status-notice"
            >
              <div className="app-chat-status-notice__copy">
                <strong>{statusNotice?.title ?? 'Notice'}</strong>
                <span>{statusNotice?.body ?? statusMessage}</span>
              </div>
              <div className="app-chat-status-notice__actions">
                <AppButton
                  type="button"
                  tone="secondary"
                  onClick={() => {
                    setStatusMessage(null);
                  }}
                >
                  {statusNotice?.requiresLocalAccess ? 'Got it' : 'Dismiss'}
                </AppButton>
              </div>
            </AppNotice>
          ) : null}
        </div>

      <ChatComposer
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={() => {
          void sendMessage();
        }}
        onOpenMemory={() => {
          openCreateMemory();
        }}
        onOpenIntegrations={() => {
          router.push(integrationsHref);
        }}
        runTarget={selectedExecutionPlacement}
        runTargetOptions={runTargetOptions}
        onRunTargetChange={() => {}}
        autonomyMode={autonomyMode}
        autonomyOptions={autonomyOptions}
        onAutonomyModeChange={(nextValue) => {
          if (nextValue === 'approval' || nextValue === 'full') {
            setAutonomyMode(nextValue);
          }
        }}
        targetLabel={composerTargetLabel}
        model={selectedModel}
        modelOptions={composerModelOptions}
        onModelChange={setSelectedModel}
        reasoningEffort={reasoningEffort}
        reasoningOptions={reasoningOptions}
        onReasoningEffortChange={(nextValue) => {
          if (selectedModelOption.reasoningLevels.includes(nextValue as ChatReasoningEffort)) {
            setReasoningEffort(nextValue as ChatReasoningEffort);
          }
        }}
        contextWindowLabel={contextWindowLabel}
        busy={isSending}
        controlsDisabled={false}
        sendDisabled={false}
        placeholder="Message Sage..."
        providerGateVisible={false}
        showAutonomySelector={localCompanionConnected}
        autonomyFallbackLabel="Offline"
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
              <div className="app-inline-actions">
                <AppButton
                  type="button"
                  disabled={Boolean(resolvingApprovalId)}
                  onClick={() => {
                    void handleResolveApproval(readString(approval.approval_id || approval.id), 'approved');
                  }}
                >
                  {resolvingApprovalId && resolvingApprovalId === readString(approval.approval_id || approval.id)
                    ? 'Allowing…'
                    : 'Allow this time'}
                </AppButton>
                <AppButton
                  type="button"
                  tone="danger"
                  disabled={Boolean(resolvingApprovalId)}
                  onClick={() => {
                    void handleResolveApproval(readString(approval.approval_id || approval.id), 'rejected');
                  }}
                >
                  Deny
                </AppButton>
              </div>
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
    </>
  );
}
