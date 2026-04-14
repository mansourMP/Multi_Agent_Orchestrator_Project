import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import '../lib/ui/chrome.css';
import { AccountShellProvider } from '@/lib/shell/account-shell-context';
import { loadAccountShellSessionSafely } from '@/lib/server/load-account-shell-session';

export const metadata: Metadata = {
  title: 'Empyralis',
  description: 'Empyralis browser shell',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialSession = await loadAccountShellSessionSafely();

  return (
    <html lang="en" data-emp-theme="dark" suppressHydrationWarning>
      <body data-emp-theme="dark" suppressHydrationWarning>
        <AccountShellProvider initialSession={initialSession}>{children}</AccountShellProvider>
      </body>
    </html>
  );
}
