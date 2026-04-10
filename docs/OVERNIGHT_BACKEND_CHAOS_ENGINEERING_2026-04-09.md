# Overnight Backend Chaos Engineering

Date: 2026-04-09

## Purpose

This is a logical break analysis, not an exploit document.  
The goal is to identify the most likely systemic failure modes and the safest fixes that preserve the current architecture.

## System Zones Reviewed

- control-plane identity and workspace boundaries
- agent turn normalization
- template compiler and compiled artifact lifecycle
- install/run routing
- approvals and interventions
- usage telemetry
- local runtime and hard-kill boundaries

Primary files:

- [server_modules/auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py)
- [server_modules/agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_turn.py)
- [server_modules/template_compiler_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/template_compiler_service.py)
- [server_modules/agent_registry_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_registry_api.py)
- [server_modules/usage_reporting.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/usage_reporting.py)

## Highest-Risk Findings

### 1. `default` fallback leakage is still widespread

Observed pattern:

- many code paths still normalize `tenant_id` or `workspace_id` to `default`
- this remains in auth, runtime context, artifacts, webhook triggers, supervisor client paths, and multiple legacy routes

Why this is dangerous:

- it weakens the multi-tenant migration
- a missing ID can silently become a valid shared namespace
- bugs degrade into cross-workspace data ambiguity instead of failing loudly

Best fix:

- treat missing tenant/workspace IDs as validation failures on production paths
- keep `default` only in explicit local-dev bootstrap paths
- introduce one shared “strict runtime context required” validator

### 2. Control-plane migration is only partially socialized through the app

Observed pattern:

- the control-plane schema is real
- many routes still assume older default workspace behavior
- some product flows still derive context from fallbacks instead of authoritative workspace records

Why this is dangerous:

- new multi-tenant data model can be undermined by older route assumptions

Best fix:

- add request-context middleware or a shared resolver that refuses vacuum execution
- remove ad hoc `or "default"` fallback logic from non-bootstrap surfaces

### 3. Template compiler can accumulate compiled artifact drift

Observed pattern:

- installs persist `compiled_workflow_version_id`
- recompilation can occur on update or forced run
- metadata stores both install config and compiled artifact identifiers

Failure mode:

- install config changes
- compiled artifact partially updates
- run metadata and displayed install state drift apart

Best fix:

- add a deterministic config hash for each install
- persist `compiled_from_hash`
- only trust compiled artifacts whose hash matches the current install configuration
- otherwise mark install “needs_recompile” explicitly

### 4. Hidden workflow version sprawl

Observed pattern:

- the compiler can create hidden workflow artifacts repeatedly
- no obvious lifecycle policy is visible in the reviewed code

Failure mode:

- control plane fills with stale compiled versions
- old installs may continue referencing orphaned or outdated hidden artifacts

Best fix:

- add compiled artifact lifecycle rules:
  - latest active
  - superseded
  - archived
- periodically garbage-collect unreferenced compiled artifacts

### 5. Usage telemetry is not trustworthy enough for a first-class “Usage” narrative

Observed pattern:

- `usage_reporting.py` builds estimated cost records
- cost bands are masked
- precision varies by provider
- the frontend still frames the result like an authoritative usage product

Failure mode:

- user trusts numbers that are partially estimated
- enterprise buyers reject the surface as non-auditable

Best fix:

- explicitly classify metrics as:
  - exact
  - estimated
  - unavailable
- return provenance fields to the frontend
- do not aggregate unlike metric classes as though they were equivalent

### 6. Approval safety is strong, but there is still complexity around pending state races

Observed pattern:

- approvals exist across direct chat, runtime waits, human nodes, and local execution review
- state is streamed and resolved through multiple services

Failure mode:

- duplicate approval cards
- stale approval state after reconnect
- late approval resolving a changed execution plan

Good news:

- there is already explicit plan-hash mismatch handling in local execution approval flows

Best fix:

- normalize every approval source into one canonical approval state machine
- add idempotent approval resolution guarantees per approval ID
- ensure replay after reconnect rebuilds the same single approval state

### 7. Hard-kill is bounded correctly, but user expectations can exceed OS reality

Observed pattern:

- hard kill reaches worker, shell, and Rust supervisor interruption
- already-dispatched HID events cannot be recalled

Failure mode:

- users interpret kill as time-travel rollback instead of “stop subsequent actions”

Best fix:

- keep the current architecture
- improve UI language and audit log wording:
  - stop requested
  - interruption acknowledged
  - subsequent actions prevented

### 8. Install run routing depends on multiple lookups that can fail independently

Observed pattern:

- install
- runtime profile
- compiled workflow
- thread/session context
- turn execution

Failure mode:

- any missing link creates confusing run-start failures

Best fix:

- add a single preflight endpoint or service that verifies:
  - install exists
  - install enabled
  - runtime profile valid
  - compiled artifact current
  - workspace access valid

### 9. Seeded default workspace strategy is practical but not durable enough for production assumptions

Observed pattern:

- first-party seeding bootstrapped a canonical `default` tenant/workspace when the control plane was empty

Failure mode:

- local bootstrap assumptions leak into hosted or multi-tenant deployment practices

Best fix:

- make bootstrap seeding environment-explicit
- fail if a non-development environment lacks a true workspace bootstrap path

### 10. Frontend BFF drift remains a recurring risk

Observed pattern:

- multiple earlier regressions came from BFF routes pointing to old backends or old contract shapes
- the platform has several proxy layers where drift can recur

Failure mode:

- frontend compiles
- user path silently fails because BFF and runtime disagree on contract or destination

Best fix:

- create contract smoke tests for every BFF route family:
  - auth
  - turn
  - approvals
  - store
  - agents
  - usage
  - runs

## Medium-Risk Findings

### 11. Mixed product eras still coexist in route and command surfaces

This is mostly a frontend problem, but it also affects backend expectations through stale workflow- and library-centered paths.

Best fix:

- formally declare deprecated route families and sunset them in phases

### 12. Session identity is stronger now, but cross-surface consistency must be enforced

Observed pattern:

- `master_agent_install_id` support is present
- specialist installs exist

Risk:

- a message or run may still be created without the full intended Sage-context envelope in some older path

Best fix:

- require master-thread context on all primary chat paths
- validate install bindings at the API layer

## Recommended Fix Program

### Phase A

- kill non-bootstrap `default` fallbacks
- add strict request context validation
- add compiled artifact hash/version coherence checks

### Phase B

- normalize approval state machines
- add install run preflight
- add usage provenance typing

### Phase C

- add BFF contract smoke tests
- add compiled artifact lifecycle cleanup
- tighten environment/bootstrap separation

## Chaos Verdict

The backend architecture is fundamentally strong.
The real risks are not catastrophic algorithmic flaws.
They are:

- default fallback leakage
- contract drift
- compiled artifact coherence
- telemetry overclaim
- legacy-path survival

Those are fixable without breaking the current architecture.
