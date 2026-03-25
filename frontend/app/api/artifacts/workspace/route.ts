import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard, sanitizeArtifactsWorkspaceQuery } from '@/lib/server/bffRouteGuard';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  const query = sanitizeArtifactsWorkspaceQuery(request);
  const runtimePath = `/artifacts/workspace${query ? `?${query}` : ''}`;

  try {
    const { status, payload } = await runtimeJsonRequest(runtimePath, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Artifacts proxy failed.';
    return Response.json({ ok: false, detail: message }, { status: 503 });
  }
}
