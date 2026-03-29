import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

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

function normalizeWorkspaceId(value: unknown): string {
  const token = String(value || '').trim();
  return token || 'default';
}

function importedAnthropicCredentialLabel(): string {
  return 'Claude on this Mac';
}

function importedAnthropicCredentialMetadata(status: Record<string, unknown>): Record<string, unknown> {
  const authMethod = String(status.authMethod || '').trim();
  const apiProvider = String(status.apiProvider || '').trim();
  return {
    auth_mode: 'local_cli',
    import_source: 'claude_local_cli',
    source_label: 'Claude CLI',
    ...(authMethod ? { auth_method: authMethod } : {}),
    ...(apiProvider ? { api_provider: apiProvider } : {}),
  };
}

function importedCredentialMarker(item: VaultCredentialItem): boolean {
  const provider = String(item.provider || '').trim().toLowerCase();
  const label = String(item.label || '').trim();
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};
  return provider === 'anthropic' && (
    String(metadata.import_source || '').trim().toLowerCase() === 'claude_local_cli'
    || label === importedAnthropicCredentialLabel()
  );
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const body = await request.json().catch(() => ({}));
  const workspaceId = normalizeWorkspaceId(body?.workspace_id);
  const enableRuntime = body?.enable_runtime !== false;

  const statusResult = await runtimeJsonRequest('/providers/anthropic/local-cli/status', { method: 'GET' });
  const statusBody = statusResult.payload && typeof statusResult.payload === 'object'
    ? statusResult.payload as Record<string, unknown>
    : {};
  const available = statusResult.status < 400 && statusBody.available === true;
  const loggedIn = available && statusBody.loggedIn === true;

  if (!available) {
    return Response.json(
      { detail: String(statusBody.message || 'Claude CLI is not installed on this machine.') },
      { status: 400 },
    );
  }
  if (!loggedIn) {
    return Response.json(
      { detail: String(statusBody.message || 'Claude subscription is not signed in on this machine yet.') },
      { status: 400 },
    );
  }

  const [credentialsResult, profilesResult] = await Promise.all([
    runtimeJsonRequest(`/credentials/vault?workspace_id=${encodeURIComponent(workspaceId)}`, { method: 'GET' }),
    runtimeJsonRequest(`/providers/profiles?workspace_id=${encodeURIComponent(workspaceId)}&provider=anthropic`, { method: 'GET' }),
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

  const credentialCreate = await runtimeJsonRequest('/credentials/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: importedAnthropicCredentialLabel(),
      provider: 'anthropic',
      workspace_id: workspaceId,
      mode: 'byok',
      metadata: importedAnthropicCredentialMetadata(statusBody),
      skip_validation: true,
      credentials: {
        auth_mode: 'local_cli',
      },
    }),
  });

  if (credentialCreate.status >= 400) {
    return Response.json(
      credentialCreate.payload ?? { detail: 'Failed to import the local Claude session.' },
      { status: credentialCreate.status || 500 },
    );
  }

  const created = credentialCreate.payload && typeof credentialCreate.payload === 'object'
    ? credentialCreate.payload as Record<string, unknown>
    : {};
  const credentialId = String(created.id || '').trim();
  let enabledForRuntime = false;
  let attention = false;
  let message = 'Claude local session imported from this Mac.';
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
        || 'The local Claude session was saved, but it is not ready for runtime use yet.',
      ).trim() || 'The local Claude session was saved, but it is not ready for runtime use yet.';
      message = 'Claude local session imported, but it needs attention before runtime can use it.';
    } else {
      const profileCreate = await runtimeJsonRequest('/providers/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'anthropic',
          label: importedAnthropicCredentialLabel(),
          credential_id: credentialId,
          auth_mode: 'local_cli',
          workspace_id: workspaceId,
          priority: 100,
          enabled: true,
          model: 'claude-3-5-sonnet-20241022',
        }),
      });
      if (profileCreate.status >= 400) {
        attention = true;
        runtimeDetail = String(
          (profileCreate.payload as { detail?: unknown; message?: unknown } | null | undefined)?.detail
          || (profileCreate.payload as { detail?: unknown; message?: unknown } | null | undefined)?.message
          || 'Imported the local Claude session, but failed to enable it for runtime.',
        ).trim() || 'Imported the local Claude session, but failed to enable it for runtime.';
        message = 'Claude local session imported, but runtime could not enable it yet.';
      } else {
        enabledForRuntime = true;
      }
    }
  }

  return Response.json({
    ok: true,
    label: importedAnthropicCredentialLabel(),
    provider: 'anthropic',
    credential_id: credentialId,
    imported_from: 'claude_local_cli',
    enabled_for_runtime: enabledForRuntime,
    attention,
    runtime_detail: runtimeDetail,
    models_preview: Array.isArray(created.models_preview) ? created.models_preview : [],
    message,
  });
}
