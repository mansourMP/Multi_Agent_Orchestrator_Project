'use client';

import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

const WORKSPACE_ID = 'default';
const SETUP_ROUTE = '/setup';
const DEFAULT_RETURN_TO = '/home';

type SetupStep = 'integrations' | 'finish';

export type SetupReadiness = {
  hasAiModel: boolean;
  hasIntegration: boolean;
  connectorCount: number;
  activeProfileLabel: string | null;
  complete: boolean;
};

function normalizeReturnTo(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) return DEFAULT_RETURN_TO;
  return trimmed;
}

export function buildSetupRoute(returnTo: string, step?: SetupStep): string {
  const params = new URLSearchParams();
  const normalizedReturnTo = normalizeReturnTo(returnTo);
  if (normalizedReturnTo) params.set('returnTo', normalizedReturnTo);
  if (step) params.set('step', step);
  const query = params.toString();
  return query ? `${SETUP_ROUTE}?${query}` : SETUP_ROUTE;
}

function parseActiveProfile(payload: unknown): { hasAiModel: boolean; activeProfileLabel: string | null } {
  const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
    ? ((payload as { items: unknown[] }).items)
    : [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.enabled === false) continue;
    const id = String(record.id || '').trim();
    if (!id) continue;
    const label = String(record.label || '').trim();
    return {
      hasAiModel: true,
      activeProfileLabel: label || null,
    };
  }

  return {
    hasAiModel: false,
    activeProfileLabel: null,
  };
}

function parseConnectorCount(payload: unknown): number {
  const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
    ? ((payload as { items: unknown[] }).items)
    : [];

  return items.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return Boolean(String(record.id || '').trim() && String(record.connector || '').trim());
  }).length;
}

export function buildPostSignInSetupHref(returnTo = DEFAULT_RETURN_TO): string {
  return buildSetupRoute(returnTo);
}

export function buildSetupConnectAiHref(returnTo = DEFAULT_RETURN_TO): string {
  return `/connect-ai?returnTo=${encodeURIComponent(buildSetupRoute(returnTo, 'integrations'))}`;
}

export function buildSetupConnectorsHref(returnTo = DEFAULT_RETURN_TO): string {
  return `/connectors?onboarding=1&return_to=${encodeURIComponent(buildSetupRoute(returnTo, 'finish'))}`;
}

export function buildSetupCompleteHomeHref(): string {
  return '/home?setup=complete';
}

export async function fetchSetupReadiness(): Promise<SetupReadiness> {
  await ensureControlPlaneSession();

  const [profilesResponse, connectorsResponse] = await Promise.all([
    fetch(`/api/control-plane/providers/profiles/health?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    }),
    fetch(`/api/control-plane/connectors?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    }),
  ]);

  const profilesPayload = await profilesResponse.json().catch(() => null);
  const connectorsPayload = await connectorsResponse.json().catch(() => null);

  if (!profilesResponse.ok) {
    throw new Error(
      String(
        (profilesPayload as { detail?: string; message?: string } | null)?.detail
        || (profilesPayload as { detail?: string; message?: string } | null)?.message
        || 'Failed to load AI model readiness.',
      ),
    );
  }

  if (!connectorsResponse.ok) {
    throw new Error(
      String(
        (connectorsPayload as { detail?: string; message?: string } | null)?.detail
        || (connectorsPayload as { detail?: string; message?: string } | null)?.message
        || 'Failed to load integration readiness.',
      ),
    );
  }

  const profileState = parseActiveProfile(profilesPayload);
  const connectorCount = parseConnectorCount(connectorsPayload);
  const hasIntegration = connectorCount > 0;

  return {
    hasAiModel: profileState.hasAiModel,
    activeProfileLabel: profileState.activeProfileLabel,
    connectorCount,
    hasIntegration,
    complete: profileState.hasAiModel && hasIntegration,
  };
}
