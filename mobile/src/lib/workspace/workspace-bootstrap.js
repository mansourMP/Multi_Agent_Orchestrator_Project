function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Workspace bootstrap is missing required string field: ${field}`);
  }
  return value;
}

function requireBooleanRecord(value, field) {
  if (!isRecord(value)) {
    throw new Error(`Workspace bootstrap is missing required object field: ${field}`);
  }

  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean') {
      out[key] = entry;
    }
  }
  return out;
}

function requireNumberLimitRecord(value, field) {
  if (!isRecord(value)) {
    throw new Error(`Workspace bootstrap is missing required object field: ${field}`);
  }

  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || typeof entry === 'number') {
      out[key] = entry;
    }
  }
  return out;
}

function requireStringArray(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`Workspace bootstrap is missing required array field: ${field}`);
  }

  return value.filter((entry) => typeof entry === 'string');
}

function parseRuntimeTargets(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    return [{
      id: requireString(entry.id, 'runtime.runtimeTargets[].id'),
      label: requireString(entry.label, 'runtime.runtimeTargets[].label'),
      kind: requireString(entry.kind, 'runtime.runtimeTargets[].kind'),
      online: Boolean(entry.online),
      preferred: Boolean(entry.preferred),
    }];
  });
}

export function parseWorkspaceBootstrapPayload(payload) {
  if (!isRecord(payload)) {
    throw new Error('Workspace bootstrap payload must be an object.');
  }

  const account = payload.account;
  const workspace = payload.workspace;
  const membership = payload.membership;
  const entitlements = payload.entitlements;
  const runtime = payload.runtime;
  const shellHints = payload.shellHints;

  if (!isRecord(account) || !isRecord(workspace) || !isRecord(membership) || !isRecord(entitlements) || !isRecord(runtime) || !isRecord(shellHints)) {
    throw new Error('Workspace bootstrap payload is missing required sections.');
  }

  return {
    account: {
      id: requireString(account.id, 'account.id'),
      email: requireString(account.email, 'account.email'),
      displayName: typeof account.displayName === 'string' ? account.displayName : null,
    },
    workspace: {
      id: requireString(workspace.id, 'workspace.id'),
      tenantId: requireString(workspace.tenantId, 'workspace.tenantId'),
      label: requireString(workspace.label, 'workspace.label'),
      kind: requireString(workspace.kind, 'workspace.kind'),
    },
    membership: {
      role: requireString(membership.role, 'membership.role'),
      permissions: requireStringArray(membership.permissions, 'membership.permissions'),
      version: requireString(membership.version, 'membership.version'),
    },
    capabilities: requireBooleanRecord(payload.capabilities, 'capabilities'),
    entitlements: {
      plan: requireString(entitlements.plan, 'entitlements.plan'),
      label: requireString(entitlements.label, 'entitlements.label'),
      source: requireString(entitlements.source, 'entitlements.source'),
      flags: requireBooleanRecord(entitlements.flags, 'entitlements.flags'),
      limits: requireNumberLimitRecord(entitlements.limits, 'entitlements.limits'),
    },
    workspaceTraits: isRecord(payload.workspaceTraits) ? payload.workspaceTraits : {},
    runtime: {
      deploymentMode: requireString(runtime.deploymentMode, 'runtime.deploymentMode'),
      runtimeTargets: parseRuntimeTargets(runtime.runtimeTargets),
    },
    shellHints: {
      defaultRoute: requireString(shellHints.defaultRoute, 'shellHints.defaultRoute'),
      preferredProfile: requireString(shellHints.preferredProfile, 'shellHints.preferredProfile'),
    },
  };
}

export function createWorkspaceBoundaryKey(workspaceId, membershipVersion, shellProfileId) {
  return `${workspaceId}:${membershipVersion}:${shellProfileId}`;
}

export function buildWorkspaceBootstrapUrl(apiBaseUrl, workspaceId) {
  const normalizedBaseUrl = requireString(apiBaseUrl, 'apiBaseUrl').replace(/\/+$/, '');
  const normalizedWorkspaceId = encodeURIComponent(requireString(workspaceId, 'workspaceId'));
  return `${normalizedBaseUrl}/api/workspaces/${normalizedWorkspaceId}/bootstrap`;
}

export async function fetchWorkspaceBootstrap({ apiBaseUrl, workspaceId, accessToken, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required to load workspace bootstrap.');
  }

  const headers = new Headers();
  if (typeof accessToken === 'string' && accessToken.trim()) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  const response = await fetchImpl(buildWorkspaceBootstrapUrl(apiBaseUrl, workspaceId), {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Workspace bootstrap request failed with status ${response.status}.`);
  }

  return parseWorkspaceBootstrapPayload(await response.json());
}
