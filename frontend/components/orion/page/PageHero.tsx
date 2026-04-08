import type { ReactNode } from 'react';
import { DESIGN_TOKENS, bodyTextStyle, eyebrowStyle, mergeStyles, panelStyle } from '@/design-constraints';

type PageHeroProps = {
  kicker?: ReactNode;
  title: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function PageHero({ kicker, title, copy, actions, aside, className }: PageHeroProps) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
      }}
    >
      <section
        style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[7] }), {
          display: 'grid',
          gap: DESIGN_TOKENS.space[5],
        })}
      >
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
          {kicker ? <div style={eyebrowStyle()}>{kicker}</div> : null}
          <div
            style={{
              margin: 0,
              color: DESIGN_TOKENS.color.textPrimary,
              fontSize: DESIGN_TOKENS.type.size.hero,
              fontWeight: DESIGN_TOKENS.type.weight.semibold,
              lineHeight: DESIGN_TOKENS.type.lineHeight.tight,
              letterSpacing: DESIGN_TOKENS.type.tracking.tight,
            }}
          >
            {title}
          </div>
          {copy ? <div style={mergeStyles(bodyTextStyle(), { maxWidth: 720 })}>{copy}</div> : null}
          {actions ? (
            <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>
              {actions}
            </div>
          ) : null}
        </div>
      </section>
      {aside ? <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[4] }}>{aside}</div> : null}
    </div>
  );
}
