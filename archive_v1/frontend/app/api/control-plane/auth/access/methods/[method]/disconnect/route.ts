import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireAdminBrowserIdentity } from '@/lib/server/controlPlaneSession';
import { resolveControlPlaneBackendUrl } from '@/lib/server/controlPlaneAuthRouting';

export const dynamic = 'force-dynamic';
const CONTROL_PLANE_ADMIN_COOKIE = 'orion_cp_admin';

function adminBearerToken(request: NextRequest): string {
  return String(request.cookies.get(CONTROL_PLANE_ADMIN_COOKIE)?.value || '').trim();
}

type RouteContext = {
  params: Promise<{ method: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;

  const authFailure = await requireAdminBrowserIdentity(request);
  if (authFailure instanceof Response) return authFailure;

  const token = adminBearerToken(request);
  if (!token) {
    return Response.json({ detail: 'Browser login required.', requires_login: true }, { status: 401 });
  }

  const { method } = await context.params;

  try {
    const upstream = await fetch(`${resolveControlPlaneBackendUrl()}/auth/access/methods/${encodeURIComponent(method)}/disconnect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('cache-control', 'no-store');
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers,
    });
  } catch {
    return Response.json({ detail: 'Control-plane disconnect proxy is unavailable.' }, { status: 503 });
  }
}
