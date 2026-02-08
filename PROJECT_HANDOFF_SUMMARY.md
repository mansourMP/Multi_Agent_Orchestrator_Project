# Agency OS: Project Handoff & Architecture Summary
**Generated for User Handoff - 2026-01-20**

## 1. The Vision
We are building a **Codex-Grade AI Agent Orchestrator** ("Agency OS").
*   **Philosophy**: Mixed Autonomy. The "Brain" (Logic/Reasoning) runs in Python for flexibility and library access (LangChain/Pydantic), while the "Hands" (Execution/API/Serving) run in Node.js/NestJS for performance and scalability.
*   **Aesthetic**: "Sovereign" / "Midnight Navy". A premium, professional CLI/Dashboard hybrid. Now fully supports **System Light/Dark Modes**.

---

## 2. System Architecture

### A. The Hybrid Engine "WIRING"
We do NOT pass large text arguments via CLI. We use a **File-Based Payload** system for robust state management.
1.  **Node (Orchestrator)**: Triggers a step. Creates a JSON payload in `/tmp/agency_os/{exec_id}/`.
2.  **Bridge**: Calls Python script with `--in /tmp/.../payload.json`.
3.  **Python (Brain)**: Reads payload, executes logic (LLM chains, Tools), writes result JSON.
4.  **Node**: Reads result JSON, updates DB/UI.

### B. Core Components
1.  **Frontend (`/frontend`)**:
    *   **Framework**: Next.js 14, Tailwind CSS.
    *   **State**: ReactFlow for the Canvas.
    *   **Theming**: `frontend/app/globals.css` uses CSS Variables (`--bg-app`, etc.) to switch between Midnight (Dark) and Clean (Light) modes automatically.
    *   **Key Fix**: `WorkflowCanvas.tsx` now uses dynamic variables, fixing the "black hole" issue in Light Mode.

2.  **Backend (`/backend`)**:
    *   **Framework**: NestJS + Prisma (SQLite).
    *   **State**: `dev.db` (Primary App State).
    *   **Auth**: Currently running in **DEV MODE**. `WorkflowsController` is patched to use `dev-user-id` fallback if no auth token is present (Fixes "Failed to create workflow" error).

3.  **Python Engine (`/python_engine`)**:
    *   **Core**: `agency_logic.py`.
    *   **Memory**: `agency_memory.db` (Separate SQLite for Agent Memory/Context).
    *   **Capabilities**:
        *   `check_network`: De-duplication of topics.
        *   `critic_eval`: Self-correction loop.
        *   `safety_ticket`: Generates tickets for human review.

---

## 3. The "Viral Factory" Workflow (Gold Standard)
We have designed a reference workflow that demonstrates the full pipeline.
*   **Script**: `scripts/seed_viral_factory.py` (Run this to reset/seed the workflow).
*   **Flow Steps**:
    1.  **Trigger**: Webhook "Trend Alert".
    2.  **Prep Network**: Python script creates Payload.
    3.  **Run Network**: `agency_logic.py` checks for duplicates.
    4.  **Prep Critic**: Python script simulates a draft.
    5.  **Run Critic**: `agency_logic.py` evaluates quality (Mocked LLM).
    6.  **Safety Ticket**: Creates a `security_ticket` in `agency_memory.db`.

---

## 4. Key Configurations & Locations
*   **Global Variables**: `config/niches.yaml` (Defines Agent personas/values).
*   **Database Config**: `backend/prisma/schema.prisma` (App Schema).
*   **Styles**: `frontend/app/globals.css` (Theming Engine).

---

## 5. Recent Fixes & Current State
*   **Auth Bypass**: The Backend now allows workflow creation without login (Patched).
*   **Light Mode**: The entire UI (Modal, Canvas, Sidebar) adapts to System Theme.
*   **Python Logic**: `agency_logic.py` was refactored to clean up duplicate code and fix `uuid` imports.
*   **🧠 PHASE 2 COMPLETE**: Real LLM integration with hierarchical intelligence (Cheap + Smart models).
*   **Cost Tracking**: All LLM calls logged to `agency_memory.db` with tokens, cost, and duration.
*   **Safety Escalation**: Automatic ticket creation when critic flags risky content.

## 6. Immediate Next Steps (For Next Session)
1.  **✅ COMPLETED - LLM Integration**: `agency_logic.py` now uses LiteLLM with Gemini Flash (cheap) and Claude Sonnet (smart). See `PHASE2_COMPLETION_SUMMARY.md`.
2.  **Safety UI**: Build Frontend Page (`/admin/safety`) to view and Approve/Reject tickets from `agency_memory.db`.
3.  **Real Testing**: Add API keys to `python_engine/.env` and run `test_brain_transplant.py` for end-to-end validation.
4.  **Execution Loop**: Verify the full end-to-end execution of the Viral Factory in the UI runner with real LLM calls.

---
**This file summarizes the entire project context for the next agent instance.**
