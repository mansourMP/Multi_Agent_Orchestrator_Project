'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationClientError,
  type WorkstationSessionActor,
  type WorkstationTurnResponse,
} from '@/lib/workspace/workstation-client';

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

const PRIMARY_THREAD_ID = 'primary';
const ACTIVE_THREAD_QUERY_KEY = 'chat:canonical:active-thread';
const RUNS_QUERY_KEY = 'chat:canonical:runs';
const APPROVALS_QUERY_KEY = 'chat:canonical:approvals';

function threadQueryKey(threadId: string): string {
  return `chat:canonical:thread:${threadId}`;
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
  return Array.isArray(items)
    ? items.filter((item): item is CanonicalRunSummary => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeCanonicalApprovalItems(payload: unknown): CanonicalApprovalSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is CanonicalApprovalSummary => Boolean(item) && typeof item === 'object')
    : [];
}

function createCanonicalAssistantMessage(
  response: WorkstationTurnResponse,
  threadId: string,
): CanonicalChatMessage | null {
  const reply = String(response.reply ?? '').trim();
  const approvals = Array.isArray(response.approvals) ? response.approvals : [];
  const interventions = Array.isArray(response.interventions) ? response.interventions : [];
  const runId = typeof response.run_id === 'string' ? response.run_id : null;
  const synthesizedReply = reply
    || (approvals.length > 0
      ? 'Approval is required before this run can continue.'
      : interventions.length > 0
        ? 'The run needs intervention before it can continue.'
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

function readApprovalLabel(item: Record<string, unknown>, fallback: string): string {
  return String(item.prompt ?? item.title ?? item.id ?? item.approval_id ?? fallback);
}

function readApprovalStatus(item: Record<string, unknown>): string {
  return String(item.status ?? 'pending');
}

function readInterventionLabel(item: Record<string, unknown>, fallback: string): string {
  return String(item.title ?? item.kind ?? item.code ?? item.id ?? fallback);
}

function readInterventionMessage(item: Record<string, unknown>): string {
  return String(item.message ?? item.detail ?? item.reason ?? 'Operator action is required.');
}

export function WorkstationChatPane() {
  const { bootstrap, routeManifest } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const actor = useMemo<WorkstationSessionActor>(() => ({
    type: 'user',
    id: bootstrap.account.id,
    display_name: bootstrap.account.displayName ?? bootstrap.account.email,
  }), [bootstrap.account.displayName, bootstrap.account.email, bootstrap.account.id]);

  const [activeThreadId, setActiveThreadId] = useState<string>(() =>
    services.queryClient.peek<string>(ACTIVE_THREAD_QUERY_KEY) ?? PRIMARY_THREAD_ID,
  );
  const [thread, setThread] = useState<CanonicalChatThreadState>(() =>
    services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(activeThreadId)) ?? {
      threadId: activeThreadId,
      title: 'Chat',
      messages: [],
    },
  );
  const [draft, setDraft] = useState('');
  const [runs, setRuns] = useState<CanonicalRunSummary[]>(
    () => services.queryClient.peek<CanonicalRunSummary[]>(RUNS_QUERY_KEY) ?? [],
  );
  const [approvals, setApprovals] = useState<CanonicalApprovalSummary[]>(
    () => services.queryClient.peek<CanonicalApprovalSummary[]>(APPROVALS_QUERY_KEY) ?? [],
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const writeThreadState = (nextThread: CanonicalChatThreadState) => {
    services.queryClient.set(threadQueryKey(nextThread.threadId), nextThread);
    services.queryClient.set(ACTIVE_THREAD_QUERY_KEY, nextThread.threadId);
    setActiveThreadId(nextThread.threadId);
    setThread(nextThread);
  };

  const writeOverview = ({
    nextRuns,
    nextApprovals,
  }: {
    nextRuns: CanonicalRunSummary[];
    nextApprovals: CanonicalApprovalSummary[];
  }) => {
    services.queryClient.set(RUNS_QUERY_KEY, nextRuns);
    services.queryClient.set(APPROVALS_QUERY_KEY, nextApprovals);
    setRuns(nextRuns);
    setApprovals(nextApprovals);
  };

  const loadThread = async (requestedThreadId = activeThreadId) => {
    const payload = await services.client.getThread({
      threadId: requestedThreadId,
      allowMissing: true,
    });
    const nextThread = normalizeCanonicalChatThread(payload, requestedThreadId);
    writeThreadState(nextThread);
    return nextThread;
  };

  const loadOverview = async () => {
    const runsRequest = services.client.listRuns({
      limit: 12,
    }).then(normalizeCanonicalRunItems);
    const approvalsRequest = routeManifest.routeIndex.approvals
      ? services.client.listApprovals({
          limit: 80,
        }).then(normalizeCanonicalApprovalItems)
      : Promise.resolve([]);

    const [nextRuns, nextApprovals] = await Promise.all([runsRequest, approvalsRequest]);
    writeOverview({ nextRuns, nextApprovals });
  };

  useEffect(() => {
    const cachedThread = services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(activeThreadId));
    if (cachedThread) {
      setThread(cachedThread);
    }
  }, [activeThreadId, services]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        await Promise.all([loadThread(activeThreadId), loadOverview()]);
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
  }, [activeThreadId, bootstrap.workspace.id, routeManifest.routeIndex.approvals, services]);

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    setIsSending(true);
    setStatusMessage(null);

    try {
      const { renewed, response } = await services.client.submitTurnWithSessionRetry({
        actor,
        threadId: activeThreadId,
        message,
        channel: 'web',
        source: 'workstation_chat_pane',
      });

      const nextThreadId = String(response.thread_id ?? activeThreadId);
      const nextMessages = [
        ...thread.messages,
        createCanonicalUserMessage(message, nextThreadId),
      ];
      const assistantMessage = createCanonicalAssistantMessage(response, nextThreadId);
      if (assistantMessage) {
        nextMessages.push(assistantMessage);
      }

      writeThreadState({
        ...thread,
        threadId: nextThreadId,
        messages: nextMessages,
      });
      setDraft('');
      await loadOverview();
      setStatusMessage(
        Array.isArray(response.approvals) && response.approvals.length > 0
          ? 'Turn submitted. Approval is now pending in the canonical approval queue.'
          : Array.isArray(response.interventions) && response.interventions.length > 0
            ? 'Turn submitted. Intervention is required before execution can continue.'
            : renewed
              ? 'Turn submitted after renewing the scoped workstation session.'
              : null,
      );
    } catch (error) {
      setStatusMessage(
        error instanceof WorkstationClientError || error instanceof Error
          ? error.message
          : 'Could not send this message.',
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main
      data-workstation-chat="pane"
      style={{
        minHeight: '100%',
        padding: '2rem 2.4rem',
        display: 'grid',
        gap: '1.5rem',
      }}
    >
      <header style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Chat</h1>
        <p style={{ margin: 0, maxWidth: '58rem', lineHeight: 1.6 }}>
          Pane 3 talks to the canonical runtime contract through the shared workstation client only.
        </p>
        <span style={{ color: '#475569', fontSize: '0.88rem' }}>
          Live kernel state: {streamState.notifications.unreadCount} notifications, {streamState.activity.totalCount} activity events.
        </span>
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
                void Promise.all([loadThread(activeThreadId), loadOverview()]).catch((error) => {
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
                    maxWidth: '88%',
                    padding: '0.85rem 1rem',
                    borderRadius: '1rem',
                    background: message.role === 'user' ? '#dbeafe' : '#e2e8f0',
                    display: 'grid',
                    gap: '0.45rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <strong style={{ textTransform: 'capitalize' }}>{message.role}</strong>
                    <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                      {message.status ?? 'completed'}
                    </span>
                  </div>

                  <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{message.content}</span>

                  {message.runId ? (
                    <div
                      style={{
                        display: 'inline-flex',
                        width: 'fit-content',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.28rem 0.6rem',
                        borderRadius: '999px',
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      Run {message.runId}
                    </div>
                  ) : null}

                  {message.approvals.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.45rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Approvals</strong>
                      {message.approvals.map((item, index) => {
                        const approval = item as Record<string, unknown>;
                        return (
                          <div
                            key={String(approval.approval_id ?? approval.id ?? `${message.id}:approval:${index}`)}
                            style={{
                              display: 'grid',
                              gap: '0.2rem',
                              padding: '0.7rem 0.8rem',
                              borderRadius: '0.85rem',
                              background: '#fff7ed',
                              border: '1px solid #fdba74',
                            }}
                          >
                            <strong style={{ color: '#9a3412' }}>
                              {readApprovalLabel(approval, `Approval ${index + 1}`)}
                            </strong>
                            <span style={{ color: '#9a3412', fontSize: '0.82rem' }}>
                              {readApprovalStatus(approval)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {message.interventions.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.45rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Interventions</strong>
                      {message.interventions.map((item, index) => {
                        const intervention = item as Record<string, unknown>;
                        return (
                          <div
                            key={String(intervention.id ?? intervention.code ?? `${message.id}:intervention:${index}`)}
                            style={{
                              display: 'grid',
                              gap: '0.2rem',
                              padding: '0.7rem 0.8rem',
                              borderRadius: '0.85rem',
                              background: '#ecfeff',
                              border: '1px solid #67e8f9',
                            }}
                          >
                            <strong style={{ color: '#155e75' }}>
                              {readInterventionLabel(intervention, `Intervention ${index + 1}`)}
                            </strong>
                            <span style={{ color: '#155e75', fontSize: '0.82rem', lineHeight: 1.5 }}>
                              {readInterventionMessage(intervention)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
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
              placeholder="Ask the canonical chat pane to do real work."
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
            <span style={{ color: '#475569', fontSize: '0.82rem' }}>
              Notifications stream {streamState.notifications.connectionState}
            </span>
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
            <span style={{ color: '#475569', fontSize: '0.82rem' }}>
              Activity stream {streamState.activity.connectionState}
            </span>
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
