'use client';

import { useEffect } from 'react';

type DesktopSignInCompleteProps = {
  enabled: boolean;
};

export default function DesktopSignInComplete({ enabled }: DesktopSignInCompleteProps) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // Keep the completion page visible if the browser refuses to close.
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  return null;
}
