import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { AccountShellProvider } from '@/lib/shell/account-shell-context';

export const metadata: Metadata = {
  title: 'Empyralis',
  description: 'Empyralis frontend v2 account shell foundation',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccountShellProvider>{children}</AccountShellProvider>
      </body>
    </html>
  );
}
