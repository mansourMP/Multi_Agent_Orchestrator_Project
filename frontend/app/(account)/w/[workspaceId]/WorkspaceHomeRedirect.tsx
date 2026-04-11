'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';

export function WorkspaceHomeRedirect({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const router = useRouter();
  const { actions, state } = useAccountShell();
  const fallbackRoute = state.workspaceMembershipIndex[workspaceId]?.defaultRoute ?? `/w/${workspaceId}/chat`;
  const nextRoute = actions.resolveWorkspaceHref(workspaceId) ?? fallbackRoute;

  useEffect(() => {
    router.replace(nextRoute);
  }, [nextRoute, router]);

  return (
    <WorkspaceScopeRedirectMessage
      workspaceId={workspaceId}
      nextRoute={nextRoute}
    />
  );
}

function WorkspaceScopeRedirectMessage({
  workspaceId,
  nextRoute,
}: {
  workspaceId: string;
  nextRoute: string;
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '3rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Workspace Redirect</h1>
      <p style={{ margin: 0, maxWidth: '48rem', lineHeight: 1.6 }}>
        Resolving the safe route for workspace <code>{workspaceId}</code>.
      </p>
      <p style={{ margin: 0 }}>
        Next route: <code>{nextRoute}</code>
      </p>
    </main>
  );
}
