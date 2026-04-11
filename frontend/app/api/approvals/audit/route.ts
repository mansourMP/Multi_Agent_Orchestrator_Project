import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { getControlPlaneSession, requireControlPlaneRole, requireControlPlaneSession, resolveRuntimeWorkspaceId } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function sanitizeAuditQuery(request: NextRequest): string {
  const next = new URLSearchParams();
  const limitRaw = String(request.nextUrl.searchParams.get('limit') || '').trim();
  if (limitRaw) {
    const limit = Number(limitRaw);
    if (Number.isFinite(limit)) next.set('limit', String(Math.max(1, Math.min(Math.trunc(limit), 200))));
  }
  return next.toString();
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'viewer');
  if (roleFailure) return roleFailure;
  const session = await getControlPlaneSession(request);
  const ownerUserId = String(session?.sub || '').trim();
  const role = String(session?.role || '').trim().toLowerCase();
  const workspaceId = await resolveRuntimeWorkspaceId(request, 'default');

  const query = sanitizeAuditQuery(request);
  const runtimePath = `/approvals/audit${query ? `?${query}` : ''}`;
  const historyPath = `/history/runs?limit=200&workspace_id=${encodeURIComponent(workspaceId)}`;

  try {
    const [audit, history] = await Promise.all([
      runtimeJsonRequest(runtimePath, { method: 'GET' }),
      runtimeJsonRequest(historyPath, { method: 'GET' }),
    ]);
    const historyItems =
      history.payload && typeof history.payload === 'object' && Array.isArray((history.payload as { items?: unknown[] }).items)
        ? (history.payload as { items: unknown[] }).items
        : [];
    const ownedRunIds = new Set(
      historyItems
        .map((item) => item && typeof item === 'object' ? (item as Record<string, unknown>) : {})
        .filter((item) => String(item.owner_user_id || '').trim() === ownerUserId)
        .map((item) => String(item.run_id || '').trim())
        .filter(Boolean),
    );
    const auditItems =
      audit.payload && typeof audit.payload === 'object' && Array.isArray((audit.payload as { items?: unknown[] }).items)
        ? (audit.payload as { items: unknown[] }).items
        : [];
    const filtered = role === 'owner' ? auditItems : auditItems.filter((item) => {
      const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const runId = String(record.run_id || '').trim();
      return runId && ownedRunIds.has(runId);
    });
    return Response.json({ items: filtered, count: filtered.length, total: filtered.length }, { status: audit.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approval audit proxy failed.';
    return Response.json({ detail: message, items: [] }, { status: 503 });
  }
}
