import type { ReactNode } from 'react';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  eyebrowStyle,
  mergeStyles,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';

type PageStateVariant = 'loading' | 'error' | 'empty' | 'filtered-empty';

type PageStatePanelProps = {
  variant: PageStateVariant;
  icon?: ReactNode;
  title: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageStatePanel({ variant, icon, title, copy, actions, className }: PageStatePanelProps) {
  const toneColor =
    variant === 'error'
      ? DESIGN_TOKENS.color.danger
      : variant === 'loading'
        ? DESIGN_TOKENS.color.accent
        : DESIGN_TOKENS.color.textSecondary;

  return (
    <section
      className={className}
      style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[7] }), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
        minHeight: 220,
      })}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: DESIGN_TOKENS.space[4] }}>
        {icon ? (
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: DESIGN_TOKENS.radius.lg,
              display: 'grid',
              placeItems: 'center',
              background: DESIGN_TOKENS.color.surface,
              border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
              color: toneColor,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        ) : null}
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2], minWidth: 0 }}>
          <div style={eyebrowStyle()}>{variant.replace('-', ' ')}</div>
          <div style={sectionTitleStyle()}>{title}</div>
          {copy ? <div style={mergeStyles(bodyTextStyle(), { maxWidth: 560 })}>{copy}</div> : null}
        </div>
      </div>
      {actions ? <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>{actions}</div> : null}
    </section>
  );
}
