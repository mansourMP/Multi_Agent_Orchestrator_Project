import type { NextRequest } from 'next/server';
import { API_BASE } from '@/lib/config';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  desktopAuthHandoffEnabled,
  issueAdminBrowserIdentityResponse,
  issueDesktopControlPlaneAuthHandoff,
  sanitizeReturnTo,
} from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

const CONTROL_PLANE_BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || API_BASE;

type LoginBody = {
  email?: string;
  password?: string;
  desktop_handoff?: boolean;
  return_to?: string;
};

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;

  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const desktopHandoff = Boolean(body?.desktop_handoff);
  const returnTo = sanitizeReturnTo(String(body?.return_to || '/'));
  if (!email || !password) {
    return Response.json({ detail: 'Email and password are required.' }, { status: 400 });
  }

  let loginResponse: Response;
  try {
    loginResponse = await fetch(`${CONTROL_PLANE_BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ detail: 'Control-plane login is unavailable.' }, { status: 503 });
  }

  const payload = (await loginResponse.json().catch(() => null)) as
    | {
        token?: string;
        detail?: string;
        error?: string;
      }
    | null;

  if (!loginResponse.ok) {
    const detail =
      (payload && typeof payload.detail === 'string' && payload.detail.trim()) ||
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      'Login failed.';
    return Response.json({ detail }, { status: loginResponse.status || 401 });
  }

  const token = String(payload?.token || '').trim();
  if (!token) {
    return Response.json({ detail: 'Login did not return a bearer token.' }, { status: 502 });
  }

  if (desktopHandoff) {
    if (!desktopAuthHandoffEnabled()) {
      return Response.json(
        { detail: 'Desktop auth handoff is unavailable in this frontend runtime.' },
        { status: 503 },
      );
    }
    const handoffFailure = await issueDesktopControlPlaneAuthHandoff(token, returnTo);
    if (handoffFailure) {
      return handoffFailure;
    }
    return Response.json({
      ok: true,
      desktop_handoff: true,
      redirect_to: `/sign-in/complete?mode=desktop&returnTo=${encodeURIComponent(returnTo)}`,
    });
  }

  return issueAdminBrowserIdentityResponse(request, token);
}
