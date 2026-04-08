import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { DESIGN_TOKENS, listRowStyle } from '@/design-constraints';

type ResourceListRowProps = ComponentPropsWithoutRef<'article'> & {
  leading?: ReactNode;
  end?: ReactNode;
  children: ReactNode;
};

export function ResourceListRow({
  leading,
  end,
  children,
  className,
  ...props
}: ResourceListRowProps) {
  return (
    <article
      className={className}
      style={{
        ...listRowStyle({ interactive: props.onClick != null }),
        gap: DESIGN_TOKENS.space[5],
        padding: `${DESIGN_TOKENS.space[4]}px ${DESIGN_TOKENS.space[4]}px`,
        background: DESIGN_TOKENS.color.surface,
      }}
      {...props}
    >
      {leading ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: DESIGN_TOKENS.space[4], minWidth: 0, flex: 1 }}>
          {leading}
          <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
        </div>
      ) : (
        children
      )}
      {end ? <div style={{ display: 'flex', alignItems: 'flex-start', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap' }}>{end}</div> : null}
    </article>
  );
}
