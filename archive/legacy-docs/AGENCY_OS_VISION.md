# Autonomous Company OS: Vision & Roadmap Analysis

## 1. Executive Summary
**Goal**: Shift from "Workflow Automation" (n8n style) to "Agency Architecture" (Autonomous Company OS).
**Core Philosophy**: Agents are not just performing tasks; they have **Identity**, **Values**, **Memory**, and **Self-Correction capabilities**. The platform acts as the "Middle Man" between high-level intent (CEO) and execution tools (Browsers, Terminals, Design Apps).

---

## 2. Current Architecture vs. Requirements

| Requirement (The Vision) | Current Status (Conductor Platform) | Gap / Action Item |
| :--- | :--- | :--- |
| **Rank**: Local, Private, Fast (Python/Node) | **Existing**: Next.js + NestJS running locally on MacBook. | **Aligned**. Ensure Python environment is accessible via Bridge for specific logic if needed. |
| **Logic Engine**: Cycles & Self-Correction | **Existing**: React Flow allows cyclic connections (loops). `Squad` nodes allow multi-agent grouping. | **Build**: specific "Critic/Refinement" sub-graphs or Squad patterns. |
| **Database**: SQLite / Single File Memory | **Existing**: Prisma (SQLite/Postgres). | **Aligned**. Need to expose "Memory" as a first-class tool for Agents to query "past actions". |
| **Browser Hands**: Playwright | **Existing**: `Web Search` tool exists. | **Build**: Deep Integration with Playwright via `Coding Node` or dedicated `Browser Node` for complex interactions. |
| **The Editor**: VS Code / Antigravity | **Existing**: This project *is* the editor. | **Aligned**. |
| **Connectivity**: "Middle Man" / Bridge | **Existing**: `conductor-bridge` (CLI) recently implemented. | **Aligned**. Allows local command execution. |

---

## 3. The 5-Phase Roadmap (Implementation Plan)

### Phase 1: The Identity Foundation (Configuration Engine)
**Goal**: Define the "DNA" of the 10 Companies (Agents).
*   **What We Have**: Agent Nodes with System Prompts.
*   **What We Need**: 
    *   A structured `Variables` implementation (just built!) to store global values.
    *   **Action**: Create a "Profile/Identity" schema for Agents that goes beyond simple prompts. Include "Values" (e.g., `constrain: "hate clickbait"`, `drive: "deep physics"`).
    *   **File**: Create `niches.yaml` or equivalent JSON structure in the `Global Variables` page to inject into every Agent's context.

### Phase 2: The "Self-Healing" Feedback Loop (Critic Agent)
**Goal**: Quality control before publication.
*   **What We Have**: Sequential flows (`Agent -> Tool`).
*   **What We Need**: A "Loop" pattern.
    *   **Action**: Create a Standard "Publisher Squad" Template: `Creator Agent` -> `Critic Agent` -> (Decision Node) -> `Refine` OR `Publish`.
    *   This leverages the Orchestrator's ability to route based on agent output.

### Phase 3: The Persistent Memory (The Diary)
**Goal**: Contextual awareness of past actions.
**Status**: ✅ **Partially Implemented (AC-OS v1)**
*   **Knowledge Graph**: `global_knowledge` table implemented for cross-niche learning.
*   **Identity Memory**: `agent_identities` tracks action history and provenance.
*   **Action**: 
    *   Connect `Memory Tool` to the new `get_insights` CLI command.

### Phase 4: The "Environment Bridge" (Action Wrappers)
**Goal**: "Action Wrappers" for local tools.
**Status**: ✅ **Implemented (AC-OS Identity)**
*   **Bridge**: `conductor-bridge` is active.
*   **Wrappers**: `agency_logic.py` now supports `sign_publish`, `get_insights`, `safety_status`.
*   **Safety**: "Dead Man's Switch" (Rate Limiting + Emergency Stop) is live (`agent_identity.py`).

### Phase 5: The CEO Command Center (The UI)
**Goal**: A "Heartbeat" Dashboard.
*   **What We Have**: A "Command Center" page placeholder and "Executions" list.
*   **What We Need**: A High-Density, Terminal-Aesthetic Dashboard.
*   **Action**: 
    *   Build the `/aesk` (Command Center) page to look like a `Rich`/`Textual` terminal interface.
    *   **Visuals**: Dark mode, Monospace fonts, Real-time logs stream, "Active Agents" status indicators (blinking LEDs).
    *   **Function**: Show all 10 "Companies" (Workflows) running in parallel.

---

## 4. Technical Strategy: Hierarchical Intelligence
To implement the "Researcher (Cheap/Fast) -> CEO (Expensive/Smart)" model:
1.  **Worker Agents**: Configure `Research` and `Drafting` nodes to use localized models (Llama 3 via Ollama) or cheaper APIs (Gemini Flash).
2.  **Executive Agents**: Configure `Critic` and `CEO/Approval` nodes to use **GPT-4o** or **Claude 3.5 Sonnet**.
3.  **Visual Queue**: Use the `NodePropertiesPanel` to clearly visualize which model drives which agent.

## 5. Next Immediate Step
**Build Phase 1 & 5 Convergence**: 
Use the newly built Global Variables (`frontend/app/variables`) to define the `niches_config` and then build the **Command Center** UI to visualize these active niches.

---

## 6. Current Platform Inventory (As of Session End)

### **A. Core Stack & Infrastructure**
*   **Frontend**: Next.js 14 (App Router), React, TailwindCSS (limited use), Vanilla CSS (`globals.css`), React Flow (for canvas).
*   **Backend**: NestJS, TypeScript, Socket.IO (WebSockets), Prisma ORM (SQLite).
*   **Local Bridge**: `conductor-bridge` (Node.js CLI) for executing local shell commands via WebSocket.
*   **Database**: SQLite (`dev.db`), managed via Prisma.

### **B. Key Features Implemented**
1.  **Orchestration Canvas**:
    *   **Drag-and-Drop Workflow Builder**: Nodes (Agents, Tools, triggers) and Edges.
    *   **Node Types**:
        *   **Agent**: Standard LLM Agent (System Prompt, Model Selection).
        *   **Squad**: Multi-agent group (Manager + Workers) enabling hierarchical tasks.
        *   **Tool**: integrations (Webhook, Search, DB Query, Telegram, **Execute Command**).
        *   **Coding**: Python/JS/Bash execution (Cloud or Local via Bridge).
        *   **Reasoning/Research/Vision**: Specialized agent precursors.
        *   **Logic/Approvals**: Conditional routing and Human-in-the-loop (wait/resume).
2.  **Execution Engine**:
    *   **Hybrid Execution**: Backend runs the flow; `ExecutionsGateway` handles real-time logs via WebSockets.
    *   **Loop Support**: Capable of handling cyclic graphs (Agent A <-> Agent B).
    *   **Local Execution Bridge**: Routes "Execute Command" actions to the user's local terminal via `conductor-bridge`.
3.  **Data & Memory**:
    *   **Global Variables**: Key/Value store (Strings/JSON) accessible in workflows via `{{ $vars.KEY }}`.
    *   **Execution Logs**: Persistent history of every run, step, and output.
4.  **User Interface (AESK / iOS Pro Aesthetic)**:
    *   **Sidebar**: Collapsible, floating toggle (top), pinned User Profile (bottom), "iPad Professional" glassmorphism style.
    *   **Theme**: Light/Dark/System support via `ThemeProvider`.
    *   **Minimalist Header**: Auto-hides global topbar in Editor for maximum focus.

### **C. Directory Structure Highlights**
*   **`/frontend`**:
    *   `app/workflows/[id]`: The main Editor Canvas logic (`page.tsx` handles canvas + local header).
    *   `components/Sidebar.tsx`: The navigation logic (recently refactored for Agency layout).
    *   `components/NodePropertiesPanel.tsx`: The configuration UI for all nodes.
    *   `lib/api.ts`: API client interfacing with Backend.
*   **`/backend`**:
    *   `src/executions/`: Core logic (`executions.service.ts` runs the graph; `executions.gateway.ts` handles sockets/bridge).
    *   `src/agents/`: Definitions for specific agent behaviors.
    *   `src/squads/`: Logic for multi-agent coordination.
*   **`/bridge`**:
    *   Standalone Node.js CLI tool (`src/index.ts`) that connects to Backend to run local commands.

### **D. Capabilities Ready for "Agency" Transition**
*   **Context Injection**: We can already inject Global Variables (`niches.yaml` config) into the Execution Context.
*   **Tool Routing**: The `ToolNode` architecture is generic enough to wrap any Python script (Phase 4).
*   **Feedback Loops**: The Canvas already supports drawing an edge *back* to a previous node (Phase 2).
*   **Human Oversight**: The `ApprovalNode` allows the "CEO" (User) to intervene before a "Publish" action (Phase 5).

This platform acts as the **"Skeleton"** of your Autonomous Company. The "Brain" (Logic updates) and "Muscle" (Scripts) are the next layers to add according to your Roadmap.

