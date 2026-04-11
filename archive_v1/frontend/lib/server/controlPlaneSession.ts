import { promises as fs } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/config';
import {
  resolveControlPlaneAuthServiceKind,
  resolveControlPlaneAuthUrl,
} from '@/lib/server/controlPlaneAuthRouting';
import { readServerRuntimeKey } from '@/lib/server/runtimeControlPlane';

const CONTROL_PLANE_ADMIN_COOKIE = 'orion_cp_admin';
const CONTROL_PLANE_SESSION_COOKIE = 'orion_cp_session';
const CONTROL_PLANE_OAUTH_COOKIE = 'orion_cp_oauth';
const CONTROL_PLANE_SESSION_TTL_SECONDS = 60 * 30;
const CONTROL_PLANE_RUNTIME_URL =
  process.env.ORION_API_URL || process.env.NEXT_PUBLIC_ORION_API_URL || API_BASE;
const CONTROL_PLANE_ROLE_ORDER = { viewer: 0, member: 1, owner: 2 } as const;

export type ControlPlaneRole = keyof typeof CONTROL_PLANE_ROLE_ORDER;

type ControlPlaneAuthProviders = {
  email: { enabled: boolean };
  google: { enabled: boolean };
  apple: { enabled: boolean };
};

type ControlPlaneWorkspaceCapabilityPolicy = {
  allow: string[];
  deny: string[];
};

type ControlPlaneWorkspaceAccess = {
  tenantId?: string;
  role: ControlPlaneRole;
  capabilities: ControlPlaneWorkspaceCapabilityPolicy;
  dangerousActionClasses: ControlPlaneWorkspaceCapabilityPolicy;
  trustedOwnerMachineIds: string[];
};

type ControlPlaneSessionPayload = {
  v: 1;
  exp: number;
  host: string;
  ua: string;
  sub: string;
  authType: 'bearer' | 'trusted_local';
  role: ControlPlaneRole;
  admin: boolean;
  workspaceAccess?: Record<string, ControlPlaneWorkspaceAccess>;
  currentWorkspaceId?: string;
  defaultWorkspaceId?: string;
  currentTenantId?: string;
  defaultTenantId?: string;
};

type ControlPlaneIdentity = {
  sub: string;
  email: string | null;
  authType: 'bearer' | 'trusted_local';
  role: ControlPlaneRole;
  admin: boolean;
  workspaceAccess?: Record<string, ControlPlaneWorkspaceAccess>;
  currentWorkspaceId?: string;
  defaultWorkspaceId?: string;
  currentTenantId?: string;
  defaultTenantId?: string;
};

type PendingControlPlaneOauth = {
  state: string;
  returnTo: string;
  desktopMode?: boolean;
  exp?: number;
};

type PendingDesktopControlPlaneAuth = {
  token: string;
  returnTo: string;
  exp: number;
};

function normalizeControlPlaneRole(value: unknown, fallback: ControlPlaneRole = 'member'): ControlPlaneRole {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'owner' || token === 'member' || token === 'viewer') return token;
  return fallback;
}

function controlPlaneRoleAllowed(actual: ControlPlaneRole, minimum: ControlPlaneRole): boolean {
  return CONTROL_PLANE_ROLE_ORDER[actual] >= CONTROL_PLANE_ROLE_ORDER[minimum];
}

function normalizeTokenList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function normalizeWorkspaceCapabilityPolicy(value: unknown): ControlPlaneWorkspaceCapabilityPolicy {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    allow: normalizeTokenList(payload.allow),
    deny: normalizeTokenList(payload.deny),
  };
}

function normalizeWorkspaceAccess(value: unknown): Record<string, ControlPlaneWorkspaceAccess> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, ControlPlaneWorkspaceAccess> = {};
  for (const [rawWorkspaceId, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    const workspaceId = String(rawWorkspaceId || '').trim();
    if (!workspaceId || !rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as Record<string, unknown>;
    out[workspaceId] = {
      tenantId: String(entry.tenantId ?? entry.tenant_id ?? '').trim() || undefined,
      role: normalizeControlPlaneRole(entry.role, 'viewer'),
      capabilities: normalizeWorkspaceCapabilityPolicy(entry.capabilities),
      dangerousActionClasses: normalizeWorkspaceCapabilityPolicy(entry.dangerousActionClasses ?? entry.dangerous_action_classes),
      trustedOwnerMachineIds: normalizeTokenList(entry.trustedOwnerMachineIds ?? entry.trusted_owner_machine_ids),
    };
  }
  return out;
}

function normalizeOptionalToken(value: unknown): string | undefined {
  const token = String(value || '').trim();
  return token || undefined;
}

function deriveWorkspaceIdentity(
  workspaceAccess: Record<string, ControlPlaneWorkspaceAccess> | undefined,
  currentWorkspaceId?: string,
  defaultWorkspaceId?: string,
  currentTenantId?: string,
  defaultTenantId?: string,
) {
  const normalizedWorkspaceAccess = normalizeWorkspaceAccess(workspaceAccess);
  const accessibleWorkspaceIds = Object.keys(normalizedWorkspaceAccess);
  const resolvedDefaultWorkspaceId =
    (defaultWorkspaceId && normalizedWorkspaceAccess[defaultWorkspaceId] ? defaultWorkspaceId : undefined)
    || accessibleWorkspaceIds[0]
    || defaultWorkspaceId;
  const resolvedCurrentWorkspaceId =
    (currentWorkspaceId && normalizedWorkspaceAccess[currentWorkspaceId] ? currentWorkspaceId : undefined)
    || resolvedDefaultWorkspaceId
    || currentWorkspaceId;
  const resolvedDefaultTenantId =
    (resolvedDefaultWorkspaceId && normalizedWorkspaceAccess[resolvedDefaultWorkspaceId]?.tenantId)
    || defaultTenantId;
  const resolvedCurrentTenantId =
    (resolvedCurrentWorkspaceId && normalizedWorkspaceAccess[resolvedCurrentWorkspaceId]?.tenantId)
    || currentTenantId
    || resolvedDefaultTenantId;
  return {
    workspaceAccess: normalizedWorkspaceAccess,
    currentWorkspaceId: resolvedCurrentWorkspaceId,
    defaultWorkspaceId: resolvedDefaultWorkspaceId,
    currentTenantId: resolvedCurrentTenantId,
    defaultTenantId: resolvedDefaultTenantId,
  };
}

function resolveSessionWorkspaceId(
  parsed: Pick<ControlPlaneSessionPayload, 'workspaceAccess' | 'currentWorkspaceId' | 'defaultWorkspaceId' | 'currentTenantId' | 'defaultTenantId'> | null | undefined,
  workspaceId: string,
): string {
  const requestedWorkspaceId = String(workspaceId || '').trim() || 'default';
  const identity = deriveWorkspaceIdentity(
    parsed?.workspaceAccess,
    normalizeOptionalToken(parsed?.currentWorkspaceId),
    normalizeOptionalToken(parsed?.defaultWorkspaceId),
    normalizeOptionalToken(parsed?.currentTenantId),
    normalizeOptionalToken(parsed?.defaultTenantId),
  );
  if (requestedWorkspaceId !== 'default') {
    return identity.workspaceAccess[requestedWorkspaceId] ? requestedWorkspaceId : requestedWorkspaceId;
  }
  return identity.currentWorkspaceId || identity.defaultWorkspaceId || requestedWorkspaceId;
}

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
    role: identity.role,
    admin: identity.admin,
    workspaceAccess: identity.workspaceAccess,
    currentWorkspaceId: identity.currentWorkspaceId,
    defaultWorkspaceId: identity.defaultWorkspaceId,
    currentTenantId: identity.currentTenantId,
    defaultTenantId: identity.defaultTenantId,
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

function normalizedSecret(raw: string | undefined | null): string {
  return String(raw || '').trim();
}

function stateHomePath(): string {
  return normalizedSecret(process.env.EMPYRALIS_STATE_HOME) || path.join(homedir(), '.empyralis', 'state');
}

function jwtSecretPath(): string {
  return normalizedSecret(process.env.EMPYRALIS_JWT_SECRET_FILE) || path.join(stateHomePath(), 'auth', 'jwt_secret');
}

async function readPersistedJwtSecret(): Promise<string> {
  const explicit = normalizedSecret(process.env.ORION_JWT_SECRET) || normalizedSecret(process.env.JWT_SECRET);
  if (explicit) return explicit;

  const filePath = jwtSecretPath();
  const existing = normalizedSecret(await fs.readFile(filePath, 'utf8').catch(() => ''));
  if (existing) return existing;

  const seeded = normalizedSecret(process.env.ORION_API_KEY) || normalizedSecret(process.env.RUNTIME_KEY)
    || normalizedSecret(await readServerRuntimeKey().catch(() => ''));
  const secret = seeded || randomBytes(48).toString('base64url');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${secret}\n`, { mode: 0o600 });
  return secret;
}

async function jwtSecrets(): Promise<string[]> {
  const candidates = [
    String(process.env.ORION_JWT_SECRET || '').trim(),
    String(process.env.JWT_SECRET || '').trim(),
  ].filter(Boolean);

  const persisted = normalizedSecret(await readPersistedJwtSecret().catch(() => ''));
  if (persisted) {
    candidates.push(persisted);
  }

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
    const parsed = new URL(CONTROL_PLANE_RUNTIME_URL);
    if (!isLoopbackHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function desktopAuthHandoffEnabled(): boolean {
  return trustedDesktopRuntimeUrl() !== null;
}

function controlPlaneRepoRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;
}

function desktopAuthHandoffPath(): string {
  return path.join(controlPlaneRepoRoot(), '.orion-stack', 'control-plane-auth-handoff.json');
}

function pendingControlPlaneOauthDir(): string {
  return path.join(controlPlaneRepoRoot(), '.orion-stack', 'control-plane-oauth');
}

function pendingControlPlaneOauthPath(state: string): string {
  const key = createHash('sha256').update(String(state || '').trim()).digest('hex');
  return path.join(pendingControlPlaneOauthDir(), `${key}.json`);
}

async function controlPlaneSessionSecret(): Promise<string> {
  const configured = String(process.env.ORION_CONTROL_PLANE_SESSION_SECRET || '').trim();
  if (configured) return configured;
  const persisted = normalizedSecret(await readPersistedJwtSecret().catch(() => ''));
  if (persisted) return persisted;
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
    const exp = Number(parsed.exp || 0);
    if (!state) return null;
    if (Number.isFinite(exp) && exp > 0 && exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { state, returnTo, desktopMode: Boolean(parsed.desktopMode), exp };
  } catch {
    return null;
  }
}

async function writePendingControlPlaneOauth(payload: PendingControlPlaneOauth): Promise<void> {
  const targetPath = pendingControlPlaneOauthPath(payload.state);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
}

async function readPendingControlPlaneOauthFile(state: string): Promise<PendingControlPlaneOauth | null> {
  const normalizedState = String(state || '').trim();
  if (!normalizedState) return null;
  const targetPath = pendingControlPlaneOauthPath(normalizedState);
  let raw = '';
  try {
    raw = await fs.readFile(targetPath, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingControlPlaneOauth;
    const pending = decodePendingOauth(base64UrlEncode(JSON.stringify(parsed)));
    if (!pending || pending.state !== normalizedState) {
      await fs.unlink(targetPath).catch(() => undefined);
      return null;
    }
    return pending;
  } catch {
    await fs.unlink(targetPath).catch(() => undefined);
    return null;
  }
}

async function clearPendingControlPlaneOauthFile(state: string): Promise<void> {
  const normalizedState = String(state || '').trim();
  if (!normalizedState) return;
  await fs.unlink(pendingControlPlaneOauthPath(normalizedState)).catch(() => undefined);
}

async function writePendingDesktopControlPlaneAuth(
  bearerToken: string,
  returnTo: string,
): Promise<void> {
  if (!desktopAuthHandoffEnabled()) return;
  const targetPath = desktopAuthHandoffPath();
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const payload: PendingDesktopControlPlaneAuth = {
    token: bearerToken,
    returnTo: sanitizeReturnTo(returnTo),
    exp: Math.floor(Date.now() / 1000) + (60 * 10),
  };
  await fs.writeFile(targetPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
}

async function consumePendingDesktopControlPlaneAuth(): Promise<PendingDesktopControlPlaneAuth | null> {
  if (!desktopAuthHandoffEnabled()) return null;
  const targetPath = desktopAuthHandoffPath();
  let raw = '';
  try {
    raw = await fs.readFile(targetPath, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingDesktopControlPlaneAuth;
    const token = String(parsed.token || '').trim();
    const returnTo = sanitizeReturnTo(String(parsed.returnTo || '').trim());
    const exp = Number(parsed.exp || 0);
    await fs.unlink(targetPath).catch(() => undefined);
    if (!token || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { token, returnTo, exp };
  } catch {
    await fs.unlink(targetPath).catch(() => undefined);
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

function parseBearerClaims(token: string): { sub: string; email: string | null; exp: number; role: ControlPlaneRole } | Response {
  let payload: Record<string, unknown>;
  try {
    payload = decodeBearerPayloadSegment(token);
  } catch {
    return Response.json({ detail: 'Invalid bearer token.' }, { status: 401 });
  }
  const sub = String(payload.sub || '').trim();
  const exp = Number(payload.exp || 0);
  const email = String(payload.email || '').trim().toLowerCase() || null;
  if (!sub) {
    return Response.json({ detail: 'Bearer token subject is missing.' }, { status: 401 });
  }
  if (Number.isFinite(exp) && exp > 0 && exp < Math.floor(Date.now() / 1000)) {
    return Response.json({ detail: 'Bearer token has expired.' }, { status: 401 });
  }
  return { sub, email, exp, role: normalizeControlPlaneRole(payload.role, 'member') };
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

async function fetchRuntimeRole(
  token: string,
): Promise<Pick<ControlPlaneIdentity, 'email' | 'role' | 'admin' | 'workspaceAccess' | 'currentWorkspaceId' | 'defaultWorkspaceId' | 'currentTenantId' | 'defaultTenantId'> | null> {
  try {
    const response = await fetch(resolveControlPlaneAuthUrl('me'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as {
      user?: { email?: string | null; role?: string | null; is_admin?: boolean | null } | null;
      current_workspace_id?: string | null;
      default_workspace_id?: string | null;
      current_tenant_id?: string | null;
      default_tenant_id?: string | null;
      workspace_access?: Array<{
        workspace_id?: string | null;
        tenant_id?: string | null;
        role?: string | null;
        capabilities?: { allow?: string[]; deny?: string[] } | null;
        dangerous_action_classes?: { allow?: string[]; deny?: string[] } | null;
        trusted_owner_machine_ids?: string[] | null;
      }> | null;
    } | null;
    const user = payload?.user;
    if (!user || typeof user !== 'object') return null;
    const role = normalizeControlPlaneRole(user.role, Boolean(user.is_admin) ? 'owner' : 'member');
    const workspaceAccess: Record<string, ControlPlaneWorkspaceAccess> = {};
    for (const item of Array.isArray(payload?.workspace_access) ? payload.workspace_access : []) {
      const workspaceId = String(item?.workspace_id || '').trim();
      if (!workspaceId) continue;
      workspaceAccess[workspaceId] = {
        tenantId: String(item?.tenant_id || '').trim() || undefined,
        role: normalizeControlPlaneRole(item?.role, role),
        capabilities: normalizeWorkspaceCapabilityPolicy(item?.capabilities),
        dangerousActionClasses: normalizeWorkspaceCapabilityPolicy(item?.dangerous_action_classes),
        trustedOwnerMachineIds: normalizeTokenList(item?.trusted_owner_machine_ids),
      };
    }
    const workspaceIdentity = deriveWorkspaceIdentity(
      workspaceAccess,
      normalizeOptionalToken(payload?.current_workspace_id),
      normalizeOptionalToken(payload?.default_workspace_id),
      normalizeOptionalToken(payload?.current_tenant_id),
      normalizeOptionalToken(payload?.default_tenant_id),
    );
    return {
      email: String(user.email || '').trim().toLowerCase() || null,
      role,
      admin: role === 'owner',
      workspaceAccess: workspaceIdentity.workspaceAccess,
      currentWorkspaceId: workspaceIdentity.currentWorkspaceId,
      defaultWorkspaceId: workspaceIdentity.defaultWorkspaceId,
      currentTenantId: workspaceIdentity.currentTenantId,
      defaultTenantId: workspaceIdentity.defaultTenantId,
    };
  } catch {
    return null;
  }
}

async function verifyAdminBearerIdentity(token: string): Promise<ControlPlaneIdentity | Response> {
  const claims = parseBearerClaims(token);
  if (claims instanceof Response) return claims;

  const signatureFailure = await verifyBearerSignature(token);
  const resolved = await fetchRuntimeRole(token);
  if (!signatureFailure) {
    const role = resolved?.role || claims.role;
    return {
      sub: claims.sub,
      email: resolved?.email ?? claims.email,
      authType: 'bearer',
      role,
      admin: role === 'owner',
      workspaceAccess: resolved?.workspaceAccess,
      currentWorkspaceId: resolved?.currentWorkspaceId,
      defaultWorkspaceId: resolved?.defaultWorkspaceId,
      currentTenantId: resolved?.currentTenantId,
      defaultTenantId: resolved?.defaultTenantId,
    };
  }
  if (resolved) {
    return {
      sub: claims.sub,
      email: resolved.email ?? claims.email,
      authType: 'bearer',
      role: resolved.role,
      admin: resolved.admin,
      workspaceAccess: resolved.workspaceAccess,
      currentWorkspaceId: resolved.currentWorkspaceId,
      defaultWorkspaceId: resolved.defaultWorkspaceId,
      currentTenantId: resolved.currentTenantId,
      defaultTenantId: resolved.defaultTenantId,
    };
  }
  return Response.json({ detail: 'Invalid bearer token.' }, { status: 401 });
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

function localControlPlaneAuthProviders(): ControlPlaneAuthProviders {
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
  if (!String(parsed.sub || '').trim()) return null;
  if (!['bearer', 'trusted_local'].includes(String(parsed.authType || '').trim())) return null;
  parsed.role = normalizeControlPlaneRole(parsed.role, parsed.admin ? 'owner' : 'member');
  parsed.admin = parsed.role === 'owner';
  const workspaceIdentity = deriveWorkspaceIdentity(
    parsed.workspaceAccess,
    normalizeOptionalToken(parsed.currentWorkspaceId),
    normalizeOptionalToken(parsed.defaultWorkspaceId),
    normalizeOptionalToken(parsed.currentTenantId),
    normalizeOptionalToken(parsed.defaultTenantId),
  );
  parsed.workspaceAccess = workspaceIdentity.workspaceAccess;
  parsed.currentWorkspaceId = workspaceIdentity.currentWorkspaceId;
  parsed.defaultWorkspaceId = workspaceIdentity.defaultWorkspaceId;
  parsed.currentTenantId = workspaceIdentity.currentTenantId;
  parsed.defaultTenantId = workspaceIdentity.defaultTenantId;
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
    role: 'owner',
    admin: true,
    workspaceAccess: {
      default: {
        tenantId: 'default',
        role: 'owner',
        capabilities: { allow: ['*'], deny: [] },
        dangerousActionClasses: { allow: ['*'], deny: [] },
        trustedOwnerMachineIds: [],
      },
    },
    currentWorkspaceId: 'default',
    defaultWorkspaceId: 'default',
    currentTenantId: 'default',
    defaultTenantId: 'default',
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
  const workspaceIdentity = deriveWorkspaceIdentity(
    identity.workspaceAccess,
    normalizeOptionalToken(identity.currentWorkspaceId),
    normalizeOptionalToken(identity.defaultWorkspaceId),
    normalizeOptionalToken(identity.currentTenantId),
    normalizeOptionalToken(identity.defaultTenantId),
  );
  const now = Math.floor(Date.now() / 1000);
  const tokenMaxAge = Number.isFinite(claims.exp) && claims.exp > now
    ? Math.max(60, claims.exp - now)
    : 3600;

  const response = redirectTo
    ? NextResponse.redirect(new URL(sanitizeReturnTo(redirectTo), request.nextUrl.origin))
    : NextResponse.json({
      ok: true,
      auth_type: identity.authType,
      admin: identity.admin,
      role: identity.role,
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
  const sessionPayload: ControlPlaneSessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + CONTROL_PLANE_SESSION_TTL_SECONDS,
    host: request.nextUrl.host,
    ua: uaDigest(request),
    sub: identity.sub,
    authType: identity.authType,
    role: identity.role,
    admin: identity.admin,
    workspaceAccess: workspaceIdentity.workspaceAccess,
    currentWorkspaceId: workspaceIdentity.currentWorkspaceId,
    defaultWorkspaceId: workspaceIdentity.defaultWorkspaceId,
    currentTenantId: workspaceIdentity.currentTenantId,
    defaultTenantId: workspaceIdentity.defaultTenantId,
  };
  const sessionToken = await encodeSession(sessionPayload);
  response.cookies.set({
    name: CONTROL_PLANE_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: CONTROL_PLANE_SESSION_TTL_SECONDS,
  });
  return response;
}

export async function requireAdminBrowserIdentity(request: NextRequest): Promise<ControlPlaneIdentity | Response> {
  const token = request.cookies.get(CONTROL_PLANE_ADMIN_COOKIE)?.value || '';
  if (!token) {
    return Response.json(
      { detail: 'Browser login required.', requires_login: true },
      { status: 401 },
    );
  }

  const identity = await verifyAdminBearerIdentity(token);
  if (identity instanceof Response) {
    const next = NextResponse.json(
      { detail: 'Browser login required.', requires_login: true },
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
  const workspaceIdentity = deriveWorkspaceIdentity(
    identity.workspaceAccess,
    normalizeOptionalToken(identity.currentWorkspaceId),
    normalizeOptionalToken(identity.defaultWorkspaceId),
    normalizeOptionalToken(identity.currentTenantId),
    normalizeOptionalToken(identity.defaultTenantId),
  );
  const payload: ControlPlaneSessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + CONTROL_PLANE_SESSION_TTL_SECONDS,
    host: request.nextUrl.host,
    ua: uaDigest(request),
    sub: identity.sub,
    authType: identity.authType,
    role: identity.role,
    admin: identity.admin,
    workspaceAccess: workspaceIdentity.workspaceAccess,
    currentWorkspaceId: workspaceIdentity.currentWorkspaceId,
    defaultWorkspaceId: workspaceIdentity.defaultWorkspaceId,
    currentTenantId: workspaceIdentity.currentTenantId,
    defaultTenantId: workspaceIdentity.defaultTenantId,
  };
  const token = await encodeSession(payload);
  const response = NextResponse.json({ ok: true, expires_in: CONTROL_PLANE_SESSION_TTL_SECONDS, role: identity.role });
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

export async function requireControlPlaneRole(
  request: NextRequest,
  minimumRole: ControlPlaneRole,
): Promise<Response | null> {
  const parsed = await getControlPlaneSession(request);
  if (!parsed) {
    return Response.json({ detail: 'Control-plane session required.' }, { status: 401 });
  }
  const actualRole = normalizeControlPlaneRole(parsed.role, parsed.admin ? 'owner' : 'member');
  if (controlPlaneRoleAllowed(actualRole, minimumRole)) return null;
  return Response.json(
    { detail: `${minimumRole} role required.`, required_role: minimumRole, role: actualRole },
    { status: 403 },
  );
}

export async function requireControlPlaneWorkspaceAccess(
  request: NextRequest,
  workspaceId: string,
  minimumRole: ControlPlaneRole,
  capabilityId?: string,
): Promise<Response | null> {
  const parsed = await getControlPlaneSession(request);
  if (!parsed) {
    return Response.json({ detail: 'Control-plane session required.' }, { status: 401 });
  }
  const workspaceToken = resolveSessionWorkspaceId(parsed, workspaceId);
  const workspaceAccess = normalizeWorkspaceAccess(parsed.workspaceAccess);
  const workspaceEntry = workspaceAccess[workspaceToken];
  const effectiveRole = workspaceEntry?.role || (parsed.admin ? 'owner' : null);
  if (!effectiveRole) {
    return Response.json(
      { detail: `Workspace '${workspaceToken}' is not accessible.`, workspace_id: workspaceToken },
      { status: 403 },
    );
  }
  if (!controlPlaneRoleAllowed(effectiveRole, minimumRole)) {
    return Response.json(
      {
        detail: `${minimumRole} role required for workspace '${workspaceToken}'.`,
        required_role: minimumRole,
        role: effectiveRole,
        workspace_id: workspaceToken,
      },
      { status: 403 },
    );
  }
  const capabilityToken = String(capabilityId || '').trim().toLowerCase();
  if (capabilityToken && workspaceEntry) {
    const denied = new Set(workspaceEntry.capabilities.deny);
    const allowed = new Set(workspaceEntry.capabilities.allow);
    if (denied.has('*') || denied.has(capabilityToken)) {
      return Response.json(
        {
          detail: `Capability '${capabilityToken}' is not allowed in workspace '${workspaceToken}'.`,
          workspace_id: workspaceToken,
          capability_id: capabilityToken,
        },
        { status: 403 },
      );
    }
    if (allowed.size > 0 && !allowed.has('*') && !allowed.has(capabilityToken) && effectiveRole !== 'owner') {
      return Response.json(
        {
          detail: `Capability '${capabilityToken}' is not granted in workspace '${workspaceToken}'.`,
          workspace_id: workspaceToken,
          capability_id: capabilityToken,
        },
        { status: 403 },
      );
    }
  }
  return null;
}

export async function resolveRuntimeWorkspaceId(
  request: NextRequest,
  workspaceId: string,
): Promise<string> {
  const parsed = await getControlPlaneSession(request);
  return resolveSessionWorkspaceId(parsed, workspaceId);
}

export function controlPlaneAuthProviders(): ControlPlaneAuthProviders {
  return localControlPlaneAuthProviders();
}

export async function fetchControlPlaneAuthProviders(): Promise<ControlPlaneAuthProviders> {
  try {
    const response = await fetch(resolveControlPlaneAuthUrl('providers'), {
      method: 'GET',
      cache: 'no-store',
    });
    if (response.ok) {
      const payload = await response.json().catch(() => null) as Partial<ControlPlaneAuthProviders> | null;
      if (payload && typeof payload === 'object') {
        return {
          email: { enabled: Boolean(payload.email?.enabled ?? true) },
          google: { enabled: Boolean(payload.google?.enabled) },
          apple: { enabled: Boolean(payload.apple?.enabled) },
        };
      }
    }
  } catch {
    // Fall back to the frontend runtime view when the backend auth service is unavailable.
  }
  if (resolveControlPlaneAuthServiceKind() === 'runtime') {
    return {
      email: { enabled: true },
      google: { enabled: false },
      apple: { enabled: false },
    };
  }
  return localControlPlaneAuthProviders();
}

export async function issuePendingControlPlaneOauthRedirect(
  request: NextRequest,
  startUrl: string,
  returnTo: string,
  options?: { desktopMode?: boolean },
): Promise<NextResponse> {
  const state = randomUUID();
  const exp = Math.floor(Date.now() / 1000) + (60 * 10);
  const nextUrl = new URL(startUrl);
  nextUrl.searchParams.set('state', state);
  const response = NextResponse.redirect(nextUrl);
  response.cookies.set({
    name: CONTROL_PLANE_OAUTH_COOKIE,
    value: encodePendingOauth({
      state,
      returnTo: sanitizeReturnTo(returnTo),
      desktopMode: Boolean(options?.desktopMode),
      exp,
    }),
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 60 * 10,
  });
  await writePendingControlPlaneOauth({
    state,
    returnTo: sanitizeReturnTo(returnTo),
    desktopMode: Boolean(options?.desktopMode),
    exp,
  });
  return response;
}

export async function readPendingControlPlaneOauth(
  request: NextRequest,
  stateHint?: string,
): Promise<PendingControlPlaneOauth | null> {
  const token = request.cookies.get(CONTROL_PLANE_OAUTH_COOKIE)?.value || '';
  const cookiePending = token ? decodePendingOauth(token) : null;
  const normalizedStateHint = String(stateHint || '').trim();
  if (cookiePending && (!normalizedStateHint || cookiePending.state === normalizedStateHint)) {
    return cookiePending;
  }
  if (!normalizedStateHint) {
    return cookiePending;
  }
  return readPendingControlPlaneOauthFile(normalizedStateHint);
}

export async function clearPendingControlPlaneOauth(
  response: NextResponse,
  request: NextRequest,
  stateHint?: string,
): Promise<void> {
  const token = request.cookies.get(CONTROL_PLANE_OAUTH_COOKIE)?.value || '';
  const cookiePending = token ? decodePendingOauth(token) : null;
  clearCookie(response, request, CONTROL_PLANE_OAUTH_COOKIE);
  await clearPendingControlPlaneOauthFile(cookiePending?.state || '');
  await clearPendingControlPlaneOauthFile(String(stateHint || '').trim());
}

export async function issueDesktopControlPlaneAuthHandoff(
  bearerToken: string,
  returnTo: string,
): Promise<Response | null> {
  await writePendingDesktopControlPlaneAuth(bearerToken, returnTo);
  return null;
}

export async function consumeDesktopControlPlaneAuthHandoffResponse(
  request: NextRequest,
): Promise<NextResponse | Response | null> {
  const pending = await consumePendingDesktopControlPlaneAuth();
  if (!pending) return null;
  return issueAdminBrowserIdentityResponse(request, pending.token);
}
