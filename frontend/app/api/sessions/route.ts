import type { NextRequest } from 'next/server';
import type { SessionCreateRequest } from '@/lib/api-contract';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  getAdminBrowserIdentity,
  getControlPlaneSession,
  requireControlPlaneSession,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function parseSessionPayload(raw: string): SessionCreateRequest | null {
  try {
    const parsed = JSON.parse(raw) as SessionCreateRequest;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function stampSessionOwnerBody(request: NextRequest, rawBody: string): Promise<string> {
  if (!rawBody) return rawBody;
  const parsed = parseSessionPayload(rawBody);
  if (!parsed) return rawBody;

  const ownerUserId = String((await getControlPlaneSession(request))?.sub || '').trim();
  const identity = await getAdminBrowserIdentity(request);
  const metadata = {
    ...asRecord(parsed.metadata),
    ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
    ...(identity?.email ? { owner_email: identity.email } : {}),
  };

  return JSON.stringify({
    ...parsed,
    metadata,
  });
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    const rawBody = await request.text();
    const stampedBody = await stampSessionOwnerBody(request, rawBody);
    const { status, payload } = await runtimeJsonRequest('/sessions', {
      method: 'POST',
      body: stampedBody || undefined,
      headers: stampedBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
