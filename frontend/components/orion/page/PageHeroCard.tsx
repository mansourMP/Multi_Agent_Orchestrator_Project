import type { ReactNode } from 'react';

type PageHeroCardProps = {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PageHeroCard({ label, children, className }: PageHeroCardProps) {
  return (
    <div className={`orion-home-side-card${className ? ` ${className}` : ''}`}>
      {label ? <div className="orion-home-side-label">{label}</div> : null}
      {children}
    </div>
  );
}
