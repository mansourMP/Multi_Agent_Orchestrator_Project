import type { NextRequest } from 'next/server';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const { status, payload } = await runtimeJsonRequest(`/executions/${encodeURIComponent(id)}`, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution detail proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
