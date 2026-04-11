import type { NextRequest } from 'next/server';
import type { SessionCreateRequest } from '@shared/api-contract';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  getAdminBrowserIdentity,
  getControlPlaneSession,
  requireControlPlaneRole,
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
  resolveRuntimeWorkspaceId,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function parseSessionPayload(raw: string): SessionCreateRequest | null {
  try {
    const parsed = JSON.parse(raw) as SessionCreateRequest;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function stampSessionOwnerBody(request: NextRequest, rawBody: string): Promise<string> {
  if (!rawBody) return rawBody;
  const parsed = parseSessionPayload(rawBody);
  if (!parsed) return rawBody;

  const ownerUserId = String((await getControlPlaneSession(request))?.sub || '').trim();
  const identity = await getAdminBrowserIdentity(request);
  const requestedWorkspaceId = String(parsed.workspace_id || 'default').trim() || 'default';
  const workspaceId = await resolveRuntimeWorkspaceId(request, requestedWorkspaceId);
  const tenantId = workspaceId === requestedWorkspaceId
    ? String(parsed.tenant_id || 'default').trim() || 'default'
    : 'default';
  let masterAgentInstallId = String((parsed.metadata as { master_agent_install_id?: unknown } | undefined)?.master_agent_install_id || '').trim();
  if (!masterAgentInstallId) {
    try {
      const { payload } = await runtimeJsonRequest(
        `/agent-registry/chat-context?workspace_id=${encodeURIComponent(workspaceId)}`,
        { method: 'GET' },
      );
      const context = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const masterInstall = context.master_install && typeof context.master_install === 'object'
        ? context.master_install as Record<string, unknown>
        : {};
      masterAgentInstallId = String(masterInstall.id || '').trim();
    } catch {
      // Leave the session payload unchanged when Sage context is unavailable.
    }
  }
  const metadata = {
    ...asRecord(parsed.metadata),
    ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
    ...(identity?.email ? { owner_email: identity.email } : {}),
    ...(masterAgentInstallId ? { master_agent_install_id: masterAgentInstallId } : {}),
  };

  return JSON.stringify({
    ...parsed,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    metadata,
  });
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'member');
  if (roleFailure) return roleFailure;

  try {
    const rawBody = await request.text();
    const parsed = parseSessionPayload(rawBody);
    const workspaceId = String(parsed?.workspace_id || 'default').trim() || 'default';
    const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'member');
    if (workspaceFailure) return workspaceFailure;
    const stampedBody = await stampSessionOwnerBody(request, rawBody);
    const { status, payload } = await runtimeJsonRequest('/sessions', {
      method: 'POST',
      body: stampedBody || undefined,
      headers: stampedBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
