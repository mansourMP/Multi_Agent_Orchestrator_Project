# RAW UI Inventory Audit

Date: 2026-04-09  
Repository: `/Users/mansur/Multi_Agent_Orchestrator_Project`  
Scope: Frontend-only inventory across `frontend/app` and visible `frontend/components` surfaces.  
Method: Code-derived census of routes, visible controls, drawers, modals, copy density, and repeated brand language.  
Constraint: This is a raw inventory only. No redesign proposals, no comparisons, no fixes.

## 0. Audit Rules

- This file documents what currently exists in the codebase.
- “Visible page” means a user-facing route in `frontend/app`.
- “Button census” includes page-level actions plus major shared-shell controls.
- Dynamic/generated row actions are documented as repeated control patterns.
- Necessity ratings use this scale:
  - `Critical`: user must have this to complete core product work
  - `Useful`: supports real work but not primary path
  - `Borderline`: plausible support action but not central
  - `Cruft Risk`: likely prototype/admin-era residue or overly exposed plumbing
- Density score uses a `1-10` scale:
  - `1-3`: sparse
  - `4-6`: moderate
  - `7-8`: dense
  - `9-10`: extremely dense / many controls / heavy copy

---

## 1. Global Route and Page Count

### 1.1 Visible route count

Current visible route/page count identified in `frontend/app`: **32**

This count includes redirect-only or alias surfaces when they are still user-addressable routes:

1. `/`
2. `/account`
3. `/agents`
4. `/agents/[id]/configure`
5. `/approvals`
6. `/artifacts`
7. `/builder`
8. `/connect-ai`
9. `/connectors`
10. `/control-center`
11. `/credentials`
12. `/demo`
13. `/executions`
14. `/health`
15. `/home`
16. `/library`
17. `/machines`
18. `/onboarding`
19. `/quickstart`
20. `/runs/[id]`
21. `/runs/[id]/inspect`
22. `/schedules`
23. `/settings`
24. `/setup`
25. `/sign-in`
26. `/sign-in/complete`
27. `/skills`
28. `/solutions`
29. `/store`
30. `/team`
31. `/usage`
32. `/workflows`

### 1.2 Route inventory with density scores

| Route | Source file | Density | Raw note |
|---|---|---:|---|
| `/` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx` | 10 | Primary Sage surface; very large chat orchestration page |
| `/account` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/account/page.tsx` | 6 | Account summary plus sign-in method management |
| `/agents` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx` | 5 | Installed agents dashboard |
| `/agents/[id]/configure` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/page.tsx` | 5 | Switchboard/configurator |
| `/approvals` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/approvals/page.tsx` | 8 | Dense queue/audit review page |
| `/artifacts` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/artifacts/page.tsx` | 7 | Browser/filter/preview-oriented page |
| `/builder` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/builder/page.tsx` | 1 | Redirect-only route |
| `/connect-ai` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/connect-ai/page.tsx` | 5 | Wrapper around AI accounts panel |
| `/connectors` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/connectors/page.tsx` | 1 | Alias export of credentials |
| `/control-center` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/control-center/page.tsx` | 1 | Redirect-only route |
| `/credentials` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx` | 10 | Extremely dense connector management surface |
| `/demo` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/demo/page.tsx` | 6 | Demo launcher with status states |
| `/executions` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/executions/page.tsx` | 9 | Run list + filters + interventions |
| `/health` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/health/page.tsx` | 10 | Heavy diagnostics and ops controls |
| `/home` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx` | 6 | Marketing/overview/dashboard hybrid |
| `/library` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/library/page.tsx` | 8 | Skill registry/install/manage surface |
| `/machines` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/machines/page.tsx` | 9 | Fleet management with destructive controls |
| `/onboarding` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/onboarding/page.tsx` | 4 | Guided setup surface |
| `/quickstart` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/quickstart/page.tsx` | 3 | Short-launch page |
| `/runs/[id]` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/page.tsx` | 9 | Run detail wrapper, dense |
| `/runs/[id]/inspect` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/inspect/page.tsx` | 10 | Highest-density cockpit page |
| `/schedules` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/schedules/page.tsx` | 6 | Schedule list/create surface |
| `/settings` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/settings/page.tsx` | 7 | Mixed operational and account settings |
| `/setup` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/setup/page.tsx` | 3 | Thin wrapper around setup wizard |
| `/sign-in` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/sign-in/page.tsx` | 7 | Few controls but high explanatory copy density |
| `/sign-in/complete` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/sign-in/complete/page.tsx` | 3 | Completion/interstitial page |
| `/skills` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/skills/page.tsx` | 6 | Skills overview/manage surface |
| `/solutions` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/solutions/page.tsx` | 4 | Packaged solutions list |
| `/store` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx` | 5 | Store/catalog surface |
| `/team` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/team/page.tsx` | 3 | Simple team page |
| `/usage` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/usage/page.tsx` | 7 | Analytics reporting surface |
| `/workflows` | `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/page.tsx` | 7 | Still-visible workflow library |

### 1.3 Redirect and alias routes

These are user-addressable but do not own unique visible UI:

- `/builder`
  - file: `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/builder/page.tsx`
  - behavior: redirect to `/agents`
- `/control-center`
  - file: `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/control-center/page.tsx`
  - behavior: redirect to `/workflows`
- `/connectors`
  - file: `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/connectors/page.tsx`
  - behavior: alias export of `/credentials`

---

## 2. Global Shell and Shared Surface Census

## 2.1 App sidebar

Source: `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx`

### Static visible brand/copy

- `Empyralis`
- `Operating system for agent work`
- utility callout copy:
  - `Navigation stays dense and task-first.`
  - badge: `Core`

### Navigation controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Home` | Sidebar nav item | Left sidebar | Useful |
| `Chat` | Sidebar nav item | Left sidebar | Critical |
| `Agents` | Sidebar nav item | Left sidebar | Critical |
| `Library` | Sidebar nav item | Left sidebar | Borderline |
| `Integrations` | Sidebar nav item | Left sidebar | Critical |
| `Usage` | Sidebar nav item | Left sidebar | Useful |
| `Account` | Sidebar nav item | Left sidebar footer | Useful |
| `Settings` | Sidebar nav item | Left sidebar footer | Useful |

### Shell chrome controls

| Text / aria-label | Style | Location | Necessity |
|---|---|---|---|
| `Expand sidebar` | Icon-only button | Sidebar chrome | Useful |
| `Collapse sidebar` | Icon-only button | Sidebar chrome | Useful |

## 2.2 Platform top bar

Source: `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformTopBar.tsx`

### Current role

The top bar owns platform-level navigation/status, route heading display, notifications, and cross-platform notices.

### Controls

| Text / aria-label | Style | Location | Necessity |
|---|---|---|---|
| `Notifications` | Icon-only bell button | Top bar right | Useful |
| `Mark all read` | Ghost/text action | Notifications popover | Useful |
| `Open feed` | Link-style action | Notifications popover | Useful |
| `Mark read` | Inline action per notification | Notifications popover | Useful |

### Dynamic notice actions

The top bar can also render dynamic CTA buttons/links tied to notices. These are content-driven and not hardcoded to a single label.

## 2.3 Global command palette

Sources:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/CommandPalette.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/commandRegistry.ts`

### Persistent visible copy

- placeholder: `Search navigation and workspace actions...`

### Known command patterns visible to users

- `New chat`
- navigation entries generated from registered sections
- route/open commands for Sage, Agents, Integrations, Usage, Workflows/Blueprints, etc.

Necessity note:
- command palette itself is `Useful`
- several legacy command labels still reference workflow-era surfaces

## 2.4 Mobile sidebar sheet

Source: `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/sidebar.tsx`

Visible strings:
- `Sidebar`
- `Displays the mobile sidebar.`

Necessity:
- `Useful`

## 2.5 Toast notifications

Source: `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/Toast.tsx`

Visible control:
- `Dismiss notification`

Necessity:
- `Useful`

---

## 3. Route-by-Route Raw Inventory

## 3.1 `/` — Sage master chat

Primary files:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ApprovalRequestCard.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/InterventionCards.tsx`

Density: `10`

### Major static labels present

- `Sage`
- `Primary relationship`
- `Co-Pilot Mode`
- `Agent Mode`
- `Reasoning · {label}`
- `{trust label}`
- `What this reply uses`
- `Installed agents`
- `Context`

### Main header and chat-local controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `History` or history drawer opener | Secondary/local action | Chat header | Useful |
| `New chat` | Secondary/local action | Chat header or history drawer | Useful |
| `Context` | Secondary/local action | Chat header | Useful |
| `Installed agents` | Secondary/local action | Chat header | Useful |

### History drawer controls

| Text / aria-label | Style | Location | Necessity |
|---|---|---|---|
| `Close chat history` | Icon/backdrop close | Chat history drawer | Useful |
| `Chats` | Drawer title | Chat history drawer | N/A |
| `Recent` | Drawer label | Chat history drawer | N/A |
| `New chat` | Secondary button | Chat history drawer | Useful |
| per-session title button | List row button | Chat history drawer | Useful |

### Composer controls

| Text / aria-label | Style | Location | Necessity |
|---|---|---|---|
| `Co-Pilot Mode` | Segmented toggle | Chat composer top rail | Critical |
| `Agent Mode` | Segmented toggle | Chat composer top rail | Critical |
| `Add context` | Icon button | Composer left controls | Useful |
| `Open artifacts` | Dropdown menu item | Composer attach menu | Useful |
| `Open runs` | Dropdown menu item | Composer attach menu | Useful |
| `Open context` | Dropdown menu item | Composer attach menu | Useful |
| `Start voice input` | Icon button | Composer left controls | Useful |
| `Stop voice input` | Icon button | Composer left controls | Useful |
| `Choose model` | Pill/dropdown trigger | Composer right controls | Critical |
| dynamic model options | Dropdown list items | Model menu | Critical |
| `Send` | Primary icon button | Composer right controls | Critical |

### Message-level controls

| Text / aria-label | Style | Location | Necessity |
|---|---|---|---|
| copy action | Icon-only | Message toolbar | Useful |
| speak action | Icon-only | Message toolbar | Useful |
| open artifacts action | Icon-only | Message toolbar | Useful |

### Artifact side panel

| Text / aria-label | Style | Location | Necessity |
|---|---|---|---|
| `Resize artifact panel` | Drag handle / icon control | Artifact panel edge | Useful |
| `Code` | Tab toggle | Artifact panel header | Useful |
| `Preview` | Tab toggle | Artifact panel header | Useful |
| `Close artifact panel` | Icon-only | Artifact panel header | Useful |
| dynamic artifact title buttons | Tab buttons | Artifact panel top rail | Useful |

### Identity drawer

| Text / aria-label | Style | Location | Necessity |
|---|---|---|---|
| `Close setup details` | Backdrop close | Context drawer | Useful |
| `What this reply uses` | Drawer title | Context drawer | N/A |
| `Close context` | Icon-only | Context drawer | Useful |
| dynamic identity actions such as `Open Confirmations`, `Connect AI account`, `Verify AI account`, `Open Runs`, `Open Installed Agents` | Secondary CTA buttons | Context drawer | Useful |

### Structured intervention controls

From `ApprovalRequestCard.tsx` and intervention cards:

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Approve execution` | Primary | Inline approval card in transcript | Critical |
| `Deny for now` | Secondary | Inline approval card in transcript | Critical |
| `Approving...` | Disabled loading state | Inline approval card | N/A |
| `Approved` | Resolved state chip | Inline approval card | N/A |
| `Denying...` | Disabled loading state | Inline approval card | N/A |
| `Denied` | Resolved state chip | Inline approval card | N/A |
| dynamic intervention action labels | Secondary/ghost actions | Inline intervention cards | Useful |

### Raw density observations

- Highest interaction density in the product.
- Multiple nested rails: chat header, transcript, composer control rail, attachment menu, model menu, identity drawer, history drawer, artifact drawer.
- This is the strongest “single command center” surface and also the most structurally layered.

## 3.2 `/store` — Agent Store

Primary files:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/store/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentStoreCard.tsx`

Density: `5`

### Page controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `View installed agents` | Secondary button/link | Page hero/actions | Useful |
| `Install` | Primary button/link | Each agent card | Critical |

### Observed content style

- clean catalog surface
- limited control count
- cards for available first-party agents

## 3.3 `/agents` — Installed Agents

Primary files:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/InstalledAgentCard.tsx`

Density: `5`

### Page-level controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Browse store` | Primary link button | Page hero | Critical |
| `Install another` | Secondary link button | Page hero | Useful |
| `Open store` | Primary link button | Empty state | Useful |

### Per installed-agent card controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Run` | Primary | Agent card footer | Critical |
| `Starting...` | Disabled loading state | Agent card footer | N/A |
| `Configure` | Secondary | Agent card footer | Critical |
| `Chat` | Ghost | Agent card footer | Useful |

## 3.4 `/agents/[id]/configure` — Switchboard / Configurator

Primary files:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/agents/[id]/configure/ConfigureAgentPageClient.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/agents/AgentSwitchboardForm.tsx`

Density: `5`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Back to agents` | Ghost/back link | Page header | Useful |
| `Install label` | Text input | Main form | Critical |
| `Execution placement` | Select dropdown | Main form | Critical |
| capability toggles from manifest | Checkbox/switch list | Main form | Critical |
| `Require Approval` | Segmented toggle | Trust mode row | Critical |
| `Autonomous Execution` | Segmented toggle | Trust mode row | Critical |
| `Granted folders` | Textarea | Main form | Critical |
| `Cancel` | Ghost/secondary | Form footer | Useful |
| `Save install` | Primary | Form footer when editing | Critical |
| `Install agent` | Primary | Form footer when first install | Critical |

## 3.5 `/approvals` — Approval queue and audit

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/approvals/page.tsx`

Density: `8`

### Visible copy clusters

- `Review the next blocked step before Platform continues.`
- `Confirmations refresh failed`
- `Filter confirmations`
- `Needs review now`
- `More confirmations waiting`
- `Recent decisions`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Refresh` | Primary or secondary action | Page header | Useful |
| agent filter select | Select | Filter bar | Useful |
| channel filter select | Select | Filter bar | Useful |
| `Confirm once` | Primary | Pending approval cards | Critical |
| `Decline` | Secondary/destructive-leaning | Pending approval cards | Critical |
| `Review full context` | Secondary link/button | Pending approval cards | Useful |
| `Review run` | Secondary link/button | History cards | Useful |

### Necessity note

- Approval actions are core.
- Metrics and audit cards are useful but not all equally necessary at first glance.

## 3.6 `/artifacts` — Assets / outputs

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/artifacts/page.tsx`

Density: `7`

### Visible copy

- `Browse assets`
- `Loading assets`
- `Assets are unavailable`
- `No assets yet`
- helper copy about preview/code/provenance in right pane

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Refresh` | Secondary | Hero/filter area | Useful |
| link to `/executions` | Secondary link | Hero/actions | Useful |
| `Deliverables` | Tab/filter button | Main filter row | Useful |
| `Evidence` | Tab/filter button | Main filter row | Useful |
| `System` | Tab/filter button | Main filter row | Useful |
| several `<select>` filters | Selects | Filter row | Useful |
| `Clear filters` | Ghost | Filter row | Useful |
| `Clear filters` | Ghost | Empty states | Useful |

## 3.7 `/connect-ai` — AI account linking wrapper

Primary files:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/connect-ai/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/connections/AiAccountsPanel.tsx`

Density: `5`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Back to setup` or `Back to chat` | Ghost/back link | Page header | Useful |
| `Refresh` | Ghost | AI accounts panel header | Useful |
| `Add account` | Primary | AI accounts panel header | Critical |
| `Continue setup` | Primary | Success state | Useful |
| `Start chatting` | Primary | Success state | Useful |
| `Test Connection` | Secondary | Provider card | Useful |
| `Testing...` | Disabled state | Provider card | N/A |
| `Remove` | Secondary/destructive leaning | Provider card | Useful |
| `Removing...` | Disabled state | Provider card | N/A |
| provider-specific configure button | Primary | Provider card | Critical |
| `Cancel` | Secondary | Add account modal footer | Useful |
| selected primary connect button | Primary | Add account modal footer | Critical |

### Modal internals

- close control: `Close add account dialog`
- provider buttons by provider name
- connection method choices

## 3.8 `/credentials` and `/connectors` — Integrations / connectors

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx`

Density: `10`

### High-level characterization

- One of the most crowded surfaces in the product.
- Contains hero actions, connector catalog, provider-specific creation flows, auth-mode toggles, tests, deletes, quick links, and a large modal.

### Prominent page-level controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| back link from `returnTo` | Ghost/back link | Page header | Useful |
| `Add connection` | Primary | Page header | Critical |
| `Refresh` | Ghost | Page header / catalog filter area | Useful |
| `Google Workspace` | Quick-link button | Quick-create row | Useful |
| `Microsoft 365` | Quick-link button | Quick-create row | Useful |
| `Telegram` | Quick-link button | Quick-create row | Useful |

### Repeated connector-row controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Test` | Secondary | Connector row | Useful |
| detail/open action | Icon or secondary | Connector row | Useful |
| `Remove` | Secondary/destructive leaning | Connector row | Useful |
| create/connect action | Primary | Connector row | Critical |

### Catalog and tool actions explicitly visible in copy

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Create Google Doc` | Secondary button/action | Catalog/detail panels | Useful |
| `Create Google Sheet` | Secondary button/action | Catalog/detail panels | Useful |
| `Run Spreadsheet Ops` | Secondary button/action | Catalog/detail panels | Useful |

### Modal controls

| Text / label | Style | Location | Necessity |
|---|---|---|---|
| `Close connector dialog` | Icon-only close | Connector modal | Useful |
| provider auth mode toggles such as `PAT`, `App`, `OAuth`, `API key`, `local auth`, `access token` | Segmented toggles | Connector modal | Critical |
| `Cancel` | Secondary | Connector modal footer | Useful |
| primary connect/create action | Primary | Connector modal footer | Critical |

### Density note

- This page mixes connector registry, connector ownership, testing, installation, and auth-method education in one surface.

## 3.9 `/executions` — Run history / overview

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/executions/page.tsx`

Density: `9`

### Visible copy

- `Review outcomes, inspect routing decisions, and find the tasks that need intervention.`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Refresh` | Secondary | Hero/filter row | Useful |
| link to `/setup` | Link button | Hero/action area | Useful |
| link to `/approvals` | Link button | Hero/action area | Useful |
| link to `/workflows` | Link button | Hero/action area | Borderline |
| three filter selects | Selects | Filter bar | Useful |
| `Clear filters` | Secondary/ghost | Filter bar | Useful |
| reload button | Secondary | Empty/error states | Useful |
| link `/` | Primary | Empty state | Useful |
| row button/link to inspect individual run | Secondary/link | Table/list rows | Critical |

## 3.10 `/health` — Diagnostics

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/health/page.tsx`

Density: `10`

### Visible copy themes

- diagnostics
- runtime checks
- readiness
- stack recovery
- local runtime service troubleshooting

### Top-level controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| link `/control-center` | Ghost link | Hero/actions | Cruft Risk |
| `checkAll` | Ghost button | Hero/actions | Useful |
| `start_services` | Ghost/secondary | Hero/actions | Useful |
| `readiness` | Ghost/secondary | Hero/actions | Useful |
| link `/machines` | Secondary link | Hero/actions | Useful |
| `showPassChecks` | Toggle/button | Filters/secondary rail | Useful |
| link `/setup` | Ghost link | Mid-page action area | Useful |
| `restart_services` | Secondary action | Ops actions | Useful |
| `release_status` | Secondary action | Ops actions | Borderline |
| `ops_daemon_status` | Secondary action | Ops actions | Borderline |
| `ops_daemon_restart` | Secondary action | Ops actions | Borderline |

### Density note

- This is a highly operational/admin surface with multiple stacked action rows, historical diagnostics, and troubleshooting text.

## 3.11 `/home` — Overview / home

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx`

Density: `6`

### Visible copy

- `Your AI operations center. Say what you want done — Empyralis handles the rest.`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Start something` | Primary link | Hero | Useful |
| `See what happened` | Secondary link | Hero | Useful |
| `Saved workflows` | Secondary link | Hero | Cruft Risk |
| featured workflow links | Link cards | Main stage | Borderline |
| mini workflow links | Inline links | Main stage | Borderline |
| control links to `/workflows` | Inline links | Various modules | Cruft Risk |

## 3.12 `/library` — Skills library

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/library/page.tsx`

Density: `8`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Refresh` | Ghost | Page header | Useful |
| notice dismiss button | Ghost/icon/text | Notice strip | Borderline |
| installed skill detail action | Secondary | Installed skill row | Useful |
| enable/disable action | Secondary toggle button | Installed skill row | Useful |
| `Publish` | Secondary | Installed skill row | Borderline |
| `Uninstall` | Secondary/destructive leaning | Installed skill row | Useful |
| registry skill detail action | Secondary | Registry row | Useful |
| `Install` | Primary | Registry row | Useful |
| detail close button | Ghost | Detail panel | Useful |

## 3.13 `/machines` — Machine fleet

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/machines/page.tsx`

Density: `9`

### Top-level controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Health` | Ghost or primary link depending on state | Header/empty states | Useful |
| refresh/reload | Ghost | Header/empty states | Useful |
| `Enroll` | Primary | Header/empty states | Useful |
| `Setup` | Secondary/primary link depending on state | Empty states | Useful |

### Per-machine row controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Resume` | Secondary | Machine card/row | Useful |
| `Suspend` | Secondary | Machine card/row | Useful |
| `Kill Machine` | Destructive trigger | Machine card/row | Critical |
| revoke action | Secondary/destructive leaning | Machine card/row | Useful |
| links to current run ids | Inline links | Machine row | Useful |

### Destructive modal

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Kill Machine` | Modal title | PageDialog | N/A |
| `Cancel` | Secondary | Modal footer | Critical |
| destructive confirm button | Destructive | Modal footer | Critical |

## 3.14 `/onboarding`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/onboarding/page.tsx`

Density: `4`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Connect and continue` | Primary | Main stage | Critical |

## 3.15 `/quickstart`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/quickstart/page.tsx`

Density: `3`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Open demo` | Primary link | Main actions | Useful |
| `Open workspace` | Ghost link | Main actions | Useful |
| `Open artifacts` | Ghost link | Main actions | Useful |

## 3.16 `/runs/[id]`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/page.tsx`

Density: `9`

### Note

- Dense route wrapper around run detail state.
- Shares run-detail behavior with inspect-oriented surfaces and nested panels.

### Visible interaction pattern

- multiple action buttons/links are present, but the deeper actionable cockpit is concentrated in `/runs/[id]/inspect`

## 3.17 `/runs/[id]/inspect` — Live cockpit

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/inspect/page.tsx`

Density: `10`

### Primary surface role

- live event feed
- machine/runtime targeting
- approval status
- child-agent lineage
- destructive hard-kill

### Major controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| reload button | Ghost | Header | Useful |
| link to `/executions` | Ghost/back link | Header | Useful |
| `Take over run` | Secondary | Header or intervention rail | Useful |
| `Resume run` | Primary/secondary | Header or intervention rail | Critical |
| `Hard Kill Run` | Destructive trigger | Header/cockpit rail | Critical |
| link `/approvals` | Ghost link | Cockpit action row | Useful |
| timeline section jump | Ghost button | Cockpit action row | Useful |
| dynamic section jump buttons | Ghost buttons | Cockpit action rows | Useful |
| per-approval `Proceed` | Primary | Approval modules | Critical |
| per-approval `Hold` | Secondary | Approval modules | Critical |
| delegation retry actions | Secondary | Delegation modules | Useful |
| artifact open/reveal buttons | Secondary | Artifact modules | Useful |

### Live event feed controls

Source: `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/runs/RunLiveEventFeed.tsx`

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Timeline` | Toggle tab | Event feed header | Useful |
| `Logs` | Toggle tab | Event feed header | Useful |

### Destructive modal

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Hard Kill Run` | Modal title | PageDialog | N/A |
| `Cancel` | Secondary | Modal footer | Critical |
| destructive hard-kill confirm button | Destructive | Modal footer | Critical |

## 3.18 `/schedules`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/schedules/page.tsx`

Density: `6`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| refresh button | Ghost | Header/empty states | Useful |
| `Create` action via `handleCreate()` | Primary | Header/main area | Critical |
| repeated refresh button in states | Ghost | Empty or error states | Useful |

## 3.19 `/settings`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/settings/page.tsx`

Density: `7`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| link `/account` | Secondary | Main stage | Useful |
| link `/machines` | Secondary | Main stage | Useful |
| `Connect or manage providers` | Inline link to `/credentials` | Main copy block | Useful |
| connector reload button | Primary | Connectivity/settings block | Useful |
| sign-out button | Destructive | Danger zone | Critical |

## 3.20 `/setup`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/setup/page.tsx`

Density: `3`

### Note

- Thin route wrapper around setup wizard surfaces.
- Most real controls live in shared setup components.

## 3.21 `/sign-in`

Primary files:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/sign-in/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx`

Density: `7`

### Dominant visible copy clusters

- `Sign in`
- `Empyralis account access`
- `Create the account boundary first. Provider access attaches later.`
- `Sign in through an account boundary that stays stable even when providers change.`
- `Your Empyralis account owns workspaces, artifacts, runs, notifications, and recovery.`
- `Identity first, providers second`
- `After sign-in`
- `Recovery-safe account boundary`
- repeated references to providers being attached later

### Header badges

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Desktop handoff` or `Browser session` | Badge | Top of page | Borderline |
| `Recovery-safe identity` | Badge | Top of page | Borderline |
| `Providers attach later` | Badge | Top of page | Borderline |

### Mode controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Sign in` | Segmented mode button | Right-hand access panel | Critical |
| `Create account` | Segmented mode button | Right-hand access panel | Critical |

### Provider buttons

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Google account access` | Large secondary provider button | Access panel | Useful |
| `Apple account access` | Large secondary provider button | Access panel | Useful |
| `Waiting for Google` | Disabled provider state | Access panel | N/A |
| `Waiting for Apple` | Disabled provider state | Access panel | N/A |
| `Open browser` | Embedded action label | Inside provider buttons | Useful |
| `Waiting` | Embedded status label | Inside provider buttons | N/A |

### Credential form controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Full name` | Text input label | Main form | Critical for signup |
| `Email` | Text input label | Main form | Critical |
| `Password` | Password input label | Main form | Critical |
| `Create Empyralis account` | Primary | Form footer | Critical |
| `Continue` | Primary | Form footer | Critical |
| `Creating account…` | Disabled loading state | Form footer | N/A |
| `Signing in…` | Disabled loading state | Form footer | N/A |
| `Back` | Ghost/back link | Footer row | Useful |

### Raw density note

- The control count is not huge.
- The copy count is high relative to the number of actions.
- This page repeats the product’s account-boundary explanation in several parallel panels.

## 3.22 `/sign-in/complete`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/sign-in/complete/page.tsx`

Density: `3`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Continue to connect AI` | Primary link | Main actions | Useful |
| `Continue to setup` | Ghost link | Main actions | Useful |

## 3.23 `/skills`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/skills/page.tsx`

Density: `6`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Refresh` | Ghost | Header | Useful |
| repeated row actions on skills | Secondary buttons | Main stage | Useful |

Note:
- This page behaves like a lighter cousin of `/library`.

## 3.24 `/solutions`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/solutions/page.tsx`

Density: `4`

### Visible copy

- `Optional packaged capability layers built on top of workflows, skills, and connectors.`
- `Use core workflows, skills, and connectors first.`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| packaged solution card links | Card link | Main stage | Borderline |

## 3.25 `/team`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/team/page.tsx`

Density: `3`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Settings` | Ghost link | Main stage | Useful |

## 3.26 `/usage`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/usage/page.tsx`

Density: `7`

### Visible copy

- `Track model consumption, token volume, and estimated cost by run.`
- `This surface rolls up token and cost telemetry from completed runs...`
- `Period`
- `Daily token usage`
- `Provider breakdown`
- `Top runs by token count`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Refresh` | Secondary | Filter bar | Useful |
| `Today` | Toggle button | Period selector | Useful |
| `This Week` | Toggle button | Period selector | Useful |
| `This Month` | Toggle button | Period selector | Useful |
| `All Time` | Toggle button | Period selector | Useful |
| `Retry` | Primary | Error state | Useful |

### Density note

- Compact number of controls, but a full analytics page with charts and tables.

## 3.27 `/workflows`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/page.tsx`

Density: `7`

### Visible copy themes

- `Use workflows for stable processes...`
- `Library snapshot`
- `Saved workflows`
- `Find a workflow`
- `Search workflows…`
- `No reusable workflows yet`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| row action to run workflow | Primary | Workflow row | Borderline |
| row action to duplicate workflow | Secondary/icon | Workflow row | Borderline |
| row action to delete workflow | Destructive/icon | Workflow row | Borderline |
| search field | Input | Main stage | Useful |
| workflow row link | Link | Main stage | Useful |

### Destructive modal

| Text | Style | Location | Necessity |
|---|---|---|---|
| delete workflow dialog title | Modal title | PageDialog | N/A |
| `Cancel` | Secondary | Modal footer | Critical |
| destructive delete confirm | Destructive | Modal footer | Critical |

### Note

- Still a visible workflow-era surface despite the product pivot.

## 3.28 `/account`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/account/page.tsx`

Density: `6`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Settings` | Ghost/secondary link | Header/actions | Useful |
| `Credentials` | Ghost link | Header/actions | Useful |
| primary save button bound to `persist` | Primary | Main stage | Useful |

### Shared account-access component

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/AccountAccessPanel.tsx`

Controls:

| Text | Style | Location | Necessity |
|---|---|---|---|
| `Disconnect` | Secondary/destructive leaning | Sign-in method row | Useful |
| `Updating...` | Disabled state | Sign-in method row | N/A |
| `Add password backup` | Primary | Backup credential form | Useful |
| `Saving backup...` | Disabled state | Backup credential form | N/A |

## 3.29 `/demo`

Primary file:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/demo/page.tsx`

Density: `6`

### Controls

| Text | Style | Location | Necessity |
|---|---|---|---|
| refresh action | Primary | Header | Useful |
| link `/setup` | Primary | Header / preflight state | Useful |
| start demo action | Primary | Main stage | Useful |
| polling action | Ghost | Main stage | Useful |

## 3.30 `/settings` and `/account` brand-boundary overlap

Raw note:

- These surfaces both explain the account/provider boundary.
- They overlap with `/sign-in` and `/connect-ai` in subject matter.

## 3.31 `/builder`, `/control-center`, `/connectors`

Raw note:

- These remain visible routes in the tree, even where they redirect or alias.
- They still matter for navigation inventory because users can navigate to them.

## 3.32 `/setup` shared wizard surfaces

Major underlying components:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/SetupWizard.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/setup/DesktopSetupWizard.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/setup/LegacySetupWizard.tsx`

Raw note:

- These components contain many button clusters and instructional panels.
- They contribute to setup complexity even if the route wrapper itself is minimal.

---

## 4. Panels, Drawers, Modals, Sheets, and Popups

## 4.1 Sidebar collapse/expand behavior

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/useSidebarCollapsed.ts`

Trigger:
- collapse/expand icon button

Content inside:
- full nav stack
- brand block
- utility copy block

## 4.2 Mobile sidebar sheet

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/sidebar.tsx`

Trigger:
- mobile nav invocation

Visible text:
- `Sidebar`
- `Displays the mobile sidebar.`

## 4.3 Notifications popover

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformTopBar.tsx`

Trigger:
- `Notifications` bell button

Visible content:
- notification list
- `Mark all read`
- `Open feed`
- per-item `Mark read`

## 4.4 Global command palette overlay

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/CommandPalette.tsx`

Trigger:
- command palette hotkey/global action

Visible content:
- search field
- grouped command items
- `New chat`
- navigation/open commands

## 4.5 Chat history drawer

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx`

Trigger:
- chat-local history action

Visible text:
- `Chats`
- `Recent`
- `New chat`

## 4.6 Chat identity/context drawer

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx`

Trigger:
- `Context` action

Visible text:
- `What this reply uses`
- dynamic status/action content

## 4.7 Artifact side panel in chat

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx`

Trigger:
- message toolbar artifact action or artifact-opening interactions

Visible text:
- `Code`
- `Preview`
- artifact titles

## 4.8 Inline approval card

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ApprovalRequestCard.tsx`

Trigger:
- backend returns structured approval intervention

Visible text:
- `Explicit approval required`
- `One-time approval`
- `Reusable approval`
- `Approve execution`
- `Deny for now`
- resolved states `Approved`, `Held`

## 4.9 Inline intervention cards

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/InterventionCards.tsx`

Trigger:
- backend returns structured interventions

Visible content:
- dynamic intervention title/body/action buttons

## 4.10 AI add-account dialog

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/connections/AiAccountsPanel.tsx`

Trigger:
- `Add account`

Visible content:
- provider picker
- connection method options
- `Cancel`
- primary connect action
- close button `Close add account dialog`

## 4.11 Connector modal

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/credentials/page.tsx`

Trigger:
- `Add connection`
- connector-specific connect/create actions

Visible content:
- provider identity
- auth-mode toggles
- inputs for secrets/tokens/URLs
- `Cancel`
- primary create/connect action
- close button `Close connector dialog`

## 4.12 Delete workflow dialog

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/page.tsx`

Trigger:
- workflow delete action

Visible content:
- workflow name in confirmation copy
- `Cancel`
- destructive delete confirm

## 4.13 Kill machine dialog

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/machines/page.tsx`

Trigger:
- `Kill Machine`

Visible content:
- target machine confirmation
- `Cancel`
- destructive confirm

## 4.14 Hard kill run dialog

Source:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/inspect/page.tsx`

Trigger:
- `Hard Kill Run`

Visible content:
- run-kill warning
- `Cancel`
- destructive confirm

## 4.15 Other notable panels

- `PlatformInspectPanel`
  - close controls visible as `Close inspect panel`
- local runtime recovery cards
- workbench control panels
- run activity rails

These are auxiliary visible surfaces outside the primary route-level pages.

---

## 5. Text and Content Density Hotspots

## 5.1 Heaviest text/copy surfaces

### `/sign-in`

Reasons:
- multiple parallel explanation blocks
- repeated account-boundary explanation
- badge rail + left rail + access panel + after-sign-in panel

Examples of repeated thematic copy:
- `Empyralis account access`
- `Your Empyralis account owns workspaces, artifacts, runs, notifications, and recovery.`
- `OpenAI is a connected provider, not the sole owner of this account.`
- `Sign in to Empyralis first. Connect OpenAI, Codex, or other AI providers separately after access is established.`
- `Add a backup sign-in method in Settings, then connect OpenAI or Codex from Credentials.`

### `/credentials`

Reasons:
- extremely high component count
- large catalog and modal flows
- many explanatory paragraphs mixed with action density
- several providers and auth modes exposed on one page

### `/health`

Reasons:
- diagnostic detail
- historical data
- troubleshooting copy
- many small operational buttons

### `/runs/[id]/inspect`

Reasons:
- live feed plus multiple support modules
- many action rails
- lineages, approvals, kill controls, sections, event feed modes

### `/workflows`

Reasons:
- repeated workflow framing and helper copy
- active/deleted/empty states all explain workflow philosophy

## 5.2 Pages with low control count but heavy explanatory language

- `/sign-in`
- `/connect-ai`
- `/settings`
- setup-related wizard surfaces

---

## 6. Brand Repetition Index: “Empyralis”

This section documents where the brand name appears repeatedly in product copy, not just in logos or titles.

## 6.1 High repetition hotspots

### `/sign-in`

File:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx`

Observed repeated brand-bearing strings:
- `Empyralis account access`
- `Empyralis Account Access`
- `Your Empyralis account owns workspaces, artifacts, runs, notifications, and recovery.`
- `Use Google as a sign-in method for Empyralis.`
- `Use Apple as a sign-in method for Empyralis.`
- `Create Empyralis account`
- `This build does not have Google or Apple account sign-in configured yet. Use your Empyralis credentials here...`

Assessment:
- strongest brand repetition hotspot in the frontend

### `/settings` and `/account`

Files:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/settings/page.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/AccountAccessPanel.tsx`

Observed themes:
- `Empyralis account vs AI providers`
- `Manage Empyralis sign-in methods here...`

### `/home`

File:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx`

Observed line:
- `Empyralis handles the rest.`

### Setup and desktop setup surfaces

Files:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/setup/DesktopSetupWizard.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/SetupWizard.tsx`

Observed themes:
- repeated references to `Empyralis` in trust, desktop handoff, permission verification, and app-boundary explanations

### Sidebar

File:
- `/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx`

Observed line:
- `Empyralis`

Note:
- brand usage here is expected and structural rather than verbose

## 6.2 Workflow-era wording that still remains visible

This is not a fix list; it is an inventory of currently visible wording that still belongs to the older workflow product framing.

High-visibility examples:

- `/home`
  - `Saved workflows`
- `/workflows`
  - entire page framing
- `/solutions`
  - `built on top of workflows, skills, and connectors`
- `/credentials`
  - `Available to shared workflows`
- `/executions`
  - links to `/workflows`
- `/control-center`
  - still routes to `/workflows`

---

## 7. Route-Level Necessity Summary

## 7.1 Clearly central product routes

- `/`
- `/agents`
- `/agents/[id]/configure`
- `/store`
- `/approvals`
- `/runs/[id]/inspect`
- `/credentials`

## 7.2 Operational/admin heavy routes

- `/health`
- `/machines`
- `/library`
- `/skills`
- `/usage`
- `/settings`

## 7.3 Transitional or drift-heavy routes

- `/workflows`
- `/builder`
- `/control-center`
- `/home`
- `/solutions`

---

## 8. Notable Raw Contradictions in the Current Surface

This section is inventory-only. It records what coexists today.

- The product has a Sage-first chat surface, but still exposes `/workflows` as a major visible route.
- The sidebar still exposes `Library`, while the new install/store model also exists.
- `/control-center` still points to `/workflows`.
- `/connectors` and `/credentials` are effectively the same surface.
- `/sign-in`, `/connect-ai`, `/settings`, and `/account` all explain some version of identity/provider separation.
- `/home` still uses workflow-era language while `/store` and `/agents` use the newer agent language.
- The run/cockpit and machine surfaces are enterprise-grade in control depth, while several overview surfaces still read like prototype demos.

---

## 9. Raw Bottom Line

The current frontend is not one single visual system. It is a strong but mixed surface composed of:

- one very dense primary Sage chat route
- one very dense integrations route
- one very dense live cockpit route
- one very dense diagnostics route
- a newer agent/store/switchboard set of surfaces
- older workflow/library/home/control-center wording that still remains visible
- several explanatory pages where copy volume is higher than interaction volume

This file intentionally stops at inventory.
