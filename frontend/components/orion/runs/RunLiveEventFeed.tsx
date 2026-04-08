'use client';

import type { RunLiveFeedMode, RunLiveTimelineEvent } from '@/components/orion/runs/runLiveCockpitModel';
import { buildRunLiveLogRows } from '@/components/orion/runs/runLiveCockpitModel';

function fmtTime(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function RunLiveEventFeed({
  mode,
  onModeChange,
  timelineEvents,
}: {
  mode: RunLiveFeedMode;
  onModeChange: (nextMode: RunLiveFeedMode) => void;
  timelineEvents: RunLiveTimelineEvent[];
}) {
  const logRows = buildRunLiveLogRows(timelineEvents);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="orion-panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Live event feed ({timelineEvents.length})
        </div>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <button
            className="orion-btn orion-btn-ghost"
            onClick={() => onModeChange('timeline')}
            style={{
              minHeight: 44,
              fontSize: 11,
              padding: '0 12px',
              background: mode === 'timeline' ? 'var(--primary-soft)' : 'var(--bg-element)',
              borderColor: mode === 'timeline' ? 'var(--primary-border-soft)' : 'var(--border-default)',
              color: mode === 'timeline' ? 'var(--primary-base)' : 'var(--text-secondary)',
            }}
          >
            Timeline
          </button>
          <button
            className="orion-btn orion-btn-ghost"
            onClick={() => onModeChange('logs')}
            style={{
              minHeight: 44,
              fontSize: 11,
              padding: '0 12px',
              background: mode === 'logs' ? 'var(--primary-soft)' : 'var(--bg-element)',
              borderColor: mode === 'logs' ? 'var(--primary-border-soft)' : 'var(--border-default)',
              color: mode === 'logs' ? 'var(--primary-base)' : 'var(--text-secondary)',
            }}
          >
            Logs
          </button>
        </div>
      </div>
      {mode === 'timeline' && timelineEvents.length === 0 ? (
        <div className="orion-panel-copy" style={{ marginTop: 10 }}>No timeline events.</div>
      ) : mode === 'timeline' ? (
        <div
          style={{
            marginTop: 10,
            borderTop: '1px solid var(--border-default)',
            borderBottom: '1px solid var(--border-default)',
            overflowX: 'auto',
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              minWidth: 700,
              display: 'grid',
              gridTemplateColumns: '150px 92px 180px minmax(220px, 1fr) 160px',
              gap: 8,
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-default)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 800,
            }}
          >
            <span>Time</span>
            <span>Level</span>
            <span>Event</span>
            <span>Message</span>
            <span>Tool</span>
          </div>
          {timelineEvents.map((item) => {
            const levelColor =
              item.level === 'error'
                ? 'var(--error-fg)'
                : item.level === 'warn'
                  ? 'var(--warning-fg)'
                  : 'var(--text-secondary)';
            return (
              <div
                key={item.id}
                className="orion-log-entry"
                style={{
                  minWidth: 700,
                  display: 'grid',
                  gridTemplateColumns: '150px 92px 180px minmax(220px, 1fr) 160px',
                  gap: 8,
                  padding: '9px 10px',
                  borderBottom: '1px solid var(--border-default)',
                  alignItems: 'start',
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTime(item.ts)}</span>
                <span style={{ fontSize: 11, color: levelColor, fontWeight: 700 }}>
                  {item.seq != null ? `${item.level} #${item.seq}` : item.level}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>{item.event}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.message}</span>
                <span style={{ fontSize: 12, color: 'var(--primary-base)' }}>{item.toolHint || '--'}</span>
              </div>
            );
          })}
        </div>
      ) : logRows.length === 0 ? (
        <div className="orion-panel-copy" style={{ marginTop: 10 }}>No logs captured.</div>
      ) : (
        <div
          style={{
            marginTop: 10,
            borderTop: '1px solid var(--border-default)',
            borderBottom: '1px solid var(--border-default)',
            overflowX: 'auto',
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              minWidth: 580,
              display: 'grid',
              gridTemplateColumns: '84px 160px minmax(300px, 1fr)',
              gap: 8,
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-default)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 800,
            }}
          >
            <span>Level</span>
            <span>Time</span>
            <span>Message</span>
          </div>
          {logRows.map((item) => {
            const levelColor =
              item.level === 'error'
                ? 'var(--error-fg)'
                : item.level === 'warn'
                  ? 'var(--warning-fg)'
                  : 'var(--text-secondary)';
            return (
              <div
                key={`log:${item.id}`}
                className="orion-log-entry"
                style={{
                  minWidth: 580,
                  display: 'grid',
                  gridTemplateColumns: '84px 160px minmax(300px, 1fr)',
                  gap: 8,
                  padding: '9px 10px',
                  borderBottom: '1px solid var(--border-default)',
                  alignItems: 'start',
                }}
              >
                <span style={{ fontSize: 11, color: levelColor, fontWeight: 700 }}>
                  {String(item.level || 'info').toUpperCase()}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTime(item.ts)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
