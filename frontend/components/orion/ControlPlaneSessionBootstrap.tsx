'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { ensureControlPlaneSession, readControlPlaneFailure } from '@/lib/controlPlaneSession';
import { useDesktopShell } from '@/lib/desktopBridge';
import { humanizeUiError } from '@/lib/uiError';

type BootstrapState = 'idle' | 'bootstrapping' | 'ready' | 'error';

export default function ControlPlaneSessionBootstrap() {
  const isDesktop = useDesktopShell();
  const [state, setState] = useState<BootstrapState>('idle');
  const [message, setMessage] = useState('');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setState('bootstrapping');
      try {
        await ensureControlPlaneSession();
        if (!active) return;
        setMessage('');
        setRetrying(false);
        setState('ready');
      } catch (error) {
        if (!active) return;
        const remembered = readControlPlaneFailure();
        const detail = humanizeUiError(
          remembered?.message || (error instanceof Error ? error.message : ''),
          isDesktop
            ? 'Sign in to unlock control-plane features in this app.'
            : 'Continue in your browser to unlock control-plane features in this app.',
        );
        setMessage(detail);
        setRetrying(false);
        setState('error');
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [isDesktop]);

  const retry = async () => {
    setRetrying(true);
    try {
      await ensureControlPlaneSession({ forcePrompt: true });
      setMessage('');
      setRetrying(false);
      setState('ready');
    } catch (error) {
      const remembered = readControlPlaneFailure();
      const detail = humanizeUiError(
        remembered?.message || (error instanceof Error ? error.message : ''),
        isDesktop
          ? 'Sign in to unlock control-plane features in this app.'
          : 'Continue in your browser to unlock control-plane features in this app.',
      );
      setMessage(detail);
      setRetrying(false);
      setState('error');
    }
  };

  if (isDesktop) return null;
  if (state !== 'error') return null;

  return (
    <div className="orion-control-plane-banner" role="status" aria-live="polite">
      <div className="orion-control-plane-banner__icon">
        <ShieldAlert size={16} />
      </div>
      <div className="orion-control-plane-banner__body">
        <div className="orion-control-plane-banner__title">Browser sign-in required</div>
        <div className="orion-control-plane-banner__copy">
          {message || 'Continue in your browser to unlock control-plane features in this app.'}
        </div>
      </div>
      <div className="orion-control-plane-banner__actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={retry}
          disabled={retrying}
        >
          {retrying ? 'Opening browser…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
