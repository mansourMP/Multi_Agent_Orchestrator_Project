'use client';

import { useEffect, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { UI } from '@/app/page.catalog';

type WorkbenchShellProps = {
  topError: string | null;
  statusNotice: string | null;
  children: ReactNode;
};

function formatSimpleTopError(message: string): string {
  const text = message.trim();
  if (!text) return '';
  const normalized = text.toLowerCase();
  if (normalized.includes('provider profiles path is not writable')) {
    return 'Local companion setup issue: provider profile storage is not writable.';
  }
  if (normalized.includes('setup is not complete')) {
    return 'Setup is incomplete. Finish setup before running tasks.';
  }
  if (normalized.includes('failed to load live workspace snapshot')) {
    return 'Live platform status is temporarily unavailable.';
  }
  return text;
}

export function WorkbenchShell({
  topError,
  statusNotice,
  children,
}: WorkbenchShellProps) {
  const simpleTopError = topError ? formatSimpleTopError(topError) : null;

  useEffect(() => {
    document.body.classList.add('orion-chat-home');
    return () => {
      document.body.classList.remove('orion-chat-home');
    };
  }, []);

  return (
    <div
      className="orion-page-shell orion-animate-in is-chat-home"
      style={{
        color: UI.text,
        maxWidth: 'none',
      }}
    >
      {simpleTopError ? (
        <div
          style={{
            marginBottom: 12,
            alignSelf: 'stretch',
            width: '100%',
            borderRadius: 10,
            border: `1px solid ${UI.errorBorder}`,
            background: UI.errorBg,
            color: UI.errorFg,
            padding: '10px 12px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={14} />
          {simpleTopError}
        </div>
      ) : null}
      {!simpleTopError && statusNotice ? (
        <div
          style={{
            marginBottom: 12,
            alignSelf: 'stretch',
            width: '100%',
            borderRadius: 10,
            border: `1px solid ${UI.borderSoft}`,
            background: UI.surfaceAlt,
            color: UI.textMuted,
            padding: '8px 12px',
            fontSize: 12,
          }}
        >
          {statusNotice}
        </div>
      ) : null}

      {children}
    </div>
  );
}
