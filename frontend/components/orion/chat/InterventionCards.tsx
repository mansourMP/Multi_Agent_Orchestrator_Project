'use client';

import type { ChatInterventionRecord, ChatMessageActionRecord } from './chatSchema';

type InterventionCardProps = {
  intervention: ChatInterventionRecord;
  actions?: ChatMessageActionRecord[];
  onAction?: (action: ChatMessageActionRecord) => void;
};

function resolvePalette(severity: ChatInterventionRecord['severity']) {
  if (severity === 'error') {
    return {
      border: 'rgba(214, 75, 75, 0.4)',
      background: 'linear-gradient(180deg, rgba(122, 27, 27, 0.18), rgba(28, 10, 10, 0.24))',
      accent: '#f4b0b0',
      text: '#ffe1e1',
      muted: 'rgba(255, 218, 218, 0.72)',
    };
  }
  if (severity === 'warning') {
    return {
      border: 'rgba(214, 167, 75, 0.35)',
      background: 'linear-gradient(180deg, rgba(99, 73, 16, 0.16), rgba(28, 22, 10, 0.22))',
      accent: '#f3d79b',
      text: '#fff2cc',
      muted: 'rgba(255, 236, 189, 0.72)',
    };
  }
  return {
    border: 'rgba(104, 145, 255, 0.28)',
    background: 'linear-gradient(180deg, rgba(34, 48, 86, 0.18), rgba(12, 18, 34, 0.2))',
    accent: '#b8cbff',
    text: '#eef4ff',
    muted: 'rgba(222, 231, 255, 0.72)',
  };
}

function statusLabel(intervention: ChatInterventionRecord): string {
  const raw = String(intervention.status || intervention.kind || 'notice').trim();
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function renderActions(
  actions: ChatMessageActionRecord[] | undefined,
  onAction: InterventionCardProps['onAction'],
  palette: ReturnType<typeof resolvePalette>,
) {
  if (!actions || actions.length === 0 || !onAction) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={action.variant === 'primary' ? 'orion-btn orion-btn-primary' : 'orion-btn'}
          style={
            action.variant === 'primary'
              ? { minHeight: 36, fontSize: 13, padding: '0 14px' }
              : {
                  minHeight: 36,
                  fontSize: 13,
                  padding: '0 14px',
                  border: `1px solid ${palette.border}`,
                  color: palette.text,
                  background: 'rgba(255,255,255,0.04)',
                }
          }
          onClick={() => onAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function BaseInterventionCard({ intervention, actions, onAction }: InterventionCardProps) {
  const palette = resolvePalette(intervention.severity);
  return (
    <section
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.background,
        borderRadius: 14,
        padding: 14,
        marginTop: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: palette.accent }}>
            {statusLabel(intervention)}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.45, color: palette.text, marginTop: 6, fontWeight: 600 }}>
            {intervention.title}
          </div>
        </div>
        {intervention.runId ? (
          <div style={{ fontSize: 12, color: palette.muted, whiteSpace: 'nowrap' }}>
            {intervention.runId}
          </div>
        ) : null}
      </div>
      {intervention.detail ? (
        <div style={{ fontSize: 13, lineHeight: 1.6, color: palette.muted, marginTop: 10 }}>
          {intervention.detail}
        </div>
      ) : null}
      {renderActions(actions, onAction, palette)}
    </section>
  );
}

export function LoopDetectedCard(props: InterventionCardProps) {
  return <BaseInterventionCard {...props} />;
}

export function RunHandoffCard(props: InterventionCardProps) {
  return <BaseInterventionCard {...props} />;
}

export function ConnectRequiredCard(props: InterventionCardProps) {
  return <BaseInterventionCard {...props} />;
}

export function SystemErrorCard(props: InterventionCardProps) {
  return <BaseInterventionCard {...props} />;
}

export function RunOfferCard(props: InterventionCardProps) {
  return <BaseInterventionCard {...props} />;
}

export function WorkflowOfferCard(props: InterventionCardProps) {
  return <BaseInterventionCard {...props} />;
}

export function SystemNoticeCard(props: InterventionCardProps) {
  return <BaseInterventionCard {...props} />;
}

export function InterventionCard(props: InterventionCardProps) {
  switch (props.intervention.kind) {
    case 'loop_detected':
      return <LoopDetectedCard {...props} />;
    case 'run_handoff':
      return <RunHandoffCard {...props} />;
    case 'connect_required':
      return <ConnectRequiredCard {...props} />;
    case 'system_error':
      return <SystemErrorCard {...props} />;
    case 'run_offer':
      return <RunOfferCard {...props} />;
    case 'workflow_offer':
      return <WorkflowOfferCard {...props} />;
    default:
      return <SystemNoticeCard {...props} />;
  }
}
