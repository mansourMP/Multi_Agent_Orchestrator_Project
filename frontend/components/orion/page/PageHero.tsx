import type { ReactNode } from 'react';

type PageHeroProps = {
  kicker?: ReactNode;
  title: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function PageHero({ kicker, title, copy, actions, aside, className }: PageHeroProps) {
  return (
    <>
      <section className={`orion-panel orion-home-overview${className ? ` ${className}` : ''}`}>
        <div className="orion-home-overview-main">
          {kicker ? <div className="orion-home-overview-kicker">{kicker}</div> : null}
          <div className="orion-home-overview-title">{title}</div>
          {copy ? <div className="orion-home-overview-copy">{copy}</div> : null}
          {actions ? <div className="orion-home-overview-actions">{actions}</div> : null}
        </div>
      </section>
      {aside ? <div className="orion-home-overview-supplement">{aside}</div> : null}
    </>
  );
}
