'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useDesktopShell } from '@/lib/desktopBridge';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function detectSafari(): { isSafari: boolean; isIOS: boolean } {
  if (typeof navigator === 'undefined') return { isSafari: false, isIOS: false };
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg/i.test(ua);
  return { isSafari, isIOS };
}

export default function PwaInstallControl() {
  const isDesktopShell = useDesktopShell();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const safari = useMemo(() => detectSafari(), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsInstalled(isStandaloneMode());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || isDesktopShell) return;
    if (!(window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return;
    }
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, [isDesktopShell]);

  useEffect(() => {
    if (typeof window === 'undefined' || isDesktopShell) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowInstructions(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [isDesktopShell]);

  const buttonLabel = deferredPrompt
    ? 'Install app'
    : safari.isSafari
      ? safari.isIOS
        ? 'Add to Home Screen'
        : 'Add to Dock'
      : '';

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return;
    }
    setShowInstructions(true);
  };

  if (isDesktopShell || isInstalled) return null;
  if (!deferredPrompt && !safari.isSafari) return null;

  return (
    <>
      <button
        type="button"
        className="orion-shellbar-install-btn"
        onClick={() => void handleInstall()}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <Download size={14} />
        <span>{buttonLabel}</span>
      </button>

      {showInstructions ? (
        <div className="orion-modal-overlay" onClick={() => setShowInstructions(false)}>
          <div className="orion-modal orion-pwa-modal" onClick={(event) => event.stopPropagation()}>
            <div className="orion-pwa-modal-head">
              <div>
                <div className="orion-panel-title">Install Empyralis</div>
                <div className="orion-panel-copy">
                  {safari.isIOS
                    ? 'Safari on iPhone and iPad installs this app from the Share menu.'
                    : 'Safari on macOS installs this app through Add to Dock.'}
                </div>
              </div>
              <button type="button" className="orion-pwa-modal-close" onClick={() => setShowInstructions(false)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <ol className="orion-pwa-steps">
              {safari.isIOS ? (
                <>
                  <li>Open this platform in Safari.</li>
                  <li>Tap the Share button.</li>
                  <li>Choose “Add to Home Screen”.</li>
                </>
              ) : (
                <>
                  <li>Open this platform in Safari.</li>
                  <li>Use the Share button in the toolbar.</li>
                  <li>Choose “Add to Dock”.</li>
                </>
              )}
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}
