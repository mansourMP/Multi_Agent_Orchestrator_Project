import type { ReactNode } from 'react';
import { DESIGN_TOKENS, bodyTextStyle, mergeStyles, metaTextStyle, pageHeaderStyle } from '@/design-constraints';

type OsPageHeaderProps = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function OsPageHeader({ icon, title, subtitle, meta, actions }: OsPageHeaderProps) {
  return (
    <header style={pageHeaderStyle()}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: DESIGN_TOKENS.space[4], minWidth: 0 }}>
        {icon ? (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: DESIGN_TOKENS.radius.lg,
              display: 'grid',
              placeItems: 'center',
              background: DESIGN_TOKENS.color.surface,
              border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
              color: DESIGN_TOKENS.color.textPrimary,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        ) : null}
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2], minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              color: DESIGN_TOKENS.color.textPrimary,
              fontSize: DESIGN_TOKENS.type.size.title,
              fontWeight: DESIGN_TOKENS.type.weight.semibold,
              lineHeight: DESIGN_TOKENS.type.lineHeight.snug,
              letterSpacing: DESIGN_TOKENS.type.tracking.normal,
            }}
          >
            {title}
          </h1>
          {subtitle ? <p style={bodyTextStyle()}>{subtitle}</p> : null}
          {meta ? <div style={metaTextStyle()}>{meta}</div> : null}
        </div>
      </div>
      {actions ? <div style={mergeStyles({ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' })}>{actions}</div> : null}
    </header>
  );
}
