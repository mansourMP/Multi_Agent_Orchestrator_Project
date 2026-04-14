'use client';

import { useEffect, useState } from 'react';

import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSection,
  FormSelect,
} from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

function tokensToText(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim()).join(', ')
    : '';
}

function textToTokens(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

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
  const [allowCapabilities, setAllowCapabilities] = useState('');
  const [denyCapabilities, setDenyCapabilities] = useState('');
  const [allowConnectors, setAllowConnectors] = useState('');
  const [denyConnectors, setDenyConnectors] = useState('');
  const [allowDangerous, setAllowDangerous] = useState('');
  const [denyDangerous, setDenyDangerous] = useState('');
  const [trustedMachines, setTrustedMachines] = useState('');
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
    setAllowCapabilities(tokensToText(snapshot.capabilities.allow));
    setDenyCapabilities(tokensToText(snapshot.capabilities.deny));
    setAllowConnectors(tokensToText(snapshot.connectors.allow));
    setDenyConnectors(tokensToText(snapshot.connectors.deny));
    setAllowDangerous(tokensToText(snapshot.dangerous_action_classes.allow));
    setDenyDangerous(tokensToText(snapshot.dangerous_action_classes.deny));
    setTrustedMachines(tokensToText(snapshot.trusted_owner_machine_ids));
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
    <div data-workstation-surface="admin/policies">
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
                <div style={{ display: 'grid', gap: '0.6rem' }}>
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
                      <FormField label="Capability allow" hint="Comma separated tokens.">
                        <FormInput value={allowCapabilities} onChange={(event) => setAllowCapabilities(event.currentTarget.value)} />
                      </FormField>
                      <FormField label="Capability deny" hint="Explicit capability blocks.">
                        <FormInput value={denyCapabilities} onChange={(event) => setDenyCapabilities(event.currentTarget.value)} />
                      </FormField>
                    </FormGrid>
                  </FormSection>

                  <FormSection
                    title="Connectors"
                    description="Connector-level allow and deny lists for this workspace."
                  >
                    <FormGrid>
                      <FormField label="Connector allow" hint="Comma separated connector identifiers.">
                        <FormInput value={allowConnectors} onChange={(event) => setAllowConnectors(event.currentTarget.value)} />
                      </FormField>
                      <FormField label="Connector deny" hint="Use for explicit blocks.">
                        <FormInput value={denyConnectors} onChange={(event) => setDenyConnectors(event.currentTarget.value)} />
                      </FormField>
                    </FormGrid>
                  </FormSection>

                  <FormSection
                    title="Dangerous actions"
                    description="Class-level controls for actions that require elevated scrutiny."
                  >
                    <FormGrid>
                      <FormField label="Dangerous allow" hint="Explicit exceptions for restricted classes.">
                        <FormInput value={allowDangerous} onChange={(event) => setAllowDangerous(event.currentTarget.value)} />
                      </FormField>
                      <FormField label="Dangerous deny" hint="Blocks for dangerous action classes.">
                        <FormInput value={denyDangerous} onChange={(event) => setDenyDangerous(event.currentTarget.value)} />
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
                      <FormField label="Trusted owner machine ids" hint="Comma separated machine identifiers.">
                        <FormInput value={trustedMachines} onChange={(event) => setTrustedMachines(event.currentTarget.value)} />
                      </FormField>
                    </FormGrid>
                  </FormSection>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <AppButton
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setIsSaving(true);
                        setError(null);
                        setStatus(null);
                        void services.client.updateWorkspacePolicies({
                          capabilities: {
                            allow: textToTokens(allowCapabilities),
                            deny: textToTokens(denyCapabilities),
                          },
                          connectors: {
                            allow: textToTokens(allowConnectors),
                            deny: textToTokens(denyConnectors),
                          },
                          dangerous_action_classes: {
                            allow: textToTokens(allowDangerous),
                            deny: textToTokens(denyDangerous),
                          },
                          trusted_owner_machine_ids: textToTokens(trustedMachines),
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
            <div style={{ display: 'grid', gap: '1rem' }}>
              <ListDetailPanel
                eyebrow="Server truth"
                title="Canonical snapshot"
                subtitle="These values reflect the most recent server-normalized policy state."
              >
                {isLoading ? (
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
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
    </div>
  );
}
