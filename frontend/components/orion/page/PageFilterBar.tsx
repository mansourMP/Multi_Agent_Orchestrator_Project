import type { ReactNode } from 'react';

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
    <section className={`orion-panel muted orion-page-filter-bar${className ? ` ${className}` : ''}`}>
      {title || description || summary || actions ? (
        <div className="orion-page-filter-header">
          <div>
            {title ? <div className="orion-panel-title">{title}</div> : null}
            {description ? <div className="orion-panel-copy">{description}</div> : null}
          </div>
          {summary || actions ? (
            <div className="orion-page-filter-summary">
              {summary}
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="orion-page-filter-body">{children}</div>
    </section>
  );
}
