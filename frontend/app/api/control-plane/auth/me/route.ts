import type { NextRequest } from 'next/server';
import { API_BASE } from '@/lib/config';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireAdminBrowserIdentity } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

const CONTROL_PLANE_BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || API_BASE;
const CONTROL_PLANE_ADMIN_COOKIE = 'orion_cp_admin';

function adminBearerToken(request: NextRequest): string {
  return String(request.cookies.get(CONTROL_PLANE_ADMIN_COOKIE)?.value || '').trim();
}

async function proxyAuthMe(request: NextRequest, method: 'GET' | 'PATCH', body?: string): Promise<Response> {
  const authFailure = await requireAdminBrowserIdentity(request);
  if (authFailure instanceof Response) return authFailure;

  const token = adminBearerToken(request);
  if (!token) {
    return Response.json({ detail: 'Admin browser login required.', requires_login: true }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${CONTROL_PLANE_BACKEND_URL}/auth/me`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : {}),
      },
      body: body || undefined,
      cache: 'no-store',
    });
  } catch {
    return Response.json({ detail: 'Control-plane profile proxy is unavailable.' }, { status: 503 });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'no-store');
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers,
  });
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  return proxyAuthMe(request, 'GET');
}

export async function PATCH(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['PATCH'] });
  if (rejection) return rejection;
  const rawBody = await request.text();
  return proxyAuthMe(request, 'PATCH', rawBody || '{}');
}
