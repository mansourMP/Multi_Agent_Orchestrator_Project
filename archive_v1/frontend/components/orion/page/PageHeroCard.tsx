import type { ReactNode } from 'react';
import { DESIGN_TOKENS, eyebrowStyle, mergeStyles, panelStyle } from '@/design-constraints';

type PageHeroCardProps = {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PageHeroCard({ label, children, className }: PageHeroCardProps) {
  return (
    <div
      className={className}
      style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[5] }), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[3],
        background: DESIGN_TOKENS.color.surfaceMuted,
      })}
    >
      {label ? <div style={eyebrowStyle()}>{label}</div> : null}
      {children}
    </div>
  );
}
