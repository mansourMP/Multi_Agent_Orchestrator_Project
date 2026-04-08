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
import "./globals.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { DESIGN_TOKENS, SHELL_CHROME } from "@/design-constraints";

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

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
  themeColor: DESIGN_TOKENS.color.canvas,
};

const CRITICAL_SHELL_CSS = `
:root {
  --shell-sidebar-width: ${SHELL_CHROME.sidebarCollapsed}px;
  --topbar-height: ${SHELL_CHROME.topbarHeight}px;
  --desktop-titlebar-height: 0px;
  --desktop-drag-padding-left: 0px;
  --critical-bg-shell: ${DESIGN_TOKENS.color.surfaceMuted};
  --critical-bg-app: ${DESIGN_TOKENS.color.canvas};
  --critical-bg-surface: ${DESIGN_TOKENS.color.surface};
  --critical-border: ${DESIGN_TOKENS.color.borderSubtle};
  --critical-text: ${DESIGN_TOKENS.color.textPrimary};
  --critical-text-secondary: ${DESIGN_TOKENS.color.textSecondary};
  --critical-primary: ${DESIGN_TOKENS.color.accentStrong};
  --critical-primary-soft: ${DESIGN_TOKENS.color.accentSoft};
  --critical-success: ${DESIGN_TOKENS.color.success};
  --critical-danger: ${DESIGN_TOKENS.color.danger};
  --critical-success-soft: ${DESIGN_TOKENS.color.successSoft};
  --critical-success-text: ${DESIGN_TOKENS.color.success};
  --critical-danger-soft: ${DESIGN_TOKENS.color.dangerSoft};
  --critical-danger-text: ${DESIGN_TOKENS.color.danger};
  --critical-secondary-bg: ${DESIGN_TOKENS.color.surface};
  --critical-overlay: ${DESIGN_TOKENS.color.overlay};
  --critical-page-gap: ${DESIGN_TOKENS.space[5]}px;
  --critical-page-inset-x: ${SHELL_CHROME.pageInsetX}px;
  --critical-page-inset-bottom: ${SHELL_CHROME.pageInsetBottom}px;
  --critical-page-narrow-max: 920px;
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
  font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
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
  padding-top: calc(var(--topbar-height) + var(--desktop-titlebar-height));
  min-height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  transition: margin-left 180ms ease, width 180ms ease, max-width 180ms ease, padding-top 180ms ease;
}
.orion-main-stage {
  min-height: calc(100vh - var(--topbar-height) - var(--desktop-titlebar-height));
  height: calc(100vh - var(--topbar-height) - var(--desktop-titlebar-height));
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
  top: var(--desktop-titlebar-height);
  left: var(--shell-sidebar-width);
  right: 0;
  min-height: var(--topbar-height);
  z-index: 70;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 0 ${DESIGN_TOKENS.space[4]}px;
  background: var(--critical-bg-shell);
  border-bottom: 1px solid var(--critical-border);
  transition: left 180ms ease;
}
.orion-app-shell > aside {
  top: var(--desktop-titlebar-height) !important;
  bottom: 0 !important;
  height: calc(100vh - var(--desktop-titlebar-height));
}
html[data-sidebar-collapsed='0'] body:not(.orion-chat-home):not(.orion-setup-focus) .orion-main-stage {
  transform: none;
  filter: none;
}
html[data-sidebar-collapsed='0'] body:not(.orion-chat-home):not(.orion-setup-focus) .orion-main-stage::after {
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
    const hideShellChrome = pathname.startsWith('/setup');
    const isTauriDesktop = '__TAURI_INTERNALS__' in window || navigator.userAgent.includes('Tauri');
    const isMacDesktop = isTauriDesktop && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    if (resolved === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.style.colorScheme = resolved;
    const sidebarCollapsed = localStorage.getItem('empyralist:sidebar-collapsed') === '1';
    root.setAttribute('data-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
    root.style.setProperty('--shell-sidebar-width', hideShellChrome ? '0px' : sidebarCollapsed ? '${SHELL_CHROME.sidebarCollapsed}px' : '${SHELL_CHROME.sidebarExpanded}px');
    root.style.setProperty('--topbar-height', hideShellChrome ? '0px' : '${SHELL_CHROME.topbarHeight}px');
    root.style.setProperty('--desktop-titlebar-height', hideShellChrome || !isTauriDesktop ? '0px' : '${SHELL_CHROME.desktopTitlebarHeight}px');
    root.style.setProperty('--desktop-drag-padding-left', hideShellChrome || !isMacDesktop ? '0px' : '72px');
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
    "--sidebar-width": `${SHELL_CHROME.sidebarExpanded}px`,
    "--sidebar-width-icon": `${SHELL_CHROME.sidebarCollapsed}px`,
    "--sidebar": DESIGN_TOKENS.color.surfaceMuted,
    "--sidebar-foreground": DESIGN_TOKENS.color.textPrimary,
    "--sidebar-primary": DESIGN_TOKENS.color.textPrimary,
    "--sidebar-primary-foreground": DESIGN_TOKENS.color.surface,
    "--sidebar-accent": DESIGN_TOKENS.color.surface,
    "--sidebar-accent-foreground": DESIGN_TOKENS.color.textPrimary,
    "--sidebar-border": DESIGN_TOKENS.color.borderSubtle,
    "--sidebar-ring": DESIGN_TOKENS.color.accentSoft,
  } as CSSProperties;

  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable)}>
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
                      <div
                        data-tauri-drag-region
                        aria-hidden="true"
                        style={{
                          height: `${SHELL_CHROME.desktopTitlebarHeight}px`,
                          width: '100%',
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          zIndex: 9999,
                          pointerEvents: 'none',
                          paddingLeft: 'var(--desktop-drag-padding-left)',
                        }}
                      />
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
