import Link from 'next/link';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FirstLaunchPanel } from '@/lib/auth/first-launch-panel';
import { loadAccountShellSessionSafely } from '@/lib/server/load-account-shell-session';
import { resolvePrimaryProductWorkspaceId } from '@/lib/shell/workspace-membership-model';
import { AppGetStartedButton } from '@/lib/ui/primitives';

export const metadata: Metadata = {
  title: 'Welcome to Empyralis',
  description: 'Set up your personal agent or explore public agents.',
};

export default async function LandingPage() {
  const session = await loadAccountShellSessionSafely();
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
