'use client';

import { useEffect, useMemo, useState } from 'react';

import { DataBadge } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationActionButton,
  WorkstationSurfaceCard,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

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
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
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

function toArtifactId(item: ArtifactRecord, fallbackIndex: number): string {
  return String(item.artifact_id ?? item.id ?? '').trim() || `artifact-${fallbackIndex}`;
}

export function WorkstationArtifactsPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const [items, setItems] = useState<ArtifactRecord[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
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
    void refresh(true).catch((loadError) => {
      if (cancelled) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Files are unavailable right now.');
      setIsLoading(false);
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
      setError(loadError instanceof Error ? loadError.message : 'Files are unavailable right now.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedArtifactId(null);
      return;
    }
    if (selectedArtifactId && items.some((item, index) => toArtifactId(item, index) === selectedArtifactId)) {
      return;
    }
    setSelectedArtifactId(toArtifactId(items[0], 0));
  }, [items, selectedArtifactId]);

  const selectedArtifact = useMemo(
    () => items.find((item, index) => toArtifactId(item, index) === selectedArtifactId) ?? null,
    [items, selectedArtifactId],
  );

  const totalBytes = useMemo(
    () =>
      items.reduce((sum, item) => (
        typeof item.byte_size === 'number' && Number.isFinite(item.byte_size) && item.byte_size > 0
          ? sum + item.byte_size
          : sum
      ), 0),
    [items],
  );

  const textLikeCount = useMemo(
    () => items.filter((item) => readString(item.mime_type ?? item.content_type, '').includes('text') || readString(item.mime_type ?? item.content_type, '').includes('json')).length,
    [items],
  );

  return (
    <WorkstationSurfaceRoot surface="artifacts">
      <WorkstationSurfaceCard
        title="Files"
        description="Generated outputs, artifacts, and downloadable files from Sage work."
        actions={(
          <WorkstationActionButton
            type="button"
            tone="secondary"
            onClick={() => {
              void refresh(false);
            }}
          >
            Refresh
          </WorkstationActionButton>
        )}
      >
        {error ? <WorkstationSurfaceNotice tone="danger">{error}</WorkstationSurfaceNotice> : null}

        <WorkstationSurfaceStatGrid>
          <WorkstationSurfaceStat
            label="Files"
            value={String(items.length)}
            hint="Artifacts available in this workspace"
          />
          <WorkstationSurfaceStat
            label="Stored size"
            value={formatByteSize(totalBytes)}
            hint="Total visible file size"
          />
          <WorkstationSurfaceStat
            label="Text outputs"
            value={String(textLikeCount)}
            hint="Markdown, JSON, and other text-like files"
          />
        </WorkstationSurfaceStatGrid>

        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="4.8rem" />
            <SkeletonBlock height="4.8rem" />
            <SkeletonBlock height="4.8rem" />
          </div>
        ) : items.length === 0 ? (
          <EmptyPanel
            title="No files yet"
            body="Send a message that creates a document, export, or generated file and it will appear here."
          />
        ) : (
          <div className="app-stack-3">
            {items.map((item, index) => {
              const artifactId = toArtifactId(item, index);
              const mediaType = readString(item.mime_type ?? item.content_type, 'artifact');
              const selected = artifactId === selectedArtifactId;
              return (
                <article key={artifactId} className={`app-card-button${selected ? ' app-card-button--selected' : ''}`}>
                  <button
                    type="button"
                    className="app-card-button__title"
                    onClick={() => setSelectedArtifactId(artifactId)}
                  >
                    {readString(item.label ?? item.file_name, artifactId)}
                  </button>
                  <span className="app-card-button__subtitle">Run: {readString(item.run_id, 'Workspace output')}</span>
                  <span className="app-card-button__meta">
                    {formatByteSize(item.byte_size)} · {formatTimestamp(item.created_at)}
                  </span>
                  <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                    <DataBadge tone={artifactTone(mediaType)}>{mediaType}</DataBadge>
                    <WorkstationActionButton
                      type="button"
                      tone="secondary"
                      onClick={() => {
                        window.location.assign(services.client.artifactDownloadUrl(artifactId));
                      }}
                    >
                      Download
                    </WorkstationActionButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </WorkstationSurfaceCard>

      <WorkstationSurfaceCard
        title={selectedArtifact ? readString(selectedArtifact.label ?? selectedArtifact.file_name, 'Selected file') : 'File detail'}
        description={selectedArtifact ? 'Focused file metadata and download access.' : 'Select a file to inspect details.'}
      >
        {!selectedArtifact ? (
          <EmptyPanel
            title="No file selected"
            body="Pick a file from the list to inspect its details and download it directly."
          />
        ) : (
          <div className="app-meta-list">
            <div className="app-meta-item">
              <span className="app-meta-label">Artifact id</span>
              <span className="app-meta-value app-meta-value--mono">{selectedArtifactId ?? 'Unknown'}</span>
            </div>
            <div className="app-meta-item">
              <span className="app-meta-label">Type</span>
              <span className="app-meta-value app-meta-value--secondary">
                {readString(selectedArtifact.mime_type ?? selectedArtifact.content_type, 'artifact')}
              </span>
            </div>
            <div className="app-meta-item">
              <span className="app-meta-label">Size</span>
              <span className="app-meta-value app-meta-value--secondary">{formatByteSize(selectedArtifact.byte_size)}</span>
            </div>
            <div className="app-meta-item">
              <span className="app-meta-label">Created</span>
              <span className="app-meta-value app-meta-value--secondary">{formatTimestamp(selectedArtifact.created_at)}</span>
            </div>
            <div className="app-inline-actions">
              <WorkstationActionButton
                type="button"
                tone="secondary"
                onClick={() => {
                  if (!selectedArtifactId) {
                    return;
                  }
                  window.location.assign(services.client.artifactDownloadUrl(selectedArtifactId));
                }}
              >
                Download selected file
              </WorkstationActionButton>
            </div>
          </div>
        )}
      </WorkstationSurfaceCard>
    </WorkstationSurfaceRoot>
  );
}
