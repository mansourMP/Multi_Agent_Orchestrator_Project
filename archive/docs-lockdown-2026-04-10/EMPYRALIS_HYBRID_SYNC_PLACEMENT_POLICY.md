# Empyralis Hybrid Sync And Placement Policy

## Purpose

This document defines the hybrid sync and runtime-placement policy for Empyralis.

It answers one question exactly: how one Sage identity spans cloud and local runtimes while preserving privacy, explicit sync, and safe placement of work.

If another note, hybrid sketch, or older deployment memo conflicts with this paper, this paper wins.

## Core Thesis

Hybrid mode is not two brains.

It is one shared platform identity with:

- one account
- one workspace
- one Sage identity
- explicit sync classes
- explicit runtime placement rules

Cloud-only, local-only, and hybrid must keep the same mental model. The difference is placement and sync policy, not identity.

## Hybrid Sync Model

The hybrid sync model has four classes:

- `local_only`
- `sync_allowed`
- `summary_bridge_only`
- `explicit_opt_in`

These classes define what stays local, what may sync, and what may only surface through bounded summaries.

### Local-Only Memory

`local_only` data remains only on the local machine or Mac mini.

Examples:

- private local captain memory
- local specialist-only working state
- local application state that must not leave the device
- raw local notes, files, or retrieval data that the user has not shared

### Cloud-Synced Memory

`sync_allowed` data may sync between local and cloud when policy allows.

Examples:

- cloud-safe profile facts
- selected user knowledge
- selected application state
- explicitly shared artifacts and summaries

Sync is allowed, not mandatory for every class.

### Summary-Only Bridge

`summary_bridge_only` data stays local in full form but may produce bounded cloud-safe summaries.

Examples:

- local-private memory summaries
- specialist outcome summaries
- local artifact summaries
- local review-needed markers

This is the key bridge that keeps hybrid mode coherent without leaking raw private state.

### Explicit Opt-In

`explicit_opt_in` data may sync only after a clear user or workspace policy decision.

Examples:

- sensitive document classes
- local-private notes promoted to cross-device memory
- specific application-owned histories

## Sync Policy Classes

The canonical sync policy classes are:

- `local_only`
- `sync_allowed`
- `summary_bridge_only`
- `explicit_opt_in`

The default posture is conservative:

- private local memory defaults to `local_only`
- cloud-safe shared memory may be `sync_allowed`
- sensitive local activity generally defaults to `summary_bridge_only`

## Runtime Placement Rules

Placement must be explicit.

### Sage In Cloud

Sage should run in cloud when:

- the user needs always-on behavior
- mobile continuity matters
- the task is cloud-safe
- local-only memory is not required

### Sage Local

Sage should run local when:

- the task depends on local-private memory
- the task needs local files, apps, or device actions
- privacy-sensitive reasoning should stay on the device

### Specialist Local

A specialist should run local when:

- it needs local tools
- it needs local-private context
- it needs local files or applications
- it depends on device-scoped connectors or permissions

### Specialist Cloud

A specialist should run cloud when:

- it serves always-on business automation
- it does not need private local context
- it benefits from hosted availability and durable cloud execution

### Self-Hosted Node Preferred

A self-hosted node is preferred when:

- enterprise or customer policy requires customer-controlled compute
- compliance or residency constraints require it
- the workload is hosted-class but should not run on shared managed cloud

## Placement Policy Priorities

The placement rule order is:

1. privacy and sync class
2. required capabilities and connectors
3. local-vs-cloud data dependency
4. availability and always-on requirement
5. user or workspace policy preference

No placement rule may violate sync class or privacy policy.

## Fallback Behavior

Hybrid mode needs explicit degraded behavior.

### Local Offline

When local is offline:

- `local_only` tasks wait, fail closed, or request user action
- `summary_bridge_only` data stays limited to the last synced safe summary
- cloud-safe tasks may continue in cloud if policy allows

### Cloud Unavailable

When cloud is unavailable:

- local Sage and local specialists continue for local-safe work
- local-only and local-capable tasks may continue on device
- cloud-only automations wait or degrade visibly

### Hybrid Degraded Mode

When hybrid is partially degraded:

- placement falls back only within policy-safe boundaries
- no raw private local memory is promoted just to keep continuity
- the user sees summary-level degraded-state signals

## Local / Cloud Summary Bridge

The summary bridge is the coherence layer between local and cloud.

It should carry:

- bounded local-private summaries
- specialist outcome summaries
- artifact summaries
- pending review markers
- selected memory update summaries

It must not carry:

- unrestricted raw local-private memory
- full local specialist internals
- raw private file content unless explicitly shared

## Mobile Interaction

Mobile interacts with hybrid state through:

- Sage continuity
- runtime attachment summaries
- sync-state summaries
- review-needed items
- degraded-mode notices

Mobile should show status and continuity, not become the deep sync-control console.

## Desktop-Power Controls

Desktop-power surfaces manage:

- hybrid sync controls
- placement policy visibility
- runtime attachment management
- local/cloud preference tuning
- explicit opt-in sync classes
- deeper degraded-state review

Desktop-power is the main control surface for hybrid placement and sync behavior.

## Guardrails

1. Cloud-only, local-only, and hybrid must keep one Sage identity model.
2. Private local data must not sync accidentally.
3. Placement policy must be explicit and explainable.
4. Fallback behavior must remain safe rather than silently permissive.
5. Mobile shows continuity and summaries; desktop-power owns deep controls.

## Recommended Hybrid Model

The recommended model is:

- one Sage identity across local and cloud
- explicit sync classes
- explicit placement policy
- summary bridge between local-private and cloud-safe context
- safe degraded behavior when one side is unavailable

That is the hybrid sync and placement policy Empyralis should preserve going forward.
