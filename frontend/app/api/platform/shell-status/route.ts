import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession, resolveRuntimeWorkspaceId } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function countPendingApprovals(payload: unknown): number {
  const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  return items.filter((item) => {
    const record = item as Record<string, unknown>;
    return String(record?.status || '').toLowerCase() === 'waiting_for_input';
  }).length;
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const workspaceId = await resolveRuntimeWorkspaceId(request, 'default');

  try {
    const [health, runtimes, approvals] = await Promise.all([
      runtimeJsonRequest('/health', { method: 'GET' }),
      runtimeJsonRequest('/runtime/runtimes/status', { method: 'GET' }),
      runtimeJsonRequest(`/approvals?limit=12&workspace_id=${encodeURIComponent(workspaceId)}`, { method: 'GET' }),
    ]);

    const runtimesPayload = runtimes.payload && typeof runtimes.payload === 'object'
      ? (runtimes.payload as {
          summary?: {
            online?: number;
            known?: number;
          };
          items?: Array<{
            runtime_type?: string | null;
            online?: boolean;
          }>;
        })
      : {};
    const healthPayload = health.payload && typeof health.payload === 'object'
      ? (health.payload as Record<string, unknown>)
      : {};

    const runtimeItems = Array.isArray(runtimesPayload.items) ? runtimesPayload.items : [];
    const localRuntimeOnline = runtimeItems.some((item) => {
      const runtimeType = String(item?.runtime_type || '').trim().toLowerCase();
      return Boolean(item?.online) && (runtimeType === 'local' || runtimeType === 'local_companion');
    });

    return Response.json({
      runtimeHealthy: health.status >= 200 && health.status < 300,
      onlineWorkers: Number(runtimesPayload.summary?.online || 0),
      machineCount: Number(runtimesPayload.summary?.known || 0),
      localRuntimeOnline,
      pendingApprovals: countPendingApprovals(approvals.payload),
      runtimeApiMinCliVersion:
        typeof healthPayload.runtime_api_min_cli_version === 'string'
          ? healthPayload.runtime_api_min_cli_version
          : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Platform shell status proxy failed.';
    return Response.json(
      {
        detail: message,
        runtimeHealthy: null,
        onlineWorkers: 0,
        machineCount: 0,
        localRuntimeOnline: false,
        pendingApprovals: 0,
        runtimeApiMinCliVersion: null,
      },
      { status: 503 },
    );
  }
}
