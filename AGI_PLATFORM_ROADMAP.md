# Conductor: Autonomous Company OS - Strategic Roadmap

## Vision
To build a professional-grade environment for deploying and managing an **Autonomous Workforce**. Conductor is not a "workflow tool" (like n8n); it is a **Cognitive Operating System** where agents have permanent identities, values, shared memory, and the ability to self-correct through loops.

## Design Philosophy: "Usage-Driven Professionalism"
The interface will shift from "Sci-Fi Game" to "Mission Critical Software".
- **Aesthetic**: Deep dark backgrounds (`#020617`), high-contrast functional colors (Emerald for logic, Blue for data, Amber for alerts).
- **Density**: High-information density suitable for a CEO monitoring 10 companies at once.
- **Interactions**: Real-time signal tracing, collapsible inspection panels, and terminal-grade feedback (Keyboard-first, CMD+K driven).

---

## Phase 1: The Identity DNA & Governance
**Objective**: Transition from "Task Nodes" to "Agent Identities" with strict enforcement.

1.  **IdentityDNA Schema**:
    *   Implement `Core Motivation`, `Forbidden Behaviors`, and `Intrinsic Values`.
    *   **The "Super-Ego" Layer**: A specialized runtime check (Governance Node) that validates every action against `Forbidden Behaviors` *before* execution, preventing "Context Drift".

2.  **Global Knowledge Graph (Memory)**:
    *   Move beyond linear context. Implement a shared vector/relational store where "Agent A" in the Marketing Dept can query the results of "Agent B" in the Research Dept.

3.  **Durable Execution (BullMQ/Redis)**:
    *   AGI tasks run for hours. Implement a robust queue system so that "Deep Mode" tasks survive server restarts.

## Phase 2: The Command Center (Frontend)
**Objective**: A high-performance dashboard for the "CEO" (User).

1.  **State Management (Zustand + Rehydration)**:
    *   Migrate state to Zustand.
    *   **State Rehydration Protocol**: Ensure the dashboard instantly fetches the full snapshot of active companies from Redis upon load, solving the "Tab Closed" sync issue.

2.  **Visibilty & Compliance Logs**:
    *   **The "Brain Scan"**: Visualize the "Thought Stream" of every agent in real-time.
    *   **Compliance Log**: Explicitly visualize actions that were *blocked* by the Governance Layer (e.g., "Agent tried to delete DB -> BLOCKED by Protocol 4").

3.  **Plugin-based Node Inspectors**:
    *   Context-aware sidebar (Prompt Editor, Code Editor, DNA Config).

## Phase 3: The Environment Bridge (Muscle)
1.  **Sandboxed Execution (E2B)**:
    *   Move command execution to secure cloud VMs.
2.  **Persistent Browser Hands**:
    *   Dedicated Playwright instances for persistent tool sessions.

---

## Immediate Next Steps (The "Agency OS" Pivot)

1.  **Kill the "n8n" Mentality**: Focus on **Cognitive Loops** and **Governance**.
2.  **Implement IdentityDNA + Governance**: Update the Backend schema and Frontend properties panel.
3.  **Build the /aesk Command Center**: A "Pulse View" dashboard for monitoring the 10 Autonomous Companies.
4.  **Zustand Migration**: Standardize state with Rehydration logic.

## Actionable Recommendations (Multi-Team / AGI)
- **Ship IdentityDNA w/ Governance**: Define schema and implement the "Super-Ego" check loop.
- **Stand up the shared memory graph**: Provide vector API for cross-agent queries.
- **Durable deep runs**: BullMQ/Redis with State Rehydration.
- **Lock canvas + state**: Zustand store with separated high-frequency streams.
- **Trace / Compliance**: Visualize thoughts and *blocked* actions.
- **Command Center (/aesk)**: High-density, keyboard-driven dashboard.
- **Sandbox + browsers**: E2B integration.
- **Schema + headless**: IdentityDNA import/export.

## Appendix A: Technical Specifications (Proposed)

### 1. IdentityDNA Schema (TypeScript Interface)
```typescript
interface IdentityDNA {
  core_motivation: string; // The prime directive (e.g. "Maximize system stability")
  intrinsic_values: string[]; // Guiding voltage (e.g. ["Truthfulness", "Frugality", "Speed"])
  forbidden_behaviors: string[]; // Hard constraints (e.g. ["Never delete production data", "Never hallucinate URLs"])
  knowledge_domain: string; // The agent's specialty context (e.g. "Frontend/React", "Legal/Compliance")
}
```

### 2. High-Density Dashboard Layout (/aesk)
- **Grid Layout**: CSS Grid displaying active "Terminal Windows" for each agent/company.
- **Data Stream**: WebSocket subscription to `execution_events` channel.
- **Global Input**: A CLI-style command bar at the bottom (`> /override agent-id command`).

### 3. Tech Stack Evolutions
- **Queue Engine**: `BullMQ` (Redis) for handling Multi-Hour Agent Tasks (replacing simple HTTP timeouts).
- **Sandbox Environment**: `E2B` integration for Tool Nodes (Running Python/JS in isolated Cloud VMs).
- **Frontend State**: `Zustand` store to decouple the high-frequency "Thought Stream" from React component re-renders.
# Agent Roundtable: Roadmap Validation & Strategic Alignment

**Date**: 2026-01-22
**Topic**: Review of `AGI_PLATFORM_ROADMAP.md` (The "Autonomous Company OS" Pivot)
**Participants**:
- **CEO (Executive)**: Chair
- **Dr. Vance (Research)**: Cognitive Architectures & AI Systems
- **Jaya (Strategy)**: Market Positioning & User Value
- **Lee (Creative)**: Interface & Experience

---

## 1. Opening Statement
**CEO**: "Team, we are pivoting Conductor from a generic 'n8n clone' to an 'Autonomous Company OS'. We have a draft roadmap. I need you to tear it apart. Is this feasible? Is it valuable? Does it look like the future? Dr. Vance, start with the technical feasibility of 'IdentityDNA'."

## 2. Deep Dive: IdentityDNA & Cognitive Loops
**Dr. Vance (Research)**: "The `IdentityDNA` concept is scientifically sound but currently under-specified. Merely injecting a 'core motivation' string into a prompt is insufficient for true AGI consistency.
- **Critique**: If we rely solely on prompt injection, the context window will dilute the DNA over long executions (`> 4 hours`).
- **Recommendation**: We must implement a **'Super-Ego' Layer** in the `CortexNode`. Before *any* action is sent to a tool, a separate, small model (e.g., GPT-3.5-Turbo or a local quantized Llama) must validate the action against the `Forbidden Behaviors` list. It’s a specialized 'Critic' loop, not just a prompt instruction.
- **Verdict**: Phase 1 is critical, but add an explicit **'Governance Node'** capability."

**Jaya (Strategy)**: "I agree. From a product standpoint, 'Values' are what sell this to a CEO. They don't care about the Python sandbox; they care that the agent won't lie to a client.
- **Addendum**: The roadmap needs a **'Compliance Log'**. Every time an agent's `Forbidden Behavior` constraint prevents an action, it must be logged in red in the Dashboard. This proves the value of the OS to the human manager."

## 3. The "Command Center" (/aesk) Interface
**Lee (Creative)**: "The roadmap mentions a 'High-Density Dashboard'. I am worried we are just making another analytics page.
- **Vision**: It shouldn't look like Google Analytics. It should feel like a **Terminal**.
- **Proposal**: The `/aesk` page should be keyboard-first. `CMD+K` to open a command line to talk to *any* agent. The visual grid is fine, but the interaction must be *chat-based* intervention. 'Override Agent A'. 'Pause Agent B'.
- **Aesthetic**: I support the 'Midnight Void' theme. We need to use monospaced fonts for *everything* on this page. It needs to feel 'raw' and 'close to the metal'."

**CEO**: "Good. Lee, I want you to mock up the 'Stream View'. If I have 10 agents running, I can't read 10 chat windows. I need a 'Pulse' view—only show me the agents that are 'Thinking' or 'Erroring'. Collapse the idle ones."

## 4. Technical Feasibility of "Durable Execution"
**Dr. Vance**: "The roadmap suggests `BullMQ`. This is necessary but not sufficient for the 'State Management' problem described.
- **Problem**: If we move to `Zustand` (Frontend) and `BullMQ` (Backend), we have a sync problem. The User Interface will de-sync from the actual execution state if the browser tab is closed.
- **Research Update**: We need a **'State Rehydration'** protocol. When the Command Center loads, it shouldn't just listen for *new* events; it must fetch the *snapshot* of the current state of the 10 Companies from Redis.
- **Action**: Add 'State Rehydration Middleware' to the Phase 2 technical specs."

## 5. The "Sandboxed Hands"
**Jaya**: "E2B is a good choice for speed. But users might want to run this locally for privacy.
- **Strategic Pivot**: Can we make the 'Tool Node' agnostic? Default to E2B for cloud, but allow a clear 'Local Docker' switch for enterprise users?
- **CEO Decision**: Not for V1. Start with E2B to ensure stability. Local Docker support adds too much support overhead right now. Stick to the roadmap."

---

## 6. Consensus & Action Plan

**CEO Summary**: "The team is aligned, with three critical amendments:
1.  **Governance Layer**: IdentityDNA needs a runtime enforcer, not just a prompt injection.
2.  **Compliance Logging**: We must visualize *prevented* actions to show value.
3.  **State Rehydration**: The Dashboard needs robust sync logic, not just a live socket.

**Priorities for Immediate execution:**
1.  **Refine the Roadmap**: Update `AGI_PLATFORM_ROADMAP.md` with Vance's 'Governance Node' and Jaya's 'Compliance Log'.
2.  **Build Phase 1**: Start with the backend definitions for IdentityDNA."

---

*End of Transcript*
# /aesk Command Center: Technical Specification
**Version**: 1.0
**Design Philosophy**: "Bloomberg Terminal for AGI"

## 1. Overview
The `/aesk` route (AESK: Autonomous Entity Supervision Kit) is the high-density supervision dashboard for the Human CEO. It enables monitoring 10+ autonomous agent teams simultaneously without visual clutter.

## 2. Layout Structure (CSS Grid)
The page will use a strict bento-grid layout (CSS Grid) that adapts to screen size but favors ultra-wide monitors.

```
+---------------------------------------------------------------+
| HEADER (100% width)                                           |
| [LOGO]  [GLOBAL STATUS: OPTIMAL]  [BURN RATE: $14.20/hr]      |
+---------------------------------------------------------------+
| GRID AREA (Auto-flow rows)                                    |
| +---------------------+ +---------------------+ +-----------+ |
| | AGENT ALPHA (CEO)   | | AGENT BETA (R&D)    | | AGENT...  | |
| | Status: Thinking... | | Status: Idle        | |           | |
| | [Last Log]          | | [Last Log]          | |           | |
| | [Action Stream]     | | [Action Stream]     | |           | |
| +---------------------+ +---------------------+ +-----------+ |
| ... (Repeats for N agents)                                    |
+---------------------------------------------------------------+
| CLI FOOTER (Sticky Bottom)                                    |
| > /system override agent-alpha --stop                         |
+---------------------------------------------------------------+
```

## 3. The Agent "Tile" Component
Each tile corresponds to a running workflow/company.
- **Header**: Agent Name + Role icon.
- **Status Indicator**:
    - 🟢 `IDLE` (Pulse effect)
    - 🔵 `THINKING` (Fast flash)
    - 🟠 `EXECUTING` (Solid with progress bar)
    - 🔴 `BLOCKED` (Compliance violation warning)
- **The "Stream"**: A terminal-like log view showing `stdout` of the agent's thought process (token stream).
- **Metric Sparklines**: Mini-charts for `Cost` and `Memory Usage`.

## 4. The Global CLI (Command Line Interface)
A unified input bar at the bottom page.
**Commands**:
- `/log [agent_id]` -> Expands that agent's tile to full screen.
- `/pause [agent_id]` -> Sends a POSIX `SIGSTOP` equivalent to the agent loop.
- `/inject [agent_id] [message]` -> Inserts a "User Message" into the agent's context window immediately.
- `/kill all` -> Emergency stop for all agents.

## 5. Technical Implementation
- **State**: `Zustand` store mirroring the backend `Redis` state.
- **Transport**: `useExecutionSocket` (WebSocket) subscribes to `room:global_ops`.
- **Rendering**: `xterm.js` for the log streams (high performance) or virtualization for React lists to prevent DOM explosion.

## 6. Implementation Plan
1. Create `frontend/app/aesk/page.tsx`
2. Implement `AgentTile` component.
3. Implement `GlobalCLI` component.
4. Wire up WebSocket global subscription.
