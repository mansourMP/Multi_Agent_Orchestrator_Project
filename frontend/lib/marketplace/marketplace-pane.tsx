'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type { MarketplacePackageRecord } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

const KIND_FILTERS = ['all', 'app', 'provider'] as const;
const COMPOSER_KINDS = ['app', 'provider'] as const;
const VERIFICATION_OPTIONS = ['unverified', 'partner', 'verified'] as const;
const REVIEW_OPTIONS = ['pending', 'approved', 'restricted'] as const;
const HEALTH_OPTIONS = ['setup_required', 'healthy', 'degraded'] as const;
const POLICY_OPTIONS = ['governed', 'restricted'] as const;
const MONETIZATION_OPTIONS = ['free', 'metered', 'subscription', 'revenue_share'] as const;

type KindFilter = typeof KIND_FILTERS[number];
type ComposerKind = typeof COMPOSER_KINDS[number];

type BaseComposerDraft = {
  label: string;
  description: string;
  category: string;
  publisherLabel: string;
  publisherWebsite: string;
  docsUrl: string;
  verificationStatus: string;
  reviewState: string;
  healthState: string;
  policyPosture: string;
  monetizationKind: string;
  revenueShareBps: string;
  billingProductId: string;
  settlementProvider: string;
  ledgerKey: string;
  hookKind: string;
  approvalRequired: boolean;
};

type AppComposerDraft = BaseComposerDraft & {
  appId: string;
  hostedUrl: string;
  version: string;
  latestVersion: string;
  releaseChannel: string;
  permissions: string;
  allowedOrigins: string;
  bridgeContracts: string;
};

type ProviderComposerDraft = BaseComposerDraft & {
  providerId: string;
  defaultModel: string;
  authModes: string;
  privacyPosture: string;
  jurisdiction: string;
  residency: string;
  enterpriseRiskNote: string;
  capabilityLabels: string;
  models: string;
};

type MarketplaceCardView = {
  id: string;
  kind: string;
  name: string;
  description: string;
  category: string;
  verificationStatus: string;
  reviewState: string;
  healthState: string;
  policyPosture: string;
  installed: boolean;
  approvalRequired: boolean;
  monetizationKind: string;
  installCount: number | null;
  runtimeEventCount: number | null;
  docsHref: string;
  openHref: string;
  publisherLabel: string;
  runtimeSurface: string;
  item: MarketplacePackageRecord;
};

const DEFAULT_APP_DRAFT: AppComposerDraft = {
  label: '',
  description: '',
  category: 'Applications',
  publisherLabel: '',
  publisherWebsite: '',
  docsUrl: '',
  verificationStatus: 'unverified',
  reviewState: 'pending',
  healthState: 'setup_required',
  policyPosture: 'governed',
  monetizationKind: 'free',
  revenueShareBps: '',
  billingProductId: '',
  settlementProvider: '',
  ledgerKey: '',
  hookKind: 'distribution_install',
  approvalRequired: false,
  appId: '',
  hostedUrl: '',
  version: '1.0.0',
  latestVersion: '',
  releaseChannel: 'stable',
  permissions: '',
  allowedOrigins: '',
  bridgeContracts: '',
};

const DEFAULT_PROVIDER_DRAFT: ProviderComposerDraft = {
  label: '',
  description: '',
  category: 'Models',
  publisherLabel: '',
  publisherWebsite: '',
  docsUrl: '',
  verificationStatus: 'unverified',
  reviewState: 'pending',
  healthState: 'setup_required',
  policyPosture: 'governed',
  monetizationKind: 'free',
  revenueShareBps: '',
  billingProductId: '',
  settlementProvider: '',
  ledgerKey: '',
  hookKind: 'distribution_install',
  approvalRequired: false,
  providerId: '',
  defaultModel: '',
  authModes: 'api_key',
  privacyPosture: '',
  jurisdiction: '',
  residency: '',
  enterpriseRiskNote: '',
  capabilityLabels: '',
  models: '',
};

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

function humanizeToken(value: string): string {
  if (!value) {
    return 'Unknown';
  }
  return value
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeMarketplacePackages(payload: unknown): MarketplacePackageRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is MarketplacePackageRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function splitCsvTokens(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferOrigin(urlValue: string): string[] {
  const trimmed = urlValue.trim();
  if (!trimmed) {
    return [];
  }
  try {
    return [new URL(trimmed).origin];
  } catch {
    return [];
  }
}

function parseBridgeContractsInput(value: string): Record<string, string[]> {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string[]>>((contracts, line) => {
      const [kindPart, typesPart] = line.split(':');
      const kind = readString(kindPart).toLowerCase();
      const types = splitCsvTokens(typesPart || '').map((item) => item.toLowerCase());
      if (kind && types.length) {
        contracts[kind] = types;
      }
      return contracts;
    }, {});
}

function parseProviderModelLines(value: string, defaultModel: string): Record<string, unknown>[] {
  type ProviderModelDraft = {
    id: string;
    label: string;
  };
  const parsed = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [idPart, labelPart] = line.split('|').map((part) => part.trim());
      const id = readString(idPart);
      if (!id) {
        return null;
      }
      return {
        id,
        label: readString(labelPart, humanizeToken(id)),
      };
    })
    .filter((item): item is ProviderModelDraft => Boolean(item));
  if (parsed.length) {
    return parsed.map((item) => ({ ...item }));
  }
  const fallbackModel = readString(defaultModel);
  return fallbackModel ? [{ id: fallbackModel, label: humanizeToken(fallbackModel) }] : [];
}

function formatTimestamp(value: unknown): string {
  const token = readString(value);
  if (!token) {
    return 'Not recorded';
  }
  const date = new Date(token);
  if (Number.isNaN(date.getTime())) {
    return token;
  }
  return date.toLocaleString();
}

function buildMarketplaceCardView(item: MarketplacePackageRecord, index: number): MarketplaceCardView {
  const runtimeTruth = readRecord(item.runtime_truth);
  const publisher = readRecord(item.publisher);
  const onboarding = readRecord(item.onboarding);
  const billing = readRecord(item.billing);
  const analytics = readRecord(item.analytics);
  return {
    id: readString(item.package_id, `marketplace-package-${index}`),
    kind: readString(item.kind, 'package'),
    name: readString(item.label, 'Unnamed package'),
    description: readString(item.description, 'No public description has been added yet.'),
    category: readString(item.category, 'Marketplace'),
    verificationStatus: readString(item.verification_status, 'unverified'),
    reviewState: readString(item.review_state, 'pending'),
    healthState: readString(item.health_state, 'setup_required'),
    policyPosture: readString(runtimeTruth.policy_posture ?? item.policy_posture, 'governed'),
    installed: readBoolean(item.installed),
    approvalRequired: readBoolean(item.approval_required),
    monetizationKind: readString(billing.monetization_kind, 'free'),
    installCount: readNumber(analytics.install_count),
    runtimeEventCount: readNumber(analytics.runtime_event_count),
    docsHref: readString(onboarding.docs_url) || readString(publisher.docs_url) || readString(publisher.website),
    openHref: readString(runtimeTruth.open_href),
    publisherLabel: readString(publisher.label, 'Unknown publisher'),
    runtimeSurface: readString(runtimeTruth.surface, 'distribution'),
    item,
  };
}

function MarketplaceSkeleton() {
  return (
    <div className="marketplace-pane__grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <article key={`marketplace-skeleton-${index}`} className="marketplace-pane__card">
          <div className="marketplace-pane__card-copy">
            <div className="marketplace-pane__meta-row">
              <SkeletonBlock height="1.4rem" width="5rem" />
              <SkeletonBlock height="1.4rem" width="6rem" />
            </div>
            <SkeletonBlock height="1.25rem" width="10rem" />
            <SkeletonBlock height="3.5rem" />
            <div className="marketplace-pane__status-row">
              <SkeletonBlock height="1.25rem" width="5rem" />
              <SkeletonBlock height="1.25rem" width="4.5rem" />
              <SkeletonBlock height="1.25rem" width="4rem" />
            </div>
            <div className="marketplace-pane__stats-row">
              <SkeletonBlock height="1.15rem" width="4rem" />
              <SkeletonBlock height="1.15rem" width="6rem" />
            </div>
          </div>
          <div className="marketplace-pane__card-actions">
            <SkeletonBlock height="2.5rem" />
            <SkeletonBlock height="2.5rem" />
          </div>
        </article>
      ))}
    </div>
  );
}

function MarketplaceField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="marketplace-pane__field">
      <span className="marketplace-pane__field-label">{label}</span>
      {children}
      {hint ? <span className="marketplace-pane__field-hint">{hint}</span> : null}
    </label>
  );
}

export function MarketplacePane() {
  const router = useRouter();
  const services = useWorkspaceServices();
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [items, setItems] = useState<MarketplacePackageRecord[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installingPackageId, setInstallingPackageId] = useState<string | null>(null);
  const [composerKind, setComposerKind] = useState<ComposerKind>('app');
  const [appDraft, setAppDraft] = useState<AppComposerDraft>(DEFAULT_APP_DRAFT);
  const [providerDraft, setProviderDraft] = useState<ProviderComposerDraft>(DEFAULT_PROVIDER_DRAFT);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerStatus, setComposerStatus] = useState<string | null>(null);
  const [submittingComposer, setSubmittingComposer] = useState(false);
  const [showDeveloperRegistration, setShowDeveloperRegistration] = useState(false);
  const activeRequestControllerRef = useRef<AbortController | null>(null);

  const loadMarketplacePackages = useCallback(async (requestedKind: KindFilter) => {
    setLoading(true);
    setError(null);
    activeRequestControllerRef.current?.abort();
    const requestController = new AbortController();
    activeRequestControllerRef.current = requestController;
    try {
      const payload = await services.client.listMarketplacePackages({
        kind: requestedKind === 'all' ? null : requestedKind,
      });
      if (requestController.signal.aborted || activeRequestControllerRef.current !== requestController) {
        return [];
      }
      const nextItems = normalizeMarketplacePackages(payload);
      setItems(nextItems);
      return nextItems;
    } catch (loadError) {
      if (requestController.signal.aborted || activeRequestControllerRef.current !== requestController) {
        return [];
      }
      setError(loadError instanceof Error ? loadError.message : 'Marketplace packages could not be loaded.');
      setItems([]);
      return [];
    } finally {
      if (activeRequestControllerRef.current === requestController) {
        activeRequestControllerRef.current = null;
      }
      if (!requestController.signal.aborted) {
        setLoading(false);
      }
    }
  }, [services.client]);

  useEffect(() => {
    void loadMarketplacePackages(kindFilter);
    return () => {
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
    };
  }, [kindFilter, loadMarketplacePackages]);

  useEffect(() => {
    if (!items.length) {
      if (selectedPackageId !== null) {
        setSelectedPackageId(null);
      }
      return;
    }
    const hasSelected = items.some((item) => readString(item.package_id) === selectedPackageId);
    if (!hasSelected) {
      setSelectedPackageId(readString(items[0]?.package_id) || null);
    }
  }, [items, selectedPackageId]);

  async function handleInstall(packageId: string) {
    setInstallingPackageId(packageId);
    setError(null);
    try {
      const payload = await services.client.installMarketplacePackage({ packageId });
      const runtimeTruth = readRecord(payload?.runtime_truth);
      const openHref = readString(runtimeTruth.open_href);
      await loadMarketplacePackages(kindFilter);
      setSelectedPackageId(packageId);
      if (openHref) {
        router.push(openHref);
      }
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : 'Package install failed.');
    } finally {
      setInstallingPackageId(null);
    }
  }

  async function handleComposerSubmit() {
    setComposerError(null);
    setComposerStatus(null);
    setSubmittingComposer(true);
    try {
      if (composerKind === 'app') {
        const payload = {
          label: appDraft.label.trim(),
          description: appDraft.description.trim(),
          category: appDraft.category.trim() || 'Applications',
          publisher: {
            label: appDraft.publisherLabel.trim() || undefined,
            website: appDraft.publisherWebsite.trim() || undefined,
            docs_url: appDraft.docsUrl.trim() || undefined,
          },
          onboarding: {
            docs_url: appDraft.docsUrl.trim() || undefined,
          },
          verification_status: appDraft.verificationStatus,
          review_state: appDraft.reviewState,
          health_state: appDraft.healthState,
          policy_posture: appDraft.policyPosture,
          approval_required: appDraft.approvalRequired,
          billing: {
            monetization_kind: appDraft.monetizationKind,
            billing_product_id: appDraft.billingProductId.trim() || undefined,
            settlement_provider: appDraft.settlementProvider.trim() || undefined,
            revenue_share_bps: appDraft.revenueShareBps.trim() ? Number(appDraft.revenueShareBps.trim()) : 0,
            accounting_hook: {
              ledger_key: appDraft.ledgerKey.trim() || undefined,
              hook_kind: appDraft.hookKind.trim() || 'distribution_install',
            },
          },
          app: {
            app_id: appDraft.appId.trim(),
            hosted_url: appDraft.hostedUrl.trim(),
            version: appDraft.version.trim() || '1.0.0',
            latest_version: appDraft.latestVersion.trim() || appDraft.version.trim() || '1.0.0',
            release_channel: appDraft.releaseChannel.trim() || 'stable',
            permissions: splitCsvTokens(appDraft.permissions),
            allowed_origins: splitCsvTokens(appDraft.allowedOrigins).length
              ? splitCsvTokens(appDraft.allowedOrigins)
              : inferOrigin(appDraft.hostedUrl),
            bridge_contracts: parseBridgeContractsInput(appDraft.bridgeContracts),
          },
        };
        const response = await services.client.registerMarketplaceApp(payload);
        const packageId = readString(response?.package_id);
        if (kindFilter !== 'all' && kindFilter !== 'app') {
          setKindFilter('app');
          await loadMarketplacePackages('app');
        } else {
          await loadMarketplacePackages(kindFilter);
        }
        setSelectedPackageId(packageId || null);
        setComposerStatus('Governed app package registered. Install it into the shell when you are ready.');
        setAppDraft(DEFAULT_APP_DRAFT);
        return;
      }

      const models = parseProviderModelLines(providerDraft.models, providerDraft.defaultModel.trim());
      const fallbackModelId = readString(providerDraft.defaultModel, readString(models[0]?.id));
      const payload = {
        label: providerDraft.label.trim(),
        description: providerDraft.description.trim(),
        category: providerDraft.category.trim() || 'Models',
        publisher: {
          label: providerDraft.publisherLabel.trim() || undefined,
          website: providerDraft.publisherWebsite.trim() || undefined,
          docs_url: providerDraft.docsUrl.trim() || undefined,
        },
        onboarding: {
          docs_url: providerDraft.docsUrl.trim() || undefined,
        },
        verification_status: providerDraft.verificationStatus,
        review_state: providerDraft.reviewState,
        health_state: providerDraft.healthState,
        policy_posture: providerDraft.policyPosture,
        approval_required: providerDraft.approvalRequired,
        billing: {
          monetization_kind: providerDraft.monetizationKind,
          billing_product_id: providerDraft.billingProductId.trim() || undefined,
          settlement_provider: providerDraft.settlementProvider.trim() || undefined,
          revenue_share_bps: providerDraft.revenueShareBps.trim() ? Number(providerDraft.revenueShareBps.trim()) : 0,
          accounting_hook: {
            ledger_key: providerDraft.ledgerKey.trim() || undefined,
            hook_kind: providerDraft.hookKind.trim() || 'distribution_install',
          },
        },
        provider: {
          provider_id: providerDraft.providerId.trim(),
          default_model: fallbackModelId || undefined,
          auth_modes: splitCsvTokens(providerDraft.authModes).length
            ? splitCsvTokens(providerDraft.authModes)
            : ['api_key'],
          privacy_posture: providerDraft.privacyPosture.trim() || undefined,
          jurisdiction: providerDraft.jurisdiction.trim() || undefined,
          residency: providerDraft.residency.trim() || undefined,
          enterprise_risk_note: providerDraft.enterpriseRiskNote.trim() || undefined,
          capability_labels: splitCsvTokens(providerDraft.capabilityLabels),
          models,
        },
      };
      const response = await services.client.registerMarketplaceProvider(payload);
      const packageId = readString(response?.package_id);
      if (kindFilter !== 'all' && kindFilter !== 'provider') {
        setKindFilter('provider');
        await loadMarketplacePackages('provider');
      } else {
        await loadMarketplacePackages(kindFilter);
      }
      setSelectedPackageId(packageId || null);
      setComposerStatus('Governed provider package registered. Install it into workspace integrations when you are ready.');
      setProviderDraft(DEFAULT_PROVIDER_DRAFT);
    } catch (submitError) {
      setComposerError(submitError instanceof Error ? submitError.message : 'Marketplace registration failed.');
    } finally {
      setSubmittingComposer(false);
    }
  }

  const renderedCards = useMemo(
    () => items.map((item, index) => buildMarketplaceCardView(item, index)),
    [items],
  );

  const selectedPackage = useMemo(() => {
    const selected = renderedCards.find((item) => item.id === selectedPackageId);
    return selected || renderedCards[0] || null;
  }, [renderedCards, selectedPackageId]);

  const selectedDetails = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }
    const item = selectedPackage.item;
    const publisher = readRecord(item.publisher);
    const onboarding = readRecord(item.onboarding);
    const billing = readRecord(item.billing);
    const runtimeTruth = readRecord(item.runtime_truth);
    const analytics = readRecord(item.analytics);
    const install = readRecord(item.install);
    const packagePayload = readRecord(item.package);
    const accountingHook = readRecord(billing.accounting_hook);
    return {
      publisher,
      onboarding,
      billing,
      runtimeTruth,
      analytics,
      install,
      packagePayload,
      accountingHook,
      permissionList: readStringList(packagePayload.permissions),
      allowedOrigins: readStringList(packagePayload.allowed_origins),
      providerAuthModes: readStringList(packagePayload.auth_modes),
      providerCapabilities: readStringList(packagePayload.capability_labels),
      appBridgeContracts: Object.entries(readRecord(packagePayload.bridge_contracts)).filter(([, value]) => Array.isArray(value)),
      providerModels: Array.isArray(packagePayload.models)
        ? packagePayload.models.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        : [],
    };
  }, [selectedPackage]);

  return (
    <WorkstationSurfaceRoot surface="marketplace">
      <ListDetailShell
        className="marketplace-pane"
        title="Marketplace"
        subtitle="Review governed applications and model providers, then install them with trust, billing, and runtime truth visible up front."
      >
        <ListDetailColumns
          primary={(
            <ListDetailPanel
              className="marketplace-pane__browse-panel"
              title="Governed distribution"
              subtitle="Each package carries verification, review, billing, and runtime trust metadata before it can enter the shell."
            >
              <div className="marketplace-pane__filters">
                <div className="marketplace-pane__filter-row">
                  {KIND_FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={joinClassNames(
                        'marketplace-pane__filter-pill',
                        kindFilter === filter && 'marketplace-pane__filter-pill--active',
                      )}
                      onClick={() => setKindFilter(filter)}
                    >
                      {humanizeToken(filter)}
                    </button>
                  ))}
                </div>
                <p className="marketplace-pane__panel-copy">
                  Packages stay curated. The shell surfaces trust, billing, and runtime markers before install instead of treating external apps and providers like unmanaged plugins.
                </p>
              </div>

              {error && !loading ? (
                <div className="marketplace-pane__error">
                  <div className="marketplace-pane__error-copy">
                    <strong>Marketplace could not refresh.</strong>
                    <span>Check the connection, then retry.</span>
                  </div>
                  <AppButton type="button" tone="secondary" onClick={() => { void loadMarketplacePackages(kindFilter); }}>
                    Retry
                  </AppButton>
                </div>
              ) : null}

              {loading ? (
                <MarketplaceSkeleton />
              ) : renderedCards.length === 0 ? (
                <EmptyPanel
                  title="No governed packages are registered for this workspace yet."
                  body="Marketplace is the install and discovery surface. Developer publishing is hidden behind an explicit registration panel."
                />
              ) : (
                <div className="marketplace-pane__grid">
                  {renderedCards.map((card) => {
                    const installing = installingPackageId === card.id;
                    const primaryLabel = card.installed ? (card.kind === 'app' ? 'Open app' : 'Open setup') : 'Add to Workspace';
                    return (
                      <article
                        key={card.id}
                        className={joinClassNames(
                          'marketplace-pane__card',
                          selectedPackage?.id === card.id && 'marketplace-pane__card--selected',
                        )}
                        onClick={() => setSelectedPackageId(card.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedPackageId(card.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="marketplace-pane__card-copy">
                          <div className="marketplace-pane__meta-row">
                            <span className={joinClassNames('marketplace-pane__kind-pill', `marketplace-pane__kind-pill--${card.kind}`)}>
                              {humanizeToken(card.kind)}
                            </span>
                            <span className="marketplace-pane__category-pill">{card.category}</span>
                          </div>
                          <strong className="marketplace-pane__card-title">{card.name}</strong>
                          <p className="marketplace-pane__card-description">{card.description}</p>
                          <p className="marketplace-pane__publisher">Publisher: {card.publisherLabel}</p>
                          <div className="marketplace-pane__status-row">
                            <span className={joinClassNames('marketplace-pane__status-badge', `marketplace-pane__status-badge--${card.verificationStatus}`)}>
                              {humanizeToken(card.verificationStatus)}
                            </span>
                            <span className={joinClassNames('marketplace-pane__status-badge', `marketplace-pane__status-badge--${card.reviewState}`)}>
                              {humanizeToken(card.reviewState)}
                            </span>
                            <span className={joinClassNames('marketplace-pane__status-badge', `marketplace-pane__status-badge--${card.healthState}`)}>
                              {humanizeToken(card.healthState)}
                            </span>
                          </div>
                          <div className="marketplace-pane__stats-row">
                            <span className="marketplace-pane__stat-token">
                              Policy: {humanizeToken(card.policyPosture)}
                            </span>
                            <span className="marketplace-pane__stat-token">
                              Billing: {humanizeToken(card.monetizationKind)}
                            </span>
                            <span className="marketplace-pane__stat-token">
                              Surface: {humanizeToken(card.runtimeSurface)}
                            </span>
                            {card.approvalRequired ? (
                              <span className="marketplace-pane__stat-token">Approval required</span>
                            ) : null}
                            {card.installCount !== null ? (
                              <span className="marketplace-pane__stat-token">
                                Installs: {card.installCount}
                              </span>
                            ) : null}
                            {card.runtimeEventCount !== null ? (
                              <span className="marketplace-pane__stat-token">
                                Runtime events: {card.runtimeEventCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="marketplace-pane__card-actions">
                          {card.docsHref ? (
                            <a
                              href={card.docsHref}
                              target="_blank"
                              rel="noreferrer"
                              className="marketplace-pane__secondary-link"
                              onClick={(event) => event.stopPropagation()}
                            >
                              View docs
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="marketplace-pane__secondary-link marketplace-pane__secondary-link--disabled"
                              disabled
                            >
                              View docs
                            </button>
                          )}
                          <button
                            type="button"
                            className={joinClassNames(
                              'marketplace-pane__link-button',
                              card.installed && 'marketplace-pane__link-button--installed',
                            )}
                            disabled={installing || (!card.installed && !card.id)}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (card.installed && card.openHref) {
                                router.push(card.openHref);
                                return;
                              }
                              void handleInstall(card.id);
                            }}
                          >
                            {installing ? 'Installing…' : primaryLabel}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </ListDetailPanel>
          )}
          secondary={(
            <div className="marketplace-pane__secondary-stack">
              <ListDetailPanel
                className="marketplace-pane__detail-panel"
                eyebrow={selectedPackage ? humanizeToken(selectedPackage.kind) : 'Details'}
                title={selectedPackage?.name || 'Select a package'}
                subtitle={selectedPackage ? selectedPackage.description : 'Choose a package to inspect its governed distribution metadata.'}
              >
                {selectedPackage && selectedDetails ? (
                  <div className="marketplace-pane__detail-stack">
                    <div className="marketplace-pane__detail-hero">
                      <div className="marketplace-pane__detail-hero-copy">
                        <div className="marketplace-pane__meta-row">
                          <span className={joinClassNames('marketplace-pane__kind-pill', `marketplace-pane__kind-pill--${selectedPackage.kind}`)}>
                            {humanizeToken(selectedPackage.kind)}
                          </span>
                          <span className="marketplace-pane__category-pill">{selectedPackage.category}</span>
                          {selectedPackage.installed ? (
                            <span className="marketplace-pane__status-badge marketplace-pane__status-badge--installed">
                              Installed
                            </span>
                          ) : null}
                        </div>
                        <strong className="marketplace-pane__detail-hero-title">{selectedPackage.name}</strong>
                        <p className="marketplace-pane__detail-hero-publisher">
                          {`Published by ${readString(selectedDetails.publisher.label, selectedPackage.publisherLabel)}`}
                        </p>
                      </div>
                      <div className="marketplace-pane__detail-hero-badges">
                        <span className={joinClassNames('marketplace-pane__status-badge', `marketplace-pane__status-badge--${selectedPackage.verificationStatus}`)}>
                          {humanizeToken(selectedPackage.verificationStatus)}
                        </span>
                        <span className={joinClassNames('marketplace-pane__status-badge', `marketplace-pane__status-badge--${selectedPackage.reviewState}`)}>
                          {humanizeToken(selectedPackage.reviewState)}
                        </span>
                        <span className={joinClassNames('marketplace-pane__status-badge', `marketplace-pane__status-badge--${selectedPackage.healthState}`)}>
                          {humanizeToken(selectedPackage.healthState)}
                        </span>
                        <span className="marketplace-pane__stat-token">
                          {`Policy: ${humanizeToken(selectedPackage.policyPosture)}`}
                        </span>
                        <span className="marketplace-pane__stat-token">
                          {`Billing: ${humanizeToken(selectedPackage.monetizationKind)}`}
                        </span>
                        {selectedPackage.approvalRequired ? (
                          <span className="marketplace-pane__stat-token">Approval required</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="marketplace-pane__detail-actions">
                      {selectedPackage.docsHref ? (
                        <a
                          href={selectedPackage.docsHref}
                          target="_blank"
                          rel="noreferrer"
                          className="marketplace-pane__secondary-link"
                        >
                          Publisher docs
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className={joinClassNames(
                          'marketplace-pane__link-button',
                          selectedPackage.installed && 'marketplace-pane__link-button--installed',
                        )}
                        disabled={installingPackageId === selectedPackage.id}
                        onClick={() => {
                          if (selectedPackage.installed && selectedPackage.openHref) {
                            router.push(selectedPackage.openHref);
                            return;
                          }
                          void handleInstall(selectedPackage.id);
                        }}
                      >
                        {installingPackageId === selectedPackage.id
                          ? 'Installing…'
                          : selectedPackage.installed
                            ? (selectedPackage.kind === 'app' ? 'Open app' : 'Open setup')
                            : 'Add to Workspace'}
                      </button>
                    </div>

                    <div className="marketplace-pane__detail-group">
                      <strong className="marketplace-pane__detail-title">Trust and runtime truth</strong>
                      <div className="marketplace-pane__detail-grid">
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Verification</span>
                          <span className="marketplace-pane__detail-value">{humanizeToken(selectedPackage.verificationStatus)}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Review</span>
                          <span className="marketplace-pane__detail-value">{humanizeToken(selectedPackage.reviewState)}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Health</span>
                          <span className="marketplace-pane__detail-value">{humanizeToken(selectedPackage.healthState)}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Policy</span>
                          <span className="marketplace-pane__detail-value">{humanizeToken(selectedPackage.policyPosture)}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Install target</span>
                          <span className="marketplace-pane__detail-value">{humanizeToken(readString(selectedPackage.item.install_target, 'distribution'))}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Runtime surface</span>
                          <span className="marketplace-pane__detail-value">{humanizeToken(readString(selectedDetails.runtimeTruth.surface, 'distribution'))}</span>
                        </div>
                      </div>
                    </div>

                    <div className="marketplace-pane__detail-group">
                      <strong className="marketplace-pane__detail-title">Publisher and onboarding</strong>
                      <div className="marketplace-pane__detail-grid">
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Publisher</span>
                          <span className="marketplace-pane__detail-value">{readString(selectedDetails.publisher.label, 'Unknown publisher')}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Website</span>
                          <span className="marketplace-pane__detail-value">{readString(selectedDetails.publisher.website, 'Not provided')}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Docs</span>
                          <span className="marketplace-pane__detail-value">{readString(selectedDetails.onboarding.docs_url, 'Not provided')}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Approval gate</span>
                          <span className="marketplace-pane__detail-value">{readBoolean(selectedPackage.item.approval_required) ? 'Required' : 'Not required'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="marketplace-pane__detail-group">
                      <strong className="marketplace-pane__detail-title">Billing and accounting</strong>
                      <div className="marketplace-pane__detail-grid">
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Monetization</span>
                          <span className="marketplace-pane__detail-value">{humanizeToken(readString(selectedDetails.billing.monetization_kind, 'free'))}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Revenue share</span>
                          <span className="marketplace-pane__detail-value">
                            {readNumber(selectedDetails.billing.revenue_share_bps) !== null
                              ? `${readNumber(selectedDetails.billing.revenue_share_bps)} bps`
                              : '0 bps'}
                          </span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Billing product</span>
                          <span className="marketplace-pane__detail-value">{readString(selectedDetails.billing.billing_product_id, 'Not provided')}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Ledger hook</span>
                          <span className="marketplace-pane__detail-value">{readString(selectedDetails.accountingHook.ledger_key, 'Not provided')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="marketplace-pane__detail-group">
                      <strong className="marketplace-pane__detail-title">Install and runtime analytics</strong>
                      <div className="marketplace-pane__detail-grid">
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Install state</span>
                          <span className="marketplace-pane__detail-value">{humanizeToken(readString(selectedDetails.runtimeTruth.install_state, 'available'))}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Installs</span>
                          <span className="marketplace-pane__detail-value">{readNumber(selectedDetails.analytics.install_count) ?? 0}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Runtime events</span>
                          <span className="marketplace-pane__detail-value">{readNumber(selectedDetails.analytics.runtime_event_count) ?? 0}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Last install</span>
                          <span className="marketplace-pane__detail-value">{formatTimestamp(selectedDetails.analytics.last_install_at)}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Last runtime</span>
                          <span className="marketplace-pane__detail-value">{formatTimestamp(selectedDetails.analytics.last_runtime_at)}</span>
                        </div>
                        <div className="marketplace-pane__detail-item">
                          <span className="marketplace-pane__detail-label">Open destination</span>
                          <span className="marketplace-pane__detail-value">{readString(selectedDetails.install.open_href || selectedDetails.runtimeTruth.open_href, 'Not available')}</span>
                        </div>
                      </div>
                    </div>

                    {selectedPackage.kind === 'app' ? (
                      <div className="marketplace-pane__detail-group">
                        <strong className="marketplace-pane__detail-title">Hosted app contract</strong>
                        <div className="marketplace-pane__detail-grid">
                          <div className="marketplace-pane__detail-item">
                            <span className="marketplace-pane__detail-label">Hosted URL</span>
                            <span className="marketplace-pane__detail-value">{readString(selectedDetails.packagePayload.hosted_url, 'Not provided')}</span>
                          </div>
                          <div className="marketplace-pane__detail-item">
                            <span className="marketplace-pane__detail-label">Release</span>
                            <span className="marketplace-pane__detail-value">
                              {readString(selectedDetails.packagePayload.version, '1.0.0')} · {readString(selectedDetails.packagePayload.release_channel, 'stable')}
                            </span>
                          </div>
                        </div>
                        <div className="marketplace-pane__token-row">
                          {(selectedDetails.permissionList.length ? selectedDetails.permissionList : ['No extra permissions']).map((token) => (
                            <span key={token} className="marketplace-pane__stat-token">{humanizeToken(token)}</span>
                          ))}
                        </div>
                        <div className="marketplace-pane__token-row">
                          {(selectedDetails.allowedOrigins.length ? selectedDetails.allowedOrigins : ['No allowed origins']).map((token) => (
                            <span key={token} className="marketplace-pane__status-badge marketplace-pane__status-badge--approved">{token}</span>
                          ))}
                        </div>
                        {selectedDetails.appBridgeContracts.length ? (
                          <div className="marketplace-pane__detail-list">
                            {selectedDetails.appBridgeContracts.map(([kind, value]) => (
                              <div key={kind} className="marketplace-pane__detail-list-row">
                                <span className="marketplace-pane__detail-label">{humanizeToken(kind)}</span>
                                <span className="marketplace-pane__detail-value">{readStringList(value).map(humanizeToken).join(' · ')}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="marketplace-pane__panel-copy">No bridge contracts declared for this app package.</p>
                        )}
                      </div>
                    ) : (
                      <div className="marketplace-pane__detail-group">
                        <strong className="marketplace-pane__detail-title">Provider contract</strong>
                        <div className="marketplace-pane__detail-grid">
                          <div className="marketplace-pane__detail-item">
                            <span className="marketplace-pane__detail-label">Default model</span>
                            <span className="marketplace-pane__detail-value">{readString(selectedDetails.packagePayload.default_model, 'Not provided')}</span>
                          </div>
                          <div className="marketplace-pane__detail-item">
                            <span className="marketplace-pane__detail-label">Privacy posture</span>
                            <span className="marketplace-pane__detail-value">{readString(selectedDetails.packagePayload.privacy_posture, 'Not provided')}</span>
                          </div>
                          <div className="marketplace-pane__detail-item">
                            <span className="marketplace-pane__detail-label">Jurisdiction</span>
                            <span className="marketplace-pane__detail-value">{readString(selectedDetails.packagePayload.jurisdiction, 'Not provided')}</span>
                          </div>
                          <div className="marketplace-pane__detail-item">
                            <span className="marketplace-pane__detail-label">Residency</span>
                            <span className="marketplace-pane__detail-value">{readString(selectedDetails.packagePayload.residency, 'Not provided')}</span>
                          </div>
                        </div>
                        <div className="marketplace-pane__token-row">
                          {(selectedDetails.providerAuthModes.length ? selectedDetails.providerAuthModes : ['api_key']).map((token) => (
                            <span key={token} className="marketplace-pane__stat-token">{humanizeToken(token)}</span>
                          ))}
                        </div>
                        <div className="marketplace-pane__token-row">
                          {(selectedDetails.providerCapabilities.length ? selectedDetails.providerCapabilities : ['Marketplace provider']).map((token) => (
                            <span key={token} className="marketplace-pane__status-badge marketplace-pane__status-badge--partner">{humanizeToken(token)}</span>
                          ))}
                        </div>
                        {selectedDetails.providerModels.length ? (
                          <div className="marketplace-pane__detail-list">
                            {selectedDetails.providerModels.map((model) => (
                              <div key={readString(model.id)} className="marketplace-pane__detail-list-row">
                                <span className="marketplace-pane__detail-label">{readString(model.id, 'model')}</span>
                                <span className="marketplace-pane__detail-value">{readString(model.label, readString(model.id, 'Model'))}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="marketplace-pane__panel-copy">No model metadata has been provided for this package yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyPanel
                    title="No package selected"
                    body="Choose a package on the left to inspect its governed trust, billing, and runtime metadata."
                  />
                )}
              </ListDetailPanel>

              {showDeveloperRegistration ? (
                <ListDetailPanel
                  className="marketplace-pane__composer-panel"
                  eyebrow="Developer publishing"
                  title="Register governed package"
                  subtitle="Create a third-party provider or hosted app package. This is for operators and developers, not the normal install flow."
                  actions={(
                    <AppButton type="button" tone="secondary" onClick={() => setShowDeveloperRegistration(false)}>
                      Hide
                    </AppButton>
                  )}
                >
                <div className="marketplace-pane__composer-tabs">
                  {COMPOSER_KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={joinClassNames(
                        'marketplace-pane__composer-tab',
                        composerKind === kind && 'marketplace-pane__composer-tab--active',
                      )}
                      onClick={() => {
                        setComposerKind(kind);
                        setComposerError(null);
                        setComposerStatus(null);
                      }}
                    >
                      {humanizeToken(kind)}
                    </button>
                  ))}
                </div>

                {composerError ? (
                  <div className="marketplace-pane__error">
                    <div className="marketplace-pane__error-copy">
                      <strong>Package could not be registered.</strong>
                      <span>Review the required fields, then try again.</span>
                    </div>
                  </div>
                ) : null}
                {composerStatus ? <div className="marketplace-pane__notice">{composerStatus}</div> : null}

                {composerKind === 'app' ? (
                  <div className="marketplace-pane__form">
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Label">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.label}
                          onChange={(event) => setAppDraft((current) => ({ ...current, label: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Category">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.category}
                          onChange={(event) => setAppDraft((current) => ({ ...current, category: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <MarketplaceField label="Description">
                      <textarea
                        className="marketplace-pane__textarea"
                        value={appDraft.description}
                        onChange={(event) => setAppDraft((current) => ({ ...current, description: event.target.value }))}
                      />
                    </MarketplaceField>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Publisher label">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.publisherLabel}
                          onChange={(event) => setAppDraft((current) => ({ ...current, publisherLabel: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Publisher website">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.publisherWebsite}
                          onChange={(event) => setAppDraft((current) => ({ ...current, publisherWebsite: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Docs URL">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.docsUrl}
                          onChange={(event) => setAppDraft((current) => ({ ...current, docsUrl: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Hosted URL">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.hostedUrl}
                          onChange={(event) => setAppDraft((current) => ({ ...current, hostedUrl: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="App ID">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.appId}
                          onChange={(event) => setAppDraft((current) => ({ ...current, appId: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Version">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.version}
                          onChange={(event) => setAppDraft((current) => ({ ...current, version: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid marketplace-pane__field-grid--triple">
                      <MarketplaceField label="Verification">
                        <select
                          className="marketplace-pane__input"
                          value={appDraft.verificationStatus}
                          onChange={(event) => setAppDraft((current) => ({ ...current, verificationStatus: event.target.value }))}
                        >
                          {VERIFICATION_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                      <MarketplaceField label="Review">
                        <select
                          className="marketplace-pane__input"
                          value={appDraft.reviewState}
                          onChange={(event) => setAppDraft((current) => ({ ...current, reviewState: event.target.value }))}
                        >
                          {REVIEW_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                      <MarketplaceField label="Health">
                        <select
                          className="marketplace-pane__input"
                          value={appDraft.healthState}
                          onChange={(event) => setAppDraft((current) => ({ ...current, healthState: event.target.value }))}
                        >
                          {HEALTH_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid marketplace-pane__field-grid--triple">
                      <MarketplaceField label="Policy posture">
                        <select
                          className="marketplace-pane__input"
                          value={appDraft.policyPosture}
                          onChange={(event) => setAppDraft((current) => ({ ...current, policyPosture: event.target.value }))}
                        >
                          {POLICY_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                      <MarketplaceField label="Billing">
                        <select
                          className="marketplace-pane__input"
                          value={appDraft.monetizationKind}
                          onChange={(event) => setAppDraft((current) => ({ ...current, monetizationKind: event.target.value }))}
                        >
                          {MONETIZATION_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                      <MarketplaceField label="Approval gate">
                        <select
                          className="marketplace-pane__input"
                          value={appDraft.approvalRequired ? 'required' : 'not_required'}
                          onChange={(event) => setAppDraft((current) => ({ ...current, approvalRequired: event.target.value === 'required' }))}
                        >
                          <option value="not_required">Not required</option>
                          <option value="required">Required</option>
                        </select>
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Billing product ID">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.billingProductId}
                          onChange={(event) => setAppDraft((current) => ({ ...current, billingProductId: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Revenue share (bps)">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.revenueShareBps}
                          onChange={(event) => setAppDraft((current) => ({ ...current, revenueShareBps: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Accounting ledger key">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.ledgerKey}
                          onChange={(event) => setAppDraft((current) => ({ ...current, ledgerKey: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Accounting hook kind">
                        <input
                          className="marketplace-pane__input"
                          value={appDraft.hookKind}
                          onChange={(event) => setAppDraft((current) => ({ ...current, hookKind: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <MarketplaceField label="Permissions" hint="Comma separated. Example: app_bridge.read, app_bridge.write">
                      <input
                        className="marketplace-pane__input"
                        value={appDraft.permissions}
                        onChange={(event) => setAppDraft((current) => ({ ...current, permissions: event.target.value }))}
                      />
                    </MarketplaceField>
                    <MarketplaceField label="Allowed origins" hint="Comma separated. Leave blank to infer from the hosted URL origin.">
                      <input
                        className="marketplace-pane__input"
                        value={appDraft.allowedOrigins}
                        onChange={(event) => setAppDraft((current) => ({ ...current, allowedOrigins: event.target.value }))}
                      />
                    </MarketplaceField>
                    <MarketplaceField label="Bridge contracts" hint="One per line: app_to_sage: summary_request, search">
                      <textarea
                        className="marketplace-pane__textarea"
                        value={appDraft.bridgeContracts}
                        onChange={(event) => setAppDraft((current) => ({ ...current, bridgeContracts: event.target.value }))}
                      />
                    </MarketplaceField>
                  </div>
                ) : (
                  <div className="marketplace-pane__form">
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Label">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.label}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, label: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Category">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.category}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, category: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <MarketplaceField label="Description">
                      <textarea
                        className="marketplace-pane__textarea"
                        value={providerDraft.description}
                        onChange={(event) => setProviderDraft((current) => ({ ...current, description: event.target.value }))}
                      />
                    </MarketplaceField>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Publisher label">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.publisherLabel}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, publisherLabel: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Publisher website">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.publisherWebsite}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, publisherWebsite: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Docs URL">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.docsUrl}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, docsUrl: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Provider ID">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.providerId}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, providerId: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Default model">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.defaultModel}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, defaultModel: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Auth modes" hint="Comma separated. Example: api_key, oauth">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.authModes}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, authModes: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid marketplace-pane__field-grid--triple">
                      <MarketplaceField label="Verification">
                        <select
                          className="marketplace-pane__input"
                          value={providerDraft.verificationStatus}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, verificationStatus: event.target.value }))}
                        >
                          {VERIFICATION_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                      <MarketplaceField label="Review">
                        <select
                          className="marketplace-pane__input"
                          value={providerDraft.reviewState}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, reviewState: event.target.value }))}
                        >
                          {REVIEW_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                      <MarketplaceField label="Health">
                        <select
                          className="marketplace-pane__input"
                          value={providerDraft.healthState}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, healthState: event.target.value }))}
                        >
                          {HEALTH_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid marketplace-pane__field-grid--triple">
                      <MarketplaceField label="Policy posture">
                        <select
                          className="marketplace-pane__input"
                          value={providerDraft.policyPosture}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, policyPosture: event.target.value }))}
                        >
                          {POLICY_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                      <MarketplaceField label="Billing">
                        <select
                          className="marketplace-pane__input"
                          value={providerDraft.monetizationKind}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, monetizationKind: event.target.value }))}
                        >
                          {MONETIZATION_OPTIONS.map((option) => <option key={option} value={option}>{humanizeToken(option)}</option>)}
                        </select>
                      </MarketplaceField>
                      <MarketplaceField label="Approval gate">
                        <select
                          className="marketplace-pane__input"
                          value={providerDraft.approvalRequired ? 'required' : 'not_required'}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, approvalRequired: event.target.value === 'required' }))}
                        >
                          <option value="not_required">Not required</option>
                          <option value="required">Required</option>
                        </select>
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Billing product ID">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.billingProductId}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, billingProductId: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Revenue share (bps)">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.revenueShareBps}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, revenueShareBps: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Accounting ledger key">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.ledgerKey}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, ledgerKey: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Accounting hook kind">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.hookKind}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, hookKind: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <MarketplaceField label="Privacy posture">
                      <textarea
                        className="marketplace-pane__textarea"
                        value={providerDraft.privacyPosture}
                        onChange={(event) => setProviderDraft((current) => ({ ...current, privacyPosture: event.target.value }))}
                      />
                    </MarketplaceField>
                    <div className="marketplace-pane__field-grid">
                      <MarketplaceField label="Jurisdiction">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.jurisdiction}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, jurisdiction: event.target.value }))}
                        />
                      </MarketplaceField>
                      <MarketplaceField label="Residency">
                        <input
                          className="marketplace-pane__input"
                          value={providerDraft.residency}
                          onChange={(event) => setProviderDraft((current) => ({ ...current, residency: event.target.value }))}
                        />
                      </MarketplaceField>
                    </div>
                    <MarketplaceField label="Capability labels" hint="Comma separated. Example: reasoning, hosted api">
                      <input
                        className="marketplace-pane__input"
                        value={providerDraft.capabilityLabels}
                        onChange={(event) => setProviderDraft((current) => ({ ...current, capabilityLabels: event.target.value }))}
                      />
                    </MarketplaceField>
                    <MarketplaceField label="Model roster" hint="One per line: model_id | Label. If blank, the default model becomes the only model entry.">
                      <textarea
                        className="marketplace-pane__textarea"
                        value={providerDraft.models}
                        onChange={(event) => setProviderDraft((current) => ({ ...current, models: event.target.value }))}
                      />
                    </MarketplaceField>
                  </div>
                )}

                <div className="marketplace-pane__form-actions">
                  <AppButton
                    type="button"
                    tone="primary"
                    onClick={() => {
                      void handleComposerSubmit();
                    }}
                    disabled={submittingComposer}
                  >
                    {submittingComposer
                      ? 'Registering…'
                      : composerKind === 'app'
                        ? 'Register app package'
                        : 'Register provider package'}
                  </AppButton>
                </div>
              </ListDetailPanel>
              ) : (
                <ListDetailPanel
                  className="marketplace-pane__composer-panel marketplace-pane__composer-panel--collapsed"
                  eyebrow="Developer publishing"
                  title="Publish a package"
                  subtitle="Marketplace is for governed distribution. Create specialists in Studio; register third-party apps or providers here only when you are publishing new inventory."
                >
                  <p className="marketplace-pane__panel-copy">
                    Normal users should browse, inspect trust metadata, and add packages to the workspace. Publisher registration is intentionally hidden to keep the Marketplace simple.
                  </p>
                  <div className="marketplace-pane__form-actions">
                    <AppButton type="button" tone="secondary" onClick={() => setShowDeveloperRegistration(true)}>
                      Show developer registration
                    </AppButton>
                  </div>
                </ListDetailPanel>
              )}
            </div>
          )}
        />
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
