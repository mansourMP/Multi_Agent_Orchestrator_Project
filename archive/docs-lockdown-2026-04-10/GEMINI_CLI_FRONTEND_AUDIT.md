# FRONTEND UX/UI DESIGN AUDIT & ROADMAP
**Prepared by:** Principal UX/UI Design Director
**Target:** Empyralis / AI Operating System (Next.js Frontend)

## EXECUTIVE SUMMARY
The current frontend architecture map reveals a system that is functional but entirely too safe. It leans heavily on "standard dashboard" tropes—generic sidebars, basic card grids, and a chatbot interface that feels bolted on rather than native. To elevate this to a tier-1 enterprise AI Operating System (on par with Linear, Vercel, or Apple), we must rip out the "web app" feel and replace it with a **native command center** aesthetic.

Here is the brutal, unfiltered roadmap to achieve this vision.

---

## 1. BOLD LAYOUT SHIFTS: Structural Overhaul

The current shell (`PlatformShellContext`, `AppSidebar`, `WorkbenchCenterPanel`) is likely relying on generic flex/grid layouts that create boxy, isolated regions. We need fluidity, depth, and edge-to-edge immersion.

**The Fixes:**
*   **The Mac-like "Unified Titlebar":** Merge `PlatformTopBar` and `AppSidebar` controls into a unified, translucent Mac-like title bar (`h-12` or `h-14`) that bleeds into the window background. The command palette (`GlobalCommandPalette`) should be center-aligned in this bar, acting as the omni-search/omni-action hub (like Apple Spotlight or Raycast).
*   **Floating Sidebar & "Focus Mode":** Stop pinning the `AppSidebar` as a permanent structural column. Convert it to a floating, glassmorphic panel (`backdrop-blur-xl`, `bg-background/60`) that overlays the main content and can be toggled completely out of the way. When the user is working with an Agent or Workflow, the UI should enter a "Focus Mode" where the sidebar disappears, letting the content breathe edge-to-edge.
*   **Spatial "Main Stage" (WorkbenchShell):** The main workspace (`/`) shouldn't feel like a page you navigate *to*; it should feel like the desktop you boot *into*. The `WorkbenchCenterPanel` must become an infinite spatial canvas. Remove hard borders. Use subtle radial gradients (`bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]`) to create depth, making the active task (the chat or the artifact) feel like it's hovering in the foreground.
*   **The Inspect Panel as an Inspector:** The `PlatformInspectPanel` on the right should slide in seamlessly over the content with a slight shadow drop (`shadow-2xl`), not squash the center stage via flex basis adjustments. It should feel like opening the inspector in Xcode or Figma.

---

## 2. THE 'SAGE' CHAT INTERFACE: Premium Command Center

Currently, `ChatSurface` and its children (`ApprovalRequestCard`, `InterventionCards`) sound like a standard text-message feed. An AI OS needs a multi-modal, rich-media command line, not a WhatsApp clone.

**The Fixes:**
*   **The "Omni-Composer":** Detach the chat input (`composer`) from the bottom of the screen. Make it a floating, commanding presence (think Linear's issue creation modal or macOS Spotlight) that sits just above the bottom edge. It should expand dynamically as the user types and support rich pasting (files, images, references) via slick drag-and-drop overlays.
*   **Inline Generative UI (v0-style):** The chat feed must move beyond text bubbles. When an agent generates code, a graph, or an `Artifact`, it shouldn't just link out to `/artifacts`; the UI should morph *inline*. We must heavily integrate `ArtifactCodeView`, `ArtifactHtmlPreview`, etc., directly into the `ChatSurface` event stream using Framer Motion `layout` animations for smooth expansion.
*   **Action-Oriented Interventions:** `ApprovalRequestCard` must feel critical and satisfying. Use a darker or intensely frosted background for approvals to draw immediate focus. The "Approve" button should have a physical press feel (scale down to `0.97`) and a subtle glow to signify its weight.
*   **Activity Rail as a "Live HUD":** The `WorkbenchActivityRail` shouldn't just be static logs. It should be a live, scrolling ticker of background agent thoughts, API calls, and system states, heavily utilizing `text-xs`, mono-fonts, and muted colors (`text-muted-foreground/50`) to feel like a hacker's terminal running gracefully in the background.

---

## 3. DESIGN SYSTEM OVERHAUL: Injecting the Tier-1 Aesthetic

The map shows a mix of custom CSS vars (`design-constraints.ts`), Shadcn, and generic Tailwind. It's time to consolidate and elevate.

**The Fixes (To be injected into `globals.css` and components):**
*   **Monochromatic & Brutalist Core:** Strip out excessive primary colors. The app should be overwhelmingly black/white/grays (e.g., `zinc-950` to `zinc-50`). Color should ONLY be used for semantic states (Red = Error/Hard Kill, Amber = Intervention, Blue/Purple = AI Generating).
*   **Framer Motion Everywhere:** Every mount, unmount, and layout shift must be animated.
    *   *Dialogs/Modals:* `initial={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}`
    *   *List Items (`ResourceListRow`):* Staggered fade-ins.
    *   *Layout Shifts:* Use `<motion.div layout>` for everything in the `WorkbenchShell` so resizing panels feels fluid, not jerky.
*   **Strict Typography Hierarchy:**
    *   **Display:** `tracking-tighter`, `font-medium` (e.g., Inter or Geist). Use for Hero titles.
    *   **UI/Interface:** `text-[13px]` or `text-sm` for all standard controls. Make it dense and precise.
    *   **Mono:** Use a premium monospace (e.g., JetBrains Mono, Geist Mono) for the `RunLiveEventFeed`, `LogViewer`, and `ArtifactCodeView`.
*   **Glassmorphism & Layering (`design-constraints.ts` updates):**
    *   Define precise elevation tokens. 
    *   `panelStyle()`: Base panels should be completely flat, borderless, with a very subtle 1px border `border-white/10` (in dark mode) and an inner shadow to create a "recessed" or "elevated" hardware feel.
    *   Replace standard solid backgrounds with `bg-background/80 backdrop-blur-2xl` for the topbar, sidebar, and floating context menus.

---

## 4. TEMPLATE CREATOR UX: The Missing Link

The architecture map notes that the visual React Flow builder (`/builder`) was amputated, and `/builder` currently redirects to `/agents`. We need a seamless "Create Template" / "Build Agent" flow for non-technical users that doesn't rely on a complex canvas.

**The Strategy & Location:**
*   **Where:** Create a new route `frontend/app/agents/new/page.tsx` and `frontend/components/orion/agents/AgentCreatorWizard.tsx`.
*   **The UX Pattern: "Conversational Creation" & "Form-as-a-Preview"**
    1.  **Split Screen Layout:** Use a 50/50 split layout. The left side is a conversational interface (a specialized instance of `ChatSurface`); the right side is a live-updating preview of the `AgentSwitchboardForm` / `AgentStoreCard`.
    2.  **The Flow:** The user talks to the "Meta-Agent" on the left: *"I need an agent that monitors my Slack for angry customers and drafts an apology email."*
    3.  **Live Updates:** As the user speaks, the Meta-Agent auto-fills the right-hand panel in real-time using Framer Motion to highlight changed fields (Name, System Prompt, Connectors).
    4.  **No Canvas:** Instead of dragging nodes, the user tweaks the logic through sequential, plain-English steps. The UI exposes advanced settings (like `RuntimeProfiles` or `Execution Targets`) hidden behind an "Advanced Settings" accordion that is beautifully animated.
    5.  **One-Click Publish:** A massive, sticky bottom-bar CTA: "Deploy Specialist". Upon clicking, trigger a multi-step loading sequence with micro-interactions (e.g., "Provisioning runtime...", "Attaching Slack connector...", "Online.") before dropping them back to the `/agents` dashboard with a success toast.

---
**Next Steps:** Approve these directionals, and we will begin rewriting `globals.css`, the `PlatformShellContext`, and the `ChatSurface` to realize this vision immediately.