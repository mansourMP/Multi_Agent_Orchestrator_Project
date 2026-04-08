'use client';

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
    <>
      <div className="orion-artifact-meta-label">{label}</div>
      <div className={`orion-artifact-meta-value${monospace ? ' is-monospace' : ''}`}>{value && value.trim() ? value : '—'}</div>
    </>
  );
}

export function ArtifactMetaView({ item, previewTarget }: ArtifactMetaViewProps) {
  const connector = connectorBindingText(item.connector_binding);

  return (
    <div className="orion-artifact-meta-panel">
      <div className="orion-artifact-meta-intro">
        <div className="orion-artifact-meta-kicker">Metadata</div>
        <div className="orion-artifact-meta-title">Artifact facts and provenance</div>
        <p>Use this tab when you need the canonical URI, producing run, storage details, or machine context for this file.</p>
      </div>
      <div className="orion-artifact-meta-grid">
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
