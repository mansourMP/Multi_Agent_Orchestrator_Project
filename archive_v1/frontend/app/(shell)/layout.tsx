import PlatformInspectPanel from "@/components/orion/PlatformInspectPanel";
import PlatformTopBar from "@/components/orion/PlatformTopBar";
import AppSidebar from "@/components/ui/AppSidebar";
import { SHELL_CHROME } from "@/design-constraints";

export default function ShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="orion-app-shell">
      <div
        data-tauri-drag-region
        aria-hidden="true"
        style={{
          height: `${SHELL_CHROME.desktopTitlebarHeight}px`,
          width: "100%",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 9999,
          pointerEvents: "none",
          paddingLeft: "var(--desktop-drag-padding-left)",
        }}
      />
      <AppSidebar />
      <PlatformTopBar />
      <main className="orion-main-shell">
        <div className="orion-main-stage">{children}</div>
      </main>
      <PlatformInspectPanel />
    </div>
  );
}
