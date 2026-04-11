'use client';

import {
  DESIGN_TOKENS,
  bodyTextStyle,
  eyebrowStyle,
  mergeStyles,
  metaTextStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';
import {
  connectorBindingText,
  formatByteSize,
  toDateLabel,
  type ArtifactItem,
} from '@/lib/artifactsPresentation';

type ArtifactMetaViewProps = {
  item: ArtifactItem;
  previewTarget: ArtifactItem;
};

function MetaRow({ label, value, monospace = false }: { label: string; value?: string | null; monospace?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: DESIGN_TOKENS.space[1],
        paddingBottom: DESIGN_TOKENS.space[3],
        borderBottom: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
      }}
    >
      <div style={mergeStyles(metaTextStyle(), { textTransform: 'uppercase', letterSpacing: DESIGN_TOKENS.type.tracking.wide })}>
        {label}
      </div>
      <div
        style={{
          color: DESIGN_TOKENS.color.textPrimary,
          fontFamily: monospace ? DESIGN_TOKENS.type.mono : DESIGN_TOKENS.type.family,
          fontSize: monospace ? DESIGN_TOKENS.type.size.label : DESIGN_TOKENS.type.size.body,
          lineHeight: DESIGN_TOKENS.type.lineHeight.normal,
          overflowWrap: 'anywhere',
        }}
      >
        {value && value.trim() ? value : '—'}
      </div>
    </div>
  );
}

export function ArtifactMetaView({ item, previewTarget }: ArtifactMetaViewProps) {
  const connector = connectorBindingText(item.connector_binding);

  return (
    <div
      style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[5] }), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[5],
        background: DESIGN_TOKENS.color.surfaceMuted,
      })}
    >
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
        <div style={eyebrowStyle()}>Metadata</div>
        <div style={sectionTitleStyle()}>Artifact facts and provenance</div>
        <p style={bodyTextStyle()}>
          Use this tab when you need the canonical URI, producing run, storage details, or machine context for this file.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gap: DESIGN_TOKENS.space[4],
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        }}
      >
        <MetaRow label="Name" value={item.label || undefined} />
        <MetaRow label="Artifact URI" value={previewTarget.uri_or_path || undefined} monospace />
        <MetaRow label="Content type" value={previewTarget.content_type || undefined} />
        <MetaRow label="Size" value={formatByteSize(previewTarget.byte_size)} />
        <MetaRow label="Run id" value={item.run_id || undefined} monospace />
        <MetaRow label="Created" value={toDateLabel(item.created_at)} />
        <MetaRow label="Updated" value={toDateLabel(item.updated_at)} />
        <MetaRow label="Handler" value={item.agent_label || item.agent_role || undefined} />
        <MetaRow label="Channel" value={connector || undefined} />
        <MetaRow label="Machine id" value={previewTarget.machine_id || undefined} monospace />
        <MetaRow label="Step id" value={previewTarget.step_id || undefined} monospace />
        <MetaRow label="Storage" value={previewTarget.storage_backend || undefined} />
        <MetaRow label="Object key" value={previewTarget.object_key || undefined} monospace />
      </div>
    </div>
  );
}
