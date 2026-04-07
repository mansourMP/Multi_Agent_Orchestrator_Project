'use client';

type ArtifactHtmlPreviewProps = {
  title: string;
  src: string;
};

export function ArtifactHtmlPreview({ title, src }: ArtifactHtmlPreviewProps) {
  return (
    <iframe
      title={title}
      className="orion-artifact-html-frame"
      sandbox=""
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}
