import type { ReactNode } from 'react';

type PageStateVariant = 'loading' | 'error' | 'empty' | 'filtered-empty';

type PageStatePanelProps = {
  variant: PageStateVariant;
  icon?: ReactNode;
  title: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageStatePanel({ variant, icon, title, copy, actions, className }: PageStatePanelProps) {
  const rootClassName =
    variant === 'loading'
      ? 'orion-panel muted orion-loading-panel'
      : variant === 'empty' || variant === 'filtered-empty'
        ? 'orion-empty'
        : 'orion-panel muted orion-state-panel';

  return (
    <section className={`${rootClassName}${className ? ` ${className}` : ''}`}>
      {icon ? <div className="orion-state-icon" aria-hidden="true">{icon}</div> : null}
      <div className="orion-empty-title orion-page-state-title">{title}</div>
      {copy ? <div className="orion-empty-copy orion-page-state-copy">{copy}</div> : null}
      {actions ? <div className="orion-state-actions">{actions}</div> : null}
    </section>
  );
}
