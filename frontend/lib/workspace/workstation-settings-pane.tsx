'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { WorkstationBillingPane } from '@/lib/workspace/workstation-billing-pane';
import { WorkstationDesktopStatus } from '@/lib/workspace/workstation-desktop-status';
import { WorkstationPlatformAnalyticsPane } from '@/lib/workspace/workstation-platform-analytics-pane';
import { WorkspaceChannelOperationsConsole } from '@/lib/workspace/workspace-channel-operations-console';

type SettingsSectionId = 'account' | 'devices' | 'channels' | 'usage' | 'billing' | 'privacy';

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: 'account',
    label: 'Account',
    eyebrow: 'Identity',
    title: 'Account',
    description: 'Profile and plan.',
  },
  {
    id: 'devices',
    label: 'Devices',
    eyebrow: 'Runtime',
    title: 'Devices',
    description: 'Runtime targets and local status.',
  },
  {
    id: 'channels',
    label: 'Channels',
    eyebrow: 'Operations',
    title: 'Channels',
    description: 'Channel health and delivery.',
  },
  {
    id: 'usage',
    label: 'Usage',
    eyebrow: 'Analytics',
    title: 'Usage',
    description: 'Usage and spend.',
  },
  {
    id: 'billing',
    label: 'Billing',
    eyebrow: 'Plan',
    title: 'Billing',
    description: 'Subscription and limits.',
  },
  {
    id: 'privacy',
    label: 'Privacy & Safety',
    eyebrow: 'Trust',
    title: 'Privacy & Safety',
    description: 'Approvals, memory, device trust.',
  },
];

function humanizeToken(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return value === 'account'
    || value === 'devices'
    || value === 'channels'
    || value === 'usage'
    || value === 'billing'
    || value === 'privacy';
}

export function WorkstationSettingsPane() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { bootstrap } = useWorkspaceBoundary();
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>(() => {
    const requestedSection = searchParams.get('section');
    return isSettingsSectionId(requestedSection) ? requestedSection : 'account';
  });

  useEffect(() => {
    const requestedSection = searchParams.get('section');
    if (isSettingsSectionId(requestedSection) && requestedSection !== selectedSection) {
      setSelectedSection(requestedSection);
    }
  }, [searchParams, selectedSection]);

  const preferredRuntimeTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.find((target) => target.preferred) ?? bootstrap.runtime.runtimeTargets[0] ?? null,
    [bootstrap.runtime.runtimeTargets],
  );
  const localCompanionTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.find((target) => target.id === 'local_companion') ?? null,
    [bootstrap.runtime.runtimeTargets],
  );
  const activeSection = SETTINGS_SECTIONS.find((section) => section.id === selectedSection) ?? SETTINGS_SECTIONS[0];
  const accountDisplayName = bootstrap.account.displayName?.trim() || 'Empyralis User';
  const accountEmail = bootstrap.account.email;
  const accountInitial = (accountDisplayName || accountEmail).charAt(0).toUpperCase();

  return (
    <main data-workstation-surface="settings" className="app-settings-page">
      <div className="settings-workbench">
        <aside className="settings-nav" aria-label="Settings sections">
          <div className="app-settings-sidebar__header">
            <h2 className="app-settings-sidebar__title">Settings</h2>
            <p className="app-settings-sidebar__subtitle">Workspace controls.</p>
          </div>
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-selected={selectedSection === section.id}
              className={joinClassNames(
                'settings-nav__item',
                selectedSection === section.id && 'settings-nav__item--active',
              )}
              onClick={() => setSelectedSection(section.id)}
            >
              <span className="settings-nav__eyebrow">{section.eyebrow}</span>
              <span className="settings-nav__label">{section.label}</span>
            </button>
          ))}
        </aside>

        <section className="settings-content">
          <header className="app-settings-main__header">
            <h1 className="app-settings-main__title">{activeSection.title}</h1>
            <p className="app-settings-main__subtitle">{activeSection.description}</p>
          </header>

          {selectedSection === 'account' ? (
            <div className="settings-section-stack">
              <section className="settings-account-card" aria-label="Account profile">
                <div className="settings-account-card__avatar" aria-hidden="true">
                  {accountInitial}
                </div>
                <div className="settings-account-card__body">
                  <p className="settings-account-card__eyebrow">Current account</p>
                  <h2 className="settings-account-card__name">{accountDisplayName}</h2>
                  <p className="settings-account-card__email">{accountEmail}</p>
                </div>
              </section>
              <FormGrid>
                <FormReadout label="Display name" value={bootstrap.account.displayName || 'Not set yet'} />
                <FormReadout label="Email" value={bootstrap.account.email} />
                <FormReadout label="Plan" value={bootstrap.entitlements.label} />
                <FormReadout label="Default experience" value="Sage" />
              </FormGrid>
              <div className="settings-action-row">
                <AppButton
                  type="button"
                  tone="secondary"
                  onClick={() => {
                    setSelectedSection('privacy');
                  }}
                >
                  Trust settings
                </AppButton>
              </div>
            </div>
          ) : null}

          {selectedSection === 'devices' ? (
            <div className="settings-section-stack">
              <WorkstationDesktopStatus />
              <FormGrid>
                <FormReadout label="Deployment mode" value={humanizeToken(bootstrap.runtime.deploymentMode)} />
                <FormReadout
                  label="Preferred runtime"
                  value={preferredRuntimeTarget ? preferredRuntimeTarget.label : 'Cloud'}
                />
                <FormReadout
                  label="Local companion"
                  value={localCompanionTarget?.online ? 'Connected' : localCompanionTarget ? 'Available but offline' : 'Not detected'}
                />
                <FormReadout
                  label="Approval mode"
                  value={preferredRuntimeTarget?.approvalMode ? humanizeToken(preferredRuntimeTarget.approvalMode) : 'Auto-run'}
                />
              </FormGrid>
              <div className="settings-device-grid">
                {bootstrap.runtime.runtimeTargets.map((target) => (
                  <article key={target.id} className="settings-detail-card">
                    <div className="settings-detail-card__header">
                      <strong className="settings-detail-card__title">{target.label}</strong>
                      <span className={`settings-status settings-status--${target.online && target.healthy ? 'ready' : target.available ? 'warning' : 'muted'}`}>
                        {target.statusLabel || humanizeToken(target.status)}
                      </span>
                    </div>
                    <p className="settings-detail-card__body">
                      {target.statusReason || target.description || 'Available for runs.'}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          {selectedSection === 'usage' ? <WorkstationPlatformAnalyticsPane /> : null}

          {selectedSection === 'billing' ? <WorkstationBillingPane /> : null}

          {selectedSection === 'channels' ? <WorkspaceChannelOperationsConsole /> : null}

          {selectedSection === 'privacy' ? (
            <div className="settings-section-stack">
              <div className="settings-detail-grid">
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">Approvals</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Sensitive actions pause for review.
                  </p>
                </article>
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">Memory</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Sage memory stays explicit and scoped.
                  </p>
                </article>
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">Device trust</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Local execution stays on trusted machines.
                  </p>
                </article>
              </div>
              <div className="settings-action-row">
                <AppButton
                  type="button"
                  tone="secondary"
                  onClick={() => {
                    router.push(`/w/${encodeURIComponent(bootstrap.workspace.id)}/approvals`);
                  }}
                >
                  Open approvals
                </AppButton>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
