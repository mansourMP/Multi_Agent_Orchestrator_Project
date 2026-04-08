import type { ReactNode } from 'react';
import { DESIGN_TOKENS, bodyTextStyle, mergeStyles, panelStyle, sectionTitleStyle } from '@/design-constraints';

type PageFilterBarProps = {
  title?: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PageFilterBar({
  title,
  description,
  summary,
  actions,
  children,
  className,
}: PageFilterBarProps) {
  return (
    <section
      className={className}
      style={mergeStyles(panelStyle({ muted: true }), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
      })}
    >
      {title || description || summary || actions ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: DESIGN_TOKENS.space[4], flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
            {title ? <div style={sectionTitleStyle()}>{title}</div> : null}
            {description ? <div style={bodyTextStyle()}>{description}</div> : null}
          </div>
          {summary || actions ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>
              {summary}
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>{children}</div>
    </section>
  );
}
