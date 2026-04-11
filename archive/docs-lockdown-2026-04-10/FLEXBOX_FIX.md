# FLEXBOX LAYOUT FIX
**Prepared by:** Principal UX/UI Design Director
**Target:** Next.js Layout & Sidebar (Empyralis OS)

## 1. `frontend/app/layout.tsx`

```tsx
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AppSidebar from "@/components/ui/AppSidebar";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PlatformShellProvider } from "@/components/orion/PlatformShellContext";
import PlatformInspectPanel from "@/components/orion/PlatformInspectPanel";
import PlatformTopBar from "@/components/orion/PlatformTopBar";
import CommandPaletteProvider from "@/components/ui/CommandPalette";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BRAND } from "@/lib/brand";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: `${BRAND.company} — AI Operating System`,
  description: `Experience the future of work with the Empyralis AI Autopilot.`,
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("dark", inter.variable)}>
      <body className="bg-zinc-950 text-zinc-50 antialiased h-screen w-screen flex flex-col overflow-hidden">
        <ThemeProvider attribute="class" forcedTheme="dark" enableSystem={false}>
          <TooltipProvider>
            <CommandPaletteProvider>
              <PlatformShellProvider>
                <ToastProvider>
                  <PlatformTopBar />
                  <div className="flex flex-1 overflow-hidden pt-14">
                    <AppSidebar />
                    <main className="flex-1 overflow-y-auto relative">
                      {children}
                    </main>
                    <PlatformInspectPanel />
                  </div>
                </ToastProvider>
              </PlatformShellProvider>
            </CommandPaletteProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

## 2. `frontend/components/ui/AppSidebar.tsx`

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, MessageSquare, Bot, BookOpen, Plug, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const NAV_ITEMS = [
  { label: 'Overview', href: '/home', icon: House },
  { label: 'Sage', href: '/', icon: MessageSquare },
  { label: 'Agents', href: '/agents', icon: Bot },
  { label: 'Blueprints', href: '/library', icon: BookOpen },
  { label: 'Integrations', href: '/connectors', icon: Plug },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside 
      className={cn(
        "flex-shrink-0 border-r border-zinc-800/50 bg-zinc-950/50 flex flex-col p-3 transition-all duration-300",
        isCollapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-200",
                isActive 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
              )}
            >
              <div className={cn(
                "w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center transition-all",
                isActive ? "bg-zinc-800 border border-white/10" : "bg-transparent"
              )}>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              {!isCollapsed && (
                <span className="truncate">{item.label}</span>
              )}
              {isActive && !isCollapsed && (
                <div className="ml-auto w-1 h-1 flex-shrink-0 rounded-full bg-white shadow-[0_0_8px_white]" />
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto border-t border-white/5 pt-3 flex flex-col gap-1">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
            <Settings size={18} />
          </div>
          {!isCollapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
        >
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </div>
          {!isCollapsed && <span className="truncate">Collapse Sidebar</span>}
        </button>
      </div>
    </aside>
  );
}
```
