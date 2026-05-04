import Link from 'next/link';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { FirstLaunchPanel } from '@/lib/auth/first-launch-panel';
import { loadAccountShellSessionSafely } from '@/lib/server/load-account-shell-session';
import { resolvePrimaryProductWorkspaceId } from '@/lib/shell/workspace-membership-model';

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
        <Link href="/signup" className="app-button app-button--primary app-first-launch__primary">
          Set up your personal agent
        </Link>
      )}
      secondaryAction={(
        <Link href="/preview" className="app-first-launch__secondary">
          Or explore agents by others
        </Link>
      )}
    />
  );
}
