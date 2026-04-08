'use client';

import Link from 'next/link';
import { ImageIcon, Link2 } from 'lucide-react';
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
import type { DesktopDemoStatus } from '@/lib/desktopFirstRun';

type DemoArtifactCardProps = {
  demo: DesktopDemoStatus;
};

const linkButtonBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: DESIGN_TOKENS.space[2],
  textDecoration: 'none',
  fontFamily: DESIGN_TOKENS.type.family,
} as const;

export function DemoArtifactCard({ demo }: DemoArtifactCardProps) {
  const artifact = demo.artifact;
  if (!artifact?.uri) {
    return (
      <div
        style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[5] }), {
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          gap: DESIGN_TOKENS.space[4],
          alignItems: 'start',
        })}
      >
        <div
          style={{
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: DESIGN_TOKENS.radius.lg,
            border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
            background: DESIGN_TOKENS.color.surfaceMuted,
            color: DESIGN_TOKENS.color.textSecondary,
          }}
        >
          <ImageIcon size={20} />
        </div>
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
          <div style={sectionTitleStyle()}>Artifact not ready yet</div>
          <p style={bodyTextStyle()}>The demo completed, but the screenshot artifact has not been indexed yet.</p>
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
    <article
      style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[5] }), {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: DESIGN_TOKENS.space[5],
      })}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 220,
          overflow: 'hidden',
          borderRadius: DESIGN_TOKENS.radius.xl,
          border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
          background: DESIGN_TOKENS.color.surfaceMuted,
        }}
      >
        {isImage ? (
          <img
            src={contentHref}
            alt={artifact.label || 'Demo screenshot'}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              display: 'grid',
              placeItems: 'center',
              borderRadius: DESIGN_TOKENS.radius.lg,
              background: DESIGN_TOKENS.color.accentSoft,
              color: DESIGN_TOKENS.color.accentText,
            }}
          >
            <ImageIcon size={22} />
          </div>
        )}
      </div>
      <div style={{ display: 'grid', alignContent: 'start', gap: DESIGN_TOKENS.space[3] }}>
        <div style={eyebrowStyle()}>Saved artifact</div>
        <div style={sectionTitleStyle()}>{artifact.label || 'Desktop screenshot'}</div>
        <div style={mergeStyles(metaTextStyle(), { display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' })}>
          <span>{artifact.kind || 'artifact'}</span>
          {artifact.byte_size ? <span>{Math.max(1, Math.round(artifact.byte_size / 1024))} KB</span> : null}
          {artifact.content_type ? <span>{artifact.content_type}</span> : null}
        </div>
        <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>
          <Link
            href={artifactHref}
            style={mergeStyles(buttonStyle({ tone: 'primary' }), linkButtonBaseStyle)}
          >
            <Link2 size={14} />
            Open in artifacts
          </Link>
          <a
            href={contentHref}
            download={artifact.label || 'empyralis-demo-artifact'}
            style={mergeStyles(buttonStyle({ tone: 'ghost' }), linkButtonBaseStyle)}
          >
            Download
          </a>
        </div>
      </div>
    </article>
  );
}
