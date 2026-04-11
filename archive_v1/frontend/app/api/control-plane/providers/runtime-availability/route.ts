import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  requireControlPlaneSession,
  requireControlPlaneWorkspaceAccess,
  resolveRuntimeWorkspaceId,
} from '@/lib/server/controlPlaneSession';
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
  state: 'active' | 'configured' | 'setup_required' | 'unavailable' | 'degraded';
  source: string;
  source_label: string;
  detail: string;
  profile_count: number;
  connection_kind: 'workspace_provider_connection' | 'machine_local_capability' | 'runtime_environment';
  connection_scope: 'workspace' | 'machine' | 'runtime';
  connection_label: string;
  identity_owner: 'platform_account';
  identity_owner_label: string;
  identity_boundary_note: string;
};

function normalizeProvider(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

function connectionLabelFromKind(kind: string, fallback?: string): RuntimeAvailabilityItem['connection_label'] {
  if (kind === 'machine_local_capability') return 'This machine only';
  if (kind === 'runtime_environment') return 'Runtime environment';
  if (fallback === 'This machine only' || fallback === 'Runtime environment') return fallback;
  return 'Workspace provider';
}

function sourceLabelForItem(item: Record<string, unknown>): string {
  const connectionLabel = connectionLabelFromKind(
    String(item.connection_kind || '').trim(),
    typeof item.connection_label === 'string' ? item.connection_label : undefined,
  );
  const source = String(item.active_source || '').trim().toLowerCase();
  if (connectionLabel === 'This machine only') {
    if (source.includes('claude')) return 'Claude CLI session on this machine';
    if (source.includes('gemini')) return 'Gemini CLI session on this machine';
    if (source.includes('ollama')) return 'Local Ollama service on this machine';
    if (source.includes('codex')) return 'Codex session on this machine';
    return 'Machine-local capability';
  }
  if (connectionLabel === 'Runtime environment') {
    return 'Runtime environment credential';
  }
  return 'Workspace provider connection';
}

function normalizeProviderState(raw: unknown): RuntimeAvailabilityItem['state'] {
  const state = String(raw || '').trim().toLowerCase();
  if (
    state === 'active'
    || state === 'configured'
    || state === 'setup_required'
    || state === 'unavailable'
    || state === 'degraded'
  ) {
    return state;
  }
  return 'setup_required';
}

function buildProviderItem(rawItem: Record<string, unknown>): RuntimeAvailabilityItem | null {
  const provider = normalizeProvider(rawItem.id);
  if (!provider) return null;
  const state = normalizeProviderState(rawItem.state);
  const connectionKind = String(rawItem.connection_kind || '').trim() === 'machine_local_capability'
    ? 'machine_local_capability'
    : String(rawItem.connection_kind || '').trim() === 'runtime_environment'
      ? 'runtime_environment'
      : 'workspace_provider_connection';
  const connectionScope = String(rawItem.connection_scope || '').trim() === 'machine'
    ? 'machine'
    : String(rawItem.connection_scope || '').trim() === 'runtime'
      ? 'runtime'
      : 'workspace';

  return {
    provider,
    label: typeof rawItem.label === 'string' && rawItem.label.trim() ? rawItem.label.trim() : PROVIDER_LABELS[provider] || provider,
    ready: state === 'active',
    status: state === 'active' ? 'ready' : 'attention',
    state,
    source: typeof rawItem.active_source === 'string' ? rawItem.active_source : '',
    source_label: sourceLabelForItem(rawItem),
    detail: typeof rawItem.state_detail === 'string' && rawItem.state_detail.trim()
      ? rawItem.state_detail.trim()
      : typeof rawItem.issue === 'string' && rawItem.issue.trim()
        ? rawItem.issue.trim()
        : 'Provider capability truth is available from the runtime.',
    profile_count: typeof rawItem.profile_count === 'number' ? rawItem.profile_count : 0,
    connection_kind: connectionKind,
    connection_scope: connectionScope,
    connection_label: connectionLabelFromKind(connectionKind, typeof rawItem.connection_label === 'string' ? rawItem.connection_label : undefined),
    identity_owner: 'platform_account',
    identity_owner_label: typeof rawItem.identity_owner_label === 'string' && rawItem.identity_owner_label.trim()
      ? rawItem.identity_owner_label.trim()
      : 'Empyralis account',
    identity_boundary_note: typeof rawItem.identity_boundary_note === 'string' && rawItem.identity_boundary_note.trim()
      ? rawItem.identity_boundary_note.trim()
      : 'Platform sign-in stays separate from provider capabilities and machine-local sessions.',
  };
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  if (workspaceId) {
    const workspaceFailure = await requireControlPlaneWorkspaceAccess(request, workspaceId, 'viewer');
    if (workspaceFailure) return workspaceFailure;
    search.set('workspace_id', await resolveRuntimeWorkspaceId(request, workspaceId));
  }
  const suffix = search.toString() ? `?${search.toString()}` : '';

  try {
    const profilesResult = await runtimeJsonRequest(`/providers/profiles/health${suffix}`, { method: 'GET' });

    const profilePayload = profilesResult.payload && typeof profilesResult.payload === 'object'
      ? (profilesResult.payload as Record<string, unknown>)
      : {};
    const providerItems = Array.isArray(profilePayload.providers) ? profilePayload.providers : [];
    const items: RuntimeAvailabilityItem[] = providerItems
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => buildProviderItem(item))
      .filter((item): item is RuntimeAvailabilityItem => item !== null)
      .filter((item) => ['openai', 'anthropic', 'gemini', 'vertex'].includes(item.provider));

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
