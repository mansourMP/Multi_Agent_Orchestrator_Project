'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FolderOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  buttonStyle,
  eyebrowStyle,
  mergeStyles,
  metaTextStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';
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
const ARTIFACT_VIEWER_TAB_PREFS_KEY = 'hekor.artifact-viewer.tab-prefs.v1';

function preferredTabKey(previewMode: string, codeLanguage: string): string {
  if (previewMode === 'text') return `text:${codeLanguage}`;
  return previewMode;
}

function readPreferredTabs(): Partial<Record<string, ViewTab>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(ARTIFACT_VIEWER_TAB_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<string, ViewTab>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePreferredTab(key: string, value: ViewTab) {
  if (typeof window === 'undefined') return;
  try {
    const next = readPreferredTabs();
    next[key] = value;
    window.sessionStorage.setItem(ARTIFACT_VIEWER_TAB_PREFS_KEY, JSON.stringify(next));
  } catch {
    // Ignore tab preference persistence failures.
  }
}

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
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const canRenderView = Boolean(previewTarget && artifactSupportsRenderedView(previewTarget));
  const canShowCode = Boolean(previewTarget && artifactSupportsCodeView(previewTarget));
  const codeLanguage = previewTarget ? artifactCodeLanguage(previewTarget) : 'text';
  const previewPreferenceKey = previewTarget ? preferredTabKey(previewMode, codeLanguage) : null;

  useEffect(() => {
    if (!previewTarget) {
      setActiveTab('meta');
      return;
    }
    const fallback = artifactDefaultViewerTab(previewTarget);
    const preferred = previewPreferenceKey ? readPreferredTabs()[previewPreferenceKey] : null;
    if (preferred === 'view' && canRenderView) {
      setActiveTab('view');
      return;
    }
    if (preferred === 'code' && canShowCode) {
      setActiveTab('code');
      return;
    }
    if (preferred === 'meta') {
      setActiveTab('meta');
      return;
    }
    setActiveTab(fallback);
  }, [canRenderView, canShowCode, previewPreferenceKey, previewTarget]);

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

  useEffect(() => {
    if (copyState === 'idle') return undefined;
    const timer = window.setTimeout(() => setCopyState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    if (previewPreferenceKey) writePreferredTab(previewPreferenceKey, tab);
  };

  const tabButtonStyle = (tab: ViewTab) => ({
    ...buttonStyle({ tone: activeTab === tab ? 'secondary' : 'ghost', size: 'sm' as const }),
    background: activeTab === tab ? DESIGN_TOKENS.color.surface : 'transparent',
    color: activeTab === tab ? DESIGN_TOKENS.color.textPrimary : DESIGN_TOKENS.color.textSecondary,
    borderColor: activeTab === tab ? DESIGN_TOKENS.color.borderStrong : 'transparent',
  });

  if (!item || !previewTarget) {
    return (
      <aside
        style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[6] }), {
          display: 'grid',
          placeItems: 'center',
          minHeight: 560,
          background: DESIGN_TOKENS.color.surfaceMuted,
        })}
      >
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3], maxWidth: 420 }}>
          <div style={eyebrowStyle()}>Artifacts workspace</div>
          <div style={sectionTitleStyle()}>Select an artifact</div>
          <p style={bodyTextStyle()}>
            Choose an output, screenshot, page, or support file to inspect it inside Empyralis with preview, code, and provenance in one place.
          </p>
        </div>
      </aside>
    );
  }

  const formatTone = artifactFormatTone(previewTarget);
  const inspectHref = item.run_id
    ? `/runs/${encodeURIComponent(item.run_id)}/inspect?focus=${encodeURIComponent(item.focus_target || 'artifacts')}`
    : null;
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
  const copyActionLabel = copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy path';

  const handleCopyPath = async () => {
    if (!resolvedLocation || typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyState('failed');
      return;
    }
    try {
      await navigator.clipboard.writeText(resolvedLocation);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

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
    <aside
      style={mergeStyles(panelStyle({ padding: 0 }), {
        display: 'grid',
        alignContent: 'start',
        overflow: 'hidden',
      })}
    >
      <div
        style={{
          display: 'grid',
          gap: DESIGN_TOKENS.space[5],
          padding: DESIGN_TOKENS.space[5],
          borderBottom: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: DESIGN_TOKENS.space[4],
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3], minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: DESIGN_TOKENS.space[3],
                flexWrap: 'wrap',
              }}
            >
              <div style={eyebrowStyle()}>Artifact viewer</div>
              <span style={mergeStyles(metaTextStyle(), {
                padding: `${DESIGN_TOKENS.space[2]}px ${DESIGN_TOKENS.space[3]}px`,
                borderRadius: DESIGN_TOKENS.radius.pill,
                border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
                background: DESIGN_TOKENS.color.surfaceMuted,
              })}
              >
                {artifactPathTail(resolvedLocation) || 'Saved artifact'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: DESIGN_TOKENS.space[2],
                flexWrap: 'wrap',
              }}
            >
              <h3 style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.title, minWidth: 0 })}>
                {artifactSurfaceLabel(item)}
              </h3>
              <Badge style={formatTone}>{artifactFormatLabel(previewTarget)}</Badge>
              <Badge variant="secondary">{artifactKindLabel(item.kind)}</Badge>
            </div>
            <p style={mergeStyles(bodyTextStyle(), { maxWidth: 720 })}>
              {compactText(artifactSummary(item), artifactActionHint(item), 220)}
            </p>
            <div style={mergeStyles(metaTextStyle(), { display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' })}>
              <span>{resolvedLocation || 'Saved artifact'}</span>
              {item.run_id ? <span>Run {item.run_id.slice(0, 8)}</span> : null}
              {item.agent_label ? <span>{item.agent_label}</span> : null}
              {connectorContext ? <span>{connectorContext}</span> : null}
            </div>
          </div>

          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3], justifyItems: 'end' }}>
            <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {showBackButton ? (
                <Button type="button" variant="ghost" size="sm" onClick={onBack} title="Back to list (Esc)">
                  <ChevronLeft size={13} />
                  Back
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onPreviousArtifact}
                disabled={!hasPreviousArtifact}
                title="Previous artifact (Left arrow)"
              >
                <ChevronLeft size={13} />
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onNextArtifact}
                disabled={!hasNextArtifact}
                title="Next artifact (Right arrow)"
              >
                Next
                <ChevronRight size={13} />
              </Button>
            </div>
            <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopyPath()}>
                {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
                {copyActionLabel}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onOpenExternal}>
                <ExternalLink size={13} />
                Open externally
              </Button>
              {downloadHref ? (
                <a
                  href={downloadHref}
                  download={artifactPathTail(resolvedLocation) || undefined}
                  style={mergeStyles(
                    {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: DESIGN_TOKENS.space[2],
                      textDecoration: 'none',
                    },
                    buttonStyle({ tone: 'ghost', size: 'sm' }),
                  )}
                >
                  <Download size={13} />
                  Download
                </a>
              ) : null}
              {showReveal ? (
                <Button type="button" variant="ghost" size="sm" onClick={onReveal}>
                  <FolderOpen size={13} />
                  {revealLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {sourceRunContextVisible ? (
          <section
            aria-label="Source run context"
            style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
              display: 'grid',
              gap: DESIGN_TOKENS.space[4],
              background: DESIGN_TOKENS.color.surfaceMuted,
            })}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: DESIGN_TOKENS.space[3],
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
                <div style={eyebrowStyle()}>Source run context</div>
                <div style={sectionTitleStyle()}>
                  {item.run_id ? `Run ${item.run_id.slice(0, 8)}` : 'Artifact provenance'}
                </div>
              </div>
              {inspectHref ? (
                <Link
                  href={inspectHref}
                  style={mergeStyles(
                    {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: DESIGN_TOKENS.space[2],
                      textDecoration: 'none',
                    },
                    buttonStyle({ tone: 'ghost', size: 'sm' }),
                  )}
                >
                  <ArrowUpRight size={13} />
                  Open run inspection
                </Link>
              ) : null}
            </div>
            <div
              style={{
                display: 'grid',
                gap: DESIGN_TOKENS.space[3],
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              }}
            >
              {[
                ['Run id', item.run_id || '—'],
                ['Agent', item.agent_label || item.agent_role || '—'],
                ['Status', formatRunStatusLabel(item.run_status)],
                ['Created', toDateLabel(item.created_at)],
                ['Channel', connectorContext || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
                  <div style={mergeStyles(metaTextStyle(), { textTransform: 'uppercase', letterSpacing: DESIGN_TOKENS.type.tracking.wide })}>{label}</div>
                  <div style={{ color: DESIGN_TOKENS.color.textPrimary, fontSize: DESIGN_TOKENS.type.size.body }}>{value}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: DESIGN_TOKENS.space[2],
          flexWrap: 'wrap',
          padding: `${DESIGN_TOKENS.space[4]}px ${DESIGN_TOKENS.space[5]}px 0`,
        }}
      >
        <button
          type="button"
          style={tabButtonStyle('view')}
          onClick={() => handleTabChange('view')}
          disabled={!canRenderView}
          title={canRenderView ? viewLabel : 'Rendered view is unavailable for this file type.'}
        >
          View
        </button>
        <button
          type="button"
          style={tabButtonStyle('code')}
          onClick={() => handleTabChange('code')}
          disabled={!canShowCode}
          title={canShowCode ? 'Raw source view' : 'Code view is unavailable for this file type.'}
        >
          Code
        </button>
        <button
          type="button"
          style={tabButtonStyle('meta')}
          onClick={() => handleTabChange('meta')}
          title="Artifact metadata and provenance"
        >
          Meta
        </button>
      </div>

      <div
        style={{
          padding: DESIGN_TOKENS.space[5],
          display: 'grid',
          gap: DESIGN_TOKENS.space[4],
          background: DESIGN_TOKENS.color.surfaceInteractive,
        }}
      >
        {body}
      </div>
    </aside>
  );
}
