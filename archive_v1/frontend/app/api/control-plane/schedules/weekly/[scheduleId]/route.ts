import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ scheduleId: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['PATCH'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { scheduleId } = await params;
  const normalized = encodeURIComponent(String(scheduleId || '').trim());
  const rawBody = await request.text();

  try {
    return await runtimeProxyResponse(`/schedules/weekly/${normalized}`, {
      method: 'PATCH',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Weekly schedule update failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
