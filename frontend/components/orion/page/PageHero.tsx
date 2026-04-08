import type { ReactNode } from 'react';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  eyebrowStyle,
  mergeStyles,
  pageTitleStyle,
  panelStyle,
} from '@/design-constraints';

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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: aside ? 'minmax(0, 1.45fr) minmax(280px, 0.95fr)' : 'minmax(0, 1fr)',
          gap: DESIGN_TOKENS.space[4],
          alignItems: 'stretch',
        }}
      >
        <section
          style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[7] }), {
            display: 'grid',
            gap: DESIGN_TOKENS.space[5],
            alignContent: 'start',
          })}
        >
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
            {kicker ? <div style={eyebrowStyle()}>{kicker}</div> : null}
            <div style={pageTitleStyle({ hero: true })}>{title}</div>
            {copy ? <div style={mergeStyles(bodyTextStyle(), { maxWidth: 720 })}>{copy}</div> : null}
            {actions ? (
              <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>
                {actions}
              </div>
            ) : null}
          </div>
        </section>
        {aside ? <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>{aside}</div> : null}
      </div>
    </div>
  );
}
