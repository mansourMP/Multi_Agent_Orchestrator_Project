import type { CSSProperties, HTMLAttributes, PropsWithChildren } from 'react';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function ScrollRegion({
  children,
  className,
  style,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      {...props}
      className={joinClassNames('app-scroll-region', className)}
      style={{
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'auto',
        overscrollBehavior: 'contain',
        ...((style ?? {}) as CSSProperties),
      }}
    >
      {children}
    </div>
  );
}
