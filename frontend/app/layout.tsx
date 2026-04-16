import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import '../lib/ui/chrome.css';
import { AccountShellProvider } from '@/lib/shell/account-shell-context';
import { ACCOUNT_SHELL_STORAGE_KEY } from '@/lib/shell/account-shell-storage';
import { loadAccountShellSessionSafely } from '@/lib/server/load-account-shell-session';

export const metadata: Metadata = {
  title: 'Empyralis',
  description: 'Empyralis browser shell',
};

function buildThemeBootstrapScript(storageKey: string): string {
  return `
    (function () {
      try {
        var raw = window.localStorage.getItem(${JSON.stringify(storageKey)});
        var preference = 'system';
        if (raw) {
          var parsed = JSON.parse(raw);
          var candidate = parsed && typeof parsed === 'object' ? parsed.globalTheme : null;
          if (candidate === 'light' || candidate === 'dark' || candidate === 'system') {
            preference = candidate;
          }
        }

        var resolved = preference;
        if (resolved !== 'light' && resolved !== 'dark') {
          var prefersDark = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-color-scheme: dark)').matches;
          resolved = prefersDark ? 'dark' : 'light';
        }

        var root = document.documentElement;
        var body = document.body;
        root.setAttribute('data-emp-theme', resolved);
        root.style.colorScheme = resolved;
        if (body) {
          body.setAttribute('data-emp-theme', resolved);
          body.style.colorScheme = resolved;
        }
      } catch (_error) {
      }
    })();
  `;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialSession = await loadAccountShellSessionSafely();
  const themeBootstrapScript = buildThemeBootstrapScript(ACCOUNT_SHELL_STORAGE_KEY);

  return (
    <html lang="en" data-emp-theme="dark" suppressHydrationWarning>
      <body data-emp-theme="dark" suppressHydrationWarning>
        <script
          // Keep document theme in sync with persisted preference before hydration.
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
        <AccountShellProvider initialSession={initialSession}>{children}</AccountShellProvider>
      </body>
    </html>
  );
}
