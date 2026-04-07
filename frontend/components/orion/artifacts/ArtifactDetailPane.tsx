'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Download, ExternalLink, FolderOpen } from 'lucide-react';
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
  artifactSurfaceLabel,
  compactText,
  connectorBindingText,
  toDateLabel,
  type ArtifactItem,
} from '@/lib/artifactsPresentation';
import { ArtifactCodeView } from './ArtifactCodeView';
import { ArtifactHtmlPreview } from './ArtifactHtmlPreview';
import { ArtifactMarkdownPreview } from './ArtifactMarkdownPreview';

type ArtifactDetailPaneProps = {
  item: ArtifactItem | null;
  previewTarget: ArtifactItem | null;
  contentHref: string | null;
  downloadHref: string | null;
  showReveal: boolean;
  revealLabel: string;
  onOpenExternal: () => void;
  onReveal: () => void;
};

type ViewTab = 'view' | 'code';

export function ArtifactDetailPane({
  item,
  previewTarget,
  contentHref,
  downloadHref,
  showReveal,
  revealLabel,
  onOpenExternal,
  onReveal,
}: ArtifactDetailPaneProps) {
  const previewMode = useMemo(() => (previewTarget ? artifactPreviewMode(previewTarget) : 'none'), [previewTarget]);
  const [activeTab, setActiveTab] = useState<ViewTab>(previewTarget ? artifactDefaultViewerTab(previewTarget) : 'code');
  const [textContent, setTextContent] = useState<string>('');
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string>('');

  useEffect(() => {
    if (!previewTarget) {
      setActiveTab('code');
      return;
    }
    setActiveTab(artifactDefaultViewerTab(previewTarget));
  }, [previewTarget]);

  useEffect(() => {
    if (!previewTarget || previewMode === 'none') {
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
  }, [previewMode, previewTarget]);

  useEffect(() => {
    if (activeTab === 'view' && previewMode !== 'html' && contentError) {
      setActiveTab('code');
    }
  }, [activeTab, contentError, previewMode]);

  if (!item || !previewTarget) {
    return (
      <aside className="orion-artifact-detail-pane is-empty">
        <div className="orion-artifact-detail-empty">
          <div className="orion-panel-title">Select an artifact</div>
          <p>Choose an HTML page, markdown file, or code/text output to inspect it here.</p>
        </div>
      </aside>
    );
  }

  const formatTone = artifactFormatTone(previewTarget);
  const canRenderView = previewMode !== 'none';
  const canShowCode = previewMode !== 'none';
  const inspectHref = item.run_id
    ? `/runs/${encodeURIComponent(item.run_id)}/inspect?focus=${encodeURIComponent(item.focus_target || 'artifacts')}`
    : null;
  const codeLanguage = artifactCodeLanguage(previewTarget);
  const resolvedLocation = String(previewTarget.uri_or_path || '').trim();
  const viewLabel = previewMode === 'html'
    ? 'Rendered page'
    : previewMode === 'markdown'
      ? 'Rendered markdown'
      : 'Formatted text';

  let body: React.ReactNode;
  if (activeTab === 'view') {
    if (!canRenderView) {
      body = (
        <div className="orion-artifact-detail-fallback">
          Rendered view is not available for this file type yet. Use Code or Download.
        </div>
      );
    } else if (previewMode === 'html') {
      body = (
        <div className="orion-artifact-detail-body-frame">
          <div className="orion-artifact-detail-inline-note">Sandboxed HTML preview. Scripts, forms, and parent-page access are disabled.</div>
          <ArtifactHtmlPreview title={`Preview ${artifactSurfaceLabel(item)}`} src={contentHref || ''} />
        </div>
      );
    } else if (contentLoading) {
      body = <div className="orion-artifact-detail-fallback">Loading preview…</div>;
    } else if (contentError) {
      body = <div className="orion-artifact-detail-fallback">{contentError}</div>;
    } else if (previewMode === 'markdown') {
      body = <ArtifactMarkdownPreview content={textContent} />;
    } else {
      body = <pre className="orion-artifact-preview is-text">{textContent}</pre>;
    }
  } else if (!canShowCode) {
    body = (
      <div className="orion-artifact-detail-fallback">
        Raw source preview is only available for HTML, markdown, and text/code artifacts in this sprint.
      </div>
    );
  } else if (contentLoading) {
    body = <div className="orion-artifact-detail-fallback">Loading source…</div>;
  } else if (contentError) {
    body = <div className="orion-artifact-detail-fallback">{contentError}</div>;
  } else {
    body = <ArtifactCodeView code={textContent} language={codeLanguage} />;
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
            <span>{toDateLabel(item.updated_at)}</span>
            {item.run_id ? <span>Run {item.run_id.slice(0, 8)}</span> : null}
            {item.agent_label ? <span>{item.agent_label}</span> : null}
            {connectorBindingText(item.connector_binding) ? <span>{connectorBindingText(item.connector_binding)}</span> : null}
          </div>
        </div>

        <div className="orion-artifact-detail-actions">
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
          {inspectHref ? (
            <Link href={inspectHref} className="orion-btn orion-btn-ghost">
              <ArrowUpRight size={13} />
              Source run
            </Link>
          ) : null}
        </div>
      </div>

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
      </div>

      <div className="orion-artifact-detail-body">
        {body}
      </div>
    </aside>
  );
}
