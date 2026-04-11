'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Laptop, LoaderCircle, RefreshCw } from 'lucide-react';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  buttonStyle,
  mergeStyles,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';
import { Button } from '@/components/ui/button';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

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
      await ensureControlPlaneSession();
      const res = await fetch('/api/local-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
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
    <section
      style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[5] }), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
      })}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          gap: DESIGN_TOKENS.space[4],
          alignItems: 'start',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            borderRadius: DESIGN_TOKENS.radius.lg,
            border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
            background: DESIGN_TOKENS.color.surface,
            color: DESIGN_TOKENS.color.textSecondary,
          }}
        >
          <Laptop size={18} />
        </div>
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
          <div style={sectionTitleStyle()}>{title}</div>
          <div style={bodyTextStyle()}>{copy}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>
        <Button
          onClick={() => void runAction('start_services')}
          disabled={Boolean(busyAction)}
        >
          {busyAction === 'start_services' ? <LoaderCircle size={14} className="spin" /> : null}
          {busyAction === 'start_services' ? 'Starting...' : 'Start local runtime'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void runAction('readiness')}
          disabled={Boolean(busyAction)}
        >
          {busyAction === 'readiness' ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
          {busyAction === 'readiness' ? 'Checking...' : 'Check readiness'}
        </Button>
        <Link
          href="/machines"
          style={mergeStyles(buttonStyle({ tone: 'secondary' }), {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: DESIGN_TOKENS.space[2],
            textDecoration: 'none',
            fontFamily: DESIGN_TOKENS.type.family,
          })}
        >
          Open Machines
        </Link>
      </div>

      {report ? (
        <div
          style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[4] }), {
            color: DESIGN_TOKENS.color.textSecondary,
            fontFamily: DESIGN_TOKENS.type.mono,
            fontSize: DESIGN_TOKENS.type.size.caption,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          })}
        >
          {report}
        </div>
      ) : null}
    </section>
  );
}
