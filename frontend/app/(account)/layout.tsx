import type { ReactNode } from 'react';

import { redirect } from 'next/navigation';

import {
  isDegradedAccountShellSession,
  loadAccountShellSession,
} from '@/lib/server/load-account-shell-session';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await loadAccountShellSession();

  if (!session) {
    redirect('/login');
  }

  if (isDegradedAccountShellSession(session)) {
    return (
      <main className="app-page-message">
        <div className="app-page-message__content">
          <h1 className="app-page-message__title">Workspace shell is temporarily unavailable</h1>
          <p className="app-page-message__body">
            Empyralis could not load your account shell right now.
            {session.errorStatus ? ` Bootstrap returned ${session.errorStatus}.` : ''}
          </p>
          <p className="app-page-message__meta">
            Reload this page, or sign in again if the problem persists.
          </p>
        </div>
      </main>
    );
  }

  return children;
}
