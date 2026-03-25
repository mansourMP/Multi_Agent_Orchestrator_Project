import type { ReactNode } from 'react';

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
    <section className={`orion-panel orion-panel-shell${className ? ` ${className}` : ''}`}>
      {title || description || actions ? (
        <div className="orion-panel-header orion-panel-shell-header">
          <div>
            {title ? <div className="orion-panel-title">{title}</div> : null}
            {description ? <div className="orion-panel-copy">{description}</div> : null}
          </div>
          {actions ? <div className="orion-page-section-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`orion-panel-shell-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
    </section>
  );
}
