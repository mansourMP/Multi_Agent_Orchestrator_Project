import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAccountShellSnapshot,
  createInitialAccountShellState,
  normalizePlatformSession,
  reduceAccountShellState,
  resolveWorkspaceNavigationTarget,
} from './src/lib/shell/account-shell-store.js';
import { createMemoryKeyValueStorage } from './src/lib/storage/memory-key-value-storage.js';
import { createMobileWorkspaceFoundation, loadMobileWorkspaceFoundation } from './src/lib/mobile-foundation.js';
import {
  buildWorkspaceBootstrapUrl,
  fetchWorkspaceBootstrap,
  parseWorkspaceBootstrapPayload,
} from './src/lib/workspace/workspace-bootstrap.js';

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
    workspaceTraits: {
      documentHeavy: kind === 'enterprise',
    },
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

test('normalizePlatformSession strips runtime-first assumptions and keeps platform-first truth', () => {
  const session = normalizePlatformSession({
    accountId: 'acct_1',
    apiBaseUrl: 'https://api.empyralis.example/',
    accessToken: 'token',
    runtimeUrl: 'http://127.0.0.1:9000',
    localCompanionUrl: 'http://192.168.1.4:8080',
  });

  assert.deepEqual(session, {
    accountId: 'acct_1',
    apiBaseUrl: 'https://api.empyralis.example',
    accessToken: 'token',
    refreshToken: null,
    deviceId: null,
    connectionMode: 'platform_first',
  });
  assert.equal('runtimeUrl' in session, false);
  assert.equal('localCompanionUrl' in session, false);
});

test('account shell keeps only global session and workspace memberships', () => {
  const initialState = createInitialAccountShellState();
  const hydratedState = reduceAccountShellState(initialState, {
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
        createMembership({ workspaceId: 'ws_personal', label: 'Personal', kind: 'personal' }),
        createMembership({ workspaceId: 'ws_law', label: 'Law Firm', kind: 'enterprise', role: 'viewer' }),
      ],
    },
  });

  const activeState = reduceAccountShellState(hydratedState, {
    type: 'sync_workspace_from_route',
    workspaceId: 'ws_law',
  });
  const rememberedState = reduceAccountShellState(activeState, {
    type: 'remember_workspace_route',
    workspaceId: 'ws_law',
    route: 'runs',
  });

  assert.equal(rememberedState.status, 'authenticated');
  assert.equal(rememberedState.session.connectionMode, 'platform_first');
  assert.equal(rememberedState.activeWorkspaceId, 'ws_law');
  assert.deepEqual(Object.keys(rememberedState.workspaceMembershipIndex).sort(), ['ws_law', 'ws_personal']);
  assert.equal(rememberedState.lastVisitedWorkspaceRouteIdById.ws_law, 'runs');
  assert.equal(resolveWorkspaceNavigationTarget(rememberedState, 'ws_law'), 'runs');

  const snapshot = createAccountShellSnapshot(rememberedState);
  assert.deepEqual(snapshot, {
    accountId: 'acct_1',
    apiBaseUrl: 'https://api.empyralis.example',
    activeWorkspaceId: 'ws_law',
    lastVisitedWorkspaceRouteIdById: {
      ws_law: 'runs',
    },
    workspaceRouteStateById: {
      ws_law: 'v1:chat:chat.read',
      ws_personal: 'v1:chat:chat.read',
    },
  });
  assert.equal('queryClient' in rememberedState, false);
  assert.equal('workspaceServices' in rememberedState, false);
});

test('mobile foundation reuses the workspace bootstrap contract and derives workspace shell state', () => {
  const storage = createMemoryKeyValueStorage();
  const foundation = createMobileWorkspaceFoundation({
    session: {
      accountId: 'acct_1',
      apiBaseUrl: 'https://api.empyralis.example',
      accessToken: 'token',
      runtimeUrl: 'http://localhost:7000',
    },
    bootstrap: createBootstrap({
      workspaceId: 'ws_ops',
      label: 'Side Business',
      kind: 'side_business',
      role: 'admin',
      capabilities: {
        workspace_admin_enabled: true,
        billing_read_enabled: true,
        routing_read_enabled: true,
        artifacts_enabled: true,
        approvals_enabled: true,
      },
      defaultRoute: 'approvals',
      preferredProfile: 'operations_admin_shell',
    }),
    storage,
  });

  assert.equal(foundation.connectionMode, 'platform_first');
  assert.equal(foundation.shellProfile.id, 'operations_admin_shell');
  assert.equal(foundation.boundaryKey, 'ws_ops:membership-ws_ops:operations_admin_shell');
  assert.equal(foundation.routeManifest.defaultRouteId, 'approvals');
  assert.equal(foundation.routeManifest.defaultRoute, '/(workspace)/approvals');
  assert.ok(foundation.routeManifest.routeIds.includes('chat'));
  assert.ok(foundation.routeManifest.routeIds.includes('approvals'));
  assert.equal(foundation.services.snapshot().transport.connectionMode, 'platform_first');
});

test('mobile workspace services scope persistence and query state to accountId plus workspaceId', async () => {
  const storage = createMemoryKeyValueStorage();
  const foundationA = createMobileWorkspaceFoundation({
    session: {
      accountId: 'acct_1',
      apiBaseUrl: 'https://api.empyralis.example',
      accessToken: 'token',
    },
    bootstrap: createBootstrap({ workspaceId: 'ws_personal', label: 'Personal' }),
    storage,
  });
  const foundationB = createMobileWorkspaceFoundation({
    session: {
      accountId: 'acct_1',
      apiBaseUrl: 'https://api.empyralis.example',
      accessToken: 'token',
    },
    bootstrap: createBootstrap({
      workspaceId: 'ws_law',
      label: 'Law Firm',
      kind: 'enterprise',
      role: 'viewer',
      capabilities: {
        document_workstation_enabled: true,
      },
      defaultRoute: 'chat',
      preferredProfile: 'document_workstation_shell',
    }),
    storage,
  });

  foundationA.services.persistence.setJson('draft:chat', { text: 'personal draft' });
  foundationB.services.persistence.setJson('draft:chat', { text: 'law draft' });
  foundationA.services.queryClient.set('chat:summary', { count: 1 });
  foundationB.services.queryClient.set('chat:summary', { count: 2 });

  assert.equal(foundationA.shellProfile.id, 'personal_shell');
  assert.equal(foundationB.shellProfile.id, 'document_workstation_shell');
  assert.equal(foundationA.services.persistence.getJson('draft:chat').text, 'personal draft');
  assert.equal(foundationB.services.persistence.getJson('draft:chat').text, 'law draft');
  assert.equal(foundationA.services.queryClient.peek('chat:summary').count, 1);
  assert.equal(foundationB.services.queryClient.peek('chat:summary').count, 2);
  assert.match(foundationA.services.prefix, /^empyralis\.mobile\.v2:acct_1:ws_personal$/);
  assert.match(foundationB.services.prefix, /^empyralis\.mobile\.v2:acct_1:ws_law$/);
  assert.notEqual(foundationA.services.prefix, foundationB.services.prefix);
  assert.equal(
    storage.getItem('empyralis.mobile.v2:acct_1:ws_personal:persist:draft:chat') !== null,
    true,
  );
  assert.equal(
    storage.getItem('empyralis.mobile.v2:acct_1:ws_law:persist:draft:chat') !== null,
    true,
  );

  let pollCount = 0;
  foundationA.services.realtime.startPoller('notifications', () => {
    pollCount += 1;
  }, 10);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(pollCount >= 1);
  foundationA.dispose();
  foundationB.dispose();
});

test('fetchWorkspaceBootstrap and foundation loading use the shared public bootstrap endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return createBootstrap({ workspaceId: 'ws_personal' });
      },
    };
  };

  const parsed = await fetchWorkspaceBootstrap({
    apiBaseUrl: 'https://api.empyralis.example/',
    workspaceId: 'ws_personal',
    accessToken: 'token',
    fetchImpl,
  });

  assert.equal(
    calls[0].url,
    buildWorkspaceBootstrapUrl('https://api.empyralis.example/', 'ws_personal'),
  );
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.get('authorization'), 'Bearer token');
  assert.equal(parsed.workspace.id, 'ws_personal');

  const foundation = await loadMobileWorkspaceFoundation({
    workspaceId: 'ws_personal',
    session: {
      apiBaseUrl: 'https://api.empyralis.example/',
      accessToken: 'token',
      runtimeUrl: 'http://127.0.0.1:7000',
    },
    storage: createMemoryKeyValueStorage(),
    fetchImpl,
  });

  assert.equal(foundation.bootstrap.workspace.id, 'ws_personal');
  assert.equal(foundation.connectionMode, 'platform_first');
});

test('parseWorkspaceBootstrapPayload rejects malformed bootstrap payloads', () => {
  assert.throws(() => parseWorkspaceBootstrapPayload(null), /must be an object/);
  assert.throws(
    () => parseWorkspaceBootstrapPayload({ account: {}, workspace: {}, membership: {}, entitlements: {}, runtime: {}, shellHints: {} }),
    /missing required string field/,
  );
});
