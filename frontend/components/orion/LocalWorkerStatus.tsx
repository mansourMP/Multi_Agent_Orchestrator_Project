'use client';

import React from 'react';
import { UI } from '../../app/page.catalog';

interface LocalWorkerStatusProps {
  workerSummary: {
    online: number;
    known: number;
    busy: number;
    pending: number;
    claimed: number;
  };
  setupReady: boolean;
}

export const LocalWorkerStatus: React.FC<LocalWorkerStatusProps> = ({
  workerSummary,
  setupReady,
}) => {
  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 10,
        border: `1px solid ${UI.borderSoft}`,
        background: UI.shell,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: UI.textSoft, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Local Worker
        </div>
        <span
          style={{
            borderRadius: 999,
            border: `1px solid ${workerSummary.online > 0 ? UI.successBorder : UI.border}`,
            color: workerSummary.online > 0 ? UI.successFg : UI.textMuted,
            background: workerSummary.online > 0 ? UI.successBg : 'transparent',
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {workerSummary.online > 0 ? 'Online' : 'Offline'}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: UI.textSoft, border: `1px solid ${UI.border}`, borderRadius: 999, padding: '2px 8px' }}>
          Online: {workerSummary.online}/{workerSummary.known || workerSummary.online}
        </span>
        <span style={{ fontSize: 11, color: UI.textSoft, border: `1px solid ${UI.border}`, borderRadius: 999, padding: '2px 8px' }}>
          Busy: {workerSummary.busy}
        </span>
        <span style={{ fontSize: 11, color: UI.textSoft, border: `1px solid ${UI.border}`, borderRadius: 999, padding: '2px 8px' }}>
          Queue: {workerSummary.pending}
        </span>
      </div>
      <div style={{ fontSize: 11, color: UI.textMuted }}>
        {workerSummary.online > 0
          ? 'Local worker is connected. Local-companion runs can execute immediately.'
          : 'No local worker heartbeat detected. Local-companion runs will stay queued until a worker comes online.'}
      </div>
      {!setupReady && (
        <div style={{ marginTop: 8, fontSize: 12, color: UI.warningFg }}>
          Finish the 3 setup steps above to unlock execution.
        </div>
      )}
    </div>
  );
};
