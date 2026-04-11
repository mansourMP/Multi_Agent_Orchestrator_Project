import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession, resolveRuntimeWorkspaceId } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ agentRole: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { agentRole } = await params;
  const safeRole = encodeURIComponent(String(agentRole || '').trim());
  const workspaceId = await resolveRuntimeWorkspaceId(request, 'default');
  const query = `workspace_id=${encodeURIComponent(workspaceId)}&history_limit=1&file_limit=1&artifact_limit=1`;

  try {
    const { status, payload } = await runtimeJsonRequest(`/agents/workspace/agents/${safeRole}?${query}`, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent channel proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
