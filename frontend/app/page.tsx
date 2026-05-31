import { Metadata } from 'next';

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

  return (
    <LandingClient
      accountHref={isAuthenticated ? platformHref : '/login'}
      accountLabel={isAuthenticated ? 'Open platform' : 'Log in'}
      primaryHref={isAuthenticated ? platformHref : '/signup'}
      primaryLabel={isAuthenticated ? 'Open platform' : 'Create account'}
      finalCtaLabel={isAuthenticated ? 'Open your main agent' : 'Start with your main agent'}
    />
  );
}
