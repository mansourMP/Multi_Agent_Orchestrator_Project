'use client';

import { useEffect, useState } from 'react';
import type { ChatApprovalRequestRecord } from './chatSchema';

type ApprovalDecision = 'proceed' | 'hold';

type ApprovalRequestCardProps = {
  approval: ChatApprovalRequestRecord;
  onDecision: (decision: ApprovalDecision) => Promise<void> | void;
};

function toneLabel(approval: ChatApprovalRequestRecord): string {
  if (approval.resolution === 'approved') return 'Approved';
  if (approval.resolution === 'rejected') return 'Held';
  return 'Approval required';
}

function chipList(values: string[]): string[] {
  return values.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 6);
}

export function ApprovalRequestCard({ approval, onDecision }: ApprovalRequestCardProps) {
  const [pendingDecision, setPendingDecision] = useState<ApprovalDecision | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (approval.resolution === 'approved' || approval.resolution === 'rejected') {
      setPendingDecision(null);
      setLocalError(null);
    }
  }, [approval.resolution, approval.id]);

  const disabled = Boolean(pendingDecision) || approval.resolution === 'approved' || approval.resolution === 'rejected';

  const handleDecision = async (decision: ApprovalDecision) => {
    if (disabled) return;
    setPendingDecision(decision);
    setLocalError(null);
    try {
      await onDecision(decision);
    } catch (error) {
      setPendingDecision(null);
      setLocalError(error instanceof Error ? error.message : 'Failed to submit decision.');
    }
  };

  const labels = chipList(approval.labels);
  const capabilities = chipList(approval.capabilities);
  const actions = chipList(approval.actions);

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
        borderRadius: 14,
        padding: 14,
        marginTop: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {toneLabel(approval)}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', marginTop: 6 }}>
            {approval.prompt}
          </div>
        </div>
        {approval.target ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {approval.target}
          </div>
        ) : null}
      </div>

      {labels.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {labels.map((label) => (
            <span
              key={`label:${label}`}
              style={{
                fontSize: 11,
                padding: '4px 8px',
                borderRadius: 999,
                border: '1px solid var(--border-muted)',
                color: 'var(--text-secondary)',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      {(capabilities.length > 0 || actions.length > 0) ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {capabilities.length > 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Capabilities:</span> {capabilities.join(', ')}
            </div>
          ) : null}
          {actions.length > 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Actions:</span> {actions.join(', ')}
            </div>
          ) : null}
        </div>
      ) : null}

      {localError ? (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--status-danger-text)' }}>
          {localError}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button
          type="button"
          className="orion-btn orion-btn-primary"
          style={{ minHeight: 36, fontSize: 13, padding: '0 14px' }}
          disabled={disabled}
          onClick={() => {
            void handleDecision('proceed');
          }}
        >
          {pendingDecision === 'proceed' ? 'Confirming…' : approval.resolution === 'approved' ? 'Confirmed' : 'Proceed'}
        </button>
        <button
          type="button"
          className="orion-btn"
          style={{
            minHeight: 36,
            fontSize: 13,
            padding: '0 14px',
            border: '1px solid rgba(214, 75, 75, 0.35)',
            color: approval.resolution === 'rejected' ? '#f1aaaa' : '#f4b0b0',
            background: 'rgba(122, 27, 27, 0.12)',
          }}
          disabled={disabled}
          onClick={() => {
            void handleDecision('hold');
          }}
        >
          {pendingDecision === 'hold' ? 'Holding…' : approval.resolution === 'rejected' ? 'Held' : 'Hold'}
        </button>
      </div>
    </section>
  );
}
