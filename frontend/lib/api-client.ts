import { openAuthenticatedEventStream } from '@/lib/authenticatedEventStream';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { ApiClientError, createApiClient } from '@shared/api-contract/client';

function normalizedPath(path: string): string {
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function buildRequestUrl(path: string): string {
  const normalized = normalizedPath(path);
  return normalized.startsWith('/api/') ? normalized : `/api${normalized}`;
}

function optionalSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  const candidates = [
    'empyralis.sessionToken',
    'orion.sessionToken',
    'orion.controlPlaneToken',
  ];
  for (const key of candidates) {
    try {
      const value = window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
      if (value && value.trim()) return value.trim();
    } catch {
      // Ignore storage access failures and rely on same-origin cookies.
    }
  }
  return null;
}

async function getAuthHeaders(): Promise<HeadersInit | undefined> {
  const headers = new Headers();
  const sessionToken = optionalSessionToken();
  if (sessionToken) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }
  return headers;
}

export { ApiClientError };

export const apiClient = createApiClient({
  beforeRequest: ensureControlPlaneSession,
  getHeaders: getAuthHeaders,
  buildUrl: buildRequestUrl,
  openEventStream: ({ url, onOpen, onEvent, onError, onClose }) => openAuthenticatedEventStream({
    url,
    onOpen,
    onEvent,
    onError,
    onClose,
  }),
});
