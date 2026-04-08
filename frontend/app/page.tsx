'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AGENT_ROLE_OPTIONS,
  BUSINESS_PRESETS,
  DEFAULT_AGENT_ROLE_ID,
  DEFAULT_OUTCOME_PACK_ID,
  OUTCOME_PACKS,
  type AgentRoleId,
  isAgentRoleId,
} from './page.catalog';
import { usePageState } from './page.state';
import { usePlatformApi } from './page.api';
import { usePageActions } from './page.actions';
import { type PlatformRunDetailContract, usePlatformShell } from '@/components/orion/PlatformShellContext';
import { EMPYRALIS_NEW_CHAT_EVENT } from '@/components/orion/PlatformTopBar';
import { ChatSurface, type ChatIdentityAction, type ChatIdentityItem, type ChatIdentitySection } from '@/components/orion/chat/ChatSurface';
import { RUN_COMPLETED_STATUS_COPY, RUN_FAILED_STATUS_COPY } from '@/lib/runStartCopy';
import {
  CHAT_SESSION_SELECT_EVENT,
  CHAT_STORE_STORAGE_KEY,
  CHAT_STORE_UPDATED_EVENT,
  type ChatApprovalRequestRecord,
  createChatId,
  createEmptyChatSession,
  dedupeChatMessages,
  isDeprecatedSystemChatMessage,
  normalizeChatContent,
  sanitizeChatStore,
  upsertSessionMessages,
  type ChatContextUsedRecord,
  type ChatMessageActionRecord,
  type ChatRunCardApprovalRecord,
  type ChatRunCardRecord,
  type ChatRunCardStatus,
  type ChatSessionSelectDetail,
  type ChatStoreRecord,
} from '@/components/orion/chat/chatSchema';
import { WorkbenchShell } from '../components/orion/workbench/WorkbenchShell';
import { type AuthenticatedEventStreamConnection } from '@/lib/authenticatedEventStream';
import {
  type HomeLiveAgentCard,
  type HomeLiveLocalAction,
  type HomeLiveOverview,
} from '../components/orion/workbench/WorkbenchCenterPanel';
import {
  type WorkbenchAgentChatMessage,
  type WorkbenchDeckMode,
} from '../components/orion/workbench/WorkbenchControlDeck';
import {
  GLOBAL_COMMAND_EVENT,
  PENDING_GLOBAL_COMMAND_STORAGE_KEY,
  LEGACY_ORION_GLOBAL_COMMAND_EVENT,
  LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY,
  type PlatformGlobalCommandEventDetail,
} from '@/lib/commandRegistry';
import { BRAND } from '@/lib/brand';
import { fetchDesktopSetupStatus } from '@/lib/desktopFirstRun';
import { getDesktopBridge } from '@/lib/desktopBridge';
import { SINGLE_AGENT_MODE } from '@/lib/appFlags';
import { controlPlaneSignInUrl, ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { fetchRuntimeConnectionStatus } from '@/lib/runtimeConnection';
import { buildSetupRoute, fetchSetupReadiness } from '@/lib/setupReadiness';

const WORKBENCH_DECK_MODE_STORAGE_KEY = 'orion_workbench_deck_mode_v1';
const WORKBENCH_AGENT_CHAT_STORAGE_KEY = 'orion.workbench.agent.chat.v1';
const WORKBENCH_CHAT_MODE_STORAGE_KEY = 'orion.workbench.chat.mode.v1';
const PINNED_AGENT_STORAGE_KEY = 'empyralis.agents.pinned-rail';
const AGENT_CONFIG_STORAGE_KEY = 'empyralis.agents.profile-config.v1';
const DEFAULT_AGENT_PROFILE_STORAGE_KEY = 'empyralis.agents.default-profile.v1';
const WORKBENCH_PRELOAD_QUERY_KEYS = ['pack', 'goal', 'primary', 'secondary', 'tertiary', 'deck', 'agent', 'chat'] as const;
const LOCAL_EXECUTION_DEFAULT_GOAL =
  OUTCOME_PACKS.find((item) => item.id === 'local-execution-v1')?.defaultGoal?.trim().toLowerCase() || '';
const CHAT_SESSION_LIMIT = 24;

type StoredAgentProfileConfig = {
  name?: string;
  subtitle?: string;
};

type StoredAssistantProfileId = 'support' | 'research' | 'builder' | 'crypto-analyst' | 'private-assistant' | 'custom';

type AssistantProfileMeta = {
  id: StoredAssistantProfileId;
  label: string;
  subtitle: string;
  backendRole: AgentRoleId;
};

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

const ASSISTANT_PROFILE_LIBRARY: AssistantProfileMeta[] = [
  { id: 'support', label: 'Support', subtitle: 'Customer replies, inbox triage, and follow-up', backendRole: 'support' },
  { id: 'research', label: 'Research', subtitle: 'Briefs, analysis, memory, and synthesis', backendRole: 'research' },
  { id: 'builder', label: 'Builder', subtitle: 'Product, coding, design, and workflows', backendRole: 'builder' },
  { id: 'crypto-analyst', label: 'Crypto Analyst', subtitle: 'Market research, watchlists, and risk review', backendRole: 'research' },
  { id: 'private-assistant', label: 'Personal', subtitle: 'Planning, study, reminders, and daily organization', backendRole: 'private-assistant' },
  { id: 'custom', label: 'Assistant', subtitle: 'Flexible general assistant for mixed work', backendRole: 'orchestrator' },
];

const CHAT_DEPTH_OPTIONS: Array<{ value: ChatDepthValue; label: string; description: string }> = [
  { value: 'low', label: 'Quick', description: 'Fastest response' },
  { value: 'medium', label: 'Standard', description: 'Balanced depth' },
  { value: 'high', label: 'Deep', description: 'More reasoning' },
];

function normalizeAssistantProfileId(value: unknown): StoredAssistantProfileId {
  return ASSISTANT_PROFILE_LIBRARY.some((item) => item.id === value) ? (value as StoredAssistantProfileId) : 'custom';
}

function getAssistantProfileMeta(profileId: StoredAssistantProfileId): AssistantProfileMeta {
  return ASSISTANT_PROFILE_LIBRARY.find((item) => item.id === profileId) || ASSISTANT_PROFILE_LIBRARY[ASSISTANT_PROFILE_LIBRARY.length - 1];
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
  if (normalized.includes('failed to load live workspace snapshot')) {
    return 'Live platform status is temporarily unavailable.';
  }
  if (normalized.includes('continue in your browser to sign in') || normalized.includes('sign in required')) {
    return null;
  }
  return text;
}

type PendingWorkbenchChat = {
  agentRole: string;
  placeholderId: string;
  runId: string | null;
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

type HomeWorkspaceRunItem = {
  run_id?: string;
  status?: string;
  created_at?: string | null;
  updated_at?: string | null;
  duration_ms?: number | null;
  user_goal?: string;
  result_summary?: string | null;
  agent_role?: string | null;
  outcome_pack?: string | null;
  pack_id?: string | null;
  execution_target_selected?: string | null;
  usage_provider?: string | null;
  usage_model?: string | null;
  requested_provider?: string | null;
  effective_provider?: string | null;
  requested_model?: string | null;
  effective_model?: string | null;
  provider_overridden?: boolean;
  model_overridden?: boolean;
  fallback_used?: boolean;
};

type HomeWorkspaceApprovalItem = {
  run_id?: string;
  approval_id?: string;
  prompt?: string;
  labels?: string[];
  capabilities?: string[];
  status?: string;
  agent_role?: string | null;
  requested_at?: string | null;
  expires_at?: string | null;
};

type HomeWorkspaceSnapshotPayload = {
  runtime?: {
    ok?: boolean;
    auth_mode?: string;
  };
  live?: {
    workers?: {
      summary?: {
        online?: number;
        busy?: number;
        pending_runs?: number;
        claimed_runs?: number;
      };
    };
    queue?: {
      queued_count?: number;
      claimed_count?: number;
    };
  };
  tasks?: {
    active_runs?: HomeWorkspaceRunItem[];
    queued_runs?: HomeWorkspaceRunItem[];
    claimed_runs?: HomeWorkspaceRunItem[];
    recent_runs?: HomeWorkspaceRunItem[];
  };
  schedules?: {
    active_count?: number;
    items?: Array<{
      id?: string;
      name?: string;
      cron?: string;
      timezone?: string;
      next_run_at?: string | null;
    }>;
  };
  approvals?: {
    pending?: HomeWorkspaceApprovalItem[];
    audit?: Array<{
      id?: string;
      ts?: string;
      stage?: string;
      decision?: string;
      actor?: string;
      source?: string;
      run_id?: string | null;
      note?: string | null;
    }>;
  };
  updated_at?: string | null;
};

type HomeInboxSessionPayload = {
  session_id?: string;
  session_key?: string;
  channel?: string;
  event_count?: number;
  inbound_count?: number;
  outbound_count?: number;
  last_ts?: string;
  last_text?: string;
  last_run_id?: string;
};

function sanitizePersistedWorkbenchChats(chats: Record<string, WorkbenchAgentChatMessage[]>): Record<string, WorkbenchAgentChatMessage[]> {
  return Object.fromEntries(
    Object.entries(chats).map(([agentRole, messages]) => {
      const hasAutoFilledLocalPrompt = messages.some(
        (message) => message.role === 'user' && message.content.trim().toLowerCase() === LOCAL_EXECUTION_DEFAULT_GOAL,
      );
      const sanitizedMessages = messages.filter((message) => !isDeprecatedSystemChatMessage(message.role === 'user' ? 'user' : 'assistant', message.content));
      if (!hasAutoFilledLocalPrompt) return [agentRole, sanitizedMessages];
      return [
        agentRole,
        sanitizedMessages.filter((message) => {
          const normalized = message.content.trim().toLowerCase();
          if (message.role === 'user' && normalized === LOCAL_EXECUTION_DEFAULT_GOAL) return false;
          if (message.role !== 'user' && normalized.includes('provider profiles path is not writable')) return false;
          return true;
        }),
      ];
    }),
  );
}

const INITIAL_HOME_OVERVIEW: HomeLiveOverview = {
  activeAgentCount: 0,
  localQueuePendingCount: 0,
  localQueueClaimedCount: 0,
  workerOnlineCount: 0,
  workerBusyCount: 0,
  approvalWaitingCount: 0,
  activeScheduleCount: 0,
  scheduleItems: [],
  activeAgentCards: [],
  recentLocalActions: [],
  updatedAt: null,
};

export type HomeInboxSessionPreview = {
  sessionKey: string;
  channel: string;
  label: string;
  summary: string;
  updatedAt: string | null;
  eventCount: number;
  inboundCount: number;
  outboundCount: number;
  runId: string | null;
};

type ControlCenterSnapshot = {
  loading: boolean;
  releaseReady: boolean;
  runtimeOk: boolean;
  authMode: string;
  workerOnline: number;
  workerPending: number;
  telegramActive: boolean;
  telegramThreadAlive: boolean;
  telegramProcessed: number;
  telegramRuns: number;
  telegramLastError: string | null;
  latestRunId: string | null;
  latestRunStatus: string | null;
  latestRunProvider: string | null;
  latestRunSummary: string | null;
  pendingApprovals: Array<{
    runId: string;
    approvalId: string;
    prompt: string;
    labels: string[];
    capabilities: string[];
    expiresAt: string | null;
    status: string;
  }>;
  approvalAudit: Array<{
    id: string;
    ts: string;
    stage: string;
    decision: string;
    actor: string;
    source: string;
    runId: string | null;
    note: string | null;
  }>;
  recentRuns: Array<{
    run_id: string;
    status: string;
    created_at: string | null;
    duration_ms: number | null;
    pack_id: string | null;
    agent_role: string | null;
    result_summary: string | null;
    usage_provider?: string | null;
    usage_model?: string | null;
    requested_provider?: string | null;
    effective_provider?: string | null;
    requested_model?: string | null;
    effective_model?: string | null;
    provider_overridden?: boolean;
    model_overridden?: boolean;
    fallback_used?: boolean;
    execution_target_selected?: string | null;
  }>;
  homeOverview: HomeLiveOverview;
  latestInboxSession: HomeInboxSessionPreview | null;
  updatedAt: string | null;
};

const INITIAL_CONTROL_CENTER: ControlCenterSnapshot = {
  loading: true,
  releaseReady: false,
  runtimeOk: false,
  authMode: '-',
  workerOnline: 0,
  workerPending: 0,
  telegramActive: false,
  telegramThreadAlive: false,
  telegramProcessed: 0,
  telegramRuns: 0,
  telegramLastError: null,
  latestRunId: null,
  latestRunStatus: null,
  latestRunProvider: null,
  latestRunSummary: null,
  pendingApprovals: [],
  approvalAudit: [],
  recentRuns: [],
  homeOverview: INITIAL_HOME_OVERVIEW,
  latestInboxSession: null,
  updatedAt: null,
};

function createWorkbenchChatId(prefix: string): string {
  return createChatId(prefix);
}

export default function AutopilotHome() {
  return <AutopilotWorkspace />;
}

function normalizeRepeatedMessageContent(value: string): string {
  return normalizeChatContent(value);
}

function dedupeWorkbenchChatMessages(messages: WorkbenchAgentChatMessage[]): WorkbenchAgentChatMessage[] {
  return dedupeChatMessages(messages);
}

function homeTitleCase(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function compactHomeSummary(value: string | null | undefined, fallback: string, max = 96): string {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return fallback;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

function homeSortTime(...values: Array<string | null | undefined>): number {
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function resolveHomeAgentRole(roleRaw: string | null | undefined): { routeRole: string | null; label: string } {
  const normalized = String(roleRaw || '').trim().toLowerCase();
  if (isAgentRoleId(normalized)) {
    const match = AGENT_ROLE_OPTIONS.find((item) => item.id === normalized);
    return { routeRole: normalized, label: match?.label || homeTitleCase(normalized) };
  }
  if (normalized) return { routeRole: null, label: homeTitleCase(normalized) };
  return { routeRole: null, label: 'Agent' };
}

function inferHomeLocalActionLabel(item: Pick<HomeWorkspaceRunItem, 'user_goal' | 'result_summary' | 'outcome_pack' | 'pack_id' | 'execution_target_selected'>): string | null {
  const outcomePack = String(item.outcome_pack || item.pack_id || '').trim().toLowerCase();
  const executionTarget = String(item.execution_target_selected || '').trim().toLowerCase();
  const text = [item.user_goal, item.result_summary, outcomePack, executionTarget].join(' ').toLowerCase();
  const isLocalContext =
    executionTarget === 'local_companion' ||
    outcomePack === 'local-execution-v1' ||
    text.includes('local companion') ||
    text.includes('local execution');
  if (!isLocalContext) return null;
  if (text.includes('screenshot') || text.includes('capture_page')) return 'Screenshot';
  if (text.includes('shell') || text.includes('command')) return 'Shell';
  if (text.includes('browser') || text.includes('extract text') || text.includes('extract links') || text.includes('save html') || text.includes('http://') || text.includes('https://')) return 'Browser';
  if (text.includes('read ') || text.includes('write ') || text.includes('append ') || text.includes(' file')) return 'File';
  return 'Local';
}

function buildHomeRouteLabel(routeKind: 'local' | 'cloud' | 'approval', localActionLabel: string | null): string {
  if (routeKind === 'approval') return 'Confirmation gate';
  if (routeKind === 'local') return localActionLabel ? `${localActionLabel} via local companion` : 'Local companion';
  return 'Cloud route';
}

function buildHomeStateLabel(
  state: HomeLiveAgentCard['state'],
  routeKind: HomeLiveAgentCard['routeKind'],
  localActionLabel: string | null,
): string {
  if (state === 'waiting') return 'Confirmation required';
  if (state === 'planning') return routeKind === 'local' ? 'Planning local step' : 'Planning';
  if (state === 'queued') return localActionLabel ? `Queued for ${localActionLabel}` : 'Queued locally';
  if (state === 'claimed') return localActionLabel ? `${localActionLabel} claimed` : 'Claimed by worker';
  if (state === 'running') return localActionLabel ? `Running ${localActionLabel}` : routeKind === 'local' ? 'Running local step' : 'Running';
  if (state === 'completed') return localActionLabel ? `${localActionLabel} completed` : 'Completed recently';
  return homeTitleCase(state);
}

function buildHomeLiveOverview(payload: HomeWorkspaceSnapshotPayload): HomeLiveOverview {
  const workerSummary = payload.live?.workers?.summary;
  const queueSummary = payload.live?.queue;
  const activeRuns = Array.isArray(payload.tasks?.active_runs) ? payload.tasks?.active_runs : [];
  const queuedRuns = Array.isArray(payload.tasks?.queued_runs) ? payload.tasks?.queued_runs : [];
  const claimedRuns = Array.isArray(payload.tasks?.claimed_runs) ? payload.tasks?.claimed_runs : [];
  const recentRuns = Array.isArray(payload.tasks?.recent_runs) ? payload.tasks?.recent_runs : [];
  const pendingApprovals = Array.isArray(payload.approvals?.pending) ? payload.approvals?.pending : [];
  const activeSchedules = Array.isArray(payload.schedules?.items) ? payload.schedules?.items : [];

  type Candidate = HomeLiveAgentCard & {
    priority: number;
    sortTs: number;
  };

  const grouped = new Map<string, Candidate>();
  const activeKeys = new Set<string>();

  const upsertCandidate = (key: string, candidate: Candidate, isActive: boolean) => {
    if (!key) return;
    if (isActive) activeKeys.add(key);
    const existing = grouped.get(key);
    if (
      !existing ||
      candidate.priority < existing.priority ||
      (candidate.priority === existing.priority && candidate.sortTs > existing.sortTs)
    ) {
      grouped.set(key, candidate);
    }
  };

  pendingApprovals.forEach((item) => {
    const roleInfo = resolveHomeAgentRole(item.agent_role);
    const key = roleInfo.routeRole || `approval:${String(item.run_id || '').trim() || grouped.size}`;
    const routeKind: HomeLiveAgentCard['routeKind'] = 'approval';
    upsertCandidate(
      key,
      {
        id: key,
        agentRole: roleInfo.routeRole,
        agentLabel: roleInfo.label,
        state: 'waiting',
        stateLabel: buildHomeStateLabel('waiting', routeKind, null),
        summary: compactHomeSummary(
          Array.isArray(item.labels) && item.labels.length > 0 ? item.labels.join(' · ') : item.prompt,
          'Confirmation required before work can continue.',
        ),
        localActionLabel: null,
        routeKind,
        routeLabel: buildHomeRouteLabel(routeKind, null),
        runId: String(item.run_id || '').trim() || null,
        updatedAt: String(item.expires_at || item.requested_at || '').trim() || null,
        priority: 0,
        sortTs: homeSortTime(item.expires_at, item.requested_at),
      },
      true,
    );
  });

  claimedRuns.forEach((item) => {
    const roleInfo = resolveHomeAgentRole(item.agent_role);
    const key = roleInfo.routeRole || `claimed:${String(item.run_id || '').trim() || grouped.size}`;
    const localActionLabel = inferHomeLocalActionLabel(item);
    const routeKind: HomeLiveAgentCard['routeKind'] = localActionLabel ? 'local' : 'cloud';
    upsertCandidate(
      key,
      {
        id: key,
        agentRole: roleInfo.routeRole,
        agentLabel: roleInfo.label,
        state: 'claimed',
        stateLabel: buildHomeStateLabel('claimed', routeKind, localActionLabel),
        summary: compactHomeSummary(item.user_goal, 'A local action has been claimed by a worker.'),
        localActionLabel,
        routeKind,
        routeLabel: buildHomeRouteLabel(routeKind, localActionLabel),
        runId: String(item.run_id || '').trim() || null,
        updatedAt: String(item.updated_at || item.created_at || '').trim() || null,
        priority: 1,
        sortTs: homeSortTime(item.updated_at, item.created_at),
      },
      true,
    );
  });

  queuedRuns.forEach((item) => {
    const roleInfo = resolveHomeAgentRole(item.agent_role);
    const key = roleInfo.routeRole || `queued:${String(item.run_id || '').trim() || grouped.size}`;
    const localActionLabel = inferHomeLocalActionLabel(item);
    const routeKind: HomeLiveAgentCard['routeKind'] = localActionLabel ? 'local' : 'cloud';
    upsertCandidate(
      key,
      {
        id: key,
        agentRole: roleInfo.routeRole,
        agentLabel: roleInfo.label,
        state: 'queued',
        stateLabel: buildHomeStateLabel('queued', routeKind, localActionLabel),
        summary: compactHomeSummary(item.user_goal, 'A local action is waiting for worker capacity.'),
        localActionLabel,
        routeKind,
        routeLabel: buildHomeRouteLabel(routeKind, localActionLabel),
        runId: String(item.run_id || '').trim() || null,
        updatedAt: String(item.updated_at || item.created_at || '').trim() || null,
        priority: 2,
        sortTs: homeSortTime(item.updated_at, item.created_at),
      },
      true,
    );
  });

  activeRuns.forEach((item) => {
    const status = String(item.status || '').trim().toLowerCase();
    const roleInfo = resolveHomeAgentRole(item.agent_role);
    const key = roleInfo.routeRole || `active:${String(item.run_id || '').trim() || grouped.size}`;
    const localActionLabel = inferHomeLocalActionLabel(item);
    const routeKind: HomeLiveAgentCard['routeKind'] =
      status === 'waiting_for_input' ? 'approval' : localActionLabel ? 'local' : 'cloud';
    const state =
      status === 'starting'
        ? 'planning'
        : status === 'waiting_for_input'
          ? 'waiting'
          : status === 'queued_local'
            ? 'queued'
            : 'running';
    const stateLabel = buildHomeStateLabel(state, routeKind, localActionLabel);
    const priority = state === 'waiting' ? 0 : state === 'queued' ? 2 : state === 'running' ? 3 : 4;
    upsertCandidate(
      key,
      {
        id: key,
        agentRole: roleInfo.routeRole,
        agentLabel: roleInfo.label,
        state,
        stateLabel,
        summary: compactHomeSummary(item.user_goal || item.result_summary, state === 'planning' ? 'Preparing the next step.' : 'Handling active work.'),
        localActionLabel,
        routeKind,
        routeLabel: buildHomeRouteLabel(routeKind, localActionLabel),
        runId: String(item.run_id || '').trim() || null,
        updatedAt: String(item.updated_at || item.created_at || '').trim() || null,
        priority,
        sortTs: homeSortTime(item.updated_at, item.created_at),
      },
      true,
    );
  });

  recentRuns.forEach((item) => {
    const roleInfo = resolveHomeAgentRole(item.agent_role);
    const key = roleInfo.routeRole || `recent:${String(item.run_id || '').trim() || grouped.size}`;
    if (grouped.has(key)) return;
    const localActionLabel = inferHomeLocalActionLabel(item);
    const routeKind: HomeLiveAgentCard['routeKind'] = localActionLabel ? 'local' : 'cloud';
    upsertCandidate(
      key,
      {
        id: key,
        agentRole: roleInfo.routeRole,
        agentLabel: roleInfo.label,
        state: 'completed',
        stateLabel: buildHomeStateLabel('completed', routeKind, localActionLabel),
        summary: compactHomeSummary(item.result_summary || item.user_goal, 'Recent work finished here.'),
        localActionLabel,
        routeKind,
        routeLabel: buildHomeRouteLabel(routeKind, localActionLabel),
        runId: String(item.run_id || '').trim() || null,
        updatedAt: String(item.created_at || '').trim() || null,
        priority: 5,
        sortTs: homeSortTime(item.created_at),
      },
      false,
    );
  });

  const activeAgentCards = Array.from(grouped.values())
    .sort((a, b) => a.priority - b.priority || b.sortTs - a.sortTs || a.agentLabel.localeCompare(b.agentLabel))
    .map((item) => {
      const { priority, sortTs, ...card } = item;
      void priority;
      void sortTs;
      return card;
    });

  const recentLocalActions: HomeLiveLocalAction[] = recentRuns
    .filter((item) => inferHomeLocalActionLabel(item))
    .slice(0, 4)
    .map((item, index) => {
      const roleInfo = resolveHomeAgentRole(item.agent_role);
      const actionLabel = inferHomeLocalActionLabel(item) || 'Local';
      return {
        id: String(item.run_id || `local-${index}`),
        label: actionLabel,
        detail: compactHomeSummary(item.result_summary || item.user_goal, `${actionLabel} work completed recently.`),
        stateLabel: homeTitleCase(item.status || 'completed'),
        agentLabel: roleInfo.label,
        runId: String(item.run_id || '').trim() || null,
      };
    });

  const scheduleItems: HomeLiveOverview['scheduleItems'] = activeSchedules.slice(0, 4).map((item, index) => ({
    id: String(item?.id || `schedule-${index}`),
    name: String(item?.name || '').trim() || 'Scheduled run',
    cron: String(item?.cron || '').trim() || 'Custom cron',
    timezone: String(item?.timezone || '').trim() || 'local',
    nextRunAt: String(item?.next_run_at || '').trim() || null,
  }));

  return {
    activeAgentCount: activeKeys.size,
    localQueuePendingCount: Number(queueSummary?.queued_count ?? workerSummary?.pending_runs ?? 0),
    localQueueClaimedCount: Number(queueSummary?.claimed_count ?? workerSummary?.claimed_runs ?? 0),
    workerOnlineCount: Number(workerSummary?.online ?? 0),
    workerBusyCount: Number(workerSummary?.busy ?? 0),
    approvalWaitingCount: pendingApprovals.length,
    activeScheduleCount: Number(payload.schedules?.active_count ?? activeSchedules.length ?? 0),
    scheduleItems,
    activeAgentCards,
    recentLocalActions,
    updatedAt: String(payload.updated_at || '').trim() || null,
  };
}

function buildHomeInboxSessionPreview(items: HomeInboxSessionPayload[]): HomeInboxSessionPreview | null {
  const latest = [...items]
    .map((item) => ({
      sessionKey: String(item.session_key || item.session_id || '').trim(),
      channel: String(item.channel || '').trim().toLowerCase() || 'unknown',
      label: String(item.session_key || item.session_id || '').trim(),
      summary: compactHomeSummary(String(item.last_text || '').trim(), 'No recent message yet.', 88),
      updatedAt: String(item.last_ts || '').trim() || null,
      eventCount: Number(item.event_count || 0),
      inboundCount: Number(item.inbound_count || 0),
      outboundCount: Number(item.outbound_count || 0),
      runId: String(item.last_run_id || '').trim() || null,
      sortTs: homeSortTime(item.last_ts),
    }))
    .filter((item) => item.sessionKey)
    .sort((a, b) => b.sortTs - a.sortTs)[0];

  if (!latest) return null;

  const label = latest.sessionKey.startsWith('telegram:')
    ? `Chat ${latest.sessionKey.replace('telegram:', '')}`
    : latest.sessionKey.startsWith('whatsapp:')
      ? latest.sessionKey.replace('whatsapp:', '')
      : latest.sessionKey.startsWith('run:')
        ? `Run ${latest.sessionKey.replace('run:', '').slice(0, 8)}`
        : latest.label.length > 32
          ? `${latest.label.slice(0, 29)}...`
          : latest.label;

  return {
    sessionKey: latest.sessionKey,
    channel: latest.channel,
    label,
    summary: latest.summary,
    updatedAt: latest.updatedAt,
    eventCount: latest.eventCount,
    inboundCount: latest.inboundCount,
    outboundCount: latest.outboundCount,
    runId: latest.runId,
  };
}

function formatChatExecutionLabel(
  packId: string | null | undefined,
  connectionMode: string | null | undefined,
  recentExecutionTarget: string | null | undefined,
): string {
  const pack = String(packId || '').trim().toLowerCase();
  const mode = String(connectionMode || '').trim().toLowerCase();
  const target = String(recentExecutionTarget || '').trim().toLowerCase();
  if (pack === 'local-execution-v1' || target === 'local_companion' || mode === 'local_companion') {
    return 'Local machine';
  }
  if (target === 'browser') return 'Browser';
  if (target === 'desktop') return 'Desktop';
  if (target === 'cloud') return 'Cloud runtime';
  if (target === 'auto') return 'Smart routing';
  return 'Smart routing';
}

function formatPreferredExecutionLabel(
  packId: string | null | undefined,
  connectionMode: string | null | undefined,
): string {
  const pack = String(packId || '').trim().toLowerCase();
  const mode = String(connectionMode || '').trim().toLowerCase();
  if (pack === 'local-execution-v1' || mode === 'local_companion') {
    return 'Local machine';
  }
  return 'Smart routing';
}

type ChatNextRecommendation = {
  chipText: string;
  chipTone: ChatIdentityItem['tone'];
  actionLabel: string;
  href: string;
};

function resolveChatNextRecommendation(args: {
  setupReady: boolean;
  runtimeOk: boolean;
  pendingApprovals: number;
  connectedTools: number;
  executionLabel: string;
}): ChatNextRecommendation {
  if (!args.setupReady) {
    return {
      chipText: 'Finish setup before your first task',
      chipTone: 'warning',
      actionLabel: 'Open Setup',
      href: '/setup',
    };
  }
  if (!args.runtimeOk) {
    return {
      chipText: 'Check platform status',
      chipTone: 'warning',
      actionLabel: 'Open Health',
      href: '/health',
    };
  }
  if (args.pendingApprovals > 0) {
    return {
      chipText: `${args.pendingApprovals} confirmation${args.pendingApprovals === 1 ? '' : 's'} waiting — review now`,
      chipTone: 'warning',
      actionLabel: 'Open Confirmations',
      href: '/approvals',
    };
  }
  if (args.connectedTools === 0) {
    return {
      chipText: 'No tools connected yet',
      chipTone: 'warning',
      actionLabel: 'Open Integrations',
      href: '/connectors',
    };
  }
  return {
    chipText: 'Ready for a new task',
    chipTone: 'success',
    actionLabel: 'Open Runs',
    href: '/executions',
  };
}

function formatSimpleChatTrustLabel(trustMode: string, accessMode: string): string {
  if (accessMode === 'full' || trustMode === 'auto') return 'Elevated access';
  if (trustMode === 'strict' || trustMode === 'sensitive_guard' || trustMode === 'cost_guard') return 'Restricted access';
  return 'Standard access';
}

function extractWorkbenchReplyText(lastRunPayload: Record<string, unknown> | null, latestRunSummary: string | null, topError: string | null, status: string): string {
  const pending = (lastRunPayload?.pending_confirmation || lastRunPayload?.pending_approval) as Record<string, unknown> | null | undefined;
  if (status === 'waiting' && pending && typeof pending === 'object') {
    return '';
  }

  const candidates: unknown[] = [
    lastRunPayload?.result,
    lastRunPayload?.result_data,
    latestRunSummary,
    topError && !topError.toLowerCase().includes('provider profiles path is not writable') ? topError : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return normalizeRepeatedMessageContent(candidate);
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      for (const key of ['summary', 'result', 'message', 'text', 'reply', 'content', 'output']) {
        const nested = record[key];
        if (typeof nested === 'string' && nested.trim()) return normalizeRepeatedMessageContent(nested);
      }
      try {
        return JSON.stringify(candidate, null, 2);
      } catch {
        // ignore stringify failure
      }
    }
  }

  if (status === 'error') return `${RUN_FAILED_STATUS_COPY} Open Runs for details.`;
  return `${RUN_COMPLETED_STATUS_COPY} Open Runs for details.`;
}

function hasStructuredAssistantReply(lastRunPayload: Record<string, unknown> | null, latestRunSummary: string | null): boolean {
  const candidates: unknown[] = [
    lastRunPayload?.result,
    lastRunPayload?.result_data,
    latestRunSummary,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return true;
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      for (const key of ['summary', 'result', 'message', 'text', 'reply', 'content', 'output']) {
        const nested = record[key];
        if (typeof nested === 'string' && nested.trim()) return true;
      }
    }
  }

  return false;
}

function resolveWorkbenchMessageStatus(
  status: string,
  lastRunPayload: Record<string, unknown> | null,
  latestRunSummary: string | null,
): WorkbenchAgentChatMessage['status'] {
  if (status === 'waiting') return 'waiting';
  if (status === 'completed') return 'completed';
  if (status === 'error' && hasStructuredAssistantReply(lastRunPayload, latestRunSummary)) {
    return 'completed';
  }
  return status === 'error' ? 'error' : 'running';
}

function shouldHoldForStructuredReply(
  status: string,
  lastRunPayload: Record<string, unknown> | null,
  latestRunSummary: string | null,
  topError: string | null,
): boolean {
  if (!['completed', 'error'].includes(status)) return false;
  if (hasStructuredAssistantReply(lastRunPayload, latestRunSummary)) return false;
  if (status === 'error' && topError && topError.trim()) return false;
  return true;
}

function extractRunIdFromPayload(lastRunPayload: Record<string, unknown> | null): string | null {
  if (!lastRunPayload || typeof lastRunPayload !== 'object') return null;
  const runId = String(lastRunPayload.run_id || '').trim();
  return runId || null;
}

function matchLatestRunSummary(
  expectedRunId: string | null,
  latestRunId: string | null,
  latestRunSummary: string | null,
): string | null {
  if (!expectedRunId || !latestRunId || expectedRunId !== latestRunId) return null;
  return latestRunSummary;
}

function mapRunStatusToChatRunCardStatus(status: string): ChatRunCardStatus {
  if (status === 'queued_local') return 'preparing';
  if (status === 'running') return 'running';
  if (status === 'waiting') return 'waiting';
  if (status === 'completed') return 'completed';
  return 'failed';
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

// Reads the confirmation-first payload. `pending_approval` is a deprecated compatibility alias.
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

function buildOperatorChatApprovalRequests(
  payload: {
    approvals?: Array<Record<string, unknown>> | null;
    actions?: ChatMessageActionRecord[] | null;
  },
): ChatApprovalRequestRecord[] {
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

function readRunProviderModelContract(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const contract = readRunDetailContract(payload);
  const providerModel = contract?.provider_model;
  return providerModel && typeof providerModel === 'object'
    ? providerModel as Record<string, unknown>
    : null;
}

function readRunDetailContract(
  payload: Record<string, unknown> | null,
): PlatformRunDetailContract {
  if (!payload || typeof payload !== 'object') return null;
  const contract = payload.run_detail_contract;
  return contract && typeof contract === 'object'
    ? contract as PlatformRunDetailContract
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

function buildRunCardSummary(args: {
  status: string;
  lastRunPayload: Record<string, unknown> | null;
  latestRunSummary: string | null;
  topError: string | null;
}): string {
  const { status, lastRunPayload, latestRunSummary, topError } = args;
  if (status === 'queued_local') return 'Preparing execution on your machine.';
  if (status === 'running') return 'Working on this now.';
  if (status === 'waiting') return 'Waiting for confirmation to continue.';
  if (status === 'error') return topError || 'This run needs attention.';
  return extractWorkbenchReplyText(lastRunPayload, latestRunSummary, topError, status);
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

function buildRunCardApproval(
  lastRunPayload: Record<string, unknown> | null,
): ChatRunCardApprovalRecord | null {
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
  latestRunSummary: string | null;
  topError: string | null;
}): ChatRunCardRecord {
  const { goal, runId, status, lastRunPayload, latestRunSummary, topError } = args;
  const summary = buildRunCardSummary({ status, lastRunPayload, latestRunSummary, topError });
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

function migrateLegacyWorkbenchChats(
  legacyChats: Record<string, WorkbenchAgentChatMessage[]>,
): ChatStoreRecord {
  const preferredAgentRole = legacyChats.orchestrator ? 'orchestrator' : Object.keys(legacyChats)[0] || 'orchestrator';
  const seedMessages = sanitizePersistedWorkbenchChats(legacyChats)[preferredAgentRole] || [];
  const emptySession = createEmptyChatSession();
  const session = upsertSessionMessages(emptySession, seedMessages, new Date().toISOString());
  return {
    version: 1,
    selectedSessionId: seedMessages.length > 0 ? session.id : emptySession.id,
    sessions: seedMessages.length > 0 ? [session] : [emptySession],
  };
}

export function AutopilotWorkspace() {
  const streamRef = useRef<AuthenticatedEventStreamConnection | null>(null);
  const primaryGoalRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();
  const { accessMode, setInspectState, status: shellStatus } = usePlatformShell();
  const singleAgentMode = SINGLE_AGENT_MODE;

  const pageState = usePageState();

  const {
    goal, setGoal,
    setSelectedPackId,
    selectedAgentRole,
    setSelectedAgentRole,
    localExecutionDraft,
    setLocalExecutionDraft,
    provider,
    setProvider,
    model,
    setModel,
    providerOptions,
    modelOptions,
    modelsLoading,
    connectionMode,
    trustMode,
    setTrustMode,
    status,
    setStatus,
    metricsUnavailable,
    logs,
    runId,
    lastRouteInfo,
    packResult,
    lastRunPayload,
    topError, setTopError,
    setupStatus,
    workersUnavailable,
    showLiveLogs, setShowLiveLogs,
    guidedDefaultsEnabled,
    setGuidedDefaultsEnabled,
    setupHydrated,
    viewportWidth, setViewportWidth,
    connectorCredentials,
    inboxInput,
    setInboxInput,
    leadsInput,
    setLeadsInput,
    slotsInput,
    setSlotsInput,
  } = pageState;

  const derivedSetupReady = Boolean(
    setupStatus?.runtimeReady && setupStatus?.accountConnected && setupStatus?.connectionTested,
  );

  const api = usePlatformApi(pageState, streamRef);

  const {
    appendLog,
    closeStream,
    checkCompatibility,
    fetchRunResult,
    sendOperatorChat,
    startOperatorRun,
    startAutopilot,
  } = api;

  const [controlCenter, setControlCenter] = useState<ControlCenterSnapshot>(INITIAL_CONTROL_CENTER);
  const [approvalActionBusy, setApprovalActionBusy] = useState<Record<string, boolean>>({});
  const [deckMode, setDeckMode] = useState<WorkbenchDeckMode>('context');
  const [workbenchChatMode, setWorkbenchChatMode] = useState<'direct' | 'orchestrate'>('orchestrate');
  const [selectedWorkbenchRunId, setSelectedWorkbenchRunId] = useState<string | null>(null);
  const [workbenchAgentChats, setWorkbenchAgentChats] = useState<Record<string, WorkbenchAgentChatMessage[]>>({});
  const [pendingWorkbenchChat, setPendingWorkbenchChat] = useState<PendingWorkbenchChat | null>(null);
  const [chatStore, setChatStore] = useState<ChatStoreRecord>(() => {
    const initialSession = createEmptyChatSession();
    return {
      version: 1,
      selectedSessionId: initialSession.id,
      sessions: [initialSession],
    };
  });
  const [chatIdentityDrawerOpen, setChatIdentityDrawerOpen] = useState(false);
  const [pendingSimpleChat, setPendingSimpleChat] = useState<PendingSimpleChatResponse | null>(null);
  const [pendingSimpleRun, setPendingSimpleRun] = useState<PendingSimpleRun | null>(null);
  const [chatNoProviderStatus, setChatNoProviderStatus] = useState(false);
  const [chatAuthRequiredMessage, setChatAuthRequiredMessage] = useState<string | null>(null);
  const [simpleChatDepth, setSimpleChatDepth] = useState<ChatDepthValue>('medium');
  const preloadQuerySignatureRef = useRef('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKBENCH_DECK_MODE_STORAGE_KEY);
      if (raw === 'context' || raw === 'control' || raw === 'inspect') {
        setDeckMode(raw);
      }
    } catch {
      // ignore storage read failures
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKBENCH_DECK_MODE_STORAGE_KEY, deckMode);
    } catch {
      // ignore storage write failures
    }
  }, [deckMode]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORE_STORAGE_KEY);
      if (raw) {
        const parsed = sanitizeChatStore(JSON.parse(raw));
        if (parsed) {
          setChatStore(parsed);
          return;
        }
      }

      const legacyRaw = window.localStorage.getItem(WORKBENCH_AGENT_CHAT_STORAGE_KEY);
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw) as Record<string, WorkbenchAgentChatMessage[]>;
        if (legacyParsed && typeof legacyParsed === 'object') {
          setChatStore(migrateLegacyWorkbenchChats(legacyParsed));
        }
      }
    } catch {
      // ignore storage read failures
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_STORE_STORAGE_KEY, JSON.stringify(chatStore));
      window.dispatchEvent(new Event(CHAT_STORE_UPDATED_EVENT));
    } catch {
      // ignore storage write failures
    }
  }, [chatStore]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKBENCH_AGENT_CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, WorkbenchAgentChatMessage[]>;
      if (parsed && typeof parsed === 'object') {
        const sanitized = sanitizePersistedWorkbenchChats(parsed);
        setWorkbenchAgentChats(sanitized);
      }
    } catch {
      // ignore storage read failures
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKBENCH_AGENT_CHAT_STORAGE_KEY, JSON.stringify(workbenchAgentChats));
    } catch {
      // ignore storage write failures
    }
  }, [workbenchAgentChats]);

  useEffect(() => {
    const handleChatSessionSelect = (event: Event) => {
      const customEvent = event as CustomEvent<ChatSessionSelectDetail | undefined>;
      const sessionId = String(customEvent.detail?.sessionId || '').trim();
      if (!sessionId) return;
      setChatStore((current) => {
        if (!current.sessions.some((session) => session.id === sessionId)) return current;
        return {
          ...current,
          selectedSessionId: sessionId,
        };
      });
      setGoal('');
      setTopError(null);
    };

    window.addEventListener(CHAT_SESSION_SELECT_EVENT, handleChatSessionSelect as EventListener);
    return () => {
      window.removeEventListener(CHAT_SESSION_SELECT_EVENT, handleChatSessionSelect as EventListener);
    };
  }, [setGoal, setTopError]);

  useEffect(() => {
    const clearChatThread = () => {
      closeStream();
      setGoal('');
      setSelectedPackId(DEFAULT_OUTCOME_PACK_ID);
      setTopError(null);
      setChatIdentityDrawerOpen(false);
      setPendingWorkbenchChat(null);
      setPendingSimpleChat(null);
      setPendingSimpleRun(null);
      setSelectedWorkbenchRunId(null);
      setWorkbenchAgentChats({});
      setChatStore((current) => {
        const nextSession = createEmptyChatSession();
        const preservedSessions = current.sessions.filter((session) => session.messages.length > 0).slice(0, CHAT_SESSION_LIMIT - 1);
        return {
          version: 1,
          selectedSessionId: nextSession.id,
          sessions: [nextSession, ...preservedSessions],
        };
      });
      try {
        window.localStorage.removeItem(WORKBENCH_AGENT_CHAT_STORAGE_KEY);
      } catch {
        // ignore storage removal errors
      }
    };

    window.addEventListener(EMPYRALIS_NEW_CHAT_EVENT, clearChatThread);
    return () => {
      window.removeEventListener(EMPYRALIS_NEW_CHAT_EVENT, clearChatThread);
    };
  }, [closeStream, setGoal, setSelectedPackId, setTopError]);

  const refreshControlCenter = useCallback(async () => {
    try {
      await ensureControlPlaneSession();
      const snapshotRes = await fetch('/api/workbench/control-center', { cache: 'no-store' });
      if (!snapshotRes.ok) {
        const text = await snapshotRes.text().catch(() => '');
        throw new Error(text || 'Failed to load live workspace snapshot.');
      }
      const payload = await snapshotRes.json() as {
        snapshot?: HomeWorkspaceSnapshotPayload;
        inbox?: { sessions?: HomeInboxSessionPayload[] } | null;
      };
      const snapshot = (payload?.snapshot || {}) as HomeWorkspaceSnapshotPayload;

      const runtimeOk = Boolean(snapshot.runtime?.ok);
      const authMode =
        typeof snapshot.runtime?.auth_mode === 'string' && snapshot.runtime.auth_mode.trim()
          ? snapshot.runtime.auth_mode.trim()
          : '-';
      const homeOverview = buildHomeLiveOverview(snapshot);

      const historyItems = Array.isArray(snapshot.tasks?.recent_runs) ? snapshot.tasks?.recent_runs : [];
      const recentRuns: ControlCenterSnapshot['recentRuns'] = historyItems
        .slice(0, 10)
        .map((item) => ({
          run_id: String(item?.run_id || '').trim(),
          status: String(item?.status || '').trim().toLowerCase() || 'unknown',
          created_at: String(item?.created_at || '').trim() || null,
          duration_ms: typeof item?.duration_ms === 'number' ? item.duration_ms : null,
          pack_id: String(item?.pack_id || item?.outcome_pack || '').trim() || null,
          agent_role: String(item?.agent_role || '').trim() || null,
          result_summary: String(item?.result_summary || '').trim() || null,
          usage_provider: String(item?.usage_provider || '').trim() || null,
          usage_model: String(item?.usage_model || '').trim() || null,
          requested_provider: String(item?.requested_provider || '').trim() || null,
          effective_provider: String(item?.effective_provider || '').trim() || null,
          requested_model: String(item?.requested_model || '').trim() || null,
          effective_model: String(item?.effective_model || '').trim() || null,
          provider_overridden: typeof item?.provider_overridden === 'boolean' ? item.provider_overridden : undefined,
          model_overridden: typeof item?.model_overridden === 'boolean' ? item.model_overridden : undefined,
          fallback_used: typeof item?.fallback_used === 'boolean' ? item.fallback_used : undefined,
          execution_target_selected: String(item?.execution_target_selected || '').trim() || null,
        }))
        .filter((item) => item.run_id);

      const latestRun = recentRuns[0] ?? null;
      const latestRunId = latestRun?.run_id || null;
      const latestRunStatus = latestRun?.status || null;
      const latestRunProvider = latestRun?.effective_provider || latestRun?.usage_provider || null;
      const latestRunSummary = latestRun?.result_summary || null;
      const inboxPayload = payload?.inbox ?? null;
      const latestInboxSession = buildHomeInboxSessionPreview(
        Array.isArray(inboxPayload?.sessions) ? (inboxPayload.sessions as HomeInboxSessionPayload[]) : [],
      );

      const pendingApprovalsRaw = Array.isArray(snapshot.approvals?.pending) ? snapshot.approvals?.pending : [];
      const pendingApprovals: ControlCenterSnapshot['pendingApprovals'] = pendingApprovalsRaw
        .map((item) => {
          const runId = String(item?.run_id || '').trim();
          const approvalId = String(item?.approval_id || '').trim();
          if (!runId || !approvalId) return null;
          return {
            runId,
            approvalId,
            prompt: String(item?.prompt || 'Confirmation required.').trim(),
            labels: Array.isArray(item?.labels) ? item.labels.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
            capabilities: Array.isArray(item?.capabilities) ? item.capabilities.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
            expiresAt: String(item?.expires_at || '').trim() || null,
            status: String(item?.status || 'waiting').trim() || 'waiting',
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const approvalAuditItemsRaw = Array.isArray(snapshot.approvals?.audit) ? snapshot.approvals?.audit : [];
      const approvalAudit: ControlCenterSnapshot['approvalAudit'] = approvalAuditItemsRaw
        .map((item: unknown) => {
          const record = item as Record<string, unknown>;
          const id = String(record?.id || '').trim();
          const ts = String(record?.ts || '').trim();
          const stage = String(record?.stage || '').trim().toLowerCase();
          const decision = String(record?.decision || '').trim().toLowerCase();
          const actor = String(record?.actor || '').trim().toLowerCase();
          const source = String(record?.source || '').trim().toLowerCase();
          const runIdRaw = String(record?.run_id || '').trim();
          const noteRaw = String(record?.note || '').trim();
          if (!id || !ts || !stage) return null;
          return {
            id,
            ts,
            stage,
            decision,
            actor,
            source,
            runId: runIdRaw || null,
            note: noteRaw || null,
          };
        })
        .filter(
          (
            item: {
              id: string;
              ts: string;
              stage: string;
              decision: string;
              actor: string;
              source: string;
              runId: string | null;
              note: string | null;
            } | null,
          ): item is {
            id: string;
            ts: string;
            stage: string;
            decision: string;
            actor: string;
            source: string;
            runId: string | null;
            note: string | null;
          } => item !== null,
        );

      const releaseReady = runtimeOk && homeOverview.workerOnlineCount > 0;

      setControlCenter({
        loading: false,
        releaseReady,
        runtimeOk,
        authMode,
        workerOnline: homeOverview.workerOnlineCount,
        workerPending: homeOverview.localQueuePendingCount,
        telegramActive: false,
        telegramThreadAlive: false,
        telegramProcessed: 0,
        telegramRuns: 0,
        telegramLastError: null,
        latestRunId,
        latestRunStatus,
        latestRunProvider,
        latestRunSummary,
        pendingApprovals,
        approvalAudit,
        recentRuns,
        homeOverview,
        latestInboxSession,
        updatedAt: homeOverview.updatedAt || new Date().toISOString(),
      });
    } catch {
      setControlCenter((prev) => ({
        ...prev,
        loading: false,
        releaseReady: false,
        runtimeOk: false,
        updatedAt: new Date().toISOString(),
      }));
    }
  }, []);

  useEffect(() => {
    if (selectedWorkbenchRunId && controlCenter.recentRuns.some((item) => item.run_id === selectedWorkbenchRunId)) {
      return;
    }
    if (runId) {
      setSelectedWorkbenchRunId(runId);
      return;
    }
    if (controlCenter.latestRunId) {
      setSelectedWorkbenchRunId(controlCenter.latestRunId);
      return;
    }
    setSelectedWorkbenchRunId(null);
  }, [controlCenter.latestRunId, controlCenter.recentRuns, runId, selectedWorkbenchRunId]);

  const resolvePendingApproval = useCallback(
    async (runId: string, approvalId: string, decision: 'Proceed' | 'Hold') => {
      const key = `${runId}:${approvalId}:${decision}`;
      setApprovalActionBusy((prev) => ({ ...prev, [key]: true }));
      try {
        await ensureControlPlaneSession();
        const res = await fetch('/api/approvals/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, approvalId, decision, note: `Resolved from ${BRAND.product} Admin` }),
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => '');
          throw new Error(msg || 'Failed to resolve confirmation.');
        }
        appendLog(`${decision === 'Proceed' ? 'Confirmed' : 'Declined'} for ${runId.slice(0, 8)}.`);
        void refreshControlCenter();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to resolve confirmation.';
        appendLog(message, 'error');
        setTopError(message);
      } finally {
        setApprovalActionBusy((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [appendLog, refreshControlCenter, setTopError],
  );

  useEffect(() => {
    if (setupHydrated) {
      void checkCompatibility();
    }
  }, [setupHydrated, checkCompatibility]);

  useEffect(() => {
    if (!setupHydrated) return;
    const boot = window.setTimeout(() => {
      void refreshControlCenter();
    }, 0);
    const timer = window.setInterval(() => {
      void refreshControlCenter();
    }, 15000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [setupHydrated, refreshControlCenter]);

  const actions = usePageActions(pageState, api);

  const {
    copyResultSummary,
    exportRunJson,
    createFollowUpTask,
    runReceipt,
    copyRunReceipt,
    applyStarterTemplate,
    autonomyStages,
    selectedPack,
    selectedPreset,
    setupReady: actionsSetupReady,
    executionSummary,
    riskColor,
  } = actions;

  const setupReady = actionsSetupReady ?? derivedSetupReady;
  const [workbenchPinnedAgentRoles, setWorkbenchPinnedAgentRoles] = useState<AgentRoleId[]>([]);
  const [workbenchAgentConfigs, setWorkbenchAgentConfigs] = useState<Partial<Record<AgentRoleId, StoredAgentProfileConfig>>>({});
  const [defaultAssistantProfileId, setDefaultAssistantProfileId] = useState<StoredAssistantProfileId>('custom');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedMode = window.localStorage.getItem(WORKBENCH_CHAT_MODE_STORAGE_KEY);
      if (storedMode === 'direct' || storedMode === 'orchestrate') {
        setWorkbenchChatMode(storedMode);
      }
    } catch {
      // ignore invalid persisted mode
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const hasPreloadParams = WORKBENCH_PRELOAD_QUERY_KEYS.some((key) => params.get(key) !== null);
    if (!hasPreloadParams) return;
    const signature = params.toString();
    if (!signature || preloadQuerySignatureRef.current === signature) return;
    preloadQuerySignatureRef.current = signature;

    const pack = params.get('pack');
    const goalParam = params.get('goal');
    const primaryParam = params.get('primary');
    const secondaryParam = params.get('secondary');
    const tertiaryParam = params.get('tertiary');
    const deckParam = params.get('deck');
    const agentParam = params.get('agent');
    const chatParam = params.get('chat');

    if (pack && OUTCOME_PACKS.some((item) => item.id === pack)) {
      setSelectedPackId(pack);
      if (goalParam && goalParam.trim()) {
        setGoal(goalParam);
      }
    } else if (goalParam && goalParam.trim()) {
      setGoal(goalParam);
    }

    if (primaryParam !== null) setInboxInput(primaryParam);
    if (secondaryParam !== null) setLeadsInput(secondaryParam);
    if (tertiaryParam !== null) setSlotsInput(tertiaryParam);
    if (chatParam === 'direct' || chatParam === 'orchestrate') {
      setWorkbenchChatMode(chatParam);
    }
    if (agentParam && isAgentRoleId(agentParam)) {
      setSelectedAgentRole(agentParam);
      if (!deckParam) setDeckMode('context');
    }
    if (deckParam === 'context' || deckParam === 'control' || deckParam === 'inspect') {
      setDeckMode(deckParam);
    }
  }, [setGoal, setInboxInput, setLeadsInput, setSelectedPackId, setSlotsInput, setSelectedAgentRole]);

  useEffect(() => {
    if (selectedPack.id !== 'local-execution-v1') return;
    const localExecutionDefaultGoal = OUTCOME_PACKS.find((item) => item.id === 'local-execution-v1')?.defaultGoal;
    if (!localExecutionDefaultGoal || goal.trim() !== localExecutionDefaultGoal) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('goal')?.trim()) return;
    setGoal('');
  }, [goal, selectedPack.id, setGoal]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WORKBENCH_CHAT_MODE_STORAGE_KEY, workbenchChatMode);
    } catch {
      // ignore storage failure
    }
  }, [workbenchChatMode]);

  useEffect(() => {
    if (!setupHydrated) return;
    const wantsFullAccess = accessMode === 'full';
    const nextTrustMode = wantsFullAccess ? 'auto' : 'guarded';
    if (trustMode !== nextTrustMode) {
      setTrustMode(nextTrustMode);
    }
    if (guidedDefaultsEnabled === wantsFullAccess) {
      setGuidedDefaultsEnabled(!wantsFullAccess);
    }
  }, [accessMode, guidedDefaultsEnabled, setGuidedDefaultsEnabled, setTrustMode, setupHydrated, trustMode]);

  useEffect(() => {
    if (workbenchChatMode !== 'orchestrate') setWorkbenchChatMode('orchestrate');
    if (selectedAgentRole !== 'orchestrator') setSelectedAgentRole('orchestrator');
  }, [selectedAgentRole, setSelectedAgentRole, workbenchChatMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedPinned = window.localStorage.getItem(PINNED_AGENT_STORAGE_KEY);
      if (storedPinned) {
        const parsed = JSON.parse(storedPinned);
        if (Array.isArray(parsed)) {
          setWorkbenchPinnedAgentRoles(parsed.filter((item): item is AgentRoleId => isAgentRoleId(item)));
        }
      }
      const storedConfigs = window.localStorage.getItem(AGENT_CONFIG_STORAGE_KEY);
      if (storedConfigs) {
        const parsed = JSON.parse(storedConfigs) as Partial<Record<AgentRoleId, StoredAgentProfileConfig>>;
        if (parsed && typeof parsed === 'object') setWorkbenchAgentConfigs(parsed);
      }
      const storedDefaultProfile = window.localStorage.getItem(DEFAULT_AGENT_PROFILE_STORAGE_KEY);
      if (storedDefaultProfile) {
        setDefaultAssistantProfileId(normalizeAssistantProfileId(storedDefaultProfile));
      }
    } catch {
      // ignore invalid persisted state
    }
  }, []);

  useEffect(() => {
    const apply = () => setViewportWidth(window.innerWidth);
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [setViewportWidth]);

  const isNarrow = viewportWidth < 1240;
  const isTablet = viewportWidth < 1080;
  const isMobile = viewportWidth < 860;
  const defaultAssistantProfile = useMemo(() => {
    const profile = getAssistantProfileMeta(defaultAssistantProfileId);
    const saved = workbenchAgentConfigs[profile.backendRole];
    return {
      ...profile,
      label: saved?.name?.trim() || profile.label,
      subtitle: saved?.subtitle?.trim() || profile.subtitle,
    };
  }, [defaultAssistantProfileId, workbenchAgentConfigs]);
  const simpleChatRuntimeRole = defaultAssistantProfile.backendRole;
  const workbenchAgentRoleOptions = useMemo(() => {
    const source =
      singleAgentMode || workbenchChatMode === 'orchestrate'
        ? AGENT_ROLE_OPTIONS.filter((option) => option.id === 'orchestrator')
        : workbenchPinnedAgentRoles.length > 0
          ? AGENT_ROLE_OPTIONS.filter((option) =>
              (workbenchPinnedAgentRoles.includes(option.id) || option.id === selectedAgentRole) && option.id !== 'orchestrator',
            )
          : AGENT_ROLE_OPTIONS.filter((option) => option.id === selectedAgentRole || option.id === DEFAULT_AGENT_ROLE_ID);

    const deduped = source.filter((option, index, array) => array.findIndex((candidate) => candidate.id === option.id) === index);
    return deduped.map((option) => ({
      ...option,
      label: workbenchAgentConfigs[option.id]?.name?.trim() || option.label,
      description: workbenchAgentConfigs[option.id]?.subtitle?.trim() || option.description,
    }));
  }, [selectedAgentRole, singleAgentMode, workbenchAgentConfigs, workbenchPinnedAgentRoles, workbenchChatMode]);

  useEffect(() => {
    if (singleAgentMode) {
      if (workbenchChatMode !== 'orchestrate') setWorkbenchChatMode('orchestrate');
      if (selectedAgentRole !== 'orchestrator') setSelectedAgentRole('orchestrator');
      return;
    }
    if (workbenchChatMode === 'orchestrate') {
      if (selectedAgentRole !== 'orchestrator') setSelectedAgentRole('orchestrator');
      return;
    }
    if (selectedAgentRole === 'orchestrator') {
      const nextDirectRole = workbenchAgentRoleOptions.find((option) => option.id !== 'orchestrator')?.id;
      if (nextDirectRole) setSelectedAgentRole(nextDirectRole);
    }
  }, [selectedAgentRole, setSelectedAgentRole, singleAgentMode, workbenchAgentRoleOptions, workbenchChatMode]);

  useEffect(() => {
    if (singleAgentMode) return;
    if (workbenchChatMode === 'orchestrate') return;
    if (workbenchAgentRoleOptions.length === 0) return;
    if (!workbenchAgentRoleOptions.some((option) => option.id === selectedAgentRole)) {
      setSelectedAgentRole(workbenchAgentRoleOptions[0].id);
    }
  }, [selectedAgentRole, setSelectedAgentRole, singleAgentMode, workbenchAgentRoleOptions, workbenchChatMode]);

  const selectedAgent = workbenchAgentRoleOptions.find((option) => option.id === selectedAgentRole) || workbenchAgentRoleOptions[0] || AGENT_ROLE_OPTIONS[0];
  const selectedChatSession = useMemo(() => {
    return chatStore.sessions.find((session) => session.id === chatStore.selectedSessionId) || chatStore.sessions[0] || null;
  }, [chatStore]);
  const selectedChatMessages = useMemo(() => selectedChatSession?.messages || [], [selectedChatSession]);
  const handleSelectChatSession = useCallback((sessionId: string) => {
    setChatStore((current) => {
      if (!current.sessions.some((session) => session.id === sessionId)) return current;
      return {
        ...current,
        selectedSessionId: sessionId,
      };
    });
    setGoal('');
    setTopError(null);
    setChatIdentityDrawerOpen(false);
  }, [setGoal, setTopError]);
  const handleStartNewChat = useCallback(() => {
    window.dispatchEvent(new Event(EMPYRALIS_NEW_CHAT_EVENT));
  }, []);
  const latestSessionRunCard = useMemo(() => {
    return [...selectedChatMessages].reverse().find((message) => message.runCard)?.runCard || null;
  }, [selectedChatMessages]);
  const latestDirectChatContext = useMemo<ChatContextUsedRecord | null>(() => {
    return [...selectedChatMessages].reverse().find((message) => message.role === 'assistant' && message.contextUsed)?.contextUsed || null;
  }, [selectedChatMessages]);
  useEffect(() => {
    let active = true;
    if (selectedChatMessages.length > 0) return;

    const checkSetupGate = async () => {
      try {
        const runtimeStatus = await fetchRuntimeConnectionStatus();
        if (!active) return;
        if (!runtimeStatus.configured || !runtimeStatus.healthy) {
          router.replace('/onboarding');
          return;
        }
        if (getDesktopBridge()?.desktop) {
          const desktopStatus = await fetchDesktopSetupStatus();
          if (!active) return;
          if (!desktopStatus.desktop_setup_completed) {
            const returnTo = `${window.location.pathname || '/'}${window.location.search || ''}`;
            router.replace(buildSetupRoute(returnTo || '/'));
          }
          return;
        }
        const readiness = await fetchSetupReadiness();
        if (!active || readiness.complete) return;
        const returnTo = `${window.location.pathname || '/'}${window.location.search || ''}`;
        router.replace(buildSetupRoute(returnTo || '/'));
      } catch {
        // Leave the chat surface visible when the session is not ready yet.
      }
    };

    void checkSetupGate();
    return () => {
      active = false;
    };
  }, [router, selectedChatMessages.length]);
  const activeProviderOption = useMemo(
    () => providerOptions.find((item) => item.id === provider) || providerOptions[0] || null,
    [provider, providerOptions],
  );
  const simpleChatTrustLabel = useMemo(
    () => formatSimpleChatTrustLabel(trustMode, accessMode),
    [accessMode, trustMode],
  );
  const simpleChatDepthLabel = useMemo(
    () => CHAT_DEPTH_OPTIONS.find((option) => option.value === simpleChatDepth)?.label || 'Standard',
    [simpleChatDepth],
  );
  const sessionNextRecommendation = useMemo(() => {
    const executionLabel = formatPreferredExecutionLabel(selectedPack.id, connectionMode);
    return resolveChatNextRecommendation({
      setupReady,
      runtimeOk: controlCenter.runtimeOk,
      pendingApprovals: controlCenter.pendingApprovals.length,
      connectedTools: connectorCredentials.length,
      executionLabel,
    });
  }, [
    connectionMode,
    connectorCredentials.length,
    controlCenter.pendingApprovals.length,
    controlCenter.recentRuns,
    controlCenter.runtimeOk,
    selectedPack.id,
    setupReady,
  ]);
  const sessionIdentitySections = useMemo<ChatIdentitySection[]>(() => {
    if (!latestDirectChatContext) return [];
    const connectedSystems = summarizeCapabilitySystems(latestDirectChatContext.tool_capabilities, 'connected');
    const usableSystems = summarizeCapabilitySystems(latestDirectChatContext.tool_capabilities, 'usable');
    const unavailableSystems = summarizeCapabilitySystems(latestDirectChatContext.tool_capabilities, 'unavailable');
    const unverifiedSystems = summarizeCapabilitySystems(latestDirectChatContext.tool_capabilities, 'unverified');
    const readActions = summarizeCapabilityActions(latestDirectChatContext.tool_capabilities, 'read_actions');
    const writeActions = summarizeCapabilityActions(latestDirectChatContext.tool_capabilities, 'write_actions');
    const approvalActions = summarizeCapabilityActions(latestDirectChatContext.tool_capabilities, 'approval_required_actions');
    const note = latestDirectChatContext.prior_messages_used
      ? 'This reply uses: current message, workspace, requested model, connected systems, prior thread messages.'
      : 'This reply uses: current message, workspace, requested model, connected systems. This reply does not yet use prior thread messages.';
    return [{
      title: 'Direct chat',
      note,
      items: [
        { label: 'Workspace', value: latestDirectChatContext.workspace || 'Unknown' },
        { label: 'Requested provider', value: humanizeProviderLabel(latestDirectChatContext.requested_provider || '') },
        { label: 'Effective provider', value: humanizeProviderLabel(latestDirectChatContext.effective_provider || '') },
        { label: 'Requested model', value: latestDirectChatContext.requested_model || 'Unknown' },
        { label: 'Effective model', value: latestDirectChatContext.effective_model || 'Unknown' },
        { label: 'Requested reasoning', value: latestDirectChatContext.reasoning_effort || 'Standard' },
        {
          label: 'Fallback',
          value: latestDirectChatContext.fallback_used ? 'Used' : 'Not used',
          tone: latestDirectChatContext.fallback_used ? 'warning' : 'success',
        },
        {
          label: 'Connected systems',
          value: connectedSystems,
          tone: connectedSystems === 'None' ? 'warning' : 'success',
        },
        { label: 'Usable systems', value: usableSystems, tone: usableSystems === 'Not verified' ? 'warning' : 'success' },
        { label: 'Unavailable systems', value: unavailableSystems },
        { label: 'Read actions', value: readActions },
        { label: 'Write actions', value: writeActions },
        { label: 'Confirmation-required', value: approvalActions, tone: approvalActions === 'Not verified' ? 'warning' : undefined },
        { label: 'Capability state', value: unverifiedSystems },
        {
          label: 'Prior thread messages',
          value: latestDirectChatContext.prior_messages_used ? 'Used' : 'Not used yet',
          tone: latestDirectChatContext.prior_messages_used ? 'success' : 'warning',
        },
        { label: 'History mode', value: latestDirectChatContext.history_mode },
        { label: 'Run created', value: latestDirectChatContext.run_created ? 'Yes' : 'No' },
      ],
    }];
  }, [
    latestDirectChatContext,
  ]);
  const sessionIdentityActions = useMemo<ChatIdentityAction[]>(
    () => {
      const createAction = (label: string, href: string, priority: 'primary' | 'default' = 'default'): ChatIdentityAction => ({
        label,
        priority,
        onClick: () => {
          setChatIdentityDrawerOpen(false);
          router.push(href);
        },
      });

      if (controlCenter.pendingApprovals.length > 0) {
        return [createAction('Open Confirmations', '/approvals', 'primary')];
      }
      if (!setupStatus.accountConnected) {
        return [createAction('Connect AI account', '/connect-ai', 'primary')];
      }
      if (!setupStatus.connectionTested) {
        return [createAction('Verify AI account', '/connect-ai', 'primary')];
      }
      if (latestSessionRunCard?.runId) {
        return [createAction('Open Runs', '/executions', 'primary')];
      }
      return [];
    },
    [
      controlCenter.pendingApprovals.length,
      latestSessionRunCard?.runId,
      router,
      setupStatus.accountConnected,
      setupStatus.connectionTested,
    ],
  );
  const simpleChatRunOverrides = useMemo(
    () => ({
      agentRole: simpleChatRuntimeRole,
      metadata: {
        outcome_pack: undefined,
        outcome_pack_label: undefined,
        outcome_scope: undefined,
        pack_inputs: undefined,
        assistant_profile_id: defaultAssistantProfile.id,
        assistant_profile_label: defaultAssistantProfile.label,
        assistant_profile_subtitle: defaultAssistantProfile.subtitle,
      },
    }),
    [defaultAssistantProfile, simpleChatRuntimeRole],
  );
  const directAgentRunOverrides = useMemo(
    () => ({
      metadata: {
        outcome_pack: undefined,
        outcome_pack_label: undefined,
        outcome_scope: undefined,
        pack_inputs: undefined,
      },
    }),
    [],
  );
  const selectedWorkbenchAgentChat = useMemo(
    () => workbenchAgentChats[selectedAgentRole] || [],
    [selectedAgentRole, workbenchAgentChats],
  );
  const simpleChatProviderBanner = useMemo(() => {
    const authMessage = String(chatAuthRequiredMessage || shellStatus.authMessage || '').trim();
    if (authMessage) {
      return {
        text: authMessage,
        label: 'Sign in',
        href: controlPlaneSignInUrl(),
      };
    }
    if (setupStatus.accountConnected && !chatNoProviderStatus) return null;
    return {
      text: 'No AI provider configured — connect one in Integrations',
      label: 'Go to Integrations',
      href: '/connectors',
    };
  }, [chatAuthRequiredMessage, chatNoProviderStatus, setupStatus.accountConnected, shellStatus.authMessage]);

  useEffect(() => {
    if (setupStatus.accountConnected) {
      setChatNoProviderStatus(false);
    }
  }, [setupStatus.accountConnected]);
  useEffect(() => {
    if (!shellStatus.authRequired) {
      setChatAuthRequiredMessage(null);
    }
  }, [shellStatus.authRequired]);
  const inlineWorkbenchChatStatus = useMemo(() => {
    if (derivedSetupReady) return null;
    return 'Connect Telegram to activate alerts.';
  }, [derivedSetupReady]);
  const inlineWorkbenchChatAction = useMemo(() => {
    if (derivedSetupReady) return null;
    return {
      label: 'Connect Telegram →',
      href: '/connectors?connector=telegram_bot&onboarding=1',
    };
  }, [derivedSetupReady]);
  const shellStatusNotice = useMemo(() => {
    if (metricsUnavailable || workersUnavailable) return 'Status unavailable.';
    return null;
  }, [metricsUnavailable, workersUnavailable]);
  const shellTopNotice = useMemo(() => {
    const formattedTopError = formatShellTopError(topError);
    if (formattedTopError) {
      return {
        id: 'shell-error',
        tone: 'error' as const,
        label: formattedTopError,
      };
    }
    if (shellStatusNotice) {
      return {
        id: 'shell-status',
        tone: 'neutral' as const,
        label: shellStatusNotice,
      };
    }
    return null;
  }, [shellStatusNotice, topError]);
  useEffect(() => {
    const activeRunId = pendingSimpleRun?.runId || runId;
    const isActiveRun = Boolean(activeRunId) && ['queued_local', 'running', 'waiting'].includes(status);
    const contract = readRunDetailContract(lastRunPayload);
    if (!isActiveRun || !contract) {
      setInspectState(null);
      return;
    }
    setInspectState({
      runId: activeRunId,
      status,
      runDetailContract: contract,
    });
  }, [lastRunPayload, pendingSimpleRun?.runId, runId, setInspectState, status]);
  useEffect(() => {
    return () => {
      setInspectState(null);
    };
  }, [setInspectState]);
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

  const appendWorkbenchAgentChat = useCallback((agentRole: string, message: WorkbenchAgentChatMessage) => {
    setWorkbenchAgentChats((current) => ({
      ...current,
      [agentRole]: dedupeWorkbenchChatMessages([...(current[agentRole] || []), message]),
    }));
  }, []);

  const patchWorkbenchAgentChat = useCallback((agentRole: string, messageId: string, patch: Partial<WorkbenchAgentChatMessage>) => {
    setWorkbenchAgentChats((current) => ({
      ...current,
      [agentRole]: dedupeWorkbenchChatMessages(
        (current[agentRole] || []).map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
      ),
    }));
  }, []);

  const appendSimpleChatMessage = useCallback((sessionId: string, message: WorkbenchAgentChatMessage) => {
    setChatStore((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === sessionId ? upsertSessionMessages(session, [...session.messages, message], message.ts) : session,
      ),
    }));
  }, []);

  const patchSimpleChatMessage = useCallback((sessionId: string, messageId: string, patch: Partial<WorkbenchAgentChatMessage>) => {
    setChatStore((current) => ({
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
  }, []);

  const replaceSimpleChatMessage = useCallback((sessionId: string, messageId: string, nextMessage: WorkbenchAgentChatMessage) => {
    setChatStore((current) => ({
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
  }, []);

  const removeSimpleChatMessage = useCallback((sessionId: string, messageId: string) => {
    setChatStore((current) => ({
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
  }, []);

  const handleSimpleChatMessageAction = useCallback(async (messageId: string, action: ChatMessageActionRecord) => {
    const sessionId = selectedChatSession?.id;
    if (!sessionId) return;
    if (action.kind === 'approval_required') {
      const connector = String(action.connector || '').trim();
      const actionId = String(action.action || '').trim();
      const input = String(action.input || '').trim();
      if (!connector || !actionId || !input) return;
      const existingMessage = selectedChatMessages.find((message) => message.id === messageId) || null;
      const now = new Date().toISOString();
      patchSimpleChatMessage(sessionId, messageId, {
        status: 'running',
        actions: [],
        approvalRequests: [],
        content: 'Working on it...',
        ts: now,
      });
      setPendingSimpleChat({ sessionId, messageId, goal: '__approval_confirmed__' });
      let streamedSteps: NonNullable<WorkbenchAgentChatMessage['steps']> = [];
      try {
        let streamedReply = '';
        const payload = await sendOperatorChat('__approval_confirmed__', {
          reasoningEffort: simpleChatDepth,
          threadId: sessionId,
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
        patchSimpleChatMessage(sessionId, messageId, {
          content: payload.reply || streamedReply || (nextApprovalRequests.length > 0 ? '' : 'Action completed.'),
          status: nextApprovalRequests.length > 0 ? 'waiting' : 'completed',
          actions: nextActions,
          approvalRequests: nextApprovalRequests,
          contextUsed: payload.context_used || null,
          steps: Array.isArray(payload.steps) && payload.steps.length > 0 ? payload.steps : streamedSteps,
          ts: new Date().toISOString(),
        });
      } catch (error) {
        if (isNoProviderChatError(error)) {
          setChatNoProviderStatus(true);
          if (existingMessage) {
            replaceSimpleChatMessage(sessionId, messageId, existingMessage);
          }
          return;
        }
        if (isAuthRequiredChatError(error)) {
          setChatAuthRequiredMessage(error.message || 'Continue in your browser to sign in.');
          if (existingMessage) {
            replaceSimpleChatMessage(sessionId, messageId, existingMessage);
          }
          return;
        }
        patchSimpleChatMessage(sessionId, messageId, {
          content: error instanceof Error ? error.message : 'Failed to confirm and execute action.',
          status: 'error',
          actions: [],
          approvalRequests: [],
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
      router.push(action.href || '/builder/new');
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
    const runPayload = await startOperatorRun({
      goal: runGoal,
      agentRole: simpleChatRuntimeRole,
      metadata: {
        assistant_profile_id: defaultAssistantProfile.id,
        assistant_profile_label: defaultAssistantProfile.label,
        assistant_profile_subtitle: defaultAssistantProfile.subtitle,
      },
    });
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
    defaultAssistantProfile.id,
    defaultAssistantProfile.label,
    defaultAssistantProfile.subtitle,
    patchSimpleChatMessage,
    replaceSimpleChatMessage,
    router,
    sendOperatorChat,
    selectedChatMessages,
    selectedChatSession?.id,
    setChatNoProviderStatus,
    setPendingSimpleChat,
    simpleChatDepth,
    simpleChatRuntimeRole,
    startOperatorRun,
    topError,
  ]);

  const runWorkbenchCommand = useCallback(async (input?: string) => {
    const raw = String(input ?? goal).trim();
    if (!raw) return;
    const command = raw.toLowerCase();
    setGoal('');

    if (!raw.startsWith('/')) {
      setGoal(raw);
      setDeckMode('inspect');
      window.setTimeout(() => {
        void startAutopilot(directAgentRunOverrides);
      }, 0);
      return;
    }

    if (command === '/connect-ai' || command === '/accounts') {
      router.push('/connect-ai');
      return;
    }
    if (command === '/setup') {
      router.push('/setup');
      return;
    }
    if (command === '/skills' || command === '/extensions') {
      router.push('/library');
      return;
    }
    if (command === '/connectors' || command === '/integrations' || command === '/credentials' || command === '/channels') {
      router.push('/connectors');
      return;
    }
    if (command === '/agents' || command === '/assistant') {
      router.push('/agents');
      return;
    }
    if (command === '/workflows' || command === '/automations') {
      router.push('/agents');
      return;
    }
    if (command === '/library' || command === '/runs' || command === '/executions' || command === '/history') {
      if (command === '/library') {
        router.push('/library');
        return;
      }
      router.push('/executions');
      return;
    }
    if (command === '/approvals') {
      router.push('/approvals');
      return;
    }
    if (command === '/restart' || command === '/readiness' || command === '/health') {
      router.push('/health');
      return;
    }
    if (command === '/help') {
      setTopError(
        singleAgentMode
          ? 'Commands: /run <goal>, /run, /connect-ai, /setup, /assistant, /workflows, /library, /approvals, /connectors, /health. Built-in tools when relevant: web search/fetch, http_request, generate_image.'
          : 'Commands: /run <goal>, /run, /connect-ai, /setup, /agents, /workflows, /library, /approvals, /connectors, /health. Built-in tools when relevant: web search/fetch, http_request, generate_image.',
      );
      return;
    }
    if (command === '/run' || command.startsWith('/run ')) {
      const nextGoal = command.startsWith('/run ') ? raw.slice(5).trim() : '';
      if (nextGoal) {
        setGoal(nextGoal);
      }
      window.setTimeout(() => {
        void startAutopilot(directAgentRunOverrides);
      }, 0);
      return;
    }
    setTopError('Unknown command. Try /help.');
  }, [directAgentRunOverrides, goal, router, setGoal, setTopError, singleAgentMode, startAutopilot]);

  useEffect(() => {
    const handleGlobalCommandDetail = (detail: PlatformGlobalCommandEventDetail | undefined) => {
      if (!detail) return;

      if (detail.type === 'focus_command') {
        if (primaryGoalRef.current) {
          primaryGoalRef.current.focus();
        }
        return;
      }

      if (detail.type === 'focus_goal') {
        if (primaryGoalRef.current) {
          primaryGoalRef.current.focus();
        }
        return;
      }

      if (detail.type === 'run_autopilot') {
        if (!derivedSetupReady) {
          setTopError(null);
          return;
        }
        void startAutopilot(simpleChatRunOverrides);
      }
    };

    const onGlobalCommand = (event: Event) => {
      const custom = event as CustomEvent<PlatformGlobalCommandEventDetail | undefined>;
      handleGlobalCommandDetail(custom.detail);
    };

    try {
      const raw =
        window.sessionStorage.getItem(PENDING_GLOBAL_COMMAND_STORAGE_KEY) ??
        window.sessionStorage.getItem(LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { detail?: PlatformGlobalCommandEventDetail };
        handleGlobalCommandDetail(parsed.detail);
        window.sessionStorage.removeItem(PENDING_GLOBAL_COMMAND_STORAGE_KEY);
        window.sessionStorage.removeItem(LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY);
      }
    } catch {
      // Ignore malformed/blocked storage.
    }

    window.addEventListener(GLOBAL_COMMAND_EVENT, onGlobalCommand as EventListener);
    window.addEventListener(LEGACY_ORION_GLOBAL_COMMAND_EVENT, onGlobalCommand as EventListener);
    return () => {
      window.removeEventListener(GLOBAL_COMMAND_EVENT, onGlobalCommand as EventListener);
      window.removeEventListener(LEGACY_ORION_GLOBAL_COMMAND_EVENT, onGlobalCommand as EventListener);
    };
  }, [derivedSetupReady, router, setTopError, simpleChatRunOverrides, startAutopilot]);

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

  useEffect(() => {
    if (!pendingSimpleRun) return;
    if (!pendingSimpleRun.runId) return;
    if (!['completed', 'waiting', 'error'].includes(status)) return;
    const payloadRunId = extractRunIdFromPayload(lastRunPayload);
    const isMatchingRun =
      (payloadRunId && payloadRunId === pendingSimpleRun.runId) ||
      ((!payloadRunId || status === 'waiting') && runId === pendingSimpleRun.runId);
    if (!isMatchingRun) return;

    const matchingLatestRunSummary = matchLatestRunSummary(
      pendingSimpleRun.runId,
      controlCenter.latestRunId,
      controlCenter.latestRunSummary,
    );
    const existingMessage = chatStore.sessions
      .find((session) => session.id === pendingSimpleRun.sessionId)
      ?.messages.find((message) => message.id === pendingSimpleRun.messageId);
    const nextRunCard = buildRunCardFromPayload({
      goal: pendingSimpleRun.goal,
      runId: pendingSimpleRun.runId || runId,
      status,
      lastRunPayload,
      latestRunSummary: matchingLatestRunSummary,
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
    if (status === 'waiting') return;
    setPendingSimpleRun(null);
  }, [
    chatStore.sessions,
    controlCenter.latestRunId,
    controlCenter.latestRunSummary,
    lastRunPayload,
    patchSimpleChatMessage,
    pendingSimpleRun,
    runId,
    simpleChatPermissionPrompt,
    status,
    topError,
  ]);

  const submitSimpleChatPermissionDecision = useCallback(async (
    decision: 'Proceed' | 'Hold',
  ) => {
    const prompt = simpleChatPermissionPrompt;
    if (!prompt) return;
    try {
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
      if (
        nextStatus === 'queued_local'
        || nextStatus === 'running'
        || nextStatus === 'waiting'
        || nextStatus === 'completed'
        || nextStatus === 'error'
      ) {
        setStatus(nextStatus);
      }
      appendLog(
        decision === 'Proceed'
          ? 'Confirmed for this pending step.'
          : 'Declined. The run will not continue.',
        decision === 'Proceed' ? 'info' : 'warn',
      );
      if (decision !== 'Proceed' && nextStatus && nextStatus !== 'waiting') {
        setPendingSimpleRun(null);
      }
    } catch (error) {
      appendLog(error instanceof Error ? error.message : 'Failed to send decision.', 'error');
      throw error;
    }
  }, [appendLog, fetchRunResult, patchSimpleChatMessage, pendingSimpleRun, setStatus, simpleChatPermissionPrompt]);

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

  useEffect(() => {
    if (!pendingWorkbenchChat) return;
    if (!pendingWorkbenchChat.runId && runId && ['running', 'queued_local', 'waiting'].includes(status)) {
      setPendingWorkbenchChat((current) => (current ? { ...current, runId } : current));
      patchWorkbenchAgentChat(pendingWorkbenchChat.agentRole, pendingWorkbenchChat.placeholderId, {
        run_id: runId,
        status: status === 'waiting' ? 'waiting' : status === 'error' ? 'error' : 'running',
      });
    }
  }, [patchWorkbenchAgentChat, pendingWorkbenchChat, runId, status]);

  useEffect(() => {
    if (!pendingWorkbenchChat) return;
    if (!pendingWorkbenchChat.runId) return;
    if (!['completed', 'waiting', 'error'].includes(status)) return;
    const payloadRunId = extractRunIdFromPayload(lastRunPayload);
    const isMatchingRun =
      (payloadRunId && payloadRunId === pendingWorkbenchChat.runId) ||
      ((!payloadRunId || status === 'waiting') && runId === pendingWorkbenchChat.runId);
    if (!isMatchingRun) return;

    const matchingLatestRunSummary = matchLatestRunSummary(
      pendingWorkbenchChat.runId,
      controlCenter.latestRunId,
      controlCenter.latestRunSummary,
    );
    if (shouldHoldForStructuredReply(status, lastRunPayload, matchingLatestRunSummary, topError)) {
      return;
    }
    const replyText = extractWorkbenchReplyText(lastRunPayload, matchingLatestRunSummary, topError, status);
    patchWorkbenchAgentChat(pendingWorkbenchChat.agentRole, pendingWorkbenchChat.placeholderId, {
      content: replyText,
      status: resolveWorkbenchMessageStatus(status, lastRunPayload, matchingLatestRunSummary),
      run_id: pendingWorkbenchChat.runId || runId,
      ts: new Date().toISOString(),
    });
    setPendingWorkbenchChat(null);
  }, [controlCenter.latestRunId, controlCenter.latestRunSummary, lastRunPayload, patchWorkbenchAgentChat, pendingWorkbenchChat, runId, status, topError]);

  const sendSimpleChat = useCallback(async () => {
    const text = goal.trim();
    const sessionId = selectedChatSession?.id;
    if (!text || !sessionId) return;
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
    const userMessage: WorkbenchAgentChatMessage = {
      id: createWorkbenchChatId('user'),
      role: 'user',
      content: text,
      ts: now,
      status: 'completed',
    };
    const placeholderId = createWorkbenchChatId('assistant');
    const placeholder: WorkbenchAgentChatMessage = {
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
    let streamedSteps: NonNullable<WorkbenchAgentChatMessage['steps']> = [];
    try {
      let streamedReply = '';
      const payload = await sendOperatorChat(text, {
        reasoningEffort: simpleChatDepth,
        threadId: sessionId,
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
      patchSimpleChatMessage(sessionId, placeholderId, {
        content: payload.reply || streamedReply || (nextApprovalRequests.length > 0 ? '' : 'I couldn’t form a clean reply just now.'),
        status: nextApprovalRequests.length > 0 ? 'waiting' : 'completed',
        actions: nextActions,
        approvalRequests: nextApprovalRequests,
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
      appendLog(message, 'error');
    } finally {
      setPendingSimpleChat(null);
    }
  }, [
    appendLog,
    appendSimpleChatMessage,
    goal,
    patchSimpleChatMessage,
    removeSimpleChatMessage,
    selectedChatMessages,
    selectedChatSession?.id,
    sendOperatorChat,
    setChatNoProviderStatus,
    setGoal,
    setTopError,
    simpleChatDepth,
  ]);

  const sendWorkbenchAgentChat = useCallback(async () => {
    const text = goal.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const userMessage: WorkbenchAgentChatMessage = {
      id: createWorkbenchChatId('user'),
      role: 'user',
      content: text,
      ts: now,
      status: 'completed',
    };
    const placeholderId = createWorkbenchChatId('agent');
    const placeholder: WorkbenchAgentChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: 'Working on it...',
      ts: now,
      status: 'sending',
      run_id: null,
    };

    appendWorkbenchAgentChat(selectedAgentRole, userMessage);
    appendWorkbenchAgentChat(selectedAgentRole, placeholder);
    setPendingWorkbenchChat({ agentRole: selectedAgentRole, placeholderId, runId: null });
    setGoal('');
    await startAutopilot({ goal: text, ...directAgentRunOverrides });
  }, [appendWorkbenchAgentChat, directAgentRunOverrides, goal, selectedAgentRole, setGoal, startAutopilot]);

  useEffect(() => {
    if (status === 'queued_local' || status === 'running' || status === 'waiting' || status === 'error') {
      setShowLiveLogs(true);
    }
  }, [status, setShowLiveLogs]);

  useEffect(() => {
    return () => closeStream();
  }, [closeStream]);

  return (
    <WorkbenchShell
      topError={topError}
      statusNotice={shellStatusNotice}
    >
      <div className="orion-workbench-grid" suppressHydrationWarning>
        <ChatSurface
          isMobile={isMobile}
          sessions={chatStore.sessions}
          selectedSessionId={selectedChatSession?.id || null}
          onSelectSession={handleSelectChatSession}
          onNewChat={handleStartNewChat}
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
          chatBusy={Boolean(pendingSimpleChat)}
          messages={selectedChatMessages}
          providerBanner={selectedChatMessages.length === 0 ? simpleChatProviderBanner : null}
          targetLabel={defaultAssistantProfile.label}
          targetHref="/agents"
          selectedModel={model}
          modelOptions={modelOptions}
          modelsLoading={modelsLoading}
          onSelectModel={setModel}
          trustLabel={simpleChatTrustLabel}
          selectedDepth={simpleChatDepth}
          depthLabel={simpleChatDepthLabel}
          depthOptions={CHAT_DEPTH_OPTIONS}
          onSelectDepth={(value) => {
            if (value === 'low' || value === 'medium' || value === 'high') setSimpleChatDepth(value);
          }}
          identityDrawerOpen={chatIdentityDrawerOpen}
          onToggleIdentityDrawer={() => setChatIdentityDrawerOpen((current) => !current)}
          onCloseIdentityDrawer={() => setChatIdentityDrawerOpen(false)}
          identitySections={sessionIdentitySections}
          identityActions={sessionIdentityActions}
          shellNotice={shellTopNotice}
        />
      </div>
    </WorkbenchShell>
    );
}
