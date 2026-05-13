'use client';

import type { PropsWithChildren, ReactNode } from 'react';

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function WorkstationSplitWorkbench({
  ariaLabel,
  sidebarHeader,
  sidebar,
  sidebarFooter,
  mainHeader,
  children,
  className,
}: PropsWithChildren<{
  ariaLabel: string;
  sidebarHeader?: ReactNode;
  sidebar: ReactNode;
  sidebarFooter?: ReactNode;
  mainHeader?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={joinClassNames('workstation-split-workbench', className)} aria-label={ariaLabel}>
      <aside className="workstation-split-workbench__sidebar" aria-label={`${ariaLabel} list`}>
        {sidebarHeader ? (
          <div className="workstation-split-workbench__sidebar-header">
            {sidebarHeader}
          </div>
        ) : null}
        <div className="workstation-split-workbench__sidebar-scroll">
          {sidebar}
        </div>
        {sidebarFooter ? (
          <div className="workstation-split-workbench__sidebar-footer">
            {sidebarFooter}
          </div>
        ) : null}
      </aside>
      <section className="workstation-split-workbench__main" aria-label={`${ariaLabel} detail`}>
        {mainHeader ? (
          <div className="workstation-split-workbench__main-header">
            {mainHeader}
          </div>
        ) : null}
        <div className="workstation-split-workbench__main-scroll">
          {children}
        </div>
      </section>
    </section>
  );
}
