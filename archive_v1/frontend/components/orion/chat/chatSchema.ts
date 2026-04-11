'use client';

import type { ThreadRecord, ThreadTurnRecord } from '@shared/api-contract';

export type ChatMessageRole = 'user' | 'assistant';
export type ChatMessageStatus = 'sending' | 'running' | 'completed' | 'waiting' | 'error';
export type ChatStepStatus = 'active' | 'done' | 'error';
export type ChatStepKind = 'file' | 'shell' | 'connector' | 'thinking' | 'screenshot';

export type ChatMessageActionKind = 'run' | 'workflow' | 'connect' | 'open' | 'approval_required';
export type ChatMessageActionVariant = 'primary' | 'secondary';
export type ChatRunCardStatus = 'preparing' | 'running' | 'waiting' | 'completed' | 'needs_attention' | 'failed';
export type ChatInterventionKind =
  | 'system_notice'
  | 'system_error'
  | 'connect_required'
  | 'run_offer'
  | 'workflow_offer'
  | 'run_handoff'
  | 'loop_detected';

export type ChatStepRecord = {
  id: string;
  label: string;
  detail?: string | null;
  status: ChatStepStatus;
  kind?: ChatStepKind | null;
};

export type ChatMessageActionRecord = {
  id: string;
  kind: ChatMessageActionKind;
  label: string;
  variant?: ChatMessageActionVariant;
  type?: string | null;
  href?: string | null;
  goal?: string | null;
  connector?: string | null;
  action?: string | null;
  input?: string | null;
};

export type ChatRunCardEvidenceRecord = {
  id: string;
  label: string;
  value: string;
};

export type ChatRunCardMetaRecord = {
  id: string;
  label: string;
  value: string;
};

export type ChatRunCardApprovalRecord = {
  prompt: string;
  labels: string[];
  capabilities: string[];
  actions: string[];
  target?: string | null;
  scope: 'once';
  reusable: boolean;
  consequence?: string | null;
};

export type ChatApprovalRequestRecord = {
  id: string;
  approvalId?: string | null;
  runId?: string | null;
  actionId?: string | null;
  prompt: string;
  labels: string[];
  capabilities: string[];
  actions: string[];
  target?: string | null;
  scope: 'once';
  reusable: boolean;
  consequence?: string | null;
  resolution?: 'waiting' | 'approved' | 'rejected';
};

export type ChatInterventionRecord = {
  id: string;
  kind: ChatInterventionKind;
  title: string;
  detail?: string | null;
  severity?: 'info' | 'warning' | 'error';
  status?: 'ready' | 'waiting' | 'active' | 'completed' | 'failed';
  code?: string | null;
  runId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ChatRunCardRecord = {
  title: string;
  summary?: string;
  status: ChatRunCardStatus;
  runId?: string | null;
  provider?: string | null;
  model?: string | null;
  sourceGoal?: string | null;
  meta?: ChatRunCardMetaRecord[];
  evidence?: ChatRunCardEvidenceRecord[];
  // Compatibility key name; this payload is confirmation-first.
  approval?: ChatRunCardApprovalRecord | null;
};

export type ChatContextUsedRecord = {
  tool_capabilities?: Array<{
    id: string;
    label: string;
    connected: boolean;
    authenticated?: boolean | null;
    runtime_usable?: boolean | null;
    read_actions?: string[];
    write_actions?: string[];
    approval_required_actions?: string[];
  }>;
  workspace: string;
  requested_provider?: string | null;
  effective_provider?: string | null;
  requested_model?: string | null;
  effective_model?: string | null;
  provider_overridden?: boolean;
  model_overridden?: boolean;
  fallback_used?: boolean;
  fallback_reason?: string | null;
  reasoning_effort?: string | null;
  connected_systems?: string[];
  prior_messages_used: boolean;
  history_mode: 'none' | 'raw_messages' | 'summary';
  run_created: boolean;
};

export type ChatMessageRecord = {
  id: string;
  role: ChatMessageRole;
  content: string;
  ts: string;
  status?: ChatMessageStatus;
  run_id?: string | null;
  steps?: ChatStepRecord[];
  artifacts?: Array<Record<string, unknown>>;
  actions?: ChatMessageActionRecord[];
  runCard?: ChatRunCardRecord | null;
  approvalRequests?: ChatApprovalRequestRecord[];
  interventions?: ChatInterventionRecord[];
  contextUsed?: ChatContextUsedRecord | null;
};

export type ChatSessionRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  masterAgentInstallId?: string | null;
  metadata?: Record<string, unknown> | null;
  messages: ChatMessageRecord[];
};

export type ChatStoreRecord = {
  version: 1;
  selectedSessionId: string | null;
  sessions: ChatSessionRecord[];
};

export type ChatSessionSelectDetail = {
  sessionId: string;
};

export const CHAT_STORE_STORAGE_KEY = 'empyralis.chat.store.v1';
export const CHAT_STORE_UPDATED_EVENT = 'empyralis:chat-store-updated';
export const CHAT_SESSION_SELECT_EVENT = 'empyralis:chat-session-select';
export const EMPTY_CHAT_SESSION_TITLE = 'New chat';

const DEPRECATED_SYSTEM_CHAT_CONTENT = new Set([
  'no ai provider is configured for chat right now. i can still run explicit local, browser, and web tools, but this request needs model reasoning first.',
  'continue in your browser to sign in.',
  'sign in required.',
]);

export function createChatId(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeChatRole(role: string | null | undefined): ChatMessageRole {
  return role === 'assistant' || role === 'agent' ? 'assistant' : 'user';
}

export function normalizeChatContent(value: string): string {
  const cleaned = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleaned) return '';
  const marker = 'Current folder:';
  const first = cleaned.indexOf(marker);
  if (first !== -1) {
    const second = cleaned.indexOf(marker, first + marker.length);
    if (second !== -1) {
      return cleaned.slice(0, second).trim();
    }
  }
  return cleaned;
}

export function isDeprecatedSystemChatMessage(role: ChatMessageRole, content: string): boolean {
  if (normalizeChatRole(role) !== 'assistant') return false;
  return DEPRECATED_SYSTEM_CHAT_CONTENT.has(normalizeChatContent(content).toLowerCase());
}

export function dedupeChatMessages(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  const normalized: ChatMessageRecord[] = [];
  for (const message of messages) {
    const nextMessage = {
      ...message,
      role: normalizeChatRole(message.role),
      content: normalizeChatContent(message.content),
    };
    if (isDeprecatedSystemChatMessage(nextMessage.role, nextMessage.content)) {
      continue;
    }
    const previous = normalized[normalized.length - 1];
    if (
      previous &&
      previous.role === nextMessage.role &&
      previous.status === nextMessage.status &&
      String(previous.run_id || '').trim() === String(nextMessage.run_id || '').trim() &&
      normalizeChatContent(previous.content) === nextMessage.content
    ) {
        normalized[normalized.length - 1] = {
          ...previous,
          ...nextMessage,
          steps: nextMessage.steps ?? previous.steps,
          actions: nextMessage.actions ?? previous.actions,
          runCard: nextMessage.runCard ?? previous.runCard ?? null,
          approvalRequests: nextMessage.approvalRequests ?? previous.approvalRequests,
          interventions: nextMessage.interventions ?? previous.interventions,
          contextUsed: nextMessage.contextUsed ?? previous.contextUsed ?? null,
        };
        continue;
      }
    normalized.push(nextMessage);
  }
  return normalized;
}

export function buildChatSessionTitle(messages: ChatMessageRecord[]): string {
  const firstUserMessage = messages.find((message) => normalizeChatRole(message.role) === 'user');
  const source = normalizeChatContent(firstUserMessage?.content || '');
  if (!source) return EMPTY_CHAT_SESSION_TITLE;
  const singleLine = source.replace(/\s+/g, ' ');
  return singleLine.length > 48 ? `${singleLine.slice(0, 45).trimEnd()}...` : singleLine;
}

export function createEmptyChatSession(
  now = new Date().toISOString(),
  overrides?: Partial<Pick<ChatSessionRecord, 'id' | 'title' | 'masterAgentInstallId' | 'metadata'>>,
): ChatSessionRecord {
  return {
    id: String(overrides?.id || '').trim() || createChatId('session'),
    title: String(overrides?.title || '').trim() || EMPTY_CHAT_SESSION_TITLE,
    createdAt: now,
    updatedAt: now,
    masterAgentInstallId: typeof overrides?.masterAgentInstallId === 'string' ? overrides.masterAgentInstallId : null,
    metadata: overrides?.metadata && typeof overrides.metadata === 'object' ? { ...overrides.metadata } : null,
    messages: [],
  };
}

function normalizeThreadTurnStatus(status: string | null | undefined): ChatMessageStatus | undefined {
  const token = String(status || '').trim().toLowerCase();
  if (!token) return undefined;
  if (token === 'waiting' || token === 'waiting_for_input') return 'waiting';
  if (token === 'failed' || token === 'error' || token === 'timeout') return 'error';
  if (token === 'running' || token === 'starting' || token === 'queued_local') return 'running';
  return 'completed';
}

export function threadTurnToChatMessage(turn: ThreadTurnRecord): ChatMessageRecord | null {
  const role = normalizeChatRole(turn.role);
  const content = normalizeChatContent(turn.content || '');
  const approvalRequests = Array.isArray(turn.approvals)
    ? turn.approvals
        .map((approval): ChatApprovalRequestRecord | null => {
          const prompt = String(approval?.prompt || '').trim();
          if (!prompt) return null;
          return {
            id: String(approval?.approval_id || '').trim() || createChatId('approval'),
            approvalId: String(approval?.approval_id || '').trim() || null,
            runId: typeof turn.run_id === 'string' ? turn.run_id : null,
            actionId: null,
            prompt,
            labels: Array.isArray(approval?.labels)
              ? approval.labels.map((item) => String(item || '').trim()).filter(Boolean)
              : [],
            capabilities: Array.isArray(approval?.capabilities)
              ? approval.capabilities.map((item) => String(item || '').trim()).filter(Boolean)
              : [],
            actions: Array.isArray(approval?.actions)
              ? approval.actions.map((item) => String(item || '').trim()).filter(Boolean)
              : [],
            target: typeof approval?.target === 'string' ? approval.target : null,
            scope: 'once',
            reusable: Boolean(approval?.reusable),
            consequence: typeof approval?.consequence === 'string' ? approval.consequence : null,
            resolution: 'waiting',
          };
        })
        .filter((item): item is ChatApprovalRequestRecord => Boolean(item))
    : [];
  const interventions = Array.isArray(turn.interventions)
    ? turn.interventions
        .map((intervention): ChatInterventionRecord | null => {
          const kind = String(intervention?.kind || '').trim() as ChatInterventionKind;
          if (!kind) return null;
          return {
            id: createChatId('intervention'),
            kind,
            title: String(intervention?.title || kind.replace(/_/g, ' ')).trim() || kind,
            detail: typeof intervention?.detail === 'string' ? intervention.detail : null,
            severity: intervention?.severity === 'warning' || intervention?.severity === 'error' ? intervention.severity : 'info',
            status: intervention?.status === 'waiting' || intervention?.status === 'active' || intervention?.status === 'completed' || intervention?.status === 'failed'
              ? intervention.status
              : 'ready',
            code: typeof intervention?.code === 'string' ? intervention.code : null,
            runId: typeof intervention?.run_id === 'string' ? intervention.run_id : (typeof turn.run_id === 'string' ? turn.run_id : null),
            metadata: intervention?.metadata && typeof intervention.metadata === 'object'
              ? intervention.metadata as Record<string, unknown>
              : null,
          };
        })
        .filter((item): item is ChatInterventionRecord => Boolean(item))
    : [];
  if (!content && approvalRequests.length === 0 && interventions.length === 0) {
    return null;
  }
  return {
    id: String(turn.id || '').trim() || createChatId('message'),
    role,
    content,
    ts: String(turn.created_at || turn.updated_at || new Date().toISOString()).trim() || new Date().toISOString(),
    status: normalizeThreadTurnStatus(turn.status),
    run_id: typeof turn.run_id === 'string' ? turn.run_id : null,
    approvalRequests: approvalRequests.length > 0 ? approvalRequests : undefined,
    interventions: interventions.length > 0 ? interventions : undefined,
  };
}

export function threadRecordToChatSession(thread: ThreadRecord): ChatSessionRecord {
  const turns = Array.isArray(thread.turns)
    ? thread.turns.map((turn) => threadTurnToChatMessage(turn)).filter((item): item is ChatMessageRecord => Boolean(item))
    : [];
  return {
    id: String(thread.id || '').trim() || createChatId('session'),
    title: String(thread.title || '').trim() || buildChatSessionTitle(turns),
    createdAt: String(thread.created_at || thread.updated_at || new Date().toISOString()).trim() || new Date().toISOString(),
    updatedAt: String(thread.updated_at || thread.last_turn_at || thread.created_at || new Date().toISOString()).trim() || new Date().toISOString(),
    masterAgentInstallId: typeof thread.master_agent_install_id === 'string' ? thread.master_agent_install_id : null,
    metadata: thread.metadata && typeof thread.metadata === 'object' ? { ...thread.metadata } : null,
    messages: dedupeChatMessages(turns),
  };
}

export function threadRecordsToChatStore(
  threads: ThreadRecord[],
  selectedSessionId?: string | null,
): ChatStoreRecord | null {
  const sessions = threads
    .map((thread) => threadRecordToChatSession(thread))
    .filter((session) => session.id);
  if (sessions.length === 0) return null;
  const preferredId = String(selectedSessionId || '').trim();
  const selectedId = sessions.some((session) => session.id === preferredId)
    ? preferredId
    : sessions[0]?.id || null;
  return {
    version: 1,
    selectedSessionId: selectedId,
    sessions,
  };
}

export function upsertSessionMessages(
  session: ChatSessionRecord,
  messages: ChatMessageRecord[],
  updatedAt = new Date().toISOString(),
): ChatSessionRecord {
  const nextMessages = dedupeChatMessages(messages);
  return {
    ...session,
    messages: nextMessages,
    updatedAt,
    title: buildChatSessionTitle(nextMessages),
  };
}

export function sanitizeChatStore(value: unknown): ChatStoreRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const sessions = Array.isArray(record.sessions) ? record.sessions : [];
  const normalizedSessions = sessions
    .map((session): ChatSessionRecord | null => {
      if (!session || typeof session !== 'object') return null;
      const entry = session as Record<string, unknown>;
      const messages = Array.isArray(entry.messages)
        ? entry.messages
            .map((message): ChatMessageRecord | null => {
              if (!message || typeof message !== 'object') return null;
              const item = message as Record<string, unknown>;
              const id = String(item.id || '').trim() || createChatId('message');
              const ts = String(item.ts || entry.updatedAt || entry.createdAt || new Date().toISOString()).trim() || new Date().toISOString();
              const content = normalizeChatContent(String(item.content || ''));
              const hasRunCard = Boolean(item.runCard && typeof item.runCard === 'object');
              const hasApprovalRequests = Boolean(Array.isArray(item.approvalRequests) && item.approvalRequests.length > 0);
              const hasInterventions = Boolean(Array.isArray(item.interventions) && item.interventions.length > 0);
              const steps = Array.isArray(item.steps)
                ? item.steps
                    .map((step): ChatStepRecord | null => {
                      if (!step || typeof step !== 'object') return null;
                      const record = step as Record<string, unknown>;
                      const label = String(record.label || '').trim();
                      if (!label) return null;
                      const rawStatus = String(record.status || 'active').trim().toLowerCase();
                      const rawKind = String(record.kind || '').trim().toLowerCase();
                      return {
                        id: String(record.id || '').trim() || createChatId('step'),
                        label,
                        detail: typeof record.detail === 'string' ? record.detail : null,
                        status: rawStatus === 'done' || rawStatus === 'error' ? rawStatus : 'active',
                        kind: rawKind === 'file' || rawKind === 'shell' || rawKind === 'connector' || rawKind === 'thinking' || rawKind === 'screenshot'
                          ? rawKind
                          : null,
                      } satisfies ChatStepRecord;
                    })
                    .filter((step): step is ChatStepRecord => Boolean(step))
                : [];
              if (!content && steps.length === 0 && !hasRunCard && !hasApprovalRequests && !hasInterventions) return null;
              return {
                id,
                role: normalizeChatRole(String(item.role || 'assistant')),
                content,
                ts,
                status: item.status as ChatMessageStatus | undefined,
                run_id: typeof item.run_id === 'string' ? item.run_id : null,
                steps: steps.length > 0 ? steps : undefined,
                artifacts: Array.isArray(item.artifacts)
                  ? item.artifacts.filter((artifact): artifact is Record<string, unknown> => Boolean(artifact && typeof artifact === 'object'))
                  : undefined,
                actions: Array.isArray(item.actions)
                  ? item.actions
                      .map((action): ChatMessageActionRecord | null => {
                        if (!action || typeof action !== 'object') return null;
                        const record = action as Record<string, unknown>;
                        const label = String(record.label || '').trim();
                        const kind = String(record.kind || '').trim() as ChatMessageActionKind;
                        if (!label || !kind) return null;
                        return {
                          id: String(record.id || '').trim() || createChatId('action'),
                          kind,
                          label,
                          variant: record.variant === 'primary' || record.variant === 'secondary'
                            ? record.variant
                            : undefined,
                          type: typeof record.type === 'string' ? record.type : null,
                          href: typeof record.href === 'string' ? record.href : null,
                          goal: typeof record.goal === 'string' ? record.goal : null,
                          connector: typeof record.connector === 'string' ? record.connector : null,
                          action: typeof record.action === 'string' ? record.action : null,
                          input: typeof record.input === 'string' ? record.input : null,
                        };
                      })
                      .filter((action): action is ChatMessageActionRecord => Boolean(action))
                  : undefined,
                runCard: item.runCard && typeof item.runCard === 'object'
                  ? (() => {
                      const runCard = item.runCard as Record<string, unknown>;
                      const title = String(runCard.title || '').trim();
                      if (!title) return null;
                      const evidence = Array.isArray(runCard.evidence)
                        ? runCard.evidence
                            .map((entry): ChatRunCardEvidenceRecord | null => {
                              if (!entry || typeof entry !== 'object') return null;
                              const record = entry as Record<string, unknown>;
                              const label = String(record.label || '').trim();
                              const value = String(record.value || '').trim();
                              if (!label || !value) return null;
                              return {
                                id: String(record.id || '').trim() || createChatId('evidence'),
                                label,
                                value,
                              };
                            })
                            .filter((entry): entry is ChatRunCardEvidenceRecord => Boolean(entry))
                        : [];
                      const approval = runCard.approval && typeof runCard.approval === 'object'
                        ? (() => {
                            const approvalRecord = runCard.approval as Record<string, unknown>;
                            const prompt = String(approvalRecord.prompt || '').trim();
                            if (!prompt) return null;
                            return {
                              prompt,
                              labels: Array.isArray(approvalRecord.labels)
                                ? approvalRecord.labels.map((entry) => String(entry || '').trim()).filter(Boolean)
                                : [],
                              capabilities: Array.isArray(approvalRecord.capabilities)
                                ? approvalRecord.capabilities.map((entry) => String(entry || '').trim()).filter(Boolean)
                                : [],
                              actions: Array.isArray(approvalRecord.actions)
                                ? approvalRecord.actions.map((entry) => String(entry || '').trim()).filter(Boolean)
                                : [],
                              target: typeof approvalRecord.target === 'string' ? approvalRecord.target : null,
                              scope: 'once',
                              reusable: typeof approvalRecord.reusable === 'boolean' ? approvalRecord.reusable : false,
                              consequence: typeof approvalRecord.consequence === 'string' ? approvalRecord.consequence : null,
                            } satisfies ChatRunCardApprovalRecord;
                          })()
                        : null;
                      return {
                        title,
                        summary: typeof runCard.summary === 'string' ? runCard.summary : undefined,
                        status: String(runCard.status || 'preparing').trim() as ChatRunCardStatus,
                        runId: typeof runCard.runId === 'string' ? runCard.runId : null,
                        provider: typeof runCard.provider === 'string' ? runCard.provider : null,
                        model: typeof runCard.model === 'string' ? runCard.model : null,
                        sourceGoal: typeof runCard.sourceGoal === 'string' ? runCard.sourceGoal : null,
                        evidence,
                        approval,
                      } satisfies ChatRunCardRecord;
                    })()
                  : null,
                approvalRequests: Array.isArray(item.approvalRequests)
                  ? item.approvalRequests
                      .map((entry): ChatApprovalRequestRecord | null => {
                        if (!entry || typeof entry !== 'object') return null;
                        const record = entry as Record<string, unknown>;
                        const prompt = String(record.prompt || '').trim();
                        if (!prompt) return null;
                        const resolution = String(record.resolution || 'waiting').trim().toLowerCase();
                        return {
                          id: String(record.id || '').trim() || createChatId('approval'),
                          approvalId: typeof record.approvalId === 'string' ? record.approvalId : null,
                          runId: typeof record.runId === 'string' ? record.runId : null,
                          actionId: typeof record.actionId === 'string' ? record.actionId : null,
                          prompt,
                          labels: Array.isArray(record.labels)
                            ? record.labels.map((entry) => String(entry || '').trim()).filter(Boolean)
                            : [],
                          capabilities: Array.isArray(record.capabilities)
                            ? record.capabilities.map((entry) => String(entry || '').trim()).filter(Boolean)
                            : [],
                          actions: Array.isArray(record.actions)
                            ? record.actions.map((entry) => String(entry || '').trim()).filter(Boolean)
                            : [],
                          target: typeof record.target === 'string' ? record.target : null,
                          scope: 'once',
                          reusable: typeof record.reusable === 'boolean' ? record.reusable : false,
                          consequence: typeof record.consequence === 'string' ? record.consequence : null,
                          resolution: resolution === 'approved' || resolution === 'rejected' ? resolution : 'waiting',
                        } satisfies ChatApprovalRequestRecord;
                      })
                      .filter((entry): entry is ChatApprovalRequestRecord => Boolean(entry))
                  : undefined,
                interventions: Array.isArray(item.interventions)
                  ? item.interventions
                      .map((entry): ChatInterventionRecord | null => {
                        if (!entry || typeof entry !== 'object') return null;
                        const record = entry as Record<string, unknown>;
                        const title = String(record.title || '').trim();
                        const kind = String(record.kind || '').trim() as ChatInterventionKind;
                        if (!title || !kind) return null;
                        const severity = String(record.severity || 'info').trim().toLowerCase();
                        const status = String(record.status || '').trim().toLowerCase();
                        return {
                          id: String(record.id || '').trim() || createChatId('intervention'),
                          kind,
                          title,
                          detail: typeof record.detail === 'string' ? record.detail : null,
                          severity: severity === 'warning' || severity === 'error' ? severity : 'info',
                          status: status === 'ready' || status === 'waiting' || status === 'active' || status === 'completed' || status === 'failed'
                            ? status
                            : undefined,
                          code: typeof record.code === 'string' ? record.code : null,
                          runId: typeof record.runId === 'string' ? record.runId : null,
                          metadata: record.metadata && typeof record.metadata === 'object'
                            ? record.metadata as Record<string, unknown>
                            : null,
                        } satisfies ChatInterventionRecord;
                      })
                      .filter((entry): entry is ChatInterventionRecord => Boolean(entry))
                  : undefined,
                contextUsed: item.contextUsed && typeof item.contextUsed === 'object'
                  ? (() => {
                      const contextUsed = item.contextUsed as Record<string, unknown>;
                      return {
                        tool_capabilities: Array.isArray(contextUsed.tool_capabilities)
                          ? contextUsed.tool_capabilities.reduce<NonNullable<ChatContextUsedRecord['tool_capabilities']>>((acc, entry) => {
                              if (!entry || typeof entry !== 'object') return acc;
                              const record = entry as Record<string, unknown>;
                              const id = String(record.id || '').trim();
                              if (!id) return acc;
                              acc.push({
                                id,
                                label: String(record.label || id).trim() || id,
                                connected: Boolean(record.connected),
                                authenticated: typeof record.authenticated === 'boolean' ? record.authenticated : null,
                                runtime_usable: typeof record.runtime_usable === 'boolean' ? record.runtime_usable : null,
                                read_actions: Array.isArray(record.read_actions)
                                  ? record.read_actions.map((item) => String(item || '').trim()).filter(Boolean)
                                  : [],
                                write_actions: Array.isArray(record.write_actions)
                                  ? record.write_actions.map((item) => String(item || '').trim()).filter(Boolean)
                                  : [],
                                approval_required_actions: Array.isArray(record.approval_required_actions)
                                  ? record.approval_required_actions.map((item) => String(item || '').trim()).filter(Boolean)
                                  : [],
                              });
                              return acc;
                            }, [])
                          : [],
                        workspace: String(contextUsed.workspace || '').trim(),
                        requested_provider: typeof contextUsed.requested_provider === 'string' ? contextUsed.requested_provider : null,
                        effective_provider: typeof contextUsed.effective_provider === 'string' ? contextUsed.effective_provider : null,
                        requested_model: typeof contextUsed.requested_model === 'string' ? contextUsed.requested_model : null,
                        effective_model: typeof contextUsed.effective_model === 'string' ? contextUsed.effective_model : null,
                        provider_overridden: Boolean(contextUsed.provider_overridden),
                        model_overridden: Boolean(contextUsed.model_overridden),
                        fallback_used: Boolean(contextUsed.fallback_used),
                        fallback_reason: typeof contextUsed.fallback_reason === 'string' ? contextUsed.fallback_reason : null,
                        reasoning_effort: typeof contextUsed.reasoning_effort === 'string' ? contextUsed.reasoning_effort : null,
                        connected_systems: Array.isArray(contextUsed.connected_systems)
                          ? contextUsed.connected_systems.map((entry) => String(entry || '').trim()).filter(Boolean)
                          : [],
                        prior_messages_used: Boolean(contextUsed.prior_messages_used),
                        history_mode:
                          contextUsed.history_mode === 'raw_messages' || contextUsed.history_mode === 'summary'
                            ? contextUsed.history_mode
                            : 'none',
                        run_created: Boolean(contextUsed.run_created),
                      } satisfies ChatContextUsedRecord;
                    })()
                  : null,
              };
            })
            .filter((message): message is ChatMessageRecord => Boolean(message))
        : [];
      const createdAt = String(entry.createdAt || entry.updatedAt || new Date().toISOString()).trim() || new Date().toISOString();
      const updatedAt = String(entry.updatedAt || createdAt).trim() || createdAt;
      const nextSession = upsertSessionMessages(
        {
          id: String(entry.id || '').trim() || createChatId('session'),
          title: String(entry.title || '').trim() || EMPTY_CHAT_SESSION_TITLE,
          createdAt,
          updatedAt,
          messages: [],
        },
        messages,
        updatedAt,
      );
      return nextSession;
    })
    .filter((session): session is ChatSessionRecord => Boolean(session));

  const nextSessions = normalizedSessions.length > 0 ? normalizedSessions : [createEmptyChatSession()];
  const selectedSessionId = String(record.selectedSessionId || '').trim();
  const resolvedSelectedSessionId =
    nextSessions.find((session) => session.id === selectedSessionId)?.id || nextSessions[0]?.id || null;

  return {
    version: 1,
    selectedSessionId: resolvedSelectedSessionId,
    sessions: nextSessions,
  };
}
