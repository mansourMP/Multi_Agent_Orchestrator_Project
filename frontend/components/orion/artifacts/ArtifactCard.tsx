'use client';

import Link from 'next/link';
import { FileStack, Image as ImageIcon } from 'lucide-react';
import {
  DESIGN_TOKENS,
  badgeStyle,
  bodyTextStyle,
  buttonStyle,
  mergeStyles,
  metaTextStyle,
  panelStyle,
} from '@/design-constraints';
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
  isSelected: boolean;
  revealLabel: string;
  viewMode: ArtifactView;
  showReveal: boolean;
  onSelect: () => void;
  onReveal: () => void;
};

export function ArtifactCard({
  item,
  previewTarget,
  isSelected,
  revealLabel,
  viewMode,
  showReveal,
  onSelect,
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
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      style={mergeStyles(panelStyle({ muted: !isSelected, padding: DESIGN_TOKENS.space[4], interactive: true }), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
        alignContent: 'start',
        background: isSelected ? DESIGN_TOKENS.color.surface : DESIGN_TOKENS.color.surfaceMuted,
        borderColor: isSelected ? DESIGN_TOKENS.color.accentStrong : DESIGN_TOKENS.color.borderSubtle,
        boxShadow: isSelected ? DESIGN_TOKENS.shadow.focus : DESIGN_TOKENS.shadow.subtle,
      })}
    >
      <div
        style={{
          position: 'relative',
          minHeight: 92,
          borderRadius: DESIGN_TOKENS.radius.lg,
          border: `1px solid ${isSelected ? DESIGN_TOKENS.color.accentSoft : DESIGN_TOKENS.color.borderSubtle}`,
          background: kindGroup === 'screenshots' ? DESIGN_TOKENS.color.accentSoft : DESIGN_TOKENS.color.surface,
          padding: DESIGN_TOKENS.space[3],
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: DESIGN_TOKENS.radius.lg,
            display: 'grid',
            placeItems: 'center',
            background: kindGroup === 'screenshots' ? DESIGN_TOKENS.color.surface : DESIGN_TOKENS.color.surfaceMuted,
            border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
            color: kindGroup === 'screenshots' ? DESIGN_TOKENS.color.accentText : DESIGN_TOKENS.color.textSecondary,
          }}
        >
            {kindGroup === 'screenshots' ? <ImageIcon size={20} /> : <FileStack size={20} />}
        </div>
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2], justifyItems: 'end' }}>
          <span
            style={{
              ...badgeStyle('neutral'),
              ...artifactFormatTone(item),
            }}
          >
            {artifactFormatLabel(item)}
          </span>
          {statusTone ? (
            <span
              style={{
                ...badgeStyle('neutral'),
                ...statusTone,
              }}
            >
              {item.run_status?.replace(/_/g, ' ')}
            </span>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: DESIGN_TOKENS.space[3],
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              margin: 0,
              color: DESIGN_TOKENS.color.textPrimary,
              fontSize: DESIGN_TOKENS.type.size.bodyLg,
              fontWeight: DESIGN_TOKENS.type.weight.semibold,
              lineHeight: DESIGN_TOKENS.type.lineHeight.snug,
              letterSpacing: DESIGN_TOKENS.type.tracking.tight,
            }}
          >
            {artifactSurfaceLabel(item)}
          </div>
          <span style={badgeStyle('neutral')}>{artifactKindLabel(item.kind)}</span>
        </div>
        <div style={mergeStyles(bodyTextStyle(), { minHeight: 44 })}>
          {compactText(artifactSummary(item), artifactSummary(item), 110)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap' }}>
        {item.agent_label ? <span style={badgeStyle('neutral')}>{item.agent_label}</span> : null}
        {item.focus_target ? <span style={badgeStyle('neutral')}>{item.focus_target.replace(/_/g, ' ')}</span> : null}
      </div>

      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
        <div style={mergeStyles(metaTextStyle(), { color: DESIGN_TOKENS.color.textSecondary })}>
          {artifactPathTail(resolvedLocation) || artifactActionHint(item)}
        </div>
        <div style={mergeStyles(metaTextStyle(), { display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' })}>
          <span>{toDateLabel(item.updated_at)}</span>
          {item.run_id ? <span>Run {item.run_id.slice(0, 8)}</span> : null}
          {connectorBindingText(item.connector_binding) ? <span>{connectorBindingText(item.connector_binding)}</span> : null}
          {viewMode === 'system' && item.source ? <span>{item.source}</span> : null}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: DESIGN_TOKENS.space[2],
          flexWrap: 'wrap',
          paddingTop: DESIGN_TOKENS.space[2],
          borderTop: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
        }}
      >
        <button
          type="button"
          style={buttonStyle({ tone: 'ghost', size: 'sm' })}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          Inspect
        </button>
        {showReveal ? (
          <button
            type="button"
            style={buttonStyle({ tone: 'ghost', size: 'sm' })}
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
            style={mergeStyles(
              {
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
              },
              buttonStyle({ tone: 'ghost', size: 'sm' }),
            )}
            onClick={(event) => event.stopPropagation()}
          >
            Source run
          </Link>
        ) : null}
      </div>
    </article>
  );
}
