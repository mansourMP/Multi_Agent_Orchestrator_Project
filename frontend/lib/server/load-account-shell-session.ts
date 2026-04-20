import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';

import type { AccountShellBootstrap } from '@/lib/shell/account-shell-store';
import { parseAccountShellPayload } from '@/lib/shell/account-shell-payload';

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
    if (!host) {
      return degradedAccountShellSession(null, 'Cannot resolve request host for account-shell bootstrap.');
    }
    const origin = `${proto.split(',')[0].trim() || 'http'}://${host.split(',')[0].trim()}`;
    const response = await fetch(`${origin}/api/auth/account-shell`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(requestHeaders.get('cookie') ? { cookie: requestHeaders.get('cookie') as string } : {}),
        ...(requestHeaders.get('authorization') ? { authorization: requestHeaders.get('authorization') as string } : {}),
      },
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      return degradedAccountShellSession(
        response.status,
        `Account shell request failed with status ${response.status}.`,
      );
    }

    return parseAccountShellPayload(await response.json());
  } catch (error) {
    return degradedAccountShellSession(
      null,
      error instanceof Error ? error.message : 'Account shell bootstrap failed.',
    );
  }
}

export const loadAccountShellSession = cache(fetchAccountShellSession);

export const loadAccountShellSessionSafely = cache(async (): Promise<AccountShellBootstrap | null> => {
  const session = await fetchAccountShellSession();
  return isDegradedAccountShellSession(session) ? null : session;
});
