import type { NextRequest } from 'next/server';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const runtimePath = `/history/runs${query ? `?${query}` : ''}`;

  try {
    const { status, payload } = await runtimeJsonRequest(runtimePath, { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution history proxy failed.';
    return Response.json({ detail: message, items: [] }, { status: 503 });
  }
}
