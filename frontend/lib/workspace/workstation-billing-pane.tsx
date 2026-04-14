'use client';

import { useEffect, useMemo, useState } from 'react';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import {
  WorkstationActionButton,
  WorkstationSurfaceCard,
  WorkstationSurfaceList,
  WorkstationSurfaceListItem,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type BillingSummaryPayload = Record<string, unknown> & {
  configured?: boolean;
  portal_available?: boolean;
  account?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  plans?: Array<Record<string, unknown>>;
};

function readText(value: unknown, fallback = 'n/a'): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

export function WorkstationBillingPane() {
  const { bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const [summary, setSummary] = useState<BillingSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [portalPending, setPortalPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void services.client.getBillingSummary()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setSummary((payload ?? null) as BillingSummaryPayload | null);
        setLoading(false);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setSummary(null);
        setError(loadError instanceof Error ? loadError.message : 'Billing summary is unavailable.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const subscription = summary && typeof summary.subscription === 'object'
    ? summary.subscription as Record<string, unknown>
    : {};
  const account = summary && typeof summary.account === 'object'
    ? summary.account as Record<string, unknown>
    : {};
  const availablePlans = useMemo(
    () => Array.isArray(summary?.plans) ? summary?.plans as Array<Record<string, unknown>> : [],
    [summary?.plans],
  );
  const limitEntries = Object.entries(bootstrap.entitlements.limits);
  const currentPlanId = readText(subscription.effective_plan_id ?? bootstrap.entitlements.plan, bootstrap.entitlements.plan);
  const currentPlanLabel = readText(subscription.label ?? bootstrap.entitlements.label, bootstrap.entitlements.label);
  const subscriptionStatus = readText(subscription.status, 'active');
  const currentPeriodEnd = readText(subscription.current_period_end, '');

  const reloadSummary = () => {
    setLoading(true);
    setError(null);
    void services.client.getBillingSummary()
      .then((payload) => {
        setSummary((payload ?? null) as BillingSummaryPayload | null);
        setLoading(false);
      })
      .catch((loadError) => {
        setSummary(null);
        setError(loadError instanceof Error ? loadError.message : 'Billing summary is unavailable.');
        setLoading(false);
      });
  };

  return (
    <WorkstationSurfaceRoot surface="admin/billing">
      {loading ? (
        <WorkstationSurfaceNotice>Loading billing summary.</WorkstationSurfaceNotice>
      ) : null}
      {error ? (
        <WorkstationSurfaceNotice tone="danger">{error}</WorkstationSurfaceNotice>
      ) : null}
      <WorkstationSurfaceStatGrid>
        <WorkstationSurfaceStat
          label="Current plan"
          value={currentPlanId}
          hint={currentPlanLabel}
        />
        <WorkstationSurfaceStat
          label="Status"
          value={subscriptionStatus}
          hint={currentPeriodEnd ? `Current period ends at ${currentPeriodEnd}.` : 'Canonical subscription status from billing state.'}
        />
        <WorkstationSurfaceStat
          label="Provider"
          value={readText(summary?.configured ? 'stripe' : 'offline', 'offline')}
          hint={summary?.configured ? 'Stripe checkout and portal are configured.' : 'Stripe is not configured for this environment.'}
        />
      </WorkstationSurfaceStatGrid>
      <WorkstationSurfaceCard
        title="Subscription"
        description="Canonical billing state for this workspace."
        actions={(
          <div className="app-inline-actions">
            <WorkstationActionButton type="button" tone="secondary" onClick={reloadSummary}>
              Refresh
            </WorkstationActionButton>
            <WorkstationActionButton
              type="button"
              tone="secondary"
              disabled={!readBoolean(summary?.portal_available) || portalPending}
              onClick={() => {
                setPortalPending(true);
                void services.client.createBillingPortalSession()
                  .then((payload) => {
                    const url = readText((payload ?? {}).portal_url, '');
                    if (url) {
                      window.location.href = url;
                      return;
                    }
                    reloadSummary();
                  })
                  .catch((requestError) => {
                    setError(requestError instanceof Error ? requestError.message : 'Billing portal is unavailable.');
                  })
                  .finally(() => {
                    setPortalPending(false);
                  });
              }}
            >
              Manage billing
            </WorkstationActionButton>
          </div>
        )}
      >
        <WorkstationSurfaceList>
          <WorkstationSurfaceListItem
            title="Billing email"
            subtitle={readText(account.billing_email, 'No billing email on file')}
            description="The billing contact currently associated with the workspace account."
          />
          <WorkstationSurfaceListItem
            title="Customer account"
            subtitle={readText(account.provider_customer_id, 'Not created yet')}
            description="The canonical billing customer identifier used for subscription and portal access."
          />
          <WorkstationSurfaceListItem
            title="Resolved plan"
            subtitle={currentPlanLabel}
            description={`Entitlements currently resolve to the ${currentPlanId} plan.`}
          />
        </WorkstationSurfaceList>
      </WorkstationSurfaceCard>
      <WorkstationSurfaceCard title="Available plans" description="Plans with configured checkout can be activated immediately.">
        {availablePlans.length === 0 ? (
          <WorkstationSurfaceNotice>No billable plans are currently configured.</WorkstationSurfaceNotice>
        ) : (
          <WorkstationSurfaceList>
            {availablePlans.map((plan) => {
              const planId = readText(plan.plan_id, 'free');
              const isCurrent = readBoolean(plan.current);
              const checkoutEnabled = readBoolean(plan.checkout_enabled);
              return (
                <WorkstationSurfaceListItem
                  key={planId}
                  title={readText(plan.label, planId)}
                  subtitle={isCurrent ? 'Current plan' : checkoutEnabled ? 'Checkout ready' : 'Unavailable in this environment'}
                  description={checkoutEnabled
                    ? 'Start a Stripe checkout session for this workspace.'
                    : planId === 'free'
                      ? 'Free is the default workspace plan and does not require checkout.'
                      : 'This plan needs a configured Stripe price before checkout can start.'}
                  actions={(
                    <WorkstationActionButton
                      type="button"
                      disabled={isCurrent || !checkoutEnabled || pendingPlanId === planId}
                      onClick={() => {
                        setPendingPlanId(planId);
                        void services.client.createBillingCheckoutSession({ planId })
                          .then((payload) => {
                            const url = readText((payload ?? {}).checkout_url, '');
                            if (url) {
                              window.location.href = url;
                              return;
                            }
                            reloadSummary();
                          })
                          .catch((requestError) => {
                            setError(requestError instanceof Error ? requestError.message : 'Checkout could not be started.');
                          })
                          .finally(() => {
                            setPendingPlanId((current) => (current === planId ? null : current));
                          });
                      }}
                    >
                      {isCurrent ? 'Current' : pendingPlanId === planId ? 'Starting…' : 'Upgrade'}
                    </WorkstationActionButton>
                  )}
                />
              );
            })}
          </WorkstationSurfaceList>
        )}
      </WorkstationSurfaceCard>
      <WorkstationSurfaceCard title="Resolved limits" description="Current workspace limits derived from the authoritative billing-backed entitlement state.">
        {limitEntries.length === 0 ? (
          <WorkstationSurfaceNotice>No explicit limit values are present for this plan.</WorkstationSurfaceNotice>
        ) : (
          <WorkstationSurfaceList>
            {limitEntries.map(([key, value]) => (
              <WorkstationSurfaceListItem
                key={key}
                title={key}
                subtitle={value === null ? 'unlimited' : String(value)}
                description="Canonical entitlement limit"
              />
            ))}
          </WorkstationSurfaceList>
        )}
      </WorkstationSurfaceCard>
    </WorkstationSurfaceRoot>
  );
}
