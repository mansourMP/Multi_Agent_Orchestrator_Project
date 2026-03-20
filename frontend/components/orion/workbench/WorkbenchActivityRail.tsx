'use client';

import { Bot } from 'lucide-react';
import { UI, type AgentRoleId, type AgentRoleOption } from '@/app/page.catalog';

type WorkbenchActivityRailProps = {
  isMobile: boolean;
  chatMode: 'direct' | 'orchestrate';
  singleAgentMode?: boolean;
  selectedAgentRole: AgentRoleId;
  onAgentRoleChange: (role: AgentRoleId) => void;
  agentRoleOptions: AgentRoleOption[];
  selectedAgentChannels: Array<{
    channel?: string;
    identity_label?: string | null;
    label?: string | null;
    status?: string | null;
  }>;
  selectedAgentChannelsLoading: boolean;
  pendingApprovals: number;
  runtimeOk: boolean;
};

export function WorkbenchActivityRail({
  isMobile,
  chatMode,
  singleAgentMode = false,
  selectedAgentRole,
  onAgentRoleChange,
  agentRoleOptions,
  selectedAgentChannels,
  selectedAgentChannelsLoading,
  pendingApprovals,
  runtimeOk,
}: WorkbenchActivityRailProps) {
  const visibleChannels = selectedAgentChannels.slice(0, 3);
  const displayOptions = singleAgentMode
    ? agentRoleOptions.filter((item) => item.id === selectedAgentRole)
    : agentRoleOptions;
  const resolvedOptions = displayOptions.length > 0 ? displayOptions : agentRoleOptions;
  const railTitle = singleAgentMode ? 'Assistant workspace' : chatMode === 'orchestrate' ? 'Routing roster' : 'Pinned lanes';
  const railCopy = singleAgentMode
    ? 'The assistant handles every channel, run, and approval in this workspace.'
    : chatMode === 'orchestrate'
      ? 'See which lanes are ready for the next routed task.'
      : 'Choose which pinned lane should receive the next message.';
  return (
    <aside
      style={{
        borderRadius: 14,
        border: `1px solid ${UI.borderSoft}`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 58%, ${UI.surface} 42%) 0%, ${UI.surface} 100%)`,
        padding: isMobile ? 14 : 16,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        alignSelf: 'start',
        display: 'grid',
        gap: 12,
        minWidth: 0,
        overflowX: 'hidden',
        boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
          {railTitle}
        </div>
        <div style={{ fontSize: 12.5, color: UI.textMuted, fontWeight: 600, lineHeight: 1.45 }}>
          {railCopy}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 8,
          minWidth: 0,
          maxHeight: isMobile ? undefined : 420,
          overflowY: isMobile ? 'visible' : 'auto',
        }}
      >
        {resolvedOptions.map((item) => {
          const active = selectedAgentRole === item.id;
          const displayLabel = singleAgentMode ? 'Assistant' : item.label;
          const displayDescription = singleAgentMode
            ? 'Handles planning, execution, and approvals end to end.'
            : item.description;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onAgentRoleChange(item.id)}
              aria-pressed={active}
              style={{
                display: 'block',
                width: '100%',
                minWidth: 0,
                padding: 0,
                margin: 0,
                border: 0,
                background: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  minHeight: 58,
                  width: '100%',
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: active ? `1px solid ${UI.accentBorder}` : `1px solid ${UI.borderSoft}`,
                  background: active
                    ? `linear-gradient(180deg, color-mix(in srgb, ${UI.accentSoft} 82%, ${UI.surface} 18%) 0%, color-mix(in srgb, ${UI.accentSoft} 58%, ${UI.surface} 42%) 100%)`
                    : `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 76%, ${UI.surface} 24%) 0%, ${UI.surface} 100%)`,
                  display: 'grid',
                  gridTemplateColumns: '18px minmax(0, 1fr)',
                  alignItems: 'start',
                  gap: 12,
                  color: active ? UI.textSoft : UI.textMuted,
                  overflow: 'hidden',
                  boxShadow: active ? 'inset 0 1px 0 color-mix(in srgb, var(--primary-base) 16%, transparent)' : 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
                }}
              >
                <Bot size={15} color={active ? UI.accent : UI.textMuted} />
                <span
                  style={{ display: 'grid', gap: 2, minWidth: 0 }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: active ? UI.textSoft : UI.text }}>
                    {displayLabel}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: UI.textMuted,
                      lineHeight: 1.3,
                      whiteSpace: 'normal',
                      overflow: 'hidden',
                      textOverflow: 'clip',
                      wordBreak: 'break-word',
                    }}
                  >
                    {displayDescription}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          borderTop: `1px solid ${UI.borderSoft}`,
          paddingTop: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            color: UI.textMuted,
            lineHeight: 1.45,
            borderRadius: 12,
            border: `1px solid ${UI.borderSoft}`,
            background: UI.surface,
            padding: '10px 12px',
          }}
        >
          {pendingApprovals > 0 ? `${pendingApprovals} approval${pendingApprovals === 1 ? '' : 's'} waiting` : 'No approvals waiting'} ·{' '}
          {runtimeOk ? 'runtime ready' : 'runtime needs attention'}
        </div>
        {selectedAgentChannelsLoading ? (
          <div style={{ fontSize: 12.5, color: UI.textMuted }}>Loading identities…</div>
        ) : visibleChannels.length === 0 ? (
          <div style={{ fontSize: 12.5, color: UI.textMuted }}>No bound external identity.</div>
        ) : (
          <div
            style={{
              fontSize: 12.5,
              color: UI.textMuted,
              lineHeight: 1.45,
              maxWidth: '100%',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {visibleChannels
              .map((item) => String(item.identity_label || item.label || item.channel || '').trim())
              .filter(Boolean)
              .slice(0, 2)
              .join(' · ')}
            {selectedAgentChannels.length > 2 ? ` · +${selectedAgentChannels.length - 2} more` : ''}
          </div>
        )}
      </div>
    </aside>
  );
}
