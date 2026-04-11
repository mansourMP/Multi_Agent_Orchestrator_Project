import {
  assertWorkspaceRouteAvailable,
  loadWorkspaceSurfaceResource,
  resolveMobileWorkspaceApiPaths,
  writeWorkspaceSurfaceResource,
} from './shared.js';

function normalizeChatPayload(payload, threadId) {
  const thread =
    payload && typeof payload === 'object' && payload.thread && typeof payload.thread === 'object'
      ? payload.thread
      : null;

  const messages = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.messages)
      ? payload.messages
      : Array.isArray(payload?.turns)
        ? payload.turns
        : [];

  return {
    threadId:
      payload?.threadId
      ?? thread?.id
      ?? threadId,
    messages,
  };
}

export function createChatSurface({
  foundation,
  apiPaths = {},
}) {
  const paths = resolveMobileWorkspaceApiPaths(foundation.bootstrap.workspace.id, apiPaths);
  const route = assertWorkspaceRouteAvailable(foundation, 'chat', 'chat');
  const chatStore = foundation.services.storeFactory.createStore({
    activeThreadId: 'primary',
  });
  foundation.services.disposableRegistry.add(() => chatStore.destroy());

  function draftPersistenceKey(threadId) {
    return `chat:draft:${threadId}`;
  }

  function threadPersistenceKey(threadId) {
    return `chat:thread:${threadId}`;
  }

  function threadQueryKey(threadId) {
    return `chat:thread:${threadId}`;
  }

  return {
    route: route.href,
    getDraft(threadId = 'primary') {
      return foundation.services.persistence.getJson(draftPersistenceKey(threadId)) ?? null;
    },
    setDraft(threadId = 'primary', text) {
      foundation.services.persistence.setJson(draftPersistenceKey(threadId), {
        text,
        updatedAt: new Date().toISOString(),
      });
      chatStore.setState((state) => ({
        ...state,
        activeThreadId: threadId,
        draftUpdatedAt: new Date().toISOString(),
      }));
      return this.getDraft(threadId);
    },
    async loadThread({ threadId = 'primary', refresh = false } = {}) {
      chatStore.setState((state) => ({
        ...state,
        activeThreadId: threadId,
      }));

      const result = await loadWorkspaceSurfaceResource({
        foundation,
        routeId: 'chat',
        queryKey: threadQueryKey(threadId),
        persistenceKey: threadPersistenceKey(threadId),
        path: paths.chatThread(threadId),
        emptyValue: () => ({
          threadId,
          messages: [],
        }),
        transform: (payload) => normalizeChatPayload(payload, threadId),
        scopeLabel: 'chat history',
        refresh,
      });

      return {
        ...result,
        draft: this.getDraft(threadId),
      };
    },
    async sendMessage({ threadId = 'primary', text, metadata = {} }) {
      const payload = {
        threadId,
        text,
        metadata,
      };
      const draft = this.setDraft(threadId, text);

      try {
        const response = await foundation.services.transport.requestJson(paths.chatSend, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const thread = normalizeChatPayload(response, threadId);
        writeWorkspaceSurfaceResource({
          foundation,
          queryKey: threadQueryKey(threadId),
          persistenceKey: threadPersistenceKey(threadId),
          data: thread,
        });
        foundation.services.persistence.remove(draftPersistenceKey(threadId));

        return {
          status: 'ready',
          statusMessage: null,
          source: 'live',
          data: thread,
        };
      } catch (error) {
        const cachedThread = foundation.services.persistence.getJson(threadPersistenceKey(threadId)) ?? {
          threadId,
          messages: [],
        };

        return {
          status: 'error',
          statusMessage: 'Could not reach the cloud workspace. Draft preserved locally.',
          source: cachedThread.messages.length > 0 ? 'persisted' : 'empty',
          data: cachedThread,
          draft,
          error,
        };
      }
    },
  };
}
