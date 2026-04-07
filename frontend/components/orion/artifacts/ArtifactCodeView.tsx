'use client';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

type ArtifactCodeViewProps = {
  code: string;
  language: string;
};

export function ArtifactCodeView({ code, language }: ArtifactCodeViewProps) {
  return (
    <div className="orion-artifact-detail-code">
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        wrapLongLines
        customStyle={{
          margin: 0,
          minHeight: '100%',
          borderRadius: 0,
          padding: '18px 20px',
          background: 'transparent',
          fontSize: '12.75px',
          lineHeight: 1.65,
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono, "SFMono-Regular", Consolas, monospace)' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
