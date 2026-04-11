'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { UI, fmtTime, type LogEntry } from '../../app/page.catalog';

interface LogViewerProps {
  logs: LogEntry[];
  showLiveLogs: boolean;
  setShowLiveLogs: (v: boolean | ((prev: boolean) => boolean)) => void;
  isMobile: boolean;
  isTablet: boolean;
  runId: string | null;
}

export const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  showLiveLogs,
  setShowLiveLogs,
  isMobile,
  isTablet,
  runId,
}) => {
  return (
    <>
      <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 760, letterSpacing: '-0.02em' }}>Timeline</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowLiveLogs((prev) => !prev)}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 28, fontSize: 11, padding: '0 9px', background: 'transparent' }}
          >
            {showLiveLogs ? 'Hide timeline' : 'Show timeline'}
          </button>
          {runId && <span style={{ fontSize: 12, color: UI.textMuted, wordBreak: 'break-word' }}>Run {runId.slice(0, 8)}...</span>}
        </div>
      </div>

      {showLiveLogs ? (
        <div style={{
          borderTop: `1px solid ${UI.borderSoft}`,
          borderBottom: `1px solid ${UI.borderSoft}`,
          background: 'transparent',
          height: isMobile ? 220 : isTablet ? 260 : 300,
          overflowY: 'auto',
          overflowX: 'auto',
        }}>
          {logs.length === 0 ? (
            <div style={{ marginTop: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, color: UI.textMuted, fontSize: 13 }}>
              <CheckCircle2 size={14} />
              No timeline events.
            </div>
          ) : (
            <div style={{ minWidth: isMobile ? 620 : 760 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '84px 140px minmax(380px, 1fr)',
                  gap: 10,
                  padding: '8px 12px',
                  borderBottom: `1px solid ${UI.borderSoft}`,
                  fontSize: 10,
                  color: UI.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 700,
                }}
              >
                <span>Level</span>
                <span>Time</span>
                <span>Message</span>
              </div>
              {logs.map((entry, idx) => {
                const color = entry.level === 'error' ? UI.error : entry.level === 'warn' ? UI.warning : UI.textMuted;
                return (
                  <div
                    key={`${entry.ts}-${idx}`}
                    className="orion-log-entry"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '84px 140px minmax(380px, 1fr)',
                      gap: 10,
                      padding: '9px 12px',
                      borderBottom: `1px solid ${UI.borderSoft}`,
                      alignItems: 'start',
                    }}
                  >
                    <span style={{ fontSize: 11, color, fontWeight: 700 }}>{entry.level.toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: UI.textMuted }}>{fmtTime(entry.ts)}</span>
                    <span style={{ fontSize: 12, color: UI.textSoft, lineHeight: 1.4 }}>{entry.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ borderBottom: `1px solid ${UI.borderSoft}`, padding: '0 0 4px', fontSize: 12, color: UI.textMuted }}>
          Timeline hidden.
        </div>
      )}
    </>
  );
};
