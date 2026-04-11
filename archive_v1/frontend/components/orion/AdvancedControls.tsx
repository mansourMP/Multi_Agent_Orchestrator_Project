'use client';

import React from 'react';
import { UI } from '../../app/page.catalog';
import { BRAND } from '@/lib/brand';

interface AdvancedControlsProps {
  showAdvancedControls: boolean;
  guidedDefaultsEnabled: boolean;
  setGuidedDefaultsEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  weeklyAutopilotEnabled: boolean;
  setWeeklyAutopilotEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  weeklyAutopilotDay: string;
  setWeeklyAutopilotDay: (v: string) => void;
  weeklyAutopilotTime: string;
  setWeeklyAutopilotTime: (v: string) => void;
  weeklyAutopilotTimezone: 'local' | 'utc';
  setWeeklyAutopilotTimezone: (v: 'local' | 'utc') => void;
  weeklyScheduleBusy: string | null;
  saveWeeklySchedule: () => Promise<void>;
  loadWeeklySchedule: () => Promise<void>;
  weeklyScheduleStatusText: string;
  weeklyScheduleId: string | null;
  isMobile: boolean;
}

export const AdvancedControls: React.FC<AdvancedControlsProps> = ({
  showAdvancedControls,
  guidedDefaultsEnabled,
  setGuidedDefaultsEnabled,
  weeklyAutopilotEnabled,
  setWeeklyAutopilotEnabled,
  weeklyAutopilotDay,
  setWeeklyAutopilotDay,
  weeklyAutopilotTime,
  setWeeklyAutopilotTime,
  weeklyAutopilotTimezone,
  setWeeklyAutopilotTimezone,
  weeklyScheduleBusy,
  saveWeeklySchedule,
  loadWeeklySchedule,
  weeklyScheduleStatusText,
  weeklyScheduleId,
  isMobile,
}) => {
  if (!showAdvancedControls) {
    return (
      <div style={{ borderTop: `1px dashed ${UI.borderSoft}`, paddingTop: 10, fontSize: 11, color: UI.textMuted }}>
        {`Advanced controls are hidden. ${BRAND.assistant} is using guided defaults.`}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8, borderTop: `1px dashed ${UI.borderSoft}`, paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="orion-home-panel-title">Guided defaults</div>
        <button
          onClick={() => setGuidedDefaultsEnabled((prev) => !prev)}
          className="orion-btn orion-btn-ghost"
          style={{
            minHeight: 30,
            fontSize: 11,
            padding: '0 10px',
            borderColor: guidedDefaultsEnabled ? UI.successBorder : UI.border,
            background: guidedDefaultsEnabled ? UI.successBg : 'transparent',
            color: guidedDefaultsEnabled ? UI.successFg : UI.textMuted,
          }}
        >
          {guidedDefaultsEnabled ? 'On' : 'Off'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: UI.textMuted }}>
        {`When ON, ${BRAND.assistant} uses recommended trust mode and starter defaults automatically.`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="orion-home-panel-title">Weekly autopilot</div>
        <button
          onClick={() => setWeeklyAutopilotEnabled((prev) => !prev)}
          className="orion-btn orion-btn-ghost"
          style={{
            minHeight: 30,
            fontSize: 11,
            padding: '0 10px',
            borderColor: weeklyAutopilotEnabled ? UI.accentBorder : UI.border,
            background: weeklyAutopilotEnabled ? UI.accentSoft : 'transparent',
            color: weeklyAutopilotEnabled ? UI.textSoft : UI.textMuted,
          }}
        >
          {weeklyAutopilotEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      {weeklyAutopilotEnabled && (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr' }}>
          <select
            value={weeklyAutopilotDay}
            onChange={(e) => setWeeklyAutopilotDay(e.target.value)}
            style={{
              borderRadius: 8,
              border: `1px solid ${UI.border}`,
              background: 'var(--bg-element)',
              color: UI.textSoft,
              padding: '6px 8px',
              fontSize: 12,
            }}
          >
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
          <input
            type="time"
            value={weeklyAutopilotTime}
            onChange={(e) => setWeeklyAutopilotTime(e.target.value)}
            style={{
              borderRadius: 8,
              border: `1px solid ${UI.border}`,
              background: 'var(--bg-element)',
              color: UI.textSoft,
              padding: '6px 8px',
              fontSize: 12,
            }}
          />
          <select
            value={weeklyAutopilotTimezone}
            onChange={(e) => setWeeklyAutopilotTimezone((e.target.value === 'utc' ? 'utc' : 'local'))}
            style={{
              borderRadius: 8,
              border: `1px solid ${UI.border}`,
              background: 'var(--bg-element)',
              color: UI.textSoft,
              padding: '6px 8px',
              fontSize: 12,
            }}
          >
            <option value="local">Local time</option>
            <option value="utc">UTC</option>
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => { void saveWeeklySchedule(); }}
          disabled={weeklyScheduleBusy === 'save' || weeklyScheduleBusy === 'load'}
          className="orion-btn orion-btn-primary"
          style={{ minHeight: 32, fontSize: 11 }}
        >
          {weeklyScheduleBusy === 'save' ? 'Saving...' : 'Save to server'}
        </button>
        <button
          onClick={() => { void loadWeeklySchedule(); }}
          disabled={weeklyScheduleBusy === 'save' || weeklyScheduleBusy === 'load'}
          className="orion-btn orion-btn-ghost"
          style={{ minHeight: 32, fontSize: 11, background: 'transparent' }}
        >
          {weeklyScheduleBusy === 'load' ? 'Refreshing...' : 'Refresh schedule'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: UI.textMuted }}>
        {weeklyScheduleStatusText || (weeklyAutopilotEnabled
          ? `Will run server-side every ${weeklyAutopilotDay} at ${weeklyAutopilotTime} (${weeklyAutopilotTimezone.toUpperCase()}).`
          : 'Weekly autopilot is currently disabled.')}
      </div>
      {weeklyScheduleId && (
        <div style={{ fontSize: 11, color: UI.textMuted }}>
          Schedule ID: {weeklyScheduleId.slice(0, 8)}...
        </div>
      )}
    </div>
  );
};
