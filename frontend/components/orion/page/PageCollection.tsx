import type { ReactNode } from 'react';
import { DESIGN_TOKENS, bodyTextStyle, mergeStyles, panelStyle, sectionTitleStyle } from '@/design-constraints';

type PageCollectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function PageCollection({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: PageCollectionProps) {
  return (
    <section
      className={className}
      style={mergeStyles(panelStyle(), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[5],
      })}
    >
      {title || description || actions ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: DESIGN_TOKENS.space[4], flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
            {title ? <div style={sectionTitleStyle()}>{title}</div> : null}
            {description ? <div style={bodyTextStyle()}>{description}</div> : null}
          </div>
          {actions ? <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName} style={{ display: 'grid', gap: DESIGN_TOKENS.space[4] }}>{children}</div>
    </section>
  );
}
