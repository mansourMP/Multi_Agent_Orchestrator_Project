# Project Investigation & Handoff Report: "Compiling..." Hang Issue

## 1. Project Overview
An **Autonomous Company Operating System** ("Conductor") designed for deploying and managing a workforce of AI agents with shared memory, identity, and values.
*   **Philosophy**: Pivot away from "n8n-style" linear workflows toward **Cognitive Architectures** (Loops, Critique, Self-Correction).
*   **Frontend:** Next.js 16.1.3, React 19.2.3, TypeScript.
*   **Backend:** NestJS (Node.js) on port 4000.
*   **Engine:** Python-based agency logic.
*   **Communication:** Socket.io for real-time execution logs.

## 2. The Primary Problem: Compilation Hang
**Symptom:** The Next.js development server hangs indefinitely at `○ Compiling /workflows/[id] ...` or `○ Compiling /workflows ...`. The browser stays blank or shows the Next.js "Compiling..." toast, but never renders the page.

### Root Cause Analysis
*   **React 19 Incompatibility:** The project was using `reactflow` v11, which is fundamentally incompatible with React 19's rendering engine and Server Components.
*   **SSR Conflict:** ReactFlow/XYFlow components often trigger hangs when pre-rendered on the server due to dependencies on browser-only APIs (DOM, SVG measurements).
*   **Syntax Error:** A duplicate function declaration (`function WorkflowEditor`) was introduced/found in `WorkflowEditorInner.tsx`.

## 3. Actions Taken & Results
1.  **Library Migration:** Migrated `reactflow` to `@xyflow/react` (v12) for official React 19 support.
2.  **SSR Isolation:** Wrapped `WorkflowCanvas` in `next/dynamic` with `ssr: false`.
3.  **Code Strip-down:** Overwrote `WorkflowEditorInner.tsx` with a minimal "Isolation Test" component. 
    *   *Result:* The minimal version loaded for the user, but subsequent attempts to restore full logic caused the hang to return.
4.  **Build Tooling Change:** Removed the `--webpack` flag from `package.json` to use **Turbopack**, which handles React 19 better.
5.  **Cache Clearing:** Repeatedly ran `rm -rf .next` to clear corrupted build artifacts.

## 4. Current Status & Blockers
*   **Inconsistent Behavior:** The root `/` route sometimes works, but `/workflows` and `/workflows/[id]` are highly prone to freezing the dev server during compilation.
*   **Environment Sensitivity:** The hang persists even after library upgrades and code simplification, suggesting a deeper issue with how the global `Sidebar` or `Layout` interacts with the specific route chunks.
*   **Dependency Management:** `npm install` must be run to ensure `@xyflow/react` is properly linked after the `package.json` update.

## 5. Architectural Findings (Beyond the Bug)
*   **Missing Features:** Node Library Panel, proper Node Inspector, and Versioning are currently absent from the UI.
*   **Safety:** Basic `safety_tickets` table exists, but proactive prompt injection/PII filtering is needed in the Python engine.
*   **Execution:** The system supports both "Swarm" (parallel) and "Deep" (sequential) modes, but the UI doesn't yet expose toggles for these.

## 6. Recommendations for Next Assistant
1.  **Verify Node Version:** Ensure the environment is running Node 20+ (LTS).
2.  **Global Component Audit:** Check `Sidebar.tsx` and `layout.tsx` for components that might be causing hydration loops or blocking the main thread during hydration.
3.  **Client-Side Entry:** Consider moving the *entire* workflow page content into a `useEffect` to force it entirely off the server until the client is ready.
4.  **Port Conflict:** Ensure port 3000 isn't being partially held by a ghost process (`lsof -i :3000`).

---
*Created on Wednesday, January 21, 2026*
