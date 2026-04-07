'use client';

import ReactMarkdown from 'react-markdown';

type ArtifactMarkdownPreviewProps = {
  content: string;
};

export function ArtifactMarkdownPreview({ content }: ArtifactMarkdownPreviewProps) {
  return (
    <div className="orion-artifact-preview markdown">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
