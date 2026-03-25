'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Laptop, LoaderCircle, RefreshCw } from 'lucide-react';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

type RecoveryAction = 'start_services' | 'readiness';

type LocalRuntimeRecoveryCardProps = {
  title?: string;
  copy?: string;
  onStatusRefresh?: () => Promise<void> | void;
};

function formatLocalOpsOutput(payload: Record<string, unknown>): string {
  const stdout = typeof payload.stdout === 'string' ? payload.stdout.trim() : '';
  const stderr = typeof payload.stderr === 'string' ? payload.stderr.trim() : '';
  const parts: string[] = [];
  if (typeof payload.action === 'string' && payload.action) parts.push(`Action: ${payload.action}`);
  if (typeof payload.transport === 'string' && payload.transport) parts.push(`Transport: ${payload.transport}`);
  if (typeof payload.fallbackReason === 'string' && payload.fallbackReason) parts.push(`Fallback: ${payload.fallbackReason}`);
  if (payload.running !== undefined) parts.push(`Running: ${String(Boolean(payload.running))}`);
  if (stdout) parts.push(stdout);
  if (stderr) parts.push(`stderr:\n${stderr}`);
  return parts.join('\n\n');
}

export default function LocalRuntimeRecoveryCard({
  title = 'Local machine unavailable',
  copy = 'Start the local runtime on this device, then confirm it appears online before running locally.',
  onStatusRefresh,
}: LocalRuntimeRecoveryCardProps) {
  const [busyAction, setBusyAction] = useState<RecoveryAction | null>(null);
  const [report, setReport] = useState('');

  const runAction = useCallback(async (action: RecoveryAction) => {
    setBusyAction(action);
    try {
      const runtimeKey = readRuntimeApiKeyFromStorage('');
      const res = await fetch('/api/local-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, runtimeKey }),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const message =
          typeof payload.error === 'string' && payload.error.trim()
            ? payload.error
            : `Operation failed (HTTP ${res.status}).`;
        throw new Error(message);
      }
      setReport(formatLocalOpsOutput(payload) || 'Operation finished.');
      await onStatusRefresh?.();
    } catch (error) {
      setReport(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setBusyAction(null);
    }
  }, [onStatusRefresh]);

  return (
    <section className="orion-panel muted orion-runtime-recovery-card">
      <div className="orion-runtime-recovery-head">
        <div className="orion-state-icon" aria-hidden="true">
          <Laptop size={18} />
        </div>
        <div>
          <div className="orion-panel-title">{title}</div>
          <div className="orion-panel-copy">{copy}</div>
        </div>
      </div>

      <div className="orion-runtime-recovery-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void runAction('start_services')}
          disabled={Boolean(busyAction)}
        >
          {busyAction === 'start_services' ? <LoaderCircle size={14} className="spin" /> : null}
          {busyAction === 'start_services' ? 'Starting...' : 'Start local runtime'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void runAction('readiness')}
          disabled={Boolean(busyAction)}
        >
          {busyAction === 'readiness' ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
          {busyAction === 'readiness' ? 'Checking...' : 'Check readiness'}
        </button>
        <Link href="/machines" className="btn-secondary">
          Open Machines
        </Link>
      </div>

      {report ? <div className="orion-runtime-recovery-report">{report}</div> : null}
    </section>
  );
}
