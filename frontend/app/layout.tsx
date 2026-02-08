import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";

export const metadata: Metadata = {
  title: "Conductor - Orchestrate Your AI Workforce",
  description: "Enterprise-grade AI agent orchestration platform. Build, deploy, and manage autonomous AI agents with vision, coding, and research capabilities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <ToastProvider>
            <Sidebar />
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {/* Topbar removed for cleaner layout */}
              <main style={{
                marginLeft: 'var(--sidebar-width)',
                minHeight: '100vh',
                position: 'relative',
                zIndex: 1
              }}>
                {children}
              </main>
            </div>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
