export type WorkspaceBootstrapAccount = {
  id: string;
  email: string;
  displayName?: string | null;
};

export type WorkspaceBootstrapWorkspace = {
  id: string;
  tenantId: string;
  label: string;
  kind: string;
};

export type WorkspaceBootstrapMembership = {
  role: string;
  permissions: string[];
  version: string;
};

export type WorkspaceBootstrapEntitlements = {
  plan: string;
  label: string;
  source: string;
  flags: Record<string, boolean>;
  limits: Record<string, number | null>;
};

export type WorkspaceBootstrapRuntimeTarget = {
  id: string;
  label: string;
  kind: string;
  online: boolean;
  preferred: boolean;
};

export type WorkspaceBootstrapRuntime = {
  deploymentMode: string;
  runtimeTargets: WorkspaceBootstrapRuntimeTarget[];
};

export type WorkspaceBootstrapShellHints = {
  defaultRoute: string;
  preferredProfile: string;
};

export type WorkspaceBootstrapPayload = {
  account: WorkspaceBootstrapAccount;
  workspace: WorkspaceBootstrapWorkspace;
  membership: WorkspaceBootstrapMembership;
  capabilities: Record<string, boolean>;
  entitlements: WorkspaceBootstrapEntitlements;
  workspaceTraits: Record<string, unknown>;
  runtime: WorkspaceBootstrapRuntime;
  shellHints: WorkspaceBootstrapShellHints;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Workspace bootstrap is missing required string field: ${field}`);
  }
  return value;
}

function requireBooleanRecord(value: unknown, field: string): Record<string, boolean> {
  if (!isRecord(value)) {
    throw new Error(`Workspace bootstrap is missing required object field: ${field}`);
  }

  const out: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean') {
      out[key] = entry;
    }
  }
  return out;
}

function requireNumberLimitRecord(value: unknown, field: string): Record<string, number | null> {
  if (!isRecord(value)) {
    throw new Error(`Workspace bootstrap is missing required object field: ${field}`);
  }

  const out: Record<string, number | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || typeof entry === 'number') {
      out[key] = entry;
    }
  }
  return out;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Workspace bootstrap is missing required array field: ${field}`);
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function parseRuntimeTargets(value: unknown): WorkspaceBootstrapRuntimeTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    return [
      {
        id: requireString(entry.id, 'runtime.runtimeTargets[].id'),
        label: requireString(entry.label, 'runtime.runtimeTargets[].label'),
        kind: requireString(entry.kind, 'runtime.runtimeTargets[].kind'),
        online: Boolean(entry.online),
        preferred: Boolean(entry.preferred),
      },
    ];
  });
}

export function parseWorkspaceBootstrapPayload(payload: unknown): WorkspaceBootstrapPayload {
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

export function createWorkspaceBoundaryKey(
  workspaceId: string,
  membershipVersion: string,
  shellProfileId: string,
): string {
  return `${workspaceId}:${membershipVersion}:${shellProfileId}`;
}
