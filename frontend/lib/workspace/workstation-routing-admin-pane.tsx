'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  DataBadge,
  DataTable,
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableRow,
} from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSelect,
} from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

function readItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function asToken(value: unknown, fallback = 'unknown'): string {
  const token = String(value ?? '').trim();
  return token || fallback;
}

function runtimeTone(target: Record<string, unknown>): 'success' | 'warning' | 'neutral' {
  if (Boolean(target.online) && Boolean(target.preferred)) {
    return 'success';
  }
  if (!Boolean(target.online)) {
    return 'warning';
  }
  return 'neutral';
}

type RoutingAdminDefaultsState = {
  runtimeTarget: string;
  billingPlan: string;
  privacyPolicyUrl: string;
  publicStartCtaLabel: string;
  publicStartCtaUrl: string;
  contextBudgetPreset: string;
  retentionPreset: string;
  healthSafetyEnabled: boolean;
  allowedLiveChannels: string;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readTokens(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
    : [];
}

function buildAdminDefaultsState(payload: Record<string, unknown> | null): RoutingAdminDefaultsState {
  const defaults = readRecord(payload?.admin_defaults);
  return {
    runtimeTarget: readString(defaults.runtime_target, 'cloud'),
    billingPlan: readString(defaults.billing_plan, 'free'),
    privacyPolicyUrl: readString(defaults.privacy_policy_url),
    publicStartCtaLabel: readString(defaults.public_start_cta_label),
    publicStartCtaUrl: readString(defaults.public_start_cta_url),
    contextBudgetPreset: readString(defaults.context_budget_preset, 'balanced'),
    retentionPreset: readString(defaults.retention_preset, 'standard'),
    healthSafetyEnabled: defaults.health_safety_enabled === true,
    allowedLiveChannels: readTokens(defaults.allowed_live_channels).join(', '),
  };
}

export function WorkstationRoutingAdminPane() {
  const services = useWorkspaceServices();
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [adminDefaults, setAdminDefaults] = useState<RoutingAdminDefaultsState>(() => buildAdminDefaultsState(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadRouting = async () => {
    const response = await services.client.getWorkspaceRouting();
    setPayload(response);
    setAdminDefaults(buildAdminDefaultsState(response));
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void loadRouting()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Routing state is unavailable.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const runtime = payload && typeof payload.runtime === 'object'
    ? payload.runtime as Record<string, unknown>
    : {};
  const shellHints = payload && typeof payload.shellHints === 'object'
    ? payload.shellHints as Record<string, unknown>
    : {};
  const channelOperations = payload && typeof payload.channelOperations === 'object'
    ? payload.channelOperations as Record<string, unknown>
    : {};
  const workspace = payload && typeof payload.workspace === 'object'
    ? payload.workspace as Record<string, unknown>
    : {};
  const runtimeTargets = useMemo(() => readItems(runtime.runtimeTargets), [runtime.runtimeTargets]);

  return (
    <div data-workstation-surface="admin/routing">
      <ListDetailShell
        title="Routing and runtime"
        subtitle="Inspect the runtime targets, shell defaults, and channel delivery posture currently bound to this workspace."
        actions={(
          <div className="app-inline-actions">
            <AppButton
              type="button"
              tone="secondary"
              disabled={isLoading || isSaving}
              onClick={() => {
                setStatus(null);
                setError(null);
                setIsLoading(true);
                void loadRouting()
                  .then(() => {
                    setStatus('Routing state refreshed.');
                  })
                  .catch((loadError) => {
                    setError(loadError instanceof Error ? loadError.message : 'Routing state is unavailable.');
                  })
                  .finally(() => {
                    setIsLoading(false);
                  });
              }}
            >
              Refresh
            </AppButton>
            <AppButton
              type="button"
              tone="primary"
              disabled={isLoading || isSaving}
              onClick={() => {
                setStatus(null);
                setError(null);
                setIsSaving(true);
                void services.client.updateWorkspaceRouting({
                  adminDefaults: {
                    runtime_target: adminDefaults.runtimeTarget,
                    billing_plan: adminDefaults.billingPlan,
                    privacy_policy_url: adminDefaults.privacyPolicyUrl.trim() || null,
                    public_start_cta_label: adminDefaults.publicStartCtaLabel.trim() || null,
                    public_start_cta_url: adminDefaults.publicStartCtaUrl.trim() || null,
                    context_budget_preset: adminDefaults.contextBudgetPreset,
                    retention_preset: adminDefaults.retentionPreset,
                    health_safety_enabled: adminDefaults.healthSafetyEnabled,
                    allowed_live_channels: adminDefaults.allowedLiveChannels
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  },
                })
                  .then((nextPayload) => {
                    const normalized = (nextPayload ?? {}) as Record<string, unknown>;
                    setPayload(normalized);
                    setAdminDefaults(buildAdminDefaultsState(normalized));
                    setStatus('Routing defaults saved.');
                  })
                  .catch((saveError) => {
                    setError(saveError instanceof Error ? saveError.message : 'Routing defaults could not be updated.');
                  })
                  .finally(() => {
                    setIsSaving(false);
                  });
              }}
            >
              Save defaults
            </AppButton>
          </div>
        )}
      >
        {status ? <StateBanner tone="success" title="Updated" detail={status} /> : null}
        {error ? <StateBanner tone="danger" title="Routing load failed" detail={error} /> : null}

        <ListDetailColumns
          primary={(
            <div className="app-stack-4">
              <ListDetailPanel
                eyebrow="Targets"
                title="Runtime targets"
                subtitle="Targets exposed to the current workspace execution contract."
              >
                {isLoading ? (
                  <div className="app-stack-3">
                    <SkeletonBlock height="3.2rem" />
                    <SkeletonBlock height="3.2rem" />
                    <SkeletonBlock height="3.2rem" />
                  </div>
                ) : runtimeTargets.length === 0 ? (
                  <EmptyPanel
                    title="No runtime targets"
                    body="No target currently satisfies the workspace runtime contract."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 1.5fr) minmax(9rem, 1fr) minmax(9rem, 0.8fr)">
                      <DataTableHeaderCell>Target</DataTableHeaderCell>
                      <DataTableHeaderCell>Status</DataTableHeaderCell>
                      <DataTableHeaderCell>Preference</DataTableHeaderCell>
                    </DataTableHeader>
                    {runtimeTargets.map((target, index) => {
                      const targetId = asToken(target.id, `target-${index}`);
                      return (
                        <DataTableRow
                          key={targetId}
                          columns="minmax(0, 1.5fr) minmax(9rem, 1fr) minmax(9rem, 0.8fr)"
                        >
                          <DataTableCell
                            primary={String(target.label ?? targetId)}
                            secondary={String(target.kind ?? 'runtime')}
                            meta={targetId}
                          />
                          <DataTableCell
                            primary={(
                              <DataBadge tone={runtimeTone(target)}>
                                {Boolean(target.online) ? 'online' : 'offline'}
                              </DataBadge>
                            )}
                            secondary={Boolean(target.online) ? 'Ready to receive work' : 'Unavailable for execution'}
                          />
                          <DataTableCell
                            primary={Boolean(target.preferred) ? 'Preferred' : 'Available'}
                            secondary={Boolean(target.preferred) ? 'Primary route for this workspace' : 'Fallback capacity'}
                          />
                        </DataTableRow>
                      );
                    })}
                  </DataTable>
                )}
              </ListDetailPanel>

              <ListDetailPanel
                eyebrow="Channel delivery"
                title="Operational routing summary"
                subtitle="Delivery backlog and pairing failure signals pulled from the workspace channel operations payload."
              >
                {isLoading ? (
                  <SkeletonBlock height="6rem" />
                ) : (
                  <FormGrid columns="repeat(2, minmax(0, 1fr))">
                    <FormReadout
                      label="Pending delivery"
                      value={String((((channelOperations.delivery as Record<string, unknown>)?.workspace_summary as Record<string, unknown>)?.pending_count) ?? 0)}
                    />
                    <FormReadout
                      label="Pairing failures"
                      value={String(readItems((channelOperations.events as Record<string, unknown>)?.pairing_failures).length)}
                    />
                    <FormReadout
                      label="Default route"
                      value={String(shellHints.defaultRoute ?? '/w/.../chat')}
                    />
                    <FormReadout
                      label="Bootstrap mode"
                      value={String(runtime.deploymentMode ?? 'unknown')}
                    />
                  </FormGrid>
                )}
              </ListDetailPanel>
            </div>
          )}
          secondary={(
            <div className="app-stack-4">
              <ListDetailPanel
                eyebrow="Workspace"
                title="Admin defaults"
                subtitle="Edit the runtime, privacy, memory, and rollout defaults that owners inherit when they create or operate deployments."
              >
                {isLoading ? (
                  <div className="app-stack-3">
                    <SkeletonBlock height="2.8rem" />
                    <SkeletonBlock height="2.8rem" />
                    <SkeletonBlock height="2.8rem" />
                  </div>
                ) : (
                  <div className="app-stack-4">
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormField label="Default runtime target" hint="Applied to new deployments unless an owner overrides it explicitly.">
                        <FormSelect
                          value={adminDefaults.runtimeTarget}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, runtimeTarget: event.currentTarget.value }))}
                        >
                          <option value="cloud">Cloud</option>
                          <option value="local">Local</option>
                          <option value="device">Privileged device</option>
                        </FormSelect>
                      </FormField>
                      <FormField label="Default billing plan" hint="Starting billing posture for new deployed agents in this workspace.">
                        <FormSelect
                          value={adminDefaults.billingPlan}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, billingPlan: event.currentTarget.value }))}
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="team">Team</option>
                          <option value="enterprise">Enterprise</option>
                        </FormSelect>
                      </FormField>
                      <FormField label="Default health safety" hint="Workspace default for new deployment safety mode.">
                        <FormSelect
                          value={adminDefaults.healthSafetyEnabled ? 'enabled' : 'disabled'}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, healthSafetyEnabled: event.currentTarget.value === 'enabled' }))}
                        >
                          <option value="disabled">Disabled</option>
                          <option value="enabled">Enabled</option>
                        </FormSelect>
                      </FormField>
                    </FormGrid>
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormField label="Privacy policy URL" hint="Used by public privacy replies when the deployment does not override the URL directly.">
                        <FormInput
                          value={adminDefaults.privacyPolicyUrl}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, privacyPolicyUrl: event.currentTarget.value }))}
                          placeholder="https://app.empyralist.com/privacy"
                        />
                      </FormField>
                      <FormField label="Public start CTA label" hint="Workspace default for the public acquisition CTA label.">
                        <FormInput
                          value={adminDefaults.publicStartCtaLabel}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, publicStartCtaLabel: event.currentTarget.value }))}
                          placeholder="Continue on Empyralist"
                        />
                      </FormField>
                      <FormField label="Public start CTA URL" hint="Workspace default destination for the public acquisition CTA.">
                        <FormInput
                          value={adminDefaults.publicStartCtaUrl}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, publicStartCtaUrl: event.currentTarget.value }))}
                          placeholder="https://app.empyralist.com/signup"
                        />
                      </FormField>
                    </FormGrid>
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormField label="Default context budget" hint="Initial deployed-agent memory depth preset.">
                        <FormSelect
                          value={adminDefaults.contextBudgetPreset}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, contextBudgetPreset: event.currentTarget.value }))}
                        >
                          <option value="compact">Compact</option>
                          <option value="balanced">Balanced</option>
                          <option value="deep">Deep</option>
                        </FormSelect>
                      </FormField>
                      <FormField label="Default retention preset" hint="Initial retention posture for customer conversation memory.">
                        <FormSelect
                          value={adminDefaults.retentionPreset}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, retentionPreset: event.currentTarget.value }))}
                        >
                          <option value="short">Short</option>
                          <option value="standard">Standard</option>
                          <option value="extended">Extended</option>
                        </FormSelect>
                      </FormField>
                      <FormField label="Allowed live channels" hint="Comma-separated allowlist for channels this workspace may put live.">
                        <FormInput
                          value={adminDefaults.allowedLiveChannels}
                          onChange={(event) => setAdminDefaults((current) => ({ ...current, allowedLiveChannels: event.currentTarget.value }))}
                          placeholder="telegram"
                        />
                      </FormField>
                    </FormGrid>
                    <FormGrid columns="1fr">
                      <FormReadout label="Workspace" value={String(workspace.label ?? workspace.id ?? 'Workspace')} />
                      <FormReadout label="Workspace kind" value={String(workspace.kind ?? 'personal')} />
                      <FormReadout label="Default route" value={String(shellHints.defaultRoute ?? '/chat')} />
                      <FormReadout label="Preferred profile" value={String(shellHints.preferredShellProfileId ?? 'Unset')} />
                    </FormGrid>
                  </div>
                )}
              </ListDetailPanel>
            </div>
          )}
        />
      </ListDetailShell>
    </div>
  );
}
