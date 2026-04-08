'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FolderOpen, Monitor, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import {
  completeDesktopSetup,
  fetchDesktopSetupStatus,
  type DesktopSetupCheck,
  type DesktopSetupStatus,
} from '@/lib/desktopFirstRun';
import { getDesktopBridge } from '@/lib/desktopBridge';

function statusTone(value?: string): 'green' | 'red' | 'yellow' | 'grey' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'granted') return 'green';
  if (normalized === 'denied') return 'red';
  if (normalized === 'unsupported') return 'grey';
  return 'yellow';
}

function statusLabel(value?: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'granted') return 'Ready';
  if (normalized === 'denied') return 'Needs access';
  if (normalized === 'unsupported') return 'Not supported';
  return 'Checking';
}

function iconForCheck(id: string) {
  if (id === 'screen_recording') return <Monitor size={18} />;
  if (id === 'filesystem') return <FolderOpen size={18} />;
  return <ShieldCheck size={18} />;
}

function CheckRow({
  item,
  busy,
  onOpenSettings,
}: {
  item: DesktopSetupCheck;
  busy: boolean;
  onOpenSettings: (target: string) => void;
}) {
  const canOpenSettings = Boolean(item.settings_target);
  return (
    <article className="orion-desktop-setup-check">
      <div className="orion-desktop-setup-check__icon">
        {iconForCheck(item.id)}
      </div>
      <div className="orion-desktop-setup-check__body">
        <div className="orion-desktop-setup-check__head">
          <div className="orion-desktop-setup-check__title">{item.label}</div>
          <span className="orion-chip" data-status-tone={statusTone(item.status)}>
            {statusLabel(item.status)}
          </span>
        </div>
        <div className="orion-desktop-setup-check__detail">
          {item.detail || 'Empyralis will verify this capability before running the local demo.'}
        </div>
      </div>
      {canOpenSettings ? (
        <button
          type="button"
          className="orion-btn orion-btn-ghost"
          onClick={() => onOpenSettings(String(item.settings_target || ''))}
          disabled={busy}
        >
          {busy ? 'Opening…' : 'Open settings'}
        </button>
      ) : null}
    </article>
  );
}

export function DesktopSetupWizard() {
  const router = useRouter();
  const [status, setStatus] = useState<DesktopSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingTarget, setOpeningTarget] = useState('');
  const [continuing, setContinuing] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchDesktopSetupStatus();
      setStatus(next);
    } catch (loadError) {
      setStatus(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to check desktop setup status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const handleFocus = () => {
      void loadStatus();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadStatus]);

  useEffect(() => {
    if (!loading && status?.desktop_setup_completed) {
      router.replace('/demo?setup=complete');
    }
  }, [loading, router, status]);

  const missingCount = useMemo(() => status?.missing_ids.length || 0, [status]);
  const canContinue = Boolean(status?.can_continue);
  const machineLabel = useMemo(() => {
    const display = String(status?.machine?.display_name || '').trim();
    const machineId = String(status?.machine?.machine_id || '').trim();
    return display || machineId || 'Local machine';
  }, [status]);

  const openSettings = useCallback(async (target: string) => {
    const bridge = getDesktopBridge();
    if (!bridge?.desktop || typeof bridge.openPermissionSettings !== 'function') {
      setError('Permission shortcuts are only available in the Empyralis desktop app.');
      return;
    }
    setOpeningTarget(target);
    setError('');
    try {
      await bridge.openPermissionSettings(target);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not open system settings.');
    } finally {
      setOpeningTarget('');
    }
  }, []);

  const continueToDemo = useCallback(async () => {
    if (!canContinue) return;
    setContinuing(true);
    setError('');
    try {
      await completeDesktopSetup();
      router.replace('/demo?setup=complete');
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : 'Could not complete desktop setup.');
      setContinuing(false);
    }
  }, [canContinue, router]);

  return (
    <div className="orion-page-shell narrow orion-animate-in" style={{ width: 'min(720px, 100%)', margin: '0 auto', gap: 18 }}>
      <section className="orion-desktop-setup-hero">
        <div className="orion-desktop-setup-hero__kicker">Desktop setup</div>
        <div className="orion-desktop-setup-hero__title-row">
          <h1 className="orion-auth-card__title">Empyralis can see your computer, act carefully, and show every result in one place.</h1>
          <Sparkles size={20} />
        </div>
        <p className="orion-auth-card__copy">
          Give the desktop app the permissions it needs once, then run a local screenshot demo to prove the agent can observe your machine without leaving the app.
        </p>
      </section>

      {loading ? (
        <PageStatePanel variant="loading" title="Checking desktop permissions…" copy="Empyralis is verifying local machine access." />
      ) : error ? (
        <PageStatePanel
          variant="error"
          title="Desktop setup needs attention"
          copy={error}
          actions={(
            <button type="button" className="orion-btn orion-btn-primary" onClick={() => void loadStatus()}>
              <RefreshCw size={14} />
              Retry check
            </button>
          )}
        />
      ) : !status ? (
        <PageStatePanel variant="loading" title="Checking desktop permissions…" copy="Empyralis is verifying local machine access." />
      ) : (
        <>
          <section className="orion-desktop-setup-panel">
            <div className="orion-desktop-setup-panel__summary">
              <div>
                <div className="orion-desktop-setup-panel__label">Machine</div>
                <div className="orion-desktop-setup-panel__value">{machineLabel}</div>
              </div>
              <div>
                <div className="orion-desktop-setup-panel__label">Checks ready</div>
                <div className="orion-desktop-setup-panel__value">
                  {status.checks.length - missingCount}/{status.checks.length}
                </div>
              </div>
              <div>
                <div className="orion-desktop-setup-panel__label">Demo mode</div>
                <div className="orion-desktop-setup-panel__value">Offline screenshot test</div>
              </div>
            </div>

            <div className="orion-desktop-setup-panel__checklist">
              {status.checks.map((item) => (
                <CheckRow
                  key={item.id}
                  item={item}
                  busy={openingTarget === item.settings_target}
                  onOpenSettings={openSettings}
                />
              ))}
            </div>

            <div className="orion-desktop-setup-note">
              Continue stays locked until every required check passes. After that, Empyralis will run a one-click local demo in under 10 seconds and save the screenshot as an artifact.
            </div>

            <div className="orion-desktop-setup-actions">
              <button type="button" className="orion-btn orion-btn-ghost" onClick={() => void loadStatus()}>
                <RefreshCw size={14} />
                Recheck permissions
              </button>
              <button
                type="button"
                className="orion-btn orion-btn-primary"
                onClick={() => void continueToDemo()}
                disabled={!canContinue || continuing}
              >
                {continuing ? <RefreshCw size={14} className="orion-spin" /> : <CheckCircle2 size={14} />}
                {continuing ? 'Finishing setup…' : 'Continue to demo'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
