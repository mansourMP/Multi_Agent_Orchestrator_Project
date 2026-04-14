import { buildCookieAuthHeaders } from '@/lib/auth/csrf';

type AuthRequestOptions = {
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
};

function channelAttributionToken(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const token = new URLSearchParams(window.location.search).get('channel_attribution');
  const normalized = String(token || '').trim();
  return normalized || undefined;
}

async function parseJson(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  return response.json();
}

async function requestAuth<T>(path: string, options: AuthRequestOptions): Promise<T> {
  const response = await fetch(path, {
    method: options.method,
    credentials: 'include',
    headers: buildCookieAuthHeaders(options.method, {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    }),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? String((payload as Record<string, unknown>).detail || '').trim()
        : '';
    throw new Error(detail || `Auth request failed with status ${response.status}.`);
  }
  return payload as T;
}

export async function login(email: string, password: string): Promise<Record<string, unknown> | null> {
  return requestAuth<Record<string, unknown> | null>('/api/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      channel: 'web',
      acquisition_token: channelAttributionToken(),
    },
  });
}

export async function signup(
  email: string,
  password: string,
  name?: string,
): Promise<Record<string, unknown> | null> {
  return requestAuth<Record<string, unknown> | null>('/api/auth/signup', {
    method: 'POST',
    body: {
      email,
      password,
      name,
      channel: 'web',
      acquisition_token: channelAttributionToken(),
    },
  });
}

export async function logout(): Promise<Record<string, unknown> | null> {
  return requestAuth<Record<string, unknown> | null>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function me(): Promise<Record<string, unknown> | null> {
  return requestAuth<Record<string, unknown> | null>('/api/auth/me', {
    method: 'GET',
  });
}

export async function refresh(): Promise<Record<string, unknown> | null> {
  return requestAuth<Record<string, unknown> | null>('/api/auth/refresh', {
    method: 'POST',
    body: { channel: 'web' },
  });
}
