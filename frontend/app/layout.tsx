import type { Metadata } from "next";
import type { Viewport } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PlatformShellProvider } from "@/components/orion/PlatformShellContext";
import PlatformInspectPanel from "@/components/orion/PlatformInspectPanel";
import PlatformTopBar from "@/components/orion/PlatformTopBar";
import CommandPaletteProvider from "@/components/ui/CommandPalette";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
  themeColor: '#f7f7f7',
};

const CRITICAL_SHELL_CSS = `
:root {
  --shell-sidebar-width: 56px;
  --topbar-height: 56px;
  --critical-bg-shell: var(--bg-shell);
  --critical-bg-app: var(--bg-app);
  --critical-bg-surface: var(--bg-surface);
  --critical-border: var(--border-subtle);
  --critical-text: var(--text-primary);
  --critical-text-secondary: var(--text-secondary);
  --critical-primary: var(--primary-base);
  --critical-primary-soft: var(--primary-soft);
  --critical-success: var(--success-base);
  --critical-danger: var(--error-base);
  --critical-success-soft: var(--success-bg);
  --critical-success-text: var(--success-fg);
  --critical-danger-soft: var(--error-bg);
  --critical-danger-text: var(--error-fg);
  --critical-secondary-bg: var(--bg-surface);
  --critical-overlay: var(--bg-hover);
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
  margin-left: var(--shell-sidebar-width);
  width: calc(100vw - var(--shell-sidebar-width));
  max-width: calc(100vw - var(--shell-sidebar-width));
  padding-top: var(--topbar-height);
  min-height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  transition: margin-left 180ms ease, width 180ms ease, max-width 180ms ease, padding-top 180ms ease;
}
.orion-main-stage {
  min-height: calc(100vh - var(--topbar-height));
  height: calc(100vh - var(--topbar-height));
  overflow: hidden;
  padding: 0;
  background: var(--critical-bg-app);
  position: relative;
  display: flex;
  flex-direction: column;
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
.orion-shellbar {
  position: fixed;
  top: 0;
  left: var(--shell-sidebar-width);
  right: 0;
  min-height: var(--topbar-height);
  z-index: 70;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 0 12px;
  background: var(--critical-bg-shell);
  border-bottom: 0;
  transition: left 180ms ease;
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
  border-radius: 8px;
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
    root.style.setProperty('--shell-sidebar-width', hideShellChrome ? '0px' : sidebarCollapsed ? '56px' : '220px');
    root.style.setProperty('--topbar-height', hideShellChrome ? '0px' : '56px');
    document.body?.style?.setProperty('background', 'var(--critical-bg-app)');
  } catch {}
})();
`;

const LOCALHOST_CACHE_CLEANUP_SCRIPT = `
(() => {
  try {
    const hostname = window.location.hostname;
    const isLocalDevHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocalDevHost) return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
    }
    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('empyralis-pwa')).map((key) => caches.delete(key))))
        .catch(() => undefined);
    }
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sidebarStyle = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "56px",
    "--sidebar": "var(--bg-sidebar)",
    "--sidebar-foreground": "var(--text-primary)",
    "--sidebar-primary": "var(--text-primary)",
    "--sidebar-primary-foreground": "var(--bg-surface)",
    "--sidebar-accent": "var(--bg-element)",
    "--sidebar-accent-foreground": "var(--text-primary)",
    "--sidebar-border": "var(--border-subtle)",
    "--sidebar-ring": "var(--primary-border-soft)",
  } as CSSProperties;

  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_SHELL_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALHOST_CACHE_CLEANUP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <CommandPaletteProvider>
              <PlatformShellProvider>
                <SidebarProvider style={sidebarStyle}>
                  <ToastProvider>
                    <div className="orion-app-shell">
                      <Suspense fallback={null}>
                        <Sidebar />
                      </Suspense>
                      <PlatformTopBar />
                      <main className="orion-main-shell">
                        <div className="orion-main-stage">{children}</div>
                      </main>
                      <PlatformInspectPanel />
                    </div>
                  </ToastProvider>
                </SidebarProvider>
              </PlatformShellProvider>
            </CommandPaletteProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
