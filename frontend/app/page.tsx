'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CoreControlCenter } from '@/components/solutions/CoreControlCenter';
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
import { ORION_API_URL, readResponseMessage, usePlatformApi } from './page.api';
import { usePageActions } from './page.actions';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import { EMPYRALIS_NEW_CHAT_EVENT } from '@/components/orion/PlatformTopBar';
import { ChatSurface, type ChatIdentityAction, type ChatIdentityItem, type ChatIdentitySection } from '@/components/orion/chat/ChatSurface';
import {
  CHAT_SESSION_SELECT_EVENT,
  CHAT_STORE_STORAGE_KEY,
  CHAT_STORE_UPDATED_EVENT,
  createChatId,
  createEmptyChatSession,
  dedupeChatMessages,
  normalizeChatContent,
  sanitizeChatStore,
  upsertSessionMessages,
  type ChatSessionSelectDetail,
  type ChatStoreRecord,
} from '@/components/orion/chat/chatSchema';
import { WorkbenchShell } from '../components/orion/workbench/WorkbenchShell';
import { WorkbenchActivityRail } from '../components/orion/workbench/WorkbenchActivityRail';
import {
  WorkbenchCenterPanel,
  type HomeLiveAgentCard,
  type HomeLiveLocalAction,
  type HomeLiveOverview,
} from '../components/orion/workbench/WorkbenchCenterPanel';
import {
  WorkbenchControlDeck,
  type WorkbenchAgentChatMessage,
  type WorkbenchDeckMode,
  type WorkbenchInspectStreamState,
} from '../components/orion/workbench/WorkbenchControlDeck';
import {
  GLOBAL_COMMAND_EVENT,
  PENDING_GLOBAL_COMMAND_STORAGE_KEY,
  LEGACY_ORION_GLOBAL_COMMAND_EVENT,
  LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY,
  type PlatformGlobalCommandEventDetail,
} from '@/lib/commandRegistry';
import { BRAND } from '@/lib/brand';
import { SINGLE_AGENT_MODE } from '@/lib/appFlags';
import { classifyAutomationIntent, looksLikeCameraSource } from '@/lib/automationIntents';
import { createWorkflow, publishWorkflow } from '@/lib/api';
import { createHotelOnboardingSpace, fetchHotelOnboardingStatus } from '@/lib/hotelVision';

const WORKBENCH_DECK_MODE_STORAGE_KEY = 'orion_workbench_deck_mode_v1';
const WORKBENCH_AGENT_CHAT_STORAGE_KEY = 'orion.workbench.agent.chat.v1';
const WORKBENCH_CHAT_MODE_STORAGE_KEY = 'orion.workbench.chat.mode.v1';
const WORKBENCH_DECK_VISIBLE_STORAGE_KEY = 'orion.workbench.deck.visible.v1';
const WORKBENCH_DECK_SIZE_STORAGE_KEY = 'orion.workbench.deck.size.v1';
const PINNED_AGENT_STORAGE_KEY = 'empyralis.agents.pinned-rail';
const AGENT_CONFIG_STORAGE_KEY = 'empyralis.agents.profile-config.v1';
const DEFAULT_AGENT_PROFILE_STORAGE_KEY = 'empyralis.agents.default-profile.v1';
const WORKBENCH_PRELOAD_QUERY_KEYS = ['pack', 'goal', 'primary', 'secondary', 'tertiary', 'deck'] as const;
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

const ASSISTANT_PROFILE_LIBRARY: AssistantProfileMeta[] = [
  { id: 'support', label: 'Support', subtitle: 'Customer replies, inbox triage, and follow-up', backendRole: 'support' },
  { id: 'research', label: 'Research', subtitle: 'Briefs, analysis, memory, and synthesis', backendRole: 'research' },
  { id: 'builder', label: 'Builder', subtitle: 'Product, coding, design, and automations', backendRole: 'builder' },
  { id: 'crypto-analyst', label: 'Crypto Analyst', subtitle: 'Market research, watchlists, and risk review', backendRole: 'research' },
  { id: 'private-assistant', label: 'Personal', subtitle: 'Planning, study, reminders, and daily organization', backendRole: 'private-assistant' },
  { id: 'custom', label: 'General', subtitle: 'Flexible general assistant for mixed work', backendRole: 'orchestrator' },
];

function normalizeAssistantProfileId(value: unknown): StoredAssistantProfileId {
  return ASSISTANT_PROFILE_LIBRARY.some((item) => item.id === value) ? (value as StoredAssistantProfileId) : 'custom';
}

function getAssistantProfileMeta(profileId: StoredAssistantProfileId): AssistantProfileMeta {
  return ASSISTANT_PROFILE_LIBRARY.find((item) => item.id === profileId) || ASSISTANT_PROFILE_LIBRARY[ASSISTANT_PROFILE_LIBRARY.length - 1];
}

type PendingWorkbenchChat = {
  agentRole: string;
  placeholderId: string;
  runId: string | null;
};

type CameraMonitorSetupState = {
  intent: 'CAMERA_MONITOR' | 'EMAIL_SUMMARY' | 'LEAD_FOLLOWUP';
  stage: 'awaiting_space_name' | 'awaiting_camera_source' | 'awaiting_summary_target' | 'awaiting_followup_target';
  originalPrompt: string;
  spaceName?: string;
};

type WorkbenchAgentChannelBinding = {
  channel?: string;
  identity_label?: string | null;
  label?: string | null;
  status?: string | null;
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
      if (!hasAutoFilledLocalPrompt) return [agentRole, messages];
      return [
        agentRole,
        messages.filter((message) => {
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
  return <CoreControlCenter />;
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
  if (routeKind === 'approval') return 'Approval gate';
  if (routeKind === 'local') return localActionLabel ? `${localActionLabel} via local companion` : 'Local companion';
  return 'Cloud route';
}

function buildHomeStateLabel(
  state: HomeLiveAgentCard['state'],
  routeKind: HomeLiveAgentCard['routeKind'],
  localActionLabel: string | null,
): string {
  if (state === 'waiting') return 'Waiting approval';
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
          'Approval required before work can continue.',
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

  return {
    activeAgentCount: activeKeys.size,
    localQueuePendingCount: Number(queueSummary?.queued_count ?? workerSummary?.pending_runs ?? 0),
    localQueueClaimedCount: Number(queueSummary?.claimed_count ?? workerSummary?.claimed_runs ?? 0),
    workerOnlineCount: Number(workerSummary?.online ?? 0),
    workerBusyCount: Number(workerSummary?.busy ?? 0),
    approvalWaitingCount: pendingApprovals.length,
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
    return 'Local companion';
  }
  if (target === 'browser') return 'Browser';
  if (target === 'desktop') return 'Desktop';
  return 'Cloud runtime';
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
    if (args.connectedTools === 0) {
      return {
        chipText: 'Connect Telegram to activate alerts',
        chipTone: 'warning',
        actionLabel: 'Connect Telegram',
        href: '/credentials?connector=telegram_bot&onboarding=1',
      };
    }
    return {
      chipText: 'Finish setup to run automations',
      chipTone: 'warning',
      actionLabel: 'Open Setup',
      href: '/setup',
    };
  }
  if (!args.runtimeOk) {
    return {
      chipText: 'Check workspace status',
      chipTone: 'warning',
      actionLabel: 'Open Health',
      href: '/health',
    };
  }
  if (args.pendingApprovals > 0) {
    return {
      chipText: `${args.pendingApprovals} approval${args.pendingApprovals === 1 ? '' : 's'} waiting — review now`,
      chipTone: 'warning',
      actionLabel: 'Open Approvals',
      href: '/approvals',
    };
  }
  if (args.connectedTools === 0) {
    return {
      chipText: 'No tools connected — add one',
      chipTone: 'warning',
      actionLabel: 'Open Connections',
      href: '/credentials',
    };
  }
  return {
    chipText: `${args.executionLabel} ready`,
    chipTone: 'success',
    actionLabel: 'Open Control Center',
    href: '/control-center',
  };
}

function extractWorkbenchReplyText(lastRunPayload: Record<string, unknown> | null, latestRunSummary: string | null, topError: string | null, status: string): string {
  const pending = lastRunPayload?.pending_approval;
  if (status === 'waiting' && pending && typeof pending === 'object') {
    const prompt = String((pending as { prompt?: unknown }).prompt || '').trim();
    return prompt ? `Approval required: ${prompt}` : 'This run is waiting for input before continuing.';
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

  if (status === 'error') return 'Run failed. Open inspect for details.';
  return 'Run completed. Open inspect for the full details.';
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

function extractRunIdFromPayload(lastRunPayload: Record<string, unknown> | null): string | null {
  if (!lastRunPayload || typeof lastRunPayload !== 'object') return null;
  const runId = String(lastRunPayload.run_id || '').trim();
  return runId || null;
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

type AutopilotWorkspaceProps = {
  experience: 'simple' | 'advanced';
};

export function AutopilotWorkspace({ experience }: AutopilotWorkspaceProps) {
  const streamRef = useRef<EventSource | null>(null);
  const primaryGoalRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();
  const { accessMode } = usePlatformShell();
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
    model,
    providerOptions,
    connectionMode,
    trustMode,
    setTrustMode,
    status,
    logs,
    runId,
    packResult,
    lastRunPayload,
    topError, setTopError,
    setupStatus,
    showLiveLogs, setShowLiveLogs,
    guidedDefaultsEnabled,
    setGuidedDefaultsEnabled,
    setupHydrated,
    viewportWidth, setViewportWidth,
    runtimeApiKey,
    connectorCredentials,
    credentialId,
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
    buildHeaders,
    closeStream,
    checkCompatibility,
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
  const [pendingSimpleChat, setPendingSimpleChat] = useState<{ sessionId: string; placeholderId: string; runId: string | null } | null>(null);
  const [selectedAgentChannels, setSelectedAgentChannels] = useState<WorkbenchAgentChannelBinding[]>([]);
  const [selectedAgentChannelsLoading, setSelectedAgentChannelsLoading] = useState(false);
  const [cameraMonitorSetupStates, setCameraMonitorSetupStates] = useState<Record<string, CameraMonitorSetupState>>({});
  const [workbenchDeckVisible, setWorkbenchDeckVisible] = useState(true);
  const [workbenchDeckSize, setWorkbenchDeckSize] = useState<'compact' | 'standard' | 'expanded'>('standard');
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
      const storedVisible = window.localStorage.getItem(WORKBENCH_DECK_VISIBLE_STORAGE_KEY);
      if (storedVisible === 'true') setWorkbenchDeckVisible(true);
      if (storedVisible === 'false') setWorkbenchDeckVisible(false);
      const storedSize = window.localStorage.getItem(WORKBENCH_DECK_SIZE_STORAGE_KEY);
      if (storedSize === 'compact' || storedSize === 'standard' || storedSize === 'expanded') {
        setWorkbenchDeckSize(storedSize);
      }
    } catch {
      // ignore storage read failures
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKBENCH_DECK_VISIBLE_STORAGE_KEY, String(workbenchDeckVisible));
      window.localStorage.setItem(WORKBENCH_DECK_SIZE_STORAGE_KEY, workbenchDeckSize);
    } catch {
      // ignore storage write failures
    }
  }, [workbenchDeckSize, workbenchDeckVisible]);

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
      setSelectedWorkbenchRunId(null);
      setWorkbenchAgentChats({});
      setCameraMonitorSetupStates({});
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

  useEffect(() => {
    let cancelled = false;
    const loadSelectedAgentChannels = async () => {
      setSelectedAgentChannelsLoading(true);
      try {
        const headers = new Headers();
        if (runtimeApiKey) headers.set('X-API-Key', runtimeApiKey);
        const res = await fetch(
          `${ORION_API_URL}/agents/workspace/agents/${encodeURIComponent(selectedAgentRole)}?workspace_id=default&history_limit=1&file_limit=1&artifact_limit=1`,
          { headers },
        );
        if (!res.ok) {
          if (!cancelled) setSelectedAgentChannels([]);
          return;
        }
        const payload = await res.json();
        const items = Array.isArray(payload?.channels) ? payload.channels : [];
        if (!cancelled) {
          setSelectedAgentChannels(
            items.map((item: Record<string, unknown>) => ({
              channel: typeof item?.channel === 'string' ? item.channel : undefined,
              identity_label: typeof item?.identity_label === 'string' ? item.identity_label : null,
              label: typeof item?.label === 'string' ? item.label : null,
              status: typeof item?.status === 'string' ? item.status : null,
            })),
          );
        }
      } catch {
        if (!cancelled) setSelectedAgentChannels([]);
      } finally {
        if (!cancelled) setSelectedAgentChannelsLoading(false);
      }
    };
    void loadSelectedAgentChannels();
    return () => {
      cancelled = true;
    };
  }, [runtimeApiKey, selectedAgentRole]);

  const refreshControlCenter = useCallback(async () => {
    try {
      const headers = buildHeaders(false);
      const [snapshotRes, inboxRes] = await Promise.all([
        fetch(
          `${ORION_API_URL}/agents/workspace/snapshot?workspace_id=default&history_limit=12&audit_limit=16`,
          { headers },
        ),
        fetch(
          `${ORION_API_URL}/events/inbox?workspace_id=default&limit=12&include_sessions=1&session_limit=6`,
          { headers },
        ),
      ]);
      if (!snapshotRes.ok) {
        const text = await snapshotRes.text().catch(() => '');
        throw new Error(text || 'Failed to load live workspace snapshot.');
      }
      const payload = (await snapshotRes.json()) as HomeWorkspaceSnapshotPayload;

      const runtimeOk = Boolean(payload.runtime?.ok);
      const authMode =
        typeof payload.runtime?.auth_mode === 'string' && payload.runtime.auth_mode.trim()
          ? payload.runtime.auth_mode.trim()
          : '-';
      const homeOverview = buildHomeLiveOverview(payload);

      const historyItems = Array.isArray(payload.tasks?.recent_runs) ? payload.tasks?.recent_runs : [];
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
          execution_target_selected: String(item?.execution_target_selected || '').trim() || null,
        }))
        .filter((item) => item.run_id);

      const latestRun = recentRuns[0] ?? null;
      const latestRunId = latestRun?.run_id || null;
      const latestRunStatus = latestRun?.status || null;
      const latestRunProvider = latestRun?.usage_provider || null;
      const latestRunSummary = latestRun?.result_summary || null;
      const inboxPayload = inboxRes.ok ? await inboxRes.json().catch(() => null) : null;
      const latestInboxSession = buildHomeInboxSessionPreview(
        Array.isArray(inboxPayload?.sessions) ? (inboxPayload.sessions as HomeInboxSessionPayload[]) : [],
      );

      const pendingApprovalsRaw = Array.isArray(payload.approvals?.pending) ? payload.approvals?.pending : [];
      const pendingApprovals: ControlCenterSnapshot['pendingApprovals'] = pendingApprovalsRaw
        .map((item) => {
          const runId = String(item?.run_id || '').trim();
          const approvalId = String(item?.approval_id || '').trim();
          if (!runId || !approvalId) return null;
          return {
            runId,
            approvalId,
            prompt: String(item?.prompt || 'Approval requested.').trim(),
            labels: Array.isArray(item?.labels) ? item.labels.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
            capabilities: Array.isArray(item?.capabilities) ? item.capabilities.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
            expiresAt: String(item?.expires_at || '').trim() || null,
            status: String(item?.status || 'waiting').trim() || 'waiting',
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const approvalAuditItemsRaw = Array.isArray(payload.approvals?.audit) ? payload.approvals?.audit : [];
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
  }, [buildHeaders]);

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
        const res = await fetch(
          `${ORION_API_URL}/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/resolve`,
          {
            method: 'POST',
            headers: buildHeaders(true),
            body: JSON.stringify({ decision, note: `Resolved from ${BRAND.product} Control Center` }),
          },
        );
        if (!res.ok) {
          const msg = await res.text().catch(() => '');
          throw new Error(msg || 'Failed to resolve approval.');
        }
        appendLog(`Approval ${decision.toLowerCase()} for ${runId.slice(0, 8)}.`);
        void refreshControlCenter();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to resolve approval.';
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
    [appendLog, buildHeaders, refreshControlCenter, setTopError],
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
    if (deckParam === 'context' || deckParam === 'control' || deckParam === 'inspect') {
      setDeckMode(deckParam);
      setWorkbenchDeckVisible(true);
    }
  }, [setGoal, setInboxInput, setLeadsInput, setSelectedPackId, setSlotsInput]);

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

  const experienceMode: 'simple' | 'advanced' = experience;
  const applyExperienceMode = useCallback(
    (mode: 'simple' | 'advanced') => {
      if (mode === 'simple') {
        setWorkbenchChatMode('orchestrate');
        setSelectedAgentRole('orchestrator');
        setDeckMode('context');
      }
      router.push(mode === 'advanced' ? '/workspace' : '/');
    },
    [router, setSelectedAgentRole],
  );

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
    if (experienceMode !== 'simple') return;
    if (workbenchChatMode !== 'orchestrate') setWorkbenchChatMode('orchestrate');
    if (selectedAgentRole !== 'orchestrator') setSelectedAgentRole('orchestrator');
  }, [experienceMode, selectedAgentRole, setSelectedAgentRole, workbenchChatMode]);

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
      singleAgentMode || experienceMode === 'simple' || workbenchChatMode === 'orchestrate'
        ? AGENT_ROLE_OPTIONS.filter((option) => option.id === 'orchestrator')
        : workbenchPinnedAgentRoles.length > 0
          ? AGENT_ROLE_OPTIONS.filter((option) => workbenchPinnedAgentRoles.includes(option.id) && option.id !== 'orchestrator')
          : AGENT_ROLE_OPTIONS.filter((option) => option.id === selectedAgentRole || option.id === DEFAULT_AGENT_ROLE_ID);

    const deduped = source.filter((option, index, array) => array.findIndex((candidate) => candidate.id === option.id) === index);
    return deduped.map((option) => ({
      ...option,
      label: workbenchAgentConfigs[option.id]?.name?.trim() || option.label,
      description: workbenchAgentConfigs[option.id]?.subtitle?.trim() || option.description,
    }));
  }, [experienceMode, selectedAgentRole, singleAgentMode, workbenchAgentConfigs, workbenchPinnedAgentRoles, workbenchChatMode]);

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
  const activeProviderOption = useMemo(
    () => providerOptions.find((item) => item.id === provider) || providerOptions[0] || null,
    [provider, providerOptions],
  );
  const sessionNextRecommendation = useMemo(() => {
    const effectiveExecutionTarget = controlCenter.recentRuns[0]?.execution_target_selected || null;
    const executionLabel = formatChatExecutionLabel(selectedPack.id, connectionMode, effectiveExecutionTarget);
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
  const sessionIdentityItems = useMemo<ChatIdentityItem[]>(() => {
    const readinessLabel = setupReady ? 'Ready' : 'Needs setup';
    const hasTools = connectorCredentials.length > 0;
    const toolsLabel = hasTools ? `${connectorCredentials.length} connected` : 'Connect one';
    return [
      { label: 'Status', value: readinessLabel, tone: setupReady ? 'success' : 'warning' },
      { label: 'Channels', value: toolsLabel, tone: hasTools ? 'success' : 'warning' },
      { label: 'Next step', value: sessionNextRecommendation.actionLabel, tone: sessionNextRecommendation.chipTone },
    ];
  }, [
    connectorCredentials.length,
    sessionNextRecommendation.actionLabel,
    sessionNextRecommendation.chipTone,
    setupReady,
  ]);
  const sessionIdentitySections = useMemo<ChatIdentitySection[]>(() => {
    const providerLabel = activeProviderOption?.label || homeTitleCase(provider);
    const effectiveModel = controlCenter.recentRuns[0]?.usage_model || model || 'Unknown';
    const effectiveExecutionTarget = controlCenter.recentRuns[0]?.execution_target_selected || null;
    const executionLabel = formatChatExecutionLabel(selectedPack.id, connectionMode, effectiveExecutionTarget);
    const latestRun = controlCenter.recentRuns[0] || null;
    const connectedToolsValue =
      connectorCredentials.length > 0
        ? connectorCredentials
            .slice(0, 3)
            .map((item) => item.label)
            .filter(Boolean)
            .join(', ')
        : 'No channels connected yet';

    return [
      {
        title: 'Status',
        note: 'This is the quickest summary of what you can do next.',
        items: [
          { label: 'Status', value: setupReady ? 'Ready to run' : 'One step left', tone: setupReady ? 'success' : 'warning' },
          { label: 'Channels', value: connectedToolsValue, tone: connectorCredentials.length > 0 ? 'success' : 'warning' },
          { label: 'Next step', value: sessionNextRecommendation.actionLabel, tone: sessionNextRecommendation.chipTone },
        ],
      },
      {
        title: 'Assistant',
        note: 'This is who is helping with the current conversation.',
        items: [
          { label: 'Profile', value: defaultAssistantProfile.label },
          { label: 'Provider', value: providerLabel },
          { label: 'Model', value: effectiveModel },
          { label: 'Style', value: defaultAssistantProfile.subtitle },
        ],
      },
      {
        title: 'Recent activity',
        note: 'This shows the latest result and where it went.',
        items: [
          { label: 'Delivery path', value: executionLabel },
          { label: 'Latest run', value: latestRun?.run_id ? latestRun.run_id.slice(0, 8) : 'No activity yet' },
          { label: 'Latest result', value: latestRun?.result_summary || 'Nothing has run yet' },
          { label: 'Latest provider', value: latestRun?.usage_provider || providerLabel },
        ],
      },
    ];
  }, [
    activeProviderOption,
    connectionMode,
    connectorCredentials,
    controlCenter.recentRuns,
    defaultAssistantProfile,
    model,
    provider,
    selectedPack.id,
    sessionNextRecommendation.actionLabel,
    sessionNextRecommendation.chipTone,
    setupReady,
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

      const primaryAction = createAction(sessionNextRecommendation.actionLabel, sessionNextRecommendation.href, 'primary');

      const secondaryActions = [
        createAction('Open Connections', '/credentials'),
        createAction('Open Automations', '/workflows'),
        createAction('Open Approvals', '/approvals'),
      ].filter((item) => item.label !== primaryAction.label);

      return [primaryAction, ...secondaryActions];
    },
    [router, sessionNextRecommendation],
  );
  const simpleChatRunOverrides = useMemo(
    () => ({
      agentRole: simpleChatRuntimeRole,
      metadata: {
        assistant_profile_id: defaultAssistantProfile.id,
        assistant_profile_label: defaultAssistantProfile.label,
        assistant_profile_subtitle: defaultAssistantProfile.subtitle,
      },
    }),
    [defaultAssistantProfile, simpleChatRuntimeRole],
  );
  const selectedWorkbenchAgentChat = useMemo(
    () => workbenchAgentChats[selectedAgentRole] || [],
    [selectedAgentRole, workbenchAgentChats],
  );
  const inlineSimpleChatStatus = useMemo(() => {
    const providerError = [...selectedChatMessages]
      .reverse()
      .find((message) => message.status === 'error' && message.content.toLowerCase().includes('provider profiles path is not writable'));
    if (providerError) return null;
    if (topError && topError.toLowerCase().includes('provider profiles path is not writable')) return null;
    if (!derivedSetupReady) return 'Connect Telegram to activate alerts.';
    return null;
  }, [derivedSetupReady, selectedChatMessages, topError]);
  const inlineSimpleChatAction = useMemo(() => {
    if (derivedSetupReady) return null;
    return {
      label: 'Connect Telegram →',
      href: '/credentials?connector=telegram_bot&onboarding=1',
    };
  }, [derivedSetupReady]);
  const inlineWorkbenchChatStatus = useMemo(() => {
    if (derivedSetupReady) return null;
    return 'Connect Telegram to activate alerts.';
  }, [derivedSetupReady]);
  const inlineWorkbenchChatAction = useMemo(() => {
    if (derivedSetupReady) return null;
    return {
      label: 'Connect Telegram →',
      href: '/credentials?connector=telegram_bot&onboarding=1',
    };
  }, [derivedSetupReady]);

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

  const setCameraMonitorSetupState = useCallback((key: string, next: CameraMonitorSetupState | null) => {
    setCameraMonitorSetupStates((current) => {
      const updated = { ...current };
      if (next) updated[key] = next;
      else delete updated[key];
      return updated;
    });
  }, []);

  const hasTelegramConnector = useMemo(
    () => connectorCredentials.some((item) => item.connector === 'telegram_bot'),
    [connectorCredentials],
  );
  const hasEmailConnector = useMemo(
    () => connectorCredentials.some((item) => item.connector === 'google_workspace' || item.connector === 'microsoft_365'),
    [connectorCredentials],
  );
  const primaryEmailConnector = useMemo(
    () => connectorCredentials.find((item) => item.connector === 'google_workspace' || item.connector === 'microsoft_365') || null,
    [connectorCredentials],
  );

  const createPublishedVisibilityWorkflow = useCallback(async (name: string, description: string, definition: unknown) => {
    const workflow = await createWorkflow(name, description, 'default', definition);
    const workflowId = String((workflow as { id?: unknown })?.id || '').trim();
    if (workflowId) {
      try {
        await publishWorkflow(workflowId);
      } catch {
        // Keep the created workflow even if publish fails.
      }
    }
    return workflowId;
  }, []);

  const buildCameraMonitorWorkflowDefinition = useCallback((spaceName: string) => {
    const safeName = spaceName.trim() || 'Space';
    return {
      nodes: [
        {
          id: 'trigger-schedule',
          type: 'trigger',
          position: { x: 265, y: 50 },
          data: {
            label: 'Scheduled Scan',
            triggerType: 'schedule',
          },
        },
        {
          id: 'agent-vision',
          type: 'agent',
          position: { x: 265, y: 220 },
          data: {
            label: 'Vision Agent',
            modelId: 'gpt-4o',
            prompt: `Monitor ${safeName} and report unusual activity.`,
            tools: ['vision-monitor'],
            provider: 'openai',
            role: 'Vision',
            duty: `Watch ${safeName} and summarize unusual activity clearly.`,
            status: 'ready',
            description: `${safeName} monitoring`,
          },
        },
        {
          id: 'action-telegram',
          type: 'action',
          position: { x: 265, y: 390 },
          data: {
            label: 'Send Telegram',
            actionType: 'send_telegram',
          },
        },
      ],
      edges: [
        { id: 'edge-trigger-agent', source: 'trigger-schedule', target: 'agent-vision', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep' },
        { id: 'edge-agent-action', source: 'agent-vision', target: 'action-telegram', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep' },
      ],
      meta: {
        automationMode: 'scheduled',
        created_from: 'camera_monitor_chat_bridge',
      },
    };
  }, []);

  const createCameraMonitorVisibilityWorkflow = useCallback(async (spaceName: string) => {
    return createPublishedVisibilityWorkflow(
      `Monitor ${spaceName.trim() || 'Space'}`,
      `Camera monitor for ${spaceName.trim() || 'this space'}`,
      buildCameraMonitorWorkflowDefinition(spaceName),
    );
  }, [buildCameraMonitorWorkflowDefinition, createPublishedVisibilityWorkflow]);

  const buildEmailSummaryWorkflowDefinition = useCallback((targetLabel: string) => {
    const safeLabel = targetLabel.trim() || 'Inbox';
    return {
      nodes: [
        {
          id: 'trigger-daily',
          type: 'trigger',
          position: { x: 265, y: 50 },
          data: {
            label: 'Daily Summary',
            triggerType: 'schedule',
          },
        },
        {
          id: 'agent-summary',
          type: 'agent',
          position: { x: 265, y: 220 },
          data: {
            label: 'Inbox Summary',
            modelId: 'gpt-4o',
            prompt: `Summarize important messages from ${safeLabel} and highlight what needs action.`,
            tools: ['email'],
            provider: 'openai',
            role: 'Summary',
            duty: `Review ${safeLabel} and produce a concise daily summary.`,
            status: 'ready',
            description: `${safeLabel} daily summary`,
          },
        },
        {
          id: 'action-summary',
          type: 'action',
          position: { x: 265, y: 390 },
          data: {
            label: hasTelegramConnector ? 'Send Telegram' : 'Write Report',
            actionType: hasTelegramConnector ? 'send_telegram' : 'write_file',
          },
        },
      ],
      edges: [
        { id: 'edge-daily-summary', source: 'trigger-daily', target: 'agent-summary', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep' },
        { id: 'edge-summary-action', source: 'agent-summary', target: 'action-summary', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep' },
      ],
      meta: {
        automationMode: 'scheduled',
        created_from: 'email_summary_chat_bridge',
      },
    };
  }, [hasTelegramConnector]);

  const createEmailSummaryVisibilityWorkflow = useCallback(async (targetLabel: string) => {
    return createPublishedVisibilityWorkflow(
      `Summarize ${targetLabel.trim() || 'Inbox'} Daily`,
      `Daily inbox summary for ${targetLabel.trim() || 'this inbox'}`,
      buildEmailSummaryWorkflowDefinition(targetLabel),
    );
  }, [buildEmailSummaryWorkflowDefinition, createPublishedVisibilityWorkflow]);

  const buildLeadFollowupWorkflowDefinition = useCallback((flowLabel: string) => {
    const safeLabel = flowLabel.trim() || 'Leads';
    const actionType = hasEmailConnector ? 'send_email' : hasTelegramConnector ? 'send_telegram' : 'write_file';
    const actionLabel = hasEmailConnector ? 'Send Email' : hasTelegramConnector ? 'Send Telegram' : 'Write Draft';
    return {
      nodes: [
        {
          id: 'trigger-followup',
          type: 'trigger',
          position: { x: 265, y: 50 },
          data: {
            label: 'Follow-up Review',
            triggerType: 'schedule',
          },
        },
        {
          id: 'agent-followup',
          type: 'agent',
          position: { x: 265, y: 220 },
          data: {
            label: 'Lead Follow-up',
            modelId: 'gpt-4o',
            prompt: `Review ${safeLabel} and draft concise follow-up messages for the leads that need attention.`,
            tools: ['crm'],
            provider: 'openai',
            role: 'Follow-up',
            duty: `Prepare next-step follow-up messages for ${safeLabel}.`,
            status: 'ready',
            description: `${safeLabel} lead follow-up`,
          },
        },
        {
          id: 'action-followup',
          type: 'action',
          position: { x: 265, y: 390 },
          data: {
            label: actionLabel,
            actionType,
          },
        },
      ],
      edges: [
        { id: 'edge-followup-agent', source: 'trigger-followup', target: 'agent-followup', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep' },
        { id: 'edge-followup-action', source: 'agent-followup', target: 'action-followup', sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep' },
      ],
      meta: {
        automationMode: 'scheduled',
        created_from: 'lead_followup_chat_bridge',
      },
    };
  }, [hasEmailConnector, hasTelegramConnector]);

  const createLeadFollowupVisibilityWorkflow = useCallback(async (flowLabel: string) => {
    return createPublishedVisibilityWorkflow(
      `Follow up ${flowLabel.trim() || 'Leads'}`,
      `Lead follow-up automation for ${flowLabel.trim() || 'this lead flow'}`,
      buildLeadFollowupWorkflowDefinition(flowLabel),
    );
  }, [buildLeadFollowupWorkflowDefinition, createPublishedVisibilityWorkflow]);

  const createEmailSummaryExecutionSchedules = useCallback(async (targetLabel: string) => {
    if (!primaryEmailConnector?.id) return 0;
    const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const runRequest = {
      engine: 'orion',
      workspace_id: 'default',
      user_goal: `Summarize the most recent emails from ${targetLabel.trim() || 'this inbox'} and highlight what needs attention.`,
      agent_role: 'support',
      provider,
      model,
      credential_id: connectionMode === 'byok' ? credentialId || undefined : undefined,
      metadata: {
        trust_mode: trustMode,
        source: 'scheduled',
        connection_mode: connectionMode,
        execution_target: 'cloud',
        outcome_pack: 'customer-ops-autopilot',
        outcome_pack_label: 'Client Workflow Autopilot',
        outcome_scope: ['Inbox triage'],
        connector_credential_id: primaryEmailConnector.id,
        pack_inputs: {
          inbox: '',
          leads: '',
          slots: '',
        },
        automation_kind: 'email_summary_recent',
        automation_label: targetLabel.trim() || 'Inbox',
        summary_limit: 5,
      },
    };
    let createdCount = 0;
    for (const day of weekdayNames) {
      const response = await fetch(`${ORION_API_URL}/schedules/weekly`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          name: `Email Summary · ${targetLabel.trim() || 'Inbox'} · ${day}`,
          workspace_id: 'default',
          enabled: true,
          day_of_week: day,
          time_hhmm: '08:00',
          timezone: 'local',
          run_request: runRequest,
        }),
      });
      if (!response.ok) {
        throw new Error(await readResponseMessage(response, 'Failed to create email summary schedule.'));
      }
      createdCount += 1;
    }
    return createdCount;
  }, [primaryEmailConnector?.id, provider, model, connectionMode, credentialId, trustMode, buildHeaders]);

  const createLeadFollowupExecutionSchedules = useCallback(async (flowLabel: string) => {
    if (!primaryEmailConnector?.id) return 0;
    const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const runRequest = {
      engine: 'orion',
      workspace_id: 'default',
      user_goal: `Review the most recent leads from ${flowLabel.trim() || 'this lead flow'} and draft the next outbound follow-ups.`,
      agent_role: 'support',
      provider,
      model,
      credential_id: connectionMode === 'byok' ? credentialId || undefined : undefined,
      metadata: {
        trust_mode: trustMode,
        source: 'scheduled',
        connection_mode: connectionMode,
        execution_target: 'cloud',
        outcome_pack: 'customer-ops-autopilot',
        outcome_pack_label: 'Client Workflow Autopilot',
        outcome_scope: ['Lead follow-up'],
        connector_credential_id: primaryEmailConnector.id,
        pack_inputs: {
          inbox: '',
          leads: '',
          slots: '',
        },
        automation_kind: 'lead_followup_recent',
        automation_label: flowLabel.trim() || 'Leads',
        summary_limit: 5,
      },
    };
    let createdCount = 0;
    for (const day of weekdayNames) {
      const response = await fetch(`${ORION_API_URL}/schedules/weekly`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          name: `Lead Follow-up · ${flowLabel.trim() || 'Leads'} · ${day}`,
          workspace_id: 'default',
          enabled: true,
          day_of_week: day,
          time_hhmm: '09:00',
          timezone: 'local',
          run_request: runRequest,
        }),
      });
      if (!response.ok) {
        throw new Error(await readResponseMessage(response, 'Failed to create lead follow-up schedule.'));
      }
      createdCount += 1;
    }
    return createdCount;
  }, [primaryEmailConnector?.id, provider, model, connectionMode, credentialId, trustMode, buildHeaders]);

  const provisionCameraMonitorFromChat = useCallback(async (spaceName: string, cameraSource: string) => {
    const onboarding = await fetchHotelOnboardingStatus();
    const created = await createHotelOnboardingSpace({
      hotel_name: 'My Property',
      city: 'Unknown',
      timezone: onboarding.default_timezone || 'UTC',
      alert_channel: 'telegram',
      space_name: spaceName.trim(),
      camera_mode: /^data:image\/[a-z0-9.+-]+;base64,/i.test(cameraSource) ? 'upload' : 'ip_camera',
      camera_url: /^(https?|rtsp|rtmps?|rtmp):\/\//i.test(cameraSource) ? cameraSource.trim() : '',
      uploaded_photo_data_url: /^data:image\/[a-z0-9.+-]+;base64,/i.test(cameraSource) ? cameraSource.trim() : '',
      monitoring_modes: ['people count', 'after-hours movement', 'occupancy level'],
      busy_threshold: 15,
      quiet_hours_from: '22:00',
      quiet_hours_to: '06:00',
      scan_cadence_minutes: 5,
    });
    const workflowId = await createCameraMonitorVisibilityWorkflow(spaceName);
    return {
      created,
      workflowId,
    };
  }, [createCameraMonitorVisibilityWorkflow]);

  const buildCameraMonitorCompletionMessage = useCallback(
    (spaceName: string, channelConnected: boolean, workflowId: string | null) => {
      const normalizedName = spaceName.trim() || 'Space';
      const lines = [
        channelConnected ? `Done. Your **${normalizedName}** monitor is active.` : `Done. Your **${normalizedName}** monitor is ready.`,
        '',
        channelConnected ? "You'll get Telegram alerts when anything unusual happens." : 'Connect Telegram to receive alerts.',
        '',
        '[Open Hotel Vision](/solutions/hotel-vision)',
      ];
      if (workflowId) {
        lines.push(`[Open automation](/workflows/${encodeURIComponent(workflowId)})`);
      }
      if (!channelConnected) {
        lines.push('[Connect Telegram to receive alerts →](/credentials?connector=telegram_bot&onboarding=1)');
      }
      return lines.join('\n');
    },
    [],
  );

  const buildEmailSummaryCompletionMessage = useCallback((targetLabel: string, workflowId: string | null, scheduleCount: number) => {
    const safeLabel = targetLabel.trim() || 'Inbox';
    const isActive = scheduleCount > 0;
    const lines = [
      isActive ? `Done. Your **${safeLabel}** daily summary is active.` : `Done. Your **${safeLabel}** daily summary is ready.`,
      '',
      isActive
        ? 'It will run every morning and add results to your activity feed.'
        : hasEmailConnector
          ? 'Finish AI setup to run daily summaries automatically.'
          : 'Connect Google Workspace or Microsoft 365 to start daily summaries.',
      '',
      '[Open automations](/workflows)',
    ];
    if (workflowId) {
      lines.push(`[Open automation](/workflows/${encodeURIComponent(workflowId)})`);
    }
    if (!hasEmailConnector) {
      lines.push('[Connect email →](/credentials)');
    }
    if (hasEmailConnector && !isActive) {
      lines.push('[Finish setup →](/setup)');
    }
    return lines.join('\n');
  }, [hasEmailConnector]);

  const buildLeadFollowupCompletionMessage = useCallback((flowLabel: string, workflowId: string | null, scheduleCount: number) => {
    const safeLabel = flowLabel.trim() || 'Leads';
    const isActive = scheduleCount > 0;
    const lines = [
      isActive ? `Done. Your **${safeLabel}** follow-up automation is active.` : `Done. Your **${safeLabel}** follow-up automation is ready.`,
      '',
      isActive
        ? 'It will review recent leads every morning and prepare outbound follow-ups.'
        : hasEmailConnector
          ? 'Finish AI setup to run follow-ups automatically.'
          : 'Connect an email account to send follow-ups automatically.',
      '',
      '[Open automations](/workflows)',
    ];
    if (workflowId) {
      lines.push(`[Open automation](/workflows/${encodeURIComponent(workflowId)})`);
    }
    if (!hasEmailConnector) {
      lines.push('[Connect email →](/credentials)');
    }
    if (hasEmailConnector && !isActive) {
      lines.push('[Finish setup →](/setup)');
    }
    return lines.join('\n');
  }, [hasEmailConnector]);

  const consumeSimpleCameraMonitorSetup = useCallback(async (sessionId: string, text: string) => {
    const stateKey = `simple:${sessionId}`;
    const activeState = cameraMonitorSetupStates[stateKey];
    const intent = classifyAutomationIntent(text);
    if (!activeState && !['CAMERA_MONITOR', 'EMAIL_SUMMARY', 'LEAD_FOLLOWUP'].includes(intent)) return false;
    const now = new Date().toISOString();
    const userMessage: WorkbenchAgentChatMessage = {
      id: createWorkbenchChatId('user'),
      role: 'user',
      content: text,
      ts: now,
      status: 'completed',
    };
    appendSimpleChatMessage(sessionId, userMessage);
    setGoal('');

    if (!activeState) {
      const nextIntent = intent as CameraMonitorSetupState['intent'];
      if (nextIntent === 'CAMERA_MONITOR') {
        appendSimpleChatMessage(sessionId, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: "I'll set up a camera monitor for you.\n\nWhat should I call this space?\n\n(e.g. Entrance, Reception, Parking)",
          ts: new Date().toISOString(),
          status: 'completed',
        });
        setCameraMonitorSetupState(stateKey, {
          intent: nextIntent,
          stage: 'awaiting_space_name',
          originalPrompt: text,
        });
        return true;
      }
      if (nextIntent === 'EMAIL_SUMMARY') {
        appendSimpleChatMessage(sessionId, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: "I'll set up a daily email summary for you.\n\nWhich inbox should I summarize?\n\n(e.g. Work inbox, Support inbox)",
          ts: new Date().toISOString(),
          status: 'completed',
        });
        setCameraMonitorSetupState(stateKey, {
          intent: nextIntent,
          stage: 'awaiting_summary_target',
          originalPrompt: text,
        });
        return true;
      }
      appendSimpleChatMessage(sessionId, {
        id: createWorkbenchChatId('assistant'),
        role: 'assistant',
        content: "I'll set up lead follow-up for you.\n\nWhat should I call this lead flow?\n\n(e.g. Website leads, Telegram inquiries)",
        ts: new Date().toISOString(),
        status: 'completed',
      });
      setCameraMonitorSetupState(stateKey, {
        intent: nextIntent,
        stage: 'awaiting_followup_target',
        originalPrompt: text,
      });
      return true;
    }

    if (activeState.intent === 'EMAIL_SUMMARY') {
      const targetLabel = text.trim();
      if (!targetLabel) {
        appendSimpleChatMessage(sessionId, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: 'Tell me which inbox you want summarized.',
          ts: new Date().toISOString(),
          status: 'completed',
        });
        return true;
      }
      const placeholderId = createWorkbenchChatId('assistant');
      appendSimpleChatMessage(sessionId, {
        id: placeholderId,
        role: 'assistant',
        content: 'Creating your daily summary automation...',
        ts: new Date().toISOString(),
        status: 'running',
      });
      try {
        const workflowId = await createEmailSummaryVisibilityWorkflow(targetLabel);
        const scheduleCount = hasEmailConnector ? await createEmailSummaryExecutionSchedules(targetLabel) : 0;
        patchSimpleChatMessage(sessionId, placeholderId, {
          content: buildEmailSummaryCompletionMessage(targetLabel, workflowId || null, scheduleCount),
          status: 'completed',
          ts: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create the email summary automation.';
        patchSimpleChatMessage(sessionId, placeholderId, {
          content: `I couldn't finish the setup.\n\n${message}`,
          status: 'error',
          ts: new Date().toISOString(),
        });
      } finally {
        setCameraMonitorSetupState(stateKey, null);
      }
      return true;
    }

    if (activeState.intent === 'LEAD_FOLLOWUP') {
      const flowLabel = text.trim();
      if (!flowLabel) {
        appendSimpleChatMessage(sessionId, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: 'Tell me what you want to call this lead flow.',
          ts: new Date().toISOString(),
          status: 'completed',
        });
        return true;
      }
      const placeholderId = createWorkbenchChatId('assistant');
      appendSimpleChatMessage(sessionId, {
        id: placeholderId,
        role: 'assistant',
        content: 'Creating your follow-up automation...',
        ts: new Date().toISOString(),
        status: 'running',
      });
      try {
        const workflowId = await createLeadFollowupVisibilityWorkflow(flowLabel);
        const scheduleCount = hasEmailConnector ? await createLeadFollowupExecutionSchedules(flowLabel) : 0;
        patchSimpleChatMessage(sessionId, placeholderId, {
          content: buildLeadFollowupCompletionMessage(flowLabel, workflowId || null, scheduleCount),
          status: 'completed',
          ts: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create the lead follow-up automation.';
        patchSimpleChatMessage(sessionId, placeholderId, {
          content: `I couldn't finish the setup.\n\n${message}`,
          status: 'error',
          ts: new Date().toISOString(),
        });
      } finally {
        setCameraMonitorSetupState(stateKey, null);
      }
      return true;
    }

    if (activeState.stage === 'awaiting_space_name') {
      const spaceName = text.trim();
      if (!spaceName) {
        appendSimpleChatMessage(sessionId, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: 'Please send the name you want to use for this space.',
          ts: new Date().toISOString(),
          status: 'completed',
        });
        return true;
      }
      setCameraMonitorSetupState(stateKey, {
        ...activeState,
        stage: 'awaiting_camera_source',
        spaceName,
      });
      appendSimpleChatMessage(sessionId, {
        id: createWorkbenchChatId('assistant'),
        role: 'assistant',
        content: 'Got it. Upload a photo of the space or paste a camera URL to get started.',
        ts: new Date().toISOString(),
        status: 'completed',
      });
      return true;
    }

    if (!looksLikeCameraSource(text)) {
      appendSimpleChatMessage(sessionId, {
        id: createWorkbenchChatId('assistant'),
        role: 'assistant',
        content: 'Paste a camera URL to continue. Example: `rtsp://camera.local/stream`',
        ts: new Date().toISOString(),
        status: 'completed',
      });
      return true;
    }

    const placeholderId = createWorkbenchChatId('assistant');
    appendSimpleChatMessage(sessionId, {
      id: placeholderId,
      role: 'assistant',
      content: 'Setting up your monitor...',
      ts: new Date().toISOString(),
      status: 'running',
    });
    try {
      const result = await provisionCameraMonitorFromChat(activeState.spaceName || 'Space', text.trim());
      patchSimpleChatMessage(sessionId, placeholderId, {
        content: buildCameraMonitorCompletionMessage(activeState.spaceName || 'Space', result.created.channel_connected, result.workflowId || null),
        status: 'completed',
        ts: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set up the camera monitor.';
      patchSimpleChatMessage(sessionId, placeholderId, {
        content: `I couldn't finish the setup.\n\n${message}`,
        status: 'error',
        ts: new Date().toISOString(),
      });
    } finally {
      setCameraMonitorSetupState(stateKey, null);
    }
    return true;
  }, [appendSimpleChatMessage, buildCameraMonitorCompletionMessage, buildEmailSummaryCompletionMessage, buildLeadFollowupCompletionMessage, cameraMonitorSetupStates, createEmailSummaryExecutionSchedules, createEmailSummaryVisibilityWorkflow, createLeadFollowupExecutionSchedules, createLeadFollowupVisibilityWorkflow, hasEmailConnector, patchSimpleChatMessage, provisionCameraMonitorFromChat, setCameraMonitorSetupState, setGoal]);

  const consumeWorkbenchCameraMonitorSetup = useCallback(async (agentRole: string, text: string) => {
    const stateKey = `advanced:${agentRole}`;
    const activeState = cameraMonitorSetupStates[stateKey];
    const intent = classifyAutomationIntent(text);
    if (!activeState && !['CAMERA_MONITOR', 'EMAIL_SUMMARY', 'LEAD_FOLLOWUP'].includes(intent)) return false;
    const now = new Date().toISOString();
    const userMessage: WorkbenchAgentChatMessage = {
      id: createWorkbenchChatId('user'),
      role: 'user',
      content: text,
      ts: now,
      status: 'completed',
    };
    appendWorkbenchAgentChat(agentRole, userMessage);
    setGoal('');

    if (!activeState) {
      const nextIntent = intent as CameraMonitorSetupState['intent'];
      if (nextIntent === 'CAMERA_MONITOR') {
        appendWorkbenchAgentChat(agentRole, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: "I'll set up a camera monitor for you.\n\nWhat should I call this space?\n\n(e.g. Entrance, Reception, Parking)",
          ts: new Date().toISOString(),
          status: 'completed',
        });
        setCameraMonitorSetupState(stateKey, {
          intent: nextIntent,
          stage: 'awaiting_space_name',
          originalPrompt: text,
        });
        return true;
      }
      if (nextIntent === 'EMAIL_SUMMARY') {
        appendWorkbenchAgentChat(agentRole, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: "I'll set up a daily email summary for you.\n\nWhich inbox should I summarize?\n\n(e.g. Work inbox, Support inbox)",
          ts: new Date().toISOString(),
          status: 'completed',
        });
        setCameraMonitorSetupState(stateKey, {
          intent: nextIntent,
          stage: 'awaiting_summary_target',
          originalPrompt: text,
        });
        return true;
      }
      appendWorkbenchAgentChat(agentRole, {
        id: createWorkbenchChatId('assistant'),
        role: 'assistant',
        content: "I'll set up lead follow-up for you.\n\nWhat should I call this lead flow?\n\n(e.g. Website leads, Telegram inquiries)",
        ts: new Date().toISOString(),
        status: 'completed',
      });
      setCameraMonitorSetupState(stateKey, {
        intent: nextIntent,
        stage: 'awaiting_followup_target',
        originalPrompt: text,
      });
      return true;
    }

    if (activeState.intent === 'EMAIL_SUMMARY') {
      const targetLabel = text.trim();
      if (!targetLabel) {
        appendWorkbenchAgentChat(agentRole, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: 'Tell me which inbox you want summarized.',
          ts: new Date().toISOString(),
          status: 'completed',
        });
        return true;
      }
      const placeholderId = createWorkbenchChatId('assistant');
      appendWorkbenchAgentChat(agentRole, {
        id: placeholderId,
        role: 'assistant',
        content: 'Creating your daily summary automation...',
        ts: new Date().toISOString(),
        status: 'running',
      });
      try {
        const workflowId = await createEmailSummaryVisibilityWorkflow(targetLabel);
        const scheduleCount = hasEmailConnector ? await createEmailSummaryExecutionSchedules(targetLabel) : 0;
        patchWorkbenchAgentChat(agentRole, placeholderId, {
          content: buildEmailSummaryCompletionMessage(targetLabel, workflowId || null, scheduleCount),
          status: 'completed',
          ts: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create the email summary automation.';
        patchWorkbenchAgentChat(agentRole, placeholderId, {
          content: `I couldn't finish the setup.\n\n${message}`,
          status: 'error',
          ts: new Date().toISOString(),
        });
      } finally {
        setCameraMonitorSetupState(stateKey, null);
      }
      return true;
    }

    if (activeState.intent === 'LEAD_FOLLOWUP') {
      const flowLabel = text.trim();
      if (!flowLabel) {
        appendWorkbenchAgentChat(agentRole, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: 'Tell me what you want to call this lead flow.',
          ts: new Date().toISOString(),
          status: 'completed',
        });
        return true;
      }
      const placeholderId = createWorkbenchChatId('assistant');
      appendWorkbenchAgentChat(agentRole, {
        id: placeholderId,
        role: 'assistant',
        content: 'Creating your follow-up automation...',
        ts: new Date().toISOString(),
        status: 'running',
      });
      try {
        const workflowId = await createLeadFollowupVisibilityWorkflow(flowLabel);
        const scheduleCount = hasEmailConnector ? await createLeadFollowupExecutionSchedules(flowLabel) : 0;
        patchWorkbenchAgentChat(agentRole, placeholderId, {
          content: buildLeadFollowupCompletionMessage(flowLabel, workflowId || null, scheduleCount),
          status: 'completed',
          ts: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create the lead follow-up automation.';
        patchWorkbenchAgentChat(agentRole, placeholderId, {
          content: `I couldn't finish the setup.\n\n${message}`,
          status: 'error',
          ts: new Date().toISOString(),
        });
      } finally {
        setCameraMonitorSetupState(stateKey, null);
      }
      return true;
    }

    if (activeState.stage === 'awaiting_space_name') {
      const spaceName = text.trim();
      if (!spaceName) {
        appendWorkbenchAgentChat(agentRole, {
          id: createWorkbenchChatId('assistant'),
          role: 'assistant',
          content: 'Please send the name you want to use for this space.',
          ts: new Date().toISOString(),
          status: 'completed',
        });
        return true;
      }
      setCameraMonitorSetupState(stateKey, {
        ...activeState,
        stage: 'awaiting_camera_source',
        spaceName,
      });
      appendWorkbenchAgentChat(agentRole, {
        id: createWorkbenchChatId('assistant'),
        role: 'assistant',
        content: 'Got it. Upload a photo of the space or paste a camera URL to get started.',
        ts: new Date().toISOString(),
        status: 'completed',
      });
      return true;
    }

    if (!looksLikeCameraSource(text)) {
      appendWorkbenchAgentChat(agentRole, {
        id: createWorkbenchChatId('assistant'),
        role: 'assistant',
        content: 'Paste a camera URL to continue. Example: `rtsp://camera.local/stream`',
        ts: new Date().toISOString(),
        status: 'completed',
      });
      return true;
    }

    const placeholderId = createWorkbenchChatId('assistant');
    appendWorkbenchAgentChat(agentRole, {
      id: placeholderId,
      role: 'assistant',
      content: 'Setting up your monitor...',
      ts: new Date().toISOString(),
      status: 'running',
    });
    try {
      const result = await provisionCameraMonitorFromChat(activeState.spaceName || 'Space', text.trim());
      patchWorkbenchAgentChat(agentRole, placeholderId, {
        content: buildCameraMonitorCompletionMessage(activeState.spaceName || 'Space', result.created.channel_connected, result.workflowId || null),
        status: 'completed',
        ts: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set up the camera monitor.';
      patchWorkbenchAgentChat(agentRole, placeholderId, {
        content: `I couldn't finish the setup.\n\n${message}`,
        status: 'error',
        ts: new Date().toISOString(),
      });
    } finally {
      setCameraMonitorSetupState(stateKey, null);
    }
    return true;
  }, [appendWorkbenchAgentChat, buildCameraMonitorCompletionMessage, buildEmailSummaryCompletionMessage, buildLeadFollowupCompletionMessage, cameraMonitorSetupStates, createEmailSummaryExecutionSchedules, createEmailSummaryVisibilityWorkflow, createLeadFollowupExecutionSchedules, createLeadFollowupVisibilityWorkflow, hasEmailConnector, patchWorkbenchAgentChat, provisionCameraMonitorFromChat, setCameraMonitorSetupState, setGoal]);

  const runWorkbenchCommand = useCallback(async (input?: string) => {
    const raw = String(input ?? goal).trim();
    if (!raw) return;
    const command = raw.toLowerCase();
    setGoal('');

    if (!raw.startsWith('/')) {
      if (await consumeWorkbenchCameraMonitorSetup(selectedAgentRole, raw)) {
        return;
      }
      setGoal(raw);
      if (!derivedSetupReady) {
        setTopError(null);
        return;
      }
      setDeckMode('inspect');
      window.setTimeout(() => {
        void startAutopilot();
      }, 0);
      return;
    }

    if (command === '/setup') {
      router.push('/setup');
      return;
    }
    if (command === '/skills' || command === '/extensions') {
      router.push('/skills');
      return;
    }
    if (command === '/integrations' || command === '/credentials' || command === '/channels') {
      router.push('/credentials');
      return;
    }
    if (command === '/agents' || command === '/assistant') {
      router.push('/agents');
      return;
    }
    if (command === '/workflows' || command === '/automations') {
      router.push('/workflows');
      return;
    }
    if (command === '/runs' || command === '/executions' || command === '/history') {
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
          ? 'Commands: /run <goal>, /run, /setup, /assistant, /automations, /runs, /approvals, /integrations, /health.'
          : 'Commands: /run <goal>, /run, /setup, /agents, /automations, /runs, /approvals, /integrations, /health.',
      );
      return;
    }
    if (command === '/run' || command.startsWith('/run ')) {
      const nextGoal = command.startsWith('/run ') ? raw.slice(5).trim() : '';
      if (nextGoal) {
        setGoal(nextGoal);
      }
      const commandSetupReady = Boolean(
        setupStatus?.runtimeReady && setupStatus?.accountConnected && setupStatus?.connectionTested,
      );
      if (!commandSetupReady) {
        setTopError(null);
        return;
      }
      window.setTimeout(() => {
        void startAutopilot();
      }, 0);
      return;
    }
    setTopError('Unknown command. Try /help.');
  }, [consumeWorkbenchCameraMonitorSetup, derivedSetupReady, goal, router, selectedAgentRole, setGoal, setTopError, setupStatus, singleAgentMode, startAutopilot]);

  useEffect(() => {
    const handleGlobalCommandDetail = (detail: PlatformGlobalCommandEventDetail | undefined) => {
      if (!detail) return;

      if (detail.type === 'focus_command') {
        if (primaryGoalRef.current) {
          primaryGoalRef.current.focus();
          primaryGoalRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return;
      }

      if (detail.type === 'focus_goal') {
        if (primaryGoalRef.current) {
          primaryGoalRef.current.focus();
          primaryGoalRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return;
      }

      if (detail.type === 'run_autopilot') {
        if (!derivedSetupReady) {
          setTopError(null);
          return;
        }
        void startAutopilot(experienceMode === 'simple' ? simpleChatRunOverrides : undefined);
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
  }, [derivedSetupReady, experienceMode, router, setTopError, simpleChatRunOverrides, startAutopilot]);

  useEffect(() => {
    if (!pendingSimpleChat) return;
    if (!pendingSimpleChat.runId && runId && ['running', 'queued_local', 'waiting'].includes(status)) {
      setPendingSimpleChat((current) => (current ? { ...current, runId } : current));
      patchSimpleChatMessage(pendingSimpleChat.sessionId, pendingSimpleChat.placeholderId, {
        run_id: runId,
        status: status === 'waiting' ? 'waiting' : status === 'error' ? 'error' : 'running',
      });
    }
  }, [patchSimpleChatMessage, pendingSimpleChat, runId, status]);

  useEffect(() => {
    if (!pendingSimpleChat) return;
    if (!pendingSimpleChat.runId) return;
    if (!['completed', 'waiting', 'error'].includes(status)) return;
    const payloadRunId = extractRunIdFromPayload(lastRunPayload);
    const isMatchingRun =
      (payloadRunId && payloadRunId === pendingSimpleChat.runId) ||
      ((!payloadRunId || status === 'waiting') && runId === pendingSimpleChat.runId);
    if (!isMatchingRun) return;

    const replyText = extractWorkbenchReplyText(lastRunPayload, controlCenter.latestRunSummary, topError, status);
    patchSimpleChatMessage(pendingSimpleChat.sessionId, pendingSimpleChat.placeholderId, {
      content: replyText,
      status: resolveWorkbenchMessageStatus(status, lastRunPayload, controlCenter.latestRunSummary),
      run_id: pendingSimpleChat.runId || runId,
      ts: new Date().toISOString(),
    });
    setPendingSimpleChat(null);
  }, [controlCenter.latestRunSummary, lastRunPayload, patchSimpleChatMessage, pendingSimpleChat, runId, status, topError]);

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

    const replyText = extractWorkbenchReplyText(lastRunPayload, controlCenter.latestRunSummary, topError, status);
    patchWorkbenchAgentChat(pendingWorkbenchChat.agentRole, pendingWorkbenchChat.placeholderId, {
      content: replyText,
      status: resolveWorkbenchMessageStatus(status, lastRunPayload, controlCenter.latestRunSummary),
      run_id: pendingWorkbenchChat.runId || runId,
      ts: new Date().toISOString(),
    });
    setPendingWorkbenchChat(null);
  }, [controlCenter.latestRunSummary, lastRunPayload, patchWorkbenchAgentChat, pendingWorkbenchChat, runId, status, topError]);

  const sendSimpleChat = useCallback(async () => {
    const text = goal.trim();
    const sessionId = selectedChatSession?.id;
    if (!text || !sessionId) return;
    if (await consumeSimpleCameraMonitorSetup(sessionId, text)) {
      return;
    }
    if (!derivedSetupReady) {
      setTopError(null);
      return;
    }
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
      content: 'Working on it...',
      ts: now,
      status: 'sending',
      run_id: null,
    };

    appendSimpleChatMessage(sessionId, userMessage);
    appendSimpleChatMessage(sessionId, placeholder);
    setPendingSimpleChat({ sessionId, placeholderId, runId: null });
    setGoal('');
    await startAutopilot({ goal: text, ...simpleChatRunOverrides });
  }, [appendSimpleChatMessage, consumeSimpleCameraMonitorSetup, derivedSetupReady, goal, selectedChatSession?.id, setGoal, setTopError, simpleChatRunOverrides, startAutopilot]);

  const sendWorkbenchAgentChat = useCallback(async () => {
    const text = goal.trim();
    if (!text) return;
    if (await consumeWorkbenchCameraMonitorSetup(selectedAgentRole, text)) {
      return;
    }
    if (!derivedSetupReady) {
      setTopError(null);
      return;
    }
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
    await startAutopilot({ goal: text });
  }, [appendWorkbenchAgentChat, consumeWorkbenchCameraMonitorSetup, derivedSetupReady, goal, selectedAgentRole, setGoal, setTopError, startAutopilot]);

  useEffect(() => {
    if (status === 'queued_local' || status === 'running' || status === 'waiting' || status === 'error') {
      setShowLiveLogs(true);
    }
  }, [status, setShowLiveLogs]);

  useEffect(() => {
    return () => closeStream();
  }, [closeStream]);

  const deckColumnWidth = workbenchDeckSize === 'compact' ? 336 : workbenchDeckSize === 'expanded' ? 448 : 392;
  const showActivityRail = experienceMode === 'advanced';
  const showControlDeck = experienceMode === 'advanced' ? (isMobile ? true : workbenchDeckVisible) : false;
  const workbenchColumns = isMobile
    ? '1fr'
    : showActivityRail && showControlDeck
      ? isNarrow
        ? '296px minmax(0, 1fr)'
        : `296px minmax(0, 1fr) ${deckColumnWidth}px`
      : showActivityRail
        ? '296px minmax(0, 1fr)'
        : showControlDeck
          ? `minmax(0, 1fr) ${deckColumnWidth}px`
          : 'minmax(0, 1fr)';
  const approvalItems = controlCenter.pendingApprovals.slice(0, 6);
  const approvalAuditItems = controlCenter.approvalAudit.slice(0, 10);
  const inspectLogs = logs.slice(-80);
  const inspectStreamState: WorkbenchInspectStreamState = (() => {
    if (!runId) return controlCenter.latestRunId ? 'closed' : 'idle';
    if (status === 'running' || status === 'queued_local' || status === 'waiting') {
      const recent = logs.slice(-6);
      const hasStreamDisconnect = recent.some((entry) =>
        String(entry.message || '').toLowerCase().includes('stream disconnected'),
      );
      return hasStreamDisconnect ? 'reconnecting' : 'live';
    }
    return 'closed';
  })();
  const selectedWorkbenchRun = controlCenter.recentRuns.find((item) => item.run_id === selectedWorkbenchRunId) ?? null;
  const applyWorkbenchAgentSelection = useCallback((role: AgentRoleId) => {
    if (singleAgentMode) {
      setWorkbenchChatMode('orchestrate');
      setSelectedAgentRole('orchestrator');
      setDeckMode('context');
      return;
    }
    if (experienceMode === 'simple') {
      setWorkbenchChatMode('orchestrate');
      setSelectedAgentRole('orchestrator');
      setDeckMode('context');
      return;
    }
    if (role === 'orchestrator') {
      setWorkbenchChatMode('orchestrate');
    } else {
      setWorkbenchChatMode('direct');
    }
    setSelectedAgentRole(role);
    setDeckMode('context');
  }, [experienceMode, setSelectedAgentRole, singleAgentMode]);
  return (
    <WorkbenchShell
      topError={topError}
      chatMode={workbenchChatMode}
      onChatModeChange={(mode) => {
        if ((singleAgentMode || experienceMode === 'simple') && mode !== 'orchestrate') return;
        setWorkbenchChatMode(mode);
        if (mode === 'orchestrate') setSelectedAgentRole('orchestrator');
        setDeckMode('context');
      }}
      experienceMode={experienceMode}
      onExperienceModeChange={applyExperienceMode}
      deckVisible={workbenchDeckVisible}
      onDeckVisibleChange={setWorkbenchDeckVisible}
      deckControlsEnabled={!isMobile}
      singleAgentMode={singleAgentMode}
    >
      <div style={{ display: 'grid', gridTemplateColumns: workbenchColumns, gap: 10, alignItems: 'start', alignContent: 'start' }}>
        {showActivityRail ? (
          <WorkbenchActivityRail
            isMobile={isMobile}
            chatMode={workbenchChatMode}
            singleAgentMode={singleAgentMode}
            selectedAgentRole={selectedAgentRole}
            onAgentRoleChange={applyWorkbenchAgentSelection}
            agentRoleOptions={workbenchAgentRoleOptions}
            selectedAgentChannels={selectedAgentChannels}
            selectedAgentChannelsLoading={selectedAgentChannelsLoading}
            pendingApprovals={approvalItems.length}
            runtimeOk={controlCenter.runtimeOk}
          />
        ) : null}
        {experienceMode === 'simple' ? (
          <ChatSurface
            isMobile={isMobile}
            goal={goal}
            setGoal={setGoal}
            primaryGoalRef={primaryGoalRef}
            onSend={() => {
              void sendSimpleChat();
            }}
            chatBusy={Boolean(pendingSimpleChat)}
            messages={selectedChatMessages}
            inlineStatus={inlineSimpleChatStatus}
            inlineAction={inlineSimpleChatAction}
            emptyStateSuggestions={[
              'Monitor a camera',
              'Summarize emails daily',
              'Alert me on Telegram',
              'Follow up with leads',
            ]}
            identityItems={sessionIdentityItems}
            identityDrawerOpen={chatIdentityDrawerOpen}
            onToggleIdentityDrawer={() => setChatIdentityDrawerOpen((current) => !current)}
            onCloseIdentityDrawer={() => setChatIdentityDrawerOpen(false)}
            identitySections={sessionIdentitySections}
            identityActions={sessionIdentityActions}
          />
        ) : (
          <WorkbenchCenterPanel
            isMobile={isMobile}
            isTablet={isTablet}
            experienceMode={experienceMode}
            chatMode={workbenchChatMode}
            singleAgentMode={singleAgentMode}
            selectedAgent={selectedAgent}
            goal={goal}
            setGoal={(value) => setGoal(value)}
            primaryGoalRef={primaryGoalRef}
            onSendChat={() => {
              void sendWorkbenchAgentChat();
            }}
            onRunCommand={() => {
              void runWorkbenchCommand();
            }}
            setupReady={setupReady}
            hasConnectedTools={connectorCredentials.length > 0}
            onRequireSetup={() => {
              setTopError(null);
            }}
            setupGuidanceStatus={inlineWorkbenchChatStatus}
            setupGuidanceAction={inlineWorkbenchChatAction}
            chatBusy={Boolean(pendingWorkbenchChat)}
            chatMessages={selectedWorkbenchAgentChat}
            workerOnline={controlCenter.workerOnline}
            workerPending={controlCenter.workerPending}
            latestRunSummary={controlCenter.latestRunSummary}
            autonomyStages={autonomyStages}
            logs={logs}
            showLiveLogs={showLiveLogs}
            setShowLiveLogs={setShowLiveLogs}
            runId={runId}
            runReceipt={runReceipt}
            copyRunReceipt={copyRunReceipt}
            packResult={packResult}
            executionSummary={executionSummary}
            riskColor={riskColor}
            trustMode={trustMode}
            copyResultSummary={copyResultSummary}
            exportRunJson={exportRunJson}
            createFollowUpTask={createFollowUpTask}
            approvalItems={approvalItems}
            approvalActionBusy={approvalActionBusy}
            onResolvePendingApproval={(runId, approvalId, decision) => {
              void resolvePendingApproval(runId, approvalId, decision);
            }}
            approvalAuditItems={approvalAuditItems}
            recentRuns={controlCenter.recentRuns}
            selectedRunId={selectedWorkbenchRunId}
            onSelectRun={(targetRunId) => {
              setSelectedWorkbenchRunId(targetRunId);
              setDeckMode('inspect');
            }}
            onOpenRun={(targetRunId) => {
              router.push(`/runs/${encodeURIComponent(targetRunId)}/inspect`);
            }}
            onOpenRunOutput={(targetRunId) => {
              router.push(`/runs/${encodeURIComponent(targetRunId)}/inspect?focus=artifacts`);
            }}
            onOpenRunsPage={() => {
              router.push('/executions');
            }}
            onOpenApprovalsPage={() => {
              router.push('/approvals');
            }}
            homeOverview={controlCenter.homeOverview}
            latestInboxSession={controlCenter.latestInboxSession}
          />
        )}

        {showControlDeck ? (
          <WorkbenchControlDeck
            isMobile={isMobile}
            isNarrow={isNarrow}
            mode={deckMode}
            onModeChange={setDeckMode}
            chatMode={workbenchChatMode}
            singleAgentMode={singleAgentMode}
            selectedAgentRole={selectedAgentRole}
            agentRoleOptions={workbenchAgentRoleOptions}
            status={status}
            runId={runId}
            selectedRun={selectedWorkbenchRun}
            latestRunId={controlCenter.latestRunId}
            latestRunSummary={controlCenter.latestRunSummary}
            pendingApprovals={approvalItems.length}
            inspectLogs={inspectLogs}
            inspectStreamState={inspectStreamState}
            onOpenRunInspect={(targetRunId) => {
              router.push(`/runs/${encodeURIComponent(targetRunId)}/inspect?focus=artifacts`);
            }}
            selectedAgentChannels={selectedAgentChannels}
            selectedAgentChannelsLoading={selectedAgentChannelsLoading}
            selectedPackId={selectedPack.id}
            onPackChange={(nextId) => {
              setSelectedPackId(nextId);
            }}
            packOptions={OUTCOME_PACKS}
            connectorCredentials={connectorCredentials}
            runtimeApiKey={runtimeApiKey}
            packPrimaryInput={inboxInput}
            onPackPrimaryInputChange={setInboxInput}
            packSecondaryInput={leadsInput}
            onPackSecondaryInputChange={setLeadsInput}
            packTertiaryInput={slotsInput}
            onPackTertiaryInputChange={setSlotsInput}
            selectedPresetId={selectedPreset.id}
            presetOptions={BUSINESS_PRESETS}
            onApplyPreset={applyStarterTemplate}
            localExecutionDraft={localExecutionDraft}
            onLocalExecutionDraftChange={(updater) => setLocalExecutionDraft((prev) => updater(prev))}
          />
        ) : null}
      </div>
    </WorkbenchShell>
    );
}
