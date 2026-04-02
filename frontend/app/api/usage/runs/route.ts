import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function clampInt(raw: string, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

function normalizePeriod(raw: string): string {
  const value = raw.trim().toLowerCase();
  return ['day', 'week', 'month', 'all'].includes(value) ? value : 'all';
}

function normalizeRunsPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    items: items.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        run_id: typeof row.run_id === 'string' ? row.run_id : '',
        run_name: typeof row.run_name === 'string' ? row.run_name : 'Untitled run',
        provider: typeof row.provider === 'string' ? row.provider : 'unknown',
        model: typeof row.model === 'string' ? row.model : 'unknown-model',
        prompt_tokens: typeof row.prompt_tokens === 'number' ? row.prompt_tokens : 0,
        completion_tokens: typeof row.completion_tokens === 'number' ? row.completion_tokens : 0,
        total_tokens: typeof row.total_tokens === 'number' ? row.total_tokens : 0,
        estimated_cost_usd: typeof row.estimated_cost_usd === 'number' ? row.estimated_cost_usd : null,
        status: typeof row.status === 'string' ? row.status : null,
        timestamp: typeof row.timestamp === 'string' ? row.timestamp : null,
        created_at: typeof row.created_at === 'string' ? row.created_at : null,
        completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
      };
    }).filter((item) => item.run_id),
    count: typeof record.count === 'number' ? record.count : 0,
    total: typeof record.total === 'number' ? record.total : 0,
    limit: typeof record.limit === 'number' ? record.limit : 0,
    offset: typeof record.offset === 'number' ? record.offset : 0,
    period: typeof record.period === 'string' ? record.period : 'all',
  };
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const limit = clampInt(String(request.nextUrl.searchParams.get('limit') || '50'), 50, 1, 200);
  const offset = clampInt(String(request.nextUrl.searchParams.get('offset') || '0'), 0, 0, 10000);
  const period = normalizePeriod(String(request.nextUrl.searchParams.get('period') || 'all'));

  try {
    const { status, payload } = await runtimeJsonRequest(
      `/usage/runs?limit=${limit}&offset=${offset}&period=${period}`,
      { method: 'GET' },
    );
    return Response.json(normalizeRunsPayload(payload), { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Usage runs proxy failed.';
    return Response.json({
      items: [],
      count: 0,
      total: 0,
      limit,
      offset,
      period,
      detail: message,
    }, { status: 503 });
  }
}
