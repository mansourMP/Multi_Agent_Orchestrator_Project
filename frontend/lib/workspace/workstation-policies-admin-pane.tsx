'use client';

import { useEffect, useState } from 'react';

import {
  FormField,
  FormGrid,
  FormReadout,
  FormSection,
  FormSelect,
  FormTokenListEditor,
} from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { AppButton } from '@/lib/ui/primitives';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

type PolicySnapshot = {
  capabilities: {
    allow: string[];
    deny: string[];
  };
  connectors: {
    allow: string[];
    deny: string[];
  };
  dangerous_action_classes: {
    allow: string[];
    deny: string[];
  };
  trusted_owner_machine_ids: string[];
  machine_enrollment_scope: string;
};

const EMPTY_POLICY: PolicySnapshot = {
  capabilities: { allow: [], deny: [] },
  connectors: { allow: [], deny: [] },
  dangerous_action_classes: { allow: [], deny: [] },
  trusted_owner_machine_ids: [],
  machine_enrollment_scope: 'workspace',
};

export function WorkstationPoliciesAdminPane() {
  const services = useWorkspaceServices();
  const [allowCapabilities, setAllowCapabilities] = useState<string[]>([]);
  const [denyCapabilities, setDenyCapabilities] = useState<string[]>([]);
  const [allowConnectors, setAllowConnectors] = useState<string[]>([]);
  const [denyConnectors, setDenyConnectors] = useState<string[]>([]);
  const [allowDangerous, setAllowDangerous] = useState<string[]>([]);
  const [denyDangerous, setDenyDangerous] = useState<string[]>([]);
  const [trustedMachines, setTrustedMachines] = useState<string[]>([]);
  const [machineEnrollmentScope, setMachineEnrollmentScope] = useState('workspace');
  const [lastSavedPolicy, setLastSavedPolicy] = useState<PolicySnapshot>(EMPTY_POLICY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const hydratePolicy = (policy: Record<string, unknown>) => {
    const capabilities = policy && typeof policy.capabilities === 'object'
      ? policy.capabilities as Record<string, unknown>
      : {};
    const connectors = policy && typeof policy.connectors === 'object'
      ? policy.connectors as Record<string, unknown>
      : {};
    const dangerous = policy && typeof policy.dangerous_action_classes === 'object'
      ? policy.dangerous_action_classes as Record<string, unknown>
      : {};
    const snapshot: PolicySnapshot = {
      capabilities: {
        allow: Array.isArray(capabilities.allow) ? capabilities.allow.filter((item): item is string => typeof item === 'string') : [],
        deny: Array.isArray(capabilities.deny) ? capabilities.deny.filter((item): item is string => typeof item === 'string') : [],
      },
      connectors: {
        allow: Array.isArray(connectors.allow) ? connectors.allow.filter((item): item is string => typeof item === 'string') : [],
        deny: Array.isArray(connectors.deny) ? connectors.deny.filter((item): item is string => typeof item === 'string') : [],
      },
      dangerous_action_classes: {
        allow: Array.isArray(dangerous.allow) ? dangerous.allow.filter((item): item is string => typeof item === 'string') : [],
        deny: Array.isArray(dangerous.deny) ? dangerous.deny.filter((item): item is string => typeof item === 'string') : [],
      },
      trusted_owner_machine_ids: Array.isArray(policy.trusted_owner_machine_ids)
        ? policy.trusted_owner_machine_ids.filter((item): item is string => typeof item === 'string')
        : [],
      machine_enrollment_scope: String(policy.machine_enrollment_scope ?? 'workspace'),
    };
    setAllowCapabilities(snapshot.capabilities.allow);
    setDenyCapabilities(snapshot.capabilities.deny);
    setAllowConnectors(snapshot.connectors.allow);
    setDenyConnectors(snapshot.connectors.deny);
    setAllowDangerous(snapshot.dangerous_action_classes.allow);
    setDenyDangerous(snapshot.dangerous_action_classes.deny);
    setTrustedMachines(snapshot.trusted_owner_machine_ids);
    setMachineEnrollmentScope(snapshot.machine_enrollment_scope);
    setLastSavedPolicy(snapshot);
  };

  const loadPolicy = async () => {
    const payload = await services.client.getWorkspacePolicies();
    const policy = payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).policy as Record<string, unknown>
      : {};
    hydratePolicy(policy ?? {});
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void loadPolicy()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Workspace policy is unavailable.');
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

  return (
    <WorkstationSurfaceRoot surface="admin/policies">
      <ListDetailShell
        title="Workspace policy"
        subtitle="Apply the canonical workspace policy and immediately read back the server-normalized result."
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            disabled={isLoading || isSaving}
            onClick={() => {
              setStatus(null);
              setError(null);
              setIsLoading(true);
              void loadPolicy()
                .then(() => {
                  setStatus('Policy state refreshed.');
                })
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Workspace policy is unavailable.');
                })
                .finally(() => {
                  setIsLoading(false);
                });
            }}
          >
            Refresh
          </AppButton>
        )}
      >
        {status ? <StateBanner tone="success" title="Policy updated" detail={status} /> : null}
        {error ? <StateBanner tone="danger" title="Policy load failed" detail={error} /> : null}

        <ListDetailColumns
          primary={(
            <ListDetailPanel
              eyebrow="Policy"
              title="Access and enrollment controls"
              subtitle="Each save writes the policy and then reloads the canonical server representation."
            >
              {isLoading ? (
                <div className="app-stack-3">
                  <SkeletonBlock height="3rem" />
                  <SkeletonBlock height="3rem" />
                  <SkeletonBlock height="3rem" />
                  <SkeletonBlock height="3rem" />
                </div>
              ) : (
                <>
                  <FormSection
                    title="Capabilities"
                    description="Allow and deny lists for high-level workspace capabilities."
                  >
                    <FormGrid>
                      <FormField label="Capability allow" hint="Add allowed capability tokens one at a time.">
                        <FormTokenListEditor
                          value={allowCapabilities}
                          onChange={setAllowCapabilities}
                          placeholder="workspace.manage"
                          emptyLabel="No allowed capabilities."
                        />
                      </FormField>
                      <FormField label="Capability deny" hint="Explicit capability blocks.">
                        <FormTokenListEditor
                          value={denyCapabilities}
                          onChange={setDenyCapabilities}
                          placeholder="workspace.delete"
                          emptyLabel="No denied capabilities."
                        />
                      </FormField>
                    </FormGrid>
                  </FormSection>

                  <FormSection
                    title="Connectors"
                    description="Connector-level allow and deny lists for this workspace."
                  >
                    <FormGrid>
                      <FormField label="Connector allow" hint="Allowed connector identifiers.">
                        <FormTokenListEditor
                          value={allowConnectors}
                          onChange={setAllowConnectors}
                          placeholder="github"
                          emptyLabel="No allowed connectors."
                        />
                      </FormField>
                      <FormField label="Connector deny" hint="Use for explicit blocks.">
                        <FormTokenListEditor
                          value={denyConnectors}
                          onChange={setDenyConnectors}
                          placeholder="gmail"
                          emptyLabel="No denied connectors."
                        />
                      </FormField>
                    </FormGrid>
                  </FormSection>

                  <FormSection
                    title="Dangerous actions"
                    description="Class-level controls for actions that require elevated scrutiny."
                  >
                    <FormGrid>
                      <FormField label="Dangerous allow" hint="Explicit exceptions for restricted classes.">
                        <FormTokenListEditor
                          value={allowDangerous}
                          onChange={setAllowDangerous}
                          placeholder="filesystem_read"
                          emptyLabel="No dangerous-action exceptions."
                        />
                      </FormField>
                      <FormField label="Dangerous deny" hint="Blocks for dangerous action classes.">
                        <FormTokenListEditor
                          value={denyDangerous}
                          onChange={setDenyDangerous}
                          placeholder="filesystem_write"
                          emptyLabel="No denied dangerous-action classes."
                        />
                      </FormField>
                    </FormGrid>
                  </FormSection>

                  <FormSection
                    title="Enrollment"
                    description="Machine enrollment scope and owner machine trust list."
                  >
                    <FormGrid>
                      <FormField label="Machine enrollment scope" hint="Scope applied when enrolling operator machines.">
                        <FormSelect
                          value={machineEnrollmentScope}
                          onChange={(event) => setMachineEnrollmentScope(event.currentTarget.value)}
                        >
                          <option value="workspace">workspace</option>
                          <option value="tenant">tenant</option>
                          <option value="global">global</option>
                        </FormSelect>
                      </FormField>
                      <FormField label="Trusted owner machine ids" hint="Add each trusted machine identifier separately.">
                        <FormTokenListEditor
                          value={trustedMachines}
                          onChange={setTrustedMachines}
                          placeholder="machine_123"
                          emptyLabel="No trusted owner machines."
                        />
                      </FormField>
                    </FormGrid>
                  </FormSection>

                  <div className="app-inline-actions app-inline-actions--end">
                    <AppButton
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setIsSaving(true);
                        setError(null);
                        setStatus(null);
                        void services.client.updateWorkspacePolicies({
                          capabilities: {
                            allow: allowCapabilities,
                            deny: denyCapabilities,
                          },
                          connectors: {
                            allow: allowConnectors,
                            deny: denyConnectors,
                          },
                          dangerous_action_classes: {
                            allow: allowDangerous,
                            deny: denyDangerous,
                          },
                          trusted_owner_machine_ids: trustedMachines,
                          machine_enrollment_scope: machineEnrollmentScope,
                        })
                          .then(async () => {
                            await loadPolicy();
                            setStatus('Workspace policy saved and reloaded from backend truth.');
                          })
                          .catch((saveError) => {
                            setError(saveError instanceof Error ? saveError.message : 'Workspace policy update failed.');
                          })
                          .finally(() => {
                            setIsSaving(false);
                          });
                      }}
                    >
                      {isSaving ? 'Saving…' : 'Save policy'}
                    </AppButton>
                  </div>
                </>
              )}
            </ListDetailPanel>
          )}
          secondary={(
            <div className="app-stack-4">
              <ListDetailPanel
                eyebrow="Server truth"
                title="Canonical snapshot"
                subtitle="These values reflect the most recent server-normalized policy state."
              >
                {isLoading ? (
                  <div className="app-stack-3">
                    <SkeletonBlock height="2.8rem" />
                    <SkeletonBlock height="2.8rem" />
                    <SkeletonBlock height="2.8rem" />
                  </div>
                ) : (
                  <FormGrid columns="1fr">
                    <FormReadout label="Capability allow" value={lastSavedPolicy.capabilities.allow.join(', ') || 'None'} />
                    <FormReadout label="Capability deny" value={lastSavedPolicy.capabilities.deny.join(', ') || 'None'} />
                    <FormReadout label="Connector allow" value={lastSavedPolicy.connectors.allow.join(', ') || 'None'} />
                    <FormReadout label="Connector deny" value={lastSavedPolicy.connectors.deny.join(', ') || 'None'} />
                    <FormReadout label="Dangerous allow" value={lastSavedPolicy.dangerous_action_classes.allow.join(', ') || 'None'} />
                    <FormReadout label="Dangerous deny" value={lastSavedPolicy.dangerous_action_classes.deny.join(', ') || 'None'} />
                    <FormReadout label="Trusted owner machines" value={lastSavedPolicy.trusted_owner_machine_ids.join(', ') || 'None'} />
                    <FormReadout label="Enrollment scope" value={lastSavedPolicy.machine_enrollment_scope} />
                  </FormGrid>
                )}
              </ListDetailPanel>
            </div>
          )}
        />
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
