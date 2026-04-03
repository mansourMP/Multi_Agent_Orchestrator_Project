'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Edit3 } from 'lucide-react';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';

export const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';

function routeTitle(pathname: string): string {
  if (pathname === '/') return 'Chat';
  if (pathname === '/home') return 'Home';
  if (pathname === '/agents') return 'Agents';
  if (pathname === '/library' || pathname === '/skills') return 'Library';
  if (pathname === '/connectors' || pathname === '/credentials' || pathname === '/connect-ai') return 'Integrations';
  if (pathname === '/usage') return 'Usage';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/account') return 'Account';

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'Chat';
  return segments[segments.length - 1]!
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
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

  const handleNewChat = () => {
    const dispatch = () => window.dispatchEvent(new Event(EMPYRALIS_NEW_CHAT_EVENT));
    if (pathname !== '/') {
      router.push('/');
      window.setTimeout(dispatch, 180);
      return;
    }
    dispatch();
  };

  return (
    <header className="orion-shellbar" onWheel={forwardWheelToMainScroll}>
      <div className="orion-shellbar-section orion-shellbar-section-left">
        <div className="orion-shellbar-page">
          <div className="orion-shellbar-page-row">
            <span className="orion-shellbar-title">{routeTitle(pathname)}</span>
          </div>
        </div>
      </div>
      <div className="orion-shellbar-section orion-shellbar-section-center" aria-hidden="true" />
      <div className="orion-shellbar-section orion-shellbar-section-right">
        <button type="button" className="orion-shellbar-icon-btn" aria-label="Notifications">
          <Bell size={18} strokeWidth={2.2} />
        </button>
        <button type="button" className="orion-shellbar-action" onClick={handleNewChat}>
          <Edit3 size={13} />
          <span>New chat</span>
        </button>
      </div>
    </header>
  );
}
