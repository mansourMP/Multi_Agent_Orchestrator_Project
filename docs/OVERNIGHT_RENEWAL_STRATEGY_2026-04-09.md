# Overnight Renewal Strategy

Date: 2026-04-09

## Core Rule

Do not redesign logic.  
Redesign the visible surface.

Specifically:

- keep Chat logic intact
- keep Integrations logic intact
- upgrade hierarchy, density, navigation ownership, and word economy

## Product Surface Thesis

Empyralis should present itself as:

- one primary relationship: Sage
- one high-trust command center
- one clear system of installed specialist agents
- one premium operator cockpit

It should not look like:

- an admin dashboard kit
- a workflow graveyard
- a setup wizard that never ended

## What Must Change First

### 1. Collapse the product into one visual center of gravity

Center of gravity:

- chat with Sage

Supporting surfaces:

- cockpit
- store
- installed agents
- integrations

Everything else should visually defer to that.

### 2. Remove stale architecture vocabulary

Must be systematically reduced:

- workflow-heavy wording
- library-heavy wording
- duplicated “platform” explanations
- repeated brand mentions

Replace with:

- Sage
- agents
- runs
- approvals
- integrations
- assets

### 3. Redefine global navigation ownership

Global shell should own:

- route changes
- notifications
- workspace and status context

Chat mode should own:

- new chat
- history
- model / provider / reasoning controls
- identity/context drawer

### 4. Make the model system truthful

The model selection surface must become:

- live
- provider-aware
- reasoning-aware
- non-hardcoded

Required visible layers:

- provider name
- model name
- reasoning mode
- readiness/availability state

### 5. Remove layout instability

The main stage must not:

- shift
- jump
- shake
- resize dramatically when sidebar state changes

## Route-by-Route Strategy

### `/`

Goal:

- make this the undisputed Sage command center

Changes:

- calmer top region
- tighter composer
- chat-local controls only
- right context rail for active specialists and current execution posture

### `/agents`

Goal:

- clean installed-agents dashboard

Changes:

- denser cards
- stronger placement/status chips
- clearer distinction between run now, configure, and open chat

### `/store`

Goal:

- premium catalog, not template marketplace clutter

Changes:

- fewer words
- stronger card hierarchy
- capability highlights as chips, not paragraphs
- one clean install action

### `/connectors`

Goal:

- keep the logic, remove visual overload

Changes:

- denser cards
- better grouping
- reduce long instructional text
- push advanced explanations into secondary drawers or help

### `/usage`

Goal:

- either demote or reframe honestly

Changes:

- stop presenting it as exact accounting if the data is estimated
- consider moving to admin/ops area until telemetry is mature

### `/sign-in`

Goal:

- finish the task in under 10 seconds

Changes:

- one sentence of trust framing
- one primary method block
- optional provider buttons
- remove identity essay

### `/runs/[id]/inspect`

Goal:

- premium live cockpit

Changes:

- one strong run header
- event feed density like Trigger.dev / Linear activity
- approval and kill controls in a decisive control cluster

## Design Rules to Adopt

### Rule 1: one loud thing per screen

Every screen gets one primary action and one visual focal point.

### Rule 2: text must earn its keep

Every sentence should either:

- help a decision
- reduce risk
- explain a non-obvious state

Otherwise it should be cut.

### Rule 3: sidebar is infrastructure

It should orient, not dominate.

### Rule 4: every chip and badge needs a job

Badges should indicate:

- state
- risk
- readiness
- placement

Not marketing.

### Rule 5: interventions must stay structured

No fake AI prose for:

- approvals
- loop stops
- system notices
- errors
- kill confirmations

### Rule 6: motion should preserve trust

Use:

- soft fade
- short slide
- minimal scale

Avoid:

- layout thrash
- page jump
- whole-stage wobble

## Recommended Visual Direction

### Typography

- sentence case
- compact headings
- short metadata lines
- fewer hero paragraphs

### Density

- more Linear than dashboard-kit
- more Notion than marketing splash
- tighter cards
- less padding around basic controls

### Buttons

- primary = one per section
- secondary = quiet outline or soft surface
- destructive = explicit and rare

### Panels

- same radius family
- same shadow family
- dim side panels
- stronger stage contrast

## Priority Order

### Phase A

- shell stabilization
- top bar ownership cleanup
- chat surface density upgrade
- model picker truthfulness

### Phase B

- sign-in simplification
- store and installed-agent polish
- integrations density cleanup

### Phase C

- usage/admin demotion
- copy pass across all pages
- motion consistency pass

## Renewal Verdict

Empyralis does not need a new visual identity from scratch.
It needs disciplined subtraction, better hierarchy, and tighter information design.

The product already has enough power.
The next win is making it look inevitable.
