import type { ReactNode } from 'react';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  mergeStyles,
  metaTextStyle,
  pageHeaderStyle,
  pageTitleStyle,
} from '@/design-constraints';

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
              width: 40,
              height: 40,
              borderRadius: DESIGN_TOKENS.radius.lg,
              display: 'grid',
              placeItems: 'center',
              background: DESIGN_TOKENS.color.surfaceMuted,
              border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
              color: DESIGN_TOKENS.color.textPrimary,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        ) : null}
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2], minWidth: 0 }}>
          <h1 style={pageTitleStyle()}>{title}</h1>
          {subtitle ? <p style={mergeStyles(bodyTextStyle(), { maxWidth: 760 })}>{subtitle}</p> : null}
          {meta ? <div style={mergeStyles(metaTextStyle(), { display: 'flex', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap' })}>{meta}</div> : null}
        </div>
      </div>
      {actions ? (
        <div
          style={mergeStyles({
            display: 'flex',
            gap: DESIGN_TOKENS.space[3],
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            alignItems: 'center',
          })}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
