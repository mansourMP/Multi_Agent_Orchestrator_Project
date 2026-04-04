# Empyralis Launch Strategy

## Positioning
Empyralis is an agent operating platform for real work.

It is not positioned as "AGI".
It is not positioned as "an app for everything".
It is positioned as a simple control surface with serious execution underneath:
- direct agent chat
- orchestrated specialist agents
- local and connected execution
- approvals and audit
- artifacts and results

## Product Thesis
The product should look simple and feel calm.
The underlying system should be powerful:
- agents
- skills
- integrations
- local companion
- approvals
- artifacts
- orchestration

The user should not need to understand the engine.
They should only need to express what they want done.

## Launch Wedge
Do not launch to everyone.

Primary launch wedge:
- founders
- operators
- power users
- small teams that need one workspace for:
  - research
  - planning
  - file work
  - browser work
  - approvals
  - repeatable automations

Why this wedge:
- highest tolerance for early rough edges
- strongest immediate value from multi-tool agent workflows
- easiest place to prove time saved
- desktop and mobile both make sense

## Product Surfaces
Core product surfaces:
- Workbench: do something now
- Automations: reusable systems
- Runs: what happened
- Approvals: needs permission
- Agents: ownership and workload
- Artifacts: outputs and files
- Integrations: channels and accounts
- Settings: advanced and system

Desktop role:
- main operator workstation
- local execution host
- execution visibility
- debugging and approval surface

Mobile role:
- control room
- direct agent chat
- notifications
- approvals
- run monitoring
- personal command surface

## Strategic Architecture
Empyralis should be built as four layers:

1. UI layer
- desktop app / web shell
- mobile app
- OS-like product surface

2. Agent layer
- orchestrator
- specialist agents
- direct chat
- delegation
- memory/context

3. Capability layer
- skills
- browser automation
- files
- shell
- screenshots
- spreadsheets
- messaging
- publishing
- media

4. Policy layer
- approvals
- execution scope
- connector ownership
- audit
- trust modes

## What Skills Mean in Empyralis
Skills are not random pages.
Skills are capability packages.

A skill should define:
- name
- purpose
- instructions
- required tools
- optional templates/assets
- expected outputs
- guardrails
- optional UI hooks

Example skills:
- research brief
- spreadsheet cleanup
- booking follow-up
- competitor scan
- study planner
- video clipping
- crypto watchlist

## Near-Term Engineering Priorities
### 1. Skill system
Build a real skill/plugin layer.

Requirements:
- install / enable / disable
- metadata and permissions
- tool requirements
- prompt/instruction package
- optional assets/templates
- runtime loading and routing

### 2. Browser automation
Build Local Execution V2 around browser work.

Requirements:
- page open / navigate
- click / type / extract
- screenshots by page/task
- session handling
- stable artifact trail

### 3. Orchestrator delegation
Strengthen multi-agent orchestration.

Requirements:
- parent run creates child runs
- explicit owner per child
- linked approvals and artifacts
- retry / failure clarity
- result merge back to orchestrator

### 4. Desktop hardening
Make the desktop product the serious default surface.

Requirements:
- local companion health clarity
- permissions guidance
- reconnect / startup reliability
- clean launch UX
- stable wrapper behavior

### 5. Mobile V1
Keep it narrow.

Requirements:
- chat
- approvals
- runs
- artifacts preview
- account/preferences

Do not put full local execution into Mobile V1.

## Launch Phases
### Phase 1: Private alpha
Target:
- 5 to 15 users
- founders / operators / power users

Entry criteria:
- one strong launch wedge
- stable desktop flow
- browser automation usable
- direct agent chat usable
- approvals trustworthy
- artifacts understandable
- orchestration not embarrassing

Goal:
- prove repeated usage
- prove real time saved
- identify the strongest workflow wedge

### Phase 2: Closed beta
Target:
- 30 to 100 users in the same wedge

Entry criteria:
- clear usage pattern from alpha
- better onboarding
- mobile control surface usable
- stable connector routing
- lower failure rate in execution flows

Goal:
- prove retention
- prove one workflow is meaningfully better than alternatives

### Phase 3: Public launch
Entry criteria:
- one wedge is clearly strong
- users return because it saves real work
- trust is growing, not collapsing
- the desktop and runtime experience feel coherent

Goal:
- expand from one wedge outward
- add more skills and specialist workflows without breaking simplicity

## What Not To Do
Do not:
- market it as AGI
- launch to broad general consumers yet
- add endless top-level pages
- add dozens of agents before the system is stable
- confuse skills with pages
- promise "one app for everything" before one wedge is proven

## Working Rules For This Repo
This repo remains the source of truth for the platform.

Current working focus:
1. platform stabilization
2. execution capability
3. orchestration quality
4. desktop product quality
5. mobile as a separate track

When choosing work, prefer:
- reliability over novelty
- capability over extra pages
- clear product model over feature sprawl
- one strong wedge over universal ambition

## Definition of Progress
The platform is progressing correctly if:
- users can tell one agent what to do
- orchestrator can delegate when needed
- execution is visible and trustworthy
- approvals are understandable
- outputs are useful and easy to inspect
- the UI feels like one system
- a power user can get real work done daily
