'use client';

import { useRouter } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { StateBanner } from '@/lib/ui/state-banner';
import type { WorkspaceRouteId } from '@/lib/workspace/workspace-shell';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type SettingsAction = {
  id: string;
  label: string;
  href: string | null;
  unavailableLabel?: string;
};

type SettingsSection = {
  id: string;
  title: string;
  description: string;
  summary: string;
  actions: SettingsAction[];
};

export function WorkstationSettingsPane() {
  const { bootstrap, workspaceId, routeManifest } = useWorkspaceBoundary();
  const router = useRouter();
  const onboardingHref = `/onboarding?workspaceId=${encodeURIComponent(workspaceId)}`;

  const routeHref = (routeId: WorkspaceRouteId): string | null => routeManifest.routeIndex[routeId]?.href ?? null;
  const hasRoute = (routeId: WorkspaceRouteId): boolean => Boolean(routeManifest.routeIndex[routeId]);

  const sections: SettingsSection[] = [
    {
      id: 'profile-identity',
      title: 'Profile & identity',
      description: 'Update your profile name, account details, and how your identity appears in this workspace.',
      summary: bootstrap.account.displayName || bootstrap.account.email,
      actions: [
        {
          id: 'profile-open',
          label: 'Manage profile',
          href: routeHref('settings'),
        },
      ],
    },
    {
      id: 'connections',
      title: 'Connections',
      description: 'Connect customer channels and keep linked identities in sync with your workspace.',
      summary: hasRoute('channels') ? 'Ready to connect channels' : 'Available to workspace admins',
      actions: [
        {
          id: 'connections-open',
          label: 'Manage channels',
          href: routeHref('channels'),
          unavailableLabel: 'Available to workspace admins',
        },
      ],
    },
    {
      id: 'billing-plan',
      title: 'Billing & plan',
      description: 'Review subscription details, billing preferences, and plan coverage for your workspace.',
      summary: hasRoute('deploy') ? `${bootstrap.entitlements.label} plan` : 'Available on supported plans',
      actions: [
        {
          id: 'billing-open',
          label: 'Open billing & plan',
          href: routeHref('deploy'),
          unavailableLabel: 'Available on supported plans',
        },
      ],
    },
    {
      id: 'workspace-defaults',
      title: 'Workspace defaults',
      description: 'Set guided defaults for onboarding, workspace behavior, and day-to-day setup preferences.',
      summary: bootstrap.shellHints.requiresOnboarding ? 'Guided setup recommended' : 'Workspace defaults are configured',
      actions: [
        {
          id: 'workspace-setup',
          label: 'Run guided setup',
          href: onboardingHref,
        },
        {
          id: 'workspace-open',
          label: 'Workspace defaults',
          href: routeHref('settings'),
        },
      ],
    },
    {
      id: 'privacy-safety',
      title: 'Privacy & safety',
      description: 'Adjust safety controls, data handling preferences, and policy settings for trusted operation.',
      summary: hasRoute('settings') ? 'Safety settings are available' : 'Available to workspace admins',
      actions: [
        {
          id: 'privacy-open',
          label: 'Open privacy & safety',
          href: routeHref('settings'),
        },
      ],
    },
    {
      id: 'team-access',
      title: 'Team access',
      description: 'Manage member access, responsibilities, and team controls for shared workspace management.',
      summary: hasRoute('inbox') || hasRoute('deploy') ? 'Team controls are available' : 'Available to workspace admins',
      actions: [
        {
          id: 'team-members',
          label: 'Manage team access',
          href: routeHref('inbox'),
          unavailableLabel: 'Available to workspace admins',
        },
        {
          id: 'team-routing',
          label: 'Conversation routing',
          href: routeHref('deploy'),
          unavailableLabel: 'Available on supported plans',
        },
      ],
    },
  ];

  return (
    <WorkstationSurfaceRoot surface="settings">
      <ListDetailShell
        className="app-settings-shell"
        title="Settings"
        subtitle="A clean hub for profile, workspace defaults, channels, billing, and safety controls."
      >
        <StateBanner
          tone={bootstrap.shellHints.requiresOnboarding ? 'warning' : 'success'}
          title={bootstrap.shellHints.requiresOnboarding ? 'Complete setup to unlock your best default experience' : 'Your workspace settings are ready'}
        >
          Settings are grouped by customer-facing workflows so core updates are easy to find.
        </StateBanner>

        <ListDetailPanel
          className="app-settings-panel app-settings-panel--hub"
          eyebrow="Configuration hub"
          title="Choose what you want to update"
          subtitle="Each section keeps key actions close at hand with plain-language guidance."
        >
          <div className="settings-hub-grid">
            {sections.map((section) => (
              <article key={section.id} className="settings-hub-card" aria-label={`${section.title} settings section`}>
                <div className="settings-hub-card__header">
                  <div className="settings-hub-card__copy">
                    <strong className="settings-hub-card__title">{section.title}</strong>
                    <p className="settings-hub-card__description">{section.description}</p>
                  </div>
                  <span className="settings-hub-card__summary">{section.summary}</span>
                </div>
                <div className="settings-hub-card__actions">
                  {section.actions.map((action) => (
                    <div key={action.id} className="settings-hub-card__action-row">
                      <AppButton
                        type="button"
                        tone="secondary"
                        disabled={!action.href}
                        title={!action.href ? action.unavailableLabel : undefined}
                        onClick={() => {
                          if (!action.href) {
                            return;
                          }
                          router.push(action.href);
                        }}
                      >
                        {action.label}
                      </AppButton>
                      {!action.href && action.unavailableLabel ? (
                        <span className="settings-hub-card__action-hint">{action.unavailableLabel}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </ListDetailPanel>

        <ListDetailPanel
          className="app-settings-panel app-settings-panel--overview"
          eyebrow="Overview"
          title={bootstrap.workspace.label}
          subtitle="Personal and workspace preferences in one place."
        >
          <FormGrid>
            <FormReadout label="Signed in as" value={bootstrap.account.email} />
            <FormReadout label="Display name" value={bootstrap.account.displayName || 'Not set'} />
            <FormReadout label="Plan" value={bootstrap.entitlements.label} />
            <FormReadout label="Workspace type" value={bootstrap.workspace.kind} />
            <FormReadout
              label="Setup status"
              value={bootstrap.shellHints.requiresOnboarding ? 'Guided setup available' : 'Setup complete'}
            />
          </FormGrid>
        </ListDetailPanel>
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
