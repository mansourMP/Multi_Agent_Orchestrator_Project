import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { getControlPlaneSession, requireControlPlaneRole, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function sanitizeRunsQuery(request: NextRequest): string {
  const next = new URLSearchParams();
  for (const key of ['workspace_id', 'status', 'pack_id']) {
    const value = String(request.nextUrl.searchParams.get(key) || '').trim();
    if (value) next.set(key, value);
  }
  for (const key of ['limit', 'offset']) {
    const raw = String(request.nextUrl.searchParams.get(key) || '').trim();
    if (!raw) continue;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) continue;
    const bounded = key === 'limit'
      ? Math.max(1, Math.min(Math.trunc(numeric), 200))
      : Math.max(0, Math.trunc(numeric));
    next.set(key, String(bounded));
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

  const query = sanitizeRunsQuery(request);
  const runtimePath = `/runs${query ? `?${query}` : ''}`;

  try {
    const { status, payload } = await runtimeJsonRequest(runtimePath, { method: 'GET' });
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const rawItems = Array.isArray(record.items) ? record.items : [];
    const items = role === 'owner' ? rawItems : rawItems.filter((item) => {
      if (!ownerUserId || !item || typeof item !== 'object') return true;
      const owner = String((item as Record<string, unknown>).owner_user_id || '').trim();
      return !owner || owner === ownerUserId;
    });
    return Response.json({
      ...record,
      items,
      count: items.length,
      total: typeof record.total === 'number' ? record.total : items.length,
    }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run list proxy failed.';
    return Response.json({ detail: message, items: [], count: 0, total: 0, limit: 50, offset: 0 }, { status: 503 });
  }
}
