'use client';

import { useEffect, useState } from 'react';
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

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export default function PwaInstallControl() {
  const isDesktopShell = useDesktopShell();
  const [mounted, setMounted] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstalledNotice, setShowInstalledNotice] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [safari, setSafari] = useState<{ isSafari: boolean; isIOS: boolean }>({ isSafari: false, isIOS: false });

  useEffect(() => {
    setMounted(true);
    setSafari(detectSafari());
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    setIsInstalled(isStandaloneMode());
  }, [mounted]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || !('serviceWorker' in navigator) || isDesktopShell) return;
    if (isLocalDevHost()) {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())).catch(() => undefined),
      );
      if ('caches' in window) {
        void caches.keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith('empyralis-pwa'))
                .map((key) => caches.delete(key)),
            ),
          )
          .catch(() => undefined);
      }
      return;
    }
    if (!(window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return;
    }
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, [isDesktopShell, mounted]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || isDesktopShell) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowInstructions(false);
      setShowInstalledNotice(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [isDesktopShell, mounted]);

  useEffect(() => {
    if (!showInstructions) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowInstructions(false);
    };
    document.body.classList.add('orion-modal-open');
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('orion-modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showInstructions]);

  const buttonLabel = deferredPrompt
    ? 'Install App'
    : safari.isSafari
      ? 'Install App'
      : '';

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') {
        setIsInstalled(true);
        setShowInstalledNotice(true);
      }
      setDeferredPrompt(null);
      return;
    }
    setShowInstructions(true);
  };

  if (!mounted) return null;
  if (isDesktopShell || (isInstalled && !showInstalledNotice)) return null;
  if (!deferredPrompt && !safari.isSafari) return null;

  return (
    <>
      {showInstalledNotice ? (
        <div className="orion-shellbar-install-status" role="status" aria-live="polite">
          Installed. Open from your dock anytime.
        </div>
      ) : (
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
      )}

      {showInstructions ? (
        <div className="orion-modal-overlay" onClick={() => setShowInstructions(false)}>
          <div className="orion-modal orion-pwa-modal" onClick={(event) => event.stopPropagation()}>
            <div className="orion-pwa-modal-head">
              <div>
                <div className="orion-panel-title">Install Platform</div>
                <div className="orion-panel-copy">Add to your dock for instant access.</div>
              </div>
              <button type="button" className="orion-pwa-modal-close" onClick={() => setShowInstructions(false)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <ol className="orion-pwa-steps">
              {safari.isIOS ? <li>Tap Share → Add to Home Screen</li> : <li>Use Share → Add to Dock</li>}
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}
