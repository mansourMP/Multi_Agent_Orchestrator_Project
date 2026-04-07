'use client';

import type { ArtifactItem, ArtifactPreviewMode } from '@/lib/artifactsPresentation';
import { artifactSurfaceLabel } from '@/lib/artifactsPresentation';
import { ArtifactHtmlPreview } from './ArtifactHtmlPreview';
import { ArtifactMarkdownPreview } from './ArtifactMarkdownPreview';

type ArtifactPreviewViewProps = {
  item: ArtifactItem;
  previewTarget: ArtifactItem;
  previewMode: ArtifactPreviewMode;
  contentHref: string | null;
  textContent: string;
  loading: boolean;
  error: string;
};

function parseCsvPreview(raw: string): string[][] {
  const lines = String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
    .slice(0, 25);
  return lines.map((line) => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current);
    return values.map((value) => value.trim());
  });
}

export function ArtifactPreviewView({
  item,
  previewTarget,
  previewMode,
  contentHref,
  textContent,
  loading,
  error,
}: ArtifactPreviewViewProps) {
  if (loading) {
    return <div className="orion-artifact-detail-fallback">Loading preview…</div>;
  }

  if (error) {
    return <div className="orion-artifact-detail-fallback">{error}</div>;
  }

  if (previewMode === 'html') {
    return (
      <div className="orion-artifact-detail-body-frame">
        <div className="orion-artifact-detail-inline-note">Sandboxed HTML preview. Scripts, forms, popups, and parent-page access are disabled.</div>
        <ArtifactHtmlPreview title={`Preview ${artifactSurfaceLabel(item)}`} src={contentHref || ''} />
      </div>
    );
  }

  if (previewMode === 'markdown') {
    return <ArtifactMarkdownPreview content={textContent} />;
  }

  if (previewMode === 'image') {
    return (
      <div className="orion-artifact-preview is-media">
        <img
          className="orion-artifact-media-image"
          src={contentHref || ''}
          alt={artifactSurfaceLabel(item)}
        />
      </div>
    );
  }

  if (previewMode === 'pdf') {
    return (
      <div className="orion-artifact-detail-body-frame">
        <iframe
          title={`Preview ${artifactSurfaceLabel(item)}`}
          className="orion-artifact-pdf-frame"
          src={contentHref || ''}
        />
      </div>
    );
  }

  if (previewMode === 'csv') {
    const rows = parseCsvPreview(textContent);
    if (rows.length === 0) {
      return <div className="orion-artifact-detail-fallback">No previewable rows found in this CSV file.</div>;
    }
    const [header, ...body] = rows;
    return (
      <div className="orion-artifact-preview is-table">
        <div className="orion-artifact-detail-inline-note">Showing the first {rows.length} rows for quick inspection.</div>
        <div className="orion-artifact-table-wrap">
          <table className="orion-artifact-table">
            <thead>
              <tr>
                {header.map((cell, index) => (
                  <th key={`header-${index}`}>{cell || `Column ${index + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {header.map((_, cellIndex) => (
                    <td key={`row-${rowIndex}-cell-${cellIndex}`}>{row[cellIndex] || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (previewMode === 'text') {
    return <pre className="orion-artifact-preview is-text">{textContent}</pre>;
  }

  if (previewTarget.content_type || previewTarget.byte_size != null) {
    return (
      <div className="orion-artifact-detail-fallback">
        This file type does not have an in-app rendered preview yet. Use Meta, Download, or Open externally.
      </div>
    );
  }

  return (
    <div className="orion-artifact-detail-fallback">
      Preview is unavailable for this artifact.
    </div>
  );
}
