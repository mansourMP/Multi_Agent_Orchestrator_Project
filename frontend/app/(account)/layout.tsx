import type { ReactNode } from 'react';

import { AccountTenantSwitcher } from '@/app/(account)/AccountTenantSwitcher';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '20rem minmax(0, 1fr)',
      }}
    >
      <AccountTenantSwitcher />
      <div>{children}</div>
    </div>
  );
}
