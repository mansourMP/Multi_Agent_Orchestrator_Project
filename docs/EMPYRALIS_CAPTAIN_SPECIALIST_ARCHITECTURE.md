# Empyralis Captain And Specialist Runtime Architecture

## Purpose

This document defines the runtime and boundary model for:

- Sage as the personal captain
- specialists as scoped workers
- applications as product modules
- the platform control plane above all of them

This is the authoritative architecture document for that split.

If another plan, memo, or older agent doc conflicts with this paper, this paper wins.

The explicit cross-surface parity contract is defined in [docs/EMPYRALIS_SURFACE_PARITY_CONTRACT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_SURFACE_PARITY_CONTRACT.md).

## Core Thesis

Empyralis is not one giant agent blob.

It is one platform with four explicit layers:

1. personal captain
2. specialist workers
3. applications
4. platform control plane

Those layers cooperate, but they do not collapse into one memory scope, one tool scope, or one runtime boundary.

## Four-Layer Model

### 1. Personal Captain

Sage is the personal captain.

There is one Sage identity per user or workspace context.

Sage is the user's broad, private, policy-bound agent.

Sage owns:

- personal coordination
- broad personal awareness
- personal memory consumption
- delegation to specialists
- review of specialist outputs, summaries, and artifacts
- cross-surface continuity across mobile, desktop-power, local, cloud, and hybrid setups

That continuity does not imply different intelligence on different surfaces. It implies the same Sage under different interaction density.

Sage does not bypass:

- memory policy
- tool brokers
- secret brokers
- runtime placement policy
- approval policy
- kill switches

### 2. Specialist Workers

Specialists are real scoped agents, not thin wrappers.

Each specialist is its own operational worker with:

- install-scoped identity
- install-scoped short-term memory
- install-scoped long-term memory
- scoped tools
- scoped connectors
- scoped artifacts
- scoped runtime policy
- scoped reporting path back to Sage

Specialists are powerful, but they are not broad personal captains.

Their power comes from scoped capability and durable memory inside their install boundary, not from unrestricted access to the user's entire life.

### 3. Applications

Applications are product modules, not the personal brain.

Applications may use:

- APIs
- workflows
- structured backend services
- model calls
- explicit app-to-agent bridges where permitted

Applications do not automatically inherit:

- Sage memory
- specialist memory
- broad personal context
- unrestricted tool access

An education application, finance application, or workflow application can run rich product logic without being treated as the user's personal captain.

### 4. Platform Control Plane

The platform control plane sits above Sage, specialists, and applications.

It owns:

- identity
- workspace and tenant boundaries
- policy
- runtime selection
- memory routing
- tool brokering
- secret brokering
- audit
- activity events
- kill switches and reliability controls

The control plane is the system of record for separation and orchestration.

## Sage Model

Sage is the one private main agent per user or workspace context.

Sage has:

- long-term memory
- short-term and episodic memory
- profile memory
- app and connector history summaries
- retrieval access to allowed personal knowledge
- visibility into specialist outputs, summaries, artifacts, and status

Sage can:

- chat with the user
- coordinate specialists
- recommend runtime placement
- consume cloud-safe summaries from local/private domains when enabled
- reason across phone, desktop, documents, connectors, and recent activity

Sage cannot:

- read every specialist internal state by default
- ignore runtime policy
- ignore brokered tool or secret boundaries
- force applications to route all product logic through chat

## Specialist Model

Each specialist is a real worker with a defined operating boundary.

Each specialist must have:

- install identity
- manifest
- runtime profile
- scoped memory
- scoped tools and connectors
- artifact scope
- reporting contract

Each specialist may:

- maintain its own short-term working state
- maintain install-scoped long-term memory
- create files and artifacts inside its allowed scope
- run durable automated work
- communicate outcomes back through summary and artifact channels

Each specialist must not:

- inherit full Sage visibility
- inherit unrelated specialist memory
- inherit app context outside explicit contract
- gain privileged-device access automatically

## Application Model

Applications are first-class product modules.

They are not:

- hidden specialists
- a second Sage
- a mandatory routing layer for personal chat

Applications may:

- run backend workflows
- call models
- maintain app-owned context and history
- use allowed connectors
- call specialists or Sage only through explicit contracts

Applications must not:

- read personal memory by default
- read specialist memory by default
- become implicit orchestration authorities

The explicit application runtime and bridge contract is defined in [docs/EMPYRALIS_APPLICATION_RUNTIME_CONTRACTS.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_APPLICATION_RUNTIME_CONTRACTS.md).

## Memory Routing Model

Memory visibility must remain explicit.

### Sage Direct Read

Sage may directly read:

- profile memory
- episodic memory
- allowed app and connector history summaries
- allowed notes, documents, and retrieval snippets
- its own captain-level activity summaries

### Sage Summary Or Digest Read

Sage reads these only through summaries, digests, or approved artifact references unless explicitly shared:

- specialist activity history
- specialist-created artifacts
- local-private memory summaries
- app-owned operational history

### Specialist Read

A specialist may directly read only:

- install-scoped memory
- explicitly shared memory
- manifest-allowed retrieval
- scoped artifacts
- scoped connector context

### Application Read

An application may directly read only:

- app-owned history
- user-selected app inputs
- app-owned structured data
- explicit bridges exposed by Sage or specialists

Applications do not read Sage memory or specialist memory by default.

## Runtime And Sandbox Boundary Model

The runtime model has four boundaries:

### Platform Boundary

The platform boundary contains:

- control plane
- policy
- brokers
- audit
- runtime selection
- activity and reliability state

### Sage Boundary

Sage has a broader reasoning boundary than specialists, but remains policy-bound.

Sage can observe across the user's allowed context domain, but all tools, secrets, and runtime actions still resolve through brokers and placement policy.

### Specialist Boundary

Each specialist runs in its own scoped runtime or sandbox boundary.

That boundary owns:

- specialist memory
- specialist tools
- specialist connectors
- specialist artifacts
- specialist runtime mode

This is a real separation boundary, not just a prompt difference.

### Application Boundary

Each application has its own module boundary.

Applications may call backend services, structured workflows, and explicit agent bridges, but they do not become the same thing as Sage or a specialist runtime.

## Local, Cloud, And Hybrid Behavior

The identity model stays constant across all deployments:

- same account
- same workspace
- same Sage identity

### Cloud Sage

Cloud Sage is best for:

- hosted orchestration
- cross-device continuity
- mobile availability
- always-on behavior

### Local Sage

Local Sage is best for:

- local-private memory
- private files and local applications
- local device actions
- privacy-sensitive context

The detailed local companion and Mac mini cluster boundary is defined in [docs/EMPYRALIS_LOCAL_RUNTIME_CLUSTER.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_LOCAL_RUNTIME_CLUSTER.md).

### Hybrid Sage

Hybrid Sage keeps one identity while allowing:

- local-private memory to remain local
- cloud-safe summaries to sync when enabled
- runtime placement to choose local or cloud execution by policy

The detailed hybrid sync and placement contract is defined in [docs/EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md).

### Local Specialists

Specialists may run locally in their own scoped sandboxes when:

- they need local tools
- they need local-private context
- they need local applications or files

### Hosted Specialists

Specialists may run in hosted or self-hosted secure environments when:

- they do not require private local data
- they need always-on behavior
- they serve business workflows or external channels

## Activity And Observability Model

The user must be able to see what agents have been doing.

The activity model must include:

- delegated work
- completed specialist tasks
- blocked or denied actions
- created files and artifacts
- pending approvals
- summaries of important state changes

Sage may consume specialist activity as:

- summary events
- artifact references
- status changes
- review-needed items

The user-facing product model is:

- lightweight daily activity in Notifications
- deeper agent activity and history on desktop-power surfaces
- memory and runtime control depth on desktop-power surfaces

This makes background work legible without exposing raw uncontrolled internals.

The detailed durable event and memory-timeline contract is defined in [docs/EMPYRALIS_AGENT_ACTIVITY_TIMELINE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_AGENT_ACTIVITY_TIMELINE.md).

## Recommended Product Placement

### Mobile Daily Surface

Mobile should surface:

- Sage chat
- quick specialist status
- activity summaries
- approvals
- artifact previews
- pairing

### Desktop-Power Surface

Desktop-power should surface:

- specialist configuration
- deeper activity history
- runtime placement and health
- memory controls
- artifact detail
- policy and debugging depth

## Guardrails

1. Sage is the personal captain, not the same thing as applications.
2. Specialists are operational workers, not hidden app code and not fake wrappers.
3. Applications remain product modules, not the personal brain.
4. One shared identity model must survive cloud, local, and hybrid operation.
5. Local-private memory must be able to remain local.
6. All tool, secret, and runtime access stays brokered and policy-bound.
7. Sage visibility is broad, but not uncontrolled.
8. Specialist power comes from scoped capability plus scoped memory, not from unrestricted inheritance.

## Recommended Runtime Architecture

The recommended model is:

- one personal captain named Sage
- many scoped specialist workers
- separate product applications
- one platform control plane above all of them
- one shared identity across cloud, local, and hybrid
- separate runtime and memory boundaries for captain, specialists, and applications

That is the runtime architecture Empyralis should preserve going forward.
