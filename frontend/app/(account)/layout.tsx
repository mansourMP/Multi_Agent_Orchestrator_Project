import type { ReactNode } from 'react';

import { redirect } from 'next/navigation';

import { loadAccountShellSession } from '@/lib/server/load-account-shell-session';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await loadAccountShellSession();

  if (!session) {
    redirect('/login');
  }

  return children;
}
