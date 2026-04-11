'use client';

import { useEffect, type ReactNode } from 'react';

type WorkbenchShellProps = {
  topError: string | null;
  statusNotice: string | null;
  children: ReactNode;
};

export function WorkbenchShell({
  topError,
  statusNotice,
  children,
}: WorkbenchShellProps) {
  useEffect(() => {
    document.body.classList.add('orion-chat-home');
    return () => {
      document.body.classList.remove('orion-chat-home');
    };
  }, []);

  return (
    <div
      className="orion-page-shell orion-animate-in is-chat-home"
      style={{ maxWidth: 'none' }}
    >
      {children}
    </div>
  );
}
