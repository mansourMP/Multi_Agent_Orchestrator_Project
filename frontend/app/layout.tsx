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
import "@xyflow/react/dist/style.css";
import "../components/reactflow-override.css";
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

const CRITICAL_SHELL_CSS = `
:root {
  --critical-sidebar-width: 56px;
  --critical-topbar-height: 56px;
  --critical-bg-shell: #f3f2ee;
  --critical-bg-app: #f4f4f1;
  --critical-bg-surface: #ffffff;
  --critical-border: rgba(93, 99, 110, 0.2);
  --critical-text: #1a1c21;
  --critical-text-secondary: #5d636e;
  --critical-primary: #2f3136;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
html,
body {
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: var(--critical-bg-app);
  color: var(--critical-text);
  font-family: 'Outfit', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a {
  color: inherit;
  text-decoration: none;
}
.orion-app-shell {
  min-height: 100vh;
  background: var(--critical-bg-app);
}
.orion-main-shell {
  margin-left: var(--critical-sidebar-width);
  padding-top: var(--critical-topbar-height);
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  position: relative;
  z-index: 1;
}
.orion-main-stage {
  height: calc(100vh - var(--critical-topbar-height));
  min-height: calc(100vh - var(--critical-topbar-height));
  overflow: hidden;
  padding: 8px 12px 18px 4px;
  background: var(--critical-bg-app);
}
.orion-page-shell {
  width: min(1460px, 100%);
  max-width: 1460px;
  margin: 0 auto;
  height: calc(100vh - var(--critical-topbar-height) - 26px);
  min-height: calc(100vh - var(--critical-topbar-height) - 26px);
  padding: 28px 30px 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.orion-page-shell.narrow {
  width: min(1200px, 100%);
  max-width: 1200px;
}
.orion-page-shell.is-integrations-page {
  width: min(1720px, 100%);
  max-width: 1720px;
}
.orion-page-shell.is-health-page {
  width: min(1320px, 100%);
  max-width: 1320px;
}
.orion-page-shell.is-chat-home {
  width: 100%;
  max-width: none;
  margin: 0;
  height: auto;
  min-height: 0;
  overflow: visible;
  padding: 12px 18px 18px;
}
.orion-shellbar {
  position: fixed;
  top: 0;
  left: var(--critical-sidebar-width);
  right: 0;
  min-height: var(--critical-topbar-height);
  z-index: 70;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(320px, 1.05fr) auto;
  gap: 12px;
  align-items: center;
  padding: 0 4px;
  background: var(--critical-bg-shell);
  border-bottom: 0;
}
.sidebar,
.sidebar-v2 {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--critical-sidebar-width);
  background: var(--critical-bg-shell);
  z-index: 80;
}
.btn-primary,
.btn-secondary,
.btn-ghost,
.btn,
.orion-btn,
.orion-btn-primary,
.orion-btn-ghost,
.orion-btn-success,
.orion-btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 32px;
  height: 32px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--critical-text);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}
.btn-primary,
.orion-btn-primary {
  background: var(--critical-primary);
  color: #ffffff;
  border: 1px solid var(--critical-primary);
}
.orion-btn-success {
  background: rgba(47, 122, 85, 0.12);
  color: #24593f;
  border: 1px solid rgba(47, 122, 85, 0.32);
}
.orion-btn-danger {
  background: rgba(185, 87, 87, 0.12);
  color: #8a3b3b;
  border: 1px solid rgba(185, 87, 87, 0.32);
}
.btn-secondary,
.btn,
.orion-btn {
  background: transparent;
  color: var(--critical-text);
  border: 1px solid var(--critical-border);
}
.btn-ghost,
.orion-btn-ghost {
  background: transparent;
  color: var(--critical-text-secondary);
  border: none;
}
.input,
.orion-input {
  width: 100%;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--critical-border);
  border-radius: 12px;
  background: var(--critical-bg-surface);
  color: var(--critical-text);
  font: inherit;
}
`;

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
    root.style.setProperty('--sidebar-width', hideShellChrome ? '0px' : sidebarCollapsed ? '56px' : '200px');
    root.style.setProperty('--topbar-height', hideShellChrome ? '0px' : '56px');
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
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_SHELL_CSS }} />
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
