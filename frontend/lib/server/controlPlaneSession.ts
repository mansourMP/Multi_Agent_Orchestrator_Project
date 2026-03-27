import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/config';
import { readServerRuntimeKey } from '@/lib/server/runtimeControlPlane';

const CONTROL_PLANE_ADMIN_COOKIE = 'orion_cp_admin';
const CONTROL_PLANE_SESSION_COOKIE = 'orion_cp_session';
const CONTROL_PLANE_OAUTH_COOKIE = 'orion_cp_oauth';
const CONTROL_PLANE_SESSION_TTL_SECONDS = 60 * 30;
const CONTROL_PLANE_AUTH_URL =
  process.env.ORION_API_URL || process.env.NEXT_PUBLIC_ORION_API_URL || API_BASE;
const CONTROL_PLANE_BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || API_BASE;
const INSECURE_DEV_JWT_SECRET = 'dev-secret-change-in-production';

type ControlPlaneSessionPayload = {
  v: 1;
  exp: number;
  host: string;
  ua: string;
  sub: string;
  authType: 'bearer' | 'trusted_local';
  admin: true;
};

type ControlPlaneIdentity = {
  sub: string;
  email: string | null;
  authType: 'bearer' | 'trusted_local';
  admin: true;
};

type PendingControlPlaneOauth = {
  state: string;
  returnTo: string;
};

function trustedDesktopSessionPayload(request: NextRequest): ControlPlaneSessionPayload | null {
  const identity = getTrustedDesktopIdentity(request);
  if (!identity) return null;
  return {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + CONTROL_PLANE_SESSION_TTL_SECONDS,
    host: request.nextUrl.host,
    ua: uaDigest(request),
    sub: identity.sub,
    authType: identity.authType,
    admin: true,
  };
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function uaDigest(request: NextRequest): string {
  const ua = String(request.headers.get('user-agent') || '').trim();
  return createHash('sha256').update(ua).digest('hex');
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function jwtSecrets(): Promise<string[]> {
  const candidates = [
    String(process.env.ORION_JWT_SECRET || '').trim(),
    String(process.env.JWT_SECRET || '').trim(),
    INSECURE_DEV_JWT_SECRET,
  ].filter(Boolean);

  const runtimeKey = String(await readServerRuntimeKey().catch(() => '')).trim();
  if (runtimeKey) {
    candidates.push(runtimeKey);
  }

  return Array.from(new Set(candidates));
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function trustedDesktopRuntimeUrl(): URL | null {
  const enabled = String(process.env.EMPYRALIS_TAURI_DESKTOP || '').trim() === '1';
  if (!enabled) return null;
  try {
    const parsed = new URL(CONTROL_PLANE_AUTH_URL);
    if (!isLoopbackHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function controlPlaneSessionSecret(): Promise<string> {
  const configured = String(process.env.ORION_CONTROL_PLANE_SESSION_SECRET || '').trim();
  if (configured) return configured;
  return readServerRuntimeKey();
}

async function signPayload(encodedPayload: string): Promise<string> {
  const secret = await controlPlaneSessionSecret();
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

async function encodeSession(payload: ControlPlaneSessionPayload): Promise<string> {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function encodePendingOauth(payload: PendingControlPlaneOauth): string {
  return base64UrlEncode(JSON.stringify(payload));
}

function decodePendingOauth(raw: string): PendingControlPlaneOauth | null {
  try {
    const parsed = JSON.parse(base64UrlDecode(raw)) as PendingControlPlaneOauth;
    const state = String(parsed.state || '').trim();
    const returnTo = sanitizeReturnTo(String(parsed.returnTo || '').trim());
    if (!state) return null;
    return { state, returnTo };
  } catch {
    return null;
  }
}

function decodeBearerPayloadSegment(token: string): Record<string, unknown> {
  try {
    const [, payloadSegment, signatureSegment] = String(token || '').split('.', 3);
    if (!payloadSegment || !signatureSegment) {
      throw new Error('missing-parts');
    }
    return JSON.parse(base64UrlDecode(payloadSegment)) as Record<string, unknown>;
  } catch {
    throw new Error('invalid-bearer-token');
  }
}

function parseBearerClaims(token: string): { sub: string; email: string | null; exp: number } | Response {
  const payload = decodeBearerPayloadSegment(token);
  const sub = String(payload.sub || '').trim();
  const exp = Number(payload.exp || 0);
  const email = String(payload.email || '').trim().toLowerCase() || null;
  if (!sub) {
    return Response.json({ detail: 'Bearer token subject is missing.' }, { status: 401 });
  }
  if (Number.isFinite(exp) && exp > 0 && exp < Math.floor(Date.now() / 1000)) {
    return Response.json({ detail: 'Bearer token has expired.' }, { status: 401 });
  }
  return { sub, email, exp };
}

async function verifyBearerSignature(token: string): Promise<Response | null> {
  const parts = String(token || '').split('.', 3);
  if (parts.length !== 3) {
    return Response.json({ detail: 'Invalid bearer token.' }, { status: 401 });
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const secrets = await jwtSecrets();
  const matched = secrets.some((secret) => {
    const expectedSignature = createHmac('sha256', secret).update(signingInput).digest('base64url');
    return safeEqualText(expectedSignature, signatureSegment);
  });
  if (!matched) {
    return Response.json({ detail: 'Invalid bearer token.' }, { status: 401 });
  }
  return null;
}

async function verifyAdminBearerIdentity(token: string): Promise<ControlPlaneIdentity | Response> {
  const signatureFailure = await verifyBearerSignature(token);
  if (signatureFailure) return signatureFailure;

  const claims = parseBearerClaims(token);
  if (claims instanceof Response) return claims;

  let runtimeResponse: Response | null = null;
  try {
    runtimeResponse = await fetch(`${CONTROL_PLANE_AUTH_URL}/approvals/audit?limit=1`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  } catch {
    runtimeResponse = null;
  }

  if (runtimeResponse?.ok) {
    return {
      sub: claims.sub,
      email: claims.email,
      authType: 'bearer',
      admin: true,
    };
  }

  let backendResponse: Response | null = null;
  try {
    backendResponse = await fetch(`${CONTROL_PLANE_BACKEND_URL}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  } catch {
    backendResponse = null;
  }

  if (backendResponse?.ok) {
    return {
      sub: claims.sub,
      email: claims.email,
      authType: 'bearer',
      admin: true,
    };
  }

  if (runtimeResponse?.status === 403 || backendResponse?.status === 403) {
    return Response.json({ detail: 'Admin control-plane access required.' }, { status: 403 });
  }

  if (runtimeResponse?.status === 401 && backendResponse?.status === 401) {
    return Response.json({ detail: 'Invalid bearer token.' }, { status: 401 });
  }

  if ((runtimeResponse && !runtimeResponse.ok) || (backendResponse && !backendResponse.ok)) {
    return Response.json({ detail: 'Admin auth verification failed.' }, { status: 503 });
  }

  return Response.json({ detail: 'Admin auth verification is unavailable.' }, { status: 503 });
}

function clearCookie(response: NextResponse, request: NextRequest, name: string) {
  response.cookies.set({
    name,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 0,
  });
}

export function sanitizeReturnTo(raw: string): string {
  const normalized = String(raw || '').trim();
  if (!normalized) return '/';
  if (!normalized.startsWith('/')) return '/';
  if (normalized.startsWith('//')) return '/';
  return normalized;
}

async function decodeSession(token: string, request: NextRequest): Promise<ControlPlaneSessionPayload | null> {
  const [encodedPayload, providedSignature] = String(token || '').split('.');
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = await signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);
  if (expectedBuffer.length !== providedBuffer.length) return null;
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) return null;

  let parsed: ControlPlaneSessionPayload | null = null;
  try {
    parsed = JSON.parse(base64UrlDecode(encodedPayload)) as ControlPlaneSessionPayload;
  } catch {
    return null;
  }
  if (!parsed || parsed.v !== 1) return null;
  if (!Number.isFinite(parsed.exp) || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
  if (String(parsed.host || '').trim() !== request.nextUrl.host) return null;
  if (String(parsed.ua || '').trim() !== uaDigest(request)) return null;
  if (parsed.admin !== true) return null;
  if (!String(parsed.sub || '').trim()) return null;
  if (!['bearer', 'trusted_local'].includes(String(parsed.authType || '').trim())) return null;
  return parsed;
}

export async function getControlPlaneSession(request: NextRequest): Promise<ControlPlaneSessionPayload | null> {
  const token = request.cookies.get(CONTROL_PLANE_SESSION_COOKIE)?.value || '';
  const decoded = await decodeSession(token, request);
  if (decoded) return decoded;
  return trustedDesktopSessionPayload(request);
}

export async function getAdminBrowserIdentity(request: NextRequest): Promise<ControlPlaneIdentity | null> {
  const token = request.cookies.get(CONTROL_PLANE_ADMIN_COOKIE)?.value || '';
  if (!token) return null;
  const verified = await verifyAdminBearerIdentity(token);
  return verified instanceof Response ? null : verified;
}

export function getTrustedDesktopIdentity(request: NextRequest): ControlPlaneIdentity | null {
  const runtimeUrl = trustedDesktopRuntimeUrl();
  if (!runtimeUrl) return null;
  if (!isLoopbackHost(request.nextUrl.hostname)) return null;
  if (!isLoopbackHost(runtimeUrl.hostname)) return null;
  return {
    sub: 'trusted-local-desktop',
    email: null,
    authType: 'trusted_local',
    admin: true,
  };
}

export async function issueAdminBrowserIdentityResponse(
  request: NextRequest,
  bearerToken: string,
  redirectTo?: string,
): Promise<NextResponse | Response> {
  const identity = await verifyAdminBearerIdentity(bearerToken);
  if (identity instanceof Response) return identity;

  const claims = parseBearerClaims(bearerToken);
  if (claims instanceof Response) return claims;
  const now = Math.floor(Date.now() / 1000);
  const tokenMaxAge = Number.isFinite(claims.exp) && claims.exp > now
    ? Math.max(60, claims.exp - now)
    : 3600;

  const response = redirectTo
    ? NextResponse.redirect(new URL(sanitizeReturnTo(redirectTo), request.nextUrl.origin))
    : NextResponse.json({
      ok: true,
      auth_type: identity.authType,
      admin: true,
      user_id: identity.sub,
      email: identity.email,
    });
  response.cookies.set({
    name: CONTROL_PLANE_ADMIN_COOKIE,
    value: bearerToken,
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: tokenMaxAge,
  });
  return response;
}

export async function requireAdminBrowserIdentity(request: NextRequest): Promise<ControlPlaneIdentity | Response> {
  const token = request.cookies.get(CONTROL_PLANE_ADMIN_COOKIE)?.value || '';
  if (!token) {
    return Response.json(
      { detail: 'Admin browser login required.', requires_login: true },
      { status: 401 },
    );
  }

  const identity = await verifyAdminBearerIdentity(token);
  if (identity instanceof Response) {
    const next = NextResponse.json(
      { detail: 'Admin browser login required.', requires_login: true },
      { status: 401 },
    );
    clearCookie(next, request, CONTROL_PLANE_ADMIN_COOKIE);
    clearCookie(next, request, CONTROL_PLANE_SESSION_COOKIE);
    return next;
  }
  return identity;
}

export async function issueControlPlaneSessionResponse(
  request: NextRequest,
  identity: ControlPlaneIdentity,
): Promise<NextResponse> {
  const payload: ControlPlaneSessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + CONTROL_PLANE_SESSION_TTL_SECONDS,
    host: request.nextUrl.host,
    ua: uaDigest(request),
    sub: identity.sub,
    authType: identity.authType,
    admin: true,
  };
  const token = await encodeSession(payload);
  const response = NextResponse.json({ ok: true, expires_in: CONTROL_PLANE_SESSION_TTL_SECONDS });
  response.cookies.set({
    name: CONTROL_PLANE_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: CONTROL_PLANE_SESSION_TTL_SECONDS,
  });
  return response;
}

export async function requireControlPlaneSession(request: NextRequest): Promise<Response | null> {
  const parsed = await getControlPlaneSession(request);
  if (parsed) return null;
  return Response.json({ detail: 'Control-plane session required.' }, { status: 401 });
}

export function controlPlaneAuthProviders() {
  const googleEnabled = Boolean(
    String(process.env.GOOGLE_CLIENT_ID || '').trim()
    && String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  );
  const backendPublicOrigin = String(process.env.BACKEND_PUBLIC_ORIGIN || '').trim();
  let appleEnabled = false;
  if (backendPublicOrigin) {
    try {
      const parsed = new URL(backendPublicOrigin);
      const hostname = parsed.hostname.trim().toLowerCase();
      appleEnabled = parsed.protocol === 'https:'
        && !['localhost', '127.0.0.1', '::1'].includes(hostname)
        && Boolean(
          String(process.env.APPLE_CLIENT_ID || '').trim()
          && String(process.env.APPLE_TEAM_ID || '').trim()
          && String(process.env.APPLE_KEY_ID || '').trim()
          && String(process.env.APPLE_PRIVATE_KEY || '').trim(),
        );
    } catch {
      appleEnabled = false;
    }
  }

  return {
    email: { enabled: true },
    google: { enabled: googleEnabled },
    apple: { enabled: appleEnabled },
  };
}

export function issuePendingControlPlaneOauthRedirect(
  request: NextRequest,
  startUrl: string,
  returnTo: string,
): NextResponse {
  const state = randomUUID();
  const nextUrl = new URL(startUrl);
  nextUrl.searchParams.set('state', state);
  const response = NextResponse.redirect(nextUrl);
  response.cookies.set({
    name: CONTROL_PLANE_OAUTH_COOKIE,
    value: encodePendingOauth({ state, returnTo: sanitizeReturnTo(returnTo) }),
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 60 * 10,
  });
  return response;
}

export function readPendingControlPlaneOauth(request: NextRequest): PendingControlPlaneOauth | null {
  const token = request.cookies.get(CONTROL_PLANE_OAUTH_COOKIE)?.value || '';
  if (!token) return null;
  return decodePendingOauth(token);
}

export function clearPendingControlPlaneOauth(response: NextResponse, request: NextRequest) {
  clearCookie(response, request, CONTROL_PLANE_OAUTH_COOKIE);
}
