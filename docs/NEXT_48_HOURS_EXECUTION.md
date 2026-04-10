# NEXT 48 HOURS EXECUTION

Status: execution roadmap  
Date: 2026-04-09  
Owner: Fractional CTO plan  
Purpose: define the exact next 48 hours of work to move Empyralis from “promising but fragmented” to a secure, coherent Master Agent product foundation

---

## 1. Reality Check

This roadmap starts from the **actual current state**, not the earlier panic snapshot.

### Verified state as of 2026-04-09

- Postgres RLS migration is applied locally.
- Auth fallback hardening is in place.
- The full backend suite is currently green:
  - `1142 passed`
  - command:
    - `./venv/bin/python -m pytest server_modules/tests -q`
- The Next.js shell migration has started, but the frontend is still structurally mixed:
  - `(shell)` exists
  - Sage exists under `(shell)`
  - legacy routes still exist in parallel
  - builder/workflow-era surfaces still remain
- The frontend still does **not** match the Master Map:
  - no real channel-first “Telegram for AI” layout
  - no Owner Mode / Customer Mode
  - no stable agent channel model
  - no clean Store / Agents / Sage separation

### What this means

The backend is no longer the fire.

The immediate risk is now:
- uncommitted or unstable security work drifting
- shell and IA remaining half-migrated
- frontend work starting without a clean channel model

So the next 48 hours must:
1. freeze the security baseline
2. finish the shell truth
3. build the first channel primitives
4. implement the first end-to-end agent loop

---

## 2. CTO Priority Order

The correct order is:

1. **Lock the foundation**
2. **Finish shell truth**
3. **Build the channel model**
4. **Build Owner Mode / Customer Mode**
5. **Build the Auto Parts Shop Agent MVP**

Do not invert this order.

If we jump into “cool UI” before shell truth and baseline protection, we will recreate fragmentation.

---

## 3. Phase Plan

## Phase 1: Security Baseline Freeze

### Goal

Treat the new RLS/auth hardening as the first immovable foundation.

The 33 failing tests from the immediate post-RLS moment are no longer the current blocker. They have already been fixed.  
So Phase 1 is not “debug random failures.”  
Phase 1 is to **freeze, verify, and protect** the now-green security baseline before any major product work continues.

### Why this is first

Because if the security foundation is still sitting in a large dirty worktree without a formal baseline, every following phase is unsafe.

### Work

- audit the final backend/security diff set
- separate true security/runtime changes from unrelated frontend churn
- run the full backend suite one more time as the freeze check
- write down the required “green baseline” commands for future enforcement
- create a dedicated commit boundary for:
  - RLS
  - fail-closed auth
  - explicit tenant/workspace scoping
  - loop-safe DB pool behavior
  - fixed runtime/run-state tests

### Deliverables

- one clean backend security baseline commit
- one canonical validation command list
- one short internal note describing:
  - what is now guaranteed
  - what is still not guaranteed

### Done criteria

- backend diff is isolated and intentional
- full suite remains green
- no more ambiguity about whether the RLS/auth migration is “done”

### What must not happen in Phase 1

- no UI redesign
- no route reshuffle
- no Store or mobile work
- no new agent features

### Approval note

**This is the phase to approve first.**  
If you ask “what do we code first,” the answer is this phase.

---

## Phase 2: Shell Truth And IA Stabilization

### Goal

Finish the architectural truth of the frontend shell so the product has one real operating frame.

### Why second

Right now the shell migration is only partially complete:
- `(shell)` exists
- but legacy routes still exist beside it
- old builder/workflow surfaces still distort the architecture

Until shell ownership is clean, every UI component we add will land on unstable ground.

### Work

- complete the `(shell)` route group migration for all shell-owned surfaces
- ensure only auth/setup/onboarding/demo-style routes live outside shell
- normalize route ownership to the canonical sections:
  - Sage
  - Runs
  - Agents
  - Store
  - Integrations
  - Usage
  - Account
  - Settings
- add redirects for legacy nouns instead of keeping parallel meanings
- stop old workflow-era pages from acting like first-class surfaces

### Deliverables

- one canonical shell route tree
- one canonical nav source of truth
- working deep-link behavior under the shell

### Done criteria

- any shell-owned page renders inside the same shell
- sidebar active state is correct for nested routes
- old top-level route drift is eliminated

### What must not happen in Phase 2

- no visual redesign for every page
- no Owner/Customer UI yet
- no Store overhaul yet

---

## Phase 3: Sage Channel Foundation

### Goal

Transform Sage from “chat page” into the first real **channel-based Master Agent surface**.

### Why third

The Master Map depends on a chat-first ecosystem.  
Before we build agent toggles or commerce, we need the core channel model visible in the UI.

### The first UI components we must build

These are the very first “Telegram for AI” components:

1. **`ChannelRail`**
- left-hand or mobile sheet list of channels
- Sage pinned at the top
- specialist channels below
- unread / active / blocked states

2. **`ChannelListItem`**
- name
- icon
- status badge
- latest preview
- active state

3. **`ChannelHeader`**
- current channel identity
- source/channel badges
- mode badge
- quick actions

4. **`SagePinnedCard`**
- special top item for Sage
- clearly not just “another agent”
- shows active interventions / approvals / live run badges

5. **`InlineActivityFeed`**
- muted operational trace inside the channel
- specialist activity and run progress

6. **`ArtifactPreviewCard`**
- inline output preview inside the channel thread

### Work

- introduce the channel rail and channel header primitives
- pin Sage at the top
- map installed agents to channel entries
- keep the current backend contracts; this is a UI/domain composition phase, not an API rewrite

### Deliverables

- Sage looks like the master inbox
- installed specialists look like channels
- channel selection works inside the shell

### Done criteria

- the user can visually understand:
  - Sage is the OS
  - specialists are channels
  - runs and approvals surface into those channels

### What must not happen in Phase 3

- no attempt to build full mobile native UI yet
- no commercial Store merge yet
- no massive chat visual redesign beyond channel structure

---

## Phase 4: Owner Mode / Customer Mode

### Goal

Create the first true agent lifecycle interface:
- test as the customer
- operate as the owner

### Why fourth

This is the smallest high-leverage UI change that turns an “agent card” into a real product.

### Work

- inside a specific agent channel, add a visible mode switch:
  - `Customer Mode`
  - `Owner Mode`
- define behavior per mode:

#### Customer Mode
- normal chat surface
- no internal owner controls
- same experience an external user would get

#### Owner Mode
- reveal the operator panel for that agent:
  - Bible summary
  - connected tools
  - channel bindings
  - recent outcomes
  - policy/metrics summary

- keep this intentionally narrow in the first pass

### The first Owner Mode components

1. **`AgentModeToggle`**
- small segmented control

2. **`OwnerPanel`**
- right-side or collapsible owner command panel

3. **`BibleSummaryCard`**
- current instructions version
- edit entry point

4. **`ChannelBindingsCard`**
- phone/email/WhatsApp/Telegram placeholders
- visible even if not fully live yet

5. **`AgentMetricsStrip`**
- compact health and usage stats

### Deliverables

- every agent channel now has two valid perspectives
- Empyralis begins to feel like a business OS, not just a chat demo

### Done criteria

- the owner can clearly switch between “what my customer sees” and “how I control this agent”

### What must not happen in Phase 4

- no full Bible editor yet
- no full analytics suite
- no full workflow builder resurrection

---

## Phase 5: Auto Parts Shop Agent MVP

### Goal

Build the first complete, opinionated end-to-end product loop using one realistic business.

### Why this MVP

The Auto Parts Shop Agent is ideal because it requires:
- product lookup
- inventory answers
- customer communication
- escalation
- quote/approval logic
- owner testing

It exercises the real architecture without requiring enterprise complexity.

### MVP identity

Agent name:
- `Auto Parts Shop Agent`

Business role:
- inventory and sales assistant for a local parts store

### MVP channel model

Visible channels:
- `Sage`
- `Auto Parts Shop Agent`

### MVP capabilities

The agent must be able to:
- answer product and fitment questions from a seeded catalog
- respond with availability
- gather order/contact details
- escalate uncertain or high-risk cases
- draft a quote or availability follow-up

### MVP data inputs

Use a fixed demo corpus:
- inventory catalog JSON
- fitment notes
- return policy
- shipping/pickup rules
- business hours

Do not start with live ERP or third-party integrations.

### MVP user roles

1. **Owner**
- installs and configures the agent
- tests it in Customer Mode
- adjusts behavior in Owner Mode

2. **Customer**
- asks for a part
- asks about stock
- asks about return/refund/pickup

### MVP end-to-end acceptance path

1. owner opens Empyralis
2. owner installs or enables the Auto Parts Shop Agent
3. owner opens the agent channel
4. owner switches to `Customer Mode`
5. customer asks:
   - “Do you have front brake pads for a 2018 Toyota Camry?”
6. agent retrieves relevant inventory/fitment micro-context
7. agent returns:
   - availability
   - part options
   - next step
8. if confidence is low or stock is missing, agent escalates
9. owner switches to `Owner Mode`
10. owner updates the agent Bible/policy summary or reviews bindings
11. owner re-tests the same question
12. run and output appear in Runs/Cockpit

### The first end-to-end test we must build

This should be a **web-first Playwright flow** with seeded demo data.

It should prove:
- channel selection works
- Owner/Customer toggle works
- the agent answers using retrieved micro-context
- the run is logged
- the output is visible

This is the first product-level proof that the architecture is real.

### Done criteria

- one user can install, test, operate, and inspect one agent end-to-end
- without touching raw workflow/builder UI

---

## Phase 6: Channel Endpoint Skeletons

### Goal

Lay down the first product-visible foundation for multi-modal agents without implementing every channel integration.

### Work

- add channel binding representation in Owner Mode for:
  - phone
  - email
  - WhatsApp
  - Telegram
- make them visible as configured or unconfigured endpoints
- model them as channel identities bound to one agent

### Why this phase is late

Because we do not need live WhatsApp/Telegram delivery to prove the product loop.
We only need the product architecture to start reflecting the real future model.

### Deliverables

- the owner can see that an agent is a multi-channel business endpoint, not just a web chat panel

### What must not happen in Phase 6

- no full telecom rollout
- no live external messaging launch
- no broad connector explosion

---

## 4. What We Are Explicitly Not Doing In The Next 48 Hours

Do not spend the next 48 hours on:
- full mobile native apps
- Store monetization flows
- broad commercial marketplace polish
- full creator studio
- workflow builder resurrection
- deep analytics dashboards
- microVM rollout
- full external messaging integration
- visual perfection across every page

Those are real future workstreams, but they are not the next 48-hour path.

---

## 5. The Correct Starting Point

If you ask:

**“What is Phase 1? What do we do first?”**

The answer is:

## Phase 1 = Security Baseline Freeze

Because the backend security work is already green, but it must now be:
- isolated
- committed cleanly
- protected from drift
- treated as the non-negotiable floor for everything else

After that, the correct build order is:
- Phase 2: shell truth
- Phase 3: Sage channel foundation
- Phase 4: Owner/Customer toggle
- Phase 5: Auto Parts Shop Agent MVP
- Phase 6: endpoint skeletons

---

## 6. Approval Gate

Approve **Phase 1** if you want the next coding sprint to begin correctly.

The wrong first move would be:
- building UI flourishes
- building Store polish
- building mobile mockups
- or inventing more agent pages

The right first move is:
- freeze the security foundation
- then finish the shell
- then build the channel model

