'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Monitor, RefreshCw, Sparkles } from 'lucide-react';
import { DemoSuccessPanel } from '@/components/demo/DemoSuccessPanel';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import {
  fetchDesktopDemoStatus,
  fetchDesktopSetupStatus,
  startDesktopDemo,
  type DesktopDemoStatus,
} from '@/lib/desktopFirstRun';
import { useDesktopShell } from '@/lib/desktopBridge';

function prettyStatus(value?: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Queued';
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function DemoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useDesktopShell();
  const showSetupCompleteBanner = searchParams.get('setup') === 'complete';
  const [initialGuardLoading, setInitialGuardLoading] = useState(true);
  const [guardError, setGuardError] = useState('');
  const [runId, setRunId] = useState('');
  const [demo, setDemo] = useState<DesktopDemoStatus | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const guard = async () => {
      if (!isDesktop) {
        setInitialGuardLoading(false);
        return;
      }
      try {
        const status = await fetchDesktopSetupStatus();
        if (!active) return;
        if (!status.desktop_setup_completed) {
          router.replace('/setup');
          return;
        }
        setGuardError('');
      } catch (guardLoadError) {
        if (!active) return;
        setGuardError(guardLoadError instanceof Error ? guardLoadError.message : 'Failed to verify desktop setup.');
      } finally {
        if (active) setInitialGuardLoading(false);
      }
    };

    void guard();
    return () => {
      active = false;
    };
  }, [isDesktop, router]);

  const pollStatus = useCallback(async (targetRunId: string) => {
    const next = await fetchDesktopDemoStatus(targetRunId);
    setDemo(next);
    if (next.terminal && next.status === 'failed') {
      setError(next.failure_message || next.summary || 'The demo run failed.');
    }
  }, []);

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      try {
        const next = await fetchDesktopDemoStatus(runId);
        if (cancelled) return;
        setDemo(next);
        if (next.terminal && next.status === 'failed') {
          setError(next.failure_message || next.summary || 'The demo run failed.');
        }
        if (!next.terminal) {
          timer = window.setTimeout(() => {
            void tick();
          }, 1400);
        }
      } catch (pollError) {
        if (cancelled) return;
        setError(pollError instanceof Error ? pollError.message : 'Could not load demo status.');
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [runId]);

  const startDemoRun = useCallback(async () => {
    setLaunching(true);
    setError('');
    setDemo(null);
    setRunId('');
    try {
      const started = await startDesktopDemo();
      setRunId(started.run_id);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Could not start the desktop demo.');
    } finally {
      setLaunching(false);
    }
  }, []);

  const isTerminal = Boolean(demo?.terminal);
  const isSuccess = isTerminal && demo?.status === 'completed';
  const isFailure = isTerminal && demo?.status === 'failed';
  const busy = launching || (!!runId && !isTerminal);
  const currentStatusLabel = useMemo(() => prettyStatus(demo?.status || (runId ? 'queued' : 'idle')), [demo?.status, runId]);

  return (
    <div className="orion-page-shell narrow orion-animate-in" style={{ width: 'min(780px, 100%)', margin: '0 auto', gap: 18 }}>
      {showSetupCompleteBanner ? (
        <div className="orion-demo-banner">
          <Sparkles size={16} />
          <span>Desktop setup is complete. Run the one-click demo to prove Empyralis can see your machine locally.</span>
        </div>
      ) : null}

      <section className="orion-demo-hero">
        <div className="orion-demo-hero__kicker">First-run demo</div>
        <h1>Run a local screenshot demo in one click.</h1>
        <p>
          This offline demo captures your current screen, stores it as an artifact, tries local OCR when available, and explains what Empyralis observed without opening another app.
        </p>
      </section>

      {initialGuardLoading ? (
        <PageStatePanel variant="loading" title="Preparing desktop demo…" copy="Checking that first-run setup is complete." />
      ) : guardError ? (
        <PageStatePanel
          variant="error"
          title="Desktop demo is unavailable"
          copy={guardError}
          actions={(
            <button type="button" className="orion-btn orion-btn-primary" onClick={() => router.refresh()}>
              <RefreshCw size={14} />
              Retry
            </button>
          )}
        />
      ) : !isDesktop ? (
        <PageStatePanel
          variant="empty"
          title="Open the desktop app to run this demo"
          copy="The screenshot + description demo uses the local Empyralis desktop bridge and companion runtime."
          actions={(
            <Link href="/setup" className="orion-btn orion-btn-primary">
              Go to setup
            </Link>
          )}
        />
      ) : (
        <>
          <section className="orion-demo-runner">
            <div className="orion-demo-runner__top">
              <div>
                <div className="orion-demo-runner__label">Demo action</div>
                <div className="orion-demo-runner__title">Screenshot + Description</div>
              </div>
              <span className="orion-chip" data-status-tone={isSuccess ? 'green' : isFailure ? 'red' : busy ? 'yellow' : 'grey'}>
                {busy ? currentStatusLabel : isSuccess ? 'Ready' : isFailure ? 'Needs retry' : 'Idle'}
              </span>
            </div>
            <div className="orion-demo-runner__copy">
              Capture the current screen, persist it as an artifact, extract local text when available, and show the result back inside Empyralis in under 10 seconds.
            </div>
            <div className="orion-demo-runner__actions">
              <button type="button" className="orion-btn orion-btn-primary" onClick={() => void startDemoRun()} disabled={busy}>
                {busy ? <RefreshCw size={14} className="orion-spin" /> : <Monitor size={14} />}
                {busy ? 'Running demo…' : 'Run Demo: Screenshot + Description'}
              </button>
              {runId ? (
                <button type="button" className="orion-btn orion-btn-ghost" onClick={() => void pollStatus(runId)} disabled={busy}>
                  <RefreshCw size={14} />
                  Refresh status
                </button>
              ) : null}
            </div>
            {runId ? (
              <div className="orion-demo-runner__meta">
                <span>Run {runId.slice(0, 8)}</span>
                <span>Status: {currentStatusLabel}</span>
              </div>
            ) : null}
          </section>

          {error ? (
            <PageStatePanel
              variant="error"
              title="Demo failed"
              copy={error}
              actions={(
                <button type="button" className="orion-btn orion-btn-primary" onClick={() => void startDemoRun()}>
                  <RefreshCw size={14} />
                  Retry demo
                </button>
              )}
            />
          ) : null}

          {busy ? (
            <PageStatePanel
              variant="loading"
              title="Empyralis is running the local demo"
              copy="Capturing the current screen, saving the screenshot artifact, and checking for local text."
            />
          ) : null}

          {isSuccess && demo ? <DemoSuccessPanel demo={demo} /> : null}

          {!busy && !demo && !error ? (
            <section className="orion-demo-preflight">
              <div className="orion-demo-preflight__title">What you should expect</div>
              <ul>
                <li>The demo runs fully on your local desktop path.</li>
                <li>A screenshot artifact is saved into the artifact workspace.</li>
                <li>If OCR is unavailable on this machine, the screenshot still succeeds and the UI tells you clearly.</li>
              </ul>
              <Link href="/setup" className="orion-demo-preflight__link">
                Re-open desktop setup
                <ArrowRight size={14} />
              </Link>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
