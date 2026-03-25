import type { Metadata } from "next";
import type { Viewport } from "next";
import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import GlobalCommandPalette from "@/components/orion/GlobalCommandPalette";
import { PlatformShellProvider } from "@/components/orion/PlatformShellContext";
import PlatformTopBar from "@/components/orion/PlatformTopBar";
import { BRAND } from "@/lib/brand";
import "./globals.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";

export const metadata: Metadata = {
  title: `${BRAND.company} - Outcome Autopilot for Business`,
  description: `${BRAND.assistant} helps businesses run repeatable outcomes with AI autopilot: connect accounts, define goals, review approvals, and ship results.`,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: BRAND.company,
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const saved = localStorage.getItem('theme');
    const theme = saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'light';
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    const pathname = String(window.location.pathname || '/');
    const hideShellChrome = pathname.startsWith('/builder/') || pathname.startsWith('/setup');
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    if (resolved === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.style.colorScheme = resolved;
    const sidebarCollapsed = localStorage.getItem('empyralist:sidebar-collapsed') === '1';
    root.setAttribute('data-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
    root.style.setProperty('--sidebar-width', hideShellChrome ? '0px' : sidebarCollapsed ? '72px' : '200px');
    root.style.setProperty('--topbar-height', hideShellChrome ? '0px' : '48px');
    document.body?.style?.setProperty('background', resolved === 'dark' ? '#0a0a0a' : '#ffffff');
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <PlatformShellProvider>
            <ToastProvider>
              <div className="orion-app-shell">
                <Suspense fallback={null}>
                  <Sidebar />
                </Suspense>
                <PlatformTopBar />
                <GlobalCommandPalette />
                <main className="orion-main-shell">
                  <div className="orion-main-stage">{children}</div>
                </main>
              </div>
            </ToastProvider>
          </PlatformShellProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
