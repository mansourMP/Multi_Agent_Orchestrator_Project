'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppButton, AppNotice } from '@/lib/ui/primitives';
import { type WorkstationArtifactDetailPayload } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import {
  StageDetailField,
  StageDetailFieldGrid,
  StageDetailLayout,
  StageDetailSection,
} from '@/lib/workspace/stage-detail-layout';

function readArtifactString(value: unknown, fallback = 'n/a'): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function formatByteSize(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'unknown';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMetadataValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const scalarValues = value
      .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (scalarValues.length > 0) {
      return scalarValues.join(', ');
    }
    return value.length > 0 ? `${value.length} recorded items` : null;
  }
  if (value && typeof value === 'object') {
    return 'Structured metadata recorded';
  }
  return null;
}

export type WorkstationArtifactViewerProps = {
  artifactId: string;
};

export function WorkstationArtifactViewer({
  artifactId,
}: WorkstationArtifactViewerProps) {
  const services = useWorkspaceServices();
  const [detail, setDetail] = useState<WorkstationArtifactDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void services.client.getArtifactDetail({ artifactId })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setDetail(payload as WorkstationArtifactDetailPayload | null);
        setIsLoading(false);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setDetail(null);
        setError(loadError instanceof Error ? loadError.message : 'Artifact detail is unavailable.');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, refreshNonce, services.client]);

  const fileUrl = useMemo(
    () => services.client.artifactFileUrl(artifactId),
    [artifactId, services.client],
  );
  const downloadUrl = useMemo(
    () => services.client.artifactDownloadUrl(artifactId),
    [artifactId, services.client],
  );

  if (isLoading) {
    return (
      <div data-workstation-artifact-viewer="loading">
        <AppNotice>Loading artifact detail.</AppNotice>
      </div>
    );
  }

  if (error) {
    return (
      <div data-workstation-artifact-viewer="error">
        <AppNotice tone="danger">{error}</AppNotice>
      </div>
    );
  }

  if (!detail) {
    return (
      <div data-workstation-artifact-viewer="empty">
        <AppNotice>Artifact detail is unavailable for this selection.</AppNotice>
      </div>
    );
  }

  const previewKind = readArtifactString(detail.preview_kind, 'binary');
  const mediaType = readArtifactString(detail.media_type, 'application/octet-stream');
  const metadata = detail.metadata && typeof detail.metadata === 'object'
    ? detail.metadata as Record<string, unknown>
    : null;

  return (
    <div data-workstation-artifact-viewer="pane">
      <StageDetailLayout
        eyebrow="Artifact"
        title={readArtifactString(detail.label ?? detail.file_name, artifactId)}
        subtitle={readArtifactString(detail.artifact_id, artifactId)}
        actions={(
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                setRefreshNonce((value) => value + 1);
              }}
            >
              Refresh
            </AppButton>
            <a
              href={downloadUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '2.2rem',
                padding: '0.5rem 0.9rem',
                borderRadius: '999px',
                border: '1px solid var(--app-border-accent)',
                background: 'color-mix(in srgb, var(--app-accent) 18%, var(--app-bg-overlay) 82%)',
                color: 'var(--app-accent-text)',
                fontSize: '0.84rem',
                fontWeight: 620,
                textDecoration: 'none',
              }}
            >
              Download
            </a>
          </div>
        )}
      >
        <StageDetailSection title="Overview">
          <StageDetailFieldGrid>
            <StageDetailField label="Kind" value={readArtifactString(detail.kind, 'artifact')} />
            <StageDetailField label="Media type" value={mediaType} />
            <StageDetailField label="Size" value={formatByteSize(detail.byte_size)} />
            {detail.run_id ? (
              <StageDetailField label="Run" value={readArtifactString(detail.run_id)} mono />
            ) : null}
            {detail.created_at ? (
              <StageDetailField label="Created" value={readArtifactString(detail.created_at)} />
            ) : null}
            {detail.machine_id ? (
              <StageDetailField label="Machine" value={readArtifactString(detail.machine_id)} />
            ) : null}
            {detail.step_number != null ? (
              <StageDetailField label="Step" value={String(detail.step_number)} />
            ) : null}
          </StageDetailFieldGrid>
        </StageDetailSection>

        <StageDetailSection title="Preview">
          {previewKind === 'image' ? (
            <div
              style={{
                display: 'grid',
                gap: '0.65rem',
                padding: '0.85rem',
                borderRadius: '1rem',
                border: '1px solid var(--app-border-subtle)',
                background: 'color-mix(in srgb, var(--app-bg-canvas) 82%, var(--app-bg-overlay) 18%)',
              }}
            >
              <img
                alt={readArtifactString(detail.file_name ?? detail.label, artifactId)}
                src={fileUrl}
                style={{
                  width: '100%',
                  borderRadius: '0.9rem',
                  border: '1px solid var(--app-border-subtle)',
                  background: 'var(--app-bg-panel-elevated)',
                }}
              />
            </div>
          ) : null}

          {previewKind === 'text' ? (
            <pre
              style={{
                margin: 0,
                padding: '0.95rem',
                borderRadius: '1rem',
                border: '1px solid var(--app-border-subtle)',
                background: 'color-mix(in srgb, var(--app-bg-canvas) 82%, var(--app-bg-overlay) 18%)',
                color: 'var(--app-text-secondary)',
                overflow: 'auto',
                fontSize: '0.83rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {readArtifactString(detail.text_preview, '')}
            </pre>
          ) : null}

          {previewKind === 'binary' ? (
            <AppNotice>
              This artifact does not have an inline preview. Download it to inspect the full contents.
            </AppNotice>
          ) : null}
        </StageDetailSection>

        {metadata && Object.keys(metadata).length > 0 ? (
          <StageDetailSection title="Additional metadata">
            <StageDetailFieldGrid>
              {Object.entries(metadata)
                .slice(0, 8)
                .flatMap(([key, value]) => {
                  const formatted = formatMetadataValue(value);
                  if (!formatted) {
                    return [];
                  }
                  return (
                    <StageDetailField
                      key={key}
                      label={key.replace(/_/g, ' ')}
                      value={formatted}
                    />
                  );
                })}
            </StageDetailFieldGrid>
          </StageDetailSection>
        ) : null}
      </StageDetailLayout>
    </div>
  );
}
