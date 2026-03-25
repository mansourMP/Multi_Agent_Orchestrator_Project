import type { NextRequest } from 'next/server';
import { getAdminBrowserIdentity, getControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

type RunRecord = Record<string, unknown>;

function asRecord(value: unknown): RunRecord {
  return value && typeof value === 'object' ? (value as RunRecord) : {};
}

function extractOwnerUserId(payload: unknown): string {
  const record = asRecord(payload);
  const direct = String(record.owner_user_id || '').trim();
  if (direct) return direct;
  const context = asRecord(record.context);
  const metadata = asRecord(context.metadata);
  return String(metadata.owner_user_id || '').trim();
}

export async function getSessionOwnerUserId(request: NextRequest): Promise<string> {
  const session = await getControlPlaneSession(request);
  return String(session?.sub || '').trim();
}

export async function stampRunOwnerBody(request: NextRequest, rawBody: string): Promise<string> {
  const ownerUserId = await getSessionOwnerUserId(request);
  if (!ownerUserId || !rawBody) return rawBody;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return rawBody;

  const identity = await getAdminBrowserIdentity(request);
  const next = parsed as Record<string, unknown>;
  const metadata = next.metadata && typeof next.metadata === 'object' && !Array.isArray(next.metadata)
    ? { ...(next.metadata as Record<string, unknown>) }
    : {};

  metadata.owner_user_id = ownerUserId;
  if (identity?.email) metadata.owner_email = identity.email;
  next.metadata = metadata;

  return JSON.stringify(next);
}

export async function requireOwnedRun(
  request: NextRequest,
  runId: string,
): Promise<{ payload?: RunRecord; response?: Response }> {
  const ownerUserId = await getSessionOwnerUserId(request);
  if (!ownerUserId) {
    return {
      response: Response.json({ detail: 'Control-plane session required.' }, { status: 401 }),
    };
  }

  let result: { status: number; payload: unknown };
  try {
    result = await runtimeJsonRequest(`/runs/${encodeURIComponent(runId)}`, { method: 'GET' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run ownership verification failed.';
    return {
      response: Response.json({ detail: message }, { status: 503 }),
    };
  }

  if (result.status === 404) {
    return { response: Response.json({ detail: 'Run not found.' }, { status: 404 }) };
  }
  if (result.status < 200 || result.status >= 300) {
    return {
      response: Response.json(asRecord(result.payload), { status: result.status || 502 }),
    };
  }

  const payload = asRecord(result.payload);
  const runOwnerUserId = extractOwnerUserId(payload);
  if (!runOwnerUserId) {
    return {
      response: Response.json({ detail: 'Run is not bound to the current owner.' }, { status: 403 }),
    };
  }
  if (runOwnerUserId !== ownerUserId) {
    return {
      response: Response.json({ detail: 'Run is owned by another user.' }, { status: 403 }),
    };
  }

  return { payload };
}
