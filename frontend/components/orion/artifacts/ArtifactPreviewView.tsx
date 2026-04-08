'use client';

import { AlertTriangle, EyeOff, Loader2 } from 'lucide-react';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  mergeStyles,
  metaTextStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';
import type { ArtifactItem, ArtifactPreviewMode } from '@/lib/artifactsPresentation';
import { artifactExtension, artifactSurfaceLabel } from '@/lib/artifactsPresentation';
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
  return parseDelimitedPreview(raw, ',');
}

function parseDelimitedPreview(raw: string, delimiter: string): string[][] {
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
      if (char === delimiter && !inQuotes) {
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

function PreviewState({
  title,
  copy,
  tone = 'default',
  loading = false,
}: {
  title: string;
  copy: string;
  tone?: 'default' | 'warning';
  loading?: boolean;
}) {
  return (
    <div
      style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[5] }), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
        alignItems: 'start',
        gridTemplateColumns: '40px minmax(0, 1fr)',
        background: tone === 'warning' ? DESIGN_TOKENS.color.warningSoft : DESIGN_TOKENS.color.surfaceMuted,
        borderColor: tone === 'warning' ? DESIGN_TOKENS.color.warning : DESIGN_TOKENS.color.borderSubtle,
      })}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: DESIGN_TOKENS.radius.lg,
          display: 'grid',
          placeItems: 'center',
          background: DESIGN_TOKENS.color.surface,
          border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
          color: tone === 'warning' ? DESIGN_TOKENS.color.warning : DESIGN_TOKENS.color.textSecondary,
        }}
      >
        {loading ? <Loader2 size={18} className="orion-artifact-state-spinner" /> : tone === 'warning' ? <AlertTriangle size={18} /> : <EyeOff size={18} />}
      </div>
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
        <div style={sectionTitleStyle()}>{title}</div>
        <p style={bodyTextStyle()}>{copy}</p>
      </div>
    </div>
  );
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
  const extension = artifactExtension(previewTarget.uri_or_path) || artifactExtension(previewTarget.label);
  const spreadsheetDelimiter = previewTarget.content_type === 'text/tab-separated-values'
    || extension === '.tsv'
    || extension === '.tab'
    ? '\t'
    : ',';

  if (loading) {
    return (
      <PreviewState
        title="Preparing preview"
        copy="Empyralis is loading the in-app view for this artifact."
        loading
      />
    );
  }

  if (error) {
    return (
      <PreviewState
        title="Preview unavailable"
        copy={`${error} You can still inspect the raw file in Code or provenance in Meta.`}
        tone="warning"
      />
    );
  }

  if (previewMode === 'html') {
    if (!contentHref) {
      return (
        <PreviewState
          title="Rendered page is unavailable"
          copy="This HTML artifact does not currently have a previewable source path. Use Code or Meta instead."
          tone="warning"
        />
      );
    }
    return (
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
        <div style={mergeStyles(metaTextStyle(), { color: DESIGN_TOKENS.color.textSecondary })}>
          Sandboxed HTML preview. Scripts, forms, popups, and parent-page access are disabled.
        </div>
        <ArtifactHtmlPreview title={`Preview ${artifactSurfaceLabel(item)}`} src={contentHref || ''} />
      </div>
    );
  }

  if (previewMode === 'markdown') {
    return <ArtifactMarkdownPreview content={textContent} />;
  }

  if (previewMode === 'image') {
    if (!contentHref) {
      return (
        <PreviewState
          title="Image preview is unavailable"
          copy="This artifact does not currently have a previewable image source. Use Meta or open it externally."
          tone="warning"
        />
      );
    }
    return (
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
        <div style={mergeStyles(metaTextStyle(), { color: DESIGN_TOKENS.color.textSecondary })}>
          Scaled to fit the workspace for quick inspection without losing the original file.
        </div>
        <div
          style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
            display: 'grid',
            placeItems: 'center',
            minHeight: 320,
            background: DESIGN_TOKENS.color.surfaceMuted,
          })}
        >
          <img
            src={contentHref}
            alt={artifactSurfaceLabel(item)}
            style={{
              width: '100%',
              maxHeight: 560,
              objectFit: 'contain',
              borderRadius: DESIGN_TOKENS.radius.lg,
            }}
          />
        </div>
      </div>
    );
  }

  if (previewMode === 'pdf') {
    if (!contentHref) {
      return (
        <PreviewState
          title="PDF preview is unavailable"
          copy="This PDF does not currently expose a previewable source path. Use Meta or open it externally."
          tone="warning"
        />
      );
    }
    return (
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
        <div style={mergeStyles(metaTextStyle(), { color: DESIGN_TOKENS.color.textSecondary })}>
          Embedded PDF preview for quick review. Download or open externally if you need full viewer controls.
        </div>
        <iframe
          title={`Preview ${artifactSurfaceLabel(item)}`}
          src={contentHref}
          style={{
            width: '100%',
            minHeight: 620,
            border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
            borderRadius: DESIGN_TOKENS.radius.lg,
            background: DESIGN_TOKENS.color.surface,
          }}
        />
      </div>
    );
  }

  if (previewMode === 'csv') {
    const rows = spreadsheetDelimiter === ',' ? parseCsvPreview(textContent) : parseDelimitedPreview(textContent, spreadsheetDelimiter);
    if (rows.length === 0) {
      return (
        <PreviewState
          title="No previewable rows found"
          copy="This spreadsheet-like text file is empty or does not contain rows Empyralis can render in the quick table preview."
        />
      );
    }
    const [header, ...body] = rows;
    return (
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
        <div style={mergeStyles(metaTextStyle(), { color: DESIGN_TOKENS.color.textSecondary })}>
          Showing the first {rows.length} rows for quick inspection.
        </div>
        <div
          style={{
            overflowX: 'auto',
            border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
            borderRadius: DESIGN_TOKENS.radius.lg,
            background: DESIGN_TOKENS.color.surface,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: DESIGN_TOKENS.type.size.label,
            }}
          >
            <thead>
              <tr>
                {header.map((cell, index) => (
                  <th
                    key={`header-${index}`}
                    style={{
                      padding: `${DESIGN_TOKENS.space[3]}px ${DESIGN_TOKENS.space[4]}px`,
                      textAlign: 'left',
                      color: DESIGN_TOKENS.color.textSecondary,
                      background: DESIGN_TOKENS.color.surfaceMuted,
                      borderBottom: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
                    }}
                  >
                    {cell || `Column ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {header.map((_, cellIndex) => (
                    <td
                      key={`row-${rowIndex}-cell-${cellIndex}`}
                      style={{
                        padding: `${DESIGN_TOKENS.space[3]}px ${DESIGN_TOKENS.space[4]}px`,
                        borderBottom: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
                        color: DESIGN_TOKENS.color.textPrimary,
                        verticalAlign: 'top',
                      }}
                    >
                      {row[cellIndex] || '—'}
                    </td>
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
    if (!String(textContent || '').trim()) {
      return (
        <PreviewState
          title="This file is empty"
          copy="The artifact exists, but it does not contain any previewable text content."
        />
      );
    }
    return <pre className="orion-artifact-preview is-text">{textContent}</pre>;
  }

  if (previewTarget.content_type || previewTarget.byte_size != null) {
    return (
      <PreviewState
        title="No rendered preview yet"
        copy="This file type does not currently have an in-app rendered view. Use Code when available, or fall back to Meta, Download, or Open externally."
      />
    );
  }

  return (
    <PreviewState
      title="Preview unavailable"
      copy="Empyralis could not determine a safe in-app preview for this artifact."
    />
  );
}
