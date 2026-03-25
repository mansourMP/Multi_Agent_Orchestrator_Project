import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { status, payload } = await runtimeJsonRequest('/executions', { method: 'GET' });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Executions list proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
