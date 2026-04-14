'use client';

import { useEffect, useMemo, useState } from 'react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { DataBadge, DataTable, DataTableCell, DataTableHeader, DataTableHeaderCell, DataTableRow } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { FormField, FormGrid, FormReadout, FormTextarea } from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { ModalSection } from '@/lib/ui/modal';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type AgentRecord = Record<string, unknown>;

function normalizeItems(payload: unknown): AgentRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is AgentRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readCombinedError(results: PromiseSettledResult<unknown>[]): string | null {
  const messages = results.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [];
    }
    return [result.reason instanceof Error ? result.reason.message : 'Agent inventory is unavailable.'];
  });
  return messages.length > 0 ? messages.join(' ') : null;
}

function agentTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'active' || status === 'ready') {
    return 'success';
  }
  if (status === 'running') {
    return 'accent';
  }
  if (status === 'offline' || status === 'disabled') {
    return 'warning';
  }
  if (status === 'error' || status === 'failed') {
    return 'danger';
  }
  return 'neutral';
}

function AgentsSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <div className="app-stack-4">
          <ListDetailPanel eyebrow="Installed" title="Loading installed agents">
            <SkeletonBlock height="2.8rem" />
            <SkeletonBlock height="2.8rem" />
            <SkeletonBlock height="2.8rem" />
          </ListDetailPanel>
          <ListDetailPanel eyebrow="Definitions" title="Loading agent definitions">
            <SkeletonBlock height="2.8rem" />
            <SkeletonBlock height="2.8rem" />
          </ListDetailPanel>
        </div>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Selection" title="Loading agent detail">
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkstationAgentsPane() {
  const services = useWorkspaceServices();
  const [definitions, setDefinitions] = useState<AgentRecord[]>([]);
  const [installs, setInstalls] = useState<AgentRecord[]>([]);
  const [runtimeTargets, setRuntimeTargets] = useState<AgentRecord[]>([]);
  const [selectedInstallId, setSelectedInstallId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState('Status check');
  const [isRunSheetOpen, setIsRunSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningInstallId, setIsRunningInstallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const results = await Promise.allSettled([
      services.client.listAgentDefinitions(),
      services.client.listAgentInstalls(),
      services.client.listRuntimeTargets(),
    ]);
    setDefinitions(results[0].status === 'fulfilled' ? normalizeItems(results[0].value) : []);
    setInstalls(results[1].status === 'fulfilled' ? normalizeItems(results[1].value) : []);
    setRuntimeTargets(results[2].status === 'fulfilled' ? normalizeItems(results[2].value) : []);
    setError(readCombinedError(results));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true)
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Agent inventory is unavailable.');
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  useEffect(() => {
    if (installs.length === 0) {
      setSelectedInstallId(null);
      return;
    }
    if (selectedInstallId && installs.some((item) => String(item.id ?? '').trim() === selectedInstallId)) {
      return;
    }
    setSelectedInstallId(String(installs[0].id ?? '').trim() || null);
  }, [installs, selectedInstallId]);

  const selectedInstall = useMemo(
    () => installs.find((item) => String(item.id ?? '').trim() === selectedInstallId) ?? null,
    [installs, selectedInstallId],
  );

  const selectedDefinition = useMemo(() => {
    if (!selectedInstall) {
      return null;
    }
    const installName = readString(selectedInstall.name ?? selectedInstall.label, '');
    return definitions.find((item) => readString(item.name ?? item.label, '') === installName) ?? null;
  }, [definitions, selectedInstall]);

  async function runSelectedAgent() {
    const installId = String(selectedInstall?.id ?? '').trim();
    if (!installId || isRunningInstallId) {
      return;
    }
    setIsRunningInstallId(installId);
    setError(null);
    setStatus(null);
    try {
      const payload = await services.client.runInstalledAgent({
        installId,
        message: runMessage || 'Status check',
      });
      const runId = String((payload ?? {}).run_id ?? '').trim();
      setStatus(runId ? `Started agent run ${runId}.` : `Started ${readString(selectedInstall?.label ?? selectedInstall?.name, installId)}.` );
      setIsRunSheetOpen(false);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Installed agent could not be run.');
    } finally {
      setIsRunningInstallId(null);
    }
  }

  return (
    <WorkstationSurfaceRoot surface="agents">
      <ListDetailShell
        title="Agents"
        subtitle="Installed runtime agents, visible definitions, and execution targets managed inside workstation chrome."
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              void refresh(false);
            }}
          >
            Refresh
          </AppButton>
        )}
      >
        {status ? (
          <StateBanner tone="success" title="Agent run started">
            {status}
          </StateBanner>
        ) : null}
        {error ? (
          <StateBanner
            tone="danger"
            title="Agent inventory is degraded"
            detail="One or more agent registries did not load cleanly. Any successfully loaded data remains visible below."
          >
            {error}
          </StateBanner>
        ) : null}

        {isLoading ? (
          <AgentsSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <div className="app-stack-4">
                <ListDetailPanel
                  eyebrow="Installed"
                  title="Installed agents"
                  subtitle={`${installs.length} workspace-scoped agents currently ready for execution.`}
                >
                  {installs.length === 0 ? (
                    <EmptyPanel
                      title="No installed agents"
                      body="Installed agents will appear here when the workspace runtime exposes runnable agent modules."
                    />
                  ) : (
                    <DataTable>
                      <DataTableHeader columns="minmax(0, 1.1fr) minmax(0, 0.7fr) auto">
                        <DataTableHeaderCell>Agent</DataTableHeaderCell>
                        <DataTableHeaderCell>Status</DataTableHeaderCell>
                        <DataTableHeaderCell align="end">Focus</DataTableHeaderCell>
                      </DataTableHeader>
                      {installs.map((item, index) => {
                        const installId = String(item.id ?? `install-${index}`);
                        const selected = installId === selectedInstallId;
                        return (
                          <DataTableRow
                            key={installId}
                            columns="minmax(0, 1.1fr) minmax(0, 0.7fr) auto"
                            selected={selected}
                            onClick={() => setSelectedInstallId(installId)}
                          >
                            <DataTableCell
                              primary={readString(item.label ?? item.name, installId)}
                              secondary={readString(item.description ?? item.agent_kind, 'Installed workspace agent')}
                            />
                            <DataTableCell primary={<DataBadge tone={agentTone(item.status)}>{readString(item.status, 'active')}</DataBadge>} />
                            <DataTableCell
                              align="end"
                              primary={selected ? <DataBadge tone="accent">Selected</DataBadge> : <span className="app-data-table__hint">Inspect</span>}
                            />
                          </DataTableRow>
                        );
                      })}
                    </DataTable>
                  )}
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Definitions"
                  title="Visible agent definitions"
                  subtitle={`${definitions.length} definitions currently visible to the workspace.`}
                >
                  {definitions.length === 0 ? (
                    <EmptyPanel
                      title="No definitions available"
                      body="Agent definitions will appear here once the workspace registry exposes them."
                    />
                  ) : (
                    <div className="app-stack-3">
                      {definitions.slice(0, 8).map((item, index) => (
                        <div
                          key={String(item.id ?? `definition-${index}`)}
                          className="app-card-button"
                        >
                          <strong className="app-card-button__title">{readString(item.name ?? item.slug ?? item.id, 'Definition')}</strong>
                          <span className="app-card-button__subtitle">
                            {readString(item.description, 'No definition description is available.')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ListDetailPanel>
              </div>
            )}
            secondary={(
              <div className="app-stack-4">
                <ListDetailPanel
                  eyebrow="Selection"
                  title={selectedInstall ? readString(selectedInstall.label ?? selectedInstall.name, selectedInstallId || 'Agent') : 'No installed agent selected'}
                  subtitle={selectedInstall ? readString(selectedInstall.description ?? selectedInstall.agent_kind, 'Installed workspace agent') : 'Choose an installed agent to inspect its runtime state and execute it.'}
                  actions={selectedInstall ? (
                    <AppButton type="button" onClick={() => setIsRunSheetOpen(true)}>
                      Run agent
                    </AppButton>
                  ) : undefined}
                >
                  {!selectedInstall ? (
                    <EmptyPanel
                      title="No selected agent"
                      body="Choose an installed agent to inspect it and send a bounded runtime message."
                    />
                  ) : (
                    <>
                      <StateBanner
                        tone={agentTone(selectedInstall.status) === 'accent' ? 'neutral' : agentTone(selectedInstall.status) as 'neutral' | 'success' | 'warning' | 'danger'}
                        title={readString(selectedInstall.status, 'active')}
                        detail={readString(selectedInstall.agent_kind, 'Installed workspace agent')}
                      >
                        Use the run sheet to send a bounded runtime message through the canonical agent run path.
                      </StateBanner>
                      <FormGrid>
                        <FormReadout label="Install id" value={readString(selectedInstall.id, 'No identifier recorded')} />
                        <FormReadout label="Agent kind" value={readString(selectedInstall.agent_kind, 'No kind recorded')} />
                        <FormReadout label="Definition" value={selectedDefinition ? readString(selectedDefinition.name ?? selectedDefinition.id, 'Definition') : 'No linked definition found'} />
                        <FormReadout label="Runtime targets" value={String(runtimeTargets.length)} />
                      </FormGrid>
                    </>
                  )}
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Runtime"
                  title="Runtime targets"
                  subtitle={`${runtimeTargets.length} execution targets currently visible through the agent registry.`}
                >
                  {runtimeTargets.length === 0 ? (
                    <EmptyPanel
                      title="No runtime targets"
                      body="Runtime execution targets will appear here once the agent registry exposes them."
                    />
                  ) : (
                    <div className="app-stack-3">
                      {runtimeTargets.map((item, index) => (
                        <div
                          key={String(item.id ?? `runtime-${index}`)}
                          className="app-card-button"
                        >
                          <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                            <strong className="app-card-button__title">{readString(item.label ?? item.id, 'Runtime target')}</strong>
                            <DataBadge tone={Boolean(item.online) ? 'success' : 'warning'}>
                              {Boolean(item.online) ? 'Online' : 'Offline'}
                            </DataBadge>
                          </div>
                          <span className="app-card-button__subtitle">
                            {readString(item.kind, 'runtime')}{Boolean(item.preferred) ? ' · preferred target' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ListDetailPanel>
              </div>
            )}
          />
        )}
      </ListDetailShell>

      <CommandSheet
        open={isRunSheetOpen && Boolean(selectedInstall)}
        title={selectedInstall ? `Run agent · ${readString(selectedInstall.label ?? selectedInstall.name, selectedInstallId || 'agent')}` : 'Run agent'}
        description="Send a bounded runtime message through the canonical installed-agent execution route."
        onClose={() => setIsRunSheetOpen(false)}
        actions={(
          <>
            <AppButton type="button" tone="secondary" onClick={() => setIsRunSheetOpen(false)} disabled={Boolean(isRunningInstallId)}>
              Cancel
            </AppButton>
            <AppButton type="button" onClick={() => { void runSelectedAgent(); }} disabled={Boolean(isRunningInstallId) || !selectedInstall}>
              {isRunningInstallId ? 'Starting…' : 'Start run'}
            </AppButton>
          </>
        )}
      >
        {selectedInstall ? (
          <>
            <ModalSection title="Run message" description="This message is sent to the selected installed agent as a bounded execution prompt.">
              <FormField label="Prompt" hint="Keep this short and specific. The agent runtime will create a canonical run record from it.">
                <FormTextarea
                  rows={4}
                  value={runMessage}
                  onChange={(event) => setRunMessage(event.currentTarget.value)}
                  placeholder="Status check"
                />
              </FormField>
            </ModalSection>

            <ModalSection title="Execution context" description="Runtime details for the selected installed agent.">
              <FormGrid>
                <FormReadout label="Install id" value={readString(selectedInstall.id, 'No identifier recorded')} />
                <FormReadout label="Status" value={readString(selectedInstall.status, 'active')} />
                <FormReadout label="Agent kind" value={readString(selectedInstall.agent_kind, 'No kind recorded')} />
                <FormReadout label="Runtime targets" value={String(runtimeTargets.length)} />
              </FormGrid>
            </ModalSection>
          </>
        ) : null}
      </CommandSheet>
    </WorkstationSurfaceRoot>
  );
}
