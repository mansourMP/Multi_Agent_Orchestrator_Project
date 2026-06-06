# Phase 6 - Aggressive Rust Migration Roadmap

## Strategic verdict

Rust should own the platform kernel. Python should become orchestration and integration glue.

The goal is not to inflate GitHub language statistics. The goal is to move security-sensitive, deterministic, crash-sensitive, and native runtime code into Rust, then retire the replaced Python only after parity is proven.

## Current baseline

Measured from the current worktree source files:

| Language | Lines | Bytes | Estimated GitHub-style percent |
|---|---:|---:|---:|
| Python | 429,666 | 18.04 MB | 79.4% |
| TypeScript | 98,612 | 3.54 MB | 15.6% |
| Rust | 5,287 | 0.18 MB | 0.8% |
| CSS | 27,093 | 0.66 MB | 2.9% |
| Shell | 8,085 | 0.28 MB | 1.2% |

GitHub Linguist is byte-based, not line-based, so these are estimates.

## Target language profile

Aggressive but healthy target:

| Language | Current | Target after migration |
|---|---:|---:|
| Rust | 0.8% | 53-58% |
| Python | 79.4% | 24-32% |
| TypeScript | 15.6% | 11-14% |
| CSS, Shell, JavaScript, Other | 4.2% | 4-6% |

Expected final source shape:

```text
Rust:   300k-360k LOC
Python: 140k-190k LOC
```

To reach Rust above 50%, the project likely needs to convert roughly:

```text
230k-260k Python LOC into 280k-350k Rust LOC
```

Adding Rust without deleting retired Python would require roughly:

```text
450k-650k new Rust LOC
```

That is rejected as padding. Retired Python must be removed once parity is proven.

## Migration principles

- Rust owns the trusted kernel: policy, permissions, sandboxing, execution, queues, state transitions, session limits, and native supervision.
- Python remains for orchestration, provider adapters, API glue, compatibility, and high-level product iteration.
- TypeScript remains the product surface.
- Do not rewrite frontend or mobile as part of Rust migration.
- Do not rewrite random Python modules just to improve language percentages.
- Do not delete Python before a focused parity suite proves the Rust replacement.
- Every Rust replacement must expose deterministic JSON contracts or typed FFI-safe boundaries.
- Every security-sensitive fallback must fail closed.

## Phase 6A - Rust platform kernel foundation

Status: started.

Primary files:

- `empyralis-runtime-kernel/**`
- `server_modules/rust_runtime_kernel_client.py`
- `server_modules/rust_authorization_shadow_service.py`
- `server_modules/session_diagnostics_service.py`
- `server_modules/sage_heartbeat_service.py`
- `server_modules/release_gate_service.py`

Scope:

- Rust CLI kernel with JSON over stdin/stdout.
- Python adapter with command allowlist and fail-closed response handling.
- Rust-owned capability manifest for canonical names, aliases, classes, and risk defaults.
- Rust-owned control-plane record decisions for tenant, workspace, membership, invite, billing, thread, deployed-agent, gateway, session, and run repository operations.
- Rust-owned control-plane service admission for tenant/workspace/thread operations, membership and owner gates, billing entitlements, quotas, webhook intake, public-route changes, emergency stops, audit exports, idempotency, retention locks, and admin writes. The active Python control-plane repository now calls the Rust service gate before workspace profile updates, invite creation, and membership removal.
- Rust-owned deployed-agent lifecycle and runtime-admission decisions for draft, update, deploy, pause, kill, recover, archive, public route, runtime session, and runtime action operations.
- Rust-owned deployed-agent service decisions for draft/create/update/deploy/pause/kill/recover/archive, recovery actions, workspace emergency stop, public routing, Telegram readiness, analytics, admin dashboard, audit export, conversations, memory, activity, external-user privacy deletion, knowledge verification/upload, business insight review/apply, shop evaluation, test turns, runtime-session kill, admin access, data-sensitivity approvals, plan limits, and runtime readiness. The active Python deployed-agent service now calls the Rust service gate before deploy, pause, kill, recover, archive, recovery-action, workspace emergency-stop, and runtime-session kill mutations.
- Rust-owned deployed-agent readiness decisions for live deployment, backing specialist compatibility, customer-live channels, privacy/computer-safety contracts, mode matrix, runtime eligibility, self-hosted binding, and quota controls.
- Rust-owned deployed-agent data and privacy decisions for analytics, audit export, conversation list/detail, customer memory, activity ledger, and external-user deletion.
- Rust-owned deployed-agent virtual-runtime policy decisions for policy payload construction, provider selection, quotas, recording, budgets, cloud tool mapping, forbidden policy overrides, and usage metering.
- Rust-owned deployed-agent virtual-runtime service admission for contract validation, provider selection, cloud/self-hosted/My Computer session binding, runtime tool execution, termination, metering, artifacts, audit events, policy override blocking, fallback, gateway health, self-hosted node readiness, quotas, budgets, recording, and customer-live gates. The active Python service shim now calls the Rust service gate for cloud runtime policy payload construction and bound cloud tool execution.
- Rust-owned runtime run API admission decisions for list, detail, start, turn, stream, cancel, pause, retry, resume, approval, and webhook trigger requests. The active Python runtime run API now calls the Rust gate before the canonical `POST /turn` entry point starts turn execution, before the registered `/runs/{run_id}/resume` and `/runs/{run_id}/pause` mutations, and before registered run approval/decision resolution mutates approval state.
- Rust-owned run approval admission is now active inside the approval service and approval routes for durable approval request creation, run decision submission, registered approval-id resolution, standalone approval resolution, and hardware-runtime approval resolution before Python creates, records, resolves, emits, or resumes approval-driven work.
- Rust-owned run service admission for create/start/turn/dispatch/stream/cancel/retry/resume/approve/reject/finalize/webhook/child-run/delegation operations with runtime health, budget, quota, idempotency, approval, stream, history-window, kill-switch, and finalization gates. The active Python run service now calls the Rust gate before prepared run creation.
- Rust-owned runtime approval decisions for pending approval listing, detail access, request creation, submit/resolve paths, resolution recording, entitlement gates, owner scoping, terminal statuses, expiry, and decision shape.
- Rust-owned run-start preparation decisions for engine, outcome pack, trust mode, execution target, elevated mode, metadata shape, workflow snapshot, app permissions, and delegation metadata.
- Rust-owned run-record persistence decisions for live-run registration, versioned snapshots, transition recording, archive payloads, transition/artifact outbox emission, and local-vs-background activation.
- Rust-owned run routing and execution-boundary decisions for execution target selection, runtime mode compatibility, runtime attachment completeness, local confirmation, delegated child creation, and delegation merge state.
- Rust-owned run trigger decisions for cron schedules, weekly schedules, manual triggers, pending heartbeat schedules, webhook registration, and webhook ingest matching.
- Rust-owned runtime thread and turn record decisions for listing, detail lookup, turn creation, normalization, primary-thread fallback, workspace access, owner scoping, role requirements, pagination, and history-window filtering.
- Rust-owned local companion worker decisions for queue reads, stale cleanup, worker/runtime heartbeat, run claim, run heartbeat, control-state reads, completion, pause, and failure.
- Rust-owned runtime outbox delivery decisions for event persistence, due listing, claim TTL, payload patching, delivery marking, failure retry/backoff, poison handling, poisoned listing, and delivery status.
- Rust-owned approval requirement normalization for scope, TTL, cacheability, and audit visibility.
- Rust-owned request authorization that composes safe-mode, policy, risk, and approval into one decision.
- Rust-owned safe-mode decision for kill switch, incident control, maintenance, profile health, and unsafe capabilities.
- Rust-owned policy preset resolution for YOLO, Cautious, and Deny All.
- Rust-owned execution authorization that composes authorization and execution planning.
- Rust-owned gateway websocket frame admission for frame shape, size, depth, request IDs, duplicate replay, seq/ack monotonicity, connect handshake, protocol version, and scope matching.
- Rust-owned gateway protocol routing for health checks, session lifecycle messages, agent turns, tool calls, and tool results.
- Rust-owned gateway state decisions for pairing intents, gateway registrations, sessions, tokens, events, approvals, browser sessions, outbox summaries, and stale-session sweeps.
- Rust-owned gateway HTTP/action admission for websocket connects, tool execution, browser sessions/actions, approval resolution, ACP turns, diagnostics export, quota, risk, approval, and cloud-fallback gates.
- Rust-owned gateway service admission for route dispatch, tool/browser execution, approval memory, quotas, kill switches, cloud/browser fallback, diagnostics export, policy writes, device trust, and audit visibility. The active Python gateway route layer now calls the Rust service gate before local gateway tool execution and browser-session start execution.
- Rust-owned secret reference inspection for secret metadata, approval, and exfiltration blocking.
- Rust-owned runtime attachment decisions for runtime target normalization, workspace target construction, attachment selection, local companion readiness, self-hosted node gates, allowed-agent checks, concurrency limits, and usage credit-event shape. The active Python runtime attachment service now calls the Rust gate before target inventory construction, runtime usage credit-event creation, hosted/local attachment selection, local companion admission, and self-hosted node admission.
- Rust-owned machine lease admission is now active for local machine lease acquire, release, and runtime-session heartbeat mutations before Python updates local claim maps, dispatches repository claim writes, or refreshes runtime session liveness, including explicit release, recovered-run release reconciliation, stale lease cleanup, and authenticated runtime session touch.
- Rust-owned virtual computer runtime decisions for provider admission, isolation profile quotas, identity isolation, cost/concurrency quotas, computer-use action payloads, network/browser policy, artifact export, and session state gates.
- Rust-owned hosted sandbox execution decisions for workspace preparation, Docker launch posture, mount safety, no-network defaults, environment allowlists, timeout/resource limits, artifact path containment, and cleanup policy.
- Rust-owned execution runtime decisions for engine dispatch, workflow node execution, child-run delegation, connector action admission, external-write idempotency, timeout posture, runtime lease requirements, cancellation/resume/retry/finalize paths, and usage metering.
- Rust-owned runtime API decisions for runtime registration, companion bootstrap, local-worker task claims, runtime task heartbeats/results, self-hosted node enrollment/commands, hardware action execution/stop requests, machine enrollment state, and multimodal runtime requests.
- Rust-owned runtime state-store decisions for live runs, run archives, runtime registrations, runtime sessions, runtime session turns, chat stream state, channel events, local claims, notifications, device delivery, checkpoint snapshots, pruning, SQLite checkpoint boundaries, durable-store availability, version conflicts, retention locks, and destructive state operations.
- Rust-owned session scheduler decisions for lifecycle presets, turn limits, auto-reset, idle pruning, retention windows, quiet-hours status, wake trigger admission, battery/network deferral, event/self-proposed rate limits, retry metadata, retry decisions, permanent failure, and ambient monitor status.
- Rust-owned runtime health decisions for Sage heartbeat/readiness signals, queue pressure, blocked approvals, quiet hours, wake queue pressure, runtime worker health, plugin health, Rust kernel availability, stale snapshots, and operator next actions.
- Rust-owned platform orchestration decisions for tenant/workspace records, thread turns, run create/dispatch/stream/cancel/retry, workflow child runs, delegation merges, gateway routes/tools/browser actions, deployed-agent actions/runtime binding, billing entitlement gates, webhook ingest, chat-stream finalization, workspace access, owner access, quotas, kill switch, safe mode, runtime attachment, history windows, and workflow depth.
- Rust-owned deployed-agent runtime binding decisions for cloud computer, My Computer, self-hosted, and text-only modes, including session reuse, local gateway health, self-hosted node policy, concurrency, filesystem, domain allowlist, and recording requirements.
- Rust-owned deployed-agent runtime action decisions for cloud and self-hosted tool execution, including connector/action mapping, required arguments, raw policy override rejection, kill-state blocking, self-hosted action gate, and computer-proof requirements.
- Default-off diagnostics redaction seam.
- Heartbeat visibility for Rust kernel availability.
- Release gate awareness.

Estimated movement:

```text
Rust added: 5k-10k LOC
Python removed: 0 LOC
Estimated GitHub Rust: 1-2%
```

This phase creates the safe boundary. It is not expected to materially change language percentages.

## Phase 6B - Policy, risk, permissions

Rewrite into Rust-backed kernel modules:

- `server_modules/agent_computer_policy_service.py`
- `server_modules/capability_risk_classifier_service.py`
- `server_modules/policy_presets.py`
- `server_modules/policy_service.py`
- `server_modules/runtime_policy.py`
- `server_modules/safe_mode_service.py`
- `server_modules/secrets_broker.py`

Rust target modules:

- `empyralis-runtime-kernel/src/policy.rs`
- `empyralis-runtime-kernel/src/risk.rs`
- `empyralis-runtime-kernel/src/redaction.rs`
- `empyralis-runtime-kernel/src/path_guard.rs`
- `empyralis-runtime-kernel/src/secrets.rs`
- `empyralis-runtime-kernel/src/approval.rs`

Required parity:

- canonical capability names and aliases;
- capability classes and risk defaults;
- autonomy mode normalization;
- policy presets and aliases;
- capability allow, approval, and deny logic;
- approval scope, TTL, single-use, cacheability, and audit visibility;
- safe-mode, kill-switch, incident-control, and unsafe-capability decisions;
- combined safe-mode-aware authorization response shape for allow, require approval, and block decisions;
- requested domain allowlist enforcement;
- requested filesystem scope and blocked scope enforcement;
- kill switch behavior;
- risk classification;
- secret redaction;
- secret reference inspection;
- path containment;
- audit visibility fields.

Estimated movement:

```text
Python removed/reduced: 15k-25k LOC
Rust added: 25k-40k LOC
Estimated GitHub Rust: 6-10%
Estimated GitHub Python: 72-75%
```

## Phase 6C - Execution and sandbox runtime

Rewrite into Rust-backed execution kernel:

- `server_modules/execution_sandbox_service.py`
- `server_modules/docker_execution_sandbox.py`
- `server_modules/runs_execution.py`
- `server_modules/virtual_computer_runtime.py`
- `server_modules/runtime_attachment_service.py`
- `server_modules/runtime_runtime_api.py`
- `server_modules/runtime_run_approval_service.py`
- `server_modules/machine_lease_service.py`

Rust target modules:

- `empyralis-runtime-kernel/src/sandbox.rs`
- `empyralis-runtime-kernel/src/execution_plan.rs`
- `empyralis-runtime-kernel/src/execution_outcome.rs`
- `empyralis-runtime-kernel/src/execution.rs`
- `empyralis-runtime-kernel/src/process.rs`
- `empyralis-runtime-kernel/src/artifacts.rs`
- `empyralis-runtime-kernel/src/lease.rs`
- `empyralis-runtime-kernel/src/timeouts.rs`

Required parity:

- command execution planning;
- run engine dispatch and workflow execution admission;
- runtime API registration and task lifecycle admission;
- runtime state-store write, delete, archive, checkpoint, retention, and version-conflict admission;
- combined execution authorization response shape;
- process lifecycle start, heartbeat, terminate, cancel, timeout, and cleanup decisions;
- post-execution outcome normalization;
- retryability, output truncation, retention, and audit visibility;
- artifact registration, read, export, delete, size, retention, preview, executable, and secret-like export decisions;
- machine lease acquire, renew, release, heartbeat, capacity, stale, and force-takeover decisions;
- destructive command blocking;
- Docker command construction;
- hosted sandbox execution admission;
- no-network sandbox defaults;
- CPU and memory limit behavior;
- output artifact shape;
- timeout handling;
- approval handoff;
- lease acquisition and release;
- process cancellation.

Estimated movement:

```text
Python removed/reduced: 45k-65k LOC
Rust added: 70k-100k LOC
Estimated GitHub Rust: 18-25%
Estimated GitHub Python: 58-65%
```

## Phase 6D - Queue, state, and session kernel

Rewrite into Rust-backed deterministic state services:

- `server_modules/local_queue.py`
- `server_modules/run_state_repository.py`
- `server_modules/runtime_state_store.py`
- `server_modules/gateway_state_repository.py`
- `server_modules/session_lifecycle_service.py`
- `server_modules/bounded_scheduler_service.py`
- `server_modules/sage_heartbeat_service.py`

Rust target modules:

- `empyralis-runtime-kernel/src/queue.rs`
- `empyralis-runtime-kernel/src/state_store.rs`
- `empyralis-runtime-kernel/src/session.rs`
- `empyralis-runtime-kernel/src/scheduler.rs`
- `empyralis-runtime-kernel/src/heartbeat.rs`

Required parity:

- enqueue, claim, complete, fail, retry, cancel, and release transitions, with active Rust enforcement now gating local queue claim/release and complete/fail before Python moves pending runs into claimed state, mutates terminal local-run state, or removes claimed runs during explicit release, recovered-run reconciliation, and stale cleanup;
- queue claim semantics;
- durable run/session state transitions, optimistic version conflicts, terminal states, and archive behavior;
- session presets, turn limits, age limits, idle pruning, reset, extend, close, and prune decisions;
- composed session scheduler policy for lifecycle presets, auto-reset, idle pruning, retention, quiet-hours, wake triggers, device-state deferral, retry metadata, and permanent failure;
- quiet-hours gating, wake triggers, event/self-proposed rate limits, retry backoff, deferral, and permanent failure;
- lane status transitions;
- retry/backoff state;
- session turn limits;
- idle pruning;
- heartbeat snapshots;
- runtime health/readiness normalization and operator next-action decisions;
- runtime health and next-action heartbeat normalization;
- crash recovery invariants.

Estimated movement:

```text
Python removed/reduced: 45k-70k LOC
Rust added: 70k-110k LOC
Estimated GitHub Rust: 32-42%
Estimated GitHub Python: 43-52%
```

## Phase 6E - Control plane and run orchestration

Rewrite or Rust-back the core run/control plane:

- `server_modules/control_plane_repository.py`
- `server_modules/run_service.py`
- `server_modules/runs_core.py`
- `server_modules/runtime_runs_api.py`
- `server_modules/routes_gateway.py`
- `server_modules/gateway_protocol_service.py`
- `server_modules/deployed_agent_service.py`
- `server_modules/deployed_agent_virtual_runtime_service.py`

Rust target modules:

- `empyralis-runtime-kernel/src/runs.rs`
- `empyralis-runtime-kernel/src/control_plane.rs`
- `empyralis-runtime-kernel/src/runs.rs`
- `empyralis-runtime-kernel/src/gateway.rs`
- `empyralis-runtime-kernel/src/deployed_agents.rs`
- `empyralis-runtime-kernel/src/protocol.rs`

Required parity:

- run creation;
- run create, dispatch, retry, cancel, complete, fail, lane routing, idempotency, budget, runtime, and approval behavior;
- run state transitions;
- gateway protocol translation;
- deployed agent lifecycle;
- virtual runtime contract;
- API response compatibility;
- idempotency and replay behavior.

Estimated movement:

```text
Python removed/reduced: 65k-95k LOC
Rust added: 90k-140k LOC
Estimated GitHub Rust: 45-53%
Estimated GitHub Python: 31-39%
```

## Phase 6F - Test migration and retired Python deletion

This phase is required for Rust to exceed 50% in GitHub language stats.

Current Python tests are large:

```text
Python test/support surface: about 131k LOC
```

Move critical parity and invariant tests to Rust:

- policy/risk parity tests;
- sandbox command tests;
- queue/state transition tests;
- execution lifecycle tests;
- path/secret/security tests;
- supervisor integration tests;
- protocol compatibility fixtures.

Do not move high-level API smoke tests if Python remains the API orchestration layer.

Estimated movement:

```text
Python tests removed/reduced: 70k-100k LOC
Rust tests added: 80k-120k LOC
Estimated final GitHub Rust: 53-58%
Estimated final GitHub Python: 24-32%
```

## Cutover requirements per module

Each migrated module must satisfy all of these before Python is deleted:

- Rust implementation exists.
- Python adapter or API compatibility layer exists.
- Existing public response shape is preserved or intentionally versioned.
- Focused parity tests cover old and new behavior.
- Failure mode is fail-closed for security boundaries.
- Release gate runs Rust tests and adapter tests.
- Heartbeat or diagnostics exposes readiness where operationally useful.
- Retired Python file is removed only after parity proof.

## Explicit anti-goals

- No Rust padding to improve GitHub statistics.
- No partial security rewrite that leaves two contradictory authorities.
- No Python deletion without parity tests.
- No frontend/mobile rewrite under this phase.
- No direct production default switch before the Rust path has burn-in.

## Side-agent instruction

The side agent should use this order:

```text
6A kernel boundary
6B policy/risk/security
6C execution/sandbox
6D queue/state/session
6E control plane/run orchestration
6F test migration/deletion cleanup
```

For each phase, the side agent must produce:

- exact Python files reduced or retired;
- exact Rust files added;
- parity tests added;
- language percentage estimate after the phase;
- rollback path;
- release gate updates.
