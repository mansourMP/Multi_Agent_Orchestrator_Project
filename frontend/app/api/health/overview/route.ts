import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type OverviewEntry = {
  status: number;
  latency: number;
  payload: unknown;
};

async function timedRuntimeRequest(runtimePath: string): Promise<OverviewEntry> {
  const started = Date.now();
  try {
    const { status, payload } = await runtimeJsonRequest(runtimePath, { method: 'GET' });
    return {
      status,
      latency: Date.now() - started,
      payload,
    };
  } catch (error) {
    return {
      status: 503,
      latency: Date.now() - started,
      payload: {
        detail: error instanceof Error ? error.message : `Request failed for ${runtimePath}.`,
      },
    };
  }
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  const [
    backend,
    runtime,
    doctor,
    doctorHistory,
    metrics,
    profiles,
    validation,
    validationHistory,
    workers,
    desktopHistory,
  ] = await Promise.all([
    timedRuntimeRequest('/health'),
    timedRuntimeRequest('/health'),
    timedRuntimeRequest('/doctor'),
    timedRuntimeRequest('/doctor/history?limit=8'),
    timedRuntimeRequest('/metrics'),
    timedRuntimeRequest('/providers/profiles/health?workspace_id=default'),
    timedRuntimeRequest('/validation/latest'),
    timedRuntimeRequest('/validation/history?limit=6'),
    timedRuntimeRequest('/runtime/runtimes/status'),
    timedRuntimeRequest('/history/runs?limit=20&status=failed&pack_id=local-execution-v1'),
  ]);

  return Response.json({
    backend,
    runtime,
    doctor,
    doctorHistory,
    metrics,
    profiles,
    validation,
    validationHistory,
    workers,
    desktopHistory,
  });
}
