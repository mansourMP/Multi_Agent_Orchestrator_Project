import { execFile, execFileSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'fs';
import { createServer } from 'http';
import { delimiter, dirname, join } from 'path';
import { promisify } from 'util';
import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REDIRECT_URI = 'http://localhost:8085/oauth2callback';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';
const CODE_ASSIST_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com';
const CODE_ASSIST_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.sandbox.googleapis.com';
const CODE_ASSIST_ENDPOINT_AUTOPUSH = 'https://autopush-cloudcode-pa.sandbox.googleapis.com';
const LOAD_CODE_ASSIST_ENDPOINTS = [
  CODE_ASSIST_ENDPOINT_PROD,
  CODE_ASSIST_ENDPOINT_DAILY,
  CODE_ASSIST_ENDPOINT_AUTOPUSH,
];
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
const TIER_FREE = 'free-tier';
const TIER_LEGACY = 'legacy-tier';
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

type VaultCredentialItem = {
  id?: unknown;
  label?: unknown;
  provider?: unknown;
  metadata?: unknown;
};

type ProviderProfileItem = {
  id?: unknown;
  credential_id?: unknown;
};

type GeminiCliOauthPayload = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email?: string;
  project_id: string;
};

function normalizeWorkspaceId(value: unknown): string {
  const token = String(value || '').trim();
  return token || 'default';
}

function importedGeminiCredentialLabel(payload?: GeminiCliOauthPayload): string {
  const email = String(payload?.email || '').trim();
  return email ? `Google Gemini CLI (${email})` : 'Google Gemini CLI';
}

function importedGeminiCredentialMetadata(payload: GeminiCliOauthPayload): Record<string, unknown> {
  return {
    auth_mode: 'gemini_cli_oauth',
    import_source: 'gemini_cli_oauth',
    source_label: 'Gemini CLI OAuth',
    project_id: payload.project_id,
    expires_at: payload.expires_at,
    ...(payload.email ? { email: payload.email } : {}),
  };
}

function importedCredentialMarker(item: VaultCredentialItem): boolean {
  const provider = String(item.provider || '').trim().toLowerCase();
  const label = String(item.label || '').trim();
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};
  return provider === 'gemini' && (
    String(metadata.import_source || '').trim().toLowerCase() === 'gemini_cli_oauth'
    || label === importedGeminiCredentialLabel()
  );
}

function resolveEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return undefined;
}

function findInPath(name: string): string | null {
  const exts = process.platform === 'win32' ? ['.cmd', '.bat', '.exe', ''] : [''];
  for (const dir of String(process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const target = join(dir, `${name}${ext}`);
      if (existsSync(target)) return target;
    }
  }
  return null;
}

function findFile(dir: string, name: string, depth: number): string | null {
  if (depth <= 0) return null;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = join(dir, entry.name);
      if (entry.isFile() && entry.name === name) return target;
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const nested = findFile(target, name, depth - 1);
        if (nested) return nested;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function resolveGeminiCliDirs(geminiPath: string, resolvedPath: string): string[] {
  const binDir = dirname(geminiPath);
  const candidates = [
    dirname(dirname(resolvedPath)),
    join(dirname(resolvedPath), 'node_modules', '@google', 'gemini-cli'),
    join(binDir, 'node_modules', '@google', 'gemini-cli'),
    join(dirname(binDir), 'node_modules', '@google', 'gemini-cli'),
    join(dirname(binDir), 'lib', 'node_modules', '@google', 'gemini-cli'),
  ];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = process.platform === 'win32' ? candidate.replace(/\\/g, '/').toLowerCase() : candidate;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(candidate);
  }
  return deduped;
}

function extractGeminiCliCredentials(): { clientId: string; clientSecret: string } | null {
  const envClientId = resolveEnv(['OPENCLAW_GEMINI_OAUTH_CLIENT_ID', 'GEMINI_CLI_OAUTH_CLIENT_ID']);
  const envClientSecret = resolveEnv(['OPENCLAW_GEMINI_OAUTH_CLIENT_SECRET', 'GEMINI_CLI_OAUTH_CLIENT_SECRET']);
  if (envClientId) {
    return { clientId: envClientId, clientSecret: envClientSecret || '' };
  }

  try {
    const geminiPath = findInPath('gemini');
    if (!geminiPath) return null;
    const resolvedPath = realpathSync(geminiPath);
    const geminiCliDirs = resolveGeminiCliDirs(geminiPath, resolvedPath);
    let content: string | null = null;
    for (const geminiCliDir of geminiCliDirs) {
      const searchPaths = [
        join(geminiCliDir, 'node_modules', '@google', 'gemini-cli-core', 'dist', 'src', 'code_assist', 'oauth2.js'),
        join(geminiCliDir, 'node_modules', '@google', 'gemini-cli-core', 'dist', 'code_assist', 'oauth2.js'),
      ];
      for (const target of searchPaths) {
        if (existsSync(target)) {
          content = readFileSync(target, 'utf8');
          break;
        }
      }
      if (content) break;
      const fallback = findFile(geminiCliDir, 'oauth2.js', 10);
      if (fallback) {
        content = readFileSync(fallback, 'utf8');
        break;
      }
    }
    if (!content) return null;
    const idMatch = content.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
    const secretMatch = content.match(/(GOCSPX-[A-Za-z0-9_-]+)/);
    if (idMatch && secretMatch) {
      return { clientId: idMatch[1], clientSecret: secretMatch[1] };
    }
  } catch {
    return null;
  }
  return null;
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('hex');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function openExternal(target: string): Promise<void> {
  const normalized = String(target || '').trim();
  if (!normalized) throw new Error('Missing Gemini OAuth URL.');
  const execFileAsync = promisify(execFile);
  if (process.platform === 'darwin') {
    await execFileAsync('open', [normalized]);
    return;
  }
  if (process.platform === 'win32') {
    await execFileAsync('cmd', ['/C', 'start', '', normalized]);
    return;
  }
  await execFileAsync('xdg-open', [normalized]);
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildAuthUrl(challenge: string, verifier: string): string {
  const credentials = extractGeminiCliCredentials();
  if (!credentials?.clientId) {
    throw new Error('Gemini CLI is not installed. Install it first, or set GEMINI_CLI_OAUTH_CLIENT_ID.');
  }
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: verifier,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function waitForLocalCallback(expectedState: string): Promise<{ code: string; state: string }> {
  const port = 8085;
  const hostname = 'localhost';
  const expectedPath = '/oauth2callback';
  return await new Promise<{ code: string; state: string }>((resolve, reject) => {
    let timeout: NodeJS.Timeout | null = null;
    const server = createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url || '/', `http://${hostname}:${port}`);
        if (requestUrl.pathname !== expectedPath) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const error = requestUrl.searchParams.get('error');
        const code = String(requestUrl.searchParams.get('code') || '').trim();
        const state = String(requestUrl.searchParams.get('state') || '').trim();
        if (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><html><body><h2>Authentication failed</h2><p>Google OAuth returned an error.</p></body></html>');
          finish(new Error(`Gemini OAuth error: ${error}`));
          return;
        }
        if (!code || !state) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><html><body><h2>Authentication failed</h2><p>Missing code or state.</p></body></html>');
          finish(new Error('Gemini OAuth callback was missing code or state.'));
          return;
        }
        if (state !== expectedState) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><html><body><h2>Authentication failed</h2><p>Invalid OAuth state.</p></body></html>');
          finish(new Error('Gemini OAuth state mismatch.'));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body><h2>Gemini OAuth complete</h2><p>You can close this window and return to the app.</p></body></html>');
        finish(undefined, { code, state });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Gemini OAuth callback failed.'));
      }
    });

    const finish = (error?: Error, result?: { code: string; state: string }) => {
      if (timeout) clearTimeout(timeout);
      try {
        server.close();
      } catch {
        // Ignore close errors.
      }
      if (error) reject(error);
      else if (result) resolve(result);
    };

    server.once('error', (error) => {
      finish(error instanceof Error ? error : new Error('Gemini OAuth callback listener failed.'));
    });

    server.listen(port, hostname, () => {
      timeout = setTimeout(() => {
        finish(new Error('Timed out waiting for the Gemini OAuth callback.'));
      }, 300_000);
    });
  });
}

async function getUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetchWithTimeout(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return undefined;
    const data = await response.json() as { email?: string };
    return typeof data.email === 'string' ? data.email.trim() || undefined : undefined;
  } catch {
    return undefined;
  }
}

function isVpcScAffected(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;
  const details = (error as { details?: unknown[] }).details;
  if (!Array.isArray(details)) return false;
  return details.some((item) => typeof item === 'object' && item && (item as { reason?: string }).reason === 'SECURITY_POLICY_VIOLATED');
}

function getDefaultTier(allowedTiers?: Array<{ id?: string; isDefault?: boolean }>): { id?: string } | undefined {
  if (!allowedTiers?.length) return { id: TIER_LEGACY };
  return allowedTiers.find((tier) => tier.isDefault) ?? { id: TIER_LEGACY };
}

async function pollOperation(
  endpoint: string,
  operationName: string,
  headers: Record<string, string>,
): Promise<{ done?: boolean; response?: { cloudaicompanionProject?: { id?: string } } }> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await fetchWithTimeout(`${endpoint}/v1internal/${operationName}`, { headers });
    if (!response.ok) continue;
    const data = await response.json() as { done?: boolean; response?: { cloudaicompanionProject?: { id?: string } } };
    if (data.done) return data;
  }
  throw new Error('Gemini CLI OAuth operation polling timed out.');
}

async function discoverProject(accessToken: string): Promise<string> {
  const envProject = String(process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || '').trim();
  const platform = process.platform === 'win32' ? 'WINDOWS' : process.platform === 'linux' ? 'LINUX' : 'MACOS';
  const metadata = {
    ideType: 'ANTIGRAVITY',
    platform,
    pluginType: 'GEMINI',
  };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'google-api-nodejs-client/9.15.1',
    'X-Goog-Api-Client': `gl-node/${process.versions.node}`,
    'Client-Metadata': JSON.stringify(metadata),
  };
  const loadBody: Record<string, unknown> = {
    ...(envProject ? { cloudaicompanionProject: envProject } : {}),
    metadata: {
      ...metadata,
      ...(envProject ? { duetProject: envProject } : {}),
    },
  };

  let data: {
    currentTier?: { id?: string };
    cloudaicompanionProject?: string | { id?: string };
    allowedTiers?: Array<{ id?: string; isDefault?: boolean }>;
  } = {};
  let activeEndpoint = CODE_ASSIST_ENDPOINT_PROD;
  let loadError: Error | undefined;

  for (const endpoint of LOAD_CODE_ASSIST_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(`${endpoint}/v1internal:loadCodeAssist`, {
        method: 'POST',
        headers,
        body: JSON.stringify(loadBody),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        if (isVpcScAffected(errorPayload)) {
          data = { currentTier: { id: 'standard-tier' } };
          activeEndpoint = endpoint;
          loadError = undefined;
          break;
        }
        loadError = new Error(`loadCodeAssist failed: ${response.status} ${response.statusText}`);
        continue;
      }
      data = await response.json() as typeof data;
      activeEndpoint = endpoint;
      loadError = undefined;
      break;
    } catch (error) {
      loadError = error instanceof Error ? error : new Error('loadCodeAssist failed');
    }
  }

  const hasLoadCodeAssistData = Boolean(data.currentTier) || Boolean(data.cloudaicompanionProject) || Boolean(data.allowedTiers?.length);
  if (!hasLoadCodeAssistData && loadError) {
    if (envProject) return envProject;
    try {
      const project = String(execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8' }) || '').trim();
      if (project && project !== '(unset)') return project;
    } catch {
      // Ignore gcloud fallback failures.
    }
    throw loadError;
  }

  if (data.currentTier) {
    const project = data.cloudaicompanionProject;
    if (typeof project === 'string' && project) return project;
    if (project && typeof project === 'object' && typeof project.id === 'string' && project.id.trim()) return project.id.trim();
    if (envProject) return envProject;
    throw new Error('This account requires GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID to be set.');
  }

  const tier = getDefaultTier(data.allowedTiers);
  const tierId = tier?.id || TIER_FREE;
  if (tierId !== TIER_FREE && !envProject) {
    throw new Error('This account requires GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID to be set.');
  }

  const onboardBody: Record<string, unknown> = {
    tierId,
    metadata: { ...metadata },
  };
  if (tierId !== TIER_FREE && envProject) {
    onboardBody.cloudaicompanionProject = envProject;
    (onboardBody.metadata as Record<string, unknown>).duetProject = envProject;
  }

  const onboardResponse = await fetchWithTimeout(`${activeEndpoint}/v1internal:onboardUser`, {
    method: 'POST',
    headers,
    body: JSON.stringify(onboardBody),
  });
  if (!onboardResponse.ok) {
    throw new Error(`onboardUser failed: ${onboardResponse.status} ${onboardResponse.statusText}`);
  }

  let lro = await onboardResponse.json() as {
    done?: boolean;
    name?: string;
    response?: { cloudaicompanionProject?: { id?: string } };
  };
  if (!lro.done && lro.name) {
    lro = await pollOperation(activeEndpoint, lro.name, headers);
  }

  const projectId = lro.response?.cloudaicompanionProject?.id;
  if (projectId) return projectId;
  if (envProject) return envProject;

  throw new Error('Could not discover or provision a Google Cloud project. Set GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID.');
}

async function exchangeCodeForTokens(code: string, verifier: string): Promise<GeminiCliOauthPayload> {
  const credentials = extractGeminiCliCredentials();
  if (!credentials?.clientId) {
    throw new Error('Gemini CLI client credentials are unavailable.');
  }
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  if (credentials.clientSecret) {
    body.set('client_secret', credentials.clientSecret);
  }

  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: '*/*',
      'User-Agent': 'google-api-nodejs-client/9.15.1',
    },
    body,
  });
  const raw = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(raw ? `Token exchange failed: ${raw}` : `Token exchange failed with status ${response.status}.`);
  }
  const data = raw ? JSON.parse(raw) as { access_token?: string; refresh_token?: string; expires_in?: number } : {};
  const accessToken = String(data.access_token || '').trim();
  const refreshToken = String(data.refresh_token || '').trim();
  const expiresIn = Number(data.expires_in || 0);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Gemini CLI OAuth did not return a complete token set.');
  }
  const email = await getUserEmail(accessToken);
  const projectId = await discoverProject(accessToken);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + (expiresIn * 1000) - (5 * 60 * 1000),
    project_id: projectId,
    ...(email ? { email } : {}),
  };
}

async function runGeminiCliOauthFlow(): Promise<GeminiCliOauthPayload> {
  const credentials = extractGeminiCliCredentials();
  if (!credentials?.clientId) {
    throw new Error('Gemini CLI is not installed. Install it first, or set GEMINI_CLI_OAUTH_CLIENT_ID.');
  }
  const { verifier, challenge } = generatePkce();
  const authUrl = buildAuthUrl(challenge, verifier);
  const callbackPromise = waitForLocalCallback(verifier);
  await openExternal(authUrl);
  const callback = await callbackPromise;
  return await exchangeCodeForTokens(callback.code, verifier);
}

async function importGeminiCliCredential(workspaceId: string, enableRuntime: boolean, payload: GeminiCliOauthPayload) {
  const [credentialsResult, profilesResult] = await Promise.all([
    runtimeJsonRequest(`/credentials/vault?workspace_id=${encodeURIComponent(workspaceId)}`, { method: 'GET' }),
    runtimeJsonRequest(`/providers/profiles?workspace_id=${encodeURIComponent(workspaceId)}&provider=gemini`, { method: 'GET' }),
  ]);
  const credentialItems = Array.isArray((credentialsResult.payload as { items?: unknown[] } | null | undefined)?.items)
    ? ((credentialsResult.payload as { items: unknown[] }).items as VaultCredentialItem[])
    : [];
  const profileItems = Array.isArray((profilesResult.payload as { items?: unknown[] } | null | undefined)?.items)
    ? ((profilesResult.payload as { items: unknown[] }).items as ProviderProfileItem[])
    : [];

  const importedCredentialIds = credentialItems
    .filter(importedCredentialMarker)
    .map((item) => String(item.id || '').trim())
    .filter(Boolean);

  for (const profile of profileItems) {
    const credentialId = String(profile.credential_id || '').trim();
    const profileId = String(profile.id || '').trim();
    if (!profileId || !credentialId || !importedCredentialIds.includes(credentialId)) continue;
    await runtimeJsonRequest(`/providers/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
  }
  for (const credentialId of importedCredentialIds) {
    await runtimeJsonRequest(`/credentials/vault/${encodeURIComponent(credentialId)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
    });
  }

  const label = importedGeminiCredentialLabel(payload);
  const credentialCreate = await runtimeJsonRequest('/credentials/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label,
      provider: 'gemini',
      workspace_id: workspaceId,
      mode: 'byok',
      metadata: importedGeminiCredentialMetadata(payload),
      skip_validation: true,
      credentials: {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: payload.expires_at,
        project_id: payload.project_id,
        ...(payload.email ? { email: payload.email } : {}),
        auth_mode: 'gemini_cli_oauth',
      },
    }),
  });

  if (credentialCreate.status >= 400) {
    return Response.json(
      credentialCreate.payload ?? { detail: 'Failed to import the Gemini CLI OAuth session.' },
      { status: credentialCreate.status || 500 },
    );
  }

  const created = credentialCreate.payload && typeof credentialCreate.payload === 'object'
    ? credentialCreate.payload as Record<string, unknown>
    : {};
  const credentialId = String(created.id || '').trim();
  let enabledForRuntime = false;
  let attention = false;
  let message = 'Gemini CLI OAuth connected.';
  let runtimeDetail: string | null = null;

  if (enableRuntime && credentialId) {
    const validation = await runtimeJsonRequest(
      `/credentials/vault/${encodeURIComponent(credentialId)}/test?workspace_id=${encodeURIComponent(workspaceId)}`,
      { method: 'POST' },
    );
    const validationBody = validation.payload && typeof validation.payload === 'object'
      ? validation.payload as Record<string, unknown>
      : {};
    const validationOk = validation.status < 400 && validationBody.ok === true;
    if (!validationOk) {
      attention = true;
      runtimeDetail = String(
        validationBody.message
        || validationBody.detail
        || 'The Gemini CLI OAuth session was saved, but it is not ready for runtime use yet.',
      ).trim() || 'The Gemini CLI OAuth session was saved, but it is not ready for runtime use yet.';
      message = 'Gemini CLI OAuth connected, but it needs attention before runtime can use it.';
    } else {
      const profileCreate = await runtimeJsonRequest('/providers/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          label,
          credential_id: credentialId,
          auth_mode: 'gemini_cli_oauth',
          workspace_id: workspaceId,
          priority: 100,
          enabled: true,
          model: 'gemini-2.0-flash',
        }),
      });
      if (profileCreate.status >= 400) {
        attention = true;
        runtimeDetail = String(
          (profileCreate.payload as { detail?: unknown; message?: unknown } | null | undefined)?.detail
          || (profileCreate.payload as { detail?: unknown; message?: unknown } | null | undefined)?.message
          || 'Imported Gemini CLI OAuth, but failed to enable it for runtime.',
        ).trim() || 'Imported Gemini CLI OAuth, but failed to enable it for runtime.';
        message = 'Gemini CLI OAuth connected, but runtime could not enable it yet.';
      } else {
        enabledForRuntime = true;
      }
    }
  }

  return Response.json({
    ok: true,
    label,
    provider: 'gemini',
    credential_id: credentialId,
    imported_from: 'gemini_cli_oauth',
    enabled_for_runtime: enabledForRuntime,
    attention,
    runtime_detail: runtimeDetail,
    models_preview: Array.isArray(created.models_preview) ? created.models_preview : [],
    message,
  });
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const body = await request.json().catch(() => ({}));
  const workspaceId = normalizeWorkspaceId(body?.workspace_id);
  const enableRuntime = body?.enable_runtime !== false;

  try {
    if (!findInPath('gemini')) {
      return Response.json(
        { detail: 'Gemini CLI is not installed on this machine.' },
        { status: 400 },
      );
    }
    const payload = await runGeminiCliOauthFlow();
    return await importGeminiCliCredential(workspaceId, enableRuntime, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to complete Gemini CLI OAuth.';
    return Response.json({ detail: message }, { status: 400 });
  }
}
