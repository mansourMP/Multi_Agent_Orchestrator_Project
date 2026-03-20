# Empyralis Mobile Agent Handoff

Copy and paste this to the other agent. This is the single handoff for the phone app track.

---

You are working inside:

`/Users/mansur/Multi_Agent_Orchestrator_Project`

Your job is to build the **Empyralis mobile application**.

## Read first
Read these files before changing anything:

1. `/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_MOBILE_V1_PLAN.md`
2. `/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_PRODUCT_DESIGN_BRIEF.md`
3. `/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_UI_OS_CONTRACT.md`

Those files are the source of truth.

## Product position
Empyralis Mobile is **not** a desktop clone.
Empyralis Mobile is **not** a developer console.
Empyralis Mobile is **not** a workflow builder first.

Empyralis Mobile is the **personal agent application**.
It should feel closer to a daily assistant app than a control plane.

It should let normal people:
- chat with agents
- ask for help with studies, reminders, meals, planning, and personal work
- see what agents are doing
- approve actions
- check progress and results
- manage their own profile/preferences

The execution model stays:
- desktop/web platform = engine, orchestration, heavy operator surface
- mobile = personal conversation and lightweight control surface
- local companion = execution plane for desktop machine tasks

Do not blur those boundaries.

## Non-negotiable product shape
Build Mobile V1 with exactly these bottom tabs:

1. `Home`
2. `Agents`
3. `Runs`
4. `Approvals`
5. `You`

Do not invent extra primary tabs.

## Scope boundaries
You own the **mobile app only**.

Preferred workspace:

`/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/`

Rules:
- create and maintain the dedicated mobile app workspace
- do not refactor the existing web frontend unless there is a clearly required shared contract change
- do not make broad server/runtime changes unless you find a real API gap
- if you find an API gap, document it clearly instead of improvising a large backend rewrite

## Mandatory tech direction
Use **React Native with Expo** unless there is a repo-local blocker.

Recommended stack:
- Expo Router
- React Query / TanStack Query
- Expo SecureStore
- Expo Notifications
- light local UI state only if needed

## Visual direction
The app must feel like Empyralis, but as a calmer personal product:
- chat-first
- minimal
- premium
- readable by non-technical users

Tone:
- dark mode = charcoal / graphite, not pure black
- light mode = warm neutral / cream, not stark white
- accent = restrained violet

Brand colors:
- primary: `#6D28D9`
- highlight: `#8B5CF6`
- warning: `#F59E0B`

Do not ship:
- developer syntax as primary UI
- raw runtime internals in default views
- duplicated actions
- excessive tab nesting
- crowded desktop-style control surfaces

## Build order
### Phase 1: foundation
1. Session / pairing
2. Theme tokens
3. API client structure
4. Bottom-tab shell
5. Shared mobile components

### Phase 2: core screens
1. `Home`
   - primary chat surface
   - recent conversations
   - quick actions
   - active work summary
   - urgent approvals
2. `Agents`
   - direct chat with a selected agent
   - small current-work summary
3. `Runs`
   - active runs first
   - recent runs list
   - readable run detail shell
4. `Approvals`
   - pending approvals
   - quick approve / hold / reject
5. `You`
   - account
   - preferences
   - notifications

### Phase 3: useful personal capabilities
1. artifact/result previews
2. photo upload
3. voice notes
4. quick personal actions
5. study / meal / routine shortcuts

## Explicitly out of scope for V1
Do not build these now:
- full automation graph builder
- system health console
- full integrations admin
- full desktop-control UI
- full workflow editor
- crypto trading execution
- desktop-equivalent runtime admin

## What good work looks like
The first delivery is correct only if:
1. the mobile app is isolated cleanly in its own workspace
2. the tab model matches the plan exactly
3. the app feels like one personal assistant product
4. a normal user can understand each tab without runtime knowledge
5. the implementation stays narrow and disciplined

## Required first deliverable
Build the mobile foundation and then make it useful as a personal app.

That means:
- app shell
- tabs
- session/pairing
- theme
- chat-first Home
- direct agent conversations
- readable runs/approvals
- documented assumptions

Do not drift into desktop/platform behavior.

## Report format
When you report back, use exactly this structure:

1. What I built
2. Files created/changed
3. What works now
4. What is blocked
5. Missing APIs or backend gaps
6. What should be built next

## Working style
- make the smallest correct implementation
- preserve alignment with the Empyralis platform
- do not redesign the desktop product model
- do not widen scope casually

If there is ambiguity, follow the mobile plan file instead of guessing.

---

Short version to send in chat:

`Read docs/EMPYRALIS_MOBILE_AGENT_HANDOFF.md and execute it exactly. Build the phone app as a personal agent application, not a desktop clone. Keep the engine on the platform side and keep the mobile app chat-first, simple, and useful to ordinary people.`
