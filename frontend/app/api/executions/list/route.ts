import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { getControlPlaneSession, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { backendJsonRequest } from '@/lib/server/backendControlPlane';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function ownedRunIdsFromHistoryPayload(payload: unknown, ownerUserId: string): Set<string> {
  const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  const owned = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const runId = String(record.run_id || '').trim();
    const recordOwner = String(record.owner_user_id || '').trim();
    if (runId && recordOwner && recordOwner === ownerUserId) {
      owned.add(runId);
    }
  }
  return owned;
}

function filterExecutionList(payload: unknown, ownedRunIds: Set<string>, ownerUserId: string): unknown {
  if (!Array.isArray(payload)) return payload;
  return payload.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    const id = String(record.id || '').trim();
    const directOwner = String(record.owner_user_id || '').trim();
    if (id && ownedRunIds.has(id)) return true;
    return Boolean(directOwner && directOwner === ownerUserId);
  });
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const session = await getControlPlaneSession(request);
  const ownerUserId = String(session?.sub || '').trim();

  try {
    const [{ status, payload }, history] = await Promise.all([
      backendJsonRequest('/executions', { method: 'GET' }),
      runtimeJsonRequest('/history/runs?limit=200&workspace_id=default', { method: 'GET' }),
    ]);
    const ownedRunIds = ownedRunIdsFromHistoryPayload(history.payload, ownerUserId);
    return Response.json(filterExecutionList(payload, ownedRunIds, ownerUserId), { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Executions list proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
