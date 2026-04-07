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

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <div className="orion-artifact-meta-label">{label}</div>
      <div className="orion-artifact-meta-value">{value && value.trim() ? value : '—'}</div>
    </>
  );
}

export function ArtifactMetaView({ item, previewTarget }: ArtifactMetaViewProps) {
  const connector = connectorBindingText(item.connector_binding);

  return (
    <div className="orion-artifact-meta-grid">
      <MetaRow label="Name" value={item.label || undefined} />
      <MetaRow label="Artifact URI" value={previewTarget.uri_or_path || undefined} />
      <MetaRow label="Content type" value={previewTarget.content_type || undefined} />
      <MetaRow label="Size" value={formatByteSize(previewTarget.byte_size)} />
      <MetaRow label="Run id" value={item.run_id || undefined} />
      <MetaRow label="Created" value={toDateLabel(item.created_at)} />
      <MetaRow label="Updated" value={toDateLabel(item.updated_at)} />
      <MetaRow label="Handler" value={item.agent_label || item.agent_role || undefined} />
      <MetaRow label="Channel" value={connector || undefined} />
      <MetaRow label="Machine id" value={previewTarget.machine_id || undefined} />
      <MetaRow label="Step id" value={previewTarget.step_id || undefined} />
      <MetaRow label="Storage" value={previewTarget.storage_backend || undefined} />
      <MetaRow label="Object key" value={previewTarget.object_key || undefined} />
    </div>
  );
}
