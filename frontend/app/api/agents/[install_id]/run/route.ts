import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ install_id: string }> },
) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { install_id } = await context.params;
  const safeInstallId = String(install_id || '').trim();
  if (!safeInstallId) {
    return Response.json({ detail: 'install_id is required.' }, { status: 400 });
  }

  try {
    const rawBody = await request.text();
    const { status, payload } = await runtimeJsonRequest(`/agents/${encodeURIComponent(safeInstallId)}/run`, {
      method: 'POST',
      body: rawBody || '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Installed agent run proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
