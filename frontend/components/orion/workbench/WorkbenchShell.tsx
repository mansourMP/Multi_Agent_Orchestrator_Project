'use client';

import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, LayoutGrid } from 'lucide-react';
import { UI } from '@/app/page.catalog';

type WorkbenchChatMode = 'direct' | 'orchestrate';
type WorkbenchExperienceMode = 'simple' | 'advanced';

type WorkbenchShellProps = {
  topError: string | null;
  chatMode: WorkbenchChatMode;
  onChatModeChange: (mode: WorkbenchChatMode) => void;
  experienceMode: WorkbenchExperienceMode;
  onExperienceModeChange: (mode: WorkbenchExperienceMode) => void;
  deckVisible: boolean;
  onDeckVisibleChange: (visible: boolean) => void;
  deckControlsEnabled: boolean;
  singleAgentMode?: boolean;
  children: ReactNode;
};

function formatSimpleTopError(message: string): string {
  const text = message.trim();
  if (!text) return '';
  const normalized = text.toLowerCase();
  if (normalized.includes('provider profiles path is not writable')) {
    return 'Local companion setup issue: provider profile storage is not writable.';
  }
  if (normalized.includes('setup is not complete')) {
    return 'Setup is incomplete. Finish setup before running tasks.';
  }
  if (normalized.includes('failed to load live workspace snapshot')) {
    return 'Live platform status is temporarily unavailable.';
  }
  return text;
}

export function WorkbenchShell({
  topError,
  chatMode,
  onChatModeChange,
  experienceMode,
  onExperienceModeChange,
  deckVisible,
  onDeckVisibleChange,
  deckControlsEnabled,
  singleAgentMode = false,
  children,
}: WorkbenchShellProps) {
  const profileChipStyle = (active: boolean) => ({
    border: active ? `1px solid ${UI.accent}` : `1px solid ${UI.borderSoft}`,
    background: active ? UI.accent : UI.surfaceAlt,
    color: active ? 'var(--primary-text)' : UI.textMuted,
    minHeight: 30,
    padding: '0 10px',
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: active ? '0 8px 18px color-mix(in srgb, var(--primary-base) 18%, transparent 82%)' : 'none',
  });
  const pageTitle = experienceMode === 'simple' ? 'Assistant' : 'Assistant Console';
  const pageSubtitle =
    experienceMode === 'simple'
      ? 'The main conversation surface for getting work done with one assistant.'
      : singleAgentMode
        ? 'Advanced view for inspecting runs, approvals, and the assistant when you need tighter control.'
        : 'Advanced view for routing work, inspecting runs, and stepping in when you need manual control.';
  const showPageHeader = experienceMode === 'advanced';
  const simpleTopError = topError && experienceMode === 'simple' ? formatSimpleTopError(topError) : topError;

  useEffect(() => {
    if (experienceMode !== 'simple') return;
    document.body.classList.add('orion-chat-home');
    return () => {
      document.body.classList.remove('orion-chat-home');
    };
  }, [experienceMode]);

  return (
    <div
      className={`orion-page-shell orion-animate-in${experienceMode === 'simple' ? ' is-chat-home' : ''}`}
      style={{
        color: UI.text,
        maxWidth: 'none',
      }}
    >
      {showPageHeader ? (
        <div
          className="orion-page-header"
          style={{
            paddingBottom: 14,
            borderBottom: `1px solid ${UI.borderSoft}`,
          }}
        >
          <div
            className="orion-page-title-wrap"
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
              <div className="orion-page-icon">
                <LayoutGrid size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: UI.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 3,
                  }}
                >
                  Advanced controls
                </div>
                <h1 className="orion-page-title">{pageTitle}</h1>
                <p className="orion-page-subtitle">{pageSubtitle}</p>
              </div>
            </div>
            <div
              style={{
                minHeight: 30,
                padding: '0 10px',
                borderRadius: 999,
                border: `1px solid ${UI.accentBorder}`,
                background: UI.accentSoft,
                color: UI.textSoft,
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              Admin surface
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {singleAgentMode ? (
              <span
                style={{
                  ...profileChipStyle(true),
                  cursor: 'default',
                }}
              >
                Assistant mode
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onChatModeChange('orchestrate')}
                  style={profileChipStyle(chatMode === 'orchestrate')}
                >
                  Assistant routing
                </button>
                <button
                  type="button"
                  onClick={() => onChatModeChange('direct')}
                  style={profileChipStyle(chatMode === 'direct')}
                >
                  Direct lane
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onExperienceModeChange('simple')}
              style={profileChipStyle(false)}
            >
              Return Home
            </button>
            {deckControlsEnabled ? (
              <button
                type="button"
                onClick={() => onDeckVisibleChange(!deckVisible)}
                style={profileChipStyle(deckVisible)}
              >
                {deckVisible ? 'Hide inspect deck' : 'Open inspect deck'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {simpleTopError && experienceMode !== 'simple' ? (
        <div
          style={{
            marginBottom: 12,
            alignSelf: 'stretch',
            width: '100%',
            borderRadius: 10,
            border: `1px solid ${UI.errorBorder}`,
            background: UI.errorBg,
            color: UI.errorFg,
            padding: '10px 12px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={14} />
          {simpleTopError}
        </div>
      ) : null}

      {children}
    </div>
  );
}
