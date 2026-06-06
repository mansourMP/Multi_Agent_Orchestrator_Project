import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ShellRecoveryActions } from '@/app/(account)/ShellRecoveryActions';
import {
  isDegradedAccountShellSession,
  loadAccountShellSession,
} from '@/lib/server/load-account-shell-session';
import { resolvePrimaryProductWorkspaceId } from '@/lib/shell/workspace-membership-model';

import { LandingClient } from './landing-client';
import './landing.css';

export const metadata: Metadata = {
  title: 'Empyralis | Agent Studio for connected AI work',
  description:
    'A control surface for your main agent, worker agents, connected external agents, and dedicated agent computers.',
};

export default async function LandingPage() {
  const session = await loadAccountShellSession();
  if (isDegradedAccountShellSession(session)) {
    return (
      <main className="app-page-message">
        <div className="app-page-message__content">
          <h1 className="app-page-message__title">Workspace is warming up</h1>
          <p className="app-page-message__body">
            Empyralis could not confirm your workspace session yet. This usually clears after a restart or deploy.
          </p>
          <p className="app-page-message__meta">
            Reload the workspace, or sign in again if it keeps happening.
          </p>
          <ShellRecoveryActions label="Workspace recovery actions" />
        </div>
      </main>
    );
  }

  const workspaceId = session ? resolvePrimaryProductWorkspaceId(session.workspaceMemberships) : null;
  const platformHref = workspaceId ? `/w/${encodeURIComponent(workspaceId)}/sage` : '/workspaces/new';
  const isAuthenticated = Boolean(session);

  if (isAuthenticated) {
    redirect(platformHref);
  }

  return (
    <LandingClient
      accountHref="/login"
      accountLabel="Log in"
      primaryHref="/signup"
      primaryLabel="Create account"
      finalCtaLabel="Start with your main agent"
    />
  );
}
