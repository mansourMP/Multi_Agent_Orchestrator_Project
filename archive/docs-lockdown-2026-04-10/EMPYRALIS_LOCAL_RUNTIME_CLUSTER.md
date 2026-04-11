# Empyralis Local Companion And Mac Mini Runtime Cluster

## Purpose

This document defines the local runtime cluster model for:

- local Sage
- local specialists
- the local runtime supervisor
- local memory stores
- the local artifact bridge

It answers one question exactly: how a local machine or Mac mini becomes a coherent personal runtime cluster without becoming a different product or a vague single-process blob.

If another note, local-runtime sketch, or older deployment memo conflicts with this paper, this paper wins.

## Core Thesis

The local machine is not a special-case product.

It is one deployment mode of the same Empyralis platform:

- same account
- same workspace
- same Sage identity
- same policy system
- same runtime-attachment model

The local deployment must behave like a small runtime cluster with explicit boundaries, not one giant local process with hidden privilege mixing.

## Local Runtime Cluster Model

The local cluster has five required parts:

- local Sage runtime
- local specialist runtimes
- local runtime supervisor
- local memory stores
- local artifact bridge

### Local Sage Runtime

Local Sage is the personal captain running on the local machine or Mac mini.

It owns:

- personal local orchestration
- local-private memory access where allowed
- local summary generation
- local delegation to specialist runtimes
- attachment to the same workspace and Sage identity model used in cloud and hybrid deployments

Local Sage is still policy-bound.

It does not bypass:

- tool brokers
- secret brokers
- runtime placement policy
- safe mode
- kill switches

### Local Specialist Runtimes

Local specialists run as separate scoped runtimes under the same local cluster.

Each local specialist owns:

- install-scoped memory
- install-scoped tools and connectors
- install-scoped artifact scope
- install-scoped runtime policy
- scoped reporting back to Sage

Local specialists are not threads inside Sage memory.

They are separate scoped workers living in the same local cluster.

### Local Runtime Supervisor

The local runtime supervisor is the local control boundary.

It owns:

- worker registration
- start and stop orchestration
- health and heartbeat
- recovery supervision
- device-control boundary enforcement
- runtime attachment identity and trust state

It is the cluster control point, not an alternate product brain.

### Local Memory Stores

Local memory stores keep private context local by default.

They include:

- local-private captain memory
- local specialist-scoped memory
- local app-owned state where applicable
- local retrieval indexes and notes where enabled

Local memory may produce cloud-safe summaries when explicitly allowed, but it does not sync wholesale by default.

The detailed cross-device sync and placement policy is defined in [docs/EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md).

### Local Artifact Bridge

The local artifact bridge exposes locally created outputs safely.

It should support:

- local file creation references
- artifact previews and links
- summary publication to Sage
- user-visible surfacing in activity and review flows

The bridge exposes results and summaries, not unrestricted file-system internals.

## Sandbox Boundaries

The local cluster must preserve three explicit runtime boundaries:

### Sage Sandbox

The Sage sandbox is the local captain boundary.

It may consume broader local-private memory and orchestrate work, but it still uses brokered tools and policy-bound runtime paths.

### Specialist Sandboxes

Each specialist runs in its own scoped sandbox.

That sandbox owns:

- specialist memory
- specialist tools
- specialist connectors
- specialist artifacts
- specialist runtime mode

Specialists must not leak into:

- Sage memory
- other specialist memory
- unrelated local applications

### Application Boundary

Applications remain separate product modules even on the local machine.

They may call local runtimes or local services only through explicit application contracts and brokered runtime access.

## Local Worker Lifecycle

The local worker lifecycle is explicit:

1. `register`
2. `start`
3. `health / heartbeat`
4. `stop`
5. `revoke`
6. `recover`

### Register

Local Sage and local specialists register with the local runtime supervisor and attach to the same workspace identity.

### Start

The supervisor starts the relevant local runtime with its declared scope, tools, and policy.

### Health / Heartbeat

Every local runtime must emit health and heartbeat state so the cluster can detect stale or broken local workers.

### Stop

The supervisor can stop a local runtime cleanly without losing cluster identity semantics.

### Revoke

The local attachment can be revoked without creating a second Sage identity or orphaned specialist authority.

### Recover

Failed local runtimes must be recoverable through explicit restart and stale-worker recovery behavior rather than silent drift.

## Shared Identity And Attachment Model

The Mac mini or local companion attaches to the same logical platform identity as cloud and hybrid modes.

That means:

- same account
- same workspace
- same Sage identity
- same runtime attachment inventory

Attaching a local runtime does not create:

- a second Sage
- a second workspace
- a separate local-only product

## Local-Private Memory Rule

Private local memory stays local by default.

Allowed behaviors are:

- local-only storage
- explicit summary bridge to cloud-safe Sage context
- explicit opt-in sync classes where later policy allows

Disallowed default behavior is:

- automatic sync of full private local memory into cloud stores

## Local Specialist Isolation

Specialists running locally must keep separate:

- tools
- connectors
- memory
- artifacts
- runtime policy

This keeps local business/service specialists strong without letting them inherit the captain boundary accidentally.

## Artifact And Summary Surfacing

Locally created artifacts and summaries must surface back through safe platform paths.

That includes:

- artifact links and previews for the user
- summary publication into Sage-visible activity
- review-needed markers
- attachment to the durable activity model

The user should be able to see local outputs without needing raw shell or file-system inspection.

## Guardrails

1. Local deployment must remain the same platform, not a different product.
2. Local Sage and local specialists must stay explicitly separated.
3. Private local memory stays local by default.
4. Local workers require health, heartbeat, revoke, and recovery semantics.
5. Applications remain separate from local captain and specialist runtimes.
6. Local artifacts surface through safe bridges and summaries, not uncontrolled file dumps.

## Recommended Local Cluster Model

The recommended model is:

- one attached local Sage runtime
- many attached local specialist sandboxes
- one local runtime supervisor
- one local-private memory domain
- one local artifact bridge
- one shared workspace and Sage identity across local, cloud, and hybrid deployments

That is the local runtime cluster architecture Empyralis should preserve going forward.
