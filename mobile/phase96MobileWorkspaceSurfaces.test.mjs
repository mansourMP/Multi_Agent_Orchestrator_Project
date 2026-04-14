import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialAccountShellState,
  reduceAccountShellState,
} from './src/lib/shell/account-shell-store.js';
import { createMemoryKeyValueStorage } from './src/lib/storage/memory-key-value-storage.js';
import { createMobileWorkspaceFoundation } from './src/lib/mobile-foundation.js';
import {
  buildMobileWorkspaceShellModel,
  createMobileWorkspaceSurfaceSet,
} from './src/lib/mobile-workspace-surfaces.js';

function createMembership({
  workspaceId,
  label,
  kind = 'personal',
  role = 'member',
  permissions = ['chat.read'],
  membershipVersion = 'v1',
  defaultRoute = 'chat',
  preferredShellProfileId = null,
}) {
  return {
    workspace: {
      id: workspaceId,
      tenantId: `tenant-${workspaceId}`,
      label,
      kind,
    },
    role,
    permissions,
    membershipVersion,
    defaultRoute,
    preferredShellProfileId,
  };
}

function createBootstrap({
  accountId = 'acct_1',
  workspaceId = 'ws_personal',
  label = 'Personal',
  kind = 'personal',
  role = 'member',
  permissions = ['chat.read'],
  capabilities = {},
  defaultRoute = 'chat',
  preferredProfile = 'personal_shell',
} = {}) {
  return {
    account: {
      id: accountId,
      email: 'user@example.com',
      displayName: 'User',
    },
    workspace: {
      id: workspaceId,
      tenantId: `tenant-${workspaceId}`,
      label,
      kind,
    },
    membership: {
      role,
      permissions,
      version: `membership-${workspaceId}`,
    },
    capabilities: {
      approvals_enabled: false,
      artifacts_enabled: false,
      document_workstation_enabled: false,
      workspace_admin_enabled: false,
      billing_read_enabled: false,
      routing_read_enabled: false,
      ...capabilities,
    },
    entitlements: {
      plan: 'personal',
      label: 'Personal',
      source: 'test',
      flags: {
        mobile_enabled: true,
      },
      limits: {
        message_history_days: 30,
      },
    },
    workspaceTraits: {},
    runtime: {
      deploymentMode: 'cloud_default',
      runtimeTargets: [
        {
          id: 'cloud_default',
          label: 'Cloud Default',
          kind: 'cloud_default',
          online: true,
          preferred: true,
        },
      ],
    },
    shellHints: {
      defaultRoute,
      preferredProfile,
    },
  };
}

function createAccountState() {
  const initial = createInitialAccountShellState();
  const hydrated = reduceAccountShellState(initial, {
    type: 'hydrate_session',
    payload: {
      session: {
        accountId: 'acct_1',
        apiBaseUrl: 'https://api.empyralis.example',
        accessToken: 'token',
      },
      account: {
        id: 'acct_1',
        email: 'user@example.com',
      },
      workspaceMemberships: [
        createMembership({
          workspaceId: 'ws_personal',
          label: 'Personal',
          kind: 'personal',
        }),
        createMembership({
          workspaceId: 'ws_law',
          label: 'Law Firm',
          kind: 'enterprise',
          role: 'viewer',
          defaultRoute: 'runs',
        }),
        createMembership({
          workspaceId: 'ws_ops',
          label: 'Side Business',
          kind: 'side_business',
          role: 'admin',
          defaultRoute: 'approvals',
        }),
      ],
    },
  });
  const rememberedLaw = reduceAccountShellState(hydrated, {
    type: 'remember_workspace_route',
    workspaceId: 'ws_law',
    route: 'runs',
  });
  return reduceAccountShellState(rememberedLaw, {
    type: 'remember_workspace_route',
    workspaceId: 'ws_ops',
    route: 'approvals',
  });
}

function createFetchRouter(routes) {
  return async (url, init = {}) => {
    const requestUrl = new URL(url);
    const method = (init.method ?? 'GET').toUpperCase();
    const key = `${method} ${requestUrl.pathname}${requestUrl.search}`;
    const handler = routes[key] ?? routes[`${method} ${requestUrl.pathname}`];

    if (!handler) {
      throw new Error(`Unhandled test route: ${key}`);
    }

    const payload = await handler({
      url: requestUrl,
      init,
      headers: init.headers instanceof Headers ? init.headers : new Headers(init.headers ?? {}),
      body: init.body ? JSON.parse(init.body) : null,
    });

    return {
      ok: payload.status ? payload.status < 400 : true,
      status: payload.status ?? 200,
      async json() {
        return payload.json ?? payload;
      },
      async text() {
        const body = payload.json ?? payload;
        if (body === null || body === undefined) {
          return '';
        }
        return typeof body === 'string' ? body : JSON.stringify(body);
      },
    };
  };
}

test('workspace switcher loads workspace foundation safely and restores only allowed routes', async () => {
  const storage = createMemoryKeyValueStorage();
  const accountState = createAccountState();
  const currentFoundation = createMobileWorkspaceFoundation({
    session: accountState.session,
    bootstrap: createBootstrap({
      workspaceId: 'ws_personal',
      label: 'Personal',
    }),
    storage,
  });

  let disposed = false;
  const originalDispose = currentFoundation.dispose.bind(currentFoundation);
  currentFoundation.dispose = () => {
    disposed = true;
    originalDispose();
  };

  const fetchImpl = createFetchRouter({
    'GET /api/workspaces/ws_law/bootstrap': () => ({
      json: createBootstrap({
        workspaceId: 'ws_law',
        label: 'Law Firm',
        kind: 'enterprise',
        role: 'viewer',
        capabilities: {
          document_workstation_enabled: true,
        },
        defaultRoute: 'runs',
        preferredProfile: 'document_workstation_shell',
      }),
    }),
    'GET /api/workspaces/ws_ops/bootstrap': () => ({
      json: createBootstrap({
        workspaceId: 'ws_ops',
        label: 'Side Business',
        kind: 'side_business',
        role: 'admin',
        capabilities: {
          workspace_admin_enabled: false,
        },
        defaultRoute: 'chat',
        preferredProfile: 'personal_shell',
      }),
    }),
  });

  const surfaces = createMobileWorkspaceSurfaceSet({
    accountState,
    foundation: currentFoundation,
    storage,
    fetchImpl,
  });

  const lawSwitch = await surfaces.workspaceSwitcher.switchWorkspace('ws_law');
  assert.equal(disposed, true);
  assert.equal(lawSwitch.workspaceId, 'ws_law');
  assert.equal(lawSwitch.targetRouteId, 'runs');
  assert.equal(lawSwitch.targetScreen, '/(workspace)/runs');
  assert.equal(lawSwitch.shellProfileId, 'document_workstation_shell');

  const opsSwitch = await surfaces.workspaceSwitcher.switchWorkspace('ws_ops');
  assert.equal(opsSwitch.targetRouteId, 'chat');
});

test('chat surface stays workspace-scoped and preserves drafts honestly on cloud failure', async () => {
  const storage = createMemoryKeyValueStorage();
  const bootstrap = createBootstrap({
    workspaceId: 'ws_law',
    label: 'Law Firm',
    kind: 'enterprise',
    role: 'viewer',
    capabilities: {
      document_workstation_enabled: true,
    },
    defaultRoute: 'chat',
    preferredProfile: 'document_workstation_shell',
  });

  const liveCalls = [];
  const turnBodies = [];
  const liveFoundation = createMobileWorkspaceFoundation({
    session: {
      accountId: 'acct_1',
      apiBaseUrl: 'https://api.empyralis.example',
      accessToken: 'token',
    },
    bootstrap,
    storage,
    fetchImpl: createFetchRouter({
      'GET /api/threads/primary': ({ headers }) => {
        liveCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: {
            id: 'primary',
            title: 'Law workspace chat',
            turns: [
              {
                id: 'm1',
                role: 'assistant',
                content: 'Welcome to the law workspace.',
              },
            ],
          },
        };
      },
      'POST /api/sessions': ({ headers, body }) => {
        liveCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: {
            session_id: 'session-primary',
            workspace_id: body.workspace_id,
            tenant_id: body.tenant_id,
            channel: body.channel,
            metadata: body.metadata,
            status: 'active',
          },
        };
      },
      'POST /api/turn': ({ headers, body }) => {
        liveCalls.push(headers.get('x-empyralis-workspace-id'));
        turnBodies.push(body);
        return {
          json: {
            status: 'completed',
            thread_id: body.thread_id,
            session_id: body.session_id,
            reply: `Canonical reply: ${body.message}`,
            approvals: [],
            interventions: [],
            metadata: { kind: 'sync_reply' },
          },
        };
      },
    }),
  });

  const liveChat = createMobileWorkspaceSurfaceSet({
    accountState: createAccountState(),
    foundation: liveFoundation,
    storage,
  }).chat;

  const threadResult = await liveChat.loadThread({ threadId: 'primary', refresh: true });
  assert.equal(threadResult.status, 'ready');
  assert.equal(threadResult.data.messages.length, 1);

  const sendResult = await liveChat.sendMessage({
    threadId: 'primary',
    text: 'Draft motion status?',
  });
  assert.equal(sendResult.status, 'ready');
  assert.equal(sendResult.data.messages.at(-2).content, 'Draft motion status?');
  assert.equal(sendResult.data.messages.at(-1).content, 'Canonical reply: Draft motion status?');
  assert.equal(liveChat.getDraft('primary'), null);
  assert.deepEqual(liveCalls, ['ws_law', 'ws_law', 'ws_law']);
  assert.equal(turnBodies.length, 1);
  assert.deepEqual(turnBodies[0], {
    tenant_id: 'tenant-ws_law',
    workspace_id: 'ws_law',
    thread_id: 'primary',
    session_id: 'session-primary',
    channel: 'mobile',
    actor: {
      type: 'user',
      id: 'acct_1',
      display_name: 'User',
    },
    message: 'Draft motion status?',
    attachments: [],
    context_hints: {
      source: 'mobile_workspace_chat_surface',
      thread_id: 'primary',
      metadata: {},
    },
    execution_mode: 'sync',
    response_mode: 'artifact',
    policy_context: {},
  });

  const failingFoundation = createMobileWorkspaceFoundation({
    session: {
      accountId: 'acct_1',
      apiBaseUrl: 'https://api.empyralis.example',
      accessToken: 'token',
    },
    bootstrap,
    storage,
    fetchImpl: createFetchRouter({
      'GET /api/threads/primary': () => ({
        status: 503,
        json: {
          error: 'offline',
        },
      }),
      'POST /api/sessions': () => ({
        json: {
          session_id: 'session-primary',
          workspace_id: 'ws_law',
          tenant_id: 'tenant-ws_law',
          channel: 'mobile',
          metadata: {
            thread_id: 'primary',
          },
        },
      }),
      'POST /api/turn': () => ({
        status: 503,
        json: {
          error: 'offline',
        },
      }),
    }),
  });

  const degradedChat = createMobileWorkspaceSurfaceSet({
    accountState: createAccountState(),
    foundation: failingFoundation,
    storage,
  }).chat;

  const degradedThread = await degradedChat.loadThread({ threadId: 'primary', refresh: true });
  assert.equal(degradedThread.status, 'degraded');
  assert.equal(degradedThread.data.messages.length, 3);

  const failedSend = await degradedChat.sendMessage({
    threadId: 'primary',
    text: 'This should stay as draft',
  });
  assert.equal(failedSend.status, 'error');
  assert.match(failedSend.statusMessage, /Draft preserved locally/);
  assert.equal(degradedChat.getDraft('primary').text, 'This should stay as draft');
});

test('runs and approvals surface uses capability gating and workspace-scoped persistence', async () => {
  const storage = createMemoryKeyValueStorage();
  const accountState = createAccountState();
  const opsCalls = [];
  const opsFoundation = createMobileWorkspaceFoundation({
    session: accountState.session,
    bootstrap: createBootstrap({
      workspaceId: 'ws_ops',
      label: 'Side Business',
      kind: 'side_business',
      role: 'admin',
      capabilities: {
        approvals_enabled: true,
        workspace_admin_enabled: true,
      },
      defaultRoute: 'approvals',
      preferredProfile: 'operations_admin_shell',
    }),
    storage,
    fetchImpl: createFetchRouter({
      'GET /api/runs?workspace_id=ws_ops': ({ headers }) => {
        opsCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: {
            runs: [{ id: 'run_1', status: 'running' }],
          },
        };
      },
      'GET /api/agent-traces?workspace_id=ws_ops': ({ headers }) => {
        opsCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: {
            items: [{ id: 'trace_ops_1', root_agent_id: 'sage', outcome: 'success' }],
          },
        };
      },
      'GET /api/approvals?workspace_id=ws_ops': ({ headers }) => {
        opsCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: {
            approvals: [{ id: 'approval_1', status: 'pending' }],
          },
        };
      },
      'POST /api/approvals/approval_1/resolve': ({ headers, body }) => {
        opsCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: {
            id: 'approval_1',
            status: body.decision,
          },
        };
      },
    }),
  });

  const opsSurface = createMobileWorkspaceSurfaceSet({
    accountState,
    foundation: opsFoundation,
    storage,
  }).runsApprovals;
  const opsOverview = await opsSurface.loadOverview({ refresh: true });
  assert.equal(opsOverview.status, 'ready');
  assert.equal(opsOverview.runs.length, 1);
  assert.equal(opsOverview.traces.length, 1);
  assert.equal(opsOverview.approvals.length, 1);

  const approvalResult = await opsSurface.respondToApproval({
    approvalId: 'approval_1',
    decision: 'approved',
  });
  assert.equal(approvalResult.status, 'ready');
  assert.equal(approvalResult.resolvedApproval.status, 'approved');
  assert.equal(approvalResult.approvals.length, 0);
  assert.equal(
    storage.getItem('empyralis.mobile.v2:acct_1:ws_ops:persist:approvals:list') !== null,
    true,
  );
  assert.deepEqual(opsCalls, ['ws_ops', 'ws_ops', 'ws_ops', 'ws_ops']);

  const personalFoundation = createMobileWorkspaceFoundation({
    session: accountState.session,
    bootstrap: createBootstrap({
      workspaceId: 'ws_personal',
      label: 'Personal',
    }),
    storage,
    fetchImpl: createFetchRouter({
      'GET /api/runs?workspace_id=ws_personal': () => ({
        json: [{ id: 'run_personal', status: 'idle' }],
      }),
      'GET /api/agent-traces?workspace_id=ws_personal': () => ({
        json: {
          items: [],
        },
      }),
    }),
  });
  const personalSurface = createMobileWorkspaceSurfaceSet({
    accountState,
    foundation: personalFoundation,
    storage,
  }).runsApprovals;
  const personalOverview = await personalSurface.loadOverview({ refresh: true });
  assert.equal(personalSurface.approvalsAvailable, false);
  assert.equal(personalOverview.approvals.length, 0);
});

test('runs surface combines trace replay records with runs and loads trace replay detail', async () => {
  const storage = createMemoryKeyValueStorage();
  const accountState = createAccountState();
  const opsCalls = [];
  const traceReplayPayload = {
    trace: {
      id: 'trace_1',
      workspace_id: 'ws_ops',
      tenant_id: 'tenant-ws_ops',
      root_agent_id: 'sage',
      surface: 'mobile',
      runtime_target: 'cloud',
      provider: 'openai',
      model: 'gpt-5.4',
      started_at: '2026-04-13T09:10:00Z',
      finished_at: '2026-04-13T09:10:05Z',
      outcome: 'success',
    },
    events: [
      {
        id: 'evt_1',
        seq: 1,
        event_type: 'plan.started',
        ts: '2026-04-13T09:10:00Z',
        persisted: true,
        data: {
          title: 'Sage Plan',
          summary: 'Review the request and produce a grounded answer.',
        },
      },
      {
        id: 'evt_2',
        seq: 2,
        event_type: 'tool.result',
        ts: '2026-04-13T09:10:02Z',
        persisted: true,
        data: {
          status: 'ok',
          summary: 'Collected one reference.',
        },
      },
      {
        id: 'evt_3',
        seq: 3,
        event_type: 'artifact.created',
        ts: '2026-04-13T09:10:04Z',
        persisted: true,
        data: {
          kind: 'report',
          title: 'Trace report',
        },
      },
    ],
  };

  const foundation = createMobileWorkspaceFoundation({
    session: accountState.session,
    bootstrap: createBootstrap({
      workspaceId: 'ws_ops',
      label: 'Side Business',
      kind: 'side_business',
      role: 'admin',
      capabilities: {
        approvals_enabled: true,
      },
      defaultRoute: 'runs',
      preferredProfile: 'operations_admin_shell',
    }),
    storage,
    fetchImpl: createFetchRouter({
      'GET /api/runs?workspace_id=ws_ops': ({ headers }) => {
        opsCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: {
            runs: [
              {
                id: 'run_1',
                status: 'completed',
                created_at: '2026-04-13T09:00:00Z',
                summary: 'Background work complete.',
              },
            ],
          },
        };
      },
      'GET /api/agent-traces?workspace_id=ws_ops': ({ headers }) => {
        opsCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: {
            items: [
              {
                id: 'trace_1',
                root_agent_id: 'sage',
                runtime_target: 'cloud',
                provider: 'openai',
                model: 'gpt-5.4',
                started_at: '2026-04-13T09:10:00Z',
                outcome: 'success',
              },
            ],
          },
        };
      },
      'GET /api/agent-traces/trace_1?workspace_id=ws_ops': ({ headers }) => {
        opsCalls.push(headers.get('x-empyralis-workspace-id'));
        return {
          json: traceReplayPayload,
        };
      },
    }),
  });

  const surface = createMobileWorkspaceSurfaceSet({
    accountState,
    foundation,
    storage,
  }).runsApprovals;

  const workItems = await surface.loadWorkItems({ refresh: true });
  assert.equal(workItems.status, 'ready');
  assert.equal(workItems.data.length, 2);
  assert.equal(workItems.data[0].kind, 'trace');
  assert.equal(workItems.data[0].id, 'trace_1');
  assert.equal(workItems.data[1].kind, 'run');
  assert.equal(workItems.data[1].id, 'run_1');

  const replay = await surface.getTraceReplay({ traceId: 'trace_1' });
  assert.equal(replay.trace.id, 'trace_1');
  assert.deepEqual(
    replay.events.map((event) => event.event_type),
    ['plan.started', 'tool.result', 'artifact.created'],
  );
  assert.deepEqual(opsCalls, ['ws_ops', 'ws_ops', 'ws_ops']);
});

test('mobile shell model mounts workspace-backed tabs when a real foundation is present', () => {
  const storage = createMemoryKeyValueStorage();
  const accountState = createAccountState();
  const foundation = createMobileWorkspaceFoundation({
    session: accountState.session,
    bootstrap: createBootstrap({
      workspaceId: 'ws_ops',
      label: 'Side Business',
      kind: 'side_business',
      role: 'admin',
      capabilities: {
        approvals_enabled: true,
        artifacts_enabled: true,
        workspace_admin_enabled: true,
      },
      defaultRoute: 'approvals',
      preferredProfile: 'operations_admin_shell',
    }),
    storage,
    fetchImpl: createFetchRouter({}),
  });

  const shell = buildMobileWorkspaceShellModel({
    accountState,
    foundation,
    storage,
    fetchImpl: createFetchRouter({}),
  });

  assert.equal(shell.defaultRouteId, 'approvals');
  assert.equal(shell.defaultRoute, '/(workspace)/approvals');
  assert.equal(shell.shellProfileId, 'operations_admin_shell');
  assert.equal(shell.tabs.some((tab) => tab.id === 'chat' && tab.mounted), true);
  assert.equal(shell.tabs.some((tab) => tab.id === 'runs' && tab.mounted), true);
  assert.equal(shell.tabs.some((tab) => tab.id === 'approvals' && tab.mounted), true);
  assert.equal(shell.tabs.some((tab) => tab.id === 'artifacts' && tab.mounted), true);
});

test('notifications and artifacts surfaces stay scoped and tear down cleanly', async () => {
  const storage = createMemoryKeyValueStorage();
  const accountState = createAccountState();
  const notificationUpdates = [];

  const foundation = createMobileWorkspaceFoundation({
    session: accountState.session,
    bootstrap: createBootstrap({
      workspaceId: 'ws_ops',
      label: 'Side Business',
      kind: 'side_business',
      role: 'admin',
      capabilities: {
        artifacts_enabled: true,
      },
    }),
    storage,
    fetchImpl: createFetchRouter({
      'GET /api/notifications?workspace_id=ws_ops': () => ({
        json: {
          notifications: [{ id: 'note_1', level: 'info' }],
        },
      }),
      'GET /api/artifacts?workspace_id=ws_ops': () => ({
        json: {
          artifacts: [{ id: 'artifact_1', label: 'Draft.pdf' }],
        },
      }),
    }),
  });

  const surfaces = createMobileWorkspaceSurfaceSet({
    accountState,
    foundation,
    storage,
  });

  const notifications = await surfaces.notifications.loadNotifications({ refresh: true });
  const artifacts = await surfaces.artifacts.loadArtifacts({ refresh: true });
  assert.equal(notifications.data.length, 1);
  assert.equal(artifacts.data.length, 1);

  const stopPolling = surfaces.notifications.startPolling({
    intervalMs: 10,
    onUpdate(result) {
      notificationUpdates.push(result.data.length);
    },
  });
  surfaces.artifacts.trackPreviewUrl('blob:artifact-1');

  await new Promise((resolve) => setTimeout(resolve, 25));
  stopPolling();

  assert.ok(notificationUpdates.length >= 1);
  assert.equal(
    storage.getItem('empyralis.mobile.v2:acct_1:ws_ops:persist:notifications:list') !== null,
    true,
  );
  assert.equal(
    storage.getItem('empyralis.mobile.v2:acct_1:ws_ops:persist:artifacts:list') !== null,
    true,
  );

  assert.equal(foundation.services.disposableRegistry.snapshot().objectUrlCount, 1);
  foundation.dispose();
  assert.equal(foundation.services.disposableRegistry.snapshot().objectUrlCount, 0);
  assert.equal(foundation.services.realtime.snapshot().pollerCount, 0);
});
