'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Edit3 } from 'lucide-react';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';

export const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
  const { hideShellChrome } = useShellChromeVisibility(pathname);

  useEffect(() => {
    document.documentElement.style.setProperty('--topbar-height', hideShellChrome ? '0px' : '56px');
    return () => {
      document.documentElement.style.setProperty('--topbar-height', '56px');
    };
  }, [hideShellChrome]);

  if (hideShellChrome) {
    return null;
  }

  const showNewChatAction = pathname === '/';

  return (
    <header className="orion-shellbar" onWheel={forwardWheelToMainScroll}>
      <div className="orion-shellbar-section orion-shellbar-section-left" />
      <div className="orion-shellbar-section orion-shellbar-section-center" aria-hidden="true" />
      <div className="orion-shellbar-section orion-shellbar-section-right">
        {showNewChatAction ? (
          <button
            type="button"
            className="orion-shellbar-action"
            onClick={() => window.dispatchEvent(new Event(EMPYRALIS_NEW_CHAT_EVENT))}
          >
            <Edit3 size={13} />
            <span>New chat</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
