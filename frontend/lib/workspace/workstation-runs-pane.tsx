'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { EmptyPanel } from '@/lib/ui/empty-panel';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationActivityVersion } from '@/lib/workspace/workspace-services';
import {
  WorkstationSurfaceCard,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type ThreadTurnRecord = Record<string, unknown> & {
  role?: string | null;
  content?: string | null;
  created_at?: string | null;
};

type ThreadRecord = Record<string, unknown> & {
  id?: string | null;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_turn_at?: string | null;
  turns?: ThreadTurnRecord[] | null;
};

type ThreadListItem = {
  id: string;
  preview: string;
  occurredAt: string | null;
};

type ActivityProofType = 'chat' | 'tool' | 'approval' | 'channel' | 'gateway' | 'provider' | 'file' | 'outcome';

type ActivityProofItem = {
  id: string;
  type: ActivityProofType;
  title: string;
  summary: string;
  occurredAt: string | null;
  source: string;
  threadId: string | null;
  traceId: string | null;
  adminAudit: {
    rawProvider: string | null;
    rawModel: string | null;
    fallbackProvider: string | null;
    fallbackModel: string | null;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    runtimeDurationSeconds: number | null;
    ledgerItemIds: string[];
  } | null;
};

type ActivityFilterId = 'all' | ActivityProofType;

type PilotProofSnapshot = {
  status: string;
  adsReady: boolean;
  pilotUsers: number;
  messagesHandled: number;
  tasksCompleted: number;
  failureRate: number;
  approvalRate: number;
  usefulnessScore: number | null;
  missingEvidence: string[];
  unresolvedIssueCount: number;
  evidenceTraceIds: string[];
  caseStudyStatus: string;
  investorMemoStatus: string;
  adsReasons: string[];
};

const ACTIVE_THREAD_STORAGE_PREFIX = 'empyralis.chat.active-thread.v1';
const HISTORY_PAGE_SIZE = 50;
const threadsPaneCache = new Map<string, ThreadListItem[]>();
const activityPaneCache = new Map<string, ActivityProofItem[]>();
const pilotProofPaneCache = new Map<string, PilotProofSnapshot | null>();

const ACTIVITY_FILTERS: Array<{ id: ActivityFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'chat', label: 'Chat' },
  { id: 'tool', label: 'Tools' },
  { id: 'approval', label: 'Approvals' },
  { id: 'channel', label: 'Channels' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'provider', label: 'Providers' },
  { id: 'file', label: 'Files' },
  { id: 'outcome', label: 'Outcomes' },
];

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringList(value: unknown): string[] {
  return readList(value).map((item) => readString(item)).filter(Boolean);
}

function activeThreadStorageKey(workspaceId: string): string {
  return `${ACTIVE_THREAD_STORAGE_PREFIX}:${workspaceId}`;
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
    // Ignore storage failures in constrained environments.
  }
}

function readPersistedActiveThread(workspaceId: string): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const value = window.localStorage.getItem(activeThreadStorageKey(workspaceId));
    const threadId = readString(value);
    return threadId || null;
  } catch {
    return null;
  }
}

function normalizeThreadItems(payload: unknown): ThreadRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is ThreadRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeRecordItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function parseTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isPlaceholderTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized === '' || normalized === 'new chat' || normalized === 'chat' || normalized === 'primary thread';
}

function compactHumanText(value: unknown, fallback: string): string {
  const text = readString(value, fallback).replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }
  if (/^\s*[{[]/.test(text) || /activity_event_id|trace_id|raw_|stacktrace|debug/i.test(text)) {
    return fallback;
  }
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}...` : text;
}

function threadPreviewLabel(thread: ThreadRecord): string {
  const title = readString(thread.title);
  if (title && !isPlaceholderTitle(title)) {
    return title;
  }
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const firstUserTurn = turns.find((turn) => readString(turn.role).toLowerCase() === 'user');
  const firstContent = readString(firstUserTurn?.content);
  if (firstContent) {
    return firstContent;
  }
  return title || 'Conversation';
}

function eventProofType(event: Record<string, unknown>): ActivityProofType {
  const eventClass = readString(event.event_class).toLowerCase();
  const action = readString(event.action).toLowerCase();
  const channel = readString(event.channel).toLowerCase();
  const status = readString(event.status).toLowerCase();
  const text = `${eventClass} ${action} ${channel} ${readString(event.title)} ${readString(event.summary)}`.toLowerCase();

  if (eventClass.includes('approval') || eventClass.includes('blocked') || action.includes('approval')) {
    return 'approval';
  }
  if (channel || /telegram|whatsapp|gmail|email|signal|slack|discord/.test(text)) {
    return 'channel';
  }
  if (/gateway|reconnect|pairing|device|companion/.test(text)) {
    return 'gateway';
  }
  if (/provider|model|deepseek|gemini|openai|anthropic|ollama|quota|credit/.test(text)) {
    return 'provider';
  }
  if (/file|shell|browser|screenshot|clipboard|artifact/.test(text)) {
    return /file/.test(text) ? 'file' : 'tool';
  }
  if (eventClass.includes('run_status') || status === 'completed' || status === 'failed' || /done|completed|failed|final/.test(text)) {
    return 'outcome';
  }
  return 'tool';
}

function eventTitle(type: ActivityProofType, event: Record<string, unknown>): string {
  const explicit = compactHumanText(event.title, '');
  if (explicit) {
    return explicit;
  }
  const action = readString(event.action).replace(/_/g, ' ');
  const channel = readString(event.channel);
  if (channel) {
    return `${channel.charAt(0).toUpperCase()}${channel.slice(1)} activity`;
  }
  if (action) {
    return action.charAt(0).toUpperCase() + action.slice(1);
  }
  const fallbackByType: Record<ActivityProofType, string> = {
    chat: 'Conversation',
    tool: 'Tool activity',
    approval: 'Approval decision',
    channel: 'Channel activity',
    gateway: 'Gateway activity',
    provider: 'Provider activity',
    file: 'File activity',
    outcome: 'Final outcome',
  };
  return fallbackByType[type];
}

function eventSummary(type: ActivityProofType, event: Record<string, unknown>): string {
  const fallbackByType: Record<ActivityProofType, string> = {
    chat: 'Conversation activity was recorded.',
    tool: 'A governed tool action was recorded.',
    approval: 'A user approval or blocked action was recorded.',
    channel: 'A communication channel action was recorded.',
    gateway: 'This Computer connection activity was recorded.',
    provider: 'AI provider state changed or failed.',
    file: 'A file, shell, or browser action was recorded.',
    outcome: 'A run or task reached an outcome.',
  };
  const summary = compactHumanText(event.summary, fallbackByType[type]);
  const status = readString(event.status).replace(/_/g, ' ');
  return status ? `${summary} · ${status}` : summary;
}

function proofItemsFromActivity(payload: unknown): ActivityProofItem[] {
  return normalizeRecordItems(payload).map((event, index) => {
    const type = eventProofType(event);
    const visibleProof = readRecord(event.visible_activity);
    const proofSummary = buildVisibleActivitySummary(visibleProof);
    const adminAudit = normalizeAdminAudit(readRecord(event.admin_audit));
    return {
      id: readString(event.id, `activity-${index}`),
      type,
      title: eventTitle(type, event),
      summary: proofSummary || eventSummary(type, event),
      occurredAt: readString(event.created_at) || readString(event.ts) || null,
      source: 'Activity',
      threadId: readString(event.thread_id) || null,
      traceId: readString(event.trace_id) || readString(adminAudit?.ledgerItemIds?.[0]) || null,
      adminAudit,
    };
  });
}

function proofItemsFromThreads(threads: ThreadRecord[]): ActivityProofItem[] {
  return toThreadListItems(threads).map((thread) => ({
    id: `chat-${thread.id}`,
    type: 'chat',
    title: 'Chat history',
    summary: thread.preview,
    occurredAt: thread.occurredAt,
    source: 'Chat',
    threadId: thread.id,
      traceId: null,
    adminAudit: null,
  }));
}

function proofItemsFromRuns(payload: unknown): ActivityProofItem[] {
  return normalizeRecordItems(payload).map((run, index) => {
    const status = readString(run.status, 'recorded').replace(/_/g, ' ');
    const title = readString(run.title) || readString(run.name) || readString(run.kind);
    const summary = readString(run.summary) || readString(run.result_summary) || readString(run.error);
    const adminAudit = normalizeRunAudit(run);
    return {
      id: `run-${readString(run.id, String(index))}`,
      type: status === 'completed' || status === 'failed' ? 'outcome' : 'tool',
      title: compactHumanText(title, 'Run recorded'),
      summary: compactHumanText(summary, `Run status: ${status}`),
      occurredAt: readString(run.updated_at) || readString(run.created_at) || null,
      source: 'Run',
      threadId: readString(run.thread_id) || null,
      traceId: readString(run.trace_id) || null,
      adminAudit,
    };
  });
}

function proofItemsFromApprovals(payload: unknown): ActivityProofItem[] {
  return normalizeRecordItems(payload).map((approval, index) => {
    const id = readString(approval.approval_id) || readString(approval.id, String(index));
    const summary = readString(approval.prompt) || readString(approval.summary) || readString(approval.reason);
    return {
      id: `approval-${id}`,
      type: 'approval',
      title: 'Needs your OK',
      summary: compactHumanText(summary, 'A request is waiting for approval.'),
      occurredAt: readString(approval.created_at) || readString(approval.updated_at) || null,
      source: 'Approval',
      threadId: readString(approval.thread_id) || null,
      traceId: readString(approval.trace_id) || null,
      adminAudit: null,
    };
  });
}

function buildVisibleActivitySummary(visibleProof: Record<string, unknown>): string {
  const parts: string[] = [];
  const tier = readString(visibleProof.sage_tier);
  const usedCredits = readNumber(visibleProof.used_credits, 0);
  const virtualMinutes = readNumber(visibleProof.virtual_browser_minutes, 0);
  const paymentApproval = visibleProof.owner_approval_required_for_payment === true;
  if (tier) {
    parts.push(`Sage used ${tier}`);
  }
  if (usedCredits > 0) {
    parts.push(`Used ${Math.round(usedCredits)} credits`);
  }
  if (virtualMinutes > 0) {
    const rounded = Math.max(1, Math.round(virtualMinutes));
    parts.push(`Cloud browser ran for ${rounded} minute${rounded === 1 ? '' : 's'}`);
  }
  if (paymentApproval) {
    parts.push('Owner approval required for payment');
  }
  return parts.join(' · ');
}

function normalizeAdminAudit(value: Record<string, unknown>): ActivityProofItem['adminAudit'] {
  const tokenUsage = readRecord(value.token_usage);
  const ledgerItemIds = readList(value.ledger_item_ids)
    .map((item) => readString(item))
    .filter(Boolean);
  const record: ActivityProofItem['adminAudit'] = {
    rawProvider: readString(value.raw_provider) || null,
    rawModel: readString(value.raw_model) || null,
    fallbackProvider: readString(value.fallback_provider) || null,
    fallbackModel: readString(value.fallback_model) || null,
    promptTokens: Math.max(0, Math.round(readNumber(tokenUsage.prompt_tokens, 0))),
    completionTokens: Math.max(0, Math.round(readNumber(tokenUsage.completion_tokens, 0))),
    totalTokens: Math.max(0, Math.round(readNumber(tokenUsage.total_tokens, 0))),
    runtimeDurationSeconds: readNumber(value.runtime_duration_seconds, Number.NaN),
    ledgerItemIds,
  };
  if (
    !record.rawProvider
    && !record.rawModel
    && !record.fallbackProvider
    && !record.fallbackModel
    && record.promptTokens <= 0
    && record.completionTokens <= 0
    && record.totalTokens <= 0
    && !Number.isFinite(record.runtimeDurationSeconds as number)
    && record.ledgerItemIds.length === 0
  ) {
    return null;
  }
  return {
    ...record,
    runtimeDurationSeconds: Number.isFinite(record.runtimeDurationSeconds as number)
      ? Math.max(0, Number(record.runtimeDurationSeconds))
      : null,
  };
}

function normalizeRunAudit(run: Record<string, unknown>): ActivityProofItem['adminAudit'] {
  const raw = readRecord(run.raw);
  const metadata = readRecord(raw.metadata);
  const usage = readRecord(raw.usage_accounting);
  return normalizeAdminAudit({
    raw_provider: run.provider ?? raw.provider ?? usage.effective_provider ?? metadata.effective_provider,
    raw_model: run.model ?? raw.model ?? usage.effective_model ?? metadata.effective_model,
    fallback_provider: metadata.fallback_provider ?? raw.fallback_provider,
    fallback_model: metadata.fallback_model ?? raw.fallback_model,
    token_usage: {
      prompt_tokens: run.prompt_tokens ?? usage.input_tokens ?? usage.prompt_tokens ?? raw.prompt_tokens,
      completion_tokens: run.completion_tokens ?? usage.output_tokens ?? usage.completion_tokens ?? raw.completion_tokens,
      total_tokens: run.total_tokens ?? usage.total_tokens ?? raw.total_tokens,
    },
    runtime_duration_seconds: raw.runtime_duration_seconds ?? metadata.runtime_duration_seconds ?? raw.duration_seconds,
    ledger_item_ids: metadata.ledger_item_ids,
  });
}

function mergeProofItems(items: ActivityProofItem[]): ActivityProofItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.id || `${item.type}:${item.title}:${item.occurredAt ?? ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));
}

function normalizePilotProofSnapshot(
  readinessPayload: unknown,
  caseStudyPayload: unknown,
  investorMemoPayload: unknown,
  adsPayload: unknown,
): PilotProofSnapshot | null {
  const readinessRecord = readRecord(readinessPayload);
  const proofReadiness = readRecord(readinessRecord.proof_readiness);
  const proofMetrics = readRecord(readinessRecord.proof_metrics);
  const evidence = readRecord(readinessRecord.evidence);
  const adsReadiness = readRecord(readRecord(adsPayload).ads_readiness);
  const caseStudy = readRecord(readRecord(caseStudyPayload).case_study);
  const investorMemo = readRecord(readRecord(investorMemoPayload).investor_memo);
  const status = readString(proofReadiness.proof_status);
  if (!status && Object.keys(readinessRecord).length === 0) {
    return null;
  }
  return {
    status: status || 'insufficient_data',
    adsReady: adsReadiness.ads_ready === true,
    pilotUsers: Math.max(0, Math.round(readNumber(proofMetrics.pilot_users, 0))),
    messagesHandled: Math.max(0, Math.round(readNumber(proofMetrics.messages_handled, 0))),
    tasksCompleted: Math.max(0, Math.round(readNumber(proofMetrics.tasks_completed, 0))),
    failureRate: Math.max(0, readNumber(proofMetrics.failure_rate, 0)),
    approvalRate: Math.max(0, readNumber(proofMetrics.manual_approval_rate, 0)),
    usefulnessScore: proofMetrics.average_usefulness_score === null || proofMetrics.average_usefulness_score === undefined
      ? null
      : readNumber(proofMetrics.average_usefulness_score, 0),
    missingEvidence: readStringList(proofReadiness.missing_evidence),
    unresolvedIssueCount: readList(proofReadiness.unresolved_p0_p1_issues).length,
    evidenceTraceIds: readStringList(evidence.trace_ids),
    caseStudyStatus: readString(caseStudy.status, status || 'insufficient_data'),
    investorMemoStatus: readString(investorMemo.status, status || 'insufficient_data'),
    adsReasons: readStringList(adsReadiness.reasons),
  };
}

function formatProofStatus(value: string): string {
  const normalized = readString(value, 'insufficient_data').replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, value) * 100)}%`;
}

function toThreadListItems(threads: ThreadRecord[]): ThreadListItem[] {
  return threads
    .map((thread, index) => ({
      id: readString(thread.id, `thread-${index}`),
      preview: threadPreviewLabel(thread),
      occurredAt: readString(thread.last_turn_at) || readString(thread.updated_at) || readString(thread.created_at) || null,
    }))
    .filter((thread) => thread.id && thread.preview)
    .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));
}

function formatHistoryDate(value: string | null): string {
  if (!value) {
    return '';
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  const diffMinutes = Math.round((parsed - Date.now()) / 60000);
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
  const date = new Date(parsed);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function buildAdminAuditLine(audit: NonNullable<ActivityProofItem['adminAudit']>): string {
  const parts: string[] = [];
  if (audit.rawProvider || audit.rawModel) {
    const providerModel = [audit.rawProvider, audit.rawModel].filter(Boolean).join(' · ');
    if (providerModel) {
      parts.push(providerModel);
    }
  }
  if (audit.fallbackProvider || audit.fallbackModel) {
    const fallback = [audit.fallbackProvider, audit.fallbackModel].filter(Boolean).join(' · ');
    if (fallback) {
      parts.push(`Fallback ${fallback}`);
    }
  }
  if (audit.totalTokens > 0) {
    parts.push(
      `${audit.totalTokens} tokens (${Math.max(0, audit.promptTokens)} in / ${Math.max(0, audit.completionTokens)} out)`,
    );
  }
  if (audit.runtimeDurationSeconds !== null && Number.isFinite(audit.runtimeDurationSeconds)) {
    parts.push(`${Math.max(0, Math.round(audit.runtimeDurationSeconds))}s runtime`);
  }
  if (audit.ledgerItemIds.length > 0) {
    const preview = audit.ledgerItemIds.slice(0, 2);
    const extra = audit.ledgerItemIds.length - preview.length;
    parts.push(
      extra > 0
        ? `Ledger ${preview.join(', ')} +${extra} more`
        : `Ledger ${preview.join(', ')}`,
    );
  }
  return parts.join(' · ');
}

export function WorkstationRunsPane() {
  const router = useRouter();
  const { routeManifest, workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const activityVersion = useWorkstationActivityVersion();
  const cachedThreads = threadsPaneCache.get(workspaceId) ?? null;
  const cachedActivity = activityPaneCache.get(workspaceId) ?? null;
  const cachedPilotProof = pilotProofPaneCache.get(workspaceId) ?? null;
  const [hadInitialCache] = useState(() => cachedThreads !== null && cachedActivity !== null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => readPersistedActiveThread(workspaceId));
  const [threads, setThreads] = useState<ThreadListItem[]>(() => cachedThreads ?? []);
  const [activityItems, setActivityItems] = useState<ActivityProofItem[]>(() => cachedActivity ?? []);
  const [pilotProof, setPilotProof] = useState<PilotProofSnapshot | null>(() => cachedPilotProof);
  const [activeFilter, setActiveFilter] = useState<ActivityFilterId>('all');
  const [traceIdFilter, setTraceIdFilter] = useState('');
  const [showAdminAudit, setShowAdminAudit] = useState(false);
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(() => cachedThreads === null || cachedActivity === null);
  const [error, setError] = useState<string | null>(null);

  const chatHref = useMemo(
    () => routeManifest.routeIndex.chat?.href ?? `/w/${encodeURIComponent(workspaceId)}/chat`,
    [routeManifest.routeIndex.chat, workspaceId],
  );

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const [threadsPayload, activityPayload, runsPayload, approvalsPayload, proofPayload, caseStudyPayload, investorMemoPayload, adsReadinessPayload] = await Promise.all([
      services.client.listThreads({ includeTurns: true, limit: 200 }),
      services.client.listActivityTimeline({ limit: 200 }).catch(() => ({ items: [] })),
      services.client.listRuns({ limit: 80 }).catch(() => ({ items: [] })),
      services.client.listApprovals({ limit: 80 }).catch(() => ({ items: [] })),
      services.client.getPilotProofReadiness({ days: 30, limit: 1000 }).catch(() => null),
      services.client.getPilotProofCaseStudy({ days: 30, limit: 1000 }).catch(() => null),
      services.client.getPilotProofInvestorMemo({ days: 30, limit: 1000 }).catch(() => null),
      services.client.getPilotProofAdsReadiness({ days: 30, limit: 1000 }).catch(() => null),
    ]);
    const threadRecords = normalizeThreadItems(threadsPayload);
    const nextThreads = toThreadListItems(threadRecords);
    const nextActivityItems = mergeProofItems([
      ...proofItemsFromActivity(activityPayload),
      ...proofItemsFromThreads(threadRecords),
      ...proofItemsFromRuns(runsPayload),
      ...proofItemsFromApprovals(approvalsPayload),
    ]);
    threadsPaneCache.set(workspaceId, nextThreads);
    activityPaneCache.set(workspaceId, nextActivityItems);
    const nextPilotProof = normalizePilotProofSnapshot(proofPayload, caseStudyPayload, investorMemoPayload, adsReadinessPayload);
    pilotProofPaneCache.set(workspaceId, nextPilotProof);
    setThreads(nextThreads);
    setActivityItems(nextActivityItems);
    setPilotProof(nextPilotProof);
    setVisibleCount(HISTORY_PAGE_SIZE);
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(!hadInitialCache).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
        setIsLoading(false);
      }
    });
    const unsubscribe = subscribeWorkstationApprovalResolved(() => {
      void refresh(false).catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
          setIsLoading(false);
        }
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hadInitialCache, services.client, workspaceId]);

  useEffect(() => {
    if (activityVersion === 0) {
      return;
    }
    void refresh(false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
      setIsLoading(false);
    });
  }, [activityVersion, workspaceId]);

  const filteredActivityItems = useMemo(
    () => {
      let items = activeFilter === 'all'
        ? activityItems
        : activityItems.filter((item) => item.type === activeFilter);
      if (traceIdFilter) {
        const q = traceIdFilter.toLowerCase();
        items = items.filter((item) =>
          (item.traceId ?? '').toLowerCase().includes(q) ||
          (item.id ?? '').toLowerCase().includes(q)
        );
      }
      return items;
    },
    [activeFilter, traceIdFilter, activityItems],
  );
  const visibleActivityItems = useMemo(
    () => filteredActivityItems.slice(0, visibleCount),
    [filteredActivityItems, visibleCount],
  );
  const hasMoreItems = visibleCount < filteredActivityItems.length;
  const approvalCount = activityItems.filter((item) => item.type === 'approval').length;
  const channelCount = activityItems.filter((item) => item.type === 'channel').length;
  const providerCount = activityItems.filter((item) => item.type === 'provider').length;
  const adminAuditCount = activityItems.filter((item) => item.adminAudit !== null).length;

  return (
    <WorkstationSurfaceRoot surface="activity">
      <main className="app-runs-minimal-page" data-workstation-surface="activity-proof">
        {error ? <div className="app-surface-inline-status">Activity could not refresh. Try again when ready.</div> : null}
        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
          </div>
        ) : activityItems.length === 0 ? (
          <EmptyPanel
            title="No activity yet"
            body="Ask Sage for help or test one business specialist. Chat, tool runs, approvals, channel sends, gateway reconnects, provider failures, and final outcomes will appear here as proof."
          />
        ) : (
          <div className="app-stack-4">
            {pilotProof ? (
              <WorkstationSurfaceCard
                title="Pilot proof"
                description="Closed-pilot readiness from real WhatsApp/Telegram activity, feedback, issues, and trace IDs."
              >
                <div className="app-stack-3">
                  <WorkstationSurfaceStatGrid>
                    <WorkstationSurfaceStat label="Proof status" value={formatProofStatus(pilotProof.status)} hint={pilotProof.adsReady ? 'Ads review unlocked' : 'Keep pilot closed'} />
                    <WorkstationSurfaceStat label="Pilot users" value={pilotProof.pilotUsers} hint={`${pilotProof.messagesHandled} messages handled`} />
                    <WorkstationSurfaceStat label="Completed tasks" value={pilotProof.tasksCompleted} hint={`${formatPercent(pilotProof.failureRate)} failure rate`} />
                    <WorkstationSurfaceStat label="Manual approval" value={formatPercent(pilotProof.approvalRate)} hint={pilotProof.usefulnessScore === null ? 'No usefulness score yet' : `${pilotProof.usefulnessScore}/5 usefulness`} />
                  </WorkstationSurfaceStatGrid>
                  <div className="app-runs-minimal-list app-runs-minimal-list--flat">
                    <div className="app-runs-minimal-row app-runs-minimal-row--flat">
                      <span className="app-runs-minimal-row__preview">
                        Case study · {formatProofStatus(pilotProof.caseStudyStatus)}
                      </span>
                      <span className="app-runs-minimal-row__time">
                        {pilotProof.evidenceTraceIds.length} trace IDs
                      </span>
                    </div>
                    <div className="app-runs-minimal-row app-runs-minimal-row--flat">
                      <span className="app-runs-minimal-row__preview">
                        Investor memo · {formatProofStatus(pilotProof.investorMemoStatus)}
                      </span>
                      <span className="app-runs-minimal-row__time">
                        {pilotProof.unresolvedIssueCount} open P0/P1
                      </span>
                    </div>
                    <div className="app-runs-minimal-row app-runs-minimal-row--flat">
                      <span className="app-runs-minimal-row__preview">
                        Ads readiness · {pilotProof.adsReady ? 'Ready for copy review' : (pilotProof.adsReasons[0] || 'Blocked until proof improves')}
                      </span>
                      <span className="app-runs-minimal-row__time">
                        {pilotProof.missingEvidence.length} gaps
                      </span>
                    </div>
                  </div>
                  {pilotProof.missingEvidence.length > 0 ? (
                    <WorkstationSurfaceNotice tone="neutral">
                      {pilotProof.missingEvidence.slice(0, 3).join(' ')}
                    </WorkstationSurfaceNotice>
                  ) : null}
                </div>
              </WorkstationSurfaceCard>
            ) : null}

            <WorkstationSurfaceNotice tone="neutral">
              Activity is the proof timeline for chat history, tool runs, approvals, channel sends, gateway reconnects, provider failures, file/shell/browser events, and final outcomes.
            </WorkstationSurfaceNotice>

            <WorkstationSurfaceStatGrid>
              <WorkstationSurfaceStat label="Proof events" value={activityItems.length} hint="Human summaries only" />
              <WorkstationSurfaceStat label="Chat history" value={threads.length} hint="Conversation entries included" />
              <WorkstationSurfaceStat label="Approvals" value={approvalCount} hint="Needs your OK and decisions" />
              <WorkstationSurfaceStat label="Channels/providers" value={channelCount + providerCount} hint="External sends and AI state" />
            </WorkstationSurfaceStatGrid>

            <WorkstationSurfaceCard
              title="What happened?"
              description="Compact proof rows. Raw debug blobs and hidden reasoning stay out of this surface."
            >
              <div className="app-runs-minimal-list app-runs-minimal-list--flat" aria-label="Activity filters">
                <div className="app-filter-pill-row" role="tablist" aria-label="Activity type filters">
                  {ACTIVITY_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`app-filter-pill${activeFilter === filter.id ? ' app-filter-pill--active' : ''}`}
                      onClick={() => {
                        setActiveFilter(filter.id);
                        setVisibleCount(HISTORY_PAGE_SIZE);
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                  {adminAuditCount > 0 ? (
                    <button
                      type="button"
                      className={`app-filter-pill${showAdminAudit ? ' app-filter-pill--active' : ''}`}
                      onClick={() => setShowAdminAudit((current) => !current)}
                    >
                      {showAdminAudit ? 'Hide admin audit' : 'Show admin audit'}
                    </button>
                  ) : null}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search by trace ID"
                    value={traceIdFilter}
                    onChange={(e) => { setTraceIdFilter(e.target.value.trim()); setVisibleCount(HISTORY_PAGE_SIZE); }}
                    style={{
                      padding: '4px 10px', fontSize: 12, borderRadius: 6,
                      border: '1px solid var(--color-border, #e5e7eb)',
                      background: 'var(--color-bg, #fff)', color: 'var(--color-fg, #111)',
                      width: 260,
                    }}
                  />
                  {traceIdFilter && (
                    <button type="button" onClick={() => setTraceIdFilter('')}
                      style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4,
                        border: '1px solid var(--color-border, #e5e7eb)',
                        background: 'transparent', cursor: 'pointer',
                        color: 'var(--color-muted, #6b7280)', }}>
                      Clear
                    </button>
                  )}
                  {traceIdFilter && filteredActivityItems.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--color-muted, #6b7280)' }}>
                      No events found for this trace ID
                    </span>
                  )}
                </div>
                {visibleActivityItems.length > 0 ? (
                  <div className="app-runs-minimal-list app-runs-minimal-list--flat" aria-label="Activity proof timeline">
                    {visibleActivityItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`app-runs-minimal-row app-runs-minimal-row--flat${selectedThreadId === item.threadId ? ' app-runs-minimal-row--selected' : ''}`}
                        onClick={() => {
                          if (!item.threadId) {
                            return;
                          }
                          persistActiveThread(workspaceId, item.threadId);
                          setSelectedThreadId(item.threadId);
                          router.push(chatHref);
                        }}
                      >
                        <span className="app-runs-minimal-row__preview" title={`${item.title}: ${item.summary}`}>
                          {item.title} · {item.summary}
                        </span>
                        {showAdminAudit && item.adminAudit ? (
                          <span
                            className="app-runs-minimal-row__time"
                            title={buildAdminAuditLine(item.adminAudit)}
                          >
                            {buildAdminAuditLine(item.adminAudit)}
                          </span>
                        ) : null}
                        <span className="app-runs-minimal-row__time">{item.source} · {formatHistoryDate(item.occurredAt)}</span>
                      </button>
                    ))}
                    {hasMoreItems ? (
                      <button
                        type="button"
                        className="app-runs-minimal-load-more"
                        onClick={() => {
                          setVisibleCount((current) => Math.min(current + HISTORY_PAGE_SIZE, filteredActivityItems.length));
                        }}
                      >
                        Load more
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <WorkstationSurfaceNotice tone="neutral">
                    No proof rows match this filter yet.
                  </WorkstationSurfaceNotice>
                )}
              </div>
            </WorkstationSurfaceCard>
          </div>
        )}
      </main>
    </WorkstationSurfaceRoot>
  );
}
