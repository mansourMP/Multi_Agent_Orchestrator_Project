import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';

import {
  ACCOUNT_SHELL_RETRY_DELAYS_MS,
  AUTH_ACCOUNT_SHELL_TIMEOUT_MS,
} from '@/lib/auth/auth-timeouts';
import { controlPlaneBaseUrl } from '@/lib/server/control-plane-base-url';
import type { AccountShellBootstrap } from '@/lib/shell/account-shell-store';
import { parseAccountShellPayload } from '@/lib/shell/account-shell-payload';

const RETRYABLE_ACCOUNT_SHELL_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const accountShellInFlightRequests = new Map<string, Promise<LoadedAccountShellSession>>();

export type DegradedAccountShellSession = {
  account: null;
  workspaceMemberships: [];
  degraded: true;
  errorStatus: number | null;
  errorMessage: string | null;
};

export type LoadedAccountShellSession = AccountShellBootstrap | DegradedAccountShellSession | null;

function degradedAccountShellSession(
  errorStatus: number | null,
  errorMessage: string | null = null,
): DegradedAccountShellSession {
  return {
    account: null,
    workspaceMemberships: [],
    degraded: true,
    errorStatus,
    errorMessage,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sameOriginAccountShellUrl(host: string | null, proto: string | null): string | null {
  const normalizedHost = String(host ?? '').split(',')[0].trim();
  if (!normalizedHost) {
    return null;
  }
  const normalizedProto = String(proto ?? '').split(',')[0].trim() === 'https' ? 'https' : 'http';
  return `${normalizedProto}://${normalizedHost}/api/auth/account-shell`;
}

async function fetchSameOriginAccountShellSession(
  accountShellUrl: string | null,
  forwardHeaders: HeadersInit,
): Promise<LoadedAccountShellSession | undefined> {
  if (!accountShellUrl) {
    return undefined;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, AUTH_ACCOUNT_SHELL_TIMEOUT_MS);

  try {
    const response = await fetch(accountShellUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: forwardHeaders,
    });

    if (response.status === 401) {
      return null;
    }

    if (response.ok) {
      return parseAccountShellPayload(await response.json());
    }
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutHandle);
  }

  return undefined;
}

export function isDegradedAccountShellSession(
  session: LoadedAccountShellSession,
): session is DegradedAccountShellSession {
  return session !== null && session.account === null && session.degraded === true;
}

async function fetchAccountShellSession(): Promise<LoadedAccountShellSession> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
    const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';
    const sameOriginUrl = sameOriginAccountShellUrl(host, proto);
    const forwardHeaders: Record<string, string> = {
      accept: 'application/json',
      ...(requestHeaders.get('cookie') ? { cookie: requestHeaders.get('cookie') as string } : {}),
      ...(requestHeaders.get('authorization') ? { authorization: requestHeaders.get('authorization') as string } : {}),
      ...(host ? { 'x-forwarded-host': host.split(',')[0].trim() } : {}),
      ...(proto ? { 'x-forwarded-proto': proto.split(',')[0].trim() || 'http' } : {}),
    };
    const accountShellUrl = `${controlPlaneBaseUrl()}/api/v1/auth/account-shell`;
    const inFlightKey = [
      accountShellUrl,
      forwardHeaders.cookie ?? '',
      forwardHeaders.authorization ?? '',
      forwardHeaders['x-forwarded-host'] ?? '',
      forwardHeaders['x-forwarded-proto'] ?? '',
    ].join('::');
    const existingRequest = accountShellInFlightRequests.get(inFlightKey);
    if (existingRequest) {
      return existingRequest;
    }
    const requestPromise = fetchAccountShellSessionWithRetry({
      accountShellUrl,
      sameOriginUrl,
      forwardHeaders,
    });
    accountShellInFlightRequests.set(inFlightKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      if (accountShellInFlightRequests.get(inFlightKey) === requestPromise) {
        accountShellInFlightRequests.delete(inFlightKey);
      }
    }
  } catch (error) {
    return degradedAccountShellSession(
      null,
      error instanceof Error && error.name === 'AbortError'
        ? `Account shell bootstrap timed out after ${AUTH_ACCOUNT_SHELL_TIMEOUT_MS}ms.`
        : error instanceof Error ? error.message : 'Account shell bootstrap failed.',
    );
  }
}

async function fetchAccountShellSessionWithRetry({
  accountShellUrl,
  sameOriginUrl,
  forwardHeaders,
}: {
  accountShellUrl: string;
  sameOriginUrl: string | null;
  forwardHeaders: HeadersInit;
}): Promise<LoadedAccountShellSession> {
  try {
    let lastStatus: number | null = null;
    let lastErrorMessage: string | null = null;

    for (let attempt = 0; attempt <= ACCOUNT_SHELL_RETRY_DELAYS_MS.length; attempt += 1) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort();
      }, AUTH_ACCOUNT_SHELL_TIMEOUT_MS);

      try {
        const response = await fetch(accountShellUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
          headers: forwardHeaders,
        });

        if (response.status === 401) {
          return null;
        }

        if (response.ok) {
          return parseAccountShellPayload(await response.json());
        }

        lastStatus = response.status;
        lastErrorMessage = `Account shell request failed with status ${response.status}.`;
        if (!RETRYABLE_ACCOUNT_SHELL_STATUSES.has(response.status) || attempt === ACCOUNT_SHELL_RETRY_DELAYS_MS.length) {
          const fallbackSession = await fetchSameOriginAccountShellSession(sameOriginUrl, forwardHeaders);
          if (fallbackSession !== undefined) {
            return fallbackSession;
          }
          return degradedAccountShellSession(response.status, lastErrorMessage);
        }
      } catch (error) {
        lastStatus = error instanceof Error && error.name === 'AbortError' ? 504 : null;
        lastErrorMessage = error instanceof Error && error.name === 'AbortError'
          ? `Account shell bootstrap timed out after ${AUTH_ACCOUNT_SHELL_TIMEOUT_MS}ms.`
          : error instanceof Error ? error.message : 'Account shell bootstrap failed.';
        if (attempt === ACCOUNT_SHELL_RETRY_DELAYS_MS.length) {
          const fallbackSession = await fetchSameOriginAccountShellSession(sameOriginUrl, forwardHeaders);
          if (fallbackSession !== undefined) {
            return fallbackSession;
          }
          return degradedAccountShellSession(lastStatus, lastErrorMessage);
        }
      } finally {
        clearTimeout(timeoutHandle);
      }

      await delay(ACCOUNT_SHELL_RETRY_DELAYS_MS[attempt]);
    }

    return degradedAccountShellSession(lastStatus, lastErrorMessage);
  } catch (error) {
    return degradedAccountShellSession(
      null,
      error instanceof Error && error.name === 'AbortError'
        ? `Account shell bootstrap timed out after ${AUTH_ACCOUNT_SHELL_TIMEOUT_MS}ms.`
        : error instanceof Error ? error.message : 'Account shell bootstrap failed.',
    );
  }
}

export const loadAccountShellSession = cache(fetchAccountShellSession);

export const loadAccountShellSessionSafely = cache(async (): Promise<AccountShellBootstrap | null> => {
  const session = await fetchAccountShellSession();
  return isDegradedAccountShellSession(session) ? null : session;
});
