'use client';

import { useEffect } from 'react';

type DesktopSignInCompleteProps = {
  enabled: boolean;
};

export default function DesktopSignInComplete({ enabled }: DesktopSignInCompleteProps) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      window.close();
      window.location.replace('about:blank');
    }, 600);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  return null;
}
