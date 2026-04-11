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
  defaultRoute = `/w/${workspaceId}/chat`,
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
  defaultRoute = `/w/${workspaceId}/chat`,
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
          defaultRoute: '/w/ws_law/workstation',
        }),
        createMembership({
          workspaceId: 'ws_ops',
          label: 'Side Business',
          kind: 'side_business',
          role: 'admin',
          defaultRoute: '/w/ws_ops/admin',
        }),
      ],
    },
  });
  const rememberedLaw = reduceAccountShellState(hydrated, {
    type: 'remember_workspace_route',
    workspaceId: 'ws_law',
    route: '/w/ws_law/workstation',
  });
  return reduceAccountShellState(rememberedLaw, {
    type: 'remember_workspace_route',
    workspaceId: 'ws_ops',
    route: '/w/ws_ops/admin/billing',
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
        defaultRoute: '/w/ws_law/workstation',
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
        defaultRoute: '/w/ws_ops/chat',
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
  assert.equal(lawSwitch.targetRoute, '/w/ws_law/workstation');
  assert.equal(lawSwitch.shellProfileId, 'document_workstation_shell');

  const opsSwitch = await surfaces.workspaceSwitcher.switchWorkspace('ws_ops');
  assert.equal(opsSwitch.targetRoute, '/w/ws_ops/chat');
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
    defaultRoute: '/w/ws_law/workstation',
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
  assert.equal(degradedThread.data.messages.length, 2);

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
      defaultRoute: '/w/ws_ops/admin',
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
  assert.equal(opsOverview.approvals.length, 1);

  const approvalResult = await opsSurface.respondToApproval({
    approvalId: 'approval_1',
    decision: 'approved',
  });
  assert.equal(approvalResult.status, 'ready');
  assert.equal(approvalResult.approvals[0].status, 'approved');
  assert.equal(
    storage.getItem('empyralis.mobile.v2:acct_1:ws_ops:persist:approvals:list') !== null,
    true,
  );
  assert.deepEqual(opsCalls, ['ws_ops', 'ws_ops', 'ws_ops']);

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
      defaultRoute: '/w/ws_ops/admin',
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

  assert.equal(shell.defaultRoute, '/w/ws_ops/admin');
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
      'GET /api/workspaces/ws_ops/notifications': () => ({
        json: {
          notifications: [{ id: 'note_1', level: 'info' }],
        },
      }),
      'GET /api/workspaces/ws_ops/artifacts': () => ({
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
