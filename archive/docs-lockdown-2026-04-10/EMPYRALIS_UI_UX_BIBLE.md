# EMPYRALIS UI/UX BIBLE

Status: final internal doctrine  
Audience: founder, product, design, frontend, codex  
Purpose: define the one correct product shell and interaction model for Empyralis across web, desktop, and mobile

---

## 1. Product Truth

Empyralis is an AI Operating System for authorized digital work.

The visible product is not:
- a workflow builder
- a dashboard collection
- a store-first marketplace
- a pile of specialist apps

The visible product is:
- **one Master Agent: Sage**
- one command center
- one run cockpit
- one install surface for specialists
- one trust model built around approval, audit, and kill control

Everything else is infrastructure.

This means the UI must always communicate:
- one relationship
- one operating surface
- one source of truth
- one layered system, not ten equal-weight tools

---

## 2. The Core Product Model

### 2.1 The visible stack

Empyralis has three visible layers:

1. **Sage**
- the default home screen
- the main conversational operating surface
- the place where users ask, review, approve, and launch work

2. **Runs**
- the system of record for work in motion and work completed
- where the user sees execution, intervention, lineage, artifacts, and failures

3. **Agents**
- the installed specialist layer
- where users manage which specialists exist in the workspace and how they are configured

### 2.2 The supporting stack

These are supporting surfaces, not the face of the product:

- **Store**
  - install new specialist agents and templates
- **Integrations**
  - connect tools, machines, credentials, runtime targets
- **Settings**
  - workspace defaults, policy, account, governance

### 2.3 The hidden stack

These must be demoted or hidden from the default experience:

- workflows
- builder/composer
- raw schedules
- health admin
- control center
- team/admin panels
- setup internals
- execution plumbing

These are either:
- advanced
- enterprise-admin
- internal-only
- or transitional legacy

---

## 3. The Default Home Screen

### Decision

The default home screen is **Sage** at `/`.

There is no debate here.

Do not make `/home` the emotional center of the product.  
Do not make `/agents` the emotional center of the product.  
Do not make `/store` the emotional center of the product.

When a user opens Empyralis, they must land in:
- the master thread
- with the composer ready
- with current workspace context loaded
- with active runs and approvals visible but subordinate

### What the Sage home screen contains

The Sage screen has exactly four jobs:

1. accept a new request
2. show the current conversation and execution context
3. surface live specialist activity when relevant
4. surface trust events when relevant

### What Sage must not contain

- giant marketing copy
- duplicate headers
- fake dashboard cards competing with the composer
- store merchandising
- builder/tooling noise
- overly verbose setup explanations

Sage is an operating surface, not a landing page.

---

## 4. Primary Navigation

### 4.1 Desktop and web primary navigation

The left sidebar primary navigation is exactly:

1. **Sage**
2. **Runs**
3. **Agents**
4. **Store**
5. **Integrations**

The lower utility area is:

1. **Usage**
2. **Account**
3. **Settings**

### 4.2 What gets removed from primary navigation

Remove from primary navigation:

- Home / Overview
- Workflows
- Builder
- Library
- Machines
- Health
- Approvals
- Artifacts
- Control Center
- Solutions
- Team
- Schedules

If these surfaces still exist, they belong:
- inside a parent section
- inside a detail screen
- behind an advanced toggle
- or behind admin-only access

### 4.3 Mobile primary navigation

Mobile gets bottom navigation, not the full desktop sidebar.

Mobile bottom nav:

1. **Sage**
2. **Runs**
3. **Agents**
4. **More**

`More` contains:
- Store
- Integrations
- Usage
- Settings
- Account

Approvals must appear as:
- a badge on Sage
- a badge on Runs
- and a dedicated intervention sheet when urgent

---

## 5. Screen Stack

## 5.1 Primary screens

### Sage
Route:
- `/`

Purpose:
- the default command center
- the one master relationship

Contains:
- conversation thread
- composer
- model/reasoning/trust controls
- live activity stream
- approval cards
- artifact previews
- specialist availability context

### Runs
Routes:
- `/runs`
- `/runs/[id]`

Purpose:
- list all work
- inspect live work
- recover or kill work

Contains:
- run list with strong status hierarchy
- filters for active / blocked / failed / completed
- run detail cockpit
- child-run lineage
- machine target
- interventions
- artifacts
- replay/log/timeline

### Agents
Routes:
- `/agents`
- `/agents/[id]`
- `/agents/[id]/configure`

Purpose:
- manage installed specialists
- configure scope, placement, and trust

Contains:
- installed roster
- status
- placement
- enable/pause
- run/chat action
- configuration switchboard

### Store
Route:
- `/store`

Purpose:
- install templates and first-party specialists

Contains:
- curated catalog
- categories
- capability summaries
- install CTA
- trust/permissions summary

### Integrations
Routes:
- `/integrations`
- `/integrations/connectors`
- `/integrations/credentials`
- `/integrations/machines`
- `/integrations/health`

Purpose:
- connect the environment Sage can act through

Contains:
- tool connectors
- credentials
- machine/runtime targets
- runtime health

## 5.2 Secondary screens

### Usage
Route:
- `/usage`

Purpose:
- cost, tokens, throughput, consumption

This is operational, not emotional.  
It is not a primary nav destination for most sessions.

### Account
Route:
- `/account`

Purpose:
- user identity and sign-in methods

### Settings
Route:
- `/settings`

Purpose:
- workspace behavior and governance

## 5.3 Advanced / hidden screens

These do not belong in the default shell:

- workflow builder
- blueprint composer
- solutions
- schedules
- raw health diagnostics
- raw control center
- setup/session internals
- team/admin internals

These should be reachable only through:
- settings
- admin mode
- enterprise mode
- internal developer mode

---

## 6. Primary vs Secondary vs Advanced

### Primary

These must feel like the actual product:

- Sage
- Runs
- Agents
- Store
- Integrations

### Secondary

These support understanding and operation:

- Usage
- Account
- Settings
- Outputs/artifacts inside run detail
- approvals as a filter/state inside Runs and cards inside Sage

### Advanced

These are power-user and internal:

- Blueprints
- Composer
- workflow graph tooling
- machine diagnostics
- health traces
- raw automation scheduling
- store publishing tools

If the average user sees these too early, the product feels fragmented and exhausting.

---

## 7. Organization Rules By Domain

### 7.1 Chat

Chat belongs only to Sage.

Rules:
- `New chat` and `History` are chat-local controls
- they do not belong in the global top bar
- trust mode and model selection belong near the composer
- activity must render inline in the thread, not in a separate admin rail

### 7.2 Cockpit

The cockpit belongs to Runs.

Rules:
- all hard-kill, intervention, target machine, and child-run lineage lives here
- the cockpit is the one serious “operations surface”
- do not duplicate cockpit state across Overview, Home, or Admin

### 7.3 Approvals

Approvals are not a standalone primary destination.

Rules:
- approval cards appear inline in Sage
- approval state appears in Runs filters and cockpit
- a separate approvals queue can exist, but it is secondary

### 7.4 Installed Agents

Installed agents belong to Agents.

Rules:
- this page shows only what is installed in the current workspace
- no marketplace clutter
- no placeholder copy
- no builder logic

### 7.5 Workflows

Public workflows are demoted.

Rules:
- users do not think in graphs
- workflows are engine assets, not the consumer mental model
- if surfaced at all, call them **Blueprints** or **Studio assets**
- hide them behind advanced or creator mode

### 7.6 Store

The Store exists to install specialists and templates.

Rules:
- no raw plumbing
- every listing should answer:
  - what it does
  - what it needs
  - where it runs
  - what trust level it requires

### 7.7 Artifacts

Artifacts are outputs, not a primary product identity.

Rules:
- artifacts should open naturally from Sage and Runs
- a dedicated artifacts page may exist, but it is secondary
- “Artifacts” is an implementation term; user-facing label should often be **Outputs**

### 7.8 Machines

Machines belong under Integrations.

Rules:
- users should not see “machines” as a separate product
- machine status is environmental capability
- only show machine details when placement or local execution matters

---

## 8. Why The Current Frontend Feels Exhausting

The frontend feels exhausting because it violates five product laws:

### 8.1 Too many equal-weight destinations

The current UI makes:
- chat
- home
- workflows
- builder
- agents
- integrations
- machines
- health
- artifacts
- usage

all feel similarly important.

That destroys hierarchy.

### 8.2 The shell is fighting the route tree

The shell is path-aware and workaround-heavy instead of structurally owning shell routes.

Result:
- nested pages feel disconnected
- inner screens feel like different apps
- active-state logic drifts

### 8.3 Consumer and internal concepts are mixed together

The UI leaks:
- workflows
- execution targets
- trust mode internals
- machine/runtime vocabulary
- builder-era objects

too early and too often.

### 8.4 Too much copy

Many pages explain themselves like prototypes.

Result:
- too many words
- repeated brand naming
- low confidence tone
- weak action hierarchy

### 8.5 Too many duplicated surfaces

Examples:
- runs vs executions
- library vs workflows vs store
- approvals as page vs approvals in run/cockpit
- machine/runtime health spread across multiple screens

That duplication creates fatigue faster than bad colors ever will.

---

## 9. Delete, Merge, Rename, Postpone

### Delete

Delete now:

- public builder surface
- public workflow canvas
- duplicate run detail route if two exist
- placeholder pages that only redirect
- dead shell wrappers

### Merge

Merge into Runs:
- approvals queue
- artifacts access
- run replay
- intervention state

Merge into Integrations:
- connectors
- credentials
- machines
- health

Merge into Agents:
- installed specialists
- agent detail
- switchboard/configuration

Merge into Store:
- public installable templates
- first-party roster

### Rename

Rename:

- `Home` -> remove or absorb into Sage / Runs
- `Artifacts` -> `Outputs` where user-facing
- `Library` -> `Store` if public, `Studio` if advanced
- `Workflows` -> `Blueprints` or hide entirely
- `Builder` -> `Studio` only if creator mode survives

### Postpone

Postpone until the main shell is premium:

- creator marketplace
- public publishing tools
- advanced automation authoring
- solution kits
- team/admin expansion
- raw analytics expansions

---

## 10. Final Interface Doctrine

### 10.1 One primary action per screen

Every screen gets one obvious action:

- Sage: send request
- Runs: inspect / resume / kill active work
- Agents: run or configure installed specialist
- Store: install
- Integrations: connect

If a screen has five competing primary buttons, it is wrong.

### 10.2 No duplicate headlines

Do not stack:
- page title
- repeated section title
- hero heading
- empty-state title

on the same screen unless they are truly different layers.

### 10.3 Keep prose rare

Prefer:
- labels
- short helper text
- chips
- compact status lines

Avoid:
- dense paragraphs
- explanatory filler
- repeated brand naming

### 10.4 The shell must disappear

The shell should feel:
- stable
- quiet
- predictable

No main-stage shaking.  
No nav relocation.  
No floating duplicate controls.

### 10.5 Trust surfaces must feel real

Approvals, interventions, and kill controls must look:
- explicit
- structured
- hardware-serious

Never fake them as chat prose.

### 10.6 Activity is shown, not narrated

DeerFlow-style inline activity is correct:
- muted
- mono
- secondary

It helps users trust the system without turning the thread into a debug console.

---

## 11. Web, Desktop, Mobile Doctrine

### Web

Web is the full orchestration surface.

Contains:
- sidebar
- top bar
- main stage
- right-side inspect/artifact/context panel when needed

### Desktop

Desktop is web plus local authority.

Additional responsibilities:
- show local machine availability
- show permission state
- show runtime/worker state
- allow local execution with higher trust affordances

Desktop should not be a separate product design language.  
It is the same OS shell with local execution privileges.

### Mobile

Mobile is not a shrunk dashboard.

Mobile jobs:
- talk to Sage
- approve/deny
- watch runs
- kill runs
- check outputs

Mobile is for:
- control
- visibility
- intervention

Not for:
- deep configuration
- dense settings
- template authoring

---

## 12. The Template System

### 12.1 Product rule

Templates exist to ship fast without exposing graphs.

The user should experience:
- install template
- choose tools
- choose placement
- choose approval level
- start using it

They should not experience:
- nodes
- edges
- compiler jargon
- workflow schema

### 12.2 Template object model

Every template must include:

- name
- role
- outcome description
- required tools
- optional tools
- default placement
- trust default
- first-run checklist
- examples of what to ask
- generated specialist manifest under the hood

### 12.3 Template install flow

Canonical flow:

1. open Store
2. choose template
3. review capability summary
4. install
5. configure switchboard
6. land in Agents or Sage with it available

### 12.4 First-party template doctrine

First-party specialists should be:

- Sage
- Primal
- Orbit
- Atlas
- Axis

Sage is the face.  
The others are visible as installed specialists, but subordinate.

---

## 13. The Fastest Route To A Premium UI

### 13.1 Do not let AI invent the whole frontend

Use AI as:
- an implementation accelerator
- a refactor engine
- a consistency enforcer

Do not use AI as:
- the primary taste-maker
- the sole layout inventor
- the source of product hierarchy

### 13.2 The fast path

1. Lock the route tree and shell first.
2. Reduce nav to the final five primary destinations.
3. Make Sage premium.
4. Make Runs cockpit serious.
5. Make Agents calm and useful.
6. Make Store install-focused.
7. Collapse integrations into one coherent family.

### 13.3 Reuse proven references

Adopt proven interaction patterns from:
- Linear
- Notion
- OpenAI
- Anthropic
- Vercel-class admin products

Copy:
- density
- action hierarchy
- layer logic
- motion restraint
- card spacing

Do not copy:
- product identity
- feature sprawl
- unnecessary ornament

### 13.4 Build with a template library

Create a strict internal UI kit for:

- page header
- split header with action rail
- data list
- status chip
- right rail
- approval card
- cockpit timeline row
- artifact preview card
- install card
- switchboard section

This is how you ship fast without re-designing every route from scratch.

---

## 14. Final Product Decision

Empyralis is not a builder-first platform.

Empyralis is:
- **Sage first**
- **Runs second**
- **Agents third**
- **Store fourth**
- **Integrations fifth**

Everything else is secondary, advanced, or hidden.

That is the only UI architecture that matches the product truth:

**one AI OS, one visible intelligence, one coherent shell.**
