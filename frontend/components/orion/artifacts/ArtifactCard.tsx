'use client';

import Link from 'next/link';
import { FileStack, Image as ImageIcon } from 'lucide-react';
import {
  artifactActionHint,
  artifactFormatLabel,
  artifactFormatTone,
  artifactKindGroup,
  artifactKindLabel,
  artifactPathTail,
  artifactStatusTone,
  artifactSummary,
  artifactSurfaceLabel,
  compactText,
  connectorBindingText,
  toDateLabel,
  type ArtifactItem,
  type ArtifactView,
} from '@/lib/artifactsPresentation';

type ArtifactCardProps = {
  item: ArtifactItem;
  previewTarget: ArtifactItem;
  revealLabel: string;
  viewMode: ArtifactView;
  showReveal: boolean;
  onOpen: () => void;
  onReveal: () => void;
};

export function ArtifactCard({
  item,
  previewTarget,
  revealLabel,
  viewMode,
  showReveal,
  onOpen,
  onReveal,
}: ArtifactCardProps) {
  const kindGroup = artifactKindGroup(item.kind);
  const inspectHref = item.run_id
    ? `/runs/${encodeURIComponent(item.run_id)}/inspect?focus=${encodeURIComponent(
      item.focus_target || (kindGroup === 'screenshots' ? 'screenshots' : 'artifacts'),
    )}`
    : null;
  const resolvedLocation = String(previewTarget.uri_or_path || '').trim();
  const statusTone = item.run_status ? artifactStatusTone(item.run_status) : null;

  return (
    <article
      className="orion-asset-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div>
        <div className={`orion-asset-card-visual ${kindGroup === 'screenshots' ? 'is-screenshot' : ''}`}>
          <div className={`orion-asset-card-icon ${kindGroup === 'screenshots' ? 'is-screenshot' : ''}`}>
            {kindGroup === 'screenshots' ? <ImageIcon size={20} /> : <FileStack size={20} />}
          </div>
          <span
            className="orion-chip"
            style={{
              ...artifactFormatTone(item),
              position: 'absolute',
              top: 10,
              left: 10,
            }}
          >
            {artifactFormatLabel(item)}
          </span>
          {statusTone ? (
            <span
              className="orion-chip"
              style={{
                ...statusTone,
                position: 'absolute',
                top: 10,
                right: 10,
              }}
            >
              {item.run_status?.replace(/_/g, ' ')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="orion-asset-card-copy">
        <div className="orion-asset-card-title">{artifactSurfaceLabel(item)}</div>
        <div className="orion-asset-card-summary">
          {compactText(artifactSummary(item), artifactSummary(item), 110)}
        </div>
      </div>

      <div className="orion-asset-card-chips">
        <span className="orion-chip">{artifactKindLabel(item.kind)}</span>
        {item.agent_label ? <span className="orion-chip">{item.agent_label}</span> : null}
      </div>

      <div className="orion-asset-card-meta">
        <div className="orion-asset-card-hint">
          {artifactPathTail(resolvedLocation) || artifactActionHint(item)}
        </div>
        <div className="orion-asset-card-details">
          <span>{toDateLabel(item.updated_at)}</span>
          {item.run_id ? <span>Run {item.run_id.slice(0, 8)}</span> : null}
          {connectorBindingText(item.connector_binding) ? <span>{connectorBindingText(item.connector_binding)}</span> : null}
          {viewMode === 'system' && item.source ? <span>{item.source}</span> : null}
        </div>
      </div>

      <div className="orion-asset-card-actions">
        <button
          className="orion-btn orion-btn-ghost"
          style={{ minHeight: 34, paddingInline: 10 }}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          Open
        </button>
        {showReveal ? (
          <button
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 34, paddingInline: 10 }}
            onClick={(event) => {
              event.stopPropagation();
              onReveal();
            }}
          >
            {revealLabel}
          </button>
        ) : null}
        {inspectHref ? (
          <Link
            href={inspectHref}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 34, paddingInline: 10 }}
            onClick={(event) => event.stopPropagation()}
          >
            Source run
          </Link>
        ) : null}
      </div>
    </article>
  );
}
