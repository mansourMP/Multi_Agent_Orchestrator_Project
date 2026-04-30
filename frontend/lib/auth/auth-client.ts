import { buildCookieAuthHeaders } from '@/lib/auth/csrf';
import { AUTH_REQUEST_TIMEOUT_MS, AUTH_TIMEOUT_MESSAGE } from '@/lib/auth/auth-timeouts';

type AuthRequestOptions = {
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
};

type AwaitBrowserAuthReadyOptions = {
  path?: string;
  attempts?: number;
  delayMs?: number;
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
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => {
    controller.abort();
  }, AUTH_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method,
      credentials: 'include',
      signal: controller.signal,
      headers: buildCookieAuthHeaders(options.method, {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      }),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(AUTH_TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutHandle);
  }

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

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export async function awaitBrowserAuthReady({
  path = '/api/auth/account-shell',
  attempts = 4,
  delayMs = 250,
}: AwaitBrowserAuthReadyOptions = {}): Promise<void> {
  let lastStatus: number | null = null;

  for (let index = 0; index < attempts; index += 1) {
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: buildCookieAuthHeaders('GET', {
        accept: 'application/json',
      }),
    });

    if (response.ok) {
      return;
    }

    lastStatus = response.status;
    if (response.status === 401 || response.status >= 500 || response.status === 403) {
      await sleep(delayMs);
      continue;
    }

    throw new Error(`Auth readiness check failed with status ${response.status}.`);
  }

  throw new Error(
    lastStatus === null
      ? 'Auth readiness check did not complete.'
      : `Auth readiness check did not recover from status ${lastStatus}.`,
  );
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
