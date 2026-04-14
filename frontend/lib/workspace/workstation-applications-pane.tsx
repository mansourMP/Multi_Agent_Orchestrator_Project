'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import { DataBadge, DataTable, DataTableCell, DataTableHeader, DataTableHeaderCell, DataTableRow } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { AppButton } from '@/lib/ui/primitives';
import { ModalSection } from '@/lib/ui/modal';
import { FormReadout } from '@/lib/ui/form-controls';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type AppRecord = Record<string, unknown> & {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  version?: string | null;
  latest_version?: string | null;
  status?: string | null;
  entry_route?: string | null;
};

function normalizeAppItems(payload: unknown): AppRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is AppRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function statusTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'installed' || status === 'active') {
    return 'success';
  }
  if (status === 'available' || status === 'catalog') {
    return 'accent';
  }
  if (status === 'update_available' || status === 'updatable') {
    return 'warning';
  }
  if (status === 'error' || status === 'failed') {
    return 'danger';
  }
  return 'neutral';
}

function readCombinedError(results: PromiseSettledResult<unknown>[]): string | null {
  const messages = results.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [];
    }
    return [result.reason instanceof Error ? result.reason.message : 'Application data is unavailable.'];
  });
  return messages.length > 0 ? messages.join(' ') : null;
}

function ApplicationsSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <div style={{ display: 'grid', gap: '1rem' }}>
          <ListDetailPanel eyebrow="Installed" title="Loading installed applications">
            <SkeletonBlock height="2.8rem" />
            <SkeletonBlock height="2.8rem" />
            <SkeletonBlock height="2.8rem" />
          </ListDetailPanel>
          <ListDetailPanel eyebrow="Catalog" title="Loading catalog">
            <SkeletonBlock height="2.8rem" />
            <SkeletonBlock height="2.8rem" />
          </ListDetailPanel>
        </div>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Selection" title="Loading application detail">
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkstationApplicationsPane() {
  const services = useWorkspaceServices();
  const router = useRouter();
  const [installed, setInstalled] = useState<AppRecord[]>([]);
  const [store, setStore] = useState<AppRecord[]>([]);
  const [updates, setUpdates] = useState<AppRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [pendingUninstallId, setPendingUninstallId] = useState<string | null>(null);
  const [mutatingAppId, setMutatingAppId] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const results = await Promise.allSettled([
      services.client.listInstalledApps(),
      services.client.listStoreApps(),
      services.client.listAppUpdates(),
    ]);

    setInstalled(results[0].status === 'fulfilled' ? normalizeAppItems(results[0].value) : []);
    setStore(results[1].status === 'fulfilled' ? normalizeAppItems(results[1].value) : []);
    setUpdates(results[2].status === 'fulfilled' ? normalizeAppItems(results[2].value) : []);
    setError(readCombinedError(results));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'Applications are unavailable.');
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const installedById = useMemo(
    () => new Map(installed.map((item) => [String(item.id ?? ''), item])),
    [installed],
  );
  const storeById = useMemo(
    () => new Map(store.map((item) => [String(item.id ?? ''), item])),
    [store],
  );
  const updatesById = useMemo(
    () => new Map(updates.map((item) => [String(item.id ?? ''), item])),
    [updates],
  );

  const allAppIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of installed) {
      const id = String(item.id ?? '').trim();
      if (id) {
        ids.add(id);
      }
    }
    for (const item of store) {
      const id = String(item.id ?? '').trim();
      if (id) {
        ids.add(id);
      }
    }
    for (const item of updates) {
      const id = String(item.id ?? '').trim();
      if (id) {
        ids.add(id);
      }
    }
    return Array.from(ids);
  }, [installed, store, updates]);

  useEffect(() => {
    if (allAppIds.length === 0) {
      setSelectedAppId(null);
      return;
    }
    if (selectedAppId && allAppIds.includes(selectedAppId)) {
      return;
    }
    setSelectedAppId(allAppIds[0]);
  }, [allAppIds, selectedAppId]);

  const selectedApp = useMemo(() => {
    if (!selectedAppId) {
      return null;
    }
    return installedById.get(selectedAppId) ?? storeById.get(selectedAppId) ?? updatesById.get(selectedAppId) ?? null;
  }, [installedById, selectedAppId, storeById, updatesById]);

  const selectedAppIdSafe = String(selectedApp?.id ?? selectedAppId ?? '').trim();
  const selectedInstalled = selectedAppIdSafe ? installedById.get(selectedAppIdSafe) ?? null : null;
  const selectedCatalog = selectedAppIdSafe ? storeById.get(selectedAppIdSafe) ?? null : null;
  const selectedUpdate = selectedAppIdSafe ? updatesById.get(selectedAppIdSafe) ?? null : null;

  const mutate = async ({
    appId,
    action,
    successMessage,
  }: {
    appId: string;
    action: () => Promise<unknown>;
    successMessage: string;
  }) => {
    setError(null);
    setStatus(null);
    setMutatingAppId(appId);
    try {
      await action();
      await refresh();
      setStatus(successMessage);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Application action failed.');
    } finally {
      setMutatingAppId(null);
      setPendingUninstallId(null);
      setIsActionSheetOpen(false);
    }
  };

  return (
    <WorkstationSurfaceRoot surface="applications">
      <ListDetailShell
        title="Applications"
        subtitle="Installed modules, available catalog entries, and update readiness inside the workstation runtime."
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
          <StateBanner tone="success" title="Application state updated">
            {status}
          </StateBanner>
        ) : null}
        {error ? (
          <StateBanner
            tone="danger"
            title="Application inventory is degraded"
            detail="One or more catalog sources did not load cleanly. Any successfully loaded data remains available below."
          >
            {error}
          </StateBanner>
        ) : null}

        {isLoading ? (
          <ApplicationsSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <div style={{ display: 'grid', gap: '1rem' }}>
                <ListDetailPanel
                  eyebrow="Installed"
                  title="Installed application registry"
                  subtitle={`${installed.length} modules currently mounted inside the workspace runtime.`}
                >
                  {installed.length === 0 ? (
                    <EmptyPanel
                      title="No installed applications"
                      body="Applications from the catalog can be installed here and opened directly into the workstation."
                    />
                  ) : (
                    <DataTable>
                      <DataTableHeader columns="minmax(0, 1.1fr) minmax(0, 0.7fr) minmax(0, 0.8fr) auto">
                        <DataTableHeaderCell>Application</DataTableHeaderCell>
                        <DataTableHeaderCell>Status</DataTableHeaderCell>
                        <DataTableHeaderCell>Version</DataTableHeaderCell>
                        <DataTableHeaderCell align="end">Focus</DataTableHeaderCell>
                      </DataTableHeader>
                      {installed.map((item, index) => {
                        const appId = String(item.id ?? `installed-${index}`);
                        const selected = appId === selectedAppId;
                        return (
                          <DataTableRow
                            key={appId}
                            columns="minmax(0, 1.1fr) minmax(0, 0.7fr) minmax(0, 0.8fr) auto"
                            selected={selected}
                            onClick={() => setSelectedAppId(appId)}
                          >
                            <DataTableCell
                              primary={readString(item.name, appId)}
                              secondary={readString(item.description, 'Installed application')}
                            />
                            <DataTableCell primary={<DataBadge tone={statusTone(item.status)}>{readString(item.status, 'installed')}</DataBadge>} />
                            <DataTableCell primary={`v${readString(item.version, 'n/a')}`} />
                            <DataTableCell
                              align="end"
                              primary={selected ? <DataBadge tone="accent">Selected</DataBadge> : <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.78rem' }}>Inspect</span>}
                            />
                          </DataTableRow>
                        );
                      })}
                    </DataTable>
                  )}
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Catalog"
                  title="Available applications"
                  subtitle={`${store.length} installable catalog entries and ${updates.length} available updates.`}
                >
                  {store.length === 0 && updates.length === 0 ? (
                    <EmptyPanel
                      title="Catalog is empty"
                      body="Additional installable applications and update notices will appear here when the registry exposes them."
                    />
                  ) : (
                    <div style={{ display: 'grid', gap: '0.7rem' }}>
                      {updates.length > 0 ? (
                        <div style={{ display: 'grid', gap: '0.45rem' }}>
                          <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.85rem' }}>Update queue</strong>
                          {updates.map((item, index) => {
                            const appId = String(item.id ?? `update-${index}`);
                            return (
                              <button
                                key={appId}
                                type="button"
                                onClick={() => setSelectedAppId(appId)}
                                style={{
                                  display: 'grid',
                                  gap: '0.2rem',
                                  padding: '0.78rem 0.84rem',
                                  borderRadius: '0.9rem',
                                  border: appId === selectedAppId ? '1px solid var(--app-border-accent)' : '1px solid var(--app-border-subtle)',
                                  background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                                  <strong style={{ color: 'var(--app-text-primary)' }}>{readString(item.name, appId)}</strong>
                                  <DataBadge tone="warning">Update</DataBadge>
                                </div>
                                <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.8rem' }}>
                                  v{readString(item.version, 'n/a')} → v{readString(item.latest_version, 'n/a')}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      {store.length > 0 ? (
                        <div style={{ display: 'grid', gap: '0.45rem' }}>
                          <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.85rem' }}>Catalog</strong>
                          {store.map((item, index) => {
                            const appId = String(item.id ?? `store-${index}`);
                            return (
                              <button
                                key={appId}
                                type="button"
                                onClick={() => setSelectedAppId(appId)}
                                style={{
                                  display: 'grid',
                                  gap: '0.2rem',
                                  padding: '0.78rem 0.84rem',
                                  borderRadius: '0.9rem',
                                  border: appId === selectedAppId ? '1px solid var(--app-border-accent)' : '1px solid var(--app-border-subtle)',
                                  background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                                  <strong style={{ color: 'var(--app-text-primary)' }}>{readString(item.name, appId)}</strong>
                                  <DataBadge tone={installedById.has(appId) ? 'success' : 'accent'}>
                                    {installedById.has(appId) ? 'Installed' : 'Available'}
                                  </DataBadge>
                                </div>
                                <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.8rem' }}>
                                  {readString(item.description, 'Catalog application')}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </ListDetailPanel>
              </div>
            )}
            secondary={(
              <ListDetailPanel
                eyebrow="Selection"
                title={selectedApp ? readString(selectedApp.name, selectedAppIdSafe || 'Application') : 'No application selected'}
                subtitle={selectedApp ? readString(selectedApp.description, 'Application detail is available here.') : 'Choose an installed or catalog application to inspect its workstation module state.'}
                actions={selectedApp ? (
                  <AppButton type="button" onClick={() => setIsActionSheetOpen(true)}>
                    Actions
                  </AppButton>
                ) : undefined}
              >
                {!selectedApp ? (
                  <EmptyPanel
                    title="No selected application"
                    body="Choose an installed or catalog application to inspect its state and available actions."
                  />
                ) : (
                  <>
                    <StateBanner
                      tone={selectedUpdate ? 'warning' : selectedInstalled ? 'success' : 'accent'}
                      title={selectedUpdate ? 'Update available' : selectedInstalled ? 'Installed in workspace' : 'Available for install'}
                      detail={selectedInstalled?.entry_route ? 'Launch route is available in the workstation.' : 'This module is managed inside the workspace registry.'}
                    >
                      {selectedUpdate
                        ? `Catalog has version ${readString(selectedUpdate.latest_version, 'n/a')} ready to deploy.`
                        : selectedCatalog
                          ? 'Catalog metadata is loaded and ready for action.'
                          : 'Installed module metadata is loaded and ready for action.'}
                    </StateBanner>

                    <div style={{ display: 'grid', gap: '0.7rem' }}>
                      <FormReadout label="Application id" value={selectedAppIdSafe || 'No identifier recorded'} />
                      <FormReadout label="Installed version" value={`v${readString(selectedInstalled?.version ?? selectedApp.version, 'n/a')}`} />
                      <FormReadout label="Latest version" value={`v${readString(selectedUpdate?.latest_version ?? selectedCatalog?.latest_version ?? selectedApp.latest_version, readString(selectedApp.version, 'n/a'))}`} />
                      <FormReadout label="Runtime status" value={readString(selectedInstalled?.status ?? selectedCatalog?.status ?? selectedApp.status, selectedInstalled ? 'installed' : 'available')} />
                      <FormReadout label="Launch route" value={selectedInstalled?.entry_route ? readString(selectedInstalled.entry_route, 'n/a') : 'No direct launch route exposed'} />
                    </div>
                  </>
                )}
              </ListDetailPanel>
            )}
          />
        )}
      </ListDetailShell>

      <CommandSheet
        open={isActionSheetOpen && Boolean(selectedApp)}
        title={selectedApp ? `Application actions · ${readString(selectedApp.name, selectedAppIdSafe)}` : 'Application actions'}
        description="Run module actions inside workstation chrome rather than jumping to generic page controls."
        onClose={() => setIsActionSheetOpen(false)}
        actions={(
          <AppButton type="button" tone="secondary" onClick={() => setIsActionSheetOpen(false)}>
            Done
          </AppButton>
        )}
      >
        {selectedApp ? (
          <>
            <ModalSection title="Module state" description="Current registry and catalog status for the selected application.">
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                <FormReadout label="Presence" value={selectedInstalled ? 'Installed in workspace' : 'Catalog only'} />
                <FormReadout label="Version" value={`v${readString(selectedInstalled?.version ?? selectedApp.version, 'n/a')}`} />
                <FormReadout label="Available update" value={selectedUpdate ? `v${readString(selectedUpdate.latest_version, 'n/a')}` : 'No update queued'} />
              </div>
            </ModalSection>

            <ModalSection title="Actions" description="Install, update, launch, or remove the selected module.">
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {selectedInstalled?.entry_route ? (
                  <AppButton
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      setIsActionSheetOpen(false);
                      router.push(readString(selectedInstalled.entry_route, '/'));
                    }}
                  >
                    Open module
                  </AppButton>
                ) : null}

                {!selectedInstalled && selectedCatalog ? (
                  <AppButton
                    type="button"
                    disabled={mutatingAppId === selectedAppIdSafe}
                    onClick={() => {
                      void mutate({
                        appId: selectedAppIdSafe,
                        action: () => services.client.installApp({ appId: selectedAppIdSafe }),
                        successMessage: `Installed ${readString(selectedApp.name, selectedAppIdSafe)}.`,
                      });
                    }}
                  >
                    {mutatingAppId === selectedAppIdSafe ? 'Installing…' : 'Install'}
                  </AppButton>
                ) : null}

                {selectedUpdate ? (
                  <AppButton
                    type="button"
                    disabled={mutatingAppId === selectedAppIdSafe}
                    onClick={() => {
                      void mutate({
                        appId: selectedAppIdSafe,
                        action: () => services.client.updateApp({ appId: selectedAppIdSafe }),
                        successMessage: `Updated ${readString(selectedApp.name, selectedAppIdSafe)}.`,
                      });
                    }}
                  >
                    {mutatingAppId === selectedAppIdSafe ? 'Updating…' : 'Apply update'}
                  </AppButton>
                ) : null}

                {selectedInstalled ? (
                  <AppButton
                    type="button"
                    tone="danger"
                    onClick={() => setPendingUninstallId(selectedAppIdSafe)}
                  >
                    Remove from workspace
                  </AppButton>
                ) : null}
              </div>
            </ModalSection>
          </>
        ) : null}
      </CommandSheet>

      <ConfirmDialog
        open={Boolean(pendingUninstallId)}
        title="Remove application from workspace"
        body={selectedApp ? `Remove ${readString(selectedApp.name, selectedAppIdSafe)} from the installed workspace registry?` : 'Remove this application from the installed workspace registry?'}
        confirmLabel="Remove application"
        busy={mutatingAppId === pendingUninstallId}
        onCancel={() => setPendingUninstallId(null)}
        onConfirm={() => {
          if (!pendingUninstallId) {
            return;
          }
          void mutate({
            appId: pendingUninstallId,
            action: () => services.client.uninstallApp({ appId: pendingUninstallId }),
            successMessage: `Uninstalled ${selectedApp ? readString(selectedApp.name, pendingUninstallId) : pendingUninstallId}.`,
          });
        }}
      />
    </WorkstationSurfaceRoot>
  );
}
