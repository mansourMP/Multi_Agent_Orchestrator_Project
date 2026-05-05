'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SquarePen,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import { FormField, FormGrid, FormInput, FormSection, FormTextarea } from '@/lib/ui/form-controls';
import { AppButton, AppNotice } from '@/lib/ui/primitives';
import { ScrollRegion } from '@/lib/ui/scroll-region';
import { ChatComposer, type ComposerToolGroup } from '@/lib/workspace/chat-composer';
import type {
  WorkstationChatArtifactReference,
  WorkstationChatMessageRecord,
} from '@/lib/workspace/chat-message';
import { CodexChatCell, type CodexApprovalAction } from '@/lib/workspace/codex-chat/cell-components';
import type { CodexTranscriptCell } from '@/lib/workspace/codex-chat/cells';
import { workstationMessageToCodexCell } from '@/lib/workspace/codex-chat/message-adapter';
import {
  projectCodexTimeline,
  type TimelineProjectionEvent,
} from '@/lib/workspace/codex-chat/timeline-reducer';
import {
  resolveModelContextWindow,
} from '@/lib/workspace/model-capabilities';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';
import type { WorkspaceBootstrapRuntimeTarget } from '@/lib/workspace/workspace-bootstrap';
import {
  resolveWorkstationApproval,
  subscribeWorkstationApprovalResolved,
} from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { subscribeWorkstationProviderChanged } from '@/lib/workspace/workstation-provider-events';
import {
  useWorkspaceServices,
  useWorkstationActivityVersion,
  useWorkstationStreamSelector,
} from '@/lib/workspace/workspace-services';
import {
  WorkstationClientError,
  type WorkstationAgentTraceEvent,
  type WorkstationAgentTraceRecord,
  type ProviderCatalogModelRecord,
  type ProviderCatalogRecord,
  type ProviderProfileRecord,
  type VaultCredentialRecord,
  type WorkstationSageMemoryRecord,
  type WorkstationSessionActor,
  type WorkstationSessionRecord,
  type WorkstationTurnStreamAbortHandle,
  type WorkstationTurnResponse,
} from '@/lib/workspace/workstation-client';

type CanonicalChatThreadState = {
  threadId: string;
  title: string;
  messages: WorkstationChatMessageRecord[];
  session: WorkstationSessionRecord | null;
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

type LiveActivityStepState = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  status: string;
  toolCallId: string | null;
  createdAt: string;
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

type SageToolPolicyRecord = {
  key: string;
  enabled: boolean;
};

type RuntimeSummaryCard = {
  tone: 'neutral' | 'accent' | 'success' | 'warning';
  title: string;
  meta: string;
  body: string;
  preferredPill: string;
  localPill: string;
};

type SageReadinessPill = {
  id: string;
  label: string;
  tone: 'muted' | 'warning' | 'danger';
  target: 'gateway' | 'integrations';
};

type GatewayReadinessRegistration = Record<string, unknown> & {
  gateway_id?: string | null;
  status?: string | null;
  connection_status?: string | null;
};

type GatewayReadinessDoctorPayload = Record<string, unknown> & {
  status?: string | null;
  browser?: Record<string, unknown> | null;
  browser_attach?: Record<string, unknown> | null;
};

type SendFailureNotice = {
  message: string;
  retryable: boolean;
  retryDraft?: string | null;
  actions?: {
    label: string;
    target: 'gateway' | 'integrations';
  }[];
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

function readModelParameterCountBillions(...values: unknown[]): number | null {
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

function isSmallOllamaSelection(providerId: unknown, modelId: unknown, modelLabel: unknown): boolean {
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

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function isSyntheticTranscriptMessage(message: WorkstationChatMessageRecord): boolean {
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
  return normalized.includes('local companion')
    && (
      normalized.includes('approval is required')
      || normalized.includes('could not start device work')
      || normalized.includes('started work')
      || normalized.includes('started working on it')
    );
}

function isProviderRuntimeGateMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes('is selected for chat but is not available right now')
    || normalized.includes('is local-only and needs a connected computer')
    || normalized.includes('needs a connected computer')
    || normalized.includes('the selected provider is not ready')
    || normalized.includes('the selected provider is not available right now')
    || normalized.includes('connect this computer, switch to empyralis credits')
    || normalized.includes('required local runtime')
  );
}

function isProviderGateSystemCell(cell: CodexTranscriptCell): boolean {
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

function isProviderGateTranscriptCell(cell: CodexTranscriptCell): boolean {
  if (cell.kind === 'assistant') {
    return isProviderRuntimeGateMessage(readString(cell.content));
  }
  return isProviderGateSystemCell(cell);
}

function normalizeStructuredRecordList(value: unknown): Record<string, unknown>[] {
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

function normalizeProviderProfiles(payload: unknown): ProviderProfileRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is ProviderProfileRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function sortProviderProfiles(profiles: ProviderProfileRecord[]): ProviderProfileRecord[] {
  return [...profiles].sort((left, right) => {
    const leftPriority = Number(left.priority ?? 100);
    const rightPriority = Number(right.priority ?? 100);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return readString(left.id).localeCompare(readString(right.id));
  });
}

function profileMetadataRecord(profile: ProviderProfileRecord | null | undefined): Record<string, unknown> {
  return profile && typeof profile.metadata === 'object' && profile.metadata
    ? profile.metadata as Record<string, unknown>
    : {};
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

function readProviderScopes(provider: ProviderCatalogRecord): string[] {
  const value = provider.provider_scopes;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readString(item).toLowerCase())
    .filter(Boolean);
}

function isCatalogProviderRecord(provider: ProviderCatalogRecord): boolean {
  const providerId = readString(provider.id).toLowerCase();
  const kind = readString(provider.kind).toLowerCase();
  return Boolean(providerId) && (kind === '' || kind === 'provider') && provider.hidden !== true;
}

const LAUNCH_CHAT_PROVIDER_PRIORITY = ['deepseek', 'gemini', 'openai', 'ollama_cloud', 'ollama'] as const;
const LAUNCH_CHAT_PROVIDER_IDS = new Set<string>(LAUNCH_CHAT_PROVIDER_PRIORITY);

function chatProviderPriority(provider: ProviderCatalogRecord): number {
  const providerId = readString(provider.id).toLowerCase();
  const index = LAUNCH_CHAT_PROVIDER_PRIORITY.indexOf(providerId as typeof LAUNCH_CHAT_PROVIDER_PRIORITY[number]);
  return index >= 0 ? index : LAUNCH_CHAT_PROVIDER_PRIORITY.length;
}

function isLaunchChatProvider(provider: ProviderCatalogRecord): boolean {
  const providerId = readString(provider.id).toLowerCase();
  return LAUNCH_CHAT_PROVIDER_IDS.has(providerId);
}

function sortLaunchChatProviders(providers: ProviderCatalogRecord[]): ProviderCatalogRecord[] {
  return [...providers].sort((left, right) => {
    const priorityDelta = chatProviderPriority(left) - chatProviderPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return (readString(left.label) || readString(left.id)).localeCompare(readString(right.label) || readString(right.id));
  });
}

function isProviderEligibleForModelSelector(provider: ProviderCatalogRecord): boolean {
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

function isProviderEligibleForWorkspaceDefault(provider: ProviderCatalogRecord): boolean {
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

function workspaceDefaultModelOption(
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

function disconnectedModelOption(): ChatModelOption {
  return workspaceDefaultModelOption();
}

function providerRouteSuffix(provider: ProviderCatalogRecord | null | undefined): string | null {
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

function providerPathLabel(provider: ProviderCatalogRecord | null | undefined): string | null {
  if (!provider || typeof provider !== 'object') {
    return null;
  }
  const providerId = readString(provider.id).toLowerCase();
  const credentialPlane = readString(provider.credential_plane).toLowerCase();
  const defaultAuthMode = readString(provider.default_auth_mode).toLowerCase();
  const runtimeSource = readString(provider.runtime_active_source).toLowerCase();
  const providerLabel = readString(provider.label) || readString(provider.id);

  if (providerId === 'ollama') {
    return 'My Computer · Ollama local';
  }
  if (providerId === 'openai-codex' || runtimeSource.endsWith('cli') || defaultAuthMode === 'oauth_token') {
    return 'My Computer · CLI';
  }
  if (providerId === 'ollama_cloud') {
    return 'Ollama Cloud';
  }
  if (credentialPlane === 'platform_runtime') {
    return 'Empyralis credits';
  }
  if (credentialPlane === 'workspace_connection') {
    return 'Your API key';
  }
  if (provider.local_only === true || credentialPlane === 'local_runtime') {
    return 'My Computer';
  }
  return providerLabel || null;
}

function providerSummaryLabel({
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

function providerFailureMessageForProvider(provider: ProviderCatalogRecord | null | undefined): string {
  const credentialPlane = readString(provider?.credential_plane).toLowerCase();
  const providerId = readString(provider?.id).toLowerCase();
  const providerLabel = readString(provider?.label) || (providerId ? providerId : 'The selected provider');
  if (providerId === 'ollama' || provider?.local_only === true || credentialPlane === 'local_runtime') {
    return `${providerLabel} needs a connected computer. Connect My Computer, use Empyralis credits, or add your own API key in Connected Apps.`;
  }
  if (credentialPlane === 'workspace_connection') {
    return 'Your AI model API key needs attention. Check the key, quota, or selected model in Connected Apps.';
  }
  if (credentialPlane === 'platform_runtime') {
    return 'Empyralis credits are active, but the hosted AI model is temporarily unavailable. Try again or switch model.';
  }
  return 'The selected AI model is not available right now. Switch model or open Connected Apps.';
}

function providerFailureActionsForProvider(
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
      { label: 'Connect My Computer', target: 'gateway' },
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
      { label: 'Add API key', target: 'integrations' },
      { label: 'Choose AI Model', target: 'integrations' },
    ];
  }
  return [{ label: 'Choose AI Model', target: 'integrations' }];
}

function providerFailureNoticeForProvider(
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

function providerReadyForChat(
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

function modelOptionDisplayLabel(
  option: ChatModelOption,
  providerRecord: ProviderCatalogRecord | null,
): string {
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

function normalizeChatModelOptions(payload: unknown): ChatModelOption[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const providers = Array.isArray(record.providers)
    ? record.providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
    : [];
  const connectedProviders = sortLaunchChatProviders(providers.filter(isProviderEligibleForModelSelector));

  if (connectedProviders.length === 0) {
    return [disconnectedModelOption()];
  }

  const workspaceDefault = workspaceDefaultModelOption(connectedProviders);
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

  return [workspaceDefault, ...options];
}

function compactComposerLabel(label: string, fallback: string): string {
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

function createPendingUserMessage(
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

function createClientTurnRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createIncompleteAssistantMessage(
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

function messageRequestId(message: WorkstationChatMessageRecord | null | undefined): string {
  if (!message) {
    return '';
  }
  return readString(readObject(message.metadata).client_request_id)
    || readString(readObject(message.metadata).request_id);
}

function canonicalIncludesMessage(
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

function projectedAssistantLooksSynthetic(
  cell: Extract<CodexTranscriptCell, { kind: 'assistant' }> | null,
): boolean {
  if (!cell) {
    return false;
  }
  return isProviderRuntimeGateMessage(readString(cell.content));
}

function createActivityStepMessage(
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

function upsertLiveActivityStep(
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

function normalizeStepStatus(value: unknown): string {
  const normalized = readString(value).toLowerCase();
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') {
    return 'done';
  }
  if (normalized === 'error' || normalized === 'failed') {
    return 'error';
  }
  return 'active';
}

function normalizeStepEvent(
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

function settleLiveActivitySteps(
  steps: LiveActivityStepState[],
  status: 'done' | 'error' = 'done',
): LiveActivityStepState[] {
  return steps.map((step) => ({
    ...step,
    status: step.status === 'active' ? status : step.status,
  }));
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

function isGatewayBrowserMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes('browser attach')
    || normalized.includes('browser session')
    || normalized.includes('signed-in')
    || normalized.includes('localhost')
    || normalized.includes('private page')
    || normalized.includes('private session');
}

function classifyStatusNotice(message: string): {
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
      title: 'My Computer browser needed',
      body: 'Localhost pages, signed-in sites, and private browser sessions stay on this device. Open My Computer when Sage needs browser access or needs your OK.',
      requiresLocalAccess: true,
      actionTarget: 'gateway',
      actionLabel: 'Open My Computer',
    };
  }
  if (isLocalCompanionGateMessage(message)) {
    return {
      tone: 'warning',
      title: 'My Computer attention needed',
      body: message,
      requiresLocalAccess: true,
      actionTarget: 'gateway',
      actionLabel: 'Open My Computer',
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
        ? 'Check your AI model key or quota in Connected Apps.'
        : 'Choose Empyralis credits, add an AI model key, or connect this computer.',
      requiresLocalAccess: false,
      actionTarget: 'integrations',
      actionLabel: 'Open Connected Apps',
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

function isLocalCompanionGateMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes('local companion')
    || normalized.includes('local worker')
    || normalized.includes('requires local companion execution')
    || normalized.includes('cannot run that request in this workspace right now')
    || normalized.includes('path must stay inside local companion root');
}

function browserReadinessPill(
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
      target: 'gateway',
    };
  }
  if (attachFailedCount > 0 || attachStatus === 'fail') {
    return {
      id: 'browser-attach-failed',
      label: 'Browser: Attach failed',
      tone: 'danger',
      target: 'gateway',
    };
  }
  if (attachCount > 0 && attachPendingCount > 0) {
    return {
      id: 'browser-attach-pending',
      label: 'Browser: Finish attach',
      tone: 'warning',
      target: 'gateway',
    };
  }
  if (browserStatus === 'fail') {
    return {
      id: 'browser-unavailable',
      label: 'Browser: Unavailable',
      tone: 'danger',
      target: 'gateway',
    };
  }
  if (browserStatus === 'warn') {
    return {
      id: 'browser-attention',
      label: 'Browser: Needs attention',
      tone: 'warning',
      target: 'gateway',
    };
  }
  return null;
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

function normalizeSageToolPolicy(payload: unknown): SageToolPolicyRecord[] {
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

function normalizeConnectorVaultRecords(payload: unknown): VaultCredentialRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is VaultCredentialRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function toolPolicyEnabled(policy: SageToolPolicyRecord[], key: string): boolean {
  const record = policy.find((item) => item.key === key);
  return record ? record.enabled : false;
}

function hasConnectedConnector(
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

function defaultSageMemoryDraft(): SageMemoryDraft {
  return {
    entryId: null,
    category: 'safe_general',
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

function shouldSuppressBackgroundRefreshNotice(error: unknown): boolean {
  if (isTransientBackgroundReadError(error)) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return /took too long to respond|could not connect|could not finish|capacity is busy/i.test(error.message);
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
  const availableProviders = sortLaunchChatProviders(providers.filter(isProviderEligibleForModelSelector));
  const workspaceDefaultProviders = sortLaunchChatProviders(providers.filter(isProviderEligibleForWorkspaceDefault));
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

function resolvePersistedSelectedModelId({
  providers,
  profiles,
  modelOptions,
}: {
  providers: ProviderCatalogRecord[];
  profiles: ProviderProfileRecord[];
  modelOptions: ChatModelOption[];
}): string {
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
    const modelId = readString(profile.model);
    if (selectionMode === 'explicit' && modelId && availableModelIds.has(modelId)) {
      return modelId;
    }
  }

  return 'default';
}

export function WorkstationChatPane() {
  const { bootstrap, routeManifest, hasCapability } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const activityVersion = useWorkstationActivityVersion();
  const activityConnectionState = useWorkstationStreamSelector((state) => state.activity.connectionState);
  const notificationsConnectionState = useWorkstationStreamSelector((state) => state.notifications.connectionState);
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
      session: null,
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
  const [smallModelWarningVisible, setSmallModelWarningVisible] = useState(false);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [mutatingMemory, setMutatingMemory] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<WorkstationChatMessageRecord | null>(null);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const [liveTimelineEvents, setLiveTimelineEvents] = useState<TimelineProjectionEvent[]>([]);
  const [showProjectedAssistant, setShowProjectedAssistant] = useState(false);
  const [timelineSettled, setTimelineSettled] = useState(false);
  const [liveActivitySteps, setLiveActivitySteps] = useState<LiveActivityStepState[]>([]);
  const [liveTrace, setLiveTrace] = useState<LiveTraceState | null>(null);
  const [memoryFilter, setMemoryFilter] = useState<string>('all');
  const [selectedExecutionPlacement] = useState<'local'>('local');
  const [machineTrust, setMachineTrust] = useState<ChatMachineTrust>('personal');
  const [autonomyMode, setAutonomyMode] = useState<ChatAutonomyMode>('approval');
  const [modelOptions, setModelOptions] = useState<ChatModelOption[]>([
    disconnectedModelOption(),
  ]);
  const [selectedModel, setSelectedModel] = useState<string>('default');
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogRecord[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRecord[]>([]);
  const [toolPolicy, setToolPolicy] = useState<SageToolPolicyRecord[]>([]);
  const [connectorCredentials, setConnectorCredentials] = useState<VaultCredentialRecord[]>([]);
  const [browserGatewayDoctor, setBrowserGatewayDoctor] = useState<GatewayReadinessDoctorPayload | null>(null);
  const [reasoningEffort, setReasoningEffort] = useState<ChatReasoningEffort>('medium');
  const [isPersistingModelSelection, setIsPersistingModelSelection] = useState(false);
  const [isApprovalsSheetOpen, setIsApprovalsSheetOpen] = useState(false);
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<SageMemoryDraft>(() => defaultSageMemoryDraft());
  const [pendingDeleteMemoryId, setPendingDeleteMemoryId] = useState<string | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);
  const threadRef = useRef(thread);
  const pendingUserMessageRef = useRef<WorkstationChatMessageRecord | null>(pendingUserMessage);
  const streamingAssistantTextRef = useRef(streamingAssistantText);
  const liveActivityStepsRef = useRef<LiveActivityStepState[]>(liveActivitySteps);
  const submitInFlightRef = useRef(false);
  const streamAbortHandleRef = useRef<WorkstationTurnStreamAbortHandle | null>(null);
  const streamAbortRequestedRef = useRef(false);
  const streamInFlightRef = useRef(false);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  useEffect(() => {
    pendingUserMessageRef.current = pendingUserMessage;
  }, [pendingUserMessage]);

  const updatePendingUserMessage = useCallback((message: WorkstationChatMessageRecord | null) => {
    pendingUserMessageRef.current = message;
    setPendingUserMessage(message);
  }, []);

  useEffect(() => {
    if (!pendingUserMessage) {
      return;
    }
    const canonicalMessages = thread.messages.filter((message) => !isSyntheticTranscriptMessage(message));
    if (canonicalIncludesMessage(canonicalMessages, pendingUserMessage)) {
      updatePendingUserMessage(null);
    }
  }, [pendingUserMessage, thread.messages, updatePendingUserMessage]);

  useEffect(() => {
    streamingAssistantTextRef.current = streamingAssistantText;
  }, [streamingAssistantText]);

  useEffect(() => {
    liveActivityStepsRef.current = liveActivitySteps;
  }, [liveActivitySteps]);

  const refreshProviderCatalog = useCallback(async () => {
    const payload = await services.queryClient.run('chat:provider-catalog', async () => {
      const profileRequest = services.client.listProviderProfiles().catch(() => ({ items: [] }));
      const catalogRequest = (async () => {
        try {
          return await services.client.listProviderCatalog();
        } catch {
          return await services.client.listProviders();
        }
      })();
      const [catalogPayload, profilesPayload] = await Promise.all([catalogRequest, profileRequest]);
      return {
        catalogPayload,
        profilesPayload,
      };
    }).catch(() => null);

    if (!payload || typeof payload !== 'object') {
      setProviderCatalog((current) => current);
      setProviderProfiles((current) => current);
      setModelOptions((current) => (current.length > 0 ? current : [disconnectedModelOption()]));
      return;
    }

    const normalizedProviders = normalizeProviderCatalogRecords(
      (payload as { catalogPayload?: unknown }).catalogPayload,
    );
    const normalizedProfiles = normalizeProviderProfiles(
      (payload as { profilesPayload?: unknown }).profilesPayload,
    );
    setProviderCatalog(normalizedProviders);
    setProviderProfiles(normalizedProfiles);
    const nextOptions = normalizeChatModelOptions(
      (payload as { catalogPayload?: unknown }).catalogPayload,
    );
    setModelOptions(nextOptions.length > 0 ? nextOptions : [workspaceDefaultModelOption(normalizedProviders)]);
  }, [services.client, services.queryClient]);

  const refreshToolingState = useCallback(async () => {
    const payload = await services.queryClient.run('chat:tooling-state', async () => {
      const [toolPolicyPayload, connectorsPayload] = await Promise.all([
        services.client.getSageToolPolicy().catch(() => ({ tools: [] })),
        services.client.listConnectorsVault().catch(() => ({ items: [] })),
      ]);
      return {
        toolPolicyPayload,
        connectorsPayload,
      };
    }).catch(() => null);

    if (!payload || typeof payload !== 'object') {
      return;
    }

    setToolPolicy(normalizeSageToolPolicy((payload as { toolPolicyPayload?: unknown }).toolPolicyPayload));
    setConnectorCredentials(normalizeConnectorVaultRecords((payload as { connectorsPayload?: unknown }).connectorsPayload));
  }, [services.client, services.queryClient]);

  const refreshBrowserGatewayReadiness = useCallback(async () => {
    const doctorPayload = await services.queryClient.run('chat:gateway-readiness', async () => {
      const registrationsPayload = await services.client.requestJson<Record<string, unknown>>({
        path: `/api/gateway/registrations?workspace_id=${encodeURIComponent(bootstrap.workspace.id)}`,
        allowStatuses: [404],
      });
      const registrations = Array.isArray(registrationsPayload?.items)
        ? registrationsPayload.items.filter((item): item is GatewayReadinessRegistration => Boolean(item) && typeof item === 'object')
        : [];
      const selectedGateway = registrations.find((item) =>
        readString(item.connection_status || item.status).toLowerCase() === 'online',
      ) ?? registrations[0] ?? null;
      const gatewayId = readString(selectedGateway?.gateway_id) || null;
      if (!gatewayId) {
        return null;
      }
      return await services.client.requestJson<GatewayReadinessDoctorPayload>({
        path: `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/doctor`,
        allowStatuses: [403, 404],
      });
    }).catch(() => null);
    setBrowserGatewayDoctor(doctorPayload && typeof doctorPayload === 'object' ? doctorPayload : null);
  }, [bootstrap.workspace.id, services.client, services.queryClient]);

  const persistSelectedModelPreference = useCallback(async (nextModelId: string) => {
    const sortedProfiles = sortProviderProfiles(providerProfiles).filter((profile) => {
      const providerId = readString(profile.provider);
      return providerId && providerCatalog.some((provider) =>
        readString(provider.id) === providerId && isProviderEligibleForModelSelector(provider));
    });

    if (sortedProfiles.length === 0) {
      return false;
    }

    const targetOption = nextModelId === 'default'
      ? null
      : modelOptions.find((option) => option.id === nextModelId) ?? null;
    const targetProviderId = readString(targetOption?.providerId);
    const targetProfile = targetProviderId
      ? sortedProfiles.find((profile) => readString(profile.provider) === targetProviderId && profile.enabled !== false) ?? null
      : null;

    if (nextModelId !== 'default' && (!targetOption || !targetProviderId || !targetProfile)) {
      return false;
    }

    await Promise.all(sortedProfiles.map((profile) => {
      const metadata = {
        ...profileMetadataRecord(profile),
        chat_model_selection: readString(profile.id) === readString(targetProfile?.id) ? 'explicit' : 'default',
      };
      return services.client.upsertProviderProfile({
        id: readString(profile.id) || null,
        provider: readString(profile.provider),
        label: readString(profile.label) || `Sage ${readString(profile.provider)}`,
        credentialId: readString(profile.credential_id) || null,
        authMode: readString(profile.auth_mode) || null,
        priority: Number(profile.priority ?? 100),
        enabled: profile.enabled !== false,
        model: readString(profile.id) === readString(targetProfile?.id)
          ? readString(targetOption?.id) || readString(profile.model) || null
          : readString(profile.model) || null,
        metadata,
      });
    }));

    return true;
  }, [modelOptions, providerCatalog, providerProfiles, services.client]);

  const writeThreadState = (nextThread: CanonicalChatThreadState) => {
    const normalizedMessages = nextThread.messages.filter((message) => !isSyntheticTranscriptMessage(message));
    const mergedThread: CanonicalChatThreadState = {
      ...nextThread,
      messages: normalizedMessages,
    };
    services.queryClient.set(threadQueryKey(mergedThread.threadId), mergedThread);
    services.queryClient.set(ACTIVE_THREAD_QUERY_KEY, nextThread.threadId);
    persistActiveThread(bootstrap.workspace.id, mergedThread.threadId);
    activeThreadIdRef.current = mergedThread.threadId;
    setActiveThreadId(mergedThread.threadId);
    setThread(mergedThread);

    const pendingMessage = pendingUserMessageRef.current;
    if (pendingMessage && canonicalIncludesMessage(mergedThread.messages, pendingMessage)) {
      updatePendingUserMessage(null);
    }
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
    const cachedThread = services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(requestedThreadId));
    const payload = await services.queryClient.run(
      `chat:canonical:thread-load:${requestedThreadId}`,
      async () => services.client.getThread({
        threadId: requestedThreadId,
        allowMissing: true,
      }),
    );
    if (payload === null) {
      if (cachedThread && cachedThread.messages.length > 0) {
        if (activeThreadIdRef.current === requestedThreadId) {
          setThread(cachedThread);
        }
        return cachedThread;
      }
      if (thread.threadId === requestedThreadId && thread.messages.length > 0) {
        return thread;
      }
    }
    const nextThread = normalizeCanonicalChatThread(payload, requestedThreadId);
    nextThread.session = cachedThread?.session ?? null;
    services.queryClient.set(threadQueryKey(nextThread.threadId), nextThread);
    if (activeThreadIdRef.current === requestedThreadId) {
      writeThreadState(nextThread);
    }
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

    await services.queryClient.run('chat:canonical:overview', async () => {
      const [nextRuns, nextApprovals, timelineItems] = await Promise.all([
        runsRequest,
        approvalsRequest,
        timelineRequest,
      ]);
      writeOverview({ nextRuns, nextApprovals });
      if (timelineItems.length > 0) {
        writeRecentThreads(deriveRecentThreads(timelineItems, activeThreadIdRef.current));
        return;
      }
      if (recentThreadsFallback.length > 0) {
        writeRecentThreads(recentThreadsFallback);
        return;
      }
      writeRecentThreads(deriveRecentThreads([], activeThreadIdRef.current));
    });
  };

  const loadMemory = async () => {
    const cachedSnapshot = services.queryClient.peek<SageMemorySnapshot>(SAGE_MEMORY_QUERY_KEY) ?? memorySnapshot;
    const payload = await services.queryClient.run('chat:canonical:memory', async () =>
      services.client.listSageMemory().catch((error) => {
        if (isTransientBackgroundReadError(error)) {
          return null;
        }
        throw error;
      }),
    );
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

  const handleResolveCodexApproval = (approvalId: string, action: CodexApprovalAction) => {
    void handleResolveApproval(approvalId, action === 'deny' ? 'rejected' : 'approved');
  };

  useEffect(() => {
    if (approvals.length === 0 || resolvingApprovalId) {
      return undefined;
    }
    const approval = approvals[0];
    const approvalId = readString(approval?.approval_id || approval?.id);
    if (!approvalId) {
      return undefined;
    }
    const handleApprovalShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTextEditingTarget(event.target)) {
        return;
      }
      if (event.key === '1') {
        event.preventDefault();
        handleResolveCodexApproval(approvalId, 'allow_once');
        return;
      }
      if (event.key === '2') {
        event.preventDefault();
        handleResolveCodexApproval(approvalId, 'allow_session');
        return;
      }
      if (event.key === '3') {
        event.preventDefault();
        handleResolveCodexApproval(approvalId, 'deny');
      }
    };
    window.addEventListener('keydown', handleApprovalShortcut);
    return () => {
      window.removeEventListener('keydown', handleApprovalShortcut);
    };
  }, [approvals, resolvingApprovalId]);

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
    setShowProjectedAssistant(false);
    setTimelineSettled(false);
    setLiveTimelineEvents([]);
    setIsLoading(true);
    try {
      activeThreadIdRef.current = nextThreadId;
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
    updatePendingUserMessage(null);
    setStreamingAssistantText('');
    setShowProjectedAssistant(false);
    setTimelineSettled(false);
    setLiveTimelineEvents([]);
    setLiveActivitySteps([]);
    setLiveTrace(null);
    setIsLoading(true);
    try {
      activeThreadIdRef.current = nextThreadId;
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
    if (activityVersion === 0) {
      return;
    }
    void Promise.all([
      loadOverview(),
      loadMemory(),
    ]).catch((error) => {
      if (shouldSuppressBackgroundRefreshNotice(error)) {
        return;
      }
      setStatusMessage(error instanceof Error ? error.message : 'Chat refresh failed.');
    });
  }, [activeThreadId, activityVersion]);

  useEffect(() => {
    if (activityConnectionState !== 'closed' && notificationsConnectionState !== 'closed') {
      return;
    }
    setStatusMessage((current) => current ?? 'Connection lost. Live updates paused.');
  }, [activityConnectionState, notificationsConnectionState]);

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
          if (shouldSuppressBackgroundRefreshNotice(error)) {
            setStatusMessage(null);
            return;
          }
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

  const projectedTimelineProjection = useMemo(
    () => projectCodexTimeline(liveTimelineEvents),
    [liveTimelineEvents],
  );

  const projectedTimelineCells = projectedTimelineProjection.cells;

  const projectedSystemCells = useMemo(
    () => projectedTimelineCells.filter((cell) => (
      (
        cell.kind === 'reasoning_summary'
        || cell.kind === 'exec'
        || cell.kind === 'tool'
        || cell.kind === 'web_search'
        || cell.kind === 'file_change'
        || cell.kind === 'approval_request'
        || cell.kind === 'status'
        || cell.kind === 'error'
      ) && !isProviderGateSystemCell(cell)
    )),
    [projectedTimelineCells],
  );

  const projectedAssistantCell = useMemo(
    () => {
      const candidate = projectedTimelineCells.find((cell): cell is Extract<CodexTranscriptCell, { kind: 'assistant' }> => cell.kind === 'assistant') ?? null;
      return projectedAssistantLooksSynthetic(candidate) ? null : candidate;
    },
    [projectedTimelineCells],
  );

  const pinnedTimelineCells = isSending ? projectedSystemCells : [];

  const pendingApprovalCells = useMemo<CodexTranscriptCell[]>(() => (
    approvals.map((approval, index) => {
      const approvalId = readString(approval.approval_id || approval.id) || `approval-${index}`;
      const approvalRecord = approval as Record<string, unknown>;
      return {
        id: approvalId,
        kind: 'approval_request',
        prompt: readString(approval.prompt) || `Approval ${index + 1}`,
        actions: ['allow_once', 'allow_session', 'deny'],
        status: 'waiting',
        createdAt: readString(approvalRecord.created_at) || null,
        metadata: {
          ...approval,
          approval_id: approvalId,
        },
      };
    })
  ), [approvals]);

  const visibleTranscriptCells = useMemo(() => {
    const canonicalMessages = thread.messages.filter((message) => !isSyntheticTranscriptMessage(message));
    const nextCells = canonicalMessages
      .map(workstationMessageToCodexCell)
      .filter((cell) => !isProviderGateTranscriptCell(cell));
    if (pendingUserMessage && !canonicalIncludesMessage(canonicalMessages, pendingUserMessage)) {
      nextCells.push(workstationMessageToCodexCell(pendingUserMessage));
    }
    const trailingCell = nextCells[nextCells.length - 1] ?? null;
    const scrollableSystemCells = isSending ? [] : projectedSystemCells;
    const shouldInsertStepsBeforeFinalAssistant = scrollableSystemCells.length > 0
      && trailingCell?.kind === 'assistant';
    if (shouldInsertStepsBeforeFinalAssistant && trailingCell) {
      nextCells.pop();
      nextCells.push(...scrollableSystemCells, trailingCell);
    } else if (scrollableSystemCells.length > 0) {
      nextCells.push(...scrollableSystemCells);
    }
    if (showProjectedAssistant && projectedAssistantCell) {
      nextCells.push(projectedAssistantCell);
    }
    if (pendingApprovalCells.length > 0) {
      nextCells.push(...pendingApprovalCells);
    }
    return nextCells;
  }, [isSending, pendingApprovalCells, pendingUserMessage, projectedAssistantCell, projectedSystemCells, showProjectedAssistant, thread.messages]);

  const hasConversationContent = visibleTranscriptCells.length > 0
    || Boolean(liveTrace);
  const showConversationContext = hasConversationContent || hasEnteredConversationFlow;
  const showFirstImpression = !showConversationContext;
  const showBlankTranscript = !isLoading
    && visibleTranscriptCells.length === 0
    && !liveTrace;
  const latestRun = runs[0];
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
  const gatewayReadinessOnline = readString(browserGatewayDoctor?.status).toLowerCase() === 'healthy';
  const persistedSelectedModelId = useMemo(
    () => resolvePersistedSelectedModelId({
      providers: providerCatalog,
      profiles: providerProfiles,
      modelOptions,
    }),
    [modelOptions, providerCatalog, providerProfiles],
  );
  const selectedModelOption = useMemo(
    () => modelOptions.find((option) => option.id === selectedModel) ?? modelOptions[0] ?? {
      id: 'default',
      label: 'Auto route',
      providerId: null,
      providerLabel: null,
      supportsReasoning: false,
      reasoningLevels: ['low', 'medium', 'high'],
      contextWindowTokens: null,
    },
    [modelOptions, selectedModel],
  );
  const effectiveSelectedModel = useMemo(
    () => modelOptions.some((option) => option.id === selectedModel)
      ? selectedModel
      : selectedModelOption.id,
    [modelOptions, selectedModel, selectedModelOption.id],
  );
  const selectedProviderContext = useMemo(
    () => resolveProviderModelContext({
      providers: providerCatalog,
      selectedModelId: effectiveSelectedModel,
      selectedModelLabel: selectedModelOption.label,
      selectedProviderId: selectedModelOption.providerId,
    }),
    [effectiveSelectedModel, providerCatalog, selectedModelOption.label, selectedModelOption.providerId],
  );
  const selectedProviderRecord = useMemo(
    () => providerCatalog.find((provider) => readString(provider.id) === readString(selectedProviderContext.providerId)) ?? null,
    [providerCatalog, selectedProviderContext.providerId],
  );
  const gatewayToolingOnline = useMemo(
    () => gatewayReadinessOnline,
    [gatewayReadinessOnline],
  );
  const activeProviderSummary = useMemo(() => {
    const providerLabelById = new Map(
      providerCatalog.map((provider) => [readString(provider.id), readString(provider.label) || readString(provider.id)] as const),
    );
    const liveProviderId = readString(liveTrace?.trace?.provider);
    const liveModelId = readString(liveTrace?.trace?.model);
    if (liveProviderId) {
      const liveProvider = providerCatalog.find((provider) => readString(provider.id) === liveProviderId) ?? null;
      const label = providerSummaryLabel({
        provider: liveProvider,
        providerLabel: providerLabelById.get(liveProviderId) || liveProviderId,
        modelLabel: liveModelId || null,
      }) || providerLabelById.get(liveProviderId) || liveProviderId;
      return {
        label,
        connected: true,
      };
    }
    const selectedProviderLabel = providerSummaryLabel({
      provider: selectedProviderRecord,
      providerLabel: selectedProviderContext.providerLabel,
      modelLabel: selectedProviderContext.modelLabel,
    }) || readString(selectedProviderContext.providerLabel);
    if (selectedProviderRecord) {
      const ready = providerReadyForChat(selectedProviderRecord, {
        gatewayToolingOnline,
      });
      return {
        label: ready
          ? selectedProviderLabel
          : `${selectedProviderLabel} · setup needed`,
        connected: ready,
      };
    }
    if (selectedProviderContext.providerLabel) {
      return {
        label: `${selectedProviderLabel} · setup needed`,
        connected: false,
      };
    }
    return {
      label: 'No AI model — Set up in Connected Apps',
      connected: false,
    };
  }, [
    liveTrace?.trace?.model,
    liveTrace?.trace?.provider,
    gatewayToolingOnline,
    providerCatalog,
    selectedProviderRecord,
    selectedProviderContext.modelLabel,
    selectedProviderContext.providerLabel,
  ]);
  const runtimeStatus = useMemo(() => {
    const providerPath = providerPathLabel(selectedProviderRecord);
    const providerId = readString(selectedProviderRecord?.id).toLowerCase();
    const credentialPlane = readString(selectedProviderRecord?.credential_plane).toLowerCase();
    const localProvider = providerId === 'ollama'
      || providerId === 'openai-codex'
      || selectedProviderRecord?.local_only === true
      || credentialPlane === 'local_runtime';
    if (!selectedProviderRecord) {
      return { label: 'No AI model', tone: 'warning' as const };
    }
    if (!gatewayToolingOnline) {
      return { label: 'My Computer offline', tone: 'warning' as const };
    }
    if (localProvider) {
      return { label: providerPath ?? 'My Computer', tone: 'success' as const };
    }
    if (providerPath === 'Empyralis credits') {
      return { label: 'Empyralis credits', tone: 'success' as const };
    }
    if (providerPath === 'Your API key' || providerPath === 'Ollama Cloud') {
      return { label: providerPath, tone: 'neutral' as const };
    }
    return { label: 'Cloud AI', tone: 'neutral' as const };
  }, [gatewayToolingOnline, selectedProviderRecord]);
  const composerToolGroups = useMemo<ComposerToolGroup[]>(() => {
    const localReason = gatewayToolingOnline ? 'Available through this paired computer' : 'Requires a connected computer';
    const emailAvailable = hasConnectedConnector(connectorCredentials, ['google_workspace', 'smtp', 'microsoft_365']);
    const telegramAvailable = hasConnectedConnector(connectorCredentials, ['telegram_bot']);
    const telegramChannelEnabled = hasCapability('telegram_channel_enabled');
    const whatsappChannelEnabled = hasCapability('whatsapp_channel_enabled');
    const spreadsheetAvailable = hasConnectedConnector(connectorCredentials, ['google_workspace', 'microsoft_365']);
    const webSearchEnabled = toolPolicyEnabled(toolPolicy, 'web_search');
    const fetchEnabled = toolPolicyEnabled(toolPolicy, 'http_request');
    const fileEnabled = toolPolicyEnabled(toolPolicy, 'file_access');
    const codeEnabled = toolPolicyEnabled(toolPolicy, 'code_execution');
    const browserStatus = readString(readObject(browserGatewayDoctor?.browser).status).toLowerCase();
    const browserEnabled = gatewayToolingOnline && browserStatus !== 'fail';
    const telegramSendEnabled = gatewayToolingOnline && (telegramAvailable || telegramChannelEnabled);
    const whatsappSendEnabled = gatewayToolingOnline && whatsappChannelEnabled;
    return [
      {
        id: 'local-machine',
        label: 'Local machine',
        items: [
          { id: 'files', label: 'Files', detail: fileEnabled ? localReason : 'Blocked by workspace policy', enabled: gatewayToolingOnline && fileEnabled },
          { id: 'browser', label: 'Browser', detail: browserEnabled ? localReason : 'Browser attach is not ready', enabled: browserEnabled },
          { id: 'screenshot', label: 'Screenshot', detail: browserEnabled ? localReason : 'Browser attach is not ready', enabled: browserEnabled },
          { id: 'clipboard', label: 'Clipboard', detail: localReason, enabled: gatewayToolingOnline },
          { id: 'terminal', label: 'Terminal', detail: codeEnabled ? localReason : 'Blocked by workspace policy', enabled: gatewayToolingOnline && codeEnabled },
        ],
      },
      {
        id: 'web',
        label: 'Web',
        items: [
          { id: 'web-search', label: 'Search', detail: webSearchEnabled ? 'Automatic web lookup is allowed' : 'Blocked by workspace policy', enabled: webSearchEnabled },
          { id: 'fetch-url', label: 'Fetch URL', detail: fetchEnabled ? 'Direct HTTP fetch is allowed' : 'Blocked by workspace policy', enabled: fetchEnabled },
        ],
      },
      {
        id: 'communication',
        label: 'Communication',
        items: [
          {
            id: 'telegram-send',
            label: 'Telegram send',
            detail: telegramSendEnabled
              ? 'Available through this paired computer'
              : (telegramChannelEnabled ? 'Connect your computer to send Telegram messages' : 'Telegram channel is disabled in this workspace'),
            enabled: telegramSendEnabled,
          },
          {
            id: 'whatsapp-send',
            label: 'WhatsApp send',
            detail: whatsappSendEnabled
              ? 'Available through this paired computer'
              : (whatsappChannelEnabled ? 'Connect your computer to send WhatsApp messages' : 'WhatsApp channel is disabled in this workspace'),
            enabled: whatsappSendEnabled,
          },
          { id: 'email-send', label: 'Email', detail: emailAvailable ? 'Email connected app is active' : 'Connect email first', enabled: emailAvailable },
        ],
      },
      {
        id: 'data',
        label: 'Data',
        items: [
          { id: 'spreadsheet', label: 'Spreadsheet', detail: spreadsheetAvailable ? 'Spreadsheet connected app is active' : 'Connect Google Workspace or Microsoft 365', enabled: spreadsheetAvailable },
          { id: 'code-execution', label: 'Code execution', detail: codeEnabled ? localReason : 'Blocked by workspace policy', enabled: gatewayToolingOnline && codeEnabled },
        ],
      },
    ];
  }, [browserGatewayDoctor, connectorCredentials, gatewayToolingOnline, hasCapability, toolPolicy]);
  const integrationsHref = useMemo(
    () => routeManifest.routeIndex.integrations?.href ?? `/w/${encodeURIComponent(bootstrap.workspace.id)}/integrations`,
    [bootstrap.workspace.id, routeManifest.routeIndex.integrations],
  );
  const gatewayHref = useMemo(
    () => routeManifest.routeIndex.gateway?.href ?? `/w/${encodeURIComponent(bootstrap.workspace.id)}/gateway`,
    [bootstrap.workspace.id, routeManifest.routeIndex.gateway],
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
      const connectedProviders = sortLaunchChatProviders(providerCatalog.filter(isProviderEligibleForModelSelector));
      const providerById = new Map(
        providerCatalog.map((provider) => [readString(provider.id), provider] as const),
      );
      if (connectedProviders.length <= 1) {
        return modelOptions.map((option) => ({
          value: option.id,
          label: modelOptionDisplayLabel(option, providerById.get(readString(option.providerId)) ?? null),
          disabled: !option.id,
        }));
      }

      const groupedOptions: ({ value: string; label: string; disabled: boolean } | { label: string; options: { value: string; label: string; disabled: boolean }[] })[] = [];
      const defaultOption = modelOptions.find((option) => option.id === 'default') ?? null;
      if (defaultOption) {
        groupedOptions.push({
          value: defaultOption.id,
          label: modelOptionDisplayLabel(defaultOption, providerById.get(readString(defaultOption.providerId)) ?? null),
          disabled: !defaultOption.id,
        });
      }
      for (const provider of connectedProviders) {
        const providerId = readString(provider.id);
        const providerLabel = readString(provider.label) || providerId;
        const options = modelOptions
          .filter((option) => option.id !== 'default' && option.providerId === providerId)
          .map((option) => ({
            value: option.id,
            label: modelOptionDisplayLabel(option, provider),
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
    ? 'Needs your OK is waiting'
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
  const readinessPills = useMemo<SageReadinessPill[]>(() => {
    const pills: SageReadinessPill[] = [];
    if (!selectedProviderContext.providerLabel) {
      pills.push({
        id: 'provider',
        label: 'AI: Connect model',
        tone: 'danger',
        target: 'integrations',
      });
    }
    if (!gatewayReadinessOnline) {
      pills.push({
        id: 'gateway',
        label: 'My Computer: Offline',
        tone: 'danger',
        target: 'gateway',
      });
    }
    const browserPill = browserReadinessPill(browserGatewayDoctor, {
      gatewayOnline: gatewayReadinessOnline,
    });
    if (browserPill) {
      pills.push(browserPill);
    }
    return pills;
  }, [browserGatewayDoctor, gatewayReadinessOnline, selectedProviderContext.providerLabel]);
  const showContextStrip = false;
  const showHeaderReadinessStrip = false;

  useEffect(() => {
    let cancelled = false;
    void refreshProviderCatalog()
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) {
          return;
        }
      });
    void refreshToolingState().catch(() => undefined);
    void refreshBrowserGatewayReadiness().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshBrowserGatewayReadiness, refreshProviderCatalog, refreshToolingState]);

  useEffect(() => subscribeWorkstationProviderChanged((detail) => {
    if (detail.workspaceId !== bootstrap.workspace.id) {
      return;
    }
    void refreshProviderCatalog();
    void refreshToolingState();
    void refreshBrowserGatewayReadiness();
  }), [bootstrap.workspace.id, refreshBrowserGatewayReadiness, refreshProviderCatalog, refreshToolingState]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return () => {};
    }
    const handleFocus = () => {
      void refreshProviderCatalog();
      void refreshToolingState();
      void refreshBrowserGatewayReadiness();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshProviderCatalog();
        void refreshToolingState();
        void refreshBrowserGatewayReadiness();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshBrowserGatewayReadiness, refreshProviderCatalog, refreshToolingState]);

  useEffect(() => {
    if (isPersistingModelSelection) {
      return;
    }
    const nextSelectedModel = modelOptions.some((option) => option.id === persistedSelectedModelId)
      ? persistedSelectedModelId
      : modelOptions[0]?.id ?? '';
    if (nextSelectedModel !== selectedModel) {
      setSelectedModel(nextSelectedModel);
    }
  }, [isPersistingModelSelection, modelOptions, persistedSelectedModelId, selectedModel]);

  useEffect(() => {
    if (!selectedModelOption.reasoningLevels.includes(reasoningEffort)) {
      setReasoningEffort(selectedModelOption.reasoningLevels.includes('medium')
        ? 'medium'
        : selectedModelOption.reasoningLevels[0] ?? 'medium');
    }
  }, [reasoningEffort, selectedModelOption.reasoningLevels]);

  const handleModelChange = useCallback((nextModelId: string) => {
    if (!nextModelId || nextModelId === selectedModel || isSending || isPersistingModelSelection) {
      return;
    }
    const previousModelId = selectedModel;
    setSelectedModel(nextModelId);
    setStatusMessage(null);
    setIsPersistingModelSelection(true);
    void persistSelectedModelPreference(nextModelId)
      .then(async (persisted) => {
        if (!persisted) {
          setSelectedModel(previousModelId);
          setStatusMessage('This provider cannot save a workspace model preference yet.');
          return;
        }
        services.queryClient.invalidate('chat:provider-catalog');
        await refreshProviderCatalog();
      })
      .catch((error) => {
        setSelectedModel(previousModelId);
        setStatusMessage(error instanceof Error ? error.message : 'Could not update the model preference.');
      })
      .finally(() => {
        setIsPersistingModelSelection(false);
      });
  }, [
    isPersistingModelSelection,
    isSending,
    persistSelectedModelPreference,
    refreshProviderCatalog,
    selectedModel,
    services.queryClient,
  ]);

  const finalizePartialAssistantResponse = useCallback((threadId: string) => {
    const partialText = readString(streamingAssistantTextRef.current);
    if (!partialText) {
      return;
    }
    const currentThread = threadRef.current;
    const incompleteMessage = createIncompleteAssistantMessage(partialText, threadId, {
      trace_id: readString(liveTrace?.traceId),
      effective_provider: readString(liveTrace?.trace?.provider),
      effective_model: readString(liveTrace?.trace?.model),
    });
    if (!incompleteMessage) {
      return;
    }
    writeThreadState({
      ...currentThread,
      threadId,
      messages: [...currentThread.messages, incompleteMessage],
      session: currentThread.session,
    });
    setStreamingAssistantText('');
  }, [liveTrace?.trace?.model, liveTrace?.trace?.provider, liveTrace?.traceId]);

  const stopStreamingResponse = useCallback(() => {
    if (!streamInFlightRef.current) {
      return;
    }
    streamAbortRequestedRef.current = true;
    streamAbortHandleRef.current?.abort();
    setShowProjectedAssistant(false);
    setTimelineSettled(true);
    finalizePartialAssistantResponse(activeThreadIdRef.current);
    streamInFlightRef.current = false;
    setIsSending(false);
  }, [finalizePartialAssistantResponse]);

  useEffect(() => {
    if (!isSending) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      stopStreamingResponse();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isSending, stopStreamingResponse]);

  const sendMessage = async () => {
    const outboundMessage = draft.trim();
    if (!outboundMessage || isSending || submitInFlightRef.current) {
      return;
    }
    submitInFlightRef.current = true;
    if (!activeProviderSummary.connected) {
      setHasEnteredConversationFlow(true);
      setSendFailureNotice(
        selectedProviderRecord
          ? providerFailureNoticeForProvider(selectedProviderRecord)
          : {
              message: 'Sage needs an AI path before it can answer. Use Empyralis credits, add your own API key, or connect My Computer for local Ollama in Connected Apps.',
              retryable: false,
              actions: [
                { label: 'Manage credits', target: 'integrations' },
                { label: 'Add API key', target: 'integrations' },
                { label: 'Choose AI Model', target: 'integrations' },
              ],
            },
      );
      submitInFlightRef.current = false;
      return;
    }
    const resolvedProviderId = readString(selectedProviderContext.providerId) || null;
    const resolvedModelId = readString(selectedProviderContext.modelId)
      || (effectiveSelectedModel === 'default' ? null : effectiveSelectedModel);
    if (isSmallOllamaSelection(
      resolvedProviderId,
      resolvedModelId || effectiveSelectedModel,
      selectedProviderContext.modelLabel || selectedModelOption.label,
    )) {
      const warningKey = [
        'sage-small-ollama-model-warning',
        bootstrap.workspace.id,
        resolvedModelId || effectiveSelectedModel,
      ].join(':');
      try {
        if (window.sessionStorage.getItem(warningKey) !== '1') {
          window.sessionStorage.setItem(warningKey, '1');
          setSmallModelWarningVisible(true);
        }
      } catch {
        setSmallModelWarningVisible(true);
      }
    }
    setDraft('');
    setHasEnteredConversationFlow(true);

    const requestedThreadId = activeThreadId;
    const clientRequestId = createClientTurnRequestId();
    const pendingMessage = createPendingUserMessage(outboundMessage, requestedThreadId, clientRequestId);
    const streamAbortHandle: WorkstationTurnStreamAbortHandle = {
      signal: new AbortController().signal,
      abort: () => undefined,
    };
    const streamAbortController = new AbortController();
    streamAbortHandle.signal = streamAbortController.signal;
    streamAbortHandle.abort = () => {
      streamAbortController.abort();
    };
    setIsSending(true);
    streamInFlightRef.current = false;
    streamAbortRequestedRef.current = false;
    streamAbortHandleRef.current = streamAbortHandle;
    setStatusMessage(null);
    setSendFailureNotice(null);
    updatePendingUserMessage(pendingMessage);
    setStreamingAssistantText('');
    setShowProjectedAssistant(true);
    setTimelineSettled(false);
    setLiveTimelineEvents([
      {
        type: 'user',
        payload: { content: outboundMessage },
      },
      {
        type: 'step',
        payload: {
          id: `thinking:${clientRequestId}`,
          kind: 'thinking',
          label: 'Thinking',
          detail: 'Planning the response',
          status: 'active',
        },
      },
    ]);
    setLiveActivitySteps([{
      id: `thinking:${clientRequestId}`,
      kind: 'thinking',
      label: 'Thinking',
      detail: 'Planning the response',
      status: 'active',
      toolCallId: null,
      createdAt: new Date().toISOString(),
    }]);
    setLiveTrace({
      traceId: null,
      transport: 'external',
      trace: buildLiveTraceRecord({
        traceId: null,
        workspaceId: bootstrap.workspace.id,
        threadId: requestedThreadId,
        rootAgentId: 'sage',
      }),
      events: [],
    });

    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });

      let session = await services.client.createSession({
        actor,
        threadId: requestedThreadId,
        channel: 'web',
        source: 'workstation_chat_pane',
        forceNew: false,
        existingSession: thread.session,
      });
      const persistedThreadPayload = await services.client.persistUserTurn({
        actor,
        sessionId: String(session.session_id),
        threadId: requestedThreadId,
        message: outboundMessage,
        channel: 'web',
        metadata: {
          source: 'workstation_chat_pane',
        },
        clientRequestId,
      });
      const persistedThreadState: CanonicalChatThreadState = {
        ...normalizeCanonicalChatThread(persistedThreadPayload, requestedThreadId),
        session,
      };
      writeThreadState(persistedThreadState);

      let observedTraceId: string | null = null;
      let observedThreadId = requestedThreadId;
      let terminalTraceSeen = false;
      let observedFinalReply: string | null = null;
      const onTraceEvent = (traceEvent: WorkstationAgentTraceEvent) => {
        observedTraceId = readString(traceEvent.trace_id) || observedTraceId;
        terminalTraceSeen = terminalTraceSeen || isTerminalTraceEvent(readString(traceEvent.event_type));
        setLiveTimelineEvents((current) => [...current, {
          type: 'trace',
          payload: traceEvent as unknown as Record<string, unknown>,
        }]);
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
        const eventType = readString(traceEvent.event_type);
        const eventData = readObject(traceEvent.data);
        if (eventType === 'reasoning.summary.delta') {
          const delta = readString(eventData.delta);
          if (delta) {
            setLiveActivitySteps((current) => {
              const thinkingIndex = current.findIndex((item) => item.kind === 'thinking');
              if (thinkingIndex < 0) {
                return current;
              }
              const updated = [...current];
              updated[thinkingIndex] = {
                ...updated[thinkingIndex],
                detail: delta,
              };
              return updated;
            });
          }
          return;
        }
        if (eventType === 'tool.started') {
          const toolName = readString(eventData.tool_name) || 'Using tool';
          setLiveActivitySteps((current) => upsertLiveActivityStep(current, {
            id: readString(traceEvent.tool_call_id) || `${toolName}:${current.length}`,
            kind: 'tool',
            label: toolName,
            detail: 'Running',
            status: 'active',
            toolCallId: readString(traceEvent.tool_call_id) || null,
            createdAt: new Date().toISOString(),
          }));
          return;
        }
        if (eventType === 'tool.result') {
          setLiveActivitySteps((current) => upsertLiveActivityStep(current, {
            id: readString(traceEvent.tool_call_id) || `tool:${current.length}`,
            kind: 'tool',
            label: '',
            detail: eventData.status === 'error' ? 'Failed' : 'Completed',
            status: eventData.status === 'error' ? 'error' : 'done',
            toolCallId: readString(traceEvent.tool_call_id) || null,
            createdAt: new Date().toISOString(),
          }));
          return;
        }
        if (eventType === 'search.query') {
          const query = readString(eventData.query);
          setLiveActivitySteps((current) => upsertLiveActivityStep(current, {
            id: readString(traceEvent.tool_call_id) || `search:${query || current.length}`,
            kind: 'search',
            label: 'Searching',
            detail: query,
            status: 'active',
            toolCallId: readString(traceEvent.tool_call_id) || null,
            createdAt: new Date().toISOString(),
          }));
          return;
        }
        if (eventType === 'search.results') {
          setLiveActivitySteps((current) => upsertLiveActivityStep(current, {
            id: readString(traceEvent.tool_call_id) || `search:${current.length}`,
            kind: 'search',
            label: 'Search',
            detail: 'Completed',
            status: 'done',
            toolCallId: readString(traceEvent.tool_call_id) || null,
            createdAt: new Date().toISOString(),
          }));
        }
      };

      streamInFlightRef.current = true;
      const { response, session: streamedSession } = await services.client.submitTurnStreamWithSessionRetry({
        actor,
        threadId: requestedThreadId,
        message: outboundMessage,
        channel: 'web',
        source: 'workstation_chat_pane',
        runtimeTarget: localRuntimeTargetId || 'cloud',
        provider: resolvedProviderId,
        model: resolvedModelId,
        reasoningEffort,
        existingSession: session,
        clientRequestId,
        abortHandle: streamAbortHandle,
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

          if (event.event === 'step') {
            setLiveTimelineEvents((current) => [...current, {
              type: 'step',
              payload: event.payload,
            }]);
            const step = normalizeStepEvent(event.payload);
            if (step) {
              setLiveActivitySteps((current) => upsertLiveActivityStep(current, step));
            }
            return;
          }

          if (event.event === 'chunk') {
            const delta = readString(event.payload.delta);
            if (delta) {
              setLiveTimelineEvents((current) => [...current, {
                type: 'chunk',
                payload: { delta },
              }]);
              setStreamingAssistantText((current) => `${current}${delta}`);
              setLiveActivitySteps((current) => {
                const thinkingIndex = current.findIndex((item) => item.kind === 'thinking');
                if (thinkingIndex < 0) {
                  return current;
                }
                const updated = [...current];
                updated[thinkingIndex] = {
                  ...updated[thinkingIndex],
                  label: 'Writing output',
                  detail: 'Streaming response',
                };
                return updated;
              });
            }
            return;
          }

          if (event.event === 'final') {
            setLiveTimelineEvents((current) => [...current, {
              type: 'final',
              payload: event.payload,
            }]);
            setTimelineSettled(true);
            const finalReply = readString(event.payload.reply)
              || readString(event.payload.content)
              || readString(event.payload.message);
            if (finalReply) {
              observedFinalReply = finalReply;
              setStreamingAssistantText(finalReply);
              setStatusMessage(null);
              setSendFailureNotice(null);
            }
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
      session = streamedSession;

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
        reply: readString(response.reply) || observedFinalReply || undefined,
        thread_id: String(response.thread_id ?? observedThreadId ?? requestedThreadId),
        metadata: responseMetadata,
      };
      const responseExecutionTarget = readExecutionTarget(responseMetadata);
      const providerFailureIntervention = findProviderFailureIntervention(normalizedResponse.interventions ?? []);
      const providerFailureRecord = providerCatalog.find((provider) =>
        readString(provider.id).toLowerCase() === readString(responseMetadata.effective_provider || responseMetadata.provider).toLowerCase(),
      ) ?? selectedProviderRecord;
      const nextThreadId = String(normalizedResponse.thread_id ?? requestedThreadId);
      const nextMessages = (
        persistedThreadState.threadId === nextThreadId && persistedThreadState.messages.length > 0
          ? persistedThreadState.messages
          : threadRef.current.messages
      );
      const assistantMessage = createCanonicalAssistantMessage(normalizedResponse, nextThreadId);
      const assistantMessageVisible = Boolean(
        assistantMessage
        && !isSyntheticTranscriptMessage(assistantMessage),
      );
      const hasVisibleAssistantReply = Boolean(
        assistantMessageVisible
        || (
          typeof normalizedResponse.reply === 'string'
          && normalizedResponse.reply.trim()
          && !isProviderRuntimeGateMessage(normalizedResponse.reply)
        ),
      );

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

      const responseMessage = assistantMessageVisible ? assistantMessage : null;
      const immediateMessages = responseMessage
        ? [...nextMessages, responseMessage]
        : nextMessages;
      writeThreadState({
        ...(persistedThreadState.threadId === nextThreadId ? persistedThreadState : thread),
        threadId: nextThreadId,
        messages: immediateMessages,
        session,
      });
      setShowProjectedAssistant(false);
      setTimelineSettled(true);
      setStreamingAssistantText('');
      setLiveActivitySteps((current) => settleLiveActivitySteps(
        current,
        normalizedResponse.status === 'incomplete' ? 'error' : 'done',
      ));
      services.streams.touchActivity();
      const canonicalThread = await refreshCanonicalState(nextThreadId)
        .catch(() => null);
      const canonicalMessages = canonicalThread?.messages ?? [];
      const canonicalHasAssistant = canonicalMessages.some((message) => (
        message.role === 'assistant'
        && readString(message.content)
        && readString(message.content) === readString(responseMessage?.content)
      ));
      if (canonicalThread && (!responseMessage || canonicalHasAssistant)) {
        writeThreadState({
          ...canonicalThread,
          session,
        });
      } else if (responseMessage) {
        writeThreadState({
          ...thread,
          threadId: nextThreadId,
          messages: immediateMessages,
          session,
        });
      }
      const hasPendingApprovals = Array.isArray(normalizedResponse.approvals) && normalizedResponse.approvals.length > 0;
      const hasProviderFailure = Boolean(providerFailureIntervention);
      const providerGateDetected = hasProviderFailure
        || isProviderRuntimeGateMessage(readString(normalizedResponse.reply));
      const needsUserIntervention = Array.isArray(normalizedResponse.interventions)
        && normalizedResponse.interventions.length > 0
        && !hasVisibleAssistantReply;
      setStatusMessage(
        providerGateDetected
          ? null
          : hasPendingApprovals
            ? responseExecutionTarget === 'local_companion'
              ? 'Sage is waiting for approval before using the local companion.'
              : 'Needs your OK is waiting.'
            : needsUserIntervention && !hasProviderFailure
              ? 'Sage needs your input before it can continue.'
              : null,
      );
      setSendFailureNotice(
        providerGateDetected
          ? providerFailureNoticeForProvider(
              providerFailureRecord,
              providerFailureMessageForProvider(providerFailureRecord),
            )
          : null,
      );
    } catch (error) {
      updatePendingUserMessage(null);
      const normalizedError = error instanceof WorkstationClientError ? error : null;
      const aborted = normalizedError?.code === 'stream_aborted' || streamAbortRequestedRef.current;
      const partialStreamText = readString(streamingAssistantTextRef.current);
      const incompleteWithPartial = normalizedError?.code === 'stream_incomplete' && Boolean(partialStreamText);
      if (aborted || incompleteWithPartial) {
        setShowProjectedAssistant(false);
        setTimelineSettled(true);
        finalizePartialAssistantResponse(activeThreadIdRef.current);
        setSendFailureNotice(incompleteWithPartial
          ? {
              message: 'Response interrupted before completion.',
              retryable: true,
              retryDraft: outboundMessage,
            }
          : null);
      } else {
        setStreamingAssistantText('');
        setShowProjectedAssistant(false);
        setTimelineSettled(true);
        const rawMessage = error instanceof WorkstationClientError || error instanceof Error
          ? error.message
          : 'Could not send this message.';
        const normalizedRawMessage = rawMessage.toLowerCase();
        const providerNeedsAttention = normalizedRawMessage.includes('provider')
          || normalizedRawMessage.includes('credential')
          || normalizedRawMessage.includes('api key')
          || normalizedRawMessage.includes('ollama')
          || normalizedRawMessage.includes('selected for chat')
          || normalizedRawMessage.includes('not available');
        const localComputerNeedsAttention = isLocalCompanionGateMessage(rawMessage) || normalizedRawMessage.includes('gateway offline');
        const authNeedsAttention = normalizedError?.status === 401 || normalizedError?.status === 403;
        const rateLimitFailure = normalizedError?.status === 429 || /rate.?limit|capacity/i.test(normalizedRawMessage);
        const timeoutFailure = /timed out|too long to respond|request timeout/i.test(normalizedRawMessage);
        const transportFailure = /failed to fetch|could not connect|network error|transport failure|connection/i.test(normalizedRawMessage);
        const serverFailure = (typeof normalizedError?.status === 'number' && normalizedError.status >= 500)
          || /bad gateway|gateway timeout|service unavailable|internal server error|server error/i.test(normalizedRawMessage);
        const noticeMessage = isLocalCompanionGateMessage(rawMessage)
          ? 'My Computer is needed for this request. Connect this computer and try again.'
          : providerNeedsAttention
            ? 'The selected AI path is not ready. Use Empyralis credits, add your own API key, connect My Computer, or choose another model in Connected Apps.'
            : authNeedsAttention
              ? 'Your session needs attention before Sage can continue. Refresh the page or sign in again.'
              : rateLimitFailure
                ? 'Sage is temporarily at capacity. Try again in a moment or switch AI model.'
                : timeoutFailure
                  ? 'Sage took too long to respond. Try again or switch AI model.'
                  : transportFailure
                    ? 'The request could not reach the server. Check your connection and try again.'
                    : serverFailure
                      ? 'Sage hit a temporary server issue before it could reply. Try again in a moment.'
                      : "Sage couldn't complete that turn. Try again or choose another AI model in Connected Apps.";
        const providerNotice = providerNeedsAttention
          ? providerFailureNoticeForProvider(selectedProviderRecord, noticeMessage)
          : null;
        setSendFailureNotice({
          message: providerNotice?.message ?? noticeMessage,
          retryable: error instanceof WorkstationClientError
            ? error.retryable
            : true,
          actions: localComputerNeedsAttention
            ? [{ label: 'Connect My Computer', target: 'gateway' }]
            : authNeedsAttention
              ? undefined
              : providerNotice?.actions,
          retryDraft: outboundMessage,
        });
      }
      setLiveActivitySteps((current) => settleLiveActivitySteps(current, aborted ? 'done' : 'error'));
    } finally {
      submitInFlightRef.current = false;
      streamInFlightRef.current = false;
      streamAbortHandleRef.current = null;
      streamAbortRequestedRef.current = false;
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
          className="workstation-titlebar__action workstation-titlebar__action--compose"
          onClick={() => {
            void startNewThread();
          }}
        >
          <SquarePen size={15} strokeWidth={1.95} aria-hidden="true" />
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
              {activeProviderSummary.connected ? (
                <span>{activeProviderSummary.label}</span>
              ) : (
                <>
                  <button
                    type="button"
                    className="app-chat-context-strip__link"
                    onClick={() => {
                      router.push(integrationsHref);
                    }}
                  >
                    {activeProviderSummary.label}
                  </button>
                </>
              )}
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
          {showHeaderReadinessStrip && readinessPills.length > 0 ? (
            <div className="app-chat-readiness-strip" aria-label="Sage readiness">
              {readinessPills.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  className={`app-chat-readiness-pill app-chat-readiness-pill--${pill.tone}`}
                  onClick={() => {
                    router.push(pill.target === 'gateway' ? gatewayHref : integrationsHref);
                  }}
                >
                  <span className="app-chat-readiness-pill__dot" aria-hidden="true" />
                  <span>{pill.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          <ScrollRegion className="app-chat-thread__scroll">
            <div className="app-chat-thread__body">
              {showBlankTranscript ? (
                <div className={`app-chat-empty-state${recentRunRows.length > 0 ? ' app-chat-empty-state--recent' : ''}`}>
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
                </div>
              ) : null}

              {visibleTranscriptCells.map((cell, index) => (
                <CodexChatCell
                  key={`${cell.kind}:${cell.id}:${index}`}
                  cell={cell}
                  resolvingApprovalId={resolvingApprovalId}
                  onResolveApproval={handleResolveCodexApproval}
                />
              ))}
            </div>
          </ScrollRegion>
        </section>

        {pinnedTimelineCells.length > 0 ? (
          <div className="app-chat-live-activity-dock" aria-live="polite">
            {pinnedTimelineCells.map((cell, index) => (
              <CodexChatCell
                key={`pinned:${cell.kind}:${cell.id}:${index}`}
                cell={cell}
                resolvingApprovalId={resolvingApprovalId}
                onResolveApproval={handleResolveCodexApproval}
              />
            ))}
          </div>
        ) : null}

        <div className="app-chat-notices">
          {sendFailureNotice ? (
            <AppNotice
              tone="warning"
              role="status"
              aria-live="polite"
              className="app-chat-status-notice"
            >
              <div className="app-chat-status-notice__copy">
                <strong>Action needed</strong>
                <span>{sendFailureNotice.message}</span>
              </div>
              <div className="app-chat-status-notice__actions">
                {(sendFailureNotice.actions ?? []).map((action) => (
                  <AppButton
                    key={`${action.target}:${action.label}`}
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      setSendFailureNotice(null);
                      router.push(action.target === 'gateway' ? gatewayHref : integrationsHref);
                    }}
                  >
                    {action.label}
                  </AppButton>
                ))}
                {sendFailureNotice.retryable ? (
                  <AppButton
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      if (sendFailureNotice.retryDraft) {
                        setDraft(sendFailureNotice.retryDraft);
                      }
                      setSendFailureNotice(null);
                    }}
                  >
                    Try again
                  </AppButton>
                ) : null}
                <AppButton
                  type="button"
                  tone="ghost"
                  onClick={() => {
                    setSendFailureNotice(null);
                  }}
                >
                  Dismiss
                </AppButton>
              </div>
            </AppNotice>
          ) : null}

          {!sendFailureNotice && statusMessage ? (
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
                    if (statusNotice?.actionTarget === 'gateway') {
                      setStatusMessage(null);
                      router.push(gatewayHref);
                      return;
                    }
                    if (statusNotice?.actionTarget === 'integrations') {
                      setStatusMessage(null);
                      router.push(integrationsHref);
                      return;
                    }
                    setStatusMessage(null);
                  }}
                >
                  {statusNotice?.actionLabel ?? (statusNotice?.requiresLocalAccess ? 'Got it' : 'Dismiss')}
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
        onStop={stopStreamingResponse}
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
        model={effectiveSelectedModel}
        modelOptions={composerModelOptions}
        onModelChange={handleModelChange}
        reasoningEffort={reasoningEffort}
        reasoningOptions={reasoningOptions}
        onReasoningEffortChange={(nextValue) => {
          if (selectedModelOption.reasoningLevels.includes(nextValue as ChatReasoningEffort)) {
            setReasoningEffort(nextValue as ChatReasoningEffort);
          }
        }}
        contextWindowLabel={contextWindowLabel}
        busy={isSending}
        controlsDisabled={isPersistingModelSelection}
        sendDisabled={false}
        placeholder="Message Sage..."
        providerGateVisible={!activeProviderSummary.connected}
        providerSummary={{
          label: activeProviderSummary.label,
          actionLabel: 'Set up in Connected Apps',
        }}
        runtimeStatusLabel={runtimeStatus.label}
        runtimeStatusTone={runtimeStatus.tone}
        toolGroups={composerToolGroups}
        smallModelWarning={smallModelWarningVisible
          ? "You're using a small model. For best results with tools and complex tasks, we recommend switching to a larger model (7B+)."
          : null}
        onDismissSmallModelWarning={() => {
          setSmallModelWarningVisible(false);
        }}
        showAutonomySelector={localCompanionConnected}
        autonomyFallbackLabel="Offline"
      />

      <CommandSheet
        open={isApprovalsSheetOpen}
        title="Needs your OK"
        description="Review pending requests that need your OK for this conversation."
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
