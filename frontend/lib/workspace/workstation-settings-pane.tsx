'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { CommandSheet } from '@/lib/ui/command-sheet';
import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { ModalSection } from '@/lib/ui/modal';
import { StateBanner } from '@/lib/ui/state-banner';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

export function WorkstationSettingsPane() {
  const { bootstrap, workspaceId, shellProfile, routeManifest, hasCapability } = useWorkspaceBoundary();
  const router = useRouter();
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const canAdmin = bootstrap.membership.role === 'owner' || bootstrap.membership.role === 'admin';

  const navigationActions = [
    {
      id: 'onboarding',
      label: 'Workspace setup',
      description: 'Rename the workspace, change shell profile, or reset the default route.',
      href: `/onboarding?workspaceId=${encodeURIComponent(workspaceId)}`,
    },
    ...(canAdmin
      ? [
          {
            id: 'routing',
            label: 'Routing',
            description: 'Inspect workspace routing and operational channel configuration.',
            href: `/w/${encodeURIComponent(workspaceId)}/admin/routing`,
          },
          {
            id: 'members',
            label: 'Members',
            description: 'Review workspace memberships and invite state.',
            href: `/w/${encodeURIComponent(workspaceId)}/admin/members`,
          },
          {
            id: 'policies',
            label: 'Policies',
            description: 'Review and edit workspace policy controls.',
            href: `/w/${encodeURIComponent(workspaceId)}/admin/policies`,
          },
        ]
      : []),
  ];

  return (
    <WorkstationSurfaceRoot surface="settings">
      <ListDetailShell
        title="Settings"
        subtitle="Workspace identity, runtime defaults, channel capability state, and operator actions in one owned surface."
        actions={(
          <AppButton type="button" onClick={() => setIsActionSheetOpen(true)}>
            Workspace actions
          </AppButton>
        )}
      >
        <StateBanner
          tone={bootstrap.shellHints.requiresOnboarding ? 'warning' : 'success'}
          title={bootstrap.shellHints.requiresOnboarding ? 'Workspace setup required' : 'Workspace configuration is complete'}
          detail={`Shell profile ${shellProfile.label} · default route ${routeManifest.defaultRoute}`}
        >
          Settings are sourced from canonical bootstrap state and routed product surfaces.
        </StateBanner>

        <ListDetailColumns
          primary={(
            <div className="app-stack-4">
              <ListDetailPanel
                eyebrow="Identity"
                title={bootstrap.workspace.label}
                subtitle={`${bootstrap.workspace.kind} workspace · ${bootstrap.membership.role} membership`}
              >
                <FormGrid>
                  <FormReadout label="Workspace id" value={bootstrap.workspace.id} />
                  <FormReadout label="Workspace kind" value={bootstrap.workspace.kind} />
                  <FormReadout label="Shell profile" value={shellProfile.label} />
                  <FormReadout label="Preferred profile" value={bootstrap.shellHints.preferredProfile} />
                  <FormReadout label="Default route" value={bootstrap.shellHints.defaultRoute} />
                  <FormReadout label="Plan" value={bootstrap.entitlements.plan} />
                </FormGrid>
              </ListDetailPanel>

              <ListDetailPanel
                eyebrow="Execution"
                title="Runtime defaults"
                subtitle="Default runtime and workspace execution posture from canonical bootstrap truth."
              >
                <FormGrid>
                  <FormReadout label="Deployment mode" value={bootstrap.runtime.deploymentMode} />
                  <FormReadout label="Runtime targets" value={String(bootstrap.runtime.runtimeTargets.length)} />
                  <FormReadout label="Channel pairing" value={bootstrap.capabilities.channel_pairing_enabled ? 'Enabled' : 'Blocked'} />
                  <FormReadout label="Telegram pairing" value={hasCapability('telegram_channel_enabled') ? 'Enabled' : 'Disabled'} />
                  <FormReadout label="WhatsApp pairing" value={hasCapability('whatsapp_channel_enabled') ? 'Enabled' : 'Disabled'} />
                  <FormReadout label="Setup state" value={bootstrap.shellHints.requiresOnboarding ? 'Requires onboarding' : 'Configured'} />
                </FormGrid>
              </ListDetailPanel>
            </div>
          )}
          secondary={(
            <div className="app-stack-4">
              <ListDetailPanel
                eyebrow="Navigation"
                title="Settings surfaces"
                subtitle="Continue into the relevant routed product surfaces when you need to change policy or onboarding state."
              >
                <div className="app-stack-3">
                  {navigationActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => router.push(action.href)}
                      className="app-card-button"
                    >
                      <strong className="app-card-button__title">{action.label}</strong>
                      <span className="app-card-button__subtitle">{action.description}</span>
                    </button>
                  ))}
                </div>
              </ListDetailPanel>

              <ListDetailPanel
                eyebrow="Operational posture"
                title="Current workspace picture"
                subtitle="A compact readout of the signals that shape how this workspace opens and behaves."
              >
                <StateBanner
                  tone={bootstrap.capabilities.channel_pairing_enabled ? 'neutral' : 'warning'}
                  title={bootstrap.capabilities.channel_pairing_enabled ? 'Channel pairing available' : 'Channel pairing blocked'}
                  detail={bootstrap.capabilities.channel_pairing_enabled ? 'Telegram and WhatsApp pairing can be managed in-product.' : 'Channel pairing requires the appropriate capability and entitlement state.'}
                >
                  Default route remains {bootstrap.shellHints.defaultRoute}.
                </StateBanner>
                <StateBanner
                  tone={canAdmin ? 'success' : 'neutral'}
                  title={canAdmin ? 'Administrative settings available' : 'Member settings scope'}
                  detail={canAdmin ? 'Routing, member, and policy controls are available from this workspace.' : 'Administrative controls remain restricted to workspace admins and owners.'}
                >
                  Membership role: {bootstrap.membership.role}.
                </StateBanner>
                {navigationActions.length === 0 ? (
                  <EmptyPanel
                    title="No available actions"
                    body="This workspace does not currently expose additional routed settings surfaces."
                  />
                ) : null}
              </ListDetailPanel>
            </div>
          )}
        />
      </ListDetailShell>

      <CommandSheet
        open={isActionSheetOpen}
        title="Workspace actions"
        description="Move directly into the routed settings surfaces that own workspace onboarding, integrations, and policy state."
        onClose={() => setIsActionSheetOpen(false)}
        actions={<AppButton type="button" tone="secondary" onClick={() => setIsActionSheetOpen(false)}>Done</AppButton>}
      >
        <ModalSection title="Available surfaces" description="Each action keeps you inside owned product chrome and routes to the relevant workstation surface.">
          <div className="app-stack-3">
            {navigationActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  setIsActionSheetOpen(false);
                  router.push(action.href);
                }}
                className="app-card-button"
              >
                <strong className="app-card-button__title">{action.label}</strong>
                <span className="app-card-button__subtitle">{action.description}</span>
              </button>
            ))}
          </div>
        </ModalSection>
      </CommandSheet>
    </WorkstationSurfaceRoot>
  );
}
