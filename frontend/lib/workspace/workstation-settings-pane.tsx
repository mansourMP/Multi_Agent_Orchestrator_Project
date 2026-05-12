'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { logout, me, type AuthProviderOptions, listAuthProviders } from '@/lib/auth/auth-client';
import {
  AppButton,
  AppNotice,
  AppSurfaceCard,
  AppSurfaceList,
  AppSurfaceListItem,
  AppSurfaceStat,
  AppSurfaceStatGrid,
  joinClassNames,
} from '@/lib/ui/primitives';
import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationBillingPane } from '@/lib/workspace/workstation-billing-pane';
import { WorkstationDesktopStatus } from '@/lib/workspace/workstation-desktop-status';
import { WorkstationGatewayOperatorPane } from '@/lib/workspace/workstation-gateway-operator-pane';
import { WorkstationPlatformAnalyticsPane } from '@/lib/workspace/workstation-platform-analytics-pane';
import type { ProviderCatalogRecord, ProviderProfileRecord } from '@/lib/workspace/workstation-client';

type SettingsSectionId = 'account' | 'devices' | 'usage' | 'billing' | 'privacy' | 'transparency';

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
    eyebrow: 'Connected computers',
    title: 'Connected computers',
    description: 'Trusted computers, connection health, and local tool readiness.',
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
    description: 'Needs your OK, memory, and computer trust.',
  },
  {
    id: 'transparency',
    label: 'Transparency',
    eyebrow: 'Visibility',
    title: 'Transparency',
    description: 'Transparency shows action traces, not private model reasoning.',
  },
];

function humanizeToken(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type AccountProfilePayload = Record<string, unknown> & {
  user?: Record<string, unknown> | null;
  identity_boundary?: Record<string, unknown> | null;
  current_workspace_entitlements?: Record<string, unknown> | null;
};

type BillingSummaryPayload = Record<string, unknown> & {
  subscription?: Record<string, unknown> | null;
  hosted_sage_ai?: Record<string, unknown> | null;
};

type AccountMethodRecord = Record<string, unknown> & {
  provider?: string | null;
  method_type?: string | null;
  label?: string | null;
  status?: string | null;
  is_primary?: boolean | null;
  can_recover?: boolean | null;
};

type HostedCreditsSnapshot = {
  allowed: boolean;
  message: string;
  monthlyCreditCap: number;
  monthlyCreditsRemaining: number;
};

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)));
}

function normalizeHostedCreditValue(record: Record<string, unknown>, usdKey: string, creditKey: string): number {
  const explicitCredits = readNumber(record[creditKey], Number.NaN);
  if (Number.isFinite(explicitCredits)) {
    return explicitCredits;
  }
  const creditsPerUsd = Math.max(1, readNumber(record.credits_per_usd, 1000));
  return readNumber(record[usdKey], 0) * creditsPerUsd;
}

function normalizeHostedCredits(summary: BillingSummaryPayload | null): HostedCreditsSnapshot {
  const hosted = summary && typeof summary.hosted_sage_ai === 'object'
    ? summary.hosted_sage_ai as Record<string, unknown>
    : {};
  return {
    allowed: hosted.allowed === true,
    message: readString(hosted.message, 'Credits are not active yet.'),
    monthlyCreditCap: normalizeHostedCreditValue(hosted, 'monthly_cap_usd', 'monthly_credit_cap'),
    monthlyCreditsRemaining: normalizeHostedCreditValue(hosted, 'monthly_remaining_usd', 'monthly_credits_remaining'),
  };
}

function normalizeAuthMethods(profile: AccountProfilePayload | null): AccountMethodRecord[] {
  const boundary = profile && typeof profile.identity_boundary === 'object'
    ? profile.identity_boundary as Record<string, unknown>
    : {};
  return Array.isArray(boundary.auth_methods)
    ? boundary.auth_methods.filter((item): item is AccountMethodRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function formatAuthMethodLabel(method: AccountMethodRecord): string {
  const provider = readString(method.provider).toLowerCase();
  if (provider === 'empyralis_password') {
    return 'Email and password';
  }
  if (provider === 'google') {
    return 'Google';
  }
  if (provider === 'apple') {
    return 'Apple';
  }
  if (provider === 'oidc') {
    return 'Single sign-on';
  }
  const label = readString(method.label);
  if (label) {
    return label;
  }
  return humanizeToken(provider || readString(method.method_type, 'sign-in'));
}

function formatAuthMethodDetail(method: AccountMethodRecord): string {
  const notes: string[] = [];
  if (method.is_primary === true) {
    notes.push('Primary sign-in');
  }
  if (method.can_recover === true) {
    notes.push('Recovery enabled');
  }
  const status = readString(method.status);
  if (status && status !== 'active') {
    notes.push(humanizeToken(status));
  }
  return notes.join(' · ') || 'Available';
}

function normalizeProviderRecords(payload: unknown): ProviderCatalogRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.providers)
    ? record.providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeProfileRecords(payload: unknown): ProviderProfileRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is ProviderProfileRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function deriveActiveModelPath(
  providers: ProviderCatalogRecord[],
  profiles: ProviderProfileRecord[],
  hostedCredits: HostedCreditsSnapshot,
): { value: string; hint: string } {
  const enabledProfiles = [...profiles]
    .filter((profile) => profile.enabled !== false)
    .sort((left, right) => Number(left.priority ?? 100) - Number(right.priority ?? 100));
  const selectedProfile = enabledProfiles[0] ?? null;
  if (selectedProfile) {
    const providerId = readString(selectedProfile.provider).toLowerCase();
    const provider = providers.find((item) => readString(item.id).toLowerCase() === providerId) ?? null;
    const providerLabel = readString(provider?.label, providerId || 'AI model');
    const modelLabel = readString(selectedProfile.model)
      || readString(provider?.default_model)
      || 'Default model';
    const routeLabel = provider?.local_only === true || providerId === 'ollama'
      ? 'Connected computer'
      : 'Your AI account';
    return {
      value: `${providerLabel} · ${modelLabel}`,
      hint: routeLabel,
    };
  }

  if (hostedCredits.allowed) {
    const hostedProvider = providers.find((provider) => {
      const policy = readString(provider.hosted_sage_ai_policy).toLowerCase();
      return policy === 'enabled_with_cap' || policy === 'allowed';
    }) ?? null;
    const providerLabel = readString(hostedProvider?.label, 'Empyralis default model');
    const modelLabel = readString(hostedProvider?.default_model)
      || readString((Array.isArray(hostedProvider?.models) ? hostedProvider?.models[0]?.label : null))
      || 'Default model';
    return {
      value: `${providerLabel} · ${modelLabel}`,
      hint: 'Empyralis credits',
    };
  }

  return {
    value: 'No AI model selected',
    hint: 'Choose credits, connect your own AI account, or connect a computer.',
  };
}

function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return value === 'account'
    || value === 'devices'
    || value === 'usage'
    || value === 'billing'
    || value === 'privacy'
    || value === 'transparency';
}

const VISIBILITY_MODES = [
  { value: 'off', label: 'Quiet' },
  { value: 'minimal', label: 'Basic' },
  { value: 'standard', label: 'Normal' },
  { value: 'full', label: 'Detailed' },
  { value: 'enterprise', label: 'Admin' },
] as const;

function TransparencyModeSelect({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--color-muted, #6b7280)' }}>{label}</span>
      <select
        defaultValue="standard"
        style={{
          padding: '4px 8px', fontSize: 13, borderRadius: 6,
          border: '1px solid var(--color-border, #e5e7eb)',
          background: 'var(--color-bg, #fff)', color: 'var(--color-fg, #111)',
        }}
      >
        {VISIBILITY_MODES.map(({ value: v, label: l }) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

export function WorkstationSettingsPane() {
  const searchParams = useSearchParams();
  const { bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>(() => {
    const requestedSection = searchParams.get('section');
    return isSettingsSectionId(requestedSection) ? requestedSection : 'account';
  });
  const [accountProfile, setAccountProfile] = useState<AccountProfilePayload | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummaryPayload | null>(null);
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogRecord[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRecord[]>([]);
  const [authProviders, setAuthProviders] = useState<AuthProviderOptions>({
    email: { enabled: true },
    google: { enabled: false },
    apple: { enabled: false },
  });
  const [accountDetailsError, setAccountDetailsError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    const requestedSection = searchParams.get('section');
    if (isSettingsSectionId(requestedSection) && requestedSection !== selectedSection) {
      setSelectedSection(requestedSection);
    }
  }, [searchParams, selectedSection]);

  useEffect(() => {
    let cancelled = false;
    setAccountDetailsError(null);

    void Promise.allSettled([
      me(),
      services.client.getBillingSummary(),
      services.client.listProviderCatalog(),
      services.client.listProviderProfiles(),
      listAuthProviders(),
    ]).then((results) => {
      if (cancelled) {
        return;
      }

      const [profileResult, billingResult, catalogResult, profilesResult, authProvidersResult] = results;

      if (profileResult.status === 'fulfilled') {
        setAccountProfile((profileResult.value ?? null) as AccountProfilePayload | null);
      }
      if (billingResult.status === 'fulfilled') {
        setBillingSummary((billingResult.value ?? null) as BillingSummaryPayload | null);
      }
      if (catalogResult.status === 'fulfilled') {
        setProviderCatalog(normalizeProviderRecords(catalogResult.value));
      }
      if (profilesResult.status === 'fulfilled') {
        setProviderProfiles(normalizeProfileRecords(profilesResult.value));
      }
      if (authProvidersResult.status === 'fulfilled') {
        setAuthProviders({
          email: { enabled: authProvidersResult.value?.email?.enabled !== false },
          google: { enabled: authProvidersResult.value?.google?.enabled === true },
          apple: { enabled: authProvidersResult.value?.apple?.enabled === true },
        });
      }

      const failed = results.some((result) => result.status === 'rejected');
      if (failed) {
        setAccountDetailsError('Some account details could not refresh. Showing the last known basics.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const preferredRuntimeTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.find((target) => target.preferred) ?? bootstrap.runtime.runtimeTargets[0] ?? null,
    [bootstrap.runtime.runtimeTargets],
  );
  const localCompanionTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.find((target) => target.id === 'local_companion') ?? null,
    [bootstrap.runtime.runtimeTargets],
  );
  const preferredComputerLabel = preferredRuntimeTarget
    ? preferredRuntimeTarget.id === 'local_companion'
      ? 'Connected computer'
      : preferredRuntimeTarget.id === 'sage_cloud_computer'
        ? 'Cloud computer'
        : preferredRuntimeTarget.label
    : 'Cloud';
  const activeSection = SETTINGS_SECTIONS.find((section) => section.id === selectedSection) ?? SETTINGS_SECTIONS[0];
  const accountDisplayName = bootstrap.account.displayName?.trim() || 'Empyralis User';
  const accountEmail = bootstrap.account.email;
  const accountInitial = (accountDisplayName || accountEmail).charAt(0).toUpperCase();
  const hostedCredits = useMemo(() => normalizeHostedCredits(billingSummary), [billingSummary]);
  const authMethods = useMemo(() => normalizeAuthMethods(accountProfile), [accountProfile]);
  const currentPlan = readString(
    (billingSummary?.subscription && typeof billingSummary.subscription === 'object'
      ? (billingSummary.subscription as Record<string, unknown>).label
      : null)
    ?? (accountProfile?.current_workspace_entitlements && typeof accountProfile.current_workspace_entitlements === 'object'
      ? (accountProfile.current_workspace_entitlements as Record<string, unknown>).label
      : null),
    bootstrap.entitlements.label,
  );
  const activeModelPath = useMemo(
    () => deriveActiveModelPath(providerCatalog, providerProfiles, hostedCredits),
    [hostedCredits, providerCatalog, providerProfiles],
  );
  const signInMethodSummary = authMethods.length > 0
    ? authMethods.map((method) => formatAuthMethodLabel(method)).join(' · ')
    : 'Email and password';

  async function handleLogout() {
    setLogoutPending(true);
    try {
      await logout();
      window.location.replace('/login');
    } catch {
      setAccountDetailsError('Logout could not finish. Try again when ready.');
      setLogoutPending(false);
    }
  }

  return (
    <main data-workstation-surface="settings" className="app-settings-page">
      <div className="settings-workbench">
        <aside className="settings-nav" aria-label="Settings sections">
          <div className="app-settings-sidebar__header">
            <h2 className="app-settings-sidebar__title">Settings</h2>
            <p className="app-settings-sidebar__subtitle">Account, AI model, and trust controls.</p>
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
                  <p className="settings-account-card__summary">
                    Your Empyralis account owns this workspace, its credits, your connected apps, and the sign-in methods below.
                  </p>
                </div>
                <div className="settings-account-card__actions">
                  <AppButton type="button" tone="secondary" onClick={() => setSelectedSection('billing')}>
                    Manage billing
                  </AppButton>
                  <AppButton type="button" tone="ghost" disabled={logoutPending} onClick={() => void handleLogout()}>
                    {logoutPending ? 'Signing out…' : 'Log out'}
                  </AppButton>
                </div>
              </section>
              {accountDetailsError ? (
                <AppNotice tone="warning">{accountDetailsError}</AppNotice>
              ) : null}
              <AppSurfaceStatGrid className="settings-account-stat-grid">
                <AppSurfaceStat
                  label="Plan"
                  value={currentPlan}
                  hint="The active workspace plan that governs credits and launch limits."
                />
                <AppSurfaceStat
                  label="Credits status"
                  value={hostedCredits.allowed && hostedCredits.monthlyCreditCap > 0
                    ? `${formatCredits(hostedCredits.monthlyCreditsRemaining)} / ${formatCredits(hostedCredits.monthlyCreditCap)}`
                    : 'Not active'}
                  hint={hostedCredits.allowed ? hostedCredits.message : 'Add credits or connect your own AI account.'}
                />
                <AppSurfaceStat
                  label="Active AI path"
                  value={activeModelPath.value}
                  hint={activeModelPath.hint}
                />
                <AppSurfaceStat
                  label="Sign-in methods"
                  value={String(authMethods.length || 1)}
                  hint={signInMethodSummary}
                />
              </AppSurfaceStatGrid>
              <FormGrid>
                <FormReadout label="Display name" value={bootstrap.account.displayName || 'Not set yet'} />
                <FormReadout label="Email" value={bootstrap.account.email} />
                <FormReadout label="Plan" value={currentPlan} />
                <FormReadout label="Default experience" value="Sage" />
                <FormReadout label="Credits status" value={hostedCredits.allowed ? hostedCredits.message : 'Credits not active'} />
                <FormReadout label="Active AI path" value={activeModelPath.value} />
              </FormGrid>
              <AppSurfaceCard
                title="Sign-in methods"
                description="Account access stays separate from AI model providers and connected apps."
              >
                <AppSurfaceList>
                  {authMethods.length > 0 ? authMethods.map((method) => (
                    <AppSurfaceListItem
                      key={`${readString(method.provider)}:${readString(method.method_type)}:${readString(method.subject)}`}
                      title={formatAuthMethodLabel(method)}
                      subtitle={formatAuthMethodDetail(method)}
                      description={method.is_primary === true
                        ? 'This is the main account access path on this browser account.'
                        : 'Available as an additional way to access this Empyralis account.'}
                    />
                  )) : (
                    <AppSurfaceListItem
                      title="Email and password"
                      subtitle="Primary sign-in"
                      description="This account currently falls back to the Empyralis email sign-in path."
                    />
                  )}
                  <AppSurfaceListItem
                    title="Google sign-in"
                    subtitle={authProviders.google?.enabled === true ? 'Available for this workspace' : 'Not enabled for this workspace'}
                    description="Google is the fastest sign-in path when this workspace has it enabled."
                  />
                  <AppSurfaceListItem
                    title="Apple sign-in"
                    subtitle={authProviders.apple?.enabled === true ? 'Available for this workspace' : 'Coming soon on web'}
                    description="Apple will appear here as a real method once the web sign-in path is enabled."
                  />
                </AppSurfaceList>
              </AppSurfaceCard>
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
                  value={preferredComputerLabel}
                />
                <FormReadout
                  label="Connected computer"
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
                    <strong className="settings-detail-card__title">Connected computer boundary</strong>
                  </div>
                  <p className="settings-detail-card__body">
                    Local files, browser, clipboard, screenshots, and terminal require an online connected computer with trusted device access.
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
                    User-provided AI credentials stay private to this workspace, and model choice should only change the reasoning model.
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
          {selectedSection === 'transparency' ? (
            <section className="app-settings-main__body">
              <div className="settings-cards">
                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">Visibility mode</strong>
                  </div>
                  <p className="settings-detail-card__body" style={{ fontSize: 13, color: 'var(--color-muted, #6b7280)', marginBottom: 12 }}>
                    Controls how much activity detail appears during agent turns.
                    Customer-facing agents are limited to Quiet or Basic.
                  </p>
                  <FormGrid>
                    {[
                      { key: 'sage_mode', label: 'Sage (chat)', stored: 'sageMode' },
                      { key: 'studio_test_mode', label: 'Studio test', stored: 'studioTestMode' },
                      { key: 'default_mode', label: 'Default', stored: 'defaultMode' },
                    ].map(({ label, stored }) => (
                      <TransparencyModeSelect key={stored} label={label} value={stored} />
                    ))}
                  </FormGrid>
                </article>

                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">Customer-facing mode</strong>
                  </div>
                  <p className="settings-detail-card__body" style={{ fontSize: 13, color: 'var(--color-muted, #6b7280)', marginBottom: 12 }}>
                    Customer-facing Studio agents can only use Quiet or Basic mode.
                    They never see internal memory, policy details, or tool arguments.
                  </p>
                  <select
                    value="minimal"
                    onChange={() => {}}
                    style={{
                      padding: '4px 8px', fontSize: 13, borderRadius: 6,
                      border: '1px solid var(--color-border, #e5e7eb)',
                      background: 'var(--color-bg, #fff)', color: 'var(--color-fg, #111)',
                    }}
                  >
                    <option value="off">Quiet — final answer only</option>
                    <option value="minimal">Basic — simple status indicators</option>
                  </select>
                </article>

                <article className="settings-detail-card">
                  <div className="settings-detail-card__header">
                    <strong className="settings-detail-card__title">What to show</strong>
                  </div>
                  <p className="settings-detail-card__body" style={{ fontSize: 13, color: 'var(--color-muted, #6b7280)', marginBottom: 12 }}>
                    Fine-grained controls for what appears in activity timelines.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { key: 'traceIds', label: 'Show trace IDs' },
                      { key: 'toolNames', label: 'Show tool names' },
                      { key: 'policyBlocks', label: 'Show policy blocks' },
                      { key: 'sources', label: 'Show sources' },
                    ].map(({ key, label }) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" defaultChecked={true} disabled />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </article>

                <p style={{ fontSize: 11, color: 'var(--color-muted-faint, #9ca3af)', marginTop: 12 }}>
                  Transparency settings are stored per-workspace. Settings persist for the session duration.
                  Full persistence across restarts will be available in a future update.
                </p>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
