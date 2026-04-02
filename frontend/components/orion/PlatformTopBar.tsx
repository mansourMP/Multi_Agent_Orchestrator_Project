'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, Edit3, PanelRight, Search } from 'lucide-react';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import { safeNavigate } from '@/lib/safeNavigate';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';

export const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';
const EMPYRALIS_COMMAND_PALETTE_TOGGLE_EVENT = 'empyralis:command-palette-toggle';

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { inspectPanelOpen, setInspectPanelOpen } = usePlatformShell();

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
      <div className="orion-shellbar-section orion-shellbar-section-left">
        <button type="button" className="orion-shellbar-workspace" onClick={() => safeNavigate('/home')}>
          <span>Workspace</span>
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="orion-shellbar-section orion-shellbar-section-center" aria-hidden="true" />

      <div className="orion-shellbar-section orion-shellbar-section-right">
        <button
          type="button"
          className="orion-shellbar-action"
          onClick={() => window.dispatchEvent(new Event(EMPYRALIS_COMMAND_PALETTE_TOGGLE_EVENT))}
        >
          <Search size={13} />
          <span>Commands</span>
        </button>
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
        <button
          type="button"
          className={`orion-shellbar-action${inspectPanelOpen ? ' is-active' : ''}`}
          onClick={() => setInspectPanelOpen(!inspectPanelOpen)}
          aria-pressed={inspectPanelOpen}
        >
          <PanelRight size={13} />
          <span>Inspect</span>
        </button>
      </div>
    </header>
  );
}
