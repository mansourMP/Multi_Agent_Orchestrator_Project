'use client';

import React from 'react';
import { UI } from '../../app/page.catalog';

interface AutonomyStage {
  id: string;
  label: string;
  state: 'done' | 'waiting' | 'active' | 'pending';
}

interface AutonomyLifecycleProps {
  autonomyStages: AutonomyStage[];
  isMobile: boolean;
  isTablet: boolean;
}

export const AutonomyLifecycle: React.FC<AutonomyLifecycleProps> = ({
  autonomyStages,
  isMobile,
  isTablet,
}) => {
  return (
    <div style={{ marginBottom: 10, borderBottom: `1px solid ${UI.borderSoft}`, padding: '0 0 10px' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: UI.textMuted,
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>Lifecycle</span>
        <span>{autonomyStages.length} stages</span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          flexWrap: 'wrap',
          gap: isMobile ? 8 : isTablet ? 8 : 10,
        }}
      >
        {autonomyStages.map((stage, idx) => {
          const color =
            stage.state === 'done'
              ? UI.success
              : stage.state === 'waiting'
              ? UI.warning
              : stage.state === 'active'
              ? UI.accent
              : UI.textMuted;
          const label =
            stage.state === 'done'
              ? 'Done'
              : stage.state === 'waiting'
              ? 'Needs Input'
              : stage.state === 'active'
              ? 'In Progress'
              : 'Pending';
          return (
            <div
              key={stage.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 8,
                minWidth: isMobile ? 0 : 150,
                paddingRight: isMobile ? 0 : 10,
                borderRight:
                  isMobile || idx === autonomyStages.length - 1
                    ? 'none'
                    : `1px solid ${UI.borderSoft}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: UI.textSoft }}>{stage.label}</span>
              <span style={{ fontSize: 11, color, whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
