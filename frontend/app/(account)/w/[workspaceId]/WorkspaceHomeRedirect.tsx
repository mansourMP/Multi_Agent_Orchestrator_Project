'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';

export function WorkspaceHomeRedirect({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const router = useRouter();
  const { actions, state } = useAccountShell();
  const { bootstrap, boundaryKey, shellProfileId } = useWorkspaceBoundary();
  const fallbackRoute = bootstrap.shellHints.defaultRoute ?? `/w/${workspaceId}/chat`;
  const nextRoute = actions.resolveWorkspaceHref(workspaceId) ?? fallbackRoute;

  useEffect(() => {
    router.replace(nextRoute);
  }, [nextRoute, router]);

  return (
    <WorkspaceScopeRedirectMessage
      boundaryKey={boundaryKey}
      workspaceId={workspaceId}
      nextRoute={nextRoute}
      shellProfileId={shellProfileId}
      routeWorkspaceId={state.selectedWorkspaceId}
    />
  );
}

function WorkspaceScopeRedirectMessage({
  boundaryKey,
  workspaceId,
  nextRoute,
  shellProfileId,
  routeWorkspaceId,
}: {
  boundaryKey: string;
  workspaceId: string;
  nextRoute: string;
  shellProfileId: string;
  routeWorkspaceId: string | null;
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
      <p style={{ margin: 0 }}>
        Boundary key: <code>{boundaryKey}</code>
      </p>
      <p style={{ margin: 0 }}>
        Shell profile: <code>{shellProfileId}</code>
      </p>
      <p style={{ margin: 0 }}>
        Route workspace id: <code>{routeWorkspaceId ?? 'null'}</code>
      </p>
    </main>
  );
}
