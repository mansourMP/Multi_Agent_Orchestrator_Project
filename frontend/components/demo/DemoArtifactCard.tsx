'use client';

import Link from 'next/link';
import { ImageIcon, Link2 } from 'lucide-react';
import type { DesktopDemoStatus } from '@/lib/desktopFirstRun';

type DemoArtifactCardProps = {
  demo: DesktopDemoStatus;
};

export function DemoArtifactCard({ demo }: DemoArtifactCardProps) {
  const artifact = demo.artifact;
  if (!artifact?.uri) {
    return (
      <div className="orion-demo-artifact-card is-empty">
        <div className="orion-demo-artifact-card__icon">
          <ImageIcon size={20} />
        </div>
        <div className="orion-demo-artifact-card__body">
          <div className="orion-demo-artifact-card__title">Artifact not ready yet</div>
          <p>The demo completed, but the screenshot artifact has not been indexed yet.</p>
        </div>
      </div>
    );
  }

  const isImage = String(artifact.content_type || '').startsWith('image/');
  const contentHref = `/api/artifacts/content?path=${encodeURIComponent(artifact.uri)}`;
  const artifactHref = artifact.artifact_id
    ? `/artifacts?artifact=${encodeURIComponent(artifact.artifact_id)}`
    : `/artifacts?artifactPath=${encodeURIComponent(artifact.uri)}`;

  return (
    <article className="orion-demo-artifact-card">
      <div className="orion-demo-artifact-card__media">
        {isImage ? (
          <img src={contentHref} alt={artifact.label || 'Demo screenshot'} />
        ) : (
          <div className="orion-demo-artifact-card__placeholder">
            <ImageIcon size={22} />
          </div>
        )}
      </div>
      <div className="orion-demo-artifact-card__body">
        <div className="orion-demo-artifact-card__eyebrow">Saved artifact</div>
        <div className="orion-demo-artifact-card__title">{artifact.label || 'Desktop screenshot'}</div>
        <div className="orion-demo-artifact-card__meta">
          <span>{artifact.kind || 'artifact'}</span>
          {artifact.byte_size ? <span>{Math.max(1, Math.round(artifact.byte_size / 1024))} KB</span> : null}
          {artifact.content_type ? <span>{artifact.content_type}</span> : null}
        </div>
        <div className="orion-demo-artifact-card__actions">
          <Link href={artifactHref} className="orion-btn orion-btn-primary">
            <Link2 size={14} />
            Open in artifacts
          </Link>
          <a className="orion-btn orion-btn-ghost" href={contentHref} download={artifact.label || 'empyralis-demo-artifact'}>
            Download
          </a>
        </div>
      </div>
    </article>
  );
}
