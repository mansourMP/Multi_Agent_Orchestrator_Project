'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSagePlatformApi } from './sage.api';
import { type PlatformRunDetailContract, usePlatformShell } from '@/components/orion/PlatformShellContext';
import { EMPYRALIS_NEW_CHAT_EVENT } from '@/components/orion/PlatformTopBar';
import { ChatSurface, type ChatIdentityAction, type ChatIdentitySection } from '@/components/orion/chat/ChatSurface';
import {
  CHAT_SESSION_SELECT_EVENT,
  CHAT_STORE_STORAGE_KEY,
  CHAT_STORE_UPDATED_EVENT,
  createChatId,
  createEmptyChatSession,
  dedupeChatMessages,
  normalizeChatContent,
  sanitizeChatStore,
  threadRecordToChatSession,
  upsertSessionMessages,
  type ChatApprovalRequestRecord,
  type ChatContextUsedRecord,
  type ChatInterventionRecord,
  type ChatMessageActionRecord,
  type ChatMessageRecord,
  type ChatRunCardApprovalRecord,
  type ChatRunCardRecord,
  type ChatRunCardStatus,
  type ChatSessionRecord,
  type ChatSessionSelectDetail,
  type ChatStoreRecord,
} from '@/components/orion/chat/chatSchema';
import {
  fetchActivityTimeline,
  fetchMasterChatContext,
  type ActivityTimelinePayload,
  type MasterChatContextRecord,
  type WorkspaceAgentInstallRecord,
} from '@/lib/api';
import type { ThreadRecord } from '@shared/api-contract';
import { WorkbenchShell } from '@/components/orion/workbench/WorkbenchShell';
import {
  GLOBAL_COMMAND_EVENT,
  LEGACY_ORION_GLOBAL_COMMAND_EVENT,
  LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY,
  PENDING_GLOBAL_COMMAND_STORAGE_KEY,
  type PlatformGlobalCommandEventDetail,
} from '@/lib/commandRegistry';
import { BRAND } from '@/lib/brand';
import { controlPlaneSignInUrl, ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { shouldUseDurableRunForTaskRequest } from '@/lib/primaryRunPath';
import { RUN_COMPLETED_STATUS_COPY, RUN_FAILED_STATUS_COPY } from '@/lib/runStartCopy';

type ChatDepthValue = 'low' | 'medium' | 'high';

type PendingSimpleChatResponse = {
  sessionId: string;
  messageId: string;
  goal: string;
};

type PendingSimpleRun = {
  sessionId: string;
  messageId: string;
  runId: string | null;
  goal: string;
};

type OperatorChatErrorWithCode = Error & {
  code?: string;
};

type SimpleChatPermissionPrompt = {
  runId: string;
  approvalId: string;
  prompt: string;
  labels: string[];
  capabilities: string[];
  actions: string[];
  target?: string | null;
  scope: 'once';
  reusable: boolean;
  consequence?: string | null;
};

const CHAT_DEPTH_OPTIONS: Array<{ value: ChatDepthValue; label: string; description: string }> = [
  { value: 'low', label: 'Quick', description: 'Fastest response' },
  { value: 'medium', label: 'Standard', description: 'Balanced depth' },
  { value: 'high', label: 'Deep', description: 'More reasoning' },
];

function sessionBelongsToWorkspace(session: ChatSessionRecord, workspaceId: string): boolean {
  const scopedWorkspaceId = String(session.metadata?.workspaceId || '').trim();
  return !scopedWorkspaceId || scopedWorkspaceId === workspaceId;
}

function createWorkspaceSession(
  workspaceId: string,
  masterAgentInstallId: string | null,
  overrides?: Partial<Pick<ChatSessionRecord, 'id' | 'title'>>,
): ChatSessionRecord {
  return createEmptyChatSession(new Date().toISOString(), {
    id: overrides?.id,
    title: overrides?.title,
    masterAgentInstallId,
    metadata: {
      workspaceId,
      surface: 'sage',
    },
  });
}

function sortChatMessages(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  return [...messages].sort((left, right) => {
    const leftTs = Date.parse(left.ts || '');
    const rightTs = Date.parse(right.ts || '');
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return leftTs - rightTs;
    }
    return left.id.localeCompare(right.id);
  });
}

function mapStartedRunStatusToChatMessageStatus(status: string): ChatMessageRecord['status'] {
  if (status === 'waiting' || status === 'waiting_for_input') return 'waiting';
  if (status === 'queued_local') return 'running';
  if (status === 'failed' || status === 'timeout') return 'error';
  return 'running';
}

function mapStartedRunStatusToRunCardStatus(status: string): ChatRunCardStatus {
  if (status === 'waiting' || status === 'waiting_for_input') return 'waiting';
  if (status === 'queued_local') return 'preparing';
  if (status === 'failed' || status === 'timeout') return 'failed';
  return 'running';
}

function createInitialChatStore(): ChatStoreRecord {
  const seed = createWorkspaceSession('default', null);
  return {
    version: 1,
    selectedSessionId: seed.id,
    sessions: [seed],
  };
}

function truncateChatContext(value: string, limit = 84): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No conversation yet';
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trimEnd()}…` : normalized;
}

function isNoProviderChatError(error: unknown): error is OperatorChatErrorWithCode {
  return error instanceof Error && String((error as OperatorChatErrorWithCode).code || '').trim() === 'no_provider';
}

function isAuthRequiredChatError(error: unknown): error is OperatorChatErrorWithCode {
  return error instanceof Error && String((error as OperatorChatErrorWithCode).code || '').trim() === 'auth_required';
}

function formatShellTopError(message: string | null): string | null {
  const text = String(message || '').trim();
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (normalized.includes('provider profiles path is not writable')) {
    return 'Local companion setup issue: provider profile storage is not writable.';
  }
  if (normalized.includes('setup is not complete')) {
    return 'Setup is incomplete. Finish setup before running tasks.';
  }
  if (normalized.includes('continue in your browser to sign in') || normalized.includes('sign in required')) {
    return null;
  }
  return text;
}

function formatSimpleChatTrustLabel(trustMode: string, accessMode: string): string {
  if (accessMode === 'full' || trustMode === 'auto') return 'Agent Mode · Full-trust requested';
  return 'Co-Pilot Mode · Approval cards enabled';
}

function mapRunStatusToChatRunCardStatus(status: string): ChatRunCardStatus {
  if (status === 'queued_local') return 'preparing';
  if (status === 'running') return 'running';
  if (status === 'waiting') return 'waiting';
  if (status === 'completed') return 'completed';
  return 'failed';
}

function extractRunIdFromPayload(lastRunPayload: Record<string, unknown> | null): string | null {
  if (!lastRunPayload || typeof lastRunPayload !== 'object') return null;
  const runId = String(lastRunPayload.run_id || '').trim();
  return runId || null;
}

function humanizeRunCardLabel(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function humanizeProviderLabel(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'anthropic') return 'Anthropic';
  if (normalized === 'gemini') return 'Gemini';
  if (normalized === 'vertex') return 'Vertex AI';
  if (normalized === 'codex_cli') return 'Codex/OpenAI';
  if (normalized === 'claude_code_cli') return 'Claude Code';
  return humanizeRunCardLabel(normalized);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function listStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function formatRuntimeDeploymentMode(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'cloud_only') return 'Cloud + mobile';
  if (normalized === 'local_only') return 'Local captain';
  if (normalized === 'hybrid') return 'Hybrid captain';
  if (normalized === 'self_hosted_business') return 'Self-hosted';
  return 'Connected workspace';
}

function formatRuntimeTargetLabel(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Cloud default';
  if (normalized === 'cloud_default') return 'Cloud default';
  if (normalized === 'local_companion') return 'Local companion';
  if (normalized === 'self_host_runtime') return 'Self-host runtime';
  return humanizeScopeLabel(value);
}

function humanizeScopeLabel(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase()) || 'Unknown';
}

function formatActivityActorLabel(item: Record<string, unknown>): string {
  const actorType = String(item.actor_type || '').trim().toLowerCase();
  const actorId = String(item.actor_id || '').trim();
  if (actorType === 'sage') return 'Sage';
  if (actorType === 'specialist') return actorId ? `Specialist · ${humanizeScopeLabel(actorId)}` : 'Specialist';
  if (actorType === 'application') return actorId ? `App · ${humanizeScopeLabel(actorId)}` : 'Application';
  if (actorType === 'system') return 'System';
  return humanizeScopeLabel(actorType || actorId || 'activity');
}

function readPendingApprovalRecord(payload: Record<string, unknown> | null): SimpleChatPermissionPrompt | null {
  const pending = payload?.pending_confirmation || payload?.pending_approval;
  if (!pending || typeof pending !== 'object') return null;
  const pendingRecord = pending as Record<string, unknown>;
  const approvalId = String(pendingRecord.approval_id || '').trim();
  const prompt = String(pendingRecord.prompt || '').trim();
  if (!approvalId || !prompt) return null;
  const metadata = pendingRecord.metadata && typeof pendingRecord.metadata === 'object'
    ? pendingRecord.metadata as Record<string, unknown>
    : {};
  return {
    runId: String(payload?.run_id || '').trim(),
    approvalId,
    prompt,
    labels: Array.isArray(metadata.approval_labels)
      ? metadata.approval_labels.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    capabilities: Array.isArray(metadata.approval_capabilities)
      ? metadata.approval_capabilities.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    actions: Array.isArray(pendingRecord.actions)
      ? pendingRecord.actions.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    target: String(pendingRecord.target || '').trim() || null,
    scope: 'once',
    reusable: typeof pendingRecord.reusable === 'boolean' ? pendingRecord.reusable : false,
    consequence: String(pendingRecord.consequence || '').trim() || null,
  };
}

function buildTranscriptApprovalRequest(
  approval: SimpleChatPermissionPrompt,
  actionId: string | null = null,
  resolution: ChatApprovalRequestRecord['resolution'] = 'waiting',
): ChatApprovalRequestRecord {
  return {
    id: approval.approvalId || createChatId('approval'),
    approvalId: approval.approvalId || null,
    runId: approval.runId || null,
    actionId,
    prompt: approval.prompt,
    labels: approval.labels,
    capabilities: approval.capabilities,
    actions: approval.actions,
    target: approval.target || null,
    scope: 'once',
    reusable: approval.reusable,
    consequence: approval.consequence || null,
    resolution,
  };
}

function buildOperatorChatApprovalRequests(payload: {
  approvals?: Array<Record<string, unknown>> | null;
  actions?: ChatMessageActionRecord[] | null;
}): ChatApprovalRequestRecord[] {
  const approvalActions = (Array.isArray(payload.actions) ? payload.actions : []).filter((action) => action.kind === 'approval_required');
  return (Array.isArray(payload.approvals) ? payload.approvals : [])
    .map((entry, index): ChatApprovalRequestRecord | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const prompt = String(record.prompt || '').trim();
      if (!prompt) return null;
      const approvalId = String(record.approval_id || '').trim();
      const runId = String(record.run_id || '').trim();
      const resolution = String(record.status || 'waiting').trim().toLowerCase();
      return {
        id: approvalId || approvalActions[index]?.id || createChatId('approval'),
        approvalId: approvalId || null,
        runId: runId || null,
        actionId: approvalActions[index]?.id || null,
        prompt,
        labels: Array.isArray(record.labels) ? record.labels.map((item) => String(item || '').trim()).filter(Boolean) : [],
        capabilities: Array.isArray(record.capabilities) ? record.capabilities.map((item) => String(item || '').trim()).filter(Boolean) : [],
        actions: Array.isArray(record.actions) ? record.actions.map((item) => String(item || '').trim()).filter(Boolean) : [],
        target: String(record.target || '').trim() || null,
        scope: 'once',
        reusable: typeof record.reusable === 'boolean' ? record.reusable : false,
        consequence: String(record.consequence || '').trim() || null,
        resolution: resolution === 'approved' || resolution === 'rejected' ? resolution : 'waiting',
      };
    })
    .filter((entry): entry is ChatApprovalRequestRecord => Boolean(entry));
}

function buildOperatorChatInterventions(
  interventions: Array<Record<string, unknown>> | null | undefined,
): ChatInterventionRecord[] {
  return (Array.isArray(interventions) ? interventions : [])
    .map((entry): ChatInterventionRecord | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const title = String(record.title || '').trim();
      const kind = String(record.kind || '').trim();
      if (!title || !kind) return null;
      const severity = String(record.severity || 'info').trim().toLowerCase();
      const status = String(record.status || '').trim().toLowerCase();
      return {
        id: String(record.id || '').trim() || createChatId('intervention'),
        kind: kind as ChatInterventionRecord['kind'],
        title,
        detail: String(record.detail || '').trim() || null,
        severity: severity === 'warning' || severity === 'error' ? severity : 'info',
        status: status === 'ready' || status === 'waiting' || status === 'active' || status === 'completed' || status === 'failed'
          ? status as ChatInterventionRecord['status']
          : undefined,
        code: String(record.code || '').trim() || null,
        runId: String(record.run_id || '').trim() || null,
        metadata: record.metadata && typeof record.metadata === 'object'
          ? record.metadata as Record<string, unknown>
          : null,
      };
    })
    .filter((entry): entry is ChatInterventionRecord => Boolean(entry));
}

function summarizeCapabilitySystems(
  items: NonNullable<ChatContextUsedRecord['tool_capabilities']> | undefined,
  mode: 'connected' | 'usable' | 'unavailable' | 'unverified',
): string {
  const labels = (Array.isArray(items) ? items : [])
    .filter((item) => {
      if (mode === 'connected') return item.connected;
      if (mode === 'usable') return item.runtime_usable === true;
      if (mode === 'unavailable') return item.connected && item.runtime_usable === false;
      return item.connected && item.runtime_usable == null;
    })
    .map((item) => item.label)
    .filter(Boolean);
  return labels.length > 0 ? labels.join(', ') : mode === 'connected' ? 'None' : 'Not verified';
}

function summarizeCapabilityActions(
  items: NonNullable<ChatContextUsedRecord['tool_capabilities']> | undefined,
  key: 'read_actions' | 'write_actions' | 'approval_required_actions',
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    const values = Array.isArray(item[key]) ? item[key] : [];
    for (const entry of values) {
      const token = String(entry || '').trim();
      if (!token || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out.length > 0 ? out.join(', ') : 'Not verified';
}

function readRunDetailContract(payload: Record<string, unknown> | null): PlatformRunDetailContract {
  if (!payload || typeof payload !== 'object') return null;
  const contract = payload.run_detail_contract;
  return contract && typeof contract === 'object'
    ? contract as PlatformRunDetailContract
    : null;
}

function readRunProviderModelContract(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const contract = readRunDetailContract(payload);
  const providerModel = contract?.provider_model;
  return providerModel && typeof providerModel === 'object'
    ? providerModel as Record<string, unknown>
    : null;
}

function readRequestedProvider(payload: Record<string, unknown> | null): string {
  const contract = readRunProviderModelContract(payload);
  return String(contract?.requested_provider || '').trim();
}

function readEffectiveProvider(payload: Record<string, unknown> | null): string {
  const contract = readRunProviderModelContract(payload);
  return String(contract?.effective_provider || '').trim();
}

function readRequestedModel(payload: Record<string, unknown> | null): string {
  const contract = readRunProviderModelContract(payload);
  return String(contract?.requested_model || '').trim();
}

function readEffectiveModel(payload: Record<string, unknown> | null): string {
  const contract = readRunProviderModelContract(payload);
  return String(contract?.effective_model || '').trim();
}

function readRunFallbackUsed(payload: Record<string, unknown> | null): boolean {
  const contract = readRunProviderModelContract(payload);
  return Boolean(contract?.fallback_used);
}

function truncateRunCardTitle(goal: string, limit = 58): string {
  const compact = String(goal || '').replace(/\s+/g, ' ').trim();
  if (!compact) return 'Execution';
  return compact.length > limit ? `${compact.slice(0, limit - 1).trimEnd()}…` : compact;
}

function extractRunReplyText(lastRunPayload: Record<string, unknown> | null, topError: string | null, status: string): string {
  const candidates: unknown[] = [
    lastRunPayload?.result,
    lastRunPayload?.result_data,
    lastRunPayload?.result_summary,
    topError,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return normalizeChatContent(candidate);
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      for (const key of ['summary', 'result', 'message', 'text', 'reply', 'content', 'output']) {
        const nested = record[key];
        if (typeof nested === 'string' && nested.trim()) return normalizeChatContent(nested);
      }
    }
  }

  if (status === 'error') return `${RUN_FAILED_STATUS_COPY} Open Runs for details.`;
  return `${RUN_COMPLETED_STATUS_COPY} Open Runs for details.`;
}

function buildRunCardMeta(lastRunPayload: Record<string, unknown> | null): ChatRunCardRecord['meta'] {
  const meta: NonNullable<ChatRunCardRecord['meta']> = [];
  if (!lastRunPayload || typeof lastRunPayload !== 'object') return meta;
  meta.push({
    id: 'request:summary',
    label: 'Requested',
    value: `${humanizeProviderLabel(readRequestedProvider(lastRunPayload))} · ${readRequestedModel(lastRunPayload) || 'Unknown'}`,
  });
  meta.push({
    id: 'effective:summary',
    label: 'Effective',
    value: `${humanizeProviderLabel(readEffectiveProvider(lastRunPayload))} · ${readEffectiveModel(lastRunPayload) || 'Unknown'}`,
  });
  if (readRunFallbackUsed(lastRunPayload)) {
    meta.push({ id: 'fallback:used', label: 'Fallback', value: 'Used' });
  }
  return meta.slice(0, 3);
}

function buildRunCardEvidence(lastRunPayload: Record<string, unknown> | null): ChatRunCardRecord['evidence'] {
  if (!lastRunPayload || typeof lastRunPayload !== 'object') {
    return [{ id: 'evidence:none', label: 'Evidence', value: 'No evidence captured' }];
  }
  const rawItems = Array.isArray(lastRunPayload.evidence_items) ? lastRunPayload.evidence_items : [];
  const evidence = rawItems
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const label = String(record.label || '').trim();
      const value = String(record.value || '').trim();
      if (!label || !value) return null;
      return {
        id: String(record.id || `evidence:${index}`),
        label,
        value,
      };
    })
    .filter((item): item is NonNullable<ChatRunCardRecord['evidence']>[number] => item !== null);
  if (evidence.length === 0) {
    return [{ id: 'evidence:none', label: 'Evidence', value: 'No evidence captured' }];
  }
  return evidence.slice(0, 4);
}

function buildRunCardApproval(lastRunPayload: Record<string, unknown> | null): ChatRunCardApprovalRecord | null {
  const approval = readPendingApprovalRecord(lastRunPayload);
  if (!approval) return null;
  return {
    prompt: approval.prompt,
    labels: approval.labels,
    capabilities: approval.capabilities,
    actions: approval.actions,
    target: approval.target,
    scope: 'once',
    reusable: approval.reusable,
    consequence: approval.consequence,
  };
}

function buildRunCardFromPayload(args: {
  goal: string;
  runId: string | null;
  status: string;
  lastRunPayload: Record<string, unknown> | null;
  topError: string | null;
}): ChatRunCardRecord {
  const { goal, runId, status, lastRunPayload, topError } = args;
  const summary = status === 'queued_local'
    ? 'Preparing execution on your machine.'
    : status === 'running'
      ? 'Working on this now.'
      : status === 'waiting'
        ? 'Waiting for confirmation to continue.'
        : status === 'error'
          ? topError || 'This run needs attention.'
          : extractRunReplyText(lastRunPayload, topError, status);
  return {
    title: truncateRunCardTitle(goal),
    summary,
    status: mapRunStatusToChatRunCardStatus(status),
    runId,
    provider: readEffectiveProvider(lastRunPayload) || null,
    model: readEffectiveModel(lastRunPayload) || null,
    sourceGoal: goal,
    meta: buildRunCardMeta(lastRunPayload),
    evidence: buildRunCardEvidence(lastRunPayload),
    approval: status === 'waiting' ? buildRunCardApproval(lastRunPayload) : null,
  };
}

export default function SageHome() {
  return <SageWorkspace />;
}

function SageWorkspace() {
  const primaryGoalRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();
  const {
    accessMode,
    activeWorkspaceId,
    activeTenantId,
    workspaceLoading,
    setInspectState,
  } = usePlatformShell();

  const trustMode = accessMode === 'full' ? 'auto' : 'guarded';
  const {
    model,
    setModel,
    modelOptions,
    modelsLoading,
    status,
    setStatus,
    runId,
    lastRunPayload,
    topError,
    setTopError,
    closeStream,
    fetchRunResult,
    sendOperatorChat,
    startOperatorRun,
  } = useSagePlatformApi({
    activeWorkspaceId,
    activeTenantId,
    trustMode,
  });

  const [goal, setGoal] = useState('');
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [chatStore, setChatStore] = useState<ChatStoreRecord>(createInitialChatStore);
  const [chatIdentityDrawerOpen, setChatIdentityDrawerOpen] = useState(false);
  const [simpleChatDepth, setSimpleChatDepth] = useState<ChatDepthValue>('medium');
  const [pendingSimpleChat, setPendingSimpleChat] = useState<PendingSimpleChatResponse | null>(null);
  const [pendingSimpleRun, setPendingSimpleRun] = useState<PendingSimpleRun | null>(null);
  const [chatNoProviderStatus, setChatNoProviderStatus] = useState(false);
  const [chatAuthRequiredMessage, setChatAuthRequiredMessage] = useState<string | null>(null);
  const [masterThreadId, setMasterThreadId] = useState<string | null>(null);
  const [sageInstall, setSageInstall] = useState<WorkspaceAgentInstallRecord | null>(null);
  const [activeSpecialistAgents, setActiveSpecialistAgents] = useState<WorkspaceAgentInstallRecord[]>([]);
  const [masterContext, setMasterContext] = useState<MasterChatContextRecord | null>(null);
  const [activityTimeline, setActivityTimeline] = useState<ActivityTimelinePayload | null>(null);

  const selectedSessionId = chatStore.selectedSessionId || chatStore.sessions[0]?.id || null;
  const selectedChatSession = useMemo(
    () => chatStore.sessions.find((session) => session.id === selectedSessionId) || chatStore.sessions[0] || null,
    [chatStore.sessions, selectedSessionId],
  );
  const selectedChatMessages = selectedChatSession?.messages || [];
  const isMobile = viewportWidth < 1024;

  const persistChatStore = useCallback((next: ChatStoreRecord) => {
    try {
      window.localStorage.setItem(CHAT_STORE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write failures.
    }
    window.dispatchEvent(new Event(CHAT_STORE_UPDATED_EVENT));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    persistChatStore(chatStore);
  }, [chatStore, persistChatStore]);

  const updateChatStore = useCallback((updater: (current: ChatStoreRecord) => ChatStoreRecord) => {
    setChatStore((current) => updater(current));
  }, []);

  const appendSimpleChatMessage = useCallback((sessionId: string, message: ChatMessageRecord) => {
    updateChatStore((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === sessionId ? upsertSessionMessages(session, [...session.messages, message], message.ts) : session,
      ),
    }));
  }, [updateChatStore]);

  const patchSimpleChatMessage = useCallback((sessionId: string, messageId: string, patch: Partial<ChatMessageRecord>) => {
    updateChatStore((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === sessionId
          ? upsertSessionMessages(
              session,
              session.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
              typeof patch.ts === 'string' ? patch.ts : new Date().toISOString(),
            )
          : session,
      ),
    }));
  }, [updateChatStore]);

  const replaceSimpleChatMessage = useCallback((sessionId: string, messageId: string, nextMessage: ChatMessageRecord) => {
    updateChatStore((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === sessionId
          ? upsertSessionMessages(
              session,
              session.messages.map((message) => (message.id === messageId ? nextMessage : message)),
              nextMessage.ts || new Date().toISOString(),
            )
          : session,
      ),
    }));
  }, [updateChatStore]);

  const removeSimpleChatMessage = useCallback((sessionId: string, messageId: string) => {
    updateChatStore((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === sessionId
          ? upsertSessionMessages(
              session,
              session.messages.filter((message) => message.id !== messageId),
              new Date().toISOString(),
            )
          : session,
      ),
    }));
  }, [updateChatStore]);

  const createNewChat = useCallback(() => {
    closeStream();
    setGoal('');
    setTopError(null);
    setChatAuthRequiredMessage(null);
    setChatNoProviderStatus(false);
    setPendingSimpleChat(null);
    setPendingSimpleRun(null);
    setStatus('idle');
    setInspectState(null);
    updateChatStore((current) => {
      const nextSession = createWorkspaceSession(activeWorkspaceId, sageInstall?.id || null);
      return {
        ...current,
        selectedSessionId: nextSession.id,
        sessions: [nextSession, ...current.sessions.filter((session) => session.id !== nextSession.id)],
      };
    });
  }, [activeWorkspaceId, closeStream, sageInstall?.id, setInspectState, setStatus, setTopError, updateChatStore]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(CHAT_STORE_STORAGE_KEY);
      const parsed = raw ? sanitizeChatStore(JSON.parse(raw)) : null;
      if (!parsed) {
        setChatStore(createInitialChatStore());
        return;
      }
      const sessions = parsed.sessions.filter((session) => sessionBelongsToWorkspace(session, activeWorkspaceId));
      if (sessions.length === 0) {
        setChatStore(createInitialChatStore());
        return;
      }
      const selected = sessions.some((session) => session.id === parsed.selectedSessionId)
        ? parsed.selectedSessionId
        : sessions[0]?.id || null;
      setChatStore({
        version: 1,
        selectedSessionId: selected,
        sessions,
      });
    } catch {
      setChatStore(createInitialChatStore());
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (workspaceLoading) return;
    let alive = true;

    const loadMasterContext = async () => {
      try {
        const [context, timeline] = await Promise.all([
          fetchMasterChatContext(activeWorkspaceId),
          fetchActivityTimeline(activeWorkspaceId, 8).catch(() => null),
        ]);
        if (!alive) return;
        setMasterContext(context);
        setActivityTimeline(timeline);
        setMasterThreadId(String(context.thread_id || '').trim() || null);
        setSageInstall(context.master_install);
        setActiveSpecialistAgents(Array.isArray(context.specialist_installs) ? context.specialist_installs : []);

        const baseSession = context.thread && typeof context.thread === 'object'
          ? threadRecordToChatSession(context.thread as unknown as ThreadRecord)
          : createWorkspaceSession(activeWorkspaceId, context.master_install?.id || null, {
              id: context.thread_id || undefined,
            });

        const remoteSession: ChatSessionRecord = {
          ...baseSession,
          masterAgentInstallId: context.master_install?.id || baseSession.masterAgentInstallId || null,
          metadata: {
            ...(baseSession.metadata || {}),
            workspaceId: activeWorkspaceId,
            surface: 'sage',
          },
          messages: dedupeChatMessages(sortChatMessages(baseSession.messages)),
        };

        updateChatStore((current) => {
          const scopedSessions = current.sessions.filter((session) => sessionBelongsToWorkspace(session, activeWorkspaceId));
          const existing = scopedSessions.find((session) => session.id === remoteSession.id) || null;
          const mergedMessages = existing
            ? dedupeChatMessages(sortChatMessages([...remoteSession.messages, ...existing.messages]))
            : remoteSession.messages;
          const mergedSession = upsertSessionMessages(
            {
              ...remoteSession,
              metadata: {
                ...(existing?.metadata || {}),
                ...(remoteSession.metadata || {}),
              },
            },
            mergedMessages,
            remoteSession.updatedAt,
          );
          const remaining = scopedSessions.filter((session) => session.id !== mergedSession.id);
          const nextSessions = [mergedSession, ...remaining];
          const nextSelected = nextSessions.some((session) => session.id === current.selectedSessionId)
            ? current.selectedSessionId
            : mergedSession.id;
          return {
            version: 1,
            selectedSessionId: nextSelected,
            sessions: nextSessions,
          };
        });
      } catch {
        if (!alive) return;
        setMasterContext(null);
        setActivityTimeline(null);
        setMasterThreadId(null);
        setSageInstall(null);
        setActiveSpecialistAgents([]);
        updateChatStore((current) => {
          const scopedSessions = current.sessions.filter((session) => sessionBelongsToWorkspace(session, activeWorkspaceId));
          if (scopedSessions.length > 0) {
            return {
              version: 1,
              selectedSessionId: scopedSessions.some((session) => session.id === current.selectedSessionId)
                ? current.selectedSessionId
                : scopedSessions[0]?.id || null,
              sessions: scopedSessions,
            };
          }
          const fallback = createWorkspaceSession(activeWorkspaceId, null);
          return {
            version: 1,
            selectedSessionId: fallback.id,
            sessions: [fallback],
          };
        });
      }
    };

    void loadMasterContext();
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, updateChatStore, workspaceLoading]);

  useEffect(() => {
    if (chatStore.sessions.length > 0) return;
    const fallback = createWorkspaceSession(activeWorkspaceId, sageInstall?.id || null, {
      id: masterThreadId || undefined,
    });
    setChatStore({
      version: 1,
      selectedSessionId: fallback.id,
      sessions: [fallback],
    });
  }, [activeWorkspaceId, chatStore.sessions.length, masterThreadId, sageInstall?.id]);

  useEffect(() => {
    if (!selectedChatSession && chatStore.sessions.length > 0) {
      setChatStore((current) => ({
        ...current,
        selectedSessionId: current.sessions[0]?.id || null,
      }));
    }
  }, [chatStore.sessions, selectedChatSession]);

  useEffect(() => {
    const apply = () => setViewportWidth(window.innerWidth);
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  useEffect(() => {
    const handleChatSessionSelect = (event: Event) => {
      const detail = (event as CustomEvent<ChatSessionSelectDetail | undefined>).detail;
      const sessionId = String(detail?.sessionId || '').trim();
      if (!sessionId) return;
      setChatStore((current) => (
        current.sessions.some((session) => session.id === sessionId)
          ? { ...current, selectedSessionId: sessionId }
          : current
      ));
    };
    window.addEventListener(CHAT_SESSION_SELECT_EVENT, handleChatSessionSelect as EventListener);
    return () => window.removeEventListener(CHAT_SESSION_SELECT_EVENT, handleChatSessionSelect as EventListener);
  }, []);

  useEffect(() => {
    window.addEventListener(EMPYRALIS_NEW_CHAT_EVENT, createNewChat);
    return () => window.removeEventListener(EMPYRALIS_NEW_CHAT_EVENT, createNewChat);
  }, [createNewChat]);

  useEffect(() => {
    const activeRunId = pendingSimpleRun?.runId || runId;
    const contract = readRunDetailContract(lastRunPayload);
    if (!activeRunId || !contract || !['queued_local', 'running', 'waiting'].includes(status)) {
      setInspectState(null);
      return;
    }
    setInspectState({
      runId: activeRunId,
      status,
      runDetailContract: contract,
    });
  }, [lastRunPayload, pendingSimpleRun?.runId, runId, setInspectState, status]);

  useEffect(() => () => {
    closeStream();
    setInspectState(null);
  }, [closeStream, setInspectState]);

  useEffect(() => {
    if (chatAuthRequiredMessage) return;
    if (modelOptions.length > 0 || modelsLoading) {
      setChatNoProviderStatus(false);
    }
  }, [chatAuthRequiredMessage, modelOptions.length, modelsLoading]);

  useEffect(() => {
    if (!pendingSimpleRun) return;
    if (!pendingSimpleRun.runId && runId && ['running', 'queued_local', 'waiting'].includes(status)) {
      setPendingSimpleRun((current) => (current ? { ...current, runId } : current));
      patchSimpleChatMessage(pendingSimpleRun.sessionId, pendingSimpleRun.messageId, {
        run_id: runId,
        status: status === 'waiting' ? 'waiting' : 'running',
        approvalRequests: [],
        runCard: {
          title: truncateRunCardTitle(pendingSimpleRun.goal),
          summary: status === 'queued_local' ? 'Preparing execution on your machine.' : status === 'waiting' ? 'Waiting for confirmation to continue.' : 'Working on this now.',
          status: status === 'queued_local' ? 'preparing' : status === 'waiting' ? 'waiting' : 'running',
          runId,
          sourceGoal: pendingSimpleRun.goal,
          meta: [{ id: 'route:selected', label: 'Route', value: 'On your machine' }],
          evidence: [],
          approval: null,
        },
      });
    }
  }, [patchSimpleChatMessage, pendingSimpleRun, runId, status]);

  const simpleChatPermissionPrompt = useMemo<SimpleChatPermissionPrompt | null>(() => {
    if (status !== 'waiting') return null;
    const activeRunId = pendingSimpleRun?.runId || runId;
    if (!activeRunId) return null;
    const payloadRunId = extractRunIdFromPayload(lastRunPayload);
    if (payloadRunId && payloadRunId !== activeRunId) return null;
    const approval = readPendingApprovalRecord(lastRunPayload);
    if (!approval || !approval.approvalId) return null;
    return {
      runId: activeRunId,
      approvalId: approval.approvalId,
      prompt: approval.prompt || 'This run needs confirmation before it can continue.',
      labels: approval.labels,
      capabilities: approval.capabilities,
      actions: approval.actions,
      target: approval.target,
      scope: 'once',
      reusable: approval.reusable,
      consequence: approval.consequence,
    };
  }, [lastRunPayload, pendingSimpleRun, runId, status]);

  useEffect(() => {
    if (!pendingSimpleRun?.runId) return;
    if (!['completed', 'waiting', 'error'].includes(status)) return;
    const payloadRunId = extractRunIdFromPayload(lastRunPayload);
    const isMatchingRun =
      (payloadRunId && payloadRunId === pendingSimpleRun.runId)
      || ((!payloadRunId || status === 'waiting') && runId === pendingSimpleRun.runId);
    if (!isMatchingRun) return;

    const existingMessage = chatStore.sessions
      .find((session) => session.id === pendingSimpleRun.sessionId)
      ?.messages.find((message) => message.id === pendingSimpleRun.messageId);
    const nextRunCard = buildRunCardFromPayload({
      goal: pendingSimpleRun.goal,
      runId: pendingSimpleRun.runId || runId,
      status,
      lastRunPayload,
      topError,
    });
    const nextApprovalRequests = status === 'waiting' && simpleChatPermissionPrompt
      ? [buildTranscriptApprovalRequest(simpleChatPermissionPrompt)]
      : [];
    patchSimpleChatMessage(pendingSimpleRun.sessionId, pendingSimpleRun.messageId, {
      status: nextRunCard.status === 'failed' ? 'error' : status === 'waiting' ? 'waiting' : 'completed',
      run_id: pendingSimpleRun.runId || runId,
      runCard: nextRunCard,
      approvalRequests: nextApprovalRequests,
      actions: existingMessage?.actions || [],
      ts: new Date().toISOString(),
    });
    if (status !== 'waiting') {
      setPendingSimpleRun(null);
    }
  }, [
    chatStore.sessions,
    lastRunPayload,
    patchSimpleChatMessage,
    pendingSimpleRun,
    runId,
    simpleChatPermissionPrompt,
    status,
    topError,
  ]);

  const submitSimpleChatPermissionDecision = useCallback(async (decision: 'Proceed' | 'Hold') => {
    const prompt = simpleChatPermissionPrompt;
    if (!prompt) return;
    await ensureControlPlaneSession();
    const res = await fetch('/api/approvals/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: prompt.runId,
        approvalId: prompt.approvalId,
        decision,
        note: `Resolved from ${BRAND.product} chat`,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || 'Failed to send decision.');
    }
    if (decision === 'Proceed' && pendingSimpleRun) {
      patchSimpleChatMessage(pendingSimpleRun.sessionId, pendingSimpleRun.messageId, {
        status: 'running',
        approvalRequests: [],
        runCard: {
          title: truncateRunCardTitle(pendingSimpleRun.goal),
          summary: 'Continuing after your confirmation.',
          status: 'running',
          runId: prompt.runId,
          sourceGoal: pendingSimpleRun.goal,
          meta: [{ id: 'route:selected', label: 'Route', value: 'On your machine' }],
          evidence: [],
          approval: null,
        },
        ts: new Date().toISOString(),
      });
    } else if (decision !== 'Proceed' && pendingSimpleRun) {
      patchSimpleChatMessage(pendingSimpleRun.sessionId, pendingSimpleRun.messageId, {
        approvalRequests: [
          buildTranscriptApprovalRequest(prompt, null, 'rejected'),
        ],
        ts: new Date().toISOString(),
      });
    }
    const nextStatus = await fetchRunResult(prompt.runId);
    if (nextStatus === 'queued_local' || nextStatus === 'running' || nextStatus === 'waiting' || nextStatus === 'completed' || nextStatus === 'error') {
      setStatus(nextStatus);
    }
    if (decision !== 'Proceed' && nextStatus && nextStatus !== 'waiting') {
      setPendingSimpleRun(null);
    }
  }, [fetchRunResult, patchSimpleChatMessage, pendingSimpleRun, setStatus, simpleChatPermissionPrompt]);

  const handleSimpleChatMessageAction = useCallback(async (messageId: string, action: ChatMessageActionRecord) => {
    const sessionId = selectedChatSession?.id;
    if (!sessionId) return;

    if (action.kind === 'approval_required') {
      const connector = String(action.connector || '').trim();
      const actionId = String(action.action || '').trim();
      const input = String(action.input || '').trim();
      if (!connector || !actionId || !input) return;
      const existingMessage = selectedChatMessages.find((message) => message.id === messageId) || null;
      patchSimpleChatMessage(sessionId, messageId, {
        status: 'running',
        actions: [],
        approvalRequests: [],
        content: 'Working on it...',
        ts: new Date().toISOString(),
      });
      setPendingSimpleChat({ sessionId, messageId, goal: '__approval_confirmed__' });
      let streamedSteps: NonNullable<ChatMessageRecord['steps']> = [];
      try {
        let streamedReply = '';
        const payload = await sendOperatorChat('__approval_confirmed__', {
          reasoningEffort: simpleChatDepth,
          clientSessionKey: sessionId,
          masterAgentInstallId: sageInstall?.id || selectedChatSession?.masterAgentInstallId || null,
          runtimeProfileId: sageInstall?.runtime_profile?.id || sageInstall?.runtime_profile_id || null,
          approvedAction: {
            connector,
            action: actionId,
            input,
          },
          onSteps: (steps) => {
            streamedSteps = steps;
            patchSimpleChatMessage(sessionId, messageId, {
              steps,
              status: 'running',
              ts: new Date().toISOString(),
            });
          },
          onChunk: (delta) => {
            streamedReply += delta;
            patchSimpleChatMessage(sessionId, messageId, {
              content: streamedReply,
              status: 'running',
              ts: new Date().toISOString(),
            });
          },
        });
        setChatAuthRequiredMessage(null);
        setChatNoProviderStatus(false);
        const nextActions = Array.isArray(payload.actions) ? payload.actions : [];
        const nextApprovalRequests = buildOperatorChatApprovalRequests({
          approvals: (payload.approvals || []) as Array<Record<string, unknown>>,
          actions: nextActions,
        });
        const nextInterventions = buildOperatorChatInterventions((payload.interventions || []) as Array<Record<string, unknown>>);
        patchSimpleChatMessage(sessionId, messageId, {
          content: nextApprovalRequests.length > 0 || nextInterventions.length > 0 ? '' : (payload.reply || streamedReply || ''),
          status: nextApprovalRequests.length > 0 ? 'waiting' : payload.error ? 'error' : 'completed',
          actions: nextActions,
          approvalRequests: nextApprovalRequests,
          interventions: nextInterventions,
          artifacts: Array.isArray(payload.artifacts) && payload.artifacts.length > 0 ? payload.artifacts : [],
          contextUsed: payload.context_used || null,
          steps: Array.isArray(payload.steps) && payload.steps.length > 0 ? payload.steps : streamedSteps,
          ts: new Date().toISOString(),
        });
      } catch (error) {
        if (isNoProviderChatError(error)) {
          setChatNoProviderStatus(true);
          if (existingMessage) replaceSimpleChatMessage(sessionId, messageId, existingMessage);
          return;
        }
        if (isAuthRequiredChatError(error)) {
          setChatAuthRequiredMessage(error.message || 'Continue in your browser to sign in.');
          if (existingMessage) replaceSimpleChatMessage(sessionId, messageId, existingMessage);
          return;
        }
        patchSimpleChatMessage(sessionId, messageId, {
          content: error instanceof Error ? error.message : 'Failed to confirm and execute action.',
          status: 'error',
          actions: [],
          approvalRequests: [],
          interventions: [],
          contextUsed: null,
          steps: streamedSteps,
          ts: new Date().toISOString(),
        });
      } finally {
        setPendingSimpleChat(null);
      }
      return;
    }

    if (action.kind === 'connect' || action.kind === 'open') {
      if (action.href) router.push(action.href);
      return;
    }

    if (action.kind === 'workflow') {
      router.push(action.href || '/library');
      return;
    }

    if (action.kind !== 'run') return;

    const runGoal = String(action.goal || '').trim();
    if (!runGoal) return;
    patchSimpleChatMessage(sessionId, messageId, {
      status: 'running',
      actions: [],
      runCard: {
        title: truncateRunCardTitle(runGoal),
        summary: 'Preparing execution on your machine.',
        status: 'preparing',
        runId: null,
        sourceGoal: runGoal,
        meta: [{ id: 'route:selected', label: 'Route', value: 'On your machine' }],
        evidence: [],
        approval: null,
      },
    });
    setPendingSimpleRun({
      sessionId,
      messageId,
      runId: null,
      goal: runGoal,
    });
    const runPayload = await startOperatorRun({ goal: runGoal });
    if (!runPayload || typeof runPayload !== 'object') {
      patchSimpleChatMessage(sessionId, messageId, {
        status: 'error',
        runCard: {
          title: truncateRunCardTitle(runGoal),
          summary: topError || 'The run could not be started.',
          status: 'failed',
          runId: null,
          sourceGoal: runGoal,
          meta: [{ id: 'route:selected', label: 'Route', value: 'On your machine' }],
          evidence: [],
          approval: null,
        },
      });
      setPendingSimpleRun(null);
    }
  }, [
    masterThreadId,
    patchSimpleChatMessage,
    replaceSimpleChatMessage,
    router,
    sageInstall?.id,
    sageInstall?.runtime_profile?.id,
    sageInstall?.runtime_profile_id,
    selectedChatMessages,
    selectedChatSession?.id,
    selectedChatSession?.masterAgentInstallId,
    sendOperatorChat,
    simpleChatDepth,
    startOperatorRun,
    topError,
  ]);

  const handleSimpleChatApprovalDecision = useCallback(async (
    messageId: string,
    approval: ChatApprovalRequestRecord,
    decision: 'proceed' | 'hold',
  ) => {
    const sessionId = selectedChatSession?.id;
    if (!sessionId) return;

    if (approval.approvalId && approval.runId) {
      await submitSimpleChatPermissionDecision(decision === 'proceed' ? 'Proceed' : 'Hold');
      return;
    }

    const existingMessage = selectedChatMessages.find((message) => message.id === messageId) || null;
    const approvalAction = existingMessage?.actions?.find(
      (action) => action.kind === 'approval_required' && action.id === approval.actionId,
    ) || existingMessage?.actions?.find((action) => action.kind === 'approval_required') || null;

    if (decision === 'hold') {
      patchSimpleChatMessage(sessionId, messageId, {
        approvalRequests: [{ ...approval, resolution: 'rejected' }],
        actions: [],
        status: 'completed',
        ts: new Date().toISOString(),
      });
      return;
    }

    if (approvalAction) {
      await handleSimpleChatMessageAction(messageId, approvalAction);
    }
  }, [
    handleSimpleChatMessageAction,
    patchSimpleChatMessage,
    selectedChatMessages,
    selectedChatSession?.id,
    submitSimpleChatPermissionDecision,
  ]);

  const sendSimpleChat = useCallback(async () => {
    const text = goal.trim();
    const sessionId = selectedChatSession?.id;
    if (!text || !sessionId) return;
    const shouldStartDurableRun = shouldUseDurableRunForTaskRequest(text);
    const priorMessages = selectedChatMessages
      .filter((message) => {
        const content = normalizeChatContent(message.content);
        if (!content) return false;
        if (message.role === 'assistant') {
          return message.status === 'completed';
        }
        return message.role === 'user';
      })
      .map((message) => ({
        role: (message.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: normalizeChatContent(message.content),
      }))
      .slice(-6);

    const now = new Date().toISOString();
    const userMessage: ChatMessageRecord = {
      id: createChatId('user'),
      role: 'user',
      content: text,
      ts: now,
      status: 'completed',
    };
    const placeholderId = createChatId('assistant');
    const placeholder: ChatMessageRecord = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      ts: now,
      status: 'sending',
      run_id: null,
    };

    appendSimpleChatMessage(sessionId, userMessage);
    appendSimpleChatMessage(sessionId, placeholder);
    setPendingSimpleChat({ sessionId, messageId: placeholderId, goal: text });
    setGoal('');
    setTopError(null);

    if (shouldStartDurableRun) {
      setPendingSimpleChat(null);
      setPendingSimpleRun({ sessionId, messageId: placeholderId, runId: null, goal: text });
      try {
        const payload = await startOperatorRun({
          goal: text,
          metadata: {
            source: 'simple_chat_primary_run',
            direct_chat: false,
          },
        });
        setChatAuthRequiredMessage(null);
        setChatNoProviderStatus(false);
        setTopError(null);
        if (!payload || typeof payload !== 'object') {
          throw new Error('Failed to start durable run.');
        }
        const runRecord = payload as Record<string, unknown>;
        const startedRunId = String(runRecord.run_id || '').trim() || null;
        const startedStatus = String(runRecord.status || 'running').trim().toLowerCase();
        const startedSummary = String(runRecord.started_message || '').trim()
          || (startedStatus === 'queued_local'
            ? 'Preparing execution on your machine.'
            : startedStatus === 'waiting' || startedStatus === 'waiting_for_input'
              ? 'Waiting for confirmation to continue.'
              : 'Working on this now.');
        if (startedRunId) {
          setPendingSimpleRun((current) => (
            current && current.messageId === placeholderId
              ? { ...current, runId: startedRunId }
              : current
          ));
        }
        patchSimpleChatMessage(sessionId, placeholderId, {
          content: '',
          status: mapStartedRunStatusToChatMessageStatus(startedStatus),
          run_id: startedRunId,
          approvalRequests: [],
          runCard: {
            title: truncateRunCardTitle(text),
            summary: startedSummary,
            status: mapStartedRunStatusToRunCardStatus(startedStatus),
            runId: startedRunId,
            sourceGoal: text,
            meta: [],
            evidence: [],
            approval: null,
          },
          ts: new Date().toISOString(),
        });
        return;
      } catch (error) {
        setPendingSimpleRun(null);
        if (isNoProviderChatError(error)) {
          setChatNoProviderStatus(true);
          removeSimpleChatMessage(sessionId, placeholderId);
          return;
        }
        if (isAuthRequiredChatError(error)) {
          setChatAuthRequiredMessage(error.message || 'Continue in your browser to sign in.');
          removeSimpleChatMessage(sessionId, placeholderId);
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to start durable run.';
        removeSimpleChatMessage(sessionId, placeholderId);
        setTopError(message);
        return;
      }
    }

    let streamedSteps: NonNullable<ChatMessageRecord['steps']> = [];
    try {
      let streamedReply = '';
      const payload = await sendOperatorChat(text, {
        reasoningEffort: simpleChatDepth,
        clientSessionKey: sessionId,
        masterAgentInstallId: sageInstall?.id || selectedChatSession?.masterAgentInstallId || null,
        runtimeProfileId: sageInstall?.runtime_profile?.id || sageInstall?.runtime_profile_id || null,
        priorMessages,
        onSteps: (steps) => {
          streamedSteps = steps;
          patchSimpleChatMessage(sessionId, placeholderId, {
            steps,
            status: 'running',
            ts: new Date().toISOString(),
          });
        },
        onChunk: (delta) => {
          streamedReply += delta;
          patchSimpleChatMessage(sessionId, placeholderId, {
            content: streamedReply,
            status: streamedSteps.length > 0 ? 'running' : 'sending',
            ts: new Date().toISOString(),
          });
        },
      });

      setChatAuthRequiredMessage(null);
      setChatNoProviderStatus(false);
      setTopError(null);
      const nextActions = Array.isArray(payload.actions) ? payload.actions : [];
      const nextApprovalRequests = buildOperatorChatApprovalRequests({
        approvals: (payload.approvals || []) as Array<Record<string, unknown>>,
        actions: nextActions,
      });
      const nextInterventions = buildOperatorChatInterventions((payload.interventions || []) as Array<Record<string, unknown>>);
      patchSimpleChatMessage(sessionId, placeholderId, {
        content: nextApprovalRequests.length > 0 || nextInterventions.length > 0 ? '' : (payload.reply || streamedReply || ''),
        status: nextApprovalRequests.length > 0 ? 'waiting' : payload.error ? 'error' : 'completed',
        actions: nextActions,
        approvalRequests: nextApprovalRequests,
        interventions: nextInterventions,
        artifacts: Array.isArray(payload.artifacts) && payload.artifacts.length > 0 ? payload.artifacts : [],
        contextUsed: payload.context_used || null,
        steps: Array.isArray(payload.steps) && payload.steps.length > 0 ? payload.steps : streamedSteps,
        ts: new Date().toISOString(),
      });
    } catch (error) {
      if (isNoProviderChatError(error)) {
        setChatNoProviderStatus(true);
        removeSimpleChatMessage(sessionId, placeholderId);
        return;
      }
      if (isAuthRequiredChatError(error)) {
        setChatAuthRequiredMessage(error.message || 'Continue in your browser to sign in.');
        removeSimpleChatMessage(sessionId, placeholderId);
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to get assistant reply.';
      removeSimpleChatMessage(sessionId, placeholderId);
      setTopError(message);
    } finally {
      setPendingSimpleChat(null);
    }
  }, [
    appendSimpleChatMessage,
    goal,
    masterThreadId,
    patchSimpleChatMessage,
    removeSimpleChatMessage,
    selectedChatMessages,
    selectedChatSession?.id,
    selectedChatSession?.masterAgentInstallId,
    startOperatorRun,
    sendOperatorChat,
    sageInstall?.id,
    sageInstall?.runtime_profile?.id,
    sageInstall?.runtime_profile_id,
    setTopError,
    simpleChatDepth,
  ]);

  useEffect(() => {
    const handleGlobalCommandDetail = (detail?: PlatformGlobalCommandEventDetail) => {
      if (!detail) return;
      if (detail.type === 'focus_command' || detail.type === 'focus_goal') {
        primaryGoalRef.current?.focus();
        return;
      }
      if (detail.type === 'run_autopilot' && goal.trim()) {
        void sendSimpleChat();
      }
    };

    const onGlobalCommand = (event: Event) => {
      const custom = event as CustomEvent<PlatformGlobalCommandEventDetail | undefined>;
      handleGlobalCommandDetail(custom.detail);
    };

    try {
      const raw =
        window.sessionStorage.getItem(PENDING_GLOBAL_COMMAND_STORAGE_KEY)
        ?? window.sessionStorage.getItem(LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { detail?: PlatformGlobalCommandEventDetail };
        handleGlobalCommandDetail(parsed.detail);
        window.sessionStorage.removeItem(PENDING_GLOBAL_COMMAND_STORAGE_KEY);
        window.sessionStorage.removeItem(LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY);
      }
    } catch {
      // Ignore malformed pending commands.
    }

    window.addEventListener(GLOBAL_COMMAND_EVENT, onGlobalCommand as EventListener);
    window.addEventListener(LEGACY_ORION_GLOBAL_COMMAND_EVENT, onGlobalCommand as EventListener);
    return () => {
      window.removeEventListener(GLOBAL_COMMAND_EVENT, onGlobalCommand as EventListener);
      window.removeEventListener(LEGACY_ORION_GLOBAL_COMMAND_EVENT, onGlobalCommand as EventListener);
    };
  }, [goal, sendSimpleChat]);

  const latestSessionRunCard = useMemo(
    () => [...selectedChatMessages].reverse().find((message) => message.runCard?.runId)?.runCard || null,
    [selectedChatMessages],
  );

  const latestDirectChatContext = useMemo(
    () => [...selectedChatMessages].reverse().find((message) => message.contextUsed)?.contextUsed || null,
    [selectedChatMessages],
  );

  const providerBanner = useMemo(() => {
    const authMessage = String(chatAuthRequiredMessage || '').trim();
    if (authMessage) {
      return {
        text: authMessage,
        label: 'Sign in',
        href: controlPlaneSignInUrl(),
      };
    }
    if (!modelsLoading && (chatNoProviderStatus || modelOptions.length === 0)) {
      return {
        text: 'No AI provider configured for Sage yet.',
        label: 'Open Integrations',
        href: '/connectors',
      };
    }
    return null;
  }, [chatAuthRequiredMessage, chatNoProviderStatus, modelOptions.length, modelsLoading]);

  const runtimeSurfaceState = useMemo(() => {
    const attachments = Array.isArray(masterContext?.runtime_attachments?.attachments)
      ? masterContext.runtime_attachments.attachments
      : [];
    const runtimeTargets = Array.isArray(masterContext?.runtime_targets?.targets)
      ? masterContext.runtime_targets.targets
      : [];
    const localAttachments = attachments.filter((item) => String(item.attachment_kind || '').trim() === 'local_companion');
    const hostedAttachments = attachments.filter((item) => String(item.attachment_kind || '').trim() !== 'local_companion');
    const healthyAttachments = attachments.filter((item) => item.healthy !== false && item.online !== false);
    const healthyLocalCount = localAttachments.filter((item) => item.healthy !== false && item.online !== false).length;
    const defaultTargetId = typeof masterContext?.runtime_targets?.default_target_id === 'string'
      ? masterContext.runtime_targets.default_target_id
      : null;
    const defaultTarget = runtimeTargets.find((item) => String(item.target_id || '').trim() === String(defaultTargetId || '').trim());
    const availableTargets = runtimeTargets.filter((item) => item.available !== false);
    return {
      deploymentMode: formatRuntimeDeploymentMode(masterContext?.runtime_attachments?.deployment_mode),
      defaultTarget: String(defaultTarget?.label || formatRuntimeTargetLabel(defaultTargetId)).trim(),
      availableTargetSummary: availableTargets.length > 0
        ? availableTargets.map((item) => String(item.label || formatRuntimeTargetLabel(String(item.target_id || ''))).trim()).filter(Boolean).join(' · ')
        : 'No workspace runtime targets reported yet',
      attachmentCount: attachments.length,
      healthyCount: healthyAttachments.length,
      localCount: localAttachments.length,
      hostedCount: hostedAttachments.length,
      healthyLocalCount,
      degradedLocal: localAttachments.length > 0 && healthyLocalCount === 0,
    };
  }, [masterContext]);

  const memoryBoundaryState = useMemo(() => {
    const boundaryMap = isPlainRecord(masterContext?.unified_memory?.boundary_map)
      ? masterContext.unified_memory.boundary_map
      : {};
    return {
      layerCount: Number(masterContext?.unified_memory?.summary?.layer_count || 0)
        || listStrings(masterContext?.unified_memory?.layer_order).length,
      neverSync: listStrings(boundaryMap.never_sync_by_default),
      cloudSynced: listStrings(boundaryMap.cloud_synced_by_default),
      explicitOptIn: listStrings(boundaryMap.requires_explicit_opt_in_to_sync),
    };
  }, [masterContext]);

  const recentActivityState = useMemo(() => {
    const summary = isPlainRecord(masterContext?.recent_activity?.summary)
      ? masterContext.recent_activity.summary
      : {};
    const byClass = isPlainRecord(summary.by_class) ? summary.by_class : {};
    return {
      count: Number(summary.count || 0)
        || (Array.isArray(masterContext?.recent_activity?.items) ? masterContext.recent_activity.items.length : 0),
      delegationCount: Number(byClass.delegation || 0) || 0,
      memoryCount: Number(byClass.memory_update || 0) || 0,
      reviewCount: Number(summary.review_required_count || 0) || 0,
    };
  }, [masterContext]);

  const timelinePreviewItems = useMemo(
    () => (Array.isArray(activityTimeline?.items) ? activityTimeline.items.slice(0, 4) : []),
    [activityTimeline],
  );

  const hybridContinuityNotice = useMemo(() => {
    if (runtimeSurfaceState.attachmentCount === 0 || !runtimeSurfaceState.degradedLocal) return null;
    return {
      id: 'hybrid-continuity',
      tone: 'warn' as const,
      label: 'Hybrid continuity degraded',
      detail: 'Sage still uses the same workspace and captain identity, but local-private execution is unavailable until the paired companion comes back online.',
      actions: [
        {
          id: 'hybrid:machines',
          label: 'Open Machines',
          tone: 'primary' as const,
          onClick: () => router.push('/machines'),
        },
        {
          id: 'hybrid:settings',
          label: 'Memory & Privacy',
          tone: 'default' as const,
          onClick: () => router.push('/settings'),
        },
      ],
    };
  }, [router, runtimeSurfaceState]);

  const identitySections = useMemo<ChatIdentitySection[]>(() => {
    const sections: ChatIdentitySection[] = [
      {
        title: 'Sage',
        note: 'The master agent for this workspace.',
        items: [
          { label: 'Workspace', value: activeWorkspaceId || 'default', priority: 'high' },
          { label: 'Master thread', value: masterThreadId || selectedChatSession?.id || 'Unavailable' },
          { label: 'Model', value: model || 'Select model' },
          { label: 'Trust', value: formatSimpleChatTrustLabel(trustMode, accessMode) },
        ],
      },
      {
        title: 'Specialists',
        note: 'Available for delegation inside this workspace.',
        items: activeSpecialistAgents.length > 0
          ? activeSpecialistAgents.slice(0, 8).map((install) => ({
              label: String(install.label || install.agent_definition?.name || 'Specialist'),
              value: [
                install.runtime_profile?.label || 'Unplaced',
                install.enabled === false ? 'Disabled' : (install.status || 'Ready'),
              ].filter(Boolean).join(' · '),
              tone: install.enabled === false ? 'warning' : 'success',
            }))
          : [{ label: 'No specialists', value: 'Install specialists from the Store', tone: 'warning' }],
      },
    ];

    if (runtimeSurfaceState.attachmentCount > 0) {
      sections.push({
        title: 'Runtime topology',
        note: 'Desktop keeps the deeper control layer, but Sage uses the same runtime and policy rules across phone and desktop.',
        items: [
          { label: 'Deployment', value: runtimeSurfaceState.deploymentMode, priority: 'high' },
          { label: 'Default target', value: runtimeSurfaceState.defaultTarget },
          {
            label: 'Placement visibility',
            value: `${runtimeSurfaceState.healthyCount}/${runtimeSurfaceState.attachmentCount} attachments healthy · ${runtimeSurfaceState.localCount} local · ${runtimeSurfaceState.hostedCount} hosted`,
            tone: runtimeSurfaceState.degradedLocal ? 'warning' : 'success',
          },
          {
            label: 'Workspace targets',
            value: runtimeSurfaceState.availableTargetSummary,
          },
          {
            label: 'Parity rule',
            value: 'Mobile enters through the platform first. Execution capability follows workspace runtime targets, policy, memory scope, connector scope, and approvals, not surface origin.',
          },
        ],
      });
    }

    if (memoryBoundaryState.layerCount > 0 || memoryBoundaryState.neverSync.length > 0 || memoryBoundaryState.cloudSynced.length > 0) {
      sections.push({
        title: 'Memory & privacy',
        note: 'Desktop keeps the deeper controls, while mobile reads the same captain state through bounded summaries.',
        items: [
          { label: 'Memory layers', value: `${memoryBoundaryState.layerCount} active`, priority: 'high' },
          {
            label: 'Never sync by default',
            value: memoryBoundaryState.neverSync.length > 0
              ? memoryBoundaryState.neverSync.map((item) => humanizeScopeLabel(item)).slice(0, 3).join(', ')
              : 'No local-only layers reported',
          },
          {
            label: 'Explicit opt-in',
            value: memoryBoundaryState.explicitOptIn.length > 0
              ? `${memoryBoundaryState.explicitOptIn.length} layer(s) still require owner approval to sync`
              : 'No extra opt-in layers reported',
          },
          {
            label: 'Cloud-safe by default',
            value: memoryBoundaryState.cloudSynced.length > 0
              ? memoryBoundaryState.cloudSynced.map((item) => humanizeScopeLabel(item)).slice(0, 3).join(', ')
              : 'No cloud-safe synced layers reported',
          },
        ],
      });
    }

    if (timelinePreviewItems.length > 0 || recentActivityState.count > 0) {
      sections.push({
        title: 'Activity timeline',
        note: 'Desktop keeps the deeper review surface for ledger-backed captain, specialist, and app work.',
        items: timelinePreviewItems.length > 0
          ? timelinePreviewItems.map((item) => ({
              label: String(item.title || item.summary || humanizeScopeLabel(item.event_class || item.action || 'activity')).trim(),
              value: `${formatActivityActorLabel(item)}${item.summary ? ` · ${String(item.summary).trim()}` : ''}${item.review_required ? ' · Review required' : ''}`,
              tone: item.review_required ? 'warning' : 'neutral',
            }))
          : [
              {
                label: 'Recent captain activity',
                value: `${recentActivityState.count} recent summaries · ${recentActivityState.delegationCount} delegations · ${recentActivityState.memoryCount} memory updates`,
                tone: recentActivityState.reviewCount > 0 ? 'warning' : 'success',
              },
            ],
      });
    }

    if (latestDirectChatContext) {
      sections.push({
        title: 'Latest context',
        note: 'The most recent execution context Sage used.',
        items: [
          { label: 'Connected systems', value: summarizeCapabilitySystems(latestDirectChatContext.tool_capabilities, 'connected') },
          { label: 'Writable actions', value: summarizeCapabilityActions(latestDirectChatContext.tool_capabilities, 'write_actions') },
          { label: 'Approval-required', value: summarizeCapabilityActions(latestDirectChatContext.tool_capabilities, 'approval_required_actions') },
        ],
      });
    }

    return sections;
  }, [
    accessMode,
    activeSpecialistAgents,
    activeWorkspaceId,
    latestDirectChatContext,
    masterThreadId,
    memoryBoundaryState,
    model,
    recentActivityState,
    runtimeSurfaceState,
    selectedChatSession?.id,
    timelinePreviewItems,
    trustMode,
  ]);

  const identityActions = useMemo<ChatIdentityAction[]>(() => {
    const actions: ChatIdentityAction[] = [];
    if (latestSessionRunCard?.runId || runId) {
      actions.push({
        label: 'Open Runs',
        priority: 'primary',
        onClick: () => {
          setChatIdentityDrawerOpen(false);
          router.push('/executions');
        },
      });
    }
    if (activeSpecialistAgents.length > 0) {
      actions.push({
        label: 'Open Agents',
        onClick: () => {
          setChatIdentityDrawerOpen(false);
          router.push('/agents');
        },
      });
    }
    if ((timelinePreviewItems.length > 0 || recentActivityState.count > 0) && !actions.some((action) => action.label === 'Open Runs')) {
      actions.push({
        label: 'Timeline',
        onClick: () => {
          setChatIdentityDrawerOpen(false);
          router.push('/runs');
        },
      });
    }
    if (runtimeSurfaceState.attachmentCount > 0) {
      actions.push({
        label: 'Open Machines',
        onClick: () => {
          setChatIdentityDrawerOpen(false);
          router.push('/machines');
        },
      });
    }
    if (memoryBoundaryState.layerCount > 0) {
      actions.push({
        label: 'Memory & Privacy',
        onClick: () => {
          setChatIdentityDrawerOpen(false);
          router.push('/settings');
        },
      });
    }
    if (providerBanner) {
      actions.push({
        label: 'Open Integrations',
        onClick: () => {
          setChatIdentityDrawerOpen(false);
          router.push('/connectors');
        },
      });
    }
    return actions;
  }, [
    activeSpecialistAgents.length,
    latestSessionRunCard?.runId,
    memoryBoundaryState.layerCount,
    providerBanner,
    recentActivityState.count,
    router,
    runId,
    runtimeSurfaceState.attachmentCount,
    timelinePreviewItems.length,
  ]);

  const shellNotice = useMemo(() => {
    const formatted = formatShellTopError(topError);
    if (formatted) {
      return {
        id: 'sage-error',
        tone: 'error' as const,
        label: formatted,
      };
    }
    return hybridContinuityNotice;
  }, [hybridContinuityNotice, topError]);

  return (
    <WorkbenchShell
      topError={topError}
      statusNotice={null}
    >
      <ChatSurface
        isMobile={isMobile}
        sessions={chatStore.sessions}
        selectedSessionId={selectedChatSession?.id || null}
        onSelectSession={(sessionId) => {
          setChatStore((current) => ({ ...current, selectedSessionId: sessionId }));
        }}
        onNewChat={createNewChat}
        historyEnabled
        goal={goal}
        setGoal={setGoal}
        primaryGoalRef={primaryGoalRef}
        onSend={() => {
          void sendSimpleChat();
        }}
        onMessageAction={(messageId, action) => {
          void handleSimpleChatMessageAction(messageId, action);
        }}
        onApprovalDecision={(messageId, approval, decision) => {
          void handleSimpleChatApprovalDecision(messageId, approval, decision);
        }}
        chatBusy={Boolean(pendingSimpleChat) || Boolean(pendingSimpleRun && ['queued_local', 'running', 'waiting'].includes(status))}
        messages={selectedChatMessages}
        providerBanner={providerBanner}
        targetLabel="Sage"
        targetHref="/agents"
        selectedModel={model}
        modelOptions={modelOptions}
        modelsLoading={modelsLoading}
        onSelectModel={setModel}
        trustLabel={formatSimpleChatTrustLabel(trustMode, accessMode)}
        selectedDepth={simpleChatDepth}
        depthLabel={CHAT_DEPTH_OPTIONS.find((option) => option.value === simpleChatDepth)?.label || 'Standard'}
        depthOptions={CHAT_DEPTH_OPTIONS}
        onSelectDepth={(value) => {
          if (value === 'low' || value === 'medium' || value === 'high') {
            setSimpleChatDepth(value);
          }
        }}
        identityDrawerOpen={chatIdentityDrawerOpen}
        onToggleIdentityDrawer={() => setChatIdentityDrawerOpen((current) => !current)}
        onCloseIdentityDrawer={() => setChatIdentityDrawerOpen(false)}
        identitySections={identitySections}
        identityActions={identityActions}
        shellNotice={shellNotice}
      />
    </WorkbenchShell>
  );
}
