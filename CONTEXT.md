# Empyralist Context Handoff

## Product vision
- Empyralist should be an **AI operations platform for end-to-end business execution**.
- It should not feel like n8n, a developer automation toy, or a “summarize this” utility product.
- The target product shape is:
  - **one calm operator-facing platform**
  - **general business work execution**
  - **outcome-first UX**
  - **workflow/canvas as a secondary power surface**
- Best mental model:
  - users define an outcome
  - connect systems
  - deploy a reusable workflow/playbook
  - run work
  - monitor runs
  - inspect assets/evidence
  - approve when needed

## UX / product direction
- Product references repeatedly used in this thread:
  - OpenAI Platform
  - Apple-like calm minimalism
  - Linear / Notion style clarity
- The intended tone:
  - clean
  - spacious
  - soft
  - premium
  - non-developer-friendly
- Strong recurring decision:
  - **reduce technical noise**
  - **reduce harsh lines**
  - **reduce sharp boxes**
  - **make every button obvious**

## Core IA / navigation
- Current intended sidebar language:
  - `Home`
  - `Chat`
  - `Builder`
  - `Workflows`
  - `Runs`
  - `Integrations`
  - `Usage`
  - `Assets`
  - bottom: `Settings`, `Profile`
- Terminology standardization completed:
  - `Automations` → `Workflows`
  - `Activity` → `Runs`
  - `Connections` → `Integrations`
  - `Files` → `Assets`
- Internal route names may still use older ids in a few places for compatibility, but user-facing copy should follow the new nouns.

## Current routing / page model
- ` / ` = Chat surface, kept unchanged as primary conversational surface
- `/home` = clean Home page
- `/builder` = Builder landing page / hub
- `/builder/new` = new workflow canvas
- `/builder/[id]` = existing workflow editor
- `/workflows` = reusable workflow library
- `/executions` = Runs page
- `/credentials` = Integrations page
- `/artifacts` = Assets page
- `/usage` = Usage page

## Builder model
- Important product conclusion from this thread:
  - Builder should not immediately dump the user into the graph editor.
  - OpenAI-style structure is better:
    - Builder hub first
    - actual editor second
- Implemented direction:
  - `/builder` is a Builder hub
  - canvas is on `/builder/new` and `/builder/[id]`
- Builder/editor UX direction:
  - prompt-first
  - generated workflow second
  - manual editing third
- Builder canvas remains one of the stronger surfaces in the product.

## Shell / design system state
- The shell was heavily redesigned toward a calmer OpenAI-like platform feel.
- Current shell decisions:
  - unified topbar + sidebar visual system
  - soft neutral shell background
  - large rounded white content board on standard pages
  - softer borders and lower-contrast lines
  - softer navigation selection
  - collapse toggle placed **inside the left panel**
  - open-state toggle aligned to the **right side** of the panel
  - sidebar selection should read as **rounded-square**, not circular/pill-like
- Repeated user preference:
  - minimalistic
  - creamy / soft opacity vibe
  - less sharpness
  - stronger visual calm

## Major frontend changes already implemented

### Shell and layout
- `frontend/app/globals.css`
  - broad redesign of tokens and shell appearance
  - softer borders, unified shell background, calmer cards
  - reusable overview sections for page composition
  - shared classes added for home/runs/integrations/assets internals
- `frontend/components/Sidebar.tsx`
  - redesigned navigation
  - collapse behavior
  - in-panel toggle
- `frontend/components/orion/PlatformTopBar.tsx`
  - simplified top bar
  - removed earlier wrong top-shell clutter for Builder routes

### Home
- `frontend/app/home/page.tsx`
  - no longer just three flat equal cards
  - now has:
    - primary “start work” overview
    - side section for recent workflow continuation
    - recent workflows section with stronger hierarchy

### Runs
- `frontend/app/executions/page.tsx`
  - upgraded into a more serious operations page
  - top section now emphasizes current run pressure / execution state
  - metric strip is secondary to the main operational summary
  - filters and queue remain below

### Integrations
- `frontend/app/credentials/page.tsx`
  - reframed around business system access
  - overview added
  - directory and AI providers separated more clearly
  - partial refactor away from inline styling started

### Assets
- `frontend/app/artifacts/page.tsx`
  - reframed as evidence/output layer
  - overview added
  - deliverables/evidence/system focus improved
  - partial refactor away from inline styling started

## Remaining frontend work
- Biggest remaining UX/design debt is **inside large detail surfaces**, not the shell.
- Highest-value remaining visual work:
  1. normalize the connected-system detail pane in `frontend/app/credentials/page.tsx`
  2. normalize the add-connection modal in `frontend/app/credentials/page.tsx`
  3. continue extracting shared classes from large inline-styled surfaces
- The shell itself is close enough now. Do not spend more cycles on shell chrome unless a specific issue appears.

## Runtime / model architecture

### High-level decision
- Direct provider adapters remain the architecture.
- Chosen architecture:
  - existing provider/profile resolution remains top-level authority
  - model calls go through the internal runtime router with direct provider integrations
  - BYOK should come from the existing encrypted credential vault / provider profiles, not a new raw per-request secret flow

### Implemented backend pieces
- Added unified router:
  - `server_modules/model_router.py`
- Added backend Builder generation route:
  - `server_modules/routes_builder.py`
- Registered backend route in:
  - `server.py`
- Moved OpenAI / Anthropic / Gemini generation behind the unified router through provider/profile paths
- Vertex is handled through a compatibility fallback because current credential shape still needs a direct credential payload

### Builder generation move
- Direct frontend OpenAI Builder call was removed
- Builder generation now goes through backend
- Frontend proxy route:
  - `frontend/app/api/builder/generate/route.ts`
- Backend route returns parsed workflow JSON, not just a raw JSON string

### Alias catalog / model selection
- Added normalized model alias catalog endpoint:
  - backend alias discovery available through `/providers/model-aliases`
- Frontend now uses alias-friendly model surfaces
- `AiAccountsPanel.tsx` free-text model input was replaced with a grouped provider-aware alias selector

## BYOK / provider profile model
- The platform now leans on:
  - saved provider credentials
  - provider profiles
  - runtime profile ordering / fallback
- User-facing runtime profile management was added in:
  - `frontend/components/orion/connections/AiAccountsPanel.tsx`
- Implemented:
  - default runtime profile actions
  - visible fallback order
  - grouped runtime profile display
  - clearer provider/profile control surface

## Execution profile propagation
- Runtime profile selection was threaded across the app.

### Builder
- Builder can choose a runtime profile
- Builder saves runtime profile metadata into workflow metadata
- Builder generation and Evaluate use that profile

### Workflow editor / workflow execution
- Workflow editor persists runtime profile metadata
- Workflow launches now use the same explicit runtime profile execution contract as Builder

### Runs visibility
- Runs now expose and display:
  - active profile id
  - active profile label
  - active provider
  - active model
- Run context is seeded immediately at run creation so the UI doesn’t need to wait for later runtime logs

## Immediate run UX improvements
- Added runtime run seed handling:
  - `frontend/lib/runtimeRunSeed.ts`
- Builder, workflow editor, workflow studio, and chat now:
  - seed immediate run metadata
  - can show `Open live run`
  - keep run context visible before history refresh catches up

## Copy / terminology consistency
- Large copy cleanup has already been done across:
  - assistant surfaces
  - workbench surfaces
  - setup
  - control center
  - team
  - workflows
  - runs
  - integrations
  - assets
- The platform should continue using:
  - workflows
  - runs
  - integrations
  - assets
- Avoid reintroducing the old nouns in user-facing copy unless required for legacy commands or internal ids.

## Tests and validation status
- Repeatedly validated during this thread:
  - `cd /Users/mansur/Multi_Agent_Orchestrator_Project/frontend && ./node_modules/.bin/tsc --noEmit`
  - `cd /Users/mansur/Multi_Agent_Orchestrator_Project && source venv/bin/activate && python -m unittest discover -s server_modules/tests -p 'test_*.py'`
- Backend test count recently observed:
  - 14 tests passing
- Known warnings:
  - FastAPI `on_event` deprecation warnings
  - Python `asyncio.iscoroutinefunction` deprecation warning through FastAPI internals
- These warnings are not current blockers.

## Important product conclusions from this thread
- The platform should be built as:
  - an **AI execution platform**
  - not a narrow automation product
  - not a developer workflow tool
- Best wedge recommendation discussed:
  - operations teams first
  - especially revenue ops / customer ops / executive ops
- Product objects that matter most:
  - outcomes
  - workflows/playbooks
  - runs
  - agents
  - integrations
  - approvals
  - assets/evidence
- Trust is built through:
  - explicit runtime profile visibility
  - visible run state
  - visible execution context
  - visible outputs/evidence

## What should not be undone
- Do not revert the Builder split into hub + editor.
- Do not reintroduce harsh, admin-like shell styling.
- Do not move back toward developer-heavy wording.
- Do not replace runtime profile selection with implicit hidden defaults only.
- Do not make Builder the only first-class surface; Chat, Home, Runs, Integrations, and Assets all matter.

## Current highest-value next steps
1. **Finish refactoring `frontend/app/credentials/page.tsx`**
   - connected-system detail pane
   - add-connection modal
   - reduce inline styling further
2. **Finish refactoring `frontend/app/artifacts/page.tsx`**
   - continue extracting repeated card/action layout into shared classes
3. **Then do a final micro-polish pass**
   - spacing
   - density
   - radius consistency
   - copy consistency on remaining corners

## Current project posture
- The platform is in a much better place than at the start of this thread.
- The remaining problems are now mostly:
  - detail-level frontend consistency
  - density / local panel polish
  - not fundamental product direction

## Useful files to know

### Frontend
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/globals.css`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/Sidebar.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformTopBar.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/executions/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/artifacts/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/builder/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/builder/BuilderCanvasPage.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/connections/AiAccountsPanel.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/api.ts`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/runStartCopy.ts`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/runtimeRunSeed.ts`

### Backend
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/model_router.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_builder.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/provider_profiles.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_output.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_model_router.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_routes_builder.py`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_credential_resolution.py`

## Short directive for the next chat
- Continue from the current design/product direction.
- Do **not** reopen the platform vision debate unless a major contradiction appears.
- Focus next on:
  - finishing `Integrations` detail panes and modal cleanup
  - then final polish on `Assets`
  - then micro-polish across standard pages
