```md
# Empyralist Handoff Packet

## 1. Goal
- Build **Empyralist** as a general-purpose AI agent platform with:
  - **web chat as the primary surface**
  - **real agent behavior in web chat**
  - **Telegram as a simpler channel surface**
  - **persistent automations/workflows**
  - **solution surfaces** like Hotel Vision
- Near-term business goal: migrate clients from **n8n** into Empyralist.
- Product direction: **OpenClaw-like native agent capability**, but with a much simpler, more premium UX.

## 2. Current Project State
- Monorepo root: `/Users/mansur/Multi_Agent_Orchestrator_Project`
- Frontend: Next.js app in `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend`
- Backend/runtime: FastAPI app in `/Users/mansur/Multi_Agent_Orchestrator_Project/server.py`
- Backend modules: `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules`
- Local worker/runtime: `/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_local_worker*.py`
- Desktop shell: `/Users/mansur/Multi_Agent_Orchestrator_Project/desktop`
- Brand is **Empyralis**; internal compatibility name **Orion** remains in code where needed.

## 3. What Has Already Been Done

### Product / UX
- Web chat no longer redirects users into `/setup`.
- Web chat onboarding was simplified; chat empty state is now the primary “start here” surface.
- Sidebar brand is non-clickable.
- Sidebar is back to **icons only** with this order:
  1. Dashboard
  2. Chat
  3. Automations
  4. Activity
  5. Files
  6. Connections
  7. Hotel Vision
  8. Settings
  9. Account

### Web chat behavior
- **Important:** web chat intent bridge was removed.
- Web chat should now always call the real runtime agent path.
- Remaining fix applied: web chat now clears outcome-pack metadata so it does not accidentally hit deterministic pack behavior.

### Telegram behavior
- Telegram keeps a shortcut/intention bridge in:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py`
- That is acceptable by product decision.

### Workflows / Canvas
- Workflow editor upgraded from linear chain to a **true graph canvas** in:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`
- Added manual edge creation.
- Added edge deletion by selection + Backspace and right-click.
- Added node search popup on empty-canvas click.
- Added new node types/components:
  - HTTP Request
  - If / Condition
  - Transform
  - Code
- New node files:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/nodes/StandardCanvasNode.tsx`
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/nodes/HttpRequestNode.tsx`
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/nodes/ConditionNode.tsx`
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/nodes/TransformNode.tsx`
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/nodes/CodeNode.tsx`

### Hotel Vision / MCP
- MCP support added in:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/mcp_server.py`
- Current MCP tools:
  - `list_spaces`
  - `get_space_status`
  - `get_recent_alerts`
  - `ask_space`
- Hotel Vision onboarding route exists:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/solutions/hotel-vision/onboarding/page.tsx`
- Backend onboarding endpoints live in:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/solutions/hotel-vision/solution.py`

### Runtime / agent tooling
- Current local execution tools are defined in:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_policy.py`
- Builder/local file APIs exist in:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_workspace_api.py`
- Local worker syntax blockers were previously fixed in:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_local_worker_execution.py`

## 4. Important Decisions Made and Why
- **Web chat = always real agent**
  - No keyword interception, no scripted setup state machine, no pre-written reply injection.
  - Reason: the main product surface must feel like a real assistant, not a hidden form engine.
- **Telegram may keep shortcuts**
  - Reason: Telegram is a lightweight delivery channel and can tolerate channel-specific shortcuts.
- **Single visible assistant**
  - Multi-agent orchestration can exist internally, but the user should feel they are talking to one operator.
- **Operator/admin surfaces remain secondary**
  - `/setup`, `/health`, `/executions`, advanced workflow controls stay in the product but should not dominate first-run UX.
- **Workflow canvas must become graph-native**
  - Reason: n8n migration and serious automation authoring are impossible with a forced linear chain.
- **Telegram-first for non-technical alert onboarding**
  - Reason: it is materially simpler than WhatsApp/Twilio.

## 5. Constraints, Preferences, and Rules
- Do **not** reintroduce web-chat intent interception.
- Do **not** force redirect users from chat into setup.
- Do **not** expose too much operator/runtime language on user-facing surfaces.
- Keep the shell layout unless there is an explicit reason to change it.
- Keep Hotel Vision as a solution surface, not the entire product identity.
- Prefer minimal, behavior-preserving changes.
- Do not revert unrelated changes; assume repo may be dirty.
- If debugging UI state, restarting the local stack may still be necessary.

## 6. Files, Folders, URLs, Tools, Commands

### Main code locations
- Frontend home/chat shell:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx`
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.api.ts`
- Sidebar:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/Sidebar.tsx`
- Global styles:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/globals.css`
- Workflow library:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/page.tsx`
- Workflow editor:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/[id]/WorkflowEditorInnerLite.tsx`
- Workflow API client:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/api.ts`
- Telegram connector/shortcut logic:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py`
- Connector catalog:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/server.py`
- MCP server:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/mcp_server.py`

### Relevant URLs
- Frontend dev: `http://127.0.0.1:3000`
- Runtime/API: `http://127.0.0.1:8001`
- Backend workflow API: `http://127.0.0.1:4000`
- Workflow library: `/workflows`
- Workflow editor: `/workflows/[id]`
- Hotel Vision: `/solutions/hotel-vision`
- Telegram onboarding: `/credentials?connector=telegram_bot&onboarding=1`

### Useful commands
- Frontend typecheck:
  - `cd /Users/mansur/Multi_Agent_Orchestrator_Project/frontend && ./node_modules/.bin/tsc --noEmit`
- Frontend lint:
  - `cd /Users/mansur/Multi_Agent_Orchestrator_Project/frontend && ./node_modules/.bin/eslint <files>`
- Python compile check:
  - `python3 -m py_compile <file>`
- Local stack scripts:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/start_empyralis_local_stack.sh`
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/stop_empyralis_local_stack.sh`

## 7. Open Problems / Blockers
- Need to confirm that **web chat** no longer surfaces deterministic pack/scripted behavior after the latest metadata-clearing fix.
- `run_autopilot` global command path still references `derivedSetupReady`; that may be acceptable for UI-triggered setup gating, but it is separate from normal chat sends.
- Workflow graph editor is now graph-capable, but semantics are still shallow:
  - no true branch outputs for `If`
  - no execution semantics for new node types yet
  - no expression/data-mapping layer yet
- n8n migration is still blocked on:
  - importer
  - richer tool surface
  - more integrations
- UX still has some operator/admin leakage in various surfaces.

## 8. Exact Next Steps
1. **Verify web chat behavior end-to-end**
   - Send normal chat prompts from `/workspace`
   - Confirm no pre-written camera/setup replies appear from the frontend path
   - If scripted replies still appear, trace backend runtime path next
2. **Polish graph canvas**
   - Add true `If` branch outputs (`true` / `false`)
   - Add richer inspector panels for new node types
   - Add edge labels or branch labels if needed
3. **Add generic HTTP/Webhook execution layer**
   - Highest leverage for n8n migration
4. **Design n8n importer MVP**
   - Start with linear/simple graphs
   - Output warnings for unsupported nodes
5. **Keep user mode clean**
   - Reduce technical language on primary surfaces
   - Keep advanced/operator surfaces secondary

## 9. Things to Avoid Repeating
- Do not re-add:
  - web chat keyword intent bridge
  - scripted web chat setup replies
  - forced setup redirects from chat
  - full-screen onboarding takeover at `/`
  - sidebar text labels under icons
- Do not assume the workflow canvas is visible from the library page itself; it opens only after selecting a workflow.
- Do not treat Telegram shortcut logic as proof that web chat is behaving the same way.

## 10. Working Style
- Be direct and compact.
- Prefer code truth over assumptions.
- Validate with `tsc`, `eslint`, and targeted compile checks after each focused change.
- Keep changes scoped; do not widen work without reason.
- If a user-facing behavior seems “impossible,” verify the actual send path and metadata first.
- Optimize for product clarity: one assistant, one next step, minimal exposed machinery.
```
