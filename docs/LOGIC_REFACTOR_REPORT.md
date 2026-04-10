# LOGIC REFACTOR REPORT

Scope: full frontend routing, shell, and state architecture under `/frontend`.

Verdict:
- The frontend is not broken because of one bad component. It is structurally over-coupled.
- The root `frontend/app/layout.tsx` is doing too much shell work.
- The root `/` route owns far too much unrelated state through `frontend/app/page.state.ts` and `frontend/app/page.api.ts`.
- The sidebar, shell route labels, and route ownership logic are duplicated across multiple files.
- Several pages are legacy duplicates that should be deleted or downgraded to redirects.

This report is a file-by-file mandate, not generic advice.

## 1. Routing And Layout Refactor

### 1.1 Current structural problems

1. `frontend/app/layout.tsx` is both:
   - the global HTML/provider root
   - the shell geometry/layout engine
   - the path-aware chrome hider for setup/auth-like flows

2. Inner pages do not share section-native layouts.
   - `/agents` is one page
   - `/agents/[id]/configure` is another isolated page
   - `/runs/[id]/page.tsx` and `/runs/[id]/inspect/page.tsx` are two different run detail surfaces
   - `/connectors`, `/credentials`, `/machines`, `/health`, `/setup` are all top-level siblings instead of an integrations/settings family

3. The product has multiple parallel route vocabularies:
   - shell titles in `frontend/lib/shellRoutes.ts`
   - section ownership in `frontend/lib/productArchitecture.ts`
   - actual sidebar buttons in `frontend/components/ui/AppSidebar.tsx`
   - command palette labels elsewhere

That guarantees drift.

### 1.2 Mandatory target route tree

Create route groups and nested layouts. The shell must be a route-group concern, not a path-string concern.

```text
frontend/app
├── layout.tsx                       # pure html/body/providers only
├── (shell)
│   ├── layout.tsx                   # sidebar + topbar + inspect panel + shell stage
│   ├── page.tsx                     # Sage
│   ├── home
│   │   └── page.tsx
│   ├── agents
│   │   ├── layout.tsx               # agents section wrapper
│   │   ├── page.tsx                 # installed agents dashboard
│   │   ├── store
│   │   │   └── page.tsx             # optional, or keep /store outside agents but still in shell
│   │   └── [id]
│   │       ├── layout.tsx           # agent detail shell
│   │       ├── page.tsx             # agent overview / details
│   │       └── configure
│   │           └── page.tsx
│   ├── runs
│   │   ├── layout.tsx               # runs section wrapper
│   │   ├── page.tsx                 # canonical run list
│   │   └── [id]
│   │       ├── layout.tsx           # run detail shell
│   │       └── page.tsx             # canonical cockpit
│   ├── integrations
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # integrations overview
│   │   ├── connectors
│   │   │   └── page.tsx
│   │   ├── credentials
│   │   │   └── page.tsx
│   │   ├── machines
│   │   │   └── page.tsx
│   │   └── health
│   │       └── page.tsx
│   ├── library
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # canonical reusable assets surface
│   │   ├── skills
│   │   │   └── page.tsx
│   │   └── solutions
│   │       └── page.tsx
│   ├── usage
│   │   └── page.tsx
│   ├── account
│   │   └── page.tsx
│   └── settings
│       ├── layout.tsx
│       └── page.tsx
├── (auth)
│   ├── sign-in
│   │   ├── page.tsx
│   │   └── complete
│   │       └── page.tsx
│   └── onboarding
│       └── page.tsx
└── api
```

### 1.3 What to move out of `frontend/app/layout.tsx`

Current file:
- [frontend/app/layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/layout.tsx)

Keep here:
- `<html>`, `<body>`
- global providers
- font setup
- global CSS bootstrap

Move out:
- shell-specific DOM:
  - `PlatformTopBar`
  - sidebar chrome
  - inspect panel mount
  - shell-stage sizing wrappers
- path-aware hide/show shell logic

New destination:
- `frontend/app/(shell)/layout.tsx`

Why:
- auth/onboarding/setup-like routes should not rely on runtime path inspection to hide chrome
- shell and non-shell surfaces must be split structurally

### 1.4 Section layouts that must be added

Add immediately:
- `frontend/app/(shell)/agents/layout.tsx`
- `frontend/app/(shell)/runs/layout.tsx`
- `frontend/app/(shell)/integrations/layout.tsx`
- `frontend/app/(shell)/library/layout.tsx`
- `frontend/app/(shell)/settings/layout.tsx`

Purpose:
- own section-local header, tabs, breadcrumbs, and secondary navigation
- keep child pages native to the same main stage
- stop every page from hand-rolling its own wrapper

### 1.5 Inner page behavior requirement

For `/agents/[id]/configure`:
- it must render inside `agents/layout.tsx`
- the sidebar remains stable
- the section header remains `Agents`
- only the child panel changes

For `/runs/[id]`:
- there must be one canonical detail route
- cockpit, interventions, child runs, and artifacts belong to the same run-detail layout

### 1.6 Redundant/dead pages to delete or collapse immediately

Delete immediately:
- [frontend/app/builder/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/builder/page.tsx)
  - it is already just a redirect to `/agents`
  - keep the redirect behavior in `next.config.ts` or route middleware instead of a whole page

- [frontend/app/runs/[id]/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/runs/[id]/page.tsx)
  - duplicates the run detail role of `/runs/[id]/inspect/page.tsx`
  - keep one run detail implementation only
  - recommendation: keep the newer cockpit surface, move it to `/runs/[id]/page.tsx`, delete `/inspect`

Collapse next:
- [frontend/app/workflows/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/workflows/page.tsx)
  - this is still a legacy workflow-era library surface
  - merge any still-needed reusable-asset listing into `/library`
  - do not keep a parallel library taxonomy

- [frontend/app/executions/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/executions/page.tsx)
  - if runs become canonical under `/runs`, this becomes an alias
  - keep only as a redirect during migration

Delete legacy shell leftovers:
- [frontend/components/Sidebar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/Sidebar.tsx)
- [frontend/components/Sidebar.module.css](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/Sidebar.module.css)
- [frontend/components/Topbar.module.css](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/Topbar.module.css)
  - these are legacy shell artifacts and should not coexist with `AppSidebar.tsx` and `PlatformTopBar.tsx`

### 1.7 Canonical route decisions

Adopt these canonical URLs:
- `/` = Sage
- `/home` = Overview
- `/agents` = installed agents
- `/agents/[id]/configure` = agent configuration
- `/runs` = run list
- `/runs/[id]` = live cockpit
- `/integrations` = integrations overview
- `/integrations/connectors`
- `/integrations/credentials`
- `/integrations/machines`
- `/integrations/health`
- `/library` = reusable assets
- `/usage`
- `/account`
- `/settings`

Transitional redirects only:
- `/executions` -> `/runs`
- `/runs/[id]/inspect` -> `/runs/[id]`
- `/connectors` -> `/integrations/connectors`
- `/credentials` -> `/integrations/credentials`
- `/machines` -> `/integrations/machines`
- `/health` -> `/integrations/health`
- `/workflows` -> `/library`
- `/builder` -> `/agents`

## 2. Left Panel Duties And State Logic

### 2.1 Current problem

The sidebar is defined in:
- [frontend/components/ui/AppSidebar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx)

But active-route ownership also lives in:
- [frontend/lib/productArchitecture.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/productArchitecture.ts)
- [frontend/lib/shellRoutes.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shellRoutes.ts)

That is wrong. Sidebar duties, route ownership, and active-state matching must come from one registry.

### 2.2 Strict duty for every sidebar button

`Overview`
- Route: `/home`
- Duty: show workspace-level current work, approvals, summaries, recent runs
- Never owns agent configuration, connectors, or detailed cockpit surfaces

`Sage`
- Route: `/`
- Duty: open the master thread
- Special behavior:
  - if already on `/`, focus the composer / latest thread
  - if a run is active, show live indicator only
  - it is not a generic “chat history section”; it is the master relationship

`Agents`
- Route: `/agents`
- Duty: installed specialists, details, configuration, enable/disable, run
- Owns:
  - `/agents`
  - `/agents/[id]`
  - `/agents/[id]/configure`
- Does not own store-wide reusable assets unless you intentionally fold store into agents

`Library`
- Route: `/library`
- Duty: reusable assets, skills, templates, solutions
- Owns:
  - `/library`
  - `/library/skills`
  - `/library/solutions`
  - old `/workflows` only during migration

`Integrations`
- Route: `/integrations`
- Duty: external systems, credentials, machine/runtime targets, health
- Owns:
  - `/integrations`
  - `/integrations/connectors`
  - `/integrations/credentials`
  - `/integrations/machines`
  - `/integrations/health`

`Usage`
- Route: `/usage`
- Duty: operational consumption and economics only
- It should never disappear from the sidebar because of chat-level cleanup

`Account`
- Route: `/account`
- Duty: user identity and account ownership

`Settings`
- Route: `/settings`
- Duty: workspace defaults, policy, platform behavior

### 2.3 Exact active-state logic

Do not compute active state ad hoc in the sidebar.

Create one central registry:
- `frontend/lib/navigation.ts`

That file should export something like:

```ts
export type NavSectionId =
  | 'overview'
  | 'sage'
  | 'agents'
  | 'library'
  | 'integrations'
  | 'usage'
  | 'account'
  | 'settings';

export const NAV_SECTIONS = [
  {
    id: 'sage',
    href: '/',
    match: (pathname: string) => pathname === '/',
  },
  {
    id: 'agents',
    href: '/agents',
    match: (pathname: string) => pathname === '/agents' || pathname.startsWith('/agents/'),
  },
  {
    id: 'runs',
    href: '/runs',
    match: (pathname: string) => pathname === '/runs' || pathname.startsWith('/runs/'),
  },
  // ...
];

export function resolveNavSection(pathname: string): NavSectionId {
  return NAV_SECTIONS.find((item) => item.match(pathname))?.id ?? 'settings';
}
```

Then in `AppSidebar.tsx`:

```ts
const pathname = usePathname() ?? '/';
const activeSection = resolveNavSection(pathname);
const active = item.id === activeSection;
```

This is the exact rule needed so:
- `/agents/123/configure` keeps `Agents` highlighted
- `/runs/abc123` keeps `Runs` highlighted
- `/integrations/machines` keeps `Integrations` highlighted

### 2.4 Files to rip logic out of

Refactor these files to stop duplicating navigation truth:
- [frontend/components/ui/AppSidebar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/ui/AppSidebar.tsx)
  - remove local `MAIN_NAV` and `BOTTOM_NAV` as source-of-truth
  - consume `NAV_SECTIONS`

- [frontend/lib/productArchitecture.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/productArchitecture.ts)
  - keep conceptual ownership metadata
  - remove route matching responsibility from this file

- [frontend/lib/shellRoutes.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shellRoutes.ts)
  - replace with a view adapter over `NAV_SECTIONS`
  - route title/breadcrumb metadata should derive from the same registry

- [frontend/lib/commandRegistry.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/commandRegistry.ts)
  - commands should be generated from the same canonical section list where possible

## 3. State Management Purge

### 3.1 Root diagnosis

Current root route state is bloated across:
- [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx)
- [frontend/app/page.api.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.api.ts)
- [frontend/app/page.state.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.state.ts)

This is the central frontend tangle.

`page.state.ts` currently mixes:
- chat composer state
- provider/model selection
- vault credentials
- connector credentials
- local execution drafts
- weekly schedule state
- setup wizard state
- metrics
- logs
- runtime worker state
- top-level run state

That is not a page-state file. It is an accidental application store.

### 3.2 Mandatory separation

Split into three layers.

#### Layer A: Global shell state

Keep only truly global shell concerns in:
- [frontend/components/orion/PlatformShellContext.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformShellContext.tsx)

Allowed responsibilities:
- active tenant/workspace
- workspace access list
- inspect panel open/closed
- shell-level notices
- current inspect target metadata
- sidebar collapsed state should move to its own hook/store and not be entangled with chat

Remove from shell context:
- chat-local artifact toggles
- message-local activity arrays
- page callback closures like `onToggleArtifacts`
- any route-specific UI closures

Replace with:
- a small serializable shell state contract

#### Layer B: Master thread state

Create:
- `frontend/features/chat/context/MasterThreadContext.tsx`
- `frontend/features/chat/hooks/useMasterThread.ts`
- `frontend/features/chat/api.ts`

Responsibilities:
- session bootstrap
- current thread id
- message list
- send state
- step stream state
- artifact payloads
- approvals/interventions
- model selection for the master thread only

Move out of `page.api.ts`:
- master-thread request/stream orchestration
- chat response normalization
- SSE assembly
- artifact extraction glue

Keep `page.tsx` as a composition shell only:
- load master thread provider
- render `ChatSurface`
- render optional right-rail / context rail

#### Layer C: Feature page state

Create dedicated feature hooks:
- `frontend/features/agents/useInstalledAgents.ts`
- `frontend/features/runs/useRunList.ts`
- `frontend/features/runs/useRunDetail.ts`
- `frontend/features/integrations/useConnectors.ts`
- `frontend/features/integrations/useCredentials.ts`
- `frontend/features/usage/useUsageSummary.ts`
- `frontend/features/setup/useSetupWizard.ts`

Move out of `page.state.ts` immediately:
- credentials
- connectors
- schedules
- runtime metrics
- setup sessions
- worker health
- local execution drafts
- provider catalog and auth-mode state

Those states do not belong to `/`.

### 3.3 `page.api.ts` file-by-file mandate

Current file:
- [frontend/app/page.api.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.api.ts)

Problem:
- this file is acting as a god-client for the entire product

Split into:
- `frontend/features/chat/api.ts`
  - `fetchMasterContext`
  - `sendMasterTurn`
  - `openMasterThreadStream`
  - `normalizeChatPayload`

- `frontend/features/providers/api.ts`
  - provider catalog
  - provider model list
  - local auth import/probe

- `frontend/features/integrations/api.ts`
  - connectors
  - credentials
  - machine/runtime status

- `frontend/features/setup/api.ts`
  - setup session lifecycle
  - readiness checks

- `frontend/features/runs/api.ts`
  - run start/resume/hard-kill helpers

### 3.4 `page.state.ts` file-by-file mandate

Current file:
- [frontend/app/page.state.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.state.ts)

Mandate:
- delete the idea of a monolithic `PageState`
- replace with narrow feature hooks

Immediate extraction list:
- provider/model/catalog state -> `features/providers/useProviderSelection.ts`
- connector/credential form state -> `features/integrations/useCredentialForms.ts`
- setup flow state -> `features/setup/useSetupWizard.ts`
- runtime metrics/logs/worker status -> `features/runtime/useRuntimeMonitor.ts`
- weekly scheduling state -> `features/schedules/useWeeklySchedule.ts`
- master chat state -> `features/chat/useMasterThread.ts`

After extraction:
- `frontend/app/page.state.ts` should either disappear entirely or become a tiny route-local file used only by `/`

### 3.5 `page.tsx` mandate

Current file:
- [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx)

Target:
- it should become a thin route entry
- it should not know about credentials, connector setup, weekly autopilot, or health polling

Allowed responsibilities:
- consume `MasterThreadContext`
- render `ChatSurface`
- render a context/identity side panel if needed
- pass shell notices upward through a narrow bridge

Not allowed:
- being the operating console for the entire platform

## 4. Concrete Migration Order

1. Create route groups:
   - `(shell)`
   - `(auth)`

2. Move shell chrome out of `frontend/app/layout.tsx` into `frontend/app/(shell)/layout.tsx`.

3. Create `frontend/lib/navigation.ts` and make:
   - `AppSidebar.tsx`
   - `PlatformTopBar.tsx`
   - command palette
   - route title resolver
   consume the same section registry.

4. Canonicalize runs:
   - keep one detail page
   - delete the duplicate run detail route

5. Canonicalize integrations:
   - promote `/integrations/*`
   - demote `/connectors`, `/credentials`, `/machines`, `/health` to redirects

6. Canonicalize library:
   - fold `/workflows` into `/library`
   - delete dead workflow-era route ownership

7. Split root `/` state:
   - extract `MasterThreadContext`
   - split `page.api.ts`
   - kill `PageState` god object

## 5. Non-Negotiable End State

When this refactor is complete:
- the shell is owned by one route-group layout
- auth/setup do not rely on CSS/path hacks to hide chrome
- every sidebar button has one strict duty
- active state comes from one centralized matcher
- `/agents/[id]/configure` still highlights `Agents`
- `/runs/[id]` still highlights `Runs`
- root `/` owns only Sage, not the whole operating console
- there is no duplicate run detail page
- there is no separate workflow-era library fighting the new product model

That is the required frontend reset. Anything smaller will leave the routing and shell logic tangled.
