'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Download, ExternalLink, FolderOpen } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  artifactActionHint,
  artifactCodeLanguage,
  artifactDefaultViewerTab,
  artifactFormatLabel,
  artifactFormatTone,
  artifactKindLabel,
  artifactPathTail,
  artifactPreviewMode,
  artifactSummary,
  artifactSupportsCodeView,
  artifactSupportsRenderedView,
  artifactSurfaceLabel,
  compactText,
  connectorBindingText,
  toDateLabel,
  type ArtifactItem,
} from '@/lib/artifactsPresentation';
import { ArtifactCodeView } from './ArtifactCodeView';
import { ArtifactMetaView } from './ArtifactMetaView';
import { ArtifactPreviewView } from './ArtifactPreviewView';

type ArtifactDetailPaneProps = {
  item: ArtifactItem | null;
  previewTarget: ArtifactItem | null;
  contentHref: string | null;
  downloadHref: string | null;
  showReveal: boolean;
  revealLabel: string;
  showBackButton?: boolean;
  onBack?: () => void;
  hasPreviousArtifact?: boolean;
  hasNextArtifact?: boolean;
  onPreviousArtifact?: () => void;
  onNextArtifact?: () => void;
  onOpenExternal: () => void;
  onReveal: () => void;
};

type ViewTab = 'view' | 'code' | 'meta';

function formatRunStatusLabel(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '—';
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ArtifactDetailPane({
  item,
  previewTarget,
  contentHref,
  downloadHref,
  showReveal,
  revealLabel,
  showBackButton = false,
  onBack,
  hasPreviousArtifact = false,
  hasNextArtifact = false,
  onPreviousArtifact,
  onNextArtifact,
  onOpenExternal,
  onReveal,
}: ArtifactDetailPaneProps) {
  const previewMode = useMemo(() => (previewTarget ? artifactPreviewMode(previewTarget) : 'none'), [previewTarget]);
  const [activeTab, setActiveTab] = useState<ViewTab>(previewTarget ? artifactDefaultViewerTab(previewTarget) : 'meta');
  const [textContent, setTextContent] = useState<string>('');
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string>('');

  const canRenderView = Boolean(previewTarget && artifactSupportsRenderedView(previewTarget));
  const canShowCode = Boolean(previewTarget && artifactSupportsCodeView(previewTarget));

  useEffect(() => {
    if (!previewTarget) {
      setActiveTab('meta');
      return;
    }
    setActiveTab(artifactDefaultViewerTab(previewTarget));
  }, [previewTarget]);

  useEffect(() => {
    if (!previewTarget || (!canShowCode && previewMode !== 'csv' && previewMode !== 'markdown' && previewMode !== 'text' && previewMode !== 'html')) {
      setTextContent('');
      setContentLoading(false);
      setContentError('');
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    setContentError('');

    void apiClient.fetchArtifactContent(previewTarget.uri_or_path)
      .then(async (blob) => {
        const next = await blob.text();
        if (cancelled) return;
        setTextContent(next);
        setContentLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTextContent('');
        setContentLoading(false);
        setContentError(error instanceof Error ? error.message : 'Preview is unavailable for this artifact.');
      });

    return () => {
      cancelled = true;
    };
  }, [canShowCode, previewMode, previewTarget]);

  useEffect(() => {
    if (activeTab === 'view' && !canRenderView) {
      setActiveTab(canShowCode ? 'code' : 'meta');
      return;
    }
    if (activeTab === 'code' && !canShowCode) {
      setActiveTab(canRenderView ? 'view' : 'meta');
    }
  }, [activeTab, canRenderView, canShowCode]);

  if (!item || !previewTarget) {
    return (
      <aside className="orion-artifact-detail-pane is-empty">
        <div className="orion-artifact-detail-empty">
          <div className="orion-panel-title">Select an artifact</div>
          <p>Choose an output, screenshot, page, or support file to inspect it inside Empyralis.</p>
        </div>
      </aside>
    );
  }

  const formatTone = artifactFormatTone(previewTarget);
  const inspectHref = item.run_id
    ? `/runs/${encodeURIComponent(item.run_id)}/inspect?focus=${encodeURIComponent(item.focus_target || 'artifacts')}`
    : null;
  const codeLanguage = artifactCodeLanguage(previewTarget);
  const resolvedLocation = String(previewTarget.uri_or_path || '').trim();
  const connectorContext = connectorBindingText(item.connector_binding);
  const sourceRunContextVisible = Boolean(
    item.run_id
    || item.agent_label
    || item.agent_role
    || item.run_status
    || item.created_at
    || connectorContext,
  );
  const viewLabel = previewMode === 'html'
    ? 'Rendered page'
    : previewMode === 'markdown'
      ? 'Rendered markdown'
      : previewMode === 'image'
        ? 'Inline image preview'
        : previewMode === 'pdf'
          ? 'Embedded PDF preview'
          : previewMode === 'csv'
            ? 'Table preview'
            : 'Formatted text preview';

  let body: React.ReactNode;
  if (activeTab === 'view') {
    body = (
      <ArtifactPreviewView
        item={item}
        previewTarget={previewTarget}
        previewMode={previewMode}
        contentHref={contentHref}
        textContent={textContent}
        loading={contentLoading}
        error={contentError}
      />
    );
  } else if (activeTab === 'code') {
    if (!canShowCode) {
      body = (
        <div className="orion-artifact-detail-fallback">
          Raw source view is only available for HTML, markdown, CSV, and text/code artifacts.
        </div>
      );
    } else if (contentLoading) {
      body = <div className="orion-artifact-detail-fallback">Loading source…</div>;
    } else if (contentError) {
      body = <div className="orion-artifact-detail-fallback">{contentError}</div>;
    } else {
      body = <ArtifactCodeView code={textContent} language={codeLanguage} />;
    }
  } else {
    body = <ArtifactMetaView item={item} previewTarget={previewTarget} />;
  }

  return (
    <aside className="orion-artifact-detail-pane">
      <div className="orion-artifact-detail-head">
        <div className="orion-artifact-detail-heading">
          <div className="orion-artifact-detail-kicker">Artifact viewer</div>
          <div className="orion-artifact-detail-title-row">
            <h3 className="orion-artifact-detail-title">{artifactSurfaceLabel(item)}</h3>
            <span className="orion-chip" style={formatTone}>{artifactFormatLabel(previewTarget)}</span>
            <span className="orion-chip">{artifactKindLabel(item.kind)}</span>
          </div>
          <p className="orion-artifact-detail-summary">
            {compactText(artifactSummary(item), artifactActionHint(item), 220)}
          </p>
          <div className="orion-artifact-detail-meta">
            <span>{artifactPathTail(resolvedLocation) || 'Saved artifact'}</span>
            {item.run_id ? <span>Run {item.run_id.slice(0, 8)}</span> : null}
            {item.agent_label ? <span>{item.agent_label}</span> : null}
            {connectorContext ? <span>{connectorContext}</span> : null}
          </div>
        </div>

        <div className="orion-artifact-detail-actions">
          {showBackButton ? (
            <button className="orion-btn orion-btn-ghost" onClick={onBack} title="Back to list (Esc)">
              <ChevronLeft size={13} />
              Back
            </button>
          ) : null}
          <button
            className="orion-btn orion-btn-ghost"
            onClick={onPreviousArtifact}
            disabled={!hasPreviousArtifact}
            title="Previous artifact (Left arrow)"
          >
            <ChevronLeft size={13} />
            Previous
          </button>
          <button
            className="orion-btn orion-btn-ghost"
            onClick={onNextArtifact}
            disabled={!hasNextArtifact}
            title="Next artifact (Right arrow)"
          >
            Next
            <ChevronRight size={13} />
          </button>
          <button className="orion-btn orion-btn-ghost" onClick={onOpenExternal}>
            <ExternalLink size={13} />
            Open externally
          </button>
          {downloadHref ? (
            <a className="orion-btn orion-btn-ghost" href={downloadHref} download={artifactPathTail(resolvedLocation) || undefined}>
              <Download size={13} />
              Download
            </a>
          ) : null}
          {showReveal ? (
            <button className="orion-btn orion-btn-ghost" onClick={onReveal}>
              <FolderOpen size={13} />
              {revealLabel}
            </button>
          ) : null}
        </div>
      </div>

      {sourceRunContextVisible ? (
        <section className="orion-artifact-provenance-card" aria-label="Source run context">
          <div className="orion-artifact-provenance-head">
            <div className="orion-artifact-provenance-heading">
              <div className="orion-artifact-provenance-kicker">Source run context</div>
              <div className="orion-artifact-provenance-title">
                {item.run_id ? `Run ${item.run_id.slice(0, 8)}` : 'Artifact provenance'}
              </div>
            </div>
            {inspectHref ? (
              <Link href={inspectHref} className="orion-btn orion-btn-ghost">
                <ArrowUpRight size={13} />
                Open run inspection
              </Link>
            ) : null}
          </div>
          <div className="orion-artifact-provenance-grid">
            <div className="orion-artifact-provenance-item">
              <div className="orion-artifact-provenance-label">Run id</div>
              <div className="orion-artifact-provenance-value">{item.run_id || '—'}</div>
            </div>
            <div className="orion-artifact-provenance-item">
              <div className="orion-artifact-provenance-label">Agent</div>
              <div className="orion-artifact-provenance-value">{item.agent_label || item.agent_role || '—'}</div>
            </div>
            <div className="orion-artifact-provenance-item">
              <div className="orion-artifact-provenance-label">Status</div>
              <div className="orion-artifact-provenance-value">{formatRunStatusLabel(item.run_status)}</div>
            </div>
            <div className="orion-artifact-provenance-item">
              <div className="orion-artifact-provenance-label">Created</div>
              <div className="orion-artifact-provenance-value">{toDateLabel(item.created_at)}</div>
            </div>
            <div className="orion-artifact-provenance-item">
              <div className="orion-artifact-provenance-label">Channel</div>
              <div className="orion-artifact-provenance-value">{connectorContext || '—'}</div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="orion-artifact-detail-tabs">
        <button
          type="button"
          className={`orion-artifact-detail-tab${activeTab === 'view' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('view')}
          disabled={!canRenderView}
          title={canRenderView ? viewLabel : 'Rendered view is unavailable for this file type.'}
        >
          View
        </button>
        <button
          type="button"
          className={`orion-artifact-detail-tab${activeTab === 'code' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('code')}
          disabled={!canShowCode}
          title={canShowCode ? 'Raw source view' : 'Code view is unavailable for this file type.'}
        >
          Code
        </button>
        <button
          type="button"
          className={`orion-artifact-detail-tab${activeTab === 'meta' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('meta')}
          title="Artifact metadata and provenance"
        >
          Meta
        </button>
      </div>

      <div className="orion-artifact-detail-body">
        {body}
      </div>
    </aside>
  );
}
