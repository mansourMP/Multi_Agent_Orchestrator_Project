'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { DataBadge, DataTable, DataTableCell, DataTableHeader, DataTableHeaderCell, DataTableRow } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  readWorkstationStageRouteState,
  writeWorkstationStageRouteState,
} from '@/lib/workspace/workstation-stage-router';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type ArtifactRecord = Record<string, unknown> & {
  artifact_id?: string | null;
  id?: string | null;
  label?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  content_type?: string | null;
  byte_size?: number | null;
  created_at?: string | null;
  run_id?: string | null;
};

function normalizeArtifactItems(payload: unknown): ArtifactRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is ArtifactRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'No timestamp recorded';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatByteSize(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'Unknown size';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function artifactTone(mediaType: string): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  if (mediaType.startsWith('image/')) {
    return 'accent';
  }
  if (mediaType.startsWith('text/') || mediaType.includes('json')) {
    return 'success';
  }
  if (mediaType.includes('zip') || mediaType.includes('octet-stream')) {
    return 'warning';
  }
  return 'neutral';
}

function ArtifactSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <ListDetailPanel eyebrow="Catalog" title="Loading artifacts">
          <SkeletonBlock height="2.8rem" />
          <SkeletonBlock height="2.8rem" />
          <SkeletonBlock height="2.8rem" />
        </ListDetailPanel>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Selection" title="Loading artifact detail">
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkstationArtifactsPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stageRouteState = useMemo(() => readWorkstationStageRouteState(searchParams), [searchParams]);
  const [items, setItems] = useState<ArtifactRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const payload = await services.client.listArtifacts({ limit: 80 });
    setItems(normalizeArtifactItems(payload));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true)
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Artifact catalog is unavailable.');
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  useEffect(() => {
    if (streamState.activity.version === 0) {
      return;
    }
    void refresh(false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Artifact catalog is unavailable.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  const selectedArtifact = useMemo(() => {
    if (items.length === 0) {
      return null;
    }
    if (stageRouteState?.kind === 'artifact') {
      return items.find((item) => String(item.artifact_id ?? item.id ?? '').trim() === stageRouteState.id) ?? items[0];
    }
    return items[0];
  }, [items, stageRouteState]);

  const selectedArtifactId = String(selectedArtifact?.artifact_id ?? selectedArtifact?.id ?? '').trim();
  const inspectorFocused = stageRouteState?.kind === 'artifact' && stageRouteState.id === selectedArtifactId;

  const focusArtifact = (artifactId: string) => {
    router.replace(
      writeWorkstationStageRouteState(pathname, searchParams, {
        source: 'route',
        kind: 'artifact',
        id: artifactId,
      }),
      { scroll: false },
    );
  };

  const selectedMediaType = readString(selectedArtifact?.mime_type ?? selectedArtifact?.content_type, 'artifact');

  return (
    <WorkstationSurfaceRoot surface="artifacts">
      <ListDetailShell
        title="Artifacts"
        subtitle="Generated outputs, downloadable records, and the current artifact focus."
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
        {error ? (
          <StateBanner
            tone="danger"
            title="Artifact catalog is degraded"
            detail="The output catalog could not be fully refreshed from canonical artifact state."
          >
            {error}
          </StateBanner>
        ) : null}

        {isLoading ? (
          <ArtifactSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <ListDetailPanel
                eyebrow="Catalog"
                title="Output history"
                subtitle={`${items.length} artifacts currently visible in the workspace catalog.`}
              >
                {items.length === 0 ? (
                  <EmptyPanel
                    title="No artifacts available"
                    body="Generated outputs will appear here once runs start producing downloadable or previewable artifacts."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 1.2fr) minmax(0, 0.7fr) minmax(0, 0.7fr) auto">
                      <DataTableHeaderCell>Artifact</DataTableHeaderCell>
                      <DataTableHeaderCell>Type</DataTableHeaderCell>
                      <DataTableHeaderCell>Size</DataTableHeaderCell>
                      <DataTableHeaderCell align="end">Focus</DataTableHeaderCell>
                    </DataTableHeader>
                    {items.map((item, index) => {
                      const artifactId = String(item.artifact_id ?? item.id ?? '').trim() || `artifact-${index}`;
                      const mediaType = readString(item.mime_type ?? item.content_type, 'artifact');
                      const selected = artifactId === selectedArtifactId;
                      return (
                        <DataTableRow
                          key={artifactId}
                          columns="minmax(0, 1.2fr) minmax(0, 0.7fr) minmax(0, 0.7fr) auto"
                          selected={selected}
                          onClick={() => {
                            focusArtifact(artifactId);
                          }}
                        >
                          <DataTableCell
                            primary={readString(item.label ?? item.file_name, artifactId)}
                            secondary={readString(item.run_id, 'Workspace artifact')}
                          />
                          <DataTableCell primary={<DataBadge tone={artifactTone(mediaType)}>{mediaType}</DataBadge>} />
                          <DataTableCell primary={formatByteSize(item.byte_size)} meta={formatTimestamp(item.created_at)} />
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
            )}
            secondary={(
              <ListDetailPanel
                eyebrow="Selection"
                title={selectedArtifact ? readString(selectedArtifact.label ?? selectedArtifact.file_name, selectedArtifactId || 'Artifact') : 'No artifact selected'}
                subtitle={selectedArtifactId || 'Choose an artifact from the catalog to focus the inspector.'}
                actions={selectedArtifactId ? (
                  <div className="app-inline-actions">
                    <AppButton
                      type="button"
                      tone={inspectorFocused ? 'secondary' : 'primary'}
                      onClick={() => {
                        if (selectedArtifactId) {
                          focusArtifact(selectedArtifactId);
                        }
                      }}
                    >
                      {inspectorFocused ? 'Inspector focused' : 'Focus in inspector'}
                    </AppButton>
                    <AppButton
                      type="button"
                      tone="secondary"
                      onClick={() => {
                        if (selectedArtifactId) {
                          window.location.assign(services.client.artifactDownloadUrl(selectedArtifactId));
                        }
                      }}
                    >
                      Download
                    </AppButton>
                  </div>
                ) : undefined}
              >
                {!selectedArtifact ? (
                  <EmptyPanel
                    title="No selected artifact"
                    body="When outputs are available, the current artifact focus will appear here with quick download context."
                  />
                ) : (
                  <>
                    <StateBanner
                      tone={artifactTone(selectedMediaType) === 'accent' ? 'neutral' : artifactTone(selectedMediaType) as 'neutral' | 'success' | 'warning'}
                      title={selectedMediaType}
                      detail={formatByteSize(selectedArtifact.byte_size)}
                    >
                      {readString(selectedArtifact.run_id, 'Generated artifact')}
                    </StateBanner>
                    <div className="app-meta-list">
                      <div className="app-meta-item">
                        <span className="app-meta-label">Artifact id</span>
                        <span className="app-meta-value app-meta-value--mono">{selectedArtifactId}</span>
                      </div>
                      <div className="app-meta-item">
                        <span className="app-meta-label">Created</span>
                        <span className="app-meta-value app-meta-value--secondary">{formatTimestamp(selectedArtifact.created_at)}</span>
                      </div>
                    </div>
                  </>
                )}
              </ListDetailPanel>
            )}
          />
        )}
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
