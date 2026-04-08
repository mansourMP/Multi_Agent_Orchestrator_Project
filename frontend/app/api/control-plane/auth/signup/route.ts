import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  desktopAuthHandoffEnabled,
  issueAdminBrowserIdentityResponse,
  issueDesktopControlPlaneAuthHandoff,
  sanitizeReturnTo,
} from '@/lib/server/controlPlaneSession';
import { buildDesktopSignInCompletionPath, resolveControlPlaneBackendUrl } from '@/lib/server/controlPlaneAuthRouting';

export const dynamic = 'force-dynamic';

type SignupBody = {
  name?: string;
  email?: string;
  password?: string;
  desktop_handoff?: boolean;
  return_to?: string;
};

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;

  const body = (await request.json().catch(() => null)) as SignupBody | null;
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const desktopHandoff = Boolean(body?.desktop_handoff);
  const returnTo = sanitizeReturnTo(String(body?.return_to || '/'));
  if (!name || !email || !password) {
    return Response.json({ detail: 'Name, email, and password are required.' }, { status: 400 });
  }

  let signupResponse: Response;
  try {
    signupResponse = await fetch(`${resolveControlPlaneBackendUrl()}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email, password }),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ detail: 'Control-plane sign-up is unavailable.' }, { status: 503 });
  }

  const payload = (await signupResponse.json().catch(() => null)) as
    | {
      token?: string;
      detail?: string;
      error?: string;
    }
    | null;

  if (!signupResponse.ok) {
    const detail =
      (payload && typeof payload.detail === 'string' && payload.detail.trim())
      || (payload && typeof payload.error === 'string' && payload.error.trim())
      || 'Account creation failed.';
    return Response.json({ detail }, { status: signupResponse.status || 400 });
  }

  const token = String(payload?.token || '').trim();
  if (!token) {
    return Response.json({ detail: 'Account creation did not return a bearer token.' }, { status: 502 });
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
      redirect_to: buildDesktopSignInCompletionPath(returnTo),
    });
  }

  return issueAdminBrowserIdentityResponse(request, token);
}
