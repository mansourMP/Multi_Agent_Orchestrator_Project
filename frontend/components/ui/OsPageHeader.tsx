import type { ReactNode } from 'react';

type OsPageHeaderProps = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function OsPageHeader({ icon, title, subtitle, meta, actions }: OsPageHeaderProps) {
  return (
    <header className="orion-page-header">
      <div className="orion-page-title-wrap">
        {icon ? <div className="orion-page-icon">{icon}</div> : null}
        <div>
          <h1 className="orion-page-title">{title}</h1>
          {subtitle ? <p className="orion-page-subtitle">{subtitle}</p> : null}
          {meta ? <div className="orion-page-meta">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="orion-page-actions">{actions}</div> : null}
    </header>
  );
}
