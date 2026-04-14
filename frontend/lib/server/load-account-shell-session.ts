import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';

import type { AccountShellBootstrap } from '@/lib/shell/account-shell-store';
import { parseAccountShellPayload } from '@/lib/shell/account-shell-payload';

async function fetchAccountShellSession(): Promise<AccountShellBootstrap | null> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';
  if (!host) {
    throw new Error('Cannot resolve request host for account-shell bootstrap.');
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
    throw new Error(`Account shell request failed with status ${response.status}.`);
  }

  return parseAccountShellPayload(await response.json());
}

export const loadAccountShellSession = cache(fetchAccountShellSession);

export const loadAccountShellSessionSafely = cache(async (): Promise<AccountShellBootstrap | null> => {
  try {
    return await fetchAccountShellSession();
  } catch {
    return null;
  }
});
