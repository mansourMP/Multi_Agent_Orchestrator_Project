'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { joinClassNames } from '@/lib/ui/primitives';
import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { WorkstationBillingPane } from '@/lib/workspace/workstation-billing-pane';
import { WorkstationDesktopStatus } from '@/lib/workspace/workstation-desktop-status';
import { WorkstationGatewayOperatorPane } from '@/lib/workspace/workstation-gateway-operator-pane';
import { WorkstationPlatformAnalyticsPane } from '@/lib/workspace/workstation-platform-analytics-pane';

type SettingsSectionId = 'account' | 'devices' | 'usage' | 'billing' | 'privacy';

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
    eyebrow: 'My Computer',
    title: 'Devices',
    description: 'Trusted devices, connection health, and local computer readiness.',
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
    description: 'Needs your OK, memory, device trust.',
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
    || value === 'usage'
    || value === 'billing'
    || value === 'privacy';
}

export function WorkstationSettingsPane() {
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
            <p className="app-settings-sidebar__subtitle">Account controls.</p>
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
            </div>
          ) : null}

          {selectedSection === 'devices' ? (
            <div className="settings-section-stack">
              <WorkstationDesktopStatus />
              <WorkstationGatewayOperatorPane />
              <FormGrid>
                <FormReadout label="Deployment mode" value={humanizeToken(bootstrap.runtime.deploymentMode)} />
                <FormReadout
                  label="Preferred computer target"
                  value={preferredRuntimeTarget ? preferredRuntimeTarget.label : 'Cloud'}
                />
                <FormReadout
                  label="Local companion"
                  value={localCompanionTarget?.online ? 'Connected' : localCompanionTarget ? 'Available but offline' : 'Not detected'}
                />
                <FormReadout
                  label="Needs your OK mode"
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

          {selectedSection === 'privacy' ? (
            <div className="settings-section-stack">
              <div className="settings-detail-grid">
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">Needs your OK actions</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Sage pauses for review before destructive file changes, external sends, purchases, and dangerous shell commands.
                  </p>
                </article>
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">Explicit memory</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Memory is saved as structured workspace records with sensitivity classes, not hidden chat transcript scraping.
                  </p>
                </article>
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">This Mac boundary</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Local files, browser, clipboard, screenshots, and terminal require an online paired computer on a trusted device.
                  </p>
                </article>
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">Cloud Computer boundary</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Hosted computer work is separate from personal-device access and must be explicitly enabled, metered, and audited.
                  </p>
                </article>
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">AI model credentials</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    BYOK credentials are stored in the workspace vault and AI model choice should only change the reasoning model.
                  </p>
                </article>
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">External user deletion</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Build assistants support privacy/delete requests for external channel users, including conversation data and memory.
                  </p>
                </article>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
