import { execFile } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { createServer } from 'http';
import { promisify } from 'util';
import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';
import {
  importedOpenAiCredentialLabel,
  importedOpenAiCredentialMetadata,
  readOpenAiLocalAuth,
  sanitizeToken,
} from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_CODEX_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const OPENAI_CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_CODEX_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const OPENAI_CODEX_SCOPE = 'openid profile email offline_access';
const OPENAI_CODEX_CALLBACK_TIMEOUT_MS = 180_000;
const OPENAI_CODEX_AUTH_CLAIM = 'https://api.openai.com/auth';
const OPENAI_CODEX_PROFILE_CLAIM = 'https://api.openai.com/profile';

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

type OpenAiCodexOauthPayload = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account_id: string;
  email?: string | null;
  profile_name?: string | null;
};

function normalizeWorkspaceId(value: unknown): string {
  const token = String(value || '').trim();
  return token || 'default';
}

function importedCredentialMarker(item: VaultCredentialItem): boolean {
  const provider = String(item.provider || '').trim().toLowerCase();
  const label = String(item.label || '').trim();
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};
  const importSource = String(metadata.import_source || '').trim().toLowerCase();
  return (provider === 'openai' || provider === 'openai-codex') && (
    importSource === 'codex_auth_file'
    || importSource === 'openai_codex_oauth'
    || label === importedOpenAiCredentialLabel()
  );
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64url');
}

function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function openAiCodexAccountId(accessToken: string): string {
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.[OPENAI_CODEX_AUTH_CLAIM];
  if (!auth || typeof auth !== 'object') return '';
  return String((auth as Record<string, unknown>).chatgpt_account_id || '').trim();
}

function openAiCodexEmail(accessToken: string): string {
  const payload = decodeJwtPayload(accessToken);
  const profile = payload?.[OPENAI_CODEX_PROFILE_CLAIM];
  if (!profile || typeof profile !== 'object') return '';
  return String((profile as Record<string, unknown>).email || '').trim();
}

function openAiCodexProfileName(accessToken: string, fallbackEmail?: string | null): string {
  const email = String(fallbackEmail || '').trim();
  if (email) return email;
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.[OPENAI_CODEX_AUTH_CLAIM];
  const authRecord = auth && typeof auth === 'object' ? auth as Record<string, unknown> : {};
  const subject = String(
    authRecord.chatgpt_account_user_id
    || authRecord.chatgpt_user_id
    || authRecord.user_id
    || payload?.sub
    || '',
  ).trim();
  if (!subject) return '';
  return `id-${base64UrlEncode(Buffer.from(subject, 'utf8'))}`;
}

function importedOauthMetadata(payload: OpenAiCodexOauthPayload): Record<string, unknown> {
  return {
    auth_mode: 'oauth_token',
    import_source: 'openai_codex_oauth',
    source_label: 'OpenAI browser OAuth',
    account_id: payload.account_id,
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.profile_name ? { profile_name: payload.profile_name } : {}),
    expires_at: payload.expires_at,
  };
}

function importedOauthLabel(payload: OpenAiCodexOauthPayload): string {
  const email = String(payload.email || '').trim();
  return email ? `OpenAI / Codex (${email})` : 'OpenAI / Codex';
}

async function openExternal(target: string): Promise<void> {
  const normalized = String(target || '').trim();
  if (!normalized) {
    throw new Error('Missing OpenAI OAuth URL.');
  }
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

async function waitForLocalCallback(expectedState: string): Promise<{ code: string; state: string }> {
  const port = 1455;
  const hostname = '127.0.0.1';
  const expectedPath = '/auth/callback';

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
          res.end('<!doctype html><html><body><h2>Authentication failed</h2><p>OpenAI OAuth returned an error.</p></body></html>');
          finish(new Error(`OpenAI OAuth error: ${error}`));
          return;
        }
        if (!code || !state) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><html><body><h2>Authentication failed</h2><p>Missing code or state.</p></body></html>');
          finish(new Error('OpenAI OAuth callback was missing code or state.'));
          return;
        }
        if (state !== expectedState) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><html><body><h2>Authentication failed</h2><p>Invalid OAuth state.</p></body></html>');
          finish(new Error('OpenAI OAuth state mismatch.'));
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body><h2>Authentication successful</h2><p>OpenAI sign-in completed. You can close this window and return to the app.</p></body></html>');
        finish(undefined, { code, state });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('OpenAI OAuth callback failed.'));
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
      finish(error instanceof Error ? error : new Error('OpenAI OAuth callback listener failed.'));
    });

    server.listen(port, hostname, () => {
      timeout = setTimeout(() => {
        finish(new Error('Timed out waiting for the OpenAI OAuth callback.'));
      }, OPENAI_CODEX_CALLBACK_TIMEOUT_MS);
    });
  });
}

async function exchangeOpenAiCodexCode(code: string, verifier: string): Promise<OpenAiCodexOauthPayload> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OPENAI_CODEX_CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: OPENAI_CODEX_REDIRECT_URI,
  });

  const response = await fetch(OPENAI_CODEX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });
  const raw = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(raw.trim() ? `OpenAI token exchange failed: ${raw.trim()}` : `OpenAI token exchange failed with status ${response.status}.`);
  }
  const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  const accessToken = sanitizeToken(parsed.access_token);
  const refreshToken = sanitizeToken(parsed.refresh_token);
  const expiresIn = Number(parsed.expires_in || 0);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('OpenAI token exchange did not return a complete OAuth session.');
  }
  const accountId = openAiCodexAccountId(accessToken);
  if (!accountId) {
    throw new Error('Failed to extract ChatGPT account id from the OAuth token.');
  }
  const email = openAiCodexEmail(accessToken);
  const profileName = openAiCodexProfileName(accessToken, email);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + (expiresIn * 1000),
    account_id: accountId,
    email: email || null,
    profile_name: profileName || null,
  };
}

async function runOpenAiBrowserOauthFlow(): Promise<OpenAiCodexOauthPayload> {
  const { verifier, challenge } = generatePkcePair();
  const state = base64UrlEncode(randomBytes(16));
  const authorizeUrl = new URL(OPENAI_CODEX_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', OPENAI_CODEX_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', OPENAI_CODEX_REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', OPENAI_CODEX_SCOPE);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('id_token_add_organizations', 'true');
  authorizeUrl.searchParams.set('codex_cli_simplified_flow', 'true');
  authorizeUrl.searchParams.set('originator', 'empyralis');

  const callbackPromise = waitForLocalCallback(state);
  await openExternal(authorizeUrl.toString());
  const callback = await callbackPromise;
  return await exchangeOpenAiCodexCode(callback.code, verifier);
}

async function importOpenAiCodexCredential(
  workspaceId: string,
  enableRuntime: boolean,
  payload: OpenAiCodexOauthPayload,
  importSource: 'codex_auth_file' | 'openai_codex_oauth',
) {
  const [credentialsResult, profilesResult] = await Promise.all([
    runtimeJsonRequest(`/credentials/vault?workspace_id=${encodeURIComponent(workspaceId)}`, { method: 'GET' }),
    runtimeJsonRequest(`/providers/profiles?workspace_id=${encodeURIComponent(workspaceId)}`, { method: 'GET' }),
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

  const metadata = importSource === 'codex_auth_file'
    ? {
        ...importedOpenAiCredentialMetadata(),
        account_id: payload.account_id,
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.profile_name ? { profile_name: payload.profile_name } : {}),
        expires_at: payload.expires_at,
      }
    : importedOauthMetadata(payload);
  const label = importSource === 'codex_auth_file' ? importedOpenAiCredentialLabel() : importedOauthLabel(payload);

  const credentialCreate = await runtimeJsonRequest('/credentials/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label,
      provider: 'openai-codex',
      workspace_id: workspaceId,
      mode: 'byok',
      metadata,
      skip_validation: true,
      credentials: {
        oauth_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: payload.expires_at,
        account_id: payload.account_id,
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.profile_name ? { profile_name: payload.profile_name } : {}),
        auth_mode: 'oauth_token',
      },
    }),
  });

  if (credentialCreate.status >= 400) {
    return Response.json(
      credentialCreate.payload ?? { detail: 'Failed to import the OpenAI / Codex OAuth session.' },
      { status: credentialCreate.status || 500 },
    );
  }

  const created = credentialCreate.payload && typeof credentialCreate.payload === 'object'
    ? credentialCreate.payload as Record<string, unknown>
    : {};
  const credentialId = String(created.id || '').trim();
  let enabledForRuntime = false;
  let attention = false;
  let message = importSource === 'openai_codex_oauth'
    ? 'OpenAI / Codex browser OAuth connected.'
    : 'OpenAI / Codex local session imported from this Mac.';
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
        || 'The OpenAI / Codex session was saved, but it is not ready for runtime use yet.',
      ).trim() || 'The OpenAI / Codex session was saved, but it is not ready for runtime use yet.';
      message = importSource === 'openai_codex_oauth'
        ? 'OpenAI / Codex browser OAuth connected, but it needs attention before runtime can use it.'
        : 'OpenAI / Codex local session imported, but it needs attention before runtime can use it.';
    } else {
      const profileCreate = await runtimeJsonRequest('/providers/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai-codex',
          label,
          credential_id: credentialId,
          auth_mode: 'oauth_token',
          workspace_id: workspaceId,
          priority: 100,
          enabled: true,
          model: 'gpt-5.4',
        }),
      });
      if (profileCreate.status >= 400) {
        attention = true;
        runtimeDetail = String(
          (profileCreate.payload as { detail?: unknown; message?: unknown } | null | undefined)?.detail
          || (profileCreate.payload as { detail?: unknown; message?: unknown } | null | undefined)?.message
          || 'Imported the OpenAI / Codex session, but failed to enable it for runtime.',
        ).trim() || 'Imported the OpenAI / Codex session, but failed to enable it for runtime.';
        message = importSource === 'openai_codex_oauth'
          ? 'OpenAI / Codex browser OAuth connected, but runtime could not enable it yet.'
          : 'OpenAI / Codex local session imported, but runtime could not enable it yet.';
      } else {
        enabledForRuntime = true;
      }
    }
  }

  return Response.json({
    ok: true,
    label,
    provider: 'openai-codex',
    credential_id: credentialId,
    imported_from: importSource,
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
  const authFlow = String(body?.auth_flow || '').trim().toLowerCase();

  try {
    if (authFlow === 'browser_oauth') {
      const accessToken = sanitizeToken(body?.access_token);
      const refreshToken = sanitizeToken(body?.refresh_token);
      const expiresAt = Number(body?.expires_at || 0);
      const accountId = String(body?.account_id || '').trim();
      const email = String(body?.email || '').trim();
      const profileName = String(body?.profile_name || '').trim();

      const payload = accessToken && refreshToken && Number.isFinite(expiresAt) && expiresAt > 0 && accountId
        ? {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            account_id: accountId,
            email: email || null,
            profile_name: profileName || null,
          } satisfies OpenAiCodexOauthPayload
        : await runOpenAiBrowserOauthFlow();

      return await importOpenAiCodexCredential(workspaceId, enableRuntime, payload, 'openai_codex_oauth');
    }

    const snapshot = await readOpenAiLocalAuth();
    if (!snapshot?.accessToken) {
      return Response.json(
        { detail: 'No local OpenAI / Codex session was found on this machine.' },
        { status: 400 },
      );
    }

    const email = openAiCodexEmail(snapshot.accessToken);
    const payload: OpenAiCodexOauthPayload = {
      access_token: snapshot.accessToken,
      refresh_token: '',
      expires_at: 0,
      account_id: openAiCodexAccountId(snapshot.accessToken),
      email: email || null,
      profile_name: openAiCodexProfileName(snapshot.accessToken, email),
    };
    if (!payload.account_id) {
      return Response.json(
        { detail: 'The local OpenAI / Codex session did not include a ChatGPT account id.' },
        { status: 400 },
      );
    }

    return await importOpenAiCodexCredential(workspaceId, enableRuntime, payload, 'codex_auth_file');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import the OpenAI / Codex session.';
    return Response.json({ detail: message }, { status: 400 });
  }
}
