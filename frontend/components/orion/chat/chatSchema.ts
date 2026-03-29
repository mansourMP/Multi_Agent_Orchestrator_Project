'use client';

export type ChatMessageRole = 'user' | 'assistant';
export type ChatMessageStatus = 'sending' | 'running' | 'completed' | 'waiting' | 'error';

export type ChatMessageActionKind = 'run' | 'workflow' | 'connect' | 'open';
export type ChatMessageActionVariant = 'primary' | 'secondary';
export type ChatRunCardStatus = 'preparing' | 'running' | 'waiting' | 'completed' | 'needs_attention' | 'failed';

export type ChatMessageActionRecord = {
  id: string;
  kind: ChatMessageActionKind;
  label: string;
  variant?: ChatMessageActionVariant;
  href?: string | null;
  goal?: string | null;
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
  actions?: ChatMessageActionRecord[];
  runCard?: ChatRunCardRecord | null;
  contextUsed?: ChatContextUsedRecord | null;
};

export type ChatSessionRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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

export function dedupeChatMessages(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  const normalized: ChatMessageRecord[] = [];
  for (const message of messages) {
    const nextMessage = {
      ...message,
      role: normalizeChatRole(message.role),
      content: normalizeChatContent(message.content),
    };
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
        actions: nextMessage.actions ?? previous.actions,
        runCard: nextMessage.runCard ?? previous.runCard ?? null,
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

export function createEmptyChatSession(now = new Date().toISOString()): ChatSessionRecord {
  return {
    id: createChatId('session'),
    title: EMPTY_CHAT_SESSION_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
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
              if (!content) return null;
              return {
                id,
                role: normalizeChatRole(String(item.role || 'assistant')),
                content,
                ts,
                status: item.status as ChatMessageStatus | undefined,
                run_id: typeof item.run_id === 'string' ? item.run_id : null,
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
                          href: typeof record.href === 'string' ? record.href : null,
                          goal: typeof record.goal === 'string' ? record.goal : null,
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
