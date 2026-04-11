'use client';

import React from 'react';
import { UI, formatDurationMs } from '../../app/page.catalog';

interface RunReceiptData {
  id: string;
  status: string;
  packId: string;
  createdAt: string | null;
  durationMs: number | null;
  firstValueMs: number | null;
  hitlWaitMs: number | null;
  routeSelected: string | null;
  routeRequested: string | null;
  routeReason: string | null;
  summary: string;
}

interface RunReceiptProps {
  runReceipt: RunReceiptData;
  copyRunReceipt: () => Promise<void>;
}

export const RunReceipt: React.FC<RunReceiptProps> = ({ runReceipt, copyRunReceipt }) => {
  return (
    <div style={{ marginBottom: 10, borderTop: `1px solid ${UI.borderSoft}`, paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: UI.textSoft }}>Receipt</div>
        <button
          onClick={copyRunReceipt}
          className="orion-btn orion-btn-ghost"
          style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
        >
          Copy receipt
        </button>
      </div>
      <div style={{ display: 'grid', gap: 6, fontSize: 12, color: UI.textSoft }}>
        <div><span style={{ color: UI.textMuted }}>Run ID:</span> {runReceipt.id}</div>
        <div><span style={{ color: UI.textMuted }}>Status:</span> {String(runReceipt.status).toUpperCase()}</div>
        <div><span style={{ color: UI.textMuted }}>Pack:</span> {runReceipt.packId}</div>
        {runReceipt.createdAt && (
          <div><span style={{ color: UI.textMuted }}>Started:</span> {runReceipt.createdAt}</div>
        )}
        {runReceipt.durationMs !== null && (
          <div><span style={{ color: UI.textMuted }}>Duration:</span> {formatDurationMs(runReceipt.durationMs)}</div>
        )}
        {runReceipt.firstValueMs !== null && (
          <div><span style={{ color: UI.textMuted }}>Time-to-first-value:</span> {formatDurationMs(runReceipt.firstValueMs)}</div>
        )}
        {runReceipt.hitlWaitMs !== null && (
          <div><span style={{ color: UI.textMuted }}>Human wait:</span> {formatDurationMs(runReceipt.hitlWaitMs)}</div>
        )}
        {runReceipt.routeSelected && (
          <div><span style={{ color: UI.textMuted }}>Route:</span> {runReceipt.routeSelected}</div>
        )}
        {runReceipt.routeRequested && (
          <div><span style={{ color: UI.textMuted }}>Requested route:</span> {runReceipt.routeRequested}</div>
        )}
        {runReceipt.routeReason && (
          <div><span style={{ color: UI.textMuted }}>Route reason:</span> {runReceipt.routeReason}</div>
        )}
      </div>
    </div>
  );
};
