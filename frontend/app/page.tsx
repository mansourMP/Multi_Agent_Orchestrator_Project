import Link from 'next/link';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ShellRecoveryActions } from '@/app/(account)/ShellRecoveryActions';
import { FirstLaunchPanel } from '@/lib/auth/first-launch-panel';
import {
  isDegradedAccountShellSession,
  loadAccountShellSession,
} from '@/lib/server/load-account-shell-session';
import { resolvePrimaryProductWorkspaceId } from '@/lib/shell/workspace-membership-model';
import { AppGetStartedButton } from '@/lib/ui/primitives';

export const metadata: Metadata = {
  title: 'Welcome to Empyralis',
  description: 'Set up your personal agent or explore public agents.',
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

  if (session) {
    const workspaceId = resolvePrimaryProductWorkspaceId(session.workspaceMemberships);
    if (workspaceId) {
      redirect(`/w/${encodeURIComponent(workspaceId)}/sage`);
    }
    redirect('/workspaces/new');
  }

  return (
    <FirstLaunchPanel
      primaryAction={(
        <AppGetStartedButton href="/login" className="app-first-launch__primary">
          Log in
        </AppGetStartedButton>
      )}
      secondaryAction={(
        <>
          <Link href="/signup" className="app-first-launch__secondary">
            Create an account
          </Link>
          <Link href="/preview" className="app-first-launch__secondary">
            Explore public agents
          </Link>
        </>
      )}
    />
  );
}
