import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  vertex: 'Google Vertex AI',
};

type RuntimeAvailabilityItem = {
  provider: string;
  label: string;
  ready: boolean;
  status: 'ready' | 'attention';
  source: string;
  source_label: string;
  detail: string;
  profile_count: number;
};

function normalizeProvider(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

function openAiSourceLabel(source: string): string {
  switch (source) {
    case 'env_api_key':
      return 'OpenAI API key in runtime environment';
    case 'env_access_token':
      return 'OpenAI access token in runtime environment';
    case 'env_oauth_token':
      return 'OpenAI OAuth token in runtime environment';
    case 'env_codex_oauth_token':
      return 'OpenAI / Codex token in runtime environment';
    case 'codex_token_vault':
      return 'Saved OpenAI / Codex token on this machine';
    case 'vault':
      return 'Saved OpenAI credential in the workspace vault';
    default:
      return 'OpenAI credential available to the runtime';
  }
}

function openAiReadyDetail(source: string): string {
  switch (source) {
    case 'env_api_key':
      return 'The workspace runtime can already use an OpenAI API key from its environment.';
    case 'env_access_token':
      return 'The workspace runtime can already use an OpenAI access token from its environment.';
    case 'env_oauth_token':
      return 'The workspace runtime can already use an OpenAI OAuth token from its environment.';
    case 'env_codex_oauth_token':
      return 'The workspace runtime can already use an OpenAI / Codex token from its environment.';
    case 'codex_token_vault':
      return 'The workspace runtime can already use a saved OpenAI / Codex token on this machine.';
    case 'vault':
      return 'The workspace runtime can already use a saved OpenAI credential from the workspace vault.';
    default:
      return 'The workspace runtime can already use an OpenAI credential available on this machine.';
  }
}

function buildProfileItem(provider: string, profileCount: number): RuntimeAvailabilityItem {
  return {
    provider,
    label: PROVIDER_LABELS[provider] || provider,
    ready: true,
    status: 'ready',
    source: 'runtime_profile',
    source_label: 'Workspace runtime profile',
    detail: profileCount > 1
      ? `${profileCount} runtime profiles are already enabled for this workspace.`
      : 'A runtime profile is already enabled for this workspace.',
    profile_count: profileCount,
  };
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  if (workspaceId) search.set('workspace_id', workspaceId);
  const suffix = search.toString() ? `?${search.toString()}` : '';

  try {
    const [profilesResult, healthResult, claudeResult] = await Promise.all([
      runtimeJsonRequest(`/providers/profiles/health${suffix}`, { method: 'GET' }),
      runtimeJsonRequest('/health', { method: 'GET' }),
      runtimeJsonRequest('/providers/anthropic/local-cli/status', { method: 'GET' }),
    ]);

    const profilePayload = profilesResult.payload && typeof profilesResult.payload === 'object'
      ? (profilesResult.payload as Record<string, unknown>)
      : {};
    const profileItems = Array.isArray(profilePayload.items) ? profilePayload.items : [];
    const profileCounts = new Map<string, number>();

    for (const rawItem of profileItems) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const item = rawItem as Record<string, unknown>;
      const provider = normalizeProvider(item.provider);
      if (!provider) continue;
      const enabled = item.enabled !== false;
      const health = String(item.health || '').trim().toLowerCase();
      if (!enabled || health === 'disabled') continue;
      profileCounts.set(provider, (profileCounts.get(provider) || 0) + 1);
    }

    const items: RuntimeAvailabilityItem[] = Array.from(profileCounts.entries()).map(([provider, count]) =>
      buildProfileItem(provider, count),
    );
    const byProvider = new Map(items.map((item) => [item.provider, item]));

    const healthPayload = healthResult.payload && typeof healthResult.payload === 'object'
      ? (healthResult.payload as Record<string, unknown>)
      : {};
    const openAiReady = Boolean(healthPayload.openai_key_valid);
    const openAiDetected = Boolean(healthPayload.openai_key_present) || Boolean(healthPayload.openai_vault_present);
    if (!byProvider.has('openai') && (openAiReady || openAiDetected)) {
      const source = String(healthPayload.openai_credential_source || '').trim().toLowerCase();
      items.push({
        provider: 'openai',
        label: PROVIDER_LABELS.openai,
        ready: openAiReady,
        status: openAiReady ? 'ready' : 'attention',
        source: source || 'runtime_openai',
        source_label: openAiSourceLabel(source),
        detail: openAiReady
          ? openAiReadyDetail(source)
          : 'An OpenAI credential was detected for the runtime, but validation did not pass.',
        profile_count: 0,
      });
    }

    const claudePayload = claudeResult.payload && typeof claudeResult.payload === 'object'
      ? (claudeResult.payload as Record<string, unknown>)
      : {};
    const claudeLoggedIn = Boolean(claudePayload.loggedIn);
    if (!byProvider.has('anthropic') && claudeLoggedIn) {
      items.push({
        provider: 'anthropic',
        label: PROVIDER_LABELS.anthropic,
        ready: true,
        status: 'ready',
        source: 'local_cli',
        source_label: 'Claude subscription on this machine',
        detail: 'The workspace runtime can already use the Claude subscription signed into the local Claude CLI on this machine.',
        profile_count: 0,
      });
    }

    const sortOrder = ['openai', 'anthropic', 'gemini', 'vertex'];
    items.sort((left, right) => {
      const leftIndex = sortOrder.indexOf(left.provider);
      const rightIndex = sortOrder.indexOf(right.provider);
      const normalizedLeftIndex = leftIndex === -1 ? sortOrder.length : leftIndex;
      const normalizedRightIndex = rightIndex === -1 ? sortOrder.length : rightIndex;
      if (normalizedLeftIndex !== normalizedRightIndex) return normalizedLeftIndex - normalizedRightIndex;
      return left.label.localeCompare(right.label);
    });

    return Response.json({
      items,
      summary: {
        ready: items.filter((item) => item.ready).length,
        attention: items.filter((item) => !item.ready).length,
        total: items.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime availability check failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
