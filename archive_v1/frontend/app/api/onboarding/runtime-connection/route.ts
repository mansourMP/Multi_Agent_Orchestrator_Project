import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  probeRuntimeHealthWithKey,
  readServerRuntimeKeyIfPresent,
  writeServerRuntimeKey,
} from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const runtimeKey = await readServerRuntimeKeyIfPresent();
  if (!runtimeKey) {
    return Response.json({ configured: false, healthy: false });
  }
  const { status, payload } = await probeRuntimeHealthWithKey(runtimeKey);
  return Response.json(
    {
      configured: true,
      healthy: status >= 200 && status < 300,
      health: payload,
    },
    { status: status >= 200 && status < 300 ? 200 : 503 },
  );
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const apiKey = String(payload?.apiKey || payload?.api_key || '').replace(/\s+/g, '');
  if (!apiKey) {
    return Response.json({ detail: 'API key is required.' }, { status: 400 });
  }

  const health = await probeRuntimeHealthWithKey(apiKey);
  if (health.status < 200 || health.status >= 300) {
    const detail = health.payload && typeof health.payload === 'object' && typeof (health.payload as { detail?: unknown }).detail === 'string'
      ? String((health.payload as { detail?: unknown }).detail || '').trim()
      : 'Health check failed.';
    return Response.json(
      {
        detail: detail || 'Health check failed.',
        health: health.payload,
      },
      { status: health.status || 503 },
    );
  }

  await writeServerRuntimeKey(apiKey);
  return Response.json({
    ok: true,
    configured: true,
    healthy: true,
    health: health.payload,
  });
}
