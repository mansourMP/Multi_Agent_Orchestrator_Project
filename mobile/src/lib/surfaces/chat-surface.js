import {
  assertWorkspaceRouteAvailable,
  requestWorkspaceSurfaceJson,
  resolveMobileWorkspaceApiPaths,
  writeWorkspaceSurfaceResource,
  WorkspaceSurfaceRequestError,
} from './shared.js';

function normalizeChatPayload(payload, threadId) {
  const thread = payload && typeof payload === 'object' ? payload : null;
  const messages = Array.isArray(payload?.turns)
    ? payload.turns.map((turn) => ({
        id: String(turn?.id ?? `${threadId}:${turn?.role ?? 'message'}`),
        role: String(turn?.role ?? 'assistant'),
        content: String(turn?.content ?? ''),
        status: typeof turn?.status === 'string' ? turn.status : 'completed',
        runId: typeof turn?.run_id === 'string' ? turn.run_id : null,
        approvals: Array.isArray(turn?.approvals) ? turn.approvals : [],
        interventions: Array.isArray(turn?.interventions) ? turn.interventions : [],
        createdAt:
          typeof turn?.created_at === 'string'
            ? turn.created_at
            : typeof turn?.createdAt === 'string'
              ? turn.createdAt
              : null,
      }))
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.messages)
        ? payload.messages
        : [];

  return {
    threadId: payload?.threadId ?? thread?.id ?? threadId,
    messages,
    title: typeof thread?.title === 'string' ? thread.title : 'Chat',
  };
}

function createUserMessage(text, threadId) {
  return {
    id: `${threadId}:user:${Date.now()}`,
    role: 'user',
    content: text,
    status: 'completed',
    runId: null,
    approvals: [],
    interventions: [],
    createdAt: new Date().toISOString(),
  };
}

function createAssistantMessage(response, threadId) {
  const approvals = Array.isArray(response?.approvals) ? response.approvals : [];
  const interventions = Array.isArray(response?.interventions) ? response.interventions : [];
  const reply = typeof response?.reply === 'string' ? response.reply.trim() : '';
  const runId = typeof response?.run_id === 'string' ? response.run_id : null;
  const content = reply
    || (approvals.length > 0
      ? 'Approval is required before this run can continue.'
      : runId
        ? 'Run accepted. Execution is now in progress.'
        : `Turn ${String(response?.status ?? 'completed')}.`);

  if (!content.trim()) {
    return null;
  }

  return {
    id: `${threadId}:assistant:${Date.now()}`,
    role: 'assistant',
    content,
    status: typeof response?.status === 'string' ? response.status : 'completed',
    runId,
    approvals,
    interventions,
    createdAt: new Date().toISOString(),
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

  function sessionPersistenceKey(threadId) {
    return `chat:session:${threadId}`;
  }

  async function ensureSession(threadId, forceNew = false) {
    if (!forceNew) {
      const cachedSession = foundation.services.queryClient.peek(sessionPersistenceKey(threadId))
        ?? foundation.services.persistence.getJson(sessionPersistenceKey(threadId));
      if (cachedSession?.session_id) {
        return cachedSession;
      }
    }

    const session = await requestWorkspaceSurfaceJson({
      foundation,
      path: paths.sessionCreate,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: foundation.bootstrap.workspace.tenantId,
          workspace_id: foundation.bootstrap.workspace.id,
          channel: 'mobile',
          actor: {
            type: 'user',
            id: foundation.bootstrap.account.id,
            display_name: foundation.bootstrap.account.displayName ?? foundation.bootstrap.account.email,
          },
          metadata: {
            thread_id: threadId,
            source: 'mobile_workspace_chat_surface',
          },
        }),
      },
    });
    foundation.services.queryClient.set(sessionPersistenceKey(threadId), session);
    foundation.services.persistence.setJson(sessionPersistenceKey(threadId), session);
    return session;
  }

  return {
    route: route.screen,
    getThreadSnapshot(threadId = 'primary') {
      return foundation.services.queryClient.peek(threadQueryKey(threadId))
        ?? foundation.services.persistence.getJson(threadPersistenceKey(threadId))
        ?? null;
    },
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

      const cachedMemory = refresh ? null : foundation.services.queryClient.peek(threadQueryKey(threadId));
      if (cachedMemory !== null) {
        return {
          status: 'ready',
          statusMessage: null,
          source: 'memory',
          data: cachedMemory,
          draft: this.getDraft(threadId),
        };
      }

      const cachedPersisted = foundation.services.persistence.getJson(threadPersistenceKey(threadId));

      let result;
      try {
        const payload = await requestWorkspaceSurfaceJson({
          foundation,
          path: paths.chatThread(threadId),
          allowStatuses: [404],
        });
        const data = normalizeChatPayload(payload, threadId);
        writeWorkspaceSurfaceResource({
          foundation,
          queryKey: threadQueryKey(threadId),
          persistenceKey: threadPersistenceKey(threadId),
          data,
        });
        result = {
          status: 'ready',
          statusMessage: null,
          source: payload === null ? 'empty' : 'live',
          data,
        };
      } catch (error) {
        if (cachedPersisted !== null) {
          result = {
            status: 'degraded',
            statusMessage: 'Showing cached chat history because cloud sync failed.',
            source: 'persisted',
            data: cachedPersisted,
            error,
          };
        } else {
          result = {
            status: 'error',
            statusMessage: 'Chat history is unavailable because the cloud workspace is unreachable.',
            source: 'empty',
            data: {
              threadId,
              messages: [],
            },
            error,
          };
        }
      }

      return {
        ...result,
        draft: this.getDraft(threadId),
      };
    },
    async sendMessage({ threadId = 'primary', text, metadata = {} }) {
      const draft = this.setDraft(threadId, text);

      try {
        let session = await ensureSession(threadId, false);
        let response;

        try {
          response = await requestWorkspaceSurfaceJson({
            foundation,
            path: paths.chatSend,
            init: {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                tenant_id: foundation.bootstrap.workspace.tenantId,
                workspace_id: foundation.bootstrap.workspace.id,
                thread_id: threadId,
                session_id: session.session_id,
                channel: 'mobile',
                actor: {
                  type: 'user',
                  id: foundation.bootstrap.account.id,
                  display_name: foundation.bootstrap.account.displayName ?? foundation.bootstrap.account.email,
                },
                message: text,
                attachments: [],
                context_hints: {
                  source: 'mobile_workspace_chat_surface',
                  thread_id: threadId,
                  metadata,
                },
                execution_mode: 'sync',
                response_mode: 'artifact',
                policy_context: {},
              }),
            },
          });
        } catch (error) {
          if (error instanceof WorkspaceSurfaceRequestError && error.status === 409) {
            session = await ensureSession(threadId, true);
            response = await requestWorkspaceSurfaceJson({
              foundation,
              path: paths.chatSend,
              init: {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                },
                body: JSON.stringify({
                  tenant_id: foundation.bootstrap.workspace.tenantId,
                  workspace_id: foundation.bootstrap.workspace.id,
                  thread_id: threadId,
                  session_id: session.session_id,
                  channel: 'mobile',
                  actor: {
                    type: 'user',
                    id: foundation.bootstrap.account.id,
                    display_name: foundation.bootstrap.account.displayName ?? foundation.bootstrap.account.email,
                  },
                  message: text,
                  attachments: [],
                  context_hints: {
                    source: 'mobile_workspace_chat_surface',
                    thread_id: threadId,
                    metadata,
                  },
                  execution_mode: 'sync',
                  response_mode: 'artifact',
                  policy_context: {},
                }),
              },
            });
          } else {
            throw error;
          }
        }

        const currentThread = foundation.services.queryClient.peek(threadQueryKey(threadId))
          ?? foundation.services.persistence.getJson(threadPersistenceKey(threadId))
          ?? {
            threadId,
            messages: [],
            title: 'Chat',
          };
        const nextMessages = [
          ...currentThread.messages,
          createUserMessage(text, threadId),
        ];
        const assistantMessage = createAssistantMessage(response, threadId);
        if (assistantMessage) {
          nextMessages.push(assistantMessage);
        }
        const thread = {
          ...currentThread,
          threadId: response?.thread_id ?? currentThread.threadId ?? threadId,
          messages: nextMessages,
        };
        writeWorkspaceSurfaceResource({
          foundation,
          queryKey: threadQueryKey(threadId),
          persistenceKey: threadPersistenceKey(threadId),
          data: thread,
        });
        foundation.services.persistence.remove(draftPersistenceKey(threadId));

        return {
          status: 'ready',
          statusMessage:
            Array.isArray(response?.approvals) && response.approvals.length > 0
              ? 'Turn submitted. Approval is waiting inline in this conversation.'
              : null,
          source: 'live',
          data: thread,
          turn: response,
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
