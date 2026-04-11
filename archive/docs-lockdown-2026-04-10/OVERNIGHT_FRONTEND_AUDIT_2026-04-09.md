# Overnight Frontend Audit

Date: 2026-04-09

## Executive Summary

The frontend is not failing because the platform lacks capability. It is failing because the visible surface still reflects several older product stories at once:

- legacy workflow/library product architecture
- newer Sage-centric chat architecture
- admin/ops-heavy navigation
- setup-time provider complexity leaking into everyday UI

The result is friction, not incompetence. The UI already contains many good primitives. The problem is coherence.

## Critical Findings

### 1. Left panel expands incorrectly

Primary files:

- [frontend/app/layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/layout.tsx)
- [frontend/lib/useSidebarCollapsed.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/useSidebarCollapsed.ts)

Observed cause:

- sidebar state writes directly to `--shell-sidebar-width`
- main shell width, margin-left, max-width, and shellbar left-offset all animate off that variable
- route changes and shell repaint can therefore produce visible jumpiness or width disagreement

Why it feels wrong:

- the entire layout moves, instead of only the sidebar changing state
- a premium shell should keep the content stage visually anchored
- the current implementation makes the stage look structurally unstable

Recommendation:

- stop animating root layout width/margin for the whole shell
- keep the content stage anchored
- animate only sidebar internals and a non-layout overlay state when collapsed

### 2. Ghost and deprecated model options are still present

Primary files:

- [frontend/app/page.catalog.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.catalog.ts)
- [frontend/app/page.api.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.api.ts)
- [frontend/components/orion/connections/AiAccountsPanel.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/connections/AiAccountsPanel.tsx)
- [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx)

Observed issue:

- hardcoded fallback model catalogs still include aliases like `gpt-4.1` and `gpt-4.1-mini`
- model selection is exposed as a flat list of strings
- reasoning effort is not surfaced as a first-class, provider-aware control set

Why it is dangerous:

- the UI can imply support for models that are no longer the intended default
- the user cannot clearly see what comes from the provider vs. what is a local fallback alias
- model selection feels opaque and brittle instead of live and authoritative

Recommendation:

- make the UI read from live provider/model catalogs first
- visually separate:
  - provider
  - model
  - reasoning effort
- show reasoning modes explicitly as:
  - Low
  - Medium
  - High
  - Extra High
- never silently mix legacy aliases into the primary visible menu

### 3. The Usage tab is structurally mispositioned and likely misleading

Primary files:

- [frontend/app/usage/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/usage/page.tsx)
- [frontend/app/api/usage/summary/route.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/api/usage/summary/route.ts)
- [frontend/app/api/usage/runs/route.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/api/usage/runs/route.ts)
- [server_modules/usage_reporting.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/usage_reporting.py)

Observed issue:

- the page promises model consumption, token volume, and cost clarity
- the backend often works from masked or estimated cost data
- precision varies by provider and run path
- the page occupies first-class nav space even though the metric model is not mature enough to justify it

Why it feels broken:

- the product copy over-claims precision
- the surface reads like an enterprise billing console, but the data layer is still mixed between exact, estimated, and unavailable

Recommendation:

- rename or reposition it until telemetry is authoritative
- change copy from exact “usage accounting” language to “estimated consumption”
- do not give it top-level prominence unless you are ready to defend the numbers

### 4. Main content stage shifts or shakes when navigating

Primary files:

- [frontend/app/layout.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/layout.tsx)
- [frontend/app/home/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx)
- [frontend/lib/shellRoutes.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shellRoutes.ts)

Observed issue:

- route transitions change shell titles, shellbar positioning, and main-shell width
- some pages still use search-param driven setup guards and route redirects
- the stage looks like it reflows upward when entering certain routes

Recommendation:

- reduce global layout transitions
- reserve fixed vertical rhythm for the top shell and page stage
- eliminate route-specific height and margin surprises

### 5. New Chat and History are in the wrong navigation ownership zone

Primary files:

- [frontend/components/orion/PlatformTopBar.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/PlatformTopBar.tsx)
- [frontend/app/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/page.tsx)
- [frontend/components/orion/chat/ChatSurface.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/chat/ChatSurface.tsx)

Observed issue:

- `History` is triggered from the top bar
- `New Chat` is wired as a global event
- both belong to the Sage chat mode, not to platform-global navigation

Why this is wrong:

- it weakens the “one primary relationship: Sage” doctrine
- it leaks chat-local actions into global chrome
- it confuses what the top bar is for

Recommendation:

- move `New Chat` and `History` fully inside chat mode
- the global shell should handle platform navigation and status only

### 6. Sign-In is far too verbose and cognitively expensive

Primary file:

- [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx)

Observed issue:

- the page explains the identity model repeatedly
- it duplicates “account boundary / providers later / recovery-safe” concepts across badges, hero copy, rail cards, callouts, and footer notes
- it makes a simple action feel like onboarding to a security whitepaper

Recommendation:

- reduce copy by at least 50 percent
- keep one short sentence on identity ownership
- keep one sentence on provider linking later
- remove the three-card explanation rail on first render

### 7. Word economy is poor across the shell

Primary files:

- [frontend/lib/productArchitecture.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/productArchitecture.ts)
- [frontend/lib/commandRegistry.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/commandRegistry.ts)
- [frontend/app/home/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/home/page.tsx)
- [frontend/app/usage/page.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/app/usage/page.tsx)
- [frontend/components/orion/auth/BrowserSignInPage.tsx](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/components/orion/auth/BrowserSignInPage.tsx)

Observed issue:

- stale workflow vocabulary still appears in multiple places
- pages over-explain what they are
- the brand name and platform identity are repeated more often than necessary
- many descriptions sound like internal architecture notes instead of user-facing product language

Recommendation:

- move to sentence-case, plain language, short labels
- replace explanatory paragraphs with one-line task framing
- avoid naming Empyralis unless identity or brand clarity is actually needed

## Product-Architecture Drift

### The shell still encodes the old product

Primary files:

- [frontend/lib/productArchitecture.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/productArchitecture.ts)
- [frontend/lib/shellRoutes.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/shellRoutes.ts)
- [frontend/lib/commandRegistry.ts](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/lib/commandRegistry.ts)

Evidence:

- `Home`, `Usage`, `Library`, `Workflows`, and `Builder` language survives even after the visual canvas was amputated
- route metadata still frames the product like a mixed workflow/workbench/admin tool
- command palette descriptions still talk about “workflow-backed systems,” “recent workflows,” and similar pre-pivot vocabulary

Implication:

- the user sees a platform that still argues with itself about what it is

## Severity Ranking

### P0

- sidebar/layout instability
- stale model catalog and hardcoded ghost options
- chat-global actions living in top navigation
- stale product architecture vocabulary in shell/nav

### P1

- sign-in verbosity
- usage page honesty/positioning mismatch
- home page still dominated by workflow-era language and cards

### P2

- text redundancy and brand overuse
- inconsistent page hero framing
- low-signal badges and callouts

## Audit Verdict

The platform is not far from looking premium. But it currently behaves like a powerful backend wrapped in a UI that still remembers three previous product definitions.

The redesign priority should be:

1. stabilize shell geometry
2. simplify information architecture
3. de-hardcode model/routing choices
4. compress copy everywhere
5. make Sage feel like the only front door
