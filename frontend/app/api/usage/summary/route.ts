import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function normalizePeriod(raw: string): string {
  const value = raw.trim().toLowerCase();
  return ['day', 'week', 'month', 'all'].includes(value) ? value : 'all';
}

function normalizeSummaryPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const byProvider = Array.isArray(record.by_provider) ? record.by_provider : [];
  const byModel = Array.isArray(record.by_model) ? record.by_model : [];
  const byRun = Array.isArray(record.by_run) ? record.by_run : [];
  const daily = Array.isArray(record.daily) ? record.daily : [];
  return {
    period: typeof record.period === 'string' ? record.period : 'all',
    total_tokens: typeof record.total_tokens === 'number' ? record.total_tokens : 0,
    total_cost_usd: typeof record.total_cost_usd === 'number' ? record.total_cost_usd : 0,
    runs_count: typeof record.runs_count === 'number' ? record.runs_count : 0,
    by_provider: byProvider.map((item) => {
      const provider = item as Record<string, unknown>;
      return {
        provider: typeof provider.provider === 'string' ? provider.provider : 'unknown',
        total_tokens: typeof provider.total_tokens === 'number' ? provider.total_tokens : 0,
        total_cost_usd: typeof provider.total_cost_usd === 'number' ? provider.total_cost_usd : 0,
        runs_count: typeof provider.runs_count === 'number' ? provider.runs_count : 0,
        percentage: typeof provider.percentage === 'number' ? provider.percentage : 0,
      };
    }),
    by_model: byModel.map((item) => {
      const model = item as Record<string, unknown>;
      return {
        provider: typeof model.provider === 'string' ? model.provider : 'unknown',
        model: typeof model.model === 'string' ? model.model : 'unknown-model',
        total_tokens: typeof model.total_tokens === 'number' ? model.total_tokens : 0,
        total_cost_usd: typeof model.total_cost_usd === 'number' ? model.total_cost_usd : 0,
        runs_count: typeof model.runs_count === 'number' ? model.runs_count : 0,
      };
    }),
    by_run: byRun.map((item) => {
      const run = item as Record<string, unknown>;
      return {
        run_id: typeof run.run_id === 'string' ? run.run_id : '',
        run_name: typeof run.run_name === 'string' ? run.run_name : 'Untitled run',
        provider: typeof run.provider === 'string' ? run.provider : 'unknown',
        model: typeof run.model === 'string' ? run.model : 'unknown-model',
        total_tokens: typeof run.total_tokens === 'number' ? run.total_tokens : 0,
        estimated_cost_usd: typeof run.estimated_cost_usd === 'number' ? run.estimated_cost_usd : null,
        timestamp: typeof run.timestamp === 'string' ? run.timestamp : null,
      };
    }).filter((item) => item.run_id),
    daily: daily.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        date: typeof row.date === 'string' ? row.date : '',
        total_tokens: typeof row.total_tokens === 'number' ? row.total_tokens : 0,
        total_cost_usd: typeof row.total_cost_usd === 'number' ? row.total_cost_usd : 0,
        runs_count: typeof row.runs_count === 'number' ? row.runs_count : 0,
      };
    }).filter((item) => item.date),
  };
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const period = normalizePeriod(String(request.nextUrl.searchParams.get('period') || 'all'));
  try {
    const { status, payload } = await runtimeJsonRequest(`/usage/summary?period=${period}`, { method: 'GET' });
    return Response.json(normalizeSummaryPayload(payload), { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Usage summary proxy failed.';
    return Response.json({
      period,
      total_tokens: 0,
      total_cost_usd: 0,
      runs_count: 0,
      by_provider: [],
      by_model: [],
      by_run: [],
      daily: [],
      detail: message,
    }, { status: 503 });
  }
}
