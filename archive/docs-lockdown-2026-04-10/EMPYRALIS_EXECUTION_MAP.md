# EMPYRALIS EXECUTION MAP

Status: execution map  
Date: 2026-04-10  
Audience: founder, product, design, frontend, backend, mobile, security  
Purpose: translate the universal agent plan into a concrete build sequence with workstreams, dependencies, and done criteria

---

## 1. Mission

Build Empyralis as:

- one master OS: `Sage`
- one universal creation system: the `Forge`
- one universal execution engine: the `Harness`
- many safe, user-created specialists

We do this in a strict order so the system stays:

- secure
- understandable
- mobile-ready
- commercially deployable

---

## 2. Build Doctrine

### 2.1 Non-negotiables

1. No hardcoded specialist categories as the primary model.
2. Sage stays pinned and visually distinct.
3. Specialists are created through the Forge.
4. Inbound channels have one owner only.
5. Specialists are sandboxed by default.
6. Mobile is the primary daily-use surface.
7. Desktop/platform is the primary control surface.
8. Capability is layered, not removed.
9. Thread concurrency is parallel across customers, serialized within each thread.
10. Security and tenant isolation remain enforced at the database and runtime layers.

### 2.2 Workstream order

Always build in this order:

1. data model
2. policy enforcement
3. backend execution contract
4. web control surface
5. mobile channel surface
6. deployment and packaging

---

## 3. Workstreams

There are six workstreams.

### 3.1 Workstream A: Manifest and Forge

Owns:

- agent manifest schema
- Bible versioning
- skill bindings
- connector bindings
- channel bindings
- runtime profile selection
- Forge creation flow

### 3.2 Workstream B: Channel Ownership and Routing

Owns:

- inbound channel uniqueness
- Sage-as-router rules
- direct specialist channel rules
- collision prevention
- external channel dispatch

### 3.3 Workstream C: Runtime Isolation

Owns:

- hosted secure runtime
- local secure runtime
- privileged device runtime
- runtime selection policy
- execution limits

### 3.4 Workstream D: Owner and Customer Views

Owns:

- specialist channel UI
- owner controls
- customer simulator
- quick testing loop
- channel detail UX

### 3.5 Workstream E: Mobile Channel Product

Owns:

- Sage pinned channel list
- specialist channel list
- mobile owner/customer toggle
- approval and supervision UX
- mobile-first conversation model

### 3.6 Workstream F: Scale and Commercialization

Owns:

- concurrency limits
- billing controls
- plan entitlements
- per-workspace quotas
- deployment readiness

---

## 4. Phase Map

## Phase 0: Lock The Contract

### Goal

Freeze the canonical architecture so future work stops drifting.

### Deliverables

- universal manifest schema
- runtime profile enum
- channel ownership model
- owner/customer terminology lock
- mobile vs desktop role separation

### Files / areas

- architecture docs
- manifest types
- backend model definitions
- frontend agent runtime types

### Done criteria

- one manifest shape is agreed
- one channel ownership policy is agreed
- one runtime profile model is agreed

---

## Phase 1: Server-Side Specialist Persistence

### Goal

Move specialist identity from local draft convenience into durable server-side state.

### Build

- create server-side tables for:
  - `agent_manifests`
  - `agent_bible_versions`
  - `agent_skill_bindings`
  - `agent_connector_bindings`
  - `agent_channel_bindings`
  - `agent_runtime_profiles`
- add RLS policies for all of them
- create read/write APIs for manifest lifecycle

### Dependencies

- RLS baseline already exists

### Done criteria

- a specialist can be created, edited, and reloaded after refresh
- local storage is no longer the source of truth
- all reads/writes are tenant-scoped

---

## Phase 2: Exclusive Inbound Ownership

### Goal

Guarantee that one inbound endpoint cannot be actively owned by multiple agents.

### Build

- add DB-level uniqueness for active inbound ownership
- add backend validation errors
- add clear UX error:
  - `This channel already has an inbound owner.`
- support both:
  - Sage-owned front door
  - specialist-owned dedicated endpoint

### Dependencies

- Phase 1 manifest persistence

### Done criteria

- Telegram / WhatsApp / email reuse conflict is rejected
- no two active agents can own the same inbound channel
- channel ownership is visible in Owner mode

---

## Phase 3: Runtime Profile Enforcement

### Goal

Make runtime execution safe and explicit.

### Build

- define runtime profiles in backend and manifest
- enforce:
  - `hosted_secure`
  - `local_secure`
  - `privileged_device`
- add runtime policy gates to execution engine
- add approval gates for privileged actions

### Dependencies

- Phase 1 manifest persistence

### Done criteria

- every specialist has a runtime profile
- hosted secure is the default
- privileged device requires explicit owner action
- runtime profile is visible and editable in Owner mode

---

## Phase 4: Universal Harness Completion

### Goal

Ensure every specialist runs through one manifest-driven operator path.

### Build

- remove remaining specialist-specific runtime branching
- make skill loading come only from the skill registry
- ensure prompt assembly always derives from:
  - mission
  - hard context
  - operational policy
  - skill bindings
  - channel identity
  - runtime profile
- keep reflection shield on all customer-visible replies

### Dependencies

- Phase 1 manifest persistence
- Phase 3 runtime profiles

### Done criteria

- one operator loop serves all specialists
- no hardcoded specialist logic remains in runtime
- policy critic runs before customer-visible output

---

## Phase 5: Forge Completion

### Goal

Make the Forge the only clean way to create specialists.

### Build

- final Forge input flow:
  - name
  - what it does
  - how it should answer
  - what it should know
  - what it can use
  - where it should work
- Sage drafts:
  - Bible
  - skill suggestions
  - connector suggestions
  - channel suggestions
  - runtime suggestion
- optional blueprint import inside the Forge only

### Dependencies

- Phase 1
- Phase 4

### Done criteria

- new specialists are birthed only through the Forge
- Forge emits a complete manifest
- owner is routed directly to Owner mode after creation

---

## Phase 6: Web Specialist UX Completion

### Goal

Finish the desktop/platform specialist workflow.

### Build

- channel rail
- Sage pinned card
- specialist list
- owner/customer toggle
- owner sections:
  - Role
  - Knowledge
  - Skills
  - Channels
  - Test
- advanced sections:
  - Connectors
  - Runtime
  - Policies
  - Logs
  - Metrics

### Dependencies

- Phase 5

### Done criteria

- owner can create, refine, bind, test, and save a specialist from the web shell
- customer simulator uses the latest durable manifest

---

## Phase 7: Mobile Channel Foundation

### Goal

Build the real daily-use product.

### Build

- mobile channel list with Sage pinned
- specialist thread list below Sage
- mobile thread header with:
  - title
  - Owner / Customer View toggle
  - menu
  - upload/add action
- mobile customer thread
- mobile owner panels
- mobile approvals and supervision

### Dependencies

- Phase 5
- Phase 6

### Done criteria

- Sage and specialist channels are usable on mobile
- owner can supervise and test from the phone
- customer thread experience is coherent and fast

---

## Phase 8: External Channel Activation

### Goal

Move specialists from simulator to real public endpoints.

### Build

- Telegram activation
- WhatsApp activation
- email activation
- web chat activation
- inbound routing ledger
- outbound delivery receipts

### Dependencies

- Phase 2
- Phase 3
- Phase 7

### Done criteria

- a specialist can safely own one inbound endpoint
- inbound events route to the correct owner
- channel ownership conflicts are rejected

---

## Phase 9: Concurrency and Plan Controls

### Goal

Handle many customers without serializing the entire business behind one queue.

### Build

- per-thread serialization
- per-agent concurrency control
- per-workspace concurrency limits
- plan-based quotas
- hosted runtime capacity controls

### Dependencies

- Phase 8

### Done criteria

- 50 different customer threads can run in parallel
- one single conversation remains ordered
- quotas degrade gracefully instead of breaking behavior

---

## 5. Ownership Map

### Backend

Owns:

- manifest persistence
- skill registry
- channel binding rules
- runtime policy enforcement
- reflection critic
- concurrency rules

### Frontend web

Owns:

- Forge
- Owner mode
- Customer simulator
- integrations and capability binding
- runs and diagnostics visibility

### Mobile

Owns:

- channel-first UX
- Sage pinned experience
- specialist thread UX
- approvals and supervision

### Security

Owns:

- RLS coverage
- runtime isolation
- channel ownership enforcement
- secret scoping
- approval boundaries

---

## 6. Dependencies That Must Not Be Violated

1. Do not build external channel activation before exclusive ownership enforcement exists.
2. Do not build privileged device execution before runtime profile policy exists.
3. Do not rely on local draft state as the source of truth for production specialists.
4. Do not build mobile around temporary web-local assumptions.
5. Do not weaken tenant isolation for convenience.

---

## 7. Testing Strategy

### 7.1 Backend

Must cover:

- manifest CRUD
- RLS isolation
- channel ownership collision rejection
- runtime profile enforcement
- policy critic behavior
- concurrency scheduling

### 7.2 Frontend web

Must cover:

- Forge creation flow
- owner/customer toggle
- skill binding
- connector binding
- runtime selection
- channel conflict error display

### 7.3 Mobile

Must cover:

- pinned Sage
- specialist thread switching
- owner/customer toggle
- approval flow
- active channel message rendering

---

## 8. What Gets Deferred

Not now:

- giant public marketplace
- blueprint-heavy merchandising
- too many top-level admin pages
- multi-tenant publisher ecosystem
- broad template catalog optimization

Those are later.

First we need:

- creation
- execution
- routing
- supervision
- safety

---

## 9. Milestone Definition

The platform is “properly done” when all of these are true:

1. A user can create any specialist from plain language.
2. Sage drafts the first Bible and manifest.
3. The owner can refine it in a layered control surface.
4. The customer view behaves according to the saved manifest.
5. The specialist can own one real external channel safely.
6. Two specialists cannot reply on the same inbound endpoint.
7. Runtime choice is explicit and enforceable.
8. Multiple customer threads run in parallel.
9. Sage remains the clear master OS.
10. Mobile is strong enough to supervise real work.

---

## 10. Immediate Next Moves

The next correct execution order is:

1. server-side manifest persistence
2. exclusive inbound channel ownership
3. runtime profile enforcement
4. Forge completion
5. mobile channel foundation

That is the sequence that converts the architecture into a real product.
