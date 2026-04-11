'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import type { WorkspaceRouteId } from '@/lib/workspace/workspace-shell';

type WorkspaceFeatureViewMode = 'summary' | 'detail';

type WorkspaceFeatureState = {
  scopeKey: string;
  note: string;
  visitCount: number;
  lastOpenedAt: string | null;
  viewMode: WorkspaceFeatureViewMode;
};

type WorkspaceFeatureDefinition = {
  title: string;
  description: string;
  sectionTitle: string;
  sectionItems: string[];
};

type CanonicalChatMessage = {
  id: string;
  role: string;
  content: string;
  status: string | null;
  createdAt: string | null;
  runId: string | null;
  approvals: Record<string, unknown>[];
  interventions: Record<string, unknown>[];
  metadata: Record<string, unknown>;
};

type CanonicalChatThreadState = {
  threadId: string;
  title: string;
  messages: CanonicalChatMessage[];
};

type CanonicalSessionRecord = {
  session_id: string;
  workspace_id?: string;
  tenant_id?: string;
  channel?: string;
  actor?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: string;
};

type CanonicalTurnResponse = {
  status?: string;
  reply?: string;
  run_id?: string | null;
  thread_id?: string | null;
  session_id?: string | null;
  approvals?: Record<string, unknown>[];
  interventions?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
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

class WorkspaceSurfaceRequestError extends Error {
  readonly status: number;

  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = 'WorkspaceSurfaceRequestError';
    this.status = status;
    this.detail = detail;
  }
}

const FEATURE_DEFINITIONS: Record<WorkspaceRouteId, WorkspaceFeatureDefinition> = {
  chat: {
    title: 'Chat',
    description: 'Workspace-scoped conversation surface with local notes and route-safe continuity.',
    sectionTitle: 'Restored chat scaffolds',
    sectionItems: ['conversation context', 'draft note', 'manifest-gated entry'],
  },
  workstation: {
    title: 'Workstation',
    description: 'Document-oriented shell surface for split-pane work under the document workstation profile.',
    sectionTitle: 'Restored workstation scaffolds',
    sectionItems: ['document mode summary', 'workspace traits', 'profile-gated shell'],
  },
  runs: {
    title: 'Runs',
    description: 'Execution history surface bound to workspace runtime and scoped local state.',
    sectionTitle: 'Restored run scaffolds',
    sectionItems: ['runtime summary', 'visit state', 'route manifest gating'],
  },
  approvals: {
    title: 'Approvals',
    description: 'Approval review surface gated by backend capabilities instead of role strings.',
    sectionTitle: 'Restored approval scaffolds',
    sectionItems: ['approval capability checks', 'workspace review note', 'safe route fallback'],
  },
  artifacts: {
    title: 'Artifacts',
    description: 'Artifact/file surface with workspace-scoped persistence and disposable object URLs.',
    sectionTitle: 'Restored artifact scaffolds',
    sectionItems: ['artifact capability checks', 'download preview URL', 'scoped persistence'],
  },
  notifications: {
    title: 'Notifications',
    description: 'Notification surface using boundary-scoped realtime helpers and local workspace state.',
    sectionTitle: 'Restored notification scaffolds',
    sectionItems: ['poller registration', 'workspace-scoped activity note', 'safe route entry'],
  },
  applications: {
    title: 'Applications',
    description: 'Workspace application shelf running under the scoped workspace services layer.',
    sectionTitle: 'Restored application scaffolds',
    sectionItems: ['application surface note', 'workspace state', 'manifest-safe route'],
  },
  agents: {
    title: 'Agents',
    description: 'Agent/workbench surface for workspace-bound operator state.',
    sectionTitle: 'Restored agent scaffolds',
    sectionItems: ['agent inventory note', 'runtime targets', 'workspace-only store'],
  },
  activity: {
    title: 'Activity',
    description: 'Workspace activity view with local notes and manifest-driven route safety.',
    sectionTitle: 'Restored activity scaffolds',
    sectionItems: ['activity note', 'workspace timeline summary', 'boundary-only state'],
  },
  integrations: {
    title: 'Integrations',
    description: 'Integration surface rooted in workspace runtime and capability truth.',
    sectionTitle: 'Restored integration scaffolds',
    sectionItems: ['integration note', 'workspace capabilities', 'runtime attachment summary'],
  },
  settings: {
    title: 'Settings',
    description: 'Workspace settings surface derived from bootstrap truth and scoped services.',
    sectionTitle: 'Restored settings scaffolds',
    sectionItems: ['workspace settings note', 'entitlement summary', 'workspace-scoped persistence'],
  },
  admin: {
    title: 'Admin',
    description: 'Admin overview surface for operations workspaces only.',
    sectionTitle: 'Restored admin scaffolds',
    sectionItems: ['admin capability checks', 'ops route manifest', 'workspace-only admin note'],
  },
  'admin/billing': {
    title: 'Billing',
    description: 'Billing administration surface gated by billing capabilities.',
    sectionTitle: 'Restored billing scaffolds',
    sectionItems: ['billing capability checks', 'plan summary', 'workspace admin state'],
  },
  'admin/routing': {
    title: 'Routing',
    description: 'Routing administration surface gated by routing capabilities.',
    sectionTitle: 'Restored routing scaffolds',
    sectionItems: ['routing capability checks', 'deployment summary', 'workspace admin state'],
  },
  'admin/members': {
    title: 'Members',
    description: 'Membership administration surface with workspace-only notes and gating.',
    sectionTitle: 'Restored membership scaffolds',
    sectionItems: ['admin capability checks', 'workspace member note', 'safe route fallback'],
  },
  'admin/policies': {
    title: 'Policies',
    description: 'Policy administration surface for governance-heavy workspaces.',
    sectionTitle: 'Restored policy scaffolds',
    sectionItems: ['policy capability checks', 'compliance summary', 'workspace admin state'],
  },
};

function createDefaultFeatureState(
  featureId: WorkspaceRouteId,
  scopeKey: string,
  workspaceLabel: string,
): WorkspaceFeatureState {
  return {
    scopeKey,
    note: `${workspaceLabel} · ${FEATURE_DEFINITIONS[featureId].title}`,
    visitCount: 0,
    lastOpenedAt: null,
    viewMode: 'summary',
  };
}

function useWorkspaceFeatureState(featureId: WorkspaceRouteId) {
  const { bootstrap, routeManifest, shellProfile, hasCapability } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const featureDefinition = FEATURE_DEFINITIONS[featureId];
  const persistenceKey = `feature:${featureId}:surface`;
  const persistedState = useMemo(
    () => services.persistence.getJson<WorkspaceFeatureState>(persistenceKey),
    [persistenceKey, services],
  );
  const store = useMemo(
    () => services.stores.createStore<WorkspaceFeatureState>(
      `feature:${featureId}`,
      persistedState ?? createDefaultFeatureState(featureId, services.scopeKey, bootstrap.workspace.label),
    ),
    [bootstrap.workspace.label, featureId, persistedState, persistenceKey, services],
  );
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const route = routeManifest.routeIndex[featureId];
  const summary = useMemo(
    () => ({
      featureId,
      title: featureDefinition.title,
      workspaceId: bootstrap.workspace.id,
      workspaceLabel: bootstrap.workspace.label,
      shellProfileId: shellProfile.id,
      entitlementPlan: bootstrap.entitlements.plan,
      defaultRoute: routeManifest.defaultRoute,
      routeHref: route?.href ?? null,
      requiredCapabilities: route?.requiredCapabilities ?? [],
      servicesScopeKey: services.scopeKey,
    }),
    [
      bootstrap.entitlements.plan,
      bootstrap.workspace.id,
      bootstrap.workspace.label,
      featureDefinition.title,
      featureId,
      route,
      routeManifest.defaultRoute,
      services.scopeKey,
      shellProfile.id,
    ],
  );

  useEffect(() => {
    services.queryClient.set(`feature:${featureId}:summary`, summary);
  }, [featureId, services, summary]);

  useEffect(() => {
    const currentState = store.getState();
    store.setState({
      ...currentState,
      scopeKey: services.scopeKey,
      visitCount: currentState.visitCount + 1,
      lastOpenedAt: new Date().toISOString(),
    });
  }, [featureId, services.scopeKey, store]);

  useEffect(() => {
    services.persistence.setJson(persistenceKey, state);
  }, [persistenceKey, services, state]);

  const updateNote = (note: string) => {
    store.setState({
      ...store.getState(),
      note,
    });
  };

  const toggleViewMode = () => {
    const currentState = store.getState();
    store.setState({
      ...currentState,
      viewMode: currentState.viewMode === 'summary' ? 'detail' : 'summary',
    });
  };

  return {
    bootstrap,
    featureDefinition,
    hasCapability,
    route,
    routeManifest,
    services,
    shellProfile,
    state,
    summary,
    toggleViewMode,
    updateNote,
  };
}

function useArtifactPreviewUrl(featureId: WorkspaceRouteId, payload: unknown) {
  const services = useWorkspaceServices();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (featureId !== 'artifacts') {
      setUrl(null);
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const nextUrl = services.disposables.trackObjectUrl(URL.createObjectURL(blob));
    setUrl(nextUrl);
  }, [featureId, payload, services]);

  return url;
}

function useNotificationPoller(featureId: WorkspaceRouteId) {
  const services = useWorkspaceServices();
  const [pulseCount, setPulseCount] = useState(0);

  useEffect(() => {
    if (featureId !== 'notifications') {
      return;
    }

    return services.realtime.registerPoller(() => {
      setPulseCount((value) => value + 1);
    }, 30000);
  }, [featureId, services]);

  return pulseCount;
}

function normalizeCanonicalChatThread(
  payload: unknown,
  threadId: string,
): CanonicalChatThreadState {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const turns = Array.isArray(record.turns) ? record.turns : [];
  const messages = turns.flatMap((turn, index): CanonicalChatMessage[] => {
    if (!turn || typeof turn !== 'object') {
      return [];
    }
    const entry = turn as Record<string, unknown>;
    return [{
      id: String(entry.id ?? `${threadId}:message:${index}`),
      role: String(entry.role ?? 'assistant'),
      content: String(entry.content ?? ''),
      status: typeof entry.status === 'string' ? entry.status : null,
      createdAt: typeof entry.created_at === 'string' ? entry.created_at : null,
      runId: typeof entry.run_id === 'string' ? entry.run_id : null,
      approvals: Array.isArray(entry.approvals) ? entry.approvals as Record<string, unknown>[] : [],
      interventions: Array.isArray(entry.interventions) ? entry.interventions as Record<string, unknown>[] : [],
      metadata:
        entry.metadata && typeof entry.metadata === 'object'
          ? entry.metadata as Record<string, unknown>
          : {},
    }];
  });

  return {
    threadId: String(record.id ?? record.thread_id ?? threadId),
    title: String(record.title ?? 'Chat'),
    messages,
  };
}

function normalizeCanonicalRunItems(payload: unknown): CanonicalRunSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items) ? items.filter((item): item is CanonicalRunSummary => Boolean(item) && typeof item === 'object') : [];
}

function normalizeCanonicalApprovalItems(payload: unknown): CanonicalApprovalSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items) ? items.filter((item): item is CanonicalApprovalSummary => Boolean(item) && typeof item === 'object') : [];
}

async function requestWorkspaceJson<T>(
  services: ReturnType<typeof useWorkspaceServices>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await services.transport.request(path, init);
  let payload: unknown = null;
  const text = await response.text();
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in (payload as Record<string, unknown>)
        ? (payload as Record<string, unknown>).detail
        : payload;
    const message =
      typeof detail === 'string'
        ? detail
        : `Workspace transport request failed with status ${response.status}.`;
    throw new WorkspaceSurfaceRequestError(message, response.status, detail);
  }

  return payload as T;
}

function createCanonicalAssistantMessage(
  response: CanonicalTurnResponse,
  threadId: string,
): CanonicalChatMessage | null {
  const reply = String(response.reply ?? '').trim();
  const approvals = Array.isArray(response.approvals) ? response.approvals : [];
  const interventions = Array.isArray(response.interventions) ? response.interventions : [];
  const runId = typeof response.run_id === 'string' ? response.run_id : null;
  const synthesizedReply = reply
    || (approvals.length > 0
      ? 'Approval is required before this run can continue.'
      : runId
        ? 'Run accepted. Open the runs surface for status updates.'
        : `Turn ${String(response.status ?? 'completed')}.`);

  if (!synthesizedReply.trim()) {
    return null;
  }

  return {
    id: `${threadId}:assistant:${Date.now()}`,
    role: 'assistant',
    content: synthesizedReply,
    status: typeof response.status === 'string' ? response.status : 'completed',
    createdAt: new Date().toISOString(),
    runId,
    approvals,
    interventions,
    metadata:
      response.metadata && typeof response.metadata === 'object'
        ? response.metadata as Record<string, unknown>
        : {},
  };
}

function createCanonicalUserMessage(text: string, threadId: string): CanonicalChatMessage {
  return {
    id: `${threadId}:user:${Date.now()}`,
    role: 'user',
    content: text,
    status: 'completed',
    createdAt: new Date().toISOString(),
    runId: null,
    approvals: [],
    interventions: [],
    metadata: {},
  };
}

function buildCanonicalTurnRequestBody({
  bootstrap,
  sessionId,
  threadId,
  message,
}: {
  bootstrap: ReturnType<typeof useWorkspaceBoundary>['bootstrap'];
  sessionId: string;
  threadId: string;
  message: string;
}) {
  return {
    tenant_id: bootstrap.workspace.tenantId,
    workspace_id: bootstrap.workspace.id,
    thread_id: threadId,
    session_id: sessionId,
    channel: 'web',
    actor: {
      type: 'user',
      id: bootstrap.account.id,
      display_name: bootstrap.account.displayName ?? bootstrap.account.email,
    },
    message,
    attachments: [],
    context_hints: {
      source: 'workspace_surface_chat',
      thread_id: threadId,
    },
    execution_mode: 'sync',
    response_mode: 'artifact',
    policy_context: {},
  };
}

function WorkspaceCanonicalChatSurface() {
  const { bootstrap, routeManifest } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const threadId = 'primary';
  const threadQueryKey = `chat:canonical:thread:${threadId}`;
  const threadPersistenceKey = `chat:canonical:thread:${threadId}`;
  const draftPersistenceKey = `chat:canonical:draft:${threadId}`;
  const sessionPersistenceKey = `chat:canonical:session:${threadId}`;
  const runsQueryKey = 'chat:canonical:runs';
  const approvalsQueryKey = 'chat:canonical:approvals';

  const initialThread = services.persistence.getJson<CanonicalChatThreadState>(threadPersistenceKey) ?? {
    threadId,
    title: 'Chat',
    messages: [],
  };
  const initialDraft = services.persistence.getJson<{ text?: string }>(draftPersistenceKey)?.text ?? '';
  const initialRuns = services.persistence.getJson<CanonicalRunSummary[]>(runsQueryKey) ?? [];
  const initialApprovals = services.persistence.getJson<CanonicalApprovalSummary[]>(approvalsQueryKey) ?? [];

  const [thread, setThread] = useState<CanonicalChatThreadState>(initialThread);
  const [draft, setDraft] = useState(initialDraft);
  const [runs, setRuns] = useState<CanonicalRunSummary[]>(initialRuns);
  const [approvals, setApprovals] = useState<CanonicalApprovalSummary[]>(initialApprovals);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (draft.trim()) {
      services.persistence.setJson(draftPersistenceKey, {
        text: draft,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    services.persistence.remove(draftPersistenceKey);
  }, [draft, draftPersistenceKey, services]);

  const writeThreadState = (nextThread: CanonicalChatThreadState) => {
    services.queryClient.set(threadQueryKey, nextThread);
    services.persistence.setJson(threadPersistenceKey, nextThread);
    setThread(nextThread);
  };

  const writeOverview = ({
    nextRuns,
    nextApprovals,
  }: {
    nextRuns: CanonicalRunSummary[];
    nextApprovals: CanonicalApprovalSummary[];
  }) => {
    services.queryClient.set(runsQueryKey, nextRuns);
    services.persistence.setJson(runsQueryKey, nextRuns);
    services.queryClient.set(approvalsQueryKey, nextApprovals);
    services.persistence.setJson(approvalsQueryKey, nextApprovals);
    setRuns(nextRuns);
    setApprovals(nextApprovals);
  };

  const loadThread = async () => {
    const payload = await requestWorkspaceJson<Record<string, unknown> | null>(
      services,
      `/api/threads/${encodeURIComponent(threadId)}`,
    ).catch((error) => {
      if (error instanceof WorkspaceSurfaceRequestError && error.status === 404) {
        return null;
      }
      throw error;
    });
    const nextThread = normalizeCanonicalChatThread(payload, threadId);
    writeThreadState(nextThread);
    return nextThread;
  };

  const loadOverview = async () => {
    const runsRequest = requestWorkspaceJson<Record<string, unknown>>(
      services,
      `/api/runs?workspace_id=${encodeURIComponent(bootstrap.workspace.id)}&limit=12`,
    ).then(normalizeCanonicalRunItems);
    const approvalsRequest = routeManifest.routeIndex.approvals
      ? requestWorkspaceJson<Record<string, unknown>>(
          services,
          `/api/approvals?workspace_id=${encodeURIComponent(bootstrap.workspace.id)}`,
        ).then(normalizeCanonicalApprovalItems)
      : Promise.resolve([]);
    const [nextRuns, nextApprovals] = await Promise.all([runsRequest, approvalsRequest]);
    writeOverview({ nextRuns, nextApprovals });
  };

  const ensureSession = async (forceNew = false) => {
    if (!forceNew) {
      const cachedSession =
        services.queryClient.peek<CanonicalSessionRecord>(sessionPersistenceKey)
        ?? services.persistence.getJson<CanonicalSessionRecord>(sessionPersistenceKey);
      if (cachedSession?.session_id) {
        return cachedSession;
      }
    }

    const session = await requestWorkspaceJson<CanonicalSessionRecord>(
      services,
      '/api/sessions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: bootstrap.workspace.tenantId,
          workspace_id: bootstrap.workspace.id,
          channel: 'web',
          actor: {
            type: 'user',
            id: bootstrap.account.id,
            display_name: bootstrap.account.displayName ?? bootstrap.account.email,
          },
          metadata: {
            thread_id: threadId,
            source: 'workspace_surface_chat',
          },
        }),
      },
    );
    services.queryClient.set(sessionPersistenceKey, session);
    services.persistence.setJson(sessionPersistenceKey, session);
    return session;
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        await Promise.all([loadThread(), loadOverview()]);
        if (!cancelled) {
          setStatusMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
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
  }, [bootstrap.workspace.id, routeManifest.routeIndex.approvals, services]);

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    setIsSending(true);
    setStatusMessage(null);

    try {
      let session = await ensureSession(false);
      let response: CanonicalTurnResponse;

      try {
        response = await requestWorkspaceJson<CanonicalTurnResponse>(
          services,
          '/api/turn',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify(
              buildCanonicalTurnRequestBody({
                bootstrap,
                sessionId: String(session.session_id),
                threadId,
                message,
              }),
            ),
          },
        );
      } catch (error) {
        if (error instanceof WorkspaceSurfaceRequestError && error.status === 409) {
          session = await ensureSession(true);
          response = await requestWorkspaceJson<CanonicalTurnResponse>(
            services,
            '/api/turn',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify(
                buildCanonicalTurnRequestBody({
                  bootstrap,
                  sessionId: String(session.session_id),
                  threadId,
                  message,
                }),
              ),
            },
          );
        } else {
          throw error;
        }
      }

      const nextMessages = [
        ...thread.messages,
        createCanonicalUserMessage(message, threadId),
      ];
      const assistantMessage = createCanonicalAssistantMessage(response, threadId);
      if (assistantMessage) {
        nextMessages.push(assistantMessage);
      }

      writeThreadState({
        ...thread,
        threadId: String(response.thread_id ?? thread.threadId ?? threadId),
        messages: nextMessages,
      });
      setDraft('');
      services.persistence.remove(draftPersistenceKey);
      await loadOverview();
      setStatusMessage(
        Array.isArray(response.approvals) && response.approvals.length > 0
          ? 'Turn submitted. Approval is now pending in the canonical approval queue.'
          : null,
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not send this message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem 3rem',
        display: 'grid',
        gap: '1.5rem',
      }}
    >
      <header style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Chat</h1>
        <p style={{ margin: 0, maxWidth: '58rem', lineHeight: 1.6 }}>
          This surface talks to the canonical runtime contract through <code>/api/sessions</code>, <code>/api/turn</code>, <code>/api/runs</code>, and <code>/api/approvals</code>.
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(18rem, 1fr)',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: '0.85rem',
            padding: '1rem',
            borderRadius: '1rem',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: '0.25rem' }}>
              <strong>{bootstrap.workspace.label}</strong>
              <span style={{ color: '#475569' }}>
                Thread <code>{thread.threadId}</code> scoped to <code>{services.scopeKey}</code>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                void Promise.all([loadThread(), loadOverview()]).catch((error) => {
                  setStatusMessage(error instanceof Error ? error.message : 'Refresh failed.');
                });
              }}
              style={{
                border: '1px solid #94a3b8',
                borderRadius: '999px',
                background: '#f8fafc',
                padding: '0.45rem 0.8rem',
                cursor: 'pointer',
              }}
            >
              Refresh thread
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '0.75rem',
              padding: '0.75rem',
              borderRadius: '0.85rem',
              background: '#f8fafc',
              minHeight: '22rem',
            }}
          >
            {isLoading && thread.messages.length === 0 ? (
              <p style={{ margin: 0, color: '#475569' }}>Loading canonical thread history…</p>
            ) : null}
            {thread.messages.length === 0 ? (
              <p style={{ margin: 0, color: '#475569' }}>
                No turns have been written yet. The first send will create the canonical thread history.
              </p>
            ) : (
              thread.messages.map((message) => (
                <article
                  key={message.id}
                  style={{
                    justifySelf: message.role === 'user' ? 'end' : 'start',
                    maxWidth: '85%',
                    padding: '0.85rem 1rem',
                    borderRadius: '1rem',
                    background: message.role === 'user' ? '#dbeafe' : '#e2e8f0',
                    display: 'grid',
                    gap: '0.35rem',
                  }}
                >
                  <strong style={{ textTransform: 'capitalize' }}>{message.role}</strong>
                  <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{message.content}</span>
                  <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                    {message.status ?? 'completed'}
                    {message.runId ? ` · run ${message.runId}` : ''}
                  </span>
                </article>
              ))
            )}
          </div>

          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ fontWeight: 600 }}>Message</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              rows={5}
              placeholder="Ask the canonical chat surface to do real work."
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: '0.85rem',
                border: '1px solid #cbd5e1',
                padding: '0.8rem 0.9rem',
                font: 'inherit',
              }}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ color: statusMessage ? '#92400e' : '#475569' }}>
              {statusMessage ?? 'Canonical chat is ready.'}
            </span>
            <button
              type="button"
              onClick={() => {
                void sendMessage();
              }}
              disabled={isSending || !draft.trim()}
              style={{
                border: '1px solid #0f172a',
                borderRadius: '999px',
                background: isSending || !draft.trim() ? '#cbd5e1' : '#0f172a',
                color: '#ffffff',
                padding: '0.55rem 0.95rem',
                cursor: isSending || !draft.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {isSending ? 'Sending…' : 'Send canonical turn'}
            </button>
          </div>
        </div>

        <aside
          style={{
            display: 'grid',
            gap: '1rem',
          }}
        >
          <section
            style={{
              display: 'grid',
              gap: '0.65rem',
              padding: '1rem',
              borderRadius: '1rem',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
            }}
          >
            <strong>Recent runs</strong>
            {runs.length === 0 ? (
              <span style={{ color: '#475569' }}>No live runs recorded for this workspace yet.</span>
            ) : runs.slice(0, 5).map((item) => (
              <div key={String(item.run_id ?? JSON.stringify(item))} style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontWeight: 600 }}>{String(item.run_id ?? 'run')}</span>
                <span style={{ color: '#475569' }}>{String(item.status ?? 'unknown')}</span>
              </div>
            ))}
            <Link href={routeManifest.routeIndex.runs?.href ?? routeManifest.defaultRoute}>Open runs</Link>
          </section>

          <section
            style={{
              display: 'grid',
              gap: '0.65rem',
              padding: '1rem',
              borderRadius: '1rem',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
            }}
          >
            <strong>Pending approvals</strong>
            {approvals.length === 0 ? (
              <span style={{ color: '#475569' }}>No pending approvals for this workspace.</span>
            ) : approvals.slice(0, 5).map((item) => (
              <div key={String(item.approval_id ?? item.id ?? JSON.stringify(item))} style={{ display: 'grid', gap: '0.2rem' }}>
                <span style={{ fontWeight: 600 }}>{String(item.prompt ?? item.id ?? 'approval')}</span>
                <span style={{ color: '#475569' }}>{String(item.status ?? 'pending')}</span>
              </div>
            ))}
            <Link href={routeManifest.routeIndex.approvals?.href ?? routeManifest.defaultRoute}>Open approvals</Link>
          </section>
        </aside>
      </section>
    </main>
  );
}

export function WorkspaceFeatureSurface({
  featureId,
}: {
  featureId: WorkspaceRouteId;
}) {
  if (featureId === 'chat') {
    return <WorkspaceCanonicalChatSurface />;
  }

  return <WorkspaceFeatureScaffold featureId={featureId} />;
}

function WorkspaceFeatureScaffold({
  featureId,
}: {
  featureId: WorkspaceRouteId;
}) {
  const {
    bootstrap,
    featureDefinition,
    hasCapability,
    route,
    routeManifest,
    services,
    shellProfile,
    state,
    summary,
    toggleViewMode,
    updateNote,
  } = useWorkspaceFeatureState(featureId);
  const artifactPreviewUrl = useArtifactPreviewUrl(featureId, summary);
  const notificationPulseCount = useNotificationPoller(featureId);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem 3rem',
        display: 'grid',
        gap: '1.5rem',
      }}
    >
      <header style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>{featureDefinition.title}</h1>
        <p style={{ margin: 0, maxWidth: '58rem', lineHeight: 1.6 }}>
          {featureDefinition.description}
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
          gap: '0.9rem',
        }}
      >
        <SummaryCard label="Workspace" value={bootstrap.workspace.label} />
        <SummaryCard label="Shell Profile" value={shellProfile.label} />
        <SummaryCard label="Plan" value={bootstrap.entitlements.label} />
        <SummaryCard label="Route" value={route?.href ?? routeManifest.defaultRoute} />
      </section>

      <section
        style={{
          display: 'grid',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: '1rem',
          border: '1px solid #cbd5e1',
          background: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <strong>{featureDefinition.sectionTitle}</strong>
            <span style={{ color: '#475569' }}>
              Workspace-only state stored under <code>{services.scopeKey}</code>
            </span>
          </div>
          <button
            type="button"
            onClick={toggleViewMode}
            style={{
              border: '1px solid #94a3b8',
              borderRadius: '999px',
              background: '#f8fafc',
              padding: '0.45rem 0.8rem',
              cursor: 'pointer',
            }}
          >
            Toggle view: {state.viewMode}
          </button>
        </div>

        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.35rem' }}>
          {featureDefinition.sectionItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <label style={{ display: 'grid', gap: '0.45rem' }}>
          <span style={{ fontWeight: 600 }}>Workspace note</span>
          <textarea
            value={state.note}
            onChange={(event) => updateNote(event.currentTarget.value)}
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              borderRadius: '0.85rem',
              border: '1px solid #cbd5e1',
              padding: '0.8rem 0.9rem',
              font: 'inherit',
            }}
          />
        </label>
      </section>

      <section
        style={{
          display: 'grid',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: '1rem',
          border: '1px solid #cbd5e1',
          background: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            ['approvals_enabled', 'Approvals'],
            ['artifacts_enabled', 'Artifacts'],
            ['document_workstation_enabled', 'Workstation'],
            ['workspace_admin_enabled', 'Admin'],
            ['billing_read_enabled', 'Billing'],
            ['routing_read_enabled', 'Routing'],
          ].map(([capability, label]) => (
            <CapabilityPill
              key={capability}
              label={label}
              enabled={hasCapability(capability)}
            />
          ))}
        </div>
        <pre
          style={{
            margin: 0,
            padding: '1rem',
            borderRadius: '0.85rem',
            background: '#0f172a',
            color: '#e2e8f0',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(
            {
              summary,
              state,
              routeManifest,
              serviceSnapshot: services.snapshot(),
              notificationPulseCount,
            },
            null,
            2,
          )}
        </pre>
        {artifactPreviewUrl ? (
          <Link href={artifactPreviewUrl} download={`${featureId}-${bootstrap.workspace.id}.json`}>
            Download artifact preview
          </Link>
        ) : null}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: '1rem',
        borderRadius: '1rem',
        border: '1px solid #cbd5e1',
        background: '#ffffff',
        display: 'grid',
        gap: '0.35rem',
      }}
    >
      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CapabilityPill({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.35rem 0.7rem',
        borderRadius: '999px',
        background: enabled ? '#dcfce7' : '#e2e8f0',
        color: enabled ? '#166534' : '#334155',
        fontSize: '0.85rem',
        fontWeight: 600,
      }}
    >
      {label}: {enabled ? 'enabled' : 'blocked'}
    </span>
  );
}
