import type { Metadata } from "next";
import type { Viewport } from "next";
import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import GlobalCommandPalette from "@/components/orion/GlobalCommandPalette";
import ControlPlaneSessionBootstrap from "@/components/orion/ControlPlaneSessionBootstrap";
import { PlatformShellProvider } from "@/components/orion/PlatformShellContext";
import PlatformInspectPanel from "@/components/orion/PlatformInspectPanel";
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
  --sidebar-width: 56px;
  --topbar-height: 56px;
  --critical-bg-shell: #f7f7f7;
  --critical-bg-app: #f4f4f4;
  --critical-bg-surface: #ffffff;
  --critical-border: #e2e2e2;
  --critical-text: #1a1c21;
  --critical-text-secondary: #5d636e;
  --critical-primary: #3d63dd;
  --critical-primary-soft: rgba(61, 99, 221, 0.12);
  --critical-success: #3f8a5f;
  --critical-danger: #c06262;
  --critical-success-soft: rgba(63, 138, 95, 0.12);
  --critical-success-text: #2e6b49;
  --critical-danger-soft: rgba(192, 98, 98, 0.12);
  --critical-danger-text: #8a4343;
  --critical-secondary-bg: #ffffff;
  --critical-overlay: rgba(244, 244, 244, 0.22);
}
html[data-theme='dark'] {
  --critical-bg-shell: #0f0f10;
  --critical-bg-app: #141415;
  --critical-bg-surface: #1c1c1e;
  --critical-border: rgba(255, 255, 255, 0.07);
  --critical-text: #f0f0f0;
  --critical-text-secondary: #9a9a9f;
  --critical-primary: #4f6ff7;
  --critical-primary-soft: rgba(79, 111, 247, 0.18);
  --critical-success: #3ecf8e;
  --critical-danger: #f06060;
  --critical-success-soft: rgba(62, 207, 142, 0.14);
  --critical-success-text: #c7f2d7;
  --critical-danger-soft: rgba(240, 96, 96, 0.14);
  --critical-danger-text: #f5cdcd;
  --critical-secondary-bg: #1c1c1e;
  --critical-overlay: rgba(20, 20, 21, 0.22);
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
  margin-left: var(--sidebar-width);
  width: calc(100vw - var(--sidebar-width));
  max-width: calc(100vw - var(--sidebar-width));
  padding-top: var(--topbar-height);
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  transition: margin-left 180ms ease, width 180ms ease, max-width 180ms ease, padding-top 180ms ease;
}
.orion-main-stage {
  height: calc(100vh - var(--topbar-height));
  min-height: calc(100vh - var(--topbar-height));
  overflow: hidden;
  padding: 8px 12px 18px 4px;
  background: var(--critical-bg-app);
  position: relative;
  transition: transform 180ms ease, filter 180ms ease;
}
.orion-main-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--critical-overlay);
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}
.orion-page-shell {
  width: 100%;
  max-width: none;
  margin: 0;
  height: calc(100vh - var(--topbar-height) - 26px);
  min-height: calc(100vh - var(--topbar-height) - 26px);
  padding: 12px 18px 18px;
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
  width: 100%;
  max-width: none;
}
.orion-page-shell.is-integrations-page {
  width: 100%;
  max-width: none;
}
.orion-page-shell.is-health-page {
  width: 100%;
  max-width: none;
}
.orion-page-shell.is-chat-home {
  width: 100%;
  max-width: none;
  margin: 0;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  padding: 12px 18px 18px;
}
.orion-shellbar {
  position: fixed;
  top: 0;
  left: var(--sidebar-width);
  right: 0;
  min-height: var(--topbar-height);
  z-index: 70;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(320px, 1.05fr) auto;
  gap: 12px;
  align-items: center;
  padding: 0 4px;
  background: var(--critical-bg-shell);
  border-bottom: 0;
  transition: left 180ms ease;
}
.sidebar,
.sidebar-v2 {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--sidebar-width);
  background: var(--critical-bg-shell);
  z-index: 80;
}
.btn-primary,
.btn-secondary,
.btn-ghost,
.btn,
.orion-btn,
.orion-btn-primary,
.orion-btn-secondary,
.orion-btn-ghost,
.orion-btn-success,
.orion-btn-danger,
.orion-btn.primary,
.orion-btn.secondary,
.orion-btn.ghost,
.orion-btn.success,
.orion-btn.danger {
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
.orion-btn-primary,
.orion-btn.primary {
  background: var(--critical-primary);
  color: #ffffff;
  border: 1px solid var(--critical-primary);
}
.orion-btn-success,
.orion-btn.success {
  background: var(--critical-success-soft);
  color: var(--critical-success-text);
  border: 1px solid var(--critical-success);
}
.orion-btn-danger,
.orion-btn.danger {
  background: var(--critical-danger-soft);
  color: var(--critical-danger-text);
  border: 1px solid var(--critical-danger);
}
.btn-secondary,
.btn,
.orion-btn,
.orion-btn-secondary,
.orion-btn.secondary {
  background: var(--critical-secondary-bg);
  color: var(--critical-text);
  border: 1px solid var(--critical-border);
}
.btn-ghost,
.orion-btn-ghost,
.orion-btn.ghost {
  background: transparent;
  color: var(--critical-text-secondary);
  border: none;
}
.orion-btn.sm {
  min-height: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 12px;
}
.orion-btn.lg {
  min-height: 36px;
  height: 36px;
  padding: 0 16px;
}
html[data-sidebar-collapsed='0'] body:not(.orion-chat-home):not(.orion-builder-focus):not(.orion-setup-focus) .orion-main-stage {
  transform: none;
  filter: none;
}
html[data-sidebar-collapsed='0'] body:not(.orion-chat-home):not(.orion-builder-focus):not(.orion-setup-focus) .orion-main-stage::after {
  opacity: 0;
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
    document.body?.style?.setProperty('background', resolved === 'dark' ? '#141415' : '#f4f4f4');
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
              <ControlPlaneSessionBootstrap />
              <div className="orion-app-shell">
                <Suspense fallback={null}>
                  <Sidebar />
                </Suspense>
                <PlatformTopBar />
                <GlobalCommandPalette />
                <main className="orion-main-shell">
                  <div className="orion-main-stage">{children}</div>
                </main>
                <PlatformInspectPanel />
              </div>
            </ToastProvider>
          </PlatformShellProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
