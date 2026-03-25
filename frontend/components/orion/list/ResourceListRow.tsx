import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type ResourceListRowProps = ComponentPropsWithoutRef<'article'> & {
  leading?: ReactNode;
  end?: ReactNode;
  children: ReactNode;
};

export function ResourceListRow({
  leading,
  end,
  children,
  className,
  ...props
}: ResourceListRowProps) {
  return (
    <article className={`orion-list-row${className ? ` ${className}` : ''}`} {...props}>
      {leading ? <div className="orion-item-leading">{leading}</div> : null}
      {!leading ? children : <>{children}</>}
      {end ? <div className="orion-list-row-end">{end}</div> : null}
    </article>
  );
}
