'use client';

export type ChatMessageRole = 'user' | 'assistant';
export type ChatMessageStatus = 'sending' | 'running' | 'completed' | 'waiting' | 'error';

export type ChatMessageRecord = {
  id: string;
  role: ChatMessageRole;
  content: string;
  ts: string;
  status?: ChatMessageStatus;
  run_id?: string | null;
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
