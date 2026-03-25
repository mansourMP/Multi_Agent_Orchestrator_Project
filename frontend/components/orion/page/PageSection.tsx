import type { ReactNode } from 'react';

type PageSectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  muted?: boolean;
};

export function PageSection({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  muted = false,
}: PageSectionProps) {
  return (
    <section className={`orion-panel${muted ? ' muted' : ''}${className ? ` ${className}` : ''}`}>
      {title || description || actions ? (
        <div className="orion-panel-header">
          <div>
            {title ? <div className="orion-panel-title">{title}</div> : null}
            {description ? <div className="orion-panel-copy">{description}</div> : null}
          </div>
          {actions ? <div className="orion-page-section-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`orion-page-section-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
    </section>
  );
}
