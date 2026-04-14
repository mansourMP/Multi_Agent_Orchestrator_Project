'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  createWorkspace,
  loadAccountShellBootstrap,
  type CreateWorkspaceInput,
} from '@/lib/account/account-workspaces-client';
import { useAccountShell } from '@/lib/shell/account-shell-context';
import {
  WorkspaceSetupForm,
  createDefaultWorkspaceSetupValues,
} from '@/lib/workspace/workspace-setup-form';

const NEW_WORKSPACE_FORM_ID = 'new-workspace';

export function NewWorkspacePageClient() {
  const router = useRouter();
  const { actions } = useAccountShell();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(values: CreateWorkspaceInput) {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const createdWorkspace = await createWorkspace(values);
      const session = await loadAccountShellBootstrap();
      actions.replaceSession(session);
      router.replace(createdWorkspace.defaultRoute);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Workspace could not be created.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
      }}
    >
      <div style={{ width: 'min(100%, 40rem)' }}>
        <WorkspaceSetupForm
          workspaceId={NEW_WORKSPACE_FORM_ID}
          routeMode="relative"
          title="Create a workspace"
          description="Every additional workspace needs an explicit shell profile and default route before it becomes part of the account shell."
          submitLabel="Create workspace"
          initialValues={createDefaultWorkspaceSetupValues(NEW_WORKSPACE_FORM_ID, {}, 'relative')}
          submitting={submitting}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
