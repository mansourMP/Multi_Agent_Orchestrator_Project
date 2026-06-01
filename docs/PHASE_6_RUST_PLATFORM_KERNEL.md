# Phase 6 - Rust Platform Kernel

For the full aggressive migration target, see `docs/PHASE_6_AGGRESSIVE_RUST_MIGRATION_ROADMAP.md`.

## Verdict

Rust is the right move for the platform kernel, not for a blind rewrite of the whole Python backend.

The safe path is to move deterministic, security-sensitive enforcement into Rust while keeping Python as the orchestration layer until parity is proven.

## Scope

Phase 6A starts with a standalone Rust crate:

- `empyralis-runtime-kernel/Cargo.toml`
- `empyralis-runtime-kernel/src/main.rs`
- `empyralis-runtime-kernel/src/policy.rs`
- `empyralis-runtime-kernel/src/risk.rs`
- `empyralis-runtime-kernel/src/sandbox.rs`
- `empyralis-runtime-kernel/src/path_guard.rs`
- `empyralis-runtime-kernel/src/redaction.rs`
- `empyralis-runtime-kernel/src/protocol.rs`

Python integration starts with:

- `server_modules/rust_runtime_kernel_client.py`
- `server_modules/rust_authorization_shadow_service.py`

## Commands

The Rust kernel exposes a small JSON-over-stdin CLI:

- `validate-policy`
- `policy-preset`
- `capability-manifest`
- `control-plane-decision`
- `control-plane-service-decision`
- `deployed-agent-decision`
- `deployed-agent-service-decision`
- `deployed-data-decision`
- `deployed-readiness-decision`
- `deployed-virtual-runtime-decision`
- `deployed-virtual-runtime-service-decision`
- `approval-requirement`
- `artifact-policy`
- `authorize-request`
- `authorize-execution`
- `classify-risk`
- `build-sandbox-command`
- `sandbox-execution-decision`
- `execution-plan`
- `execution-runtime-decision`
- `execution-outcome`
- `gateway-action-decision`
- `gateway-frame-decision`
- `gateway-service-decision`
- `gateway-protocol-decision`
- `gateway-state-decision`
- `heartbeat-snapshot`
- `local-worker-decision`
- `machine-lease-decision`
- `outbox-delivery-decision`
- `platform-orchestration-decision`
- `process-lifecycle-decision`
- `queue-transition-decision`
- `safe-mode-decision`
- `scheduler-decision`
- `session-lifecycle-decision`
- `session-scheduler-decision`
- `state-transition-decision`
- `thread-record-decision`
- `virtual-computer-decision`
- `check-path-containment`
- `redact-diagnostics`
- `run-api-decision`
- `run-approval-decision`
- `run-preparation-decision`
- `run-record-decision`
- `run-routing-decision`
- `run-service-decision`
- `run-trigger-decision`
- `run-orchestration-decision`
- `runtime-action-decision`
- `runtime-attachment-decision`
- `runtime-binding-decision`
- `runtime-health-decision`
- `runtime-session-api-decision`
- `runtime-state-store-decision`
- `inspect-secret-reference`

Every command writes structured JSON to stdout.

## Safety requirements

- Fail closed when policy input is missing, malformed, or unknown.
- Preserve existing Python implementations until parity tests pass.
- Return `decision: "block"` for unavailable or failed Rust execution from Python.
- Do not grant broad shell access from the Rust kernel.
- Do not follow unsafe filesystem paths outside allowed roots.
- Keep Docker sandbox construction deterministic and isolated.
- Redact secrets recursively before diagnostics leave the runtime boundary.

## Migration rule

Do not delete Python services in Phase 6A.

The Rust crate is introduced as an audited enforcement kernel. Python calls it through the adapter, compares behavior, and only then can individual Python enforcement functions be replaced.

## Side-agent implementation goal

Use the branch `codex/rust-platform-kernel-phase-6`.

Implement and harden the Rust kernel without refactoring unrelated UI or orchestration files.

Allowed files for Phase 6A:

- `empyralis-runtime-kernel/**`
- `server_modules/rust_runtime_kernel_client.py`
- `server_modules/release_gate_service.py`
- `docs/PHASE_6_RUST_PLATFORM_KERNEL.md`

Do not touch in Phase 6A without explicit review:

- `server_modules/direct_chat_generation_service.py`
- `server_modules/execution_sandbox_service.py`
- `server_modules/agent_computer_policy_service.py`
- `server_modules/capability_risk_classifier_service.py`
- `empyralis-supervisor/**`
- `frontend/**`
- `mobile/**`

Reason: these are production runtime paths or user-facing surfaces. The Rust kernel must prove parity first.

Required behavior:

- `capability-manifest` exposes canonical capability names, aliases, risk defaults, and capability classes.
- `control-plane-decision` normalizes durable tenant, workspace, membership, invite, billing, thread, deployed-agent, gateway, session, and run record reads/writes, scope requirements, terminal-record locks, destructive-operation approvals, and status transitions.
- `control-plane-service-decision` composes tenant/workspace/thread/repository service operations, membership and owner gates, billing entitlements, quota updates, webhook intake, public-route changes, emergency stops, audit exports, idempotency, retention locks, and admin writes into a Rust-owned control-plane service admission decision. The Python control-plane repository now calls this Rust gate before workspace profile updates, workspace invite creation, and workspace membership removal. The workspace AI route service now also requires the canonical Rust-selected `apply_control_plane_write` action before it mutates workspace default AI route provider state.
- `deployed-agent-decision` normalizes deployed-agent draft, update, deploy, pause, kill, recover, archive, public routing, runtime-session, and runtime-action decisions, including privacy contracts, computer-safety contracts, runtime binding, kill-switch, budget, approval, and raw policy override gates.
- `deployed-agent-service-decision` normalizes the wider deployed-agent service surface for draft/create/update/deploy/pause/kill/recover/archive, recovery actions, workspace emergency stop, public routing, Telegram readiness, analytics, admin dashboard, audit export, conversations, memory, activity, external-user privacy deletion, knowledge verification/upload, business insight review/apply, shop evaluation, test turns, runtime-session kill, admin access, data-sensitivity approvals, plan limits, and runtime readiness. The Python deployed-agent service now calls this Rust gate before deploy, pause, kill, recover, archive, recovery-action, workspace emergency-stop, and runtime-session kill mutations.
- `deployed-data-decision` normalizes deployed-agent data and privacy access for analytics, audit export, conversation list/detail, customer memory, activity ledger, and external-user deletion, including tenant/workspace/agent scope, admin role, sensitive-data approval, audit export approval, retention lock, and verified privacy-delete gates.
- `deployed-readiness-decision` normalizes deployed-agent publish/update readiness, including state transitions, backing specialist requirements, tenant/workspace scope matching, live-channel support, customer-live readiness, privacy acceptance, computer-safety contracts, mode capability matrix, runtime eligibility, self-hosted binding, and workspace quota gates. The Studio deployed-agent test-turn service now requires the exact Rust-selected `execute_studio_test_turn` action before it continues into private test execution.
- `deployed-virtual-runtime-decision` normalizes deployed-agent virtual runtime policy payloads, provider selection, session quotas/timeouts, cloud tool-action mapping, forbidden policy override detection, recording requirements, budget requirements, kill-state blocking, and usage-metering decisions.
- `deployed-virtual-runtime-service-decision` composes deployed-agent virtual runtime service admission for contract validation, provider selection, cloud/self-hosted/My Computer session binding, runtime tool execution, termination, metering, artifact handling, audit events, policy override blocking, fallback, gateway health, self-hosted node readiness, quotas, budgets, recording, and customer-live gates. The Python deployed virtual-runtime service now calls this Rust gate before policy payload construction and bound cloud-runtime tool execution.
- `approval-requirement` normalizes approval scope, TTL, single-use behavior, cacheability, audit visibility, and the canonical approval `next_action`. The Python agent-computer approval decision service now delegates approval-card normalization to this Rust command, requires the exact Rust-selected `request_owner_approval` action before building an approval card, and preserves the existing approval response shape.
- `artifact-policy` normalizes artifact registration, read, export, delete, retention, preview, size, executable, and secret-like export decisions.
- `authorize-request` composes safe-mode, policy, risk, and approval primitives into one Rust-owned allow/approval/block decision. The canonical Python tool-policy evaluator now delegates final tool admission to this Rust command, requires the exact Rust-selected `allow_tool_execution` or `request_tool_execution_approval` action before translating the result into the legacy `execution_decision` / `decision` fields, and fails closed on unexpected Rust actions.
- `authorize-execution` composes authorization and execution planning into one Rust-owned execution decision.
- `safe-mode-decision` normalizes kill-switch, incident-control, maintenance, profile health, and unsafe-capability safe-mode decisions. The Python safe-mode service now loads scoped operator-control state and delegates final capability disable/allow classification to this Rust command.
- `policy-preset` resolves YOLO, Cautious, and Deny All presets plus safe aliases. The Python preset module now delegates preset application to this Rust command and only normalizes the returned policy into the existing `AgentComputerPolicy` compatibility shape.
- `validate-policy` accepts a policy object and optional capability, normalizes policy mode and capability aliases, enforces requested domain/path scope, and blocks unknown capability requests. The Python agent-computer policy evaluator now delegates request allow/block/approval decisions to this Rust command and only translates the result into the existing `AgentComputerPolicyDecision` shape.
- YOLO mode may fast-path approved capabilities, but it must not bypass explicit blocked capabilities, domain scope, or filesystem scope.
- `classify-risk` computes risk level and approval requirements, blocks kill-state and unhealthy-profile requests, and treats secret-like payloads as critical. The Python capability-risk classifier now delegates allow/block/approval decisions to this Rust command, requires the exact Rust-selected `allow_capability_execution`, `request_capability_risk_approval`, or `block_capability_execution` action before translating the result into the existing `CapabilityRiskDecision` response shape, and fails closed on unexpected Rust actions.
- `execution-plan` normalizes command execution limits, sandbox requirement, network posture, and destructive command blocking.
- `execution-runtime-decision` normalizes run engine dispatch, workflow node execution, child-run delegation, connector action admission, external-write idempotency, timeout posture, runtime lease requirements, cancellation/resume/retry/finalize paths, and usage metering. The Python run execution path now calls this Rust gate before dispatching a run into an engine, before executing the engine body, and before terminal status mutation, and the shared runtime helper now requires the exact Rust-selected `next_action` for dispatch, execute, connector, usage-metering, and finalize operations instead of accepting a generic allow result.
- `execution-outcome` normalizes post-execution status, retryability, output previews, secret-output detection, retention, and audit visibility. The Python Docker sandbox result adapter now delegates hosted-worker outcome classification to this Rust command before returning parsed worker output.
- `gateway-action-decision` normalizes gateway HTTP/action admission for websocket connects, tool execution, browser sessions, browser actions, approval resolution, ACP turns, diagnostics export, kill-switch, quota, capability-disable, risk, approval-memory, and cloud-fallback gates.
- `gateway-frame-decision` normalizes gateway websocket frame admission for frame shape, size, nesting depth, request IDs, duplicate frame replay, sequence/ack monotonicity, first-frame connect requirements, protocol version, and registration scope matching.
- `gateway-service-decision` composes gateway route, tool, browser, approval-memory, quota, kill-switch, fallback, diagnostics, policy-write, trust, and audit admission into a service-level Rust decision. The Python gateway route layer now calls this Rust gate before local gateway tool execution and local browser-session start execution.
- `gateway-protocol-decision` normalizes gateway health checks, session create/close messages, agent turns, tool calls, tool results, authentication gates, route selection, and privileged-tool approval handoff.
- `gateway-state-decision` normalizes local gateway pairing, registration, session issue/validation/connect/disconnect/touch, token rotation, registration revoke/state updates, event writes, approval records, browser-session records, outbox summaries, and stale-session sweeps. The local gateway state repository now calls this Rust gate before session issue/connect/disconnect/touch mutations, token rotation, registration revoke/state mutations, event inserts, approval create/resolve mutations, and browser-session upserts, and its shared helper now requires the canonical Rust-selected gateway-state action for those repository operations instead of accepting a generic allow result.
- `heartbeat-snapshot` normalizes runtime health, queue/session/scheduler status, and next operational action.
- `local-worker-decision` normalizes local companion queue and worker admission for queue reads, stale cleanup, worker/runtime heartbeat, run claim, run heartbeat, run control-state reads, completion, pause, and failure, including local companion enablement, cleanup approval, worker identity, specialist identity, permission probe, claim, active-state, result, pause reason, and error gates.
- `machine-lease-decision` normalizes acquire, renew, release, and heartbeat decisions for machine/runtime leases.
- `outbox-delivery-decision` normalizes runtime outbox event persistence, due listing, claiming, payload patching, delivery marking, failure retry/backoff, poisoning, poisoned listing, and delivery status decisions. The Python outbox service now calls this Rust gate before outbox event persistence, due-event claims, delivery marking, retry deferral, failure recording, and poison transitions. The durable run-state repository now calls the same Rust gate before outbox persist, due-claim, payload patch, delivered marking, and failure/poison SQL mutations, so direct repository callers cannot bypass outbox delivery admission.
- `platform-orchestration-decision` normalizes Phase 6E control-plane and run orchestration admission across tenant/workspace records, thread turns, run create/dispatch/stream/cancel/retry, workflow child runs, delegation merges, gateway routes/tools/browser actions, deployed-agent actions/runtime binding, billing entitlement gates, webhook ingest, chat-stream finalization, workspace access, owner access, quotas, kill switch, safe mode, runtime attachment, history windows, and workflow depth.
- `process-lifecycle-decision` normalizes start, heartbeat, terminate, cancel, timeout, and cleanup decisions for process/run lifecycle.
- `queue-transition-decision` normalizes enqueue, claim, complete, fail, retry, cancel, and release transitions for runtime queues. The active local queue path now calls this Rust gate before Python moves pending runs into claimed state, completes/fails claimed local runs, cancels stale queued runs during operator cleanup, or removes claimed runs during explicit release, recovered-run reconciliation, and stale cleanup. The durable run-state repository now calls this Rust gate before local claim acquire, heartbeat-renewal, and release row mutations, so direct claim repository callers cannot bypass queue admission.
- `scheduler-decision` normalizes quiet-hours gating, wake triggers, event/self-proposed rate limits, retry backoff, deferral, and permanent failure.
- `session-lifecycle-decision` normalizes session presets, turn limits, age limits, idle pruning, reset, extend, close, and prune decisions. The Python session lifecycle service now calls this Rust decision for max-turn admission, prune-candidate eligibility, and enforced prune/terminate admission before Python terminates runtime sessions, and it now requires the canonical Rust-selected lifecycle action for turn admission and prune operations instead of accepting a generic allow result.
- `session-scheduler-decision` composes lifecycle presets, turn limits, auto-reset, idle pruning, retention windows, quiet-hours status, wake trigger admission, battery/network deferral, event/self-proposed rate limits, retry metadata, retry decisions, permanent failure, wake-queue claim/finalize transitions, and ambient monitor status into one Rust-owned session/scheduler policy decision. The bounded scheduler now calls this Rust gate before wake request append, due-wake claim, wake finalize, retry scheduling, and permanent-failure status updates, and it now requires the exact Rust-selected `next_action` for those wake and retry operations instead of accepting a generic allow result. The durable control-plane scheduler wake-request repository also calls this Rust gate before append, due-claim, finalize/status-update, retry, and permanent-failure SQL mutations, so direct repository callers cannot bypass scheduler admission.
- `state-transition-decision` normalizes durable run/session state transitions, terminal states, version conflicts, and archive behavior.
- `thread-record-decision` normalizes runtime thread and turn listing, detail lookup, turn creation, record normalization, primary-thread fallback, workspace access, owner scoping, role requirements, pagination, and history-window filtering.
- `virtual-computer-decision` normalizes virtual computer provider admission, isolation profile quotas, identity isolation, cost/concurrency quotas, computer-use action payloads, network/browser policy, artifact export, and session state gates. The cloud-computer adapter now calls this Rust gate before action payload execution, URL/network actions, screenshot artifact export, provider/session creation, quota/isolation admission, and virtual session termination.
- `build-sandbox-command` emits Docker arguments with `--read-only`, `--network none`, `--cap-drop ALL`, tmpfs mounts, and `no-new-privileges`. The Python Docker sandbox command builder now delegates argv construction to this Rust command before hosted worker launch.
- `sandbox-execution-decision` normalizes hosted sandbox preparation, Docker launch posture, mount safety, no-network defaults, environment allowlists, timeout/resource limits, artifact path containment, and cleanup policy. The Python hosted sandbox service now calls this Rust gate before preparing the sandbox workspace and before launching Docker, sandbox-exec, or subprocess hosted workers.
- `check-path-containment` canonicalizes paths and allows only paths under explicit allowed roots. The Python agent-computer policy evaluator now delegates explicit filesystem-scope containment checks to this Rust command before returning legacy policy decisions.
- `redact-diagnostics` recursively redacts sensitive keys and token-like strings.
- `run-api-decision` normalizes run HTTP/API admission for list, detail, start, turn, stream, cancel, pause, retry, resume, approval, and webhook trigger requests, including workspace access, owner access, history-window, kill-switch, entitlement, budget, local execution, browser execution, sensitive payload, and webhook-signature gates. The Python runtime run API now calls this Rust gate before the canonical `POST /turn` entry point starts turn execution, before the registered `/runs/{run_id}/resume` and `/runs/{run_id}/pause` mutations, and before registered run approval/decision resolution mutates approval state. The shared `turn_ingress_service.py` boundary now also requires Rust-selected `start_turn` or `start_run` next actions before `agent_turn(...)` or durable run-start execution continues, so non-route callers cannot bypass the canonical run-api admission contract. The shared `runtime_run_replay_service.py` boundary now also requires Rust-selected `get_run` before replay payload export and Rust-selected `start_run` before archived replay requests can launch a new run, so replay read and replay execute paths no longer rely only on route wrappers. The shared `runtime_run_control_service.py` boundary now also requires Rust-selected `resume_run` or `pause_run` before paused-run resume or takeover pause mutations continue, so those helpers no longer depend only on route-level admission. The shared `runtime_run_query_service.py` boundary now also requires Rust-selected `get_run` before live or archived run detail is returned, and before browser checkpoint or browser session payload builders run, with browser state reads failing closed on Rust owner-approval results. The shared `runtime_run_entry_service.py` stream helper now also requires Rust-selected `get_run` before live run log streaming opens, and fails closed on Rust owner-approval or unexpected-action results. The shared `runtime_history_service.py` boundary now also requires Rust-selected `list_runs` for workspace-scoped history reads before it scans archived history, so `/history/runs?workspace_id=...` no longer relies only on route-level access checks. The shared `runtime_usage_service.py` snapshot collector now also requires Rust-selected `list_runs` for each real accessible workspace before it scans live or archived usage-bearing runs for non-admin callers, so usage summary and usage runs no longer rely only on caller-side filtering. The shared `runtime_run_resume_service.py` scheduler now also requires Rust-selected `resume_run` before it requeues restored runs or restarts local worker threads, so post-approval or post-restart resume scheduling no longer relies only on higher-level callers.
- The shared `direct_chat_stream_response_service.py` boundary now also requires Rust-selected `stream_chat -> start_chat_stream` before it opens a live direct-chat SSE stream, so direct chat stream entry no longer depends only on higher-level request resolution before execution begins.
- The registered `GET /runs/{run_id}/replay` route now also consumes `run-api-decision` with `get_run -> get_run | request_owner_approval` before it forwards replay export to the shared handler, so replay payload export no longer bypasses the route-layer sensitive-read contract.
- The registered `POST /runs/{run_id}/replay` route now also consumes that same `get_run` route-layer contract before it forwards replay start to the shared handler, so replay execution no longer bypasses sensitive-read admission while loading the archived replay payload.
- `run-approval-decision` now gates runtime approval-service and approval-route mutation points, including durable approval request creation, run decision submission, registered approval-id resolution, standalone approval resolution, and hardware-runtime approval resolution, before Python creates, records, resolves, emits, or resumes approval-driven work.
- `run-approval-decision` normalizes runtime approval listing, pending-item filtering, detail access, approval request creation, submit/resolve paths, resolution recording, workspace entitlement, owner scoping, privileged access, terminal approval status, expiry, and resolution decision shape.
- `run-preparation-decision` normalizes run-start preparation admission for engine, outcome pack, trust mode, execution target, elevated mode, max iterations, metadata shape, workflow snapshot, app permissions, parent/delegation IDs, and elevated-approval requirements.
- `run-record-decision` normalizes live-run record creation, versioned snapshot writes, transition records, terminal archive payloads, transition outbox events, artifact outbox events, and local-vs-background activation decisions. The shared run execution handle now requires the exact Rust-selected `create_live_run_initial` and `update_live_run_if_version_matches` actions before live-run registration and durable snapshot persistence continue.
- `run-routing-decision` normalizes run execution-boundary, routing-preview, local-confirmation, delegated-child, and delegation-merge decisions, including execution-target/runtime-mode compatibility, runtime attachment completeness, local machine target requirements, workflow snapshot requirements, local precheck approval/block decisions, workflow depth, and parent/child merge state.
- `run-routing-decision` normalizes run execution-boundary, routing-preview, local-confirmation, delegated-child, and delegation-merge decisions, including execution-target/runtime-mode compatibility, runtime attachment completeness, local machine target requirements, workflow snapshot requirements, local precheck approval/block decisions, workflow depth, and parent/child merge state. The shared `runtime_run_delegation_service.py` boundary now requires Rust-selected `create_delegated_child_run` before manual or auto child-run creation continues, and Rust-selected `retry_failed_children` before failed child retries proceed, so delegation helpers no longer rely only on downstream run-start gates.
- `run-service-decision` composes user-facing run lifecycle admission for create/start/turn/dispatch/stream/cancel/retry/resume/approve/reject/finalize/webhook/child-run/delegation operations, including runtime health, budget, quota, idempotency, approval, stream, history-window, kill-switch, and finalization gates. The Python run service now calls this Rust gate before prepared run creation, and the create path now requires the exact Rust-selected `create_run_record` or `request_run_service_approval` action before Python persists the new run.
- `run-trigger-decision` normalizes schedule, weekly schedule, pending heartbeat, webhook registration, and webhook ingest admission, including schedule shape, cron/weekly requirements, timezone, run request presence, schedule trigger, scheduler enabled, webhook pattern/workflow requirements, and trigger-match gates.
- `run-orchestration-decision` normalizes run create, dispatch, retry, cancel, complete, fail, lane routing, idempotency, budget, runtime, and approval behavior.
- `runtime-action-decision` normalizes deployed-agent cloud and self-hosted runtime action admission, including runtime binding, mode matching, required scope IDs, supported connector/action mapping, required action arguments, policy override blocking, kill-state blocking, self-hosted node action gate, and computer-proof requirements. The hardware action broker now calls this Rust gate before cloud-computer runtime-session creation or dispatch, and the self-hosted adapter calls it after real node inventory/gate resolution but before approval/session mutation or command enqueue, and now requires the canonical Rust-selected `execute_self_hosted_runtime_action` action before continuing, so internal broker callers cannot bypass Rust by skipping the FastAPI runtime route.
- `runtime-attachment-decision` normalizes runtime target IDs, workspace runtime target construction, attachment selection, local companion readiness, self-hosted node gates, allowed-agent checks, concurrency limits, and runtime usage credit-event shape. The active Python runtime attachment service now calls this Rust gate before target inventory construction, runtime usage credit-event creation, hosted/local attachment selection, local companion admission, and self-hosted node admission.
- `machine-lease-decision` now gates local machine lease acquire, release, and runtime-session heartbeat mutations before Python updates local claim maps, dispatches repository claim writes, or refreshes runtime session liveness, including explicit release, recovered-run release reconciliation, stale lease cleanup, and authenticated runtime session touch.
- `runtime-binding-decision` normalizes deployed-agent runtime session binding for text, cloud computer, My Computer, and self-hosted modes, including required identities, existing-session reuse, mode/binding compatibility, local gateway health, self-hosted binding contract, workspace match, node gate, allowed-agent, concurrency, filesystem, domain allowlist, and recording gates.
- `runtime-health-decision` normalizes Sage heartbeat/readiness signals, queue pressure, blocked approvals, quiet hours, wake queue pressure, runtime worker health, plugin health, Rust kernel availability, stale snapshots, and operator next actions. The Sage heartbeat service now sends the assembled heartbeat snapshot inputs through this Rust decision, requires the Rust-selected operator `next_action` to be one of the canonical runtime-health actions, and exposes Rust-owned `health`, `readiness`, `operator_next_action`, and the full runtime-health envelope in the existing snapshot.
- `runtime-session-api-decision` normalizes runtime registration, companion bootstrap, runtime start/stop/recover/revoke/heartbeat, local-worker task claims, runtime task heartbeats/results, self-hosted node enrollment/commands, hardware action execution/stop requests, machine enrollment state, machine-control mutations, run hard-kill, and multimodal runtime requests. The Python runtime API now calls this Rust gate before hardware action execute/stop requests reach the hardware action broker, before self-hosted command enqueue/claim/result repository mutations, before local runtime registration/bootstrap/start/stop/recover/revoke/heartbeat mutations, before machine delete/suspend/resume/hard-kill or run hard-kill mutations touch local runtime state, and before local runtime task claim/heartbeat/control-state/complete/pause/fail operations mutate or read protected local-run state.
- `runtime-state-store-decision` normalizes runtime state-store writes for live runs, run archives, runtime registrations, runtime sessions, runtime session turns, chat stream state, channel events, local claims, notifications, device delivery, checkpoint snapshots, pruning, SQLite checkpoint boundaries, durable-store availability, version conflicts, retention locks, and destructive state operations. The durable run-state repository now calls this Rust gate before live-run upsert/create/versioned-update writes and before run archive writes. The local SQLite runtime state store now calls the same Rust gate before runtime-session writes/deletes, runtime-session-turn writes/deletes, and live-run checkpoint writes using an explicit `storage_engine=local_sqlite` contract.
- `inspect-secret-reference` detects secret-like names or values, redacts values in output, normalizes high-risk credential approval requirements from provider/connector metadata, and blocks exfiltration-style actions. The Python secrets broker now delegates connector/provider credential approval classification to this Rust command, requires the exact Rust-selected `allow_secret_resolution` or `request_secret_access_approval` action before returning projected secret payloads, and fails closed on unexpected Rust actions.

Validation target before wiring into production paths:

```bash
cargo fmt --manifest-path empyralis-runtime-kernel/Cargo.toml
cargo test --manifest-path empyralis-runtime-kernel/Cargo.toml
python3 -m py_compile server_modules/rust_runtime_kernel_client.py server_modules/session_diagnostics_service.py server_modules/release_gate_service.py
python3 -m pytest server_modules/tests/test_rust_runtime_kernel_client.py server_modules/tests/test_rust_diagnostics_redaction.py server_modules/tests/test_rust_kernel_heartbeat.py
```

Release gate integration:

- `server_modules/release_gate_service.py` must require the Rust kernel files.
- The release gate must compile `server_modules/rust_runtime_kernel_client.py`.
- The release gate must compile `server_modules/sage_heartbeat_service.py`.
- The release gate must run `cargo fmt --manifest-path empyralis-runtime-kernel/Cargo.toml -- --check`.
- The release gate must run `cargo test --manifest-path empyralis-runtime-kernel/Cargo.toml`.
- The release gate must inventory all allowlisted Rust commands, wrappers, and ownership statuses.
- The release gate must prove `active_enforcement` commands are referenced outside tests through either typed wrappers or the shared enforced-decision helper; otherwise commands must stay marked `shadow_only`.
- The release gate must report the current Rust/Python source-byte share so the aggressive migration target remains visible.
- The release gate must run the focused Phase 6 pytest files.

Production integration rule:

- Python may call the Rust kernel through `server_modules/rust_runtime_kernel_client.py`.
- Python may compare or opt into Rust authorization through `server_modules/rust_authorization_shadow_service.py`.
- The Python adapter must only spawn allowlisted kernel commands.
- The Python adapter normalizes all Rust responses to include `ok`, `decision`, `reason`, `operation`, `next_action`, `audit_visibility`, `approval_required`, and `cacheable`.
- The Python adapter exposes a kernel ownership manifest that marks every command as either `active_enforcement` or `shadow_only`.
- Protected mutation paths should use the shared enforced-decision helpers instead of hand-rolled `decision == block` checks as each service is migrated.
- The active Docker execution outcome classifier, hosted worker launch gate, hosted sandbox preparation gate, Docker sandbox launch gate, Docker sandbox command builder, approval-requirement normalizer, path-containment checker, canonical tool-policy authorizer, policy preset applicator, secrets broker, safe-mode capability resolver, agent-computer policy evaluator, capability-risk classifier, approval, runtime attachment, machine lease, queue transition, registered run-route, control-plane, deployed-agent, deployed virtual-runtime, gateway, run-service, and runtime run-api gates now use the shared enforced-decision helper while preserving existing HTTP-facing failure behavior.
- If the Rust binary is unavailable, times out, returns invalid JSON, or exits non-zero, Python must return `decision: "block"`.
- Successful Rust responses must include a boolean `ok` field and string `decision` field.
- Production authorization cutover should target `authorize-request`, not separate ad hoc Python recomposition of safe-mode, policy, risk, and approval outputs.
- Production execution cutover should target `authorize-execution`, not Python recomposition of authorization plus execution planning.
- Existing Python policy/risk/sandbox services remain authoritative until a focused parity test suite proves the Rust behavior matches or intentionally improves them.

Rust authorization flags:

- `EMPYRALIS_SHADOW_RUST_AUTHORIZATION=1` calls Rust and records comparison output while preserving the existing Python decision.
- `EMPYRALIS_USE_RUST_AUTHORIZATION=1` makes Rust `authorize-request` the effective decision source for callers using the shadow service.
- When Rust is effective, kernel failure or invalid output must produce an effective `block` decision.

## First opt-in production seam

Diagnostics secret redaction can use the Rust kernel when this environment variable is enabled:

```bash
EMPYRALIS_USE_RUST_DIAGNOSTICS_REDACTION=1
```

Default behavior remains the existing Python redactor.

When the flag is enabled:

- `server_modules/session_diagnostics_service.py` calls `server_modules/rust_runtime_kernel_client.py`.
- Successful Rust output replaces the Python redacted object.
- Rust unavailability, timeout, invalid output, or blocked response returns a redaction error object instead of exposing unredacted diagnostics.

This is intentionally the first integration seam because diagnostics redaction is deterministic, security-sensitive, and low-risk to keep default-off while parity is proven.

## Runtime visibility

The Sage heartbeat snapshot includes a `rust_kernel` block.

It reports:

- whether the Rust kernel binary is available;
- the resolved binary path when present;
- the allowlisted kernel command names;
- the Python adapter module responsible for calls into Rust.

This status does not execute Rust commands and does not enable Rust production replacement paths. It only makes Phase 6 readiness visible to operators.

### Process lifecycle enforcement slice

- Added active Python enforcement for `process-lifecycle-decision` in `server_modules/connectors_core.py` before spawning the detached Anthropic local CLI login process.
- Added a focused Python release-gate test proving Rust is called before `subprocess.Popen` and Rust denial prevents process spawn.
- Added Rust unit coverage for protected process start denial when the kill switch is active and for missing run identity.
- Ownership status: process lifecycle is now active enforcement for provider CLI login process start; broader timeout, termination, heartbeat, and cleanup owners should continue migrating behind the same Rust command.

### Webhook run-trigger enforcement slice

- Added active Python enforcement for `run-trigger-decision` in `server_modules/runtime_webhook_trigger_service.py` before webhook trigger registration mutates the trigger registry and before webhook ingestion starts a run.
- Existing webhook trigger tests now mock Rust allow decisions for compatibility paths and include denial cases proving Rust blocks persistence/run start.
- Added Rust unit coverage for webhook registration and ingest blocking cases.
- Ownership status: webhook trigger registration and matched webhook ingest are active Rust enforcement; schedule CRUD and pending-heartbeat trigger flows should continue moving behind the same command.

### Runtime binding enforcement slice

- Added active Python enforcement for `runtime-binding-decision` in `server_modules/deployed_agent_virtual_runtime_service.py` before deployed agents create or reuse cloud/self-hosted runtime session bindings.
- Added a focused release-gate test proving Rust admission happens before virtual runtime `create_session`, and denial prevents runtime session creation.
- Added Rust unit coverage for missing workspace identity and invalid self-hosted-to-cloud binding attempts.
- Ownership status: runtime session binding now has active Rust admission for deployed agent cloud and self-hosted binding paths; the remaining local gateway pre-checks should be reduced to context loading for Rust decisions.

### Local worker dispatch enforcement slice

- Added active Python enforcement for `local-worker-decision` in `server_modules/worker_dispatch_service.py` before local worker claim, worker heartbeat, run heartbeat, complete, pause, and fail mutations.
- Fixed the pause path so Rust admission happens before local machine lease release.
- Added focused release-gate tests proving Rust denial blocks machine lease claim, lease release, and run status mutation.
- Added Rust unit coverage for missing worker identity and disabled local companion queue mutation blocks.
- Ownership status: local worker queue/run mutation now has active Rust admission; remaining Python logic should continue shrinking toward payload assembly, persistence adapters, and response compatibility.

### Thread record enforcement slice

- Added active Python enforcement for `thread-record-decision` in `server_modules/thread_service.py` before master thread normalization, user/assistant turn creation, transcript event append, thread listing, and thread retrieval.
- Added focused release-gate tests proving Rust denial blocks repository writes and Rust admission runs before repository reads.
- Added Rust unit coverage for missing thread identity and excessive history-window rejection.
- Ownership status: thread/turn record admission now has active Rust enforcement; remaining work is to migrate canonical thread/turn output builders and history-window normalization into Rust rather than Python helpers.

### Run state transition enforcement slice

- Added active Python enforcement for `state-transition-decision` in `server_modules/worker_dispatch_service.py` before local-worker complete/fail paths perform queue terminal transitions or status mutation.
- Added compatibility state canonicalization so legacy Python statuses such as `running_local`, `claimed`, and `queued_local` can be admitted by Rust without preserving Python-owned transition policy.
- Extended local-worker release-gate coverage to prove state-transition denial blocks queue transition and `set_run_status` mutation after local-worker admission allows the operation.
- Added Rust unit coverage for invalid completion from `waiting_for_input` and allowed failure from `running`.
- Ownership status: local-worker terminal run state mutation now requires both local-worker admission and canonical Rust state transition approval.

### Run record enforcement slice

- Added active Python enforcement for `run-record-decision` in `server_modules/run_execution_handle.py` before live run record creation and durable snapshot serialization.
- Added focused release-gate tests proving Rust admission is required for `register_live_run` and `persist_snapshot`, and Rust denial blocks record creation.
- Added Rust unit coverage for terminal initial states and snapshot version mismatch rejection.
- Ownership status: initial run record creation and durable snapshot persistence now require Rust admission; remaining work is to move canonical payload/version builders into Rust and reduce Python's `RunRecord` to compatibility mapping glue.

### Run preparation enforcement slice

- Added active Python enforcement for `run-preparation-decision` in `server_modules/runtime_run_entry_service.py` before start-run requests delegate into turn/runtime execution.
- Added compatibility extraction for dict-like and object-like request payloads while sending metadata shape facts to Rust for pack inputs, outcome scope, approval rules, schedule, connector credential, workflow, app permission, and elevated-mode checks.
- Extended the runtime run entry tests to prove Rust admission happens before execution delegation and Rust denial prevents execution.
- Added Rust unit coverage for invalid `pack_inputs` metadata and elevated-mode approval requirements.
- Ownership status: start-run preparation is now active Rust admission; remaining work is to migrate canonical request normalization and workflow snapshot hydration into Rust-owned mutation plans.

### Deployed-agent data enforcement slice

- Added active Python enforcement for `deployed-data-decision` in `server_modules/deployed_agent_admin_dashboard_service.py` before reading deployed-agent admin analytics/dashboard data from the control-plane repository.
- Added focused release-gate tests proving Rust admission runs before dashboard repository access and Rust denial prevents the repository read.
- Hardened the admin dashboard analytics path so `analytics_detail` now requires canonical Rust `next_action=read_deployed_agent_analytics`; unexpected Rust actions fail closed before the repository read.
- Added Rust unit coverage for admin-role enforcement and sensitive data approval requirements.
- Ownership status: deployed-agent admin dashboard data access now has active Rust admission; remaining data surfaces such as conversation detail, memory listing, audit export, and external-user deletion should be migrated behind the same command.

### Deployed-agent readiness test-turn enforcement slice

- Added a Rust `test_turn` stage to `deployed-readiness-decision` so Studio private test-turn eligibility is owned by Rust instead of only Python `TESTABLE_STATES` checks.
- Added active Python enforcement in `server_modules/deployed_agent_test_turn_service.py` before policy evaluation, memory loading, live model calls, audit emission, or usage persistence.
- Updated test-turn coverage so a live-state denial is produced by Rust and blocks execution at the readiness boundary.
- Added Rust unit coverage proving `private_test` is allowed for Studio test turns and `live` is blocked.
- Ownership status: deployed-agent Studio test-turn readiness now has active Rust admission; full deploy/update readiness remains a larger migration surface in `deployed_agent_service.py`.

### Platform orchestration run-create route slice

- Added active Python enforcement for `platform-orchestration-decision` in `server_modules/runtime_route_run_handlers_service.py` before start-run route dispatch reaches run preparation or runtime execution.
- Added focused route-handler tests proving Rust admission runs before `start_run_response_fn` and Rust denial prevents lower-level run execution dispatch.
- Added Rust unit coverage for `run_create` actor identity blocking and satisfied-policy allowance.
- Ownership status: route-level run creation now requires Rust platform orchestration admission; remaining run stream/cancel/retry/delegation/gateway route handlers should continue moving behind the same command.

### Scheduler auto-retry enforcement slice

- Added active Python enforcement for `scheduler-decision` in `server_modules/run_service.py` before delegated child auto-retry state is persisted or retry timers are started.
- Rust now decides whether auto-retry is allowed/blocked/deferred and supplies the delay used for the retry timer.
- Added focused release-gate tests proving Rust delay is applied before timer start and Rust denial prevents pending retry state and timer creation.
- Added Rust unit coverage for exhausted retry attempts and allowed retry backoff delay.
- Ownership status: delegated child auto-retry scheduling now has active Rust admission; remaining wake/status/defer scheduler flows should move behind the same command.

### Gateway service execution enforcement slice

- Added active Python enforcement for `gateway-service-decision` in `server_modules/gateway_execution_service.py` before gateway tool readiness checks and protocol dispatch.
- Added focused tests proving Rust admission runs before `dispatch_tool_invoke` and Rust denial prevents gateway dispatch.
- Added Rust unit coverage for kill-switch blocking and satisfied-policy `tool_execute` allowance.
- Ownership status: gateway tool execution now has service-level Rust admission layered above readiness and protocol dispatch; interrupt, browser, diagnostics, fallback, and policy-write paths should continue moving behind the same command.

### Control-plane workspace admin enforcement slice

- Added active `control-plane-service-decision` enforcement to workspace admin provider-credential and membership mutation paths.
- `upsert_workspace_provider_credential` now asks Rust before writing provider secret references to the vault path.
- `update_workspace_member_role` and `remove_workspace_member` now ask Rust before mutating workspace membership through auth persistence.
- Added focused Python coverage in `server_modules/tests/test_workspace_admin_control_plane_rust_gate.py` for allow and fail-closed denial behavior.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/control_plane_service.rs` for self-removal blocking and secret-reference approval requirements.
- Ownership status: active enforcement. Python keeps FastAPI/auth/provider adapter compatibility; Rust owns the protected control-plane service decision before mutation.

### Workspace AI route control-plane enforcement slice

- Added active `control-plane-service-decision` enforcement to workspace default AI-route updates.
- `update_workspace_default_ai_route` now asks Rust before writing provider-profile metadata that selects a workspace AI route.
- The FastAPI route now forwards the current user into the service so Rust receives actor and tenant context for the mutation decision.
- Added Rust ownership for `workspace_ai_route_update` as a known, owner-required, billing-gated, idempotent control-plane write.
- Added focused Python coverage in `server_modules/tests/test_workspace_ai_route_control_plane_rust_gate.py` for allowed provider-route mutation and fail-closed Rust denial.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/control_plane_service.rs` for billing entitlement blocking and owner-approved route mutation allow behavior.
- Ownership status: active enforcement. Python still preserves API compatibility and provider profile adapter calls; Rust owns the protected route-change decision before mutation.

### Direct workspace route control-plane enforcement slice

- Added active `control-plane-service-decision` enforcement to direct workspace create and workspace profile update routes.
- `POST /workspaces` now asks Rust before `control_plane_repository.create_workspace_for_user` mutates workspace records.
- `PATCH /workspaces/{workspace_id}` now asks Rust before `control_plane_repository.update_workspace_profile` mutates workspace profile metadata.
- Added focused Python coverage in `server_modules/tests/test_routes_workspaces_control_plane_rust_gate.py` for allowed workspace create and fail-closed update denial.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/control_plane_service.rs` for workspace-create billing entitlement blocking and workspace-update access blocking.
- Ownership status: active enforcement. Python preserves FastAPI request/response compatibility and repository adapters; Rust owns the protected workspace create/update decision before mutation.

### Workspace transparency settings control-plane enforcement slice

- Added active `control-plane-service-decision` enforcement to workspace transparency settings updates.
- `PATCH /workspaces/{workspace_id}/transparency-settings` now asks Rust before `put_transparency_settings` persists audit/trace visibility settings.
- Added Rust ownership for `transparency_settings_update` as a known owner-required control-plane operation.
- Extended focused Python route coverage in `server_modules/tests/test_routes_workspaces_control_plane_rust_gate.py` to prove Rust denial blocks transparency settings persistence.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/control_plane_service.rs` for owner-access enforcement on transparency settings mutation.
- Ownership status: active enforcement. Python keeps the API and settings adapter; Rust owns the protected transparency settings decision before persistence.

### Provider credential deletion route enforcement slice

- Added route-level `control-plane-service-decision` enforcement before provider credential deletion reaches the workspace admin service.
- `DELETE /workspaces/{workspace_id}/providers/credentials` now resolves the workspace boundary, sends a Rust `secret_reference_write` decision with delete intent, and only then calls `delete_workspace_provider_credential`.
- Extended focused Python route coverage in `server_modules/tests/test_routes_workspaces_control_plane_rust_gate.py` to prove Rust denial blocks the credential delete service call.
- Ownership status: active enforcement. Python keeps FastAPI compatibility and delegates the provider credential delete adapter; Rust owns the protected secret-reference deletion decision before mutation.

### Remaining workspace admin route enforcement slice

- Added route-level `control-plane-service-decision` enforcement before workspace routing, invite create/revoke, policy update, Sage tool-policy update, and provider model refresh service calls.
- Added Rust ownership for `workspace_routing_update`, `workspace_policy_update`, `sage_tool_policy_update`, and `provider_models_refresh` as known owner-required control-plane operations.
- Extended focused Python route coverage in `server_modules/tests/test_routes_workspaces_control_plane_rust_gate.py` to prove Rust denial blocks invite creation, workspace policy persistence, and provider model refresh service execution.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/control_plane_service.rs` for workspace policy owner enforcement, provider model refresh quota enforcement, and workspace routing owner allow behavior.
- Ownership status: active enforcement. Python keeps FastAPI and workspace admin service adapters; Rust now owns the protected route admission decision before these workspace admin mutations reach Python service logic.

### Control-plane mutation-plan response slice

- Extended `control-plane-service-decision` responses with standardized `cacheable` and `mutation_plan` fields.
- `mutation_plan` now carries Rust-owned canonical operation, record type, apply flag, next action, idempotency key, target status, destructive/external-write markers, and billing-gate marker.
- Added Rust boundary coverage proving allowed writes return a canonical mutation plan and cacheable control-plane reads expose cache metadata.
- Ownership status: Rust is no longer only returning admission text for this command; it now emits a canonical mutation-plan envelope that Python can persist or map while preserving external API compatibility.

### Control-plane mutation-plan enforcement correction

- Corrected `control-plane-service-decision` mutation-plan semantics so cacheable/read-only operations do not report `mutation_plan.apply=true`.
- Added `mutation_plan.mutating` so Python can distinguish allowed reads from approved writes.
- Route, workspace AI-route, and workspace-admin protected write helpers now require `mutation_plan.apply=true` in addition to an allowed Rust decision before Python mutates state.
- Extended focused Python coverage to prove an allowed Rust response without an applying mutation plan still fails closed before repository, provider-profile, or auth membership mutation.
- Ownership status: Rust now provides both admission and mutation-plan authority for these control-plane writes; Python must receive an applying Rust plan before executing the adapter call.

### Runtime workspace memory/context state-store enforcement slice

- Added active `runtime-state-store-decision` enforcement to workspace memory deletion and workspace context-file updates.
- `delete_workspace_memory_payload` now asks Rust before invoking the Python `delete_memory` adapter.
- `update_workspace_context_file_payload` now asks Rust before invoking the Python context-file write adapter.
- Added Rust ownership for `delete_workspace_memory` and `update_workspace_context_file` as runtime state-store operations with workspace and owner-access requirements.
- Added focused Python coverage in `server_modules/tests/test_runtime_workspace_service_rust_gate.py` for allow-before-delete and fail-closed denial before memory/context writes.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/runtime_state_store.rs` for owner enforcement and allowed context-file writes.
- Ownership status: active enforcement. Python keeps the callable storage adapters; Rust owns the protected runtime workspace state-store decision before mutation.

### Workspace memory destructive-state correction

- Classified `delete_workspace_memory` as a destructive runtime state-store operation.
- Rust now applies destructive-state retention-lock and approval rules to workspace memory deletion before Python can call the memory delete adapter.
- Added Rust boundary coverage proving retention lock blocks workspace memory deletion.

### Agent approval-memory state-store enforcement slice

- Added active `runtime-state-store-decision` enforcement before approval-memory rule persistence.
- `create_approval_memory_rule` now asks Rust before `_write_state` persists a remembered approval rule.
- `consume_matching_approval_memory_rule` now asks Rust before `_write_state` increments approval-memory rule usage.
- Added Rust ownership for `upsert_approval_memory_rule` and `consume_approval_memory_rule` as runtime state-store operations with workspace, owner, and payload requirements.
- Added focused Python coverage in `server_modules/tests/test_agent_approval_memory_rust_gate.py` proving Rust is called before approval-memory writes and denial prevents `_write_state`.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/runtime_state_store.rs` for owner enforcement and approved approval-memory consume writes.
- Ownership status: active enforcement. Python still normalizes the compatibility rule object and writes the existing JSON state file; Rust now owns the protected approval-memory persistence decision before mutation.

### Sage memory state-store enforcement slice

- Added active `runtime-state-store-decision` enforcement before Sage memory state writes.
- `wipe_sage_memory`, `upsert_memory_entry`, `set_memory_entry_pinned`, and `delete_memory_entry` now ask Rust before `_save_state` persists JSON state.
- Added Rust ownership for `upsert_sage_memory_entry`, `update_sage_memory_entry`, `delete_sage_memory_entry`, and `wipe_sage_memory` as runtime state-store operations with workspace, owner, payload, and destructive-state requirements.
- Added focused Python coverage in `server_modules/tests/test_sage_memory_service_rust_gate.py` for allow-before-save and fail-closed denial before save.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/runtime_state_store.rs` for owner enforcement, retention-lock delete blocking, and allowed Sage memory update writes.
- Ownership status: active enforcement. Python still normalizes the existing Sage memory payloads and writes the compatibility JSON store; Rust owns the protected Sage memory persistence decision before mutation.

### Core workspace memory service state-store enforcement slice

- Added active `runtime-state-store-decision` enforcement to core `memory_service` write APIs.
- `save_memory`, `delete_memory`, `save_daily_log`, and `update_memory_context_file` now ask Rust before invoking workspace memory or context-file write adapters.
- Added Rust ownership for `upsert_workspace_memory` and `append_workspace_daily_log`; reused `delete_workspace_memory` and `update_workspace_context_file` for core memory service paths.
- Added focused Python coverage in `server_modules/tests/test_memory_service_rust_gate.py` proving Rust is called before workspace memory writes and denial prevents delete mutation.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/runtime_state_store.rs` for workspace memory payload enforcement and daily-log append allow behavior.
- Ownership status: active enforcement. Python still maintains compatibility with the existing memory adapters; Rust owns the protected core workspace memory persistence decision before mutation.

### Daily memory note direct-write enforcement slice

- Added `runtime-state-store-decision` enforcement before `memory_append_daily_note` writes directly to the daily memory context file.
- The path reuses the Rust-owned `append_workspace_daily_log` operation so direct context-file appends and adapter-backed daily log writes share the same protected state-store decision.
- Ownership status: active enforcement for this direct daily-note write path; Python still performs compatibility formatting and context-file persistence after Rust approval.

### Transcript and shared operational board state-store enforcement slice

- Added active `runtime-state-store-decision` enforcement before session transcript JSONL appends.
- `save_session_transcript` now asks Rust before opening the transcript file for append.
- Added active `runtime-state-store-decision` enforcement before shared operational board revision writes.
- `write_shared_operational_board_entry` now asks Rust before opening the board log file for append.
- Added Rust ownership for `append_session_transcript` and `write_shared_operational_board_entry` as runtime state-store operations with workspace, owner, and payload requirements.
- Added focused Python coverage in `server_modules/tests/test_session_transcript_store_rust_gate.py` and `server_modules/tests/test_shared_operational_board_rust_gate.py` for fail-closed behavior before file writes.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/runtime_state_store.rs` for transcript workspace access, shared board owner enforcement, and owner-approved board writes.
- Ownership status: active enforcement. Python preserves compatibility JSONL persistence and activity-ledger side effects; Rust owns the protected transcript and shared-board persistence decision before mutation.

### Activity ledger state-store enforcement slice

- Added active `runtime-state-store-decision` enforcement before activity ledger repository appends.
- `append_activity_event` now asks Rust after secret redaction and before `control_plane_repository.append_activity_ledger_event` mutates the ledger.
- Added Rust ownership for `append_activity_ledger_event` as a runtime state-store operation with workspace, owner, and payload requirements.
- Added focused Python coverage in `server_modules/tests/test_activity_ledger_service_rust_gate.py` proving Rust is called before repository append and denial prevents mutation.
- Added Rust boundary coverage in `empyralis-runtime-kernel/src/runtime_state_store.rs` for owner enforcement and approved activity ledger appends.
- Ownership status: active enforcement. Python keeps event normalization and redaction compatibility; Rust owns the protected activity-ledger persistence decision before mutation.

## Sage approval runtime-state enforcement slice

- Added active Rust state-store admission for Sage approval create, resolve, consume, and stale-expiry mutations.
- `server_modules/sage_approval_service.py` now calls `runtime-state-store-decision` before persisting `sage_approvals.json` changes and raises `SageApprovalRustGateError` on Rust block/approval decisions.
- Hardened the Sage approval mutation paths so Python now requires canonical Rust `next_action` values for `create_sage_approval`, `resolve_sage_approval`, `consume_sage_approval`, and `expire_sage_approvals`; unexpected Rust actions fail closed before approval-state mutation.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `create_sage_approval`, `resolve_sage_approval`, `consume_sage_approval`, and `expire_sage_approvals` under the `sage_approvals` state class.
- Added focused Python coverage in `server_modules/tests/test_sage_approval_service_rust_gate.py` and Rust boundary coverage in `runtime_state_store_sage_approval_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Sage services runtime-state enforcement slice

- Added active Rust state-store admission for Sage service profile updates, entry creation, entry updates, entry deletion, and entry pin/unpin mutations.
- `server_modules/sage_services_service.py` no longer creates `sage_services.json` as a side effect of read-only access and now calls `runtime-state-store-decision` before persisting service state changes.
- Hardened the Sage service mutation paths so Python now requires canonical Rust `next_action` values for `update_sage_service_profile`, `create_sage_service_entry`, `update_sage_service_entry`, `delete_sage_service_entry`, and `set_sage_service_entry_pinned`; unexpected Rust actions fail closed before service-state mutation.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `update_sage_service_profile`, `create_sage_service_entry`, `update_sage_service_entry`, `delete_sage_service_entry`, and `set_sage_service_entry_pinned` under the `sage_services` state class.
- Added focused Python coverage in `server_modules/tests/test_sage_services_service_rust_gate.py` and Rust boundary coverage in `runtime_state_store_sage_services_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Kill-switch runtime-state enforcement slice

- Added active Rust state-store admission for top-level kill-switch set and clear mutations before Python touches in-memory kill state or persists `kill_switches.json`.
- `server_modules/kill_switch_gate.py` now calls `runtime-state-store-decision` for `set_kill_switch` and `clear_kill_switch`, raising `KillSwitchRustGateError` when Rust blocks the mutation.
- Hardened the kill-switch mutation paths so Python now requires canonical Rust `next_action=set_kill_switch` and `next_action=clear_kill_switch`; unexpected Rust actions fail closed before memory or file mutation.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `set_kill_switch` and `clear_kill_switch` under the global `kill_switches` state class without requiring a workspace id.
- Added focused Python coverage in `server_modules/tests/test_kill_switch_gate_rust_gate.py` and Rust boundary coverage in `runtime_state_store_kill_switch_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Runtime tool-policy state enforcement slice

- Added active Rust state-store admission for runtime tool enable/disable policy mutations before Python changes `TOOL_STATE` or persists `ORION_TOOL_STATE_FILE`.
- `server_modules/runtime_policy.py` now calls `runtime-state-store-decision` for `set_runtime_tool_enabled`, raising `RuntimePolicyRustGateError` when Rust blocks the mutation.
- Hardened the runtime tool-policy write path so Python now requires canonical Rust `next_action=set_runtime_tool_enabled`; unexpected Rust actions fail closed before state or file mutation.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operation `set_runtime_tool_enabled` under the global `runtime_tool_policy` state class without requiring a workspace id.
- Added focused Python coverage in `server_modules/tests/test_runtime_policy_rust_gate.py` and Rust boundary coverage in `runtime_state_store_runtime_tool_policy_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Agent computer policy state enforcement slice

- Added active Rust state-store admission for persisted Agent Computer policy upserts before Python writes `agent_computer_policies.json`.
- `server_modules/agent_computer_policy_service.py` no longer creates the policy file as a side effect of read-only lookup and now calls `runtime-state-store-decision` for `upsert_agent_computer_policy`, raising `AgentComputerPolicyRustGateError` when Rust blocks the mutation.
- Hardened the Agent Computer policy write path so Python now requires canonical Rust `next_action=upsert_agent_computer_policy`; unexpected Rust actions fail closed before `agent_computer_policies.json` is written.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operation `upsert_agent_computer_policy` under the `agent_computer_policy` state class.
- Added focused Python coverage in `server_modules/tests/test_agent_computer_policy_service_rust_gate.py` and Rust boundary coverage in `runtime_state_store_agent_computer_policy_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Safe-mode security-control enforcement slice

- Added active Rust state-store admission for safe-mode state changes before Python mutates in-memory safe-mode controls.
- Added active Rust state-store admission for durable security-control upserts before `safe_mode_service` writes through `control_plane_repository.upsert_security_control_state`.
- `server_modules/safe_mode_service.py` now calls `runtime-state-store-decision` for `set_safe_mode_state` and `upsert_security_control_state`, raising `SafeModeRustGateError` when Rust blocks the mutation.
- Hardened the safe-mode state and durable security-control paths so Python now requires canonical Rust `next_action=set_safe_mode_state` and `next_action=upsert_security_control_state`; unexpected Rust actions fail closed before memory or repository mutation.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `set_safe_mode_state` and `upsert_security_control_state` under the `security_control_state` state class.
- Added focused Python coverage in `server_modules/tests/test_safe_mode_service_rust_gate.py` and Rust boundary coverage in `runtime_state_store_safe_mode_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Sage profile runtime-state enforcement slice

- Added active Rust state-store admission for Sage profile upserts before Python writes `sage_profile.json`.
- `server_modules/sage_profile_service.py` no longer creates `sage_profile.json` or projected markdown context files as a side effect of read-only profile listing.
- Hardened the Sage profile upsert path so Python now requires canonical Rust `next_action=upsert_sage_profile`; unexpected Rust actions fail closed before `sage_profile.json` is written.
- `sync_profile_context_files` now gates projection writes through the existing Rust-owned `update_workspace_context_file` operation before calling `workspace_context.write_workspace_context_file`.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operation `upsert_sage_profile` under the `sage_profile` state class.
- Added focused Python coverage in `server_modules/tests/test_sage_profile_service_rust_gate.py` and Rust boundary coverage in `runtime_state_store_sage_profile_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Capability registry state enforcement slice

- Added active Rust state-store admission for MCP server registry persistence before Python writes `mcp_servers.json`.
- Added active Rust state-store admission for installed-skill registry persistence before Python writes `.registry.json`.
- `server_modules/mcp_registry_service.py` now calls `runtime-state-store-decision` for `save_mcp_server_registry`, raising `McpRegistryRustGateError` when Rust blocks the mutation.
- Hardened the MCP registry write path so Python now requires canonical Rust `next_action=save_mcp_server_registry`; unexpected Rust actions fail closed before `mcp_servers.json` is written.
- `server_modules/installed_skills.py` now calls `runtime-state-store-decision` for `save_installed_skill_registry`, raising `InstalledSkillsRustGateError` when Rust blocks the mutation.
- Hardened the installed-skill registry write path so Python now requires canonical Rust `next_action=save_installed_skill_registry`; unexpected Rust actions fail closed before `.registry.json` is written.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `save_mcp_server_registry` and `save_installed_skill_registry` under the `mcp_server_registry` and `installed_skill_registry` state classes.
- Added focused Python coverage in `server_modules/tests/test_mcp_registry_service_rust_gate.py` and `server_modules/tests/test_installed_skills_rust_gate.py`, plus Rust boundary coverage in `runtime_state_store_capability_registry_boundary_tests`.
- Registered both focused tests in the release-gate Rust kernel pytest inventory.

## Secret-material state enforcement slice

- Added active Rust state-store admission for local vault key-file generation/rotation before Python writes secret material to disk.
- Added active Rust state-store admission for JWT secret-file creation before Python writes generated local auth secret material to disk.
- Rust decision payloads intentionally include only path/action/secret-length metadata, not the secret value.
- `server_modules/vault_store.py` now calls `runtime-state-store-decision` for `write_vault_key_file`, raising `VaultStoreRustGateError` when Rust blocks the mutation.
- `server_modules/jwt_secret.py` now calls `runtime-state-store-decision` for `write_jwt_secret_file`, raising `JwtSecretRustGateError` when Rust blocks the mutation.
- Hardened the vault-key and JWT-secret write paths so Python now requires canonical Rust `next_action=write_vault_key_file` and `next_action=write_jwt_secret_file`; unexpected Rust actions fail closed before secret material is written.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `write_vault_key_file` and `write_jwt_secret_file` under the `secret_material` state class.
- Added focused Python coverage in `server_modules/tests/test_secret_material_rust_gate.py` and Rust boundary coverage in `runtime_state_store_secret_material_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Execution artifact and local runtime state enforcement slice

- Added active Rust state-store admission for artifact record persistence before Python writes artifact metadata records.
- Added active Rust state-store admission for hosted secure sandbox base-image manifest/policy writes before Python creates the read-only sandbox image files.
- Added active Rust state-store admission for CLI companion config/session persistence before Python writes local companion state; Rust payloads include sanitized metadata and do not include API keys.
- `server_modules/artifact_service.py` now calls `runtime-state-store-decision` for `persist_artifact_record`, raising `ArtifactServiceRustGateError` when Rust blocks the mutation.
- `server_modules/execution_sandbox_service.py` now calls `runtime-state-store-decision` for `write_hosted_sandbox_base_image`, preserving existing hosted sandbox error behavior on block.
- `server_modules/cli_companion_service.py` now calls `runtime-state-store-decision` for `save_cli_companion_state`, raising `CliCompanionRustGateError` when Rust blocks the mutation.
- Hardened the CLI companion config/session write path so Python now requires canonical Rust `next_action=save_cli_companion_state`; unexpected Rust actions fail closed before local companion state is written.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `persist_artifact_record`, `write_hosted_sandbox_base_image`, and `save_cli_companion_state` under the `artifact_records`, `execution_sandbox_image`, and `cli_companion_state` state classes.
- Added focused Python coverage in `server_modules/tests/test_execution_artifact_state_rust_gate.py` and Rust boundary coverage in `runtime_state_store_execution_artifact_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Hosted-worker output and marketplace distribution enforcement slice

- Added active Rust state-store admission for Hosted Secure worker output writes before Python writes the sandbox result JSON file.
- Added active Rust state-store admission for marketplace distribution state saves before Python writes workspace marketplace distribution metadata.
- `server_modules/hosted_secure_worker.py` now calls `runtime-state-store-decision` for `write_hosted_worker_output`, raising `HostedWorkerRustGateError` when Rust blocks the mutation.
- `server_modules/marketplace_distribution_service.py` no longer creates marketplace distribution state as a side effect of read-only loads and now calls `runtime-state-store-decision` for `save_marketplace_distribution_state`, raising `MarketplaceDistributionRustGateError` when Rust blocks the mutation.
- Hardened both hosted worker output and marketplace distribution persistence so Python now requires canonical Rust `next_action=write_hosted_worker_output` and `next_action=save_marketplace_distribution_state`; unexpected Rust actions fail closed before file writes.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `write_hosted_worker_output` and `save_marketplace_distribution_state` under the `hosted_worker_output` and `marketplace_distribution` state classes.
- Added focused Python coverage in `server_modules/tests/test_worker_marketplace_state_rust_gate.py` and Rust boundary coverage in `runtime_state_store_worker_marketplace_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Sage dreaming runtime-state enforcement slice

- Added active Rust state-store admission for Sage dreaming memory-state rewrites and dreaming staging-file writes before Python writes JSON state artifacts.
- `server_modules/sage_dreaming_pipeline.py` now calls `runtime-state-store-decision` for `write_sage_dreaming_memory_state` and `write_sage_dreaming_staging_file`, raising `SageDreamingRustGateError` when Rust blocks the mutation.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `write_sage_dreaming_memory_state` and `write_sage_dreaming_staging_file` under the `sage_dreaming` state class.
- Added focused Python coverage in `server_modules/tests/test_sage_dreaming_pipeline_rust_gate.py` and Rust boundary coverage in `runtime_state_store_sage_dreaming_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Mini-app state enforcement slice

- Added active Rust state-store admission for mini-app contract/state persistence before Python writes `mini_apps.json` through the atomic tmp-file replace path.
- `server_modules/mini_apps_service.py` now calls `runtime-state-store-decision` for `save_mini_apps_state`, raising `MiniAppsRustGateError` when Rust blocks the mutation.
- Hardened the mini-app state write path so Python now requires canonical Rust `next_action=save_mini_apps_state`; unexpected Rust actions fail closed before `mini_apps.json` is written.
- The shared `_save_state` helper backs contract upserts, publishes, wipes, and record-state updates, so those writes now share the Rust admission boundary.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operation `save_mini_apps_state` under the `mini_apps` state class.
- Added focused Python coverage in `server_modules/tests/test_mini_apps_service_rust_gate.py` and Rust boundary coverage in `runtime_state_store_mini_apps_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Workspace context and Agent Computer profile enforcement slice

- Added active Rust state-store admission for shared workspace context file initialization and saves before Python writes markdown context files.
- Added active Rust state-store admission for Agent Computer profile state persistence before Python writes `agent_computer_profiles.json`.
- `server_modules/workspace_context.py` now calls `runtime-state-store-decision` for `initialize_workspace_context_file` and `save_workspace_context_file`, raising `WorkspaceContextRustGateError` when Rust blocks the mutation.
- `server_modules/agent_computer_profile_service.py` no longer creates the profile state file as a read side effect and now calls `runtime-state-store-decision` for `save_agent_computer_profile_state`, raising `AgentComputerProfileRustGateError` when Rust blocks the mutation.
- Hardened the Agent Computer profile write path so Python now requires canonical Rust `next_action=save_agent_computer_profile_state`; unexpected Rust actions fail closed before `agent_computer_profiles.json` is written.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operations `initialize_workspace_context_file`, `save_workspace_context_file`, and `save_agent_computer_profile_state` under the `workspace_context_files` and `agent_computer_profiles` state classes.
- Added focused Python coverage in `server_modules/tests/test_workspace_context_profile_rust_gate.py` and Rust boundary coverage in `runtime_state_store_workspace_context_profile_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

## Profile API file enforcement slice

- Added active Rust state-store admission for profile API JSON and text file writes before Python persists profile metadata, instructions, capabilities, policies, allowlists, or default-profile registry files.
- `server_modules/profile_api.py` now calls `runtime-state-store-decision` for `write_profile_api_file`, raising `ProfileApiRustGateError` when Rust blocks the mutation.
- Hardened the profile API file-write path so Python now requires canonical Rust `next_action=write_profile_api_file`; unexpected Rust actions fail closed before profile files are written.
- `empyralis-runtime-kernel/src/runtime_state_store.rs` now owns the canonical operation `write_profile_api_file` under the `profile_api_files` state class.
- Added focused Python coverage in `server_modules/tests/test_profile_api_rust_gate.py` and Rust boundary coverage in `runtime_state_store_profile_api_boundary_tests`.
- Registered the focused test in the release-gate Rust kernel pytest inventory.

### Shared output/state writer Rust admission expansion

Additional active enforcement now covers shared local output writers that previously could mutate files without an explicit Rust kernel decision:

- `write_runtime_common_json` gates `runtime_common._safe_write_json` before temp-file JSON persistence.
- `write_runtime_common_json` now also requires canonical Rust `next_action=write_runtime_common_json`; unexpected Rust actions fail closed before runtime-common files are written.
- `write_acp_manager_json` gates `acp_manager._safe_write_json` before ACP manager state persistence.
- `write_acp_manager_json` now also requires canonical Rust `next_action=write_acp_manager_json`; unexpected Rust actions fail closed before ACP manager state is written.
- `write_session_diagnostics_file` gates diagnostics bundle exports before writing the bundle file.
- `write_session_diagnostics_file` now also requires canonical Rust `next_action=write_session_diagnostics_file`; unexpected Rust actions fail closed before the diagnostics file is written.
- `append_agent_memory_daily_log` gates agent memory daily log appends before log file mutation.
- `write_no_provider_summary` gates no-provider local function-count summary exports before writing output.

These operations intentionally send metadata and byte counts to Rust, not full secret-bearing file contents. The release gate includes `server_modules/tests/test_shared_output_state_rust_gate.py` so these gates remain part of the active Rust kernel inventory.

### Connector/support output writer Rust admission expansion

Additional direct output writers now pass through the Rust runtime-state decision command before local file mutation:

- `write_public_bot_drill_report` gates Prompt 14 drill markdown and JSON report writes.
- `write_telegram_media_file` gates Telegram media downloads before opening the destination file.
- `write_machine_capability_probe_file` gates local machine filesystem probe writes before creating the probe file.
- These paths now also require canonical Rust `next_action` values before any file mutation; unexpected Rust actions fail closed on the shared output-writer gate surface.

The same focused Python release-gate test covers these operations, and Rust boundary tests assert canonical operation names, state classes, payload requirements, and no-workspace global write handling.

### Connector artifact materialization Rust admission expansion

Connector and generated-artifact file materialization now has additional active Rust admission coverage:

- `write_dropbox_download_file` gates Dropbox downloads before writing local files.
- `write_generated_image_file` gates generated image binary writes before persistence.
- `write_telegram_poll_lock_file` gates Telegram polling lock-file creation before opening the lock file.
- `write_telegram_poll_lock_file` now also requires canonical Rust `next_action=write_telegram_poll_lock_file`; unexpected Rust actions fail closed before lock-file mutation.
- `write_no_provider_summary` now also requires canonical Rust `next_action=write_no_provider_summary`; unexpected Rust actions fail closed before summary-file mutation.
- The Dropbox and generated-image write paths now also require canonical Rust `next_action` values before local file mutation; unexpected Rust actions fail closed.

These gates keep Python responsible for SDK calls and byte streaming while Rust owns the admission decision for whether the local mutation may occur.

### Skill registry generated-file Rust admission expansion

Skill registry file generation now has active Rust admission coverage through `write_skills_registry_file` before Python writes registry JSON, generated README files, or generated handler shims. Python still normalizes and copies the skill tree, but Rust now owns the local file-mutation admission decision for these generated registry artifacts.

### Deployed-agent knowledge-file Rust admission expansion

Deployed-agent knowledge uploads now call `write_deployed_agent_knowledge_file` before Python writes the workspace knowledge file. This keeps the FastAPI/control-plane compatibility path in Python while moving the file-mutation admission decision for deployed-agent knowledge materialization into Rust.

### Capability-risk classifier Python heuristic retirement

The capability-risk classifier no longer retains the unused Python heuristic classifier for critical/high/medium capability and payload-term matching. Final risk class, decision, audit visibility, retention, recording, and cacheability now come from the Rust `classify-risk` command, with Python defaulting missing Rust response fields to security/recording-on fail-closed behavior instead of reconstructing policy decisions locally. The focused classifier test file is now part of the release-gate pytest inventory.

### Outcome-pack file materialization Rust admission expansion

Outcome-pack file materialization now has active Rust admission coverage before Python writes generated business files:

- `write_outcome_pack_spreadsheet_file` gates local CSV/XLSX create, append, and update materialization.
- `write_outcome_pack_document_file` gates DOCX/PPTX generated output before local persistence.
- `write_outcome_pack_remote_sync_file` gates OneDrive download staging files before local sync writes.

Python still performs connector SDK calls and Office/spreadsheet serialization, but Rust now owns the mutation admission decision before the resulting local artifact is written.

### Artifact content-file Rust admission expansion

Artifact persistence now gates filesystem content materialization through `write_artifact_content_file` before Python writes artifact object bytes. The earlier `persist_artifact_record` gate covered metadata records; this adds Rust admission to the actual artifact content write path as well.

### External-write execution Rust admission expansion

The shared external-write idempotency chokepoint now calls `execute_external_write_once` through the Rust runtime-state decision command immediately before Python executes the irreversible connector mutation. Python still owns duplicate suppression and compatibility response annotation, but Rust now owns the final admission decision for connector-side writes such as outbound messages, remote uploads, and tool-driven external mutations.
Python now also requires canonical Rust `next_action=execute_external_write_once` on this chokepoint; unexpected Rust actions fail closed before connector-side execution.

### Gateway approval lifecycle Rust admission expansion

Gateway approval lifecycle mutations now pass through Rust runtime-state admission before Python creates, resolves, expires, fails, or marks a gateway approval executed. Python keeps compatibility response shapes, event emission, and gateway execution calls, while Rust now owns the transition admission decision for `create_gateway_tool_approval`, `resolve_gateway_tool_approval`, `expire_gateway_tool_approval`, `fail_gateway_tool_approval`, and `execute_gateway_tool_approval`.

### Gateway interrupt dispatch Rust admission expansion

Gateway interrupt dispatch now uses the existing Rust `gateway-service-decision` command before Python sends an interrupt frame to a paired gateway. This closes the previous gap where normal tool execution had Rust gateway admission but interrupt dispatch could proceed directly after Python registration checks.

### Gateway protocol frame-send Rust admission expansion

Outbound gateway request frames now pass through `send_gateway_protocol_request_frame` before `_LiveGatewayConnection` records and sends the WebSocket frame. This places Rust admission at the final protocol boundary for tool invoke, interrupt, channel outbound, and other gateway request frames, preventing bypasses around higher-level service gates.

### Channel execution lease Rust admission expansion

Channel-triggered execution leases now call Rust admission before acquire and release mutations. Python still performs quota counting and SQL persistence for compatibility, but Rust now owns the lifecycle admission decision for `acquire_channel_execution_lease` and `release_channel_execution_lease`, moving channel concurrency closer to the platform-kernel boundary.
Python now also requires canonical Rust `next_action=acquire_channel_execution_lease` and `next_action=release_channel_execution_lease`; unexpected Rust actions fail closed before lease mutation continues.

### Direct-tool execution lifecycle Rust admission expansion

Direct tool execution now calls Rust runtime-state admission before blocked, started, failed, and completed lifecycle transitions. Python still executes the concrete tool and preserves existing audit/metering response behavior, but Rust now owns admission for `start_direct_tool_execution`, `block_direct_tool_execution`, `fail_direct_tool_execution`, and `complete_direct_tool_execution` before Python records or finalizes direct-tool execution state.
Python now also requires the canonical Rust `next_action` for each direct-tool execution lifecycle transition; unexpected Rust actions fail closed before execution-state mutation continues.

### Machine-lease lifecycle Rust admission inventory coverage

Phase 3 machine-lease acquire, heartbeat, release, reconcile, and stale-cleanup paths already call the Rust `machine-lease-decision` command before Python mutates lease or queue state. This pass added focused Python gate coverage for the shared lease adapter and made the release gate require `server_modules/tests/test_machine_lease_rust_gate.py`, so the active Rust lease command now has explicit wrapper evidence in the migration inventory.

Python remains responsible for persistence adapters and in-memory runtime state mutation after Rust approval. The lifecycle decision boundary remains Rust-owned for acquire/release/heartbeat admission, capacity checks, stale lease handling, and holder mismatch rejection.

### Gateway pairing and registration Rust state admission

Phase 5 gateway ownership now covers pairing intent creation, expired pairing cleanup, and gateway registration-from-pairing at the repository mutation boundary. `gateway_state_repository.create_pairing_intent` calls `gateway-state-decision` before creating or expiring pairing rows, and `register_gateway_from_pairing` calls the same Rust command before consuming the pairing token and inserting/updating gateway registration state.

Rust gained the `expire_pairing_intent` operation so Python no longer performs pairing expiry writes as an ungated side effect of pairing creation or registration. The existing gateway-state release test now covers pairing creation and registration-from-pairing fail-closed behavior before SQLite mutation.

### Deployed-agent conversation memory control-plane gate

Phase 5 deployed-agent ownership now includes conversation-memory snapshot upserts. `control_plane_repository.upsert_deployed_agent_conversation_memory` calls `control-plane-service-decision` as a `deployed_agent_record_write` with a deployed-agent memory record type before opening the scoped repository connection or writing summary state.

This keeps Python responsible for compaction and persistence plumbing, while Rust owns admission for the durable deployed-agent memory mutation. The release gate now requires `server_modules/tests/test_deployed_agent_memory_rust_gate.py` to prove the write fails closed before repository mutation.

### Deployed-agent business insight control-plane gate

Phase 5 deployed-agent ownership now covers durable business-insight candidate, review, and apply mutations. `control_plane_repository.upsert_deployed_agent_business_insight_candidate`, `update_deployed_agent_business_insight_status`, and `mark_deployed_agent_business_insight_applied` call `control-plane-service-decision` as deployed-agent record writes before opening scoped repository connections or updating insight rows.

The release gate now requires `server_modules/tests/test_deployed_agent_business_insights_rust_gate.py`, proving candidate creation and owner review fail closed before repository mutation when Rust denies the decision.

### External-user privacy and data-retention Rust control-plane gates

Phase 5 control-plane ownership now covers external-user privacy request writes, privacy delete audit writes, external-user data erasure, deployed-agent scope erasure, and workspace scope erasure. These repository functions call `control-plane-service-decision` before opening scoped repository connections or mutating/deleting privacy, memory, usage, acquisition, business-insight, channel-event, and activity-ledger rows.

Rust now treats `external_user_privacy_request_write`, `external_user_privacy_audit_write`, `external_user_privacy_delete`, `deployed_agent_scope_data_delete`, and `workspace_scope_data_delete` as first-class control-plane operations with idempotency and scope requirements. The release gate requires `server_modules/tests/test_external_user_privacy_control_plane_rust_gate.py`, and Rust unit tests cover allowed request writes, missing deployed-agent scope denial, and destructive workspace-scope deletion classification.

### Billing, quota, and credit ledger Rust control-plane gates

Phase 5 billing and quota ownership now covers daily deployed-agent message quota consumption, quota warning-state updates, deployed-agent monthly cost ledger writes, hosted AI monthly cost ledger writes, and unified credit ledger writes. These repository functions call `control-plane-service-decision` before opening scoped repository connections or mutating money/usage state.

Rust now treats `deployed_agent_daily_message_quota_consume`, `deployed_agent_daily_message_warning_update`, `deployed_agent_cost_ledger_write`, `workspace_hosted_ai_cost_ledger_write`, and `credit_ledger_event_write` as first-class control-plane operations. The release gate requires `server_modules/tests/test_billing_usage_control_plane_rust_gate.py`, and Rust unit tests cover missing deployed-agent scope denial, quota-denial blocking, and hosted AI ledger allow behavior for entitled workspaces.

### Workspace billing account and subscription Rust control-plane gates

Phase 5 billing ownership now covers workspace billing defaults, pilot/plan updates, billing account upserts, and billing subscription upserts. `ensure_workspace_billing_defaults`, `update_workspace_billing_plan`, `upsert_workspace_billing_account`, and `upsert_workspace_billing_subscription` call `control-plane-service-decision` before either Postgres writes or local SQLite fallback writes.

Rust now treats `workspace_billing_defaults_write`, `workspace_billing_plan_update`, `workspace_billing_account_write`, and `workspace_billing_subscription_write` as first-class billing operations with idempotency and billing entitlement checks. The release gate requires `server_modules/tests/test_workspace_billing_control_plane_rust_gate.py`, and Rust unit tests cover system default writes, entitlement denial, and idempotency enforcement.

### Security control and governance-hold Rust control-plane gates

Phase 5 security/governance ownership now covers durable security-control state writes, security-control audit event writes emitted by that state transition, governance hold writes, and governance hold releases. `upsert_security_control_state`, `upsert_governance_hold`, and `release_governance_hold` call `control-plane-service-decision` before opening scoped repository connections or mutating protected governance tables.

Rust now treats `security_control_state_write`, `governance_hold_write`, and `governance_hold_release` as first-class control-plane operations with idempotency and scope checks. Tenant-scope governance holds are explicitly allowed without a workspace id, while workspace-scope governance still requires workspace scope. The release gate requires `server_modules/tests/test_security_governance_control_plane_rust_gate.py`, and Rust unit tests cover security-control writes, tenant governance holds, and idempotency denial on release.

### Channel acquisition and attribution Rust control-plane gates

Phase 5 deployed-agent acquisition ownership now covers public-start touch writes and attribution conversion writes before either control-plane repository calls or local SQLite fallback mutations. `ChannelUserAcquisitionService._upsert_touch` and `_mark_touch_converted` call `control-plane-service-decision` before persisting acquisition state, so public channel onboarding cannot create or convert attribution records without Rust approval.

Rust now treats `channel_user_acquisition_touch_write` and `channel_user_acquisition_conversion_write` as first-class control-plane operations with deployed-agent scope and idempotency requirements. The release gate requires `server_modules/tests/test_channel_user_acquisition_rust_gate.py`, and Rust unit tests cover allow, missing-agent denial, and idempotency denial behavior.

### Marketplace upgrade-click Rust control-plane gate

Phase 5 deployed-agent marketplace telemetry now covers upgrade-click writes. `DeployedAgentMarketplaceService.record_upgrade_click` calls `control-plane-service-decision` before writing deployed-agent upgrade-click events through the control-plane repository, so public marketplace conversion telemetry cannot mutate durable state without Rust approval.

Rust now treats `deployed_agent_upgrade_click_write` as a first-class control-plane operation with deployed-agent scope and idempotency requirements. The release gate requires `server_modules/tests/test_deployed_agent_marketplace_rust_gate.py`, and Rust unit tests cover allowed scoped writes and missing-agent denial.

### Agent channel event Rust control-plane gate

Phase 5 webhook and channel-ingest ownership now covers durable `agent_channel_events` writes. `control_plane_repository.append_agent_channel_event` calls `control-plane-service-decision` before opening scoped repository connections or inserting channel event rows, with idempotency based on inbound message id, parent event, run id, or generated event id.

Rust now treats `agent_channel_event_write` as a first-class control-plane operation. The release gate requires `server_modules/tests/test_agent_channel_event_control_plane_rust_gate.py`, and Rust unit tests cover allowed idempotent writes and missing-idempotency denial.

### Personal context event Rust control-plane gates

Phase 4/5 durable context ownership now covers personal context event writes and Sage seen-state updates. `append_personal_context_event` and `mark_personal_context_events_seen_by_sage` call `control-plane-service-decision` before opening scoped repository connections or mutating `personal_context_events` rows.

Rust now treats `personal_context_event_write` and `personal_context_event_seen_update` as first-class control-plane operations with idempotency requirements. The release gate requires `server_modules/tests/test_personal_context_control_plane_rust_gate.py`, and Rust unit tests cover allowed event writes plus missing-idempotency denial for seen-state updates.

### Agent action event Rust control-plane gate

Phase 5 action-metering ownership now covers durable `agent_action_events` writes. `control_plane_repository.record_agent_action_event` calls `control-plane-service-decision` before opening scoped repository connections or writing action-metering rows, so tool/action metering cannot persist runtime action state without Rust approval.

Rust now treats `agent_action_event_write` as a first-class control-plane operation with idempotency requirements. The release gate requires `server_modules/tests/test_agent_action_event_control_plane_rust_gate.py`, and Rust unit tests cover allowed idempotent writes plus missing-idempotency denial.

### Control-plane audit/event repository hardening - 2026-06-01

- Added active `control-plane-service-decision` gates before `agent_secret_access_events`, `agent_egress_events`, and `activity_ledger_events` repository writes.
- Added Rust-owned operations `agent_secret_access_event_write`, `agent_egress_event_write`, and `activity_ledger_event_write`; all are idempotency-keyed external/control-plane audit mutations.
- Added focused Python release-gate coverage in `test_control_plane_audit_event_rust_gate.py` and Rust unit coverage in `control_plane_service.rs` so these writers are tracked as active enforcement, not shadow-only.

### Agent trace repository control-plane enforcement - 2026-06-01

- Added active `control-plane-service-decision` gates before agent trace create, trace-event append, and trace finish repository mutations.
- Added Rust-owned operations `agent_trace_create`, `agent_trace_event_write`, and `agent_trace_finish`, requiring idempotent mutation keys for trace state writes.
- Added focused Python release-gate coverage in `test_agent_trace_control_plane_rust_gate.py` and Rust unit coverage in `control_plane_service.rs`; existing trace repository tests now mock the Rust gate explicitly so DB-shape assertions remain isolated.

### Agent thread/session/turn repository control-plane enforcement - 2026-06-01

- Added active `control-plane-service-decision` gates before thread ensure, session upsert, session terminate, turn upsert, and assistant-turn transcript-event metadata updates.
- Added Rust-owned operations `agent_thread_ensure`, `agent_session_upsert`, `agent_session_terminate`, `agent_turn_upsert`, and `agent_turn_transcript_event_append`; session operations now require a session id and turn mutations require thread identity before Python persists state.
- Added focused Python release-gate coverage in `test_agent_thread_session_turn_control_plane_rust_gate.py` and Rust unit coverage in `control_plane_service.rs`; existing control-plane repository tests now mock the Rust gate explicitly for DB-shape assertions.

### Knowledge source and retrieval repository enforcement - 2026-06-01

- Added active `control-plane-service-decision` gates before knowledge source upserts, source chunk replacement, and knowledge retrieval event writes.
- Added Rust-owned operations `knowledge_source_upsert`, `knowledge_source_chunks_replace`, and `knowledge_retrieval_event_write`; chunk replacement is now admitted by Rust before Python deletes and rewrites indexed context rows.
- Added focused Python release-gate coverage in `test_knowledge_control_plane_rust_gate.py` and Rust unit coverage in `control_plane_service.rs`.

### Workspace membership and invite repository enforcement - 2026-06-01

- Added repository-level `control-plane-service-decision` gates before workspace membership upsert, workspace invite acceptance, and workspace invite revocation writes.
- Added Rust-owned `invite_accept` operation and reused Rust-owned `membership_update` / `invite_revoke` for the direct repository mutations, closing bypass paths beneath existing route/service gates.
- Added focused Python release-gate coverage in `test_workspace_membership_invite_repository_rust_gate.py` and Rust unit coverage in `control_plane_service.rs`.

### Pilot invite repository enforcement - 2026-06-01

- Added repository-level `control-plane-service-decision` gates before pilot invite create, claim, and revoke mutations.
- Added Rust-owned `pilot_invite_create`, `pilot_invite_claim`, and `pilot_invite_revoke` operations so account-entry invite state changes cannot mutate Python persistence without kernel admission.
- Added focused Python release-gate coverage in `test_pilot_invite_repository_rust_gate.py` and Rust unit coverage in `control_plane_service.rs`.

### Identity control-plane repository enforcement - 2026-06-01

- Added repository-level `control-plane-service-decision` gates before workspace tenant binding and user profile update mutations.
- Added Rust-owned `workspace_tenant_binding_ensure` and `user_profile_update` operations so identity/workspace authority rows cannot be changed from Python without kernel admission.
- Added focused Python release-gate coverage in `test_identity_control_plane_repository_rust_gate.py` and Rust unit coverage in `control_plane_service.rs`.

### Agent registry compiled workflow enforcement - 2026-06-01

- Added active `control-plane-service-decision` gates before compiled workflow artifact creation and workspace-agent install compiled-artifact binding updates.
- Added Rust-owned `compiled_workflow_artifact_create` and `workspace_agent_install_compiled_artifact_update` operations so template compilation cannot create workflow definitions/versions or rewire install execution metadata without kernel admission.
- Added focused Python release-gate coverage in `test_agent_registry_workflow_rust_gate.py` and Rust unit coverage in `control_plane_service.rs`; existing agent-registry repository tests mock the Rust gate explicitly for DB-shape assertions.

### Self-hosted runtime command and enrollment enforcement - 2026-06-01

- Added active `control-plane-service-decision` gates before self-hosted runtime enrollment intent creation, node enrollment, owner approval, heartbeat metadata updates, command enqueue, command claim, and command completion persistence.
- Added Rust-owned operations `self_hosted_enrollment_intent_create`, `self_hosted_runtime_enroll`, `self_hosted_runtime_approve`, `self_hosted_runtime_heartbeat`, `self_hosted_command_enqueue`, `self_hosted_command_claim`, and `self_hosted_command_complete` so runtime attachment and command queue mutations cannot persist without kernel admission.
- Added focused Python release-gate coverage in `test_agent_registry_self_hosted_runtime_rust_gate.py` and Rust unit coverage in `control_plane_service.rs`.
- Tightened the shared control-plane helper so those self-hosted runtime operations now require the canonical Rust `next_action == apply_control_plane_write` instead of treating a generic Rust allow as sufficient.

### Shared control-plane write action-class hardening - 2026-06-01

- Tightened the shared `control_plane_repository._enforce_control_plane_service_decision(...)` helper so additional Rust-gated write families now require the canonical `apply_control_plane_write` action instead of accepting a generic Rust allow:
  - `workspace_tenant_binding_ensure`
  - `user_profile_update`
  - `agent_thread_ensure`
  - `agent_session_upsert`
  - `agent_session_terminate`
  - `agent_turn_upsert`
  - `agent_turn_transcript_event_append`
  - `knowledge_source_upsert`
  - `knowledge_source_chunks_replace`
  - `knowledge_retrieval_event_write`
  - `compiled_workflow_artifact_create`
  - `workspace_agent_install_compiled_artifact_update`
- Added focused Python fail-closed coverage in:
  - `test_agent_registry_workflow_rust_gate.py`
  - `test_knowledge_control_plane_rust_gate.py`
  - `test_identity_control_plane_repository_rust_gate.py`
  - `test_agent_thread_session_turn_control_plane_rust_gate.py`

### Gateway execution action-class hardening - 2026-06-01

- Tightened `gateway_execution_service._enforce_gateway_service_decision(...)` so `tool_execute` and `tool_interrupt` now require the canonical Rust `next_action == dispatch_gateway_operation` instead of accepting a generic Rust allow.
- Added focused Python fail-closed coverage in `test_gateway_execution_service.py` proving wrong Rust actions block gateway tool dispatch and interrupt dispatch before protocol execution.

### Shared control-plane repository hardening for billing, quota, security, and deployed-agent record writes - 2026-06-01

- Tightened the shared `control_plane_repository._enforce_control_plane_service_decision(...)` helper so additional Rust-gated repository write families now require the canonical `apply_control_plane_write` action instead of accepting a generic Rust allow:
  - `membership_update`
  - `workspace_billing_defaults_write`
  - `deployed_agent_daily_message_quota_consume`
  - `deployed_agent_daily_message_warning_update`
  - `deployed_agent_cost_ledger_write`
  - `workspace_hosted_ai_cost_ledger_write`
  - `credit_ledger_event_write`
  - `deployed_agent_record_write`
  - `agent_action_event_write`
  - `security_control_state_write`
- Added focused Python fail-closed coverage in:
  - `test_workspace_billing_control_plane_rust_gate.py`
  - `test_billing_usage_control_plane_rust_gate.py`
  - `test_security_governance_control_plane_rust_gate.py`
  - `test_agent_action_event_control_plane_rust_gate.py`
  - `test_deployed_agent_memory_rust_gate.py`
  - `test_workspace_membership_invite_repository_rust_gate.py`

### Deployed-agent repository action-class hardening - 2026-06-01

- Tightened the shared `control_plane_repository._enforce_control_plane_service_decision(...)` helper so the deployed-agent repository operation names `create`, `update`, and `status_transition` now require the canonical Rust `apply_control_plane_write` action instead of accepting a generic Rust allow.
- Added focused Python fail-closed coverage in `test_deployed_agent_repository_control_plane_rust_gate.py` proving wrong Rust actions block:
  - deployed-agent create
  - deployed-agent lifecycle status transition
  - deployed-agent metadata update

### Workspace profile repository action-class hardening - 2026-06-01

- Tightened the shared `control_plane_repository._enforce_control_plane_service_decision(...)` helper so the repository `workspace_update` operation now requires the canonical Rust `apply_control_plane_write` action instead of accepting a generic Rust allow.
- Added focused Python repository coverage in `test_workspace_profile_repository_rust_gate.py` proving Rust denial and wrong Rust actions both block workspace profile persistence before the repository write.

### Channel acquisition and marketplace upgrade-click action-class hardening - 2026-06-01

- Tightened `channel_user_acquisition_service._enforce_acquisition_control_plane_decision(...)` so channel acquisition touch and conversion writes now require the canonical Rust `apply_control_plane_write` action instead of accepting a generic Rust allow.
- Tightened `deployed_agent_marketplace_service._enforce_upgrade_click_decision(...)` so marketplace upgrade-click writes now require the canonical Rust `apply_control_plane_write` action instead of accepting a generic Rust allow.
- Added focused Python fail-closed coverage in:
  - `test_channel_user_acquisition_rust_gate.py`
  - `test_deployed_agent_marketplace_rust_gate.py`

### Runtime run route orchestration action-class hardening - 2026-06-01

- Tightened `runtime_route_run_handlers_service._enforce_platform_orchestration_decision(...)` so `run_create` now requires the canonical Rust `next_action == create_or_route_run` instead of accepting a generic Rust allow.
- Added focused Python fail-closed coverage in `test_runtime_route_run_handlers_service.py` proving wrong Rust actions block the live start-run response path before the route handler calls the start-response implementation.

### Runtime route registry action-class hardening - 2026-06-01

- Tightened `runtime_route_registry_service._enforce_registered_run_api_decision(...)` so live mutating route operations now require canonical Rust actions instead of accepting a generic Rust allow:
  - `approve_run -> resolve_run_approval`
  - `resume_run -> resume_run`
  - `pause_run -> pause_run`
- Tightened `runtime_route_registry_service._enforce_registered_run_approval_decision(...)` so `resolve_approval` now requires the canonical Rust `next_action == resolve_run_approval`.
- Added focused Python fail-closed coverage in `test_runtime_route_registry_service.py` proving wrong Rust actions block both the registered run-API gate and the registered run-approval gate.

### Runtime workspace state action-class hardening - 2026-06-01

- Tightened `runtime_workspace_service._enforce_runtime_workspace_state_decision(...)` so:
  - `delete_workspace_memory` now requires the canonical Rust `next_action == delete_workspace_memory`
  - `update_workspace_context_file` now requires the canonical Rust `next_action == write_workspace_context_file`
- Added focused Python fail-closed coverage in `test_runtime_workspace_service_rust_gate.py` proving wrong Rust actions block both workspace-memory deletion and workspace context-file writes before mutation.

### Artifact state action-class hardening - 2026-06-01

- Tightened `artifact_service._enforce_artifact_record_state_decision(...)` so artifact record persistence now requires the canonical Rust `next_action == persist_artifact_record`.
- Tightened `artifact_service._enforce_artifact_content_file_decision(...)` so artifact content-file writes now require the canonical Rust `next_action == write_artifact_content_file`.
- Added focused Python fail-closed coverage in `test_execution_artifact_state_rust_gate.py` proving wrong Rust actions block both artifact record persistence and artifact content-file gating before mutation.

### Gateway approval transition action-class hardening - 2026-06-01

- Tightened `gateway_approval_service._enforce_gateway_approval_transition(...)` so:
  - `resolve_gateway_tool_approval` now requires the canonical Rust `next_action == resolve_gateway_tool_approval`
  - `execute_gateway_tool_approval` now requires the canonical Rust `next_action == execute_gateway_tool_approval`
- Added focused Python fail-closed coverage in `test_gateway_approval_service_rust_gate.py` proving wrong Rust actions block the gateway approval transition helper before mutation.

### Hosted sandbox base-image action-class hardening - 2026-06-01

- Tightened `execution_sandbox_service._enforce_hosted_base_image_state_decision(...)` so hosted base-image state writes now require the canonical Rust `next_action == write_hosted_sandbox_base_image` instead of accepting a generic Rust allow.
- Added focused Python fail-closed coverage in `test_execution_artifact_state_rust_gate.py` proving wrong Rust actions block the hosted base-image state helper before file mutation.

### Durable run approval repository enforcement - 2026-06-01

- Added active `runtime-state-store-decision` gates before durable `run_approvals` request creation/upsert, pending resolution, and resolution recording repository writes.
- Added Rust-owned runtime-state operations `create_or_update_approval_request`, `resolve_approval_if_pending`, and `record_approval_resolution` under the `run_approvals` state class, including run-id and payload requirements before Python accesses the durable pool.
- Added focused Python release-gate coverage in `test_run_state_repository_approval_rust_gate.py` and Rust boundary coverage in `runtime_state_store.rs`; existing run-state repository tests now mock Rust admission for DB-shape assertions.

### Runtime API media and control-stream admission - 2026-06-01

- Added active `runtime-session-api-decision` gates before speech-to-text provider execution, text-to-speech provider execution, and runtime control SSE stream creation.
- Added Rust-owned `runtime_control_stream` operation so Python cannot open a runtime control channel after only a local session assertion; Rust now owns the admission decision for that stream boundary.
- Added focused Python release-gate coverage in `test_runtime_runtime_api_media_control_rust_gate.py` and Rust boundary coverage in `runtime_session_api.rs` for STT, TTS, and control-stream admission.

### Runtime attachment target-normalization admission - 2026-06-01

- Added workspace-scoped Rust target-normalization admission before runtime usage credit events are constructed, so Python no longer canonicalizes cloud/local/self-hosted target aliases for metering without Rust approval.
- The runtime attachment Rust command now has focused coverage for public cloud-computer alias normalization and unsupported target denial.
- Added focused Python release-gate coverage in `test_runtime_attachment_rust_gate.py` proving usage metering fails closed before credit-event construction when Rust rejects target normalization.

### Workflow connector execution-runtime admission - 2026-06-01

- Added active `execution-runtime-decision` gates immediately before workflow connector action execution and connector action metering writes.
- Python still performs concrete connector SDK calls and compatibility metering calls, but Rust now receives connector id, action id, node id, policy decision, approval status, external-write flag, and idempotency key before execution proceeds.
- Expanded focused `test_runs_execution_rust_runtime.py` coverage so connector action and usage-metering fields are tracked in the release gate.

### Cloud-computer identity isolation admission - 2026-06-01

- Added active `virtual-computer-decision` identity-context admission before cloud-computer provider resolution and session creation.
- Rust now blocks local identity/cookie reuse overrides for non-local virtual runtimes before Python can create a cloud computer session.
- Expanded focused cloud-computer Rust runtime coverage so identity-context denial fails closed before provider resolution.

### Sage heartbeat readiness-gate admission - 2026-06-01

- Added a distinct `runtime-health-decision` `readiness_gate` call to Sage heartbeat snapshot construction.
- Python still assembles profile, scheduler, queue, plugin, and kernel-health observations, but Rust now owns the readiness verdict reported to callers separately from the general heartbeat summary.
- Added release-gate coverage in `test_sage_heartbeat_service.py` proving heartbeat snapshots call Rust for both `heartbeat_snapshot` and `readiness_gate`.

### Local runtime health Rust classification - 2026-06-01

- Added `runtime-health-decision` classification to `handle_get_local_runtime_health`.
- Python still loads the local runtime record, but Rust now owns the reported `health_state`, readiness payload, and next operational action while preserving the raw worker-reported state as `reported_health_state`.
- Added release-gate coverage in `test_local_runtime_health_rust_gate.py` proving local runtime health uses Rust classification before returning readiness data.

### Run-service create admission release coverage - 2026-06-01

Run creation is now explicitly represented in the Rust-kernel release-gate inventory. The protected `create_run_from_prepared_request` mutation path calls `run-service-decision` before invoking the injected `create_run` persistence function, and `server_modules/tests/test_run_service_create_rust_gate.py` asserts that a Rust denial raises a compatibility `HTTPException` without persisting the run.

This closes the release-gate evidence gap for active run creation admission: create-run enforcement is no longer only present in code, it has a focused Python gate test and is included in `RUST_KERNEL_PYTEST_TARGETS`.

### Active-enforcement manifest promotion - 2026-06-01

The Rust-kernel adapter manifest now marks additional production-enforced commands as `active_enforcement` instead of `shadow_only`: gateway-state, local-worker, outbox-delivery, platform-orchestration, process-lifecycle, run-preparation, run-record, run-trigger, runtime-binding, runtime-health, scheduler, session-lifecycle, session-scheduler, state-transition, and thread-record decisions.

This makes the release gate stricter: these commands must now be present in the ownership manifest and referenced by non-test Python production paths through the shared Rust-kernel client boundary.

### Policy/security focused tests in Rust release gate - 2026-06-01

The Rust-kernel pytest target set now includes the existing focused policy/security tests for agent-computer policy containment, approval requirement composition, and secret-reference inspection. This strengthens Phase 6B coverage without duplicating tests: the release gate now exercises the active Python seams for `check-path-containment`, `approval-requirement`, `classify-risk`, `validate-policy`, `authorize-request`, and `inspect-secret-reference` alongside the newer runtime/kernel gates.

### Kernel contract evidence hardening - 2026-06-01

The Python Rust-kernel adapter now emits a deterministic `decision_id` on normalized decisions and exposes a first-class parity fixture helper for later Python retirement work. The ownership manifest also carries explicit `rust_module`, `python_test_hint`, `rust_test_hint`, and `parity_fixture_family` metadata for each active command.

The release gate now verifies those active-command metadata fields, checks that each active command maps to Python test evidence, and checks that each active command maps to a Rust source file containing unit tests. This makes the ownership manifest a stronger source of truth for later deletion decisions instead of a loose bookkeeping table.

### Canonical tool-policy authority shift - 2026-06-01

The canonical Python tool-policy path now sends structured action-policy and runtime-policy context into Rust `authorize-request` instead of encoding a pre-decided allow/block/approval result into the temporary policy payload. Rust now decides workspace capability denials, disabled-tool blocking, unsupported-capability blocking, blocked raw shell commands, cloud-critical blocking, and runtime-policy approval/block outcomes before Python shapes the legacy `execution_decision` response.

This does not delete the Python policy stack yet, but it moves the decisive merge point for the main tool-admission path into Rust and exposes the Rust `decision_id` on the compatibility response for future parity and retirement work.

### Agent-computer capability helper cutover - 2026-06-01

The legacy `decision_for_capability(...)` helper in the agent-computer policy service no longer computes allow/block/approval locally from capability lists. It now delegates through the Rust-backed `evaluate_agent_computer_request(...)` path, so even capability-only callers use the same Rust `validate-policy` authority boundary as request-level evaluation.

This removes one more Python-side policy fallback and reduces the number of policy entry points that can drift away from Rust during the Phase 6B cutover.

### Secret approval enforcement cutover - 2026-06-01

The secrets broker no longer receives a Rust `require_approval` result and then turns that into denial in Python afterward. When no approval id is present, the broker now lets Rust `inspect-secret-reference` drive the approval-required denial path directly and only translates that into the existing `SecretAccessDeniedError` shape.

Python still owns grant issuance, vault resolution, payload projection, and audit persistence, but Rust now owns the high-risk credential approval boundary itself. Secret access audit metadata also now records the Rust `decision_id` for later parity and retirement work.

### Safe-mode control metadata cutover - 2026-06-01

The safe-mode resolver no longer treats the Rust decision as a generic block and then prefers Python-local matched-chain metadata for the final scope, type, and reason. The Rust `safe-mode-decision` response now carries `control_scope`, `control_type`, and `control_reason` derived from the controlling matched entry, and the Python resolver prefers those Rust-returned fields when reporting disabled capability state.

This keeps Python responsible for collecting the matched control chain, but it moves the final interpretation of which control is authoritative and why into Rust instead of leaving that as a second Python-owned semantics layer.

### Risk blocked-reason normalization cutover - 2026-06-01

The Rust risk classifier now emits final blocked-reason semantics directly for the main policy/risk failure classes, including `kill_state:<state>`, `profile_<health_state>`, `domain_not_allowed`, and `filesystem_scope_not_allowed`. The Python capability-risk classifier now treats those Rust-returned tokens as authoritative instead of needing to derive them locally from kill-state or profile context.

This reduces another Phase 6B translation seam: Python still converts the Rust payload into the existing `CapabilityRiskDecision` shape, but Rust now owns more of the semantic meaning of why a request was blocked.

### Machine-lease release mismatch cutover - 2026-06-01

Rust `machine-lease-decision` now owns release-time lease identity validation instead of Python prechecking mismatched lease ids before the kernel call.

- Added `current_lease_id` support in [lease.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/lease.rs).
- Added Rust-owned reasons for `lease_release_id_mismatch`, `lease_renew_id_mismatch`, and `lease_heartbeat_id_mismatch`.
- Added Rust-owned `next_action` metadata for machine-lease decisions.
- Added a Rust-owned stale-release reason, `stale_lease_release_allowed`.

Updated:

- [machine_lease_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/machine_lease_service.py)
- [test_machine_lease_rust_gate.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_machine_lease_rust_gate.py)

Behavior shift:

- Python no longer returns `lease_mismatch` before consulting Rust.
- Python now asks Rust to evaluate the incoming lease id against the currently bound lease id, then maps the Rust block back into the existing compatibility response shape.
- Stale cleanup now passes `stale=true` into Rust release evaluation, so the kernel owns the semantic reason for stale lease release instead of Python implicitly treating it as a generic release.

### Runtime approval terminal-state cutover - 2026-06-01

Rust `run-approval-decision` now owns more of the terminal approval resolution boundary instead of Python short-circuiting before the kernel.

- Added Rust-owned pending approval id mismatch blocking via `run_approval_pending_mismatch`.
- Treated `decision_submitted` as a terminal processed approval status in Rust.
- The Python resolve path now passes `expected_approval_id` and `approval_expired` into Rust and only performs persistence plus compatibility translation after the Rust decision.

Updated:

- [runtime_run_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_run_approval_service.py)
- [run_approval.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/run_approval.rs)
- [test_runtime_run_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runtime_run_approval_service.py)

Behavior shift:

- Python no longer decides approval-id mismatch before Rust on the main approval-resolution path.
- Python no longer decides `decision_submitted` terminality before Rust.
- Expiry persistence is still performed in Python, but only after Rust has classified the resolution attempt as expired.

### Local run terminal idempotency cutover - 2026-06-01

Rust now owns local run terminal idempotency for worker completion and failure paths instead of Python short-circuiting those statuses before the kernel.

- Added `complete` idempotency to [state.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/state.rs) via `state_already_terminal`.
- Added `complete` and `fail` terminal-item idempotency to [queue.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/queue.rs) via `queue_item_already_terminal`.
- Updated [worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/worker_dispatch_service.py) so `complete_local_run(...)` and `fail_local_run(...)` call Rust first and only translate the Rust-owned already-terminal outcome into the compatibility `already_terminal` response.
- Added focused coverage in [test_worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_worker_dispatch_service.py).

Behavior shift:

- Python no longer decides local-run complete/fail idempotency before Rust.
- Rust is now the authority for whether a terminal local run should be treated as an idempotent no-op or as an invalid transition.

### Local worker ownership cutover - 2026-06-01

Rust `local-worker-decision` now owns worker/run ownership mismatch denial on the main local-run mutation paths instead of Python rejecting mismatched `worker_id` before the kernel.

- Added `current_worker_id` support in [local_worker.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/local_worker.rs).
- Rust now blocks mismatched worker ownership with `local_run_not_owned_by_worker` for:
  - `run_heartbeat`
  - `control_state`
  - `complete_run`
  - `pause_run`
  - `fail_run`
- Updated [worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/worker_dispatch_service.py) so heartbeat, pause, complete, and fail pass both the requested worker id and the current claim owner into Rust, then translate the Rust-owned mismatch back into the existing compatibility `403`.
- Added focused coverage in [test_worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_worker_dispatch_service.py).

Behavior shift:

- Python no longer decides worker ownership mismatch before Rust on these local-run mutation paths.
- Rust is now the authority for whether the caller owns the claimed local run.

### Local run heartbeat claim-missing cutover - 2026-06-01

Rust `local-worker-decision` already knew how to reject `claim_missing`; the live heartbeat path now actually uses that kernel decision instead of raising before Rust.

- Updated [worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/worker_dispatch_service.py) so `heartbeat_local_run(...)` passes `claim_missing` into Rust and only translates the Rust-owned denial back into the existing compatibility `409`.
- Added focused Rust coverage in [local_worker.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/local_worker.rs) for heartbeat `claim_missing`.
- Added focused Python coverage in [test_worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_worker_dispatch_service.py).

Behavior shift:

- Python no longer decides “Run is not claimed by Gateway” before Rust on the local run heartbeat path.
- Rust is now the authority for heartbeat claim existence legality, while Python preserves the old API error shape.

### Local run claim-missing consistency cutover - 2026-06-01

The same `claim_missing` authority boundary is now consistent across the remaining local-run mutation paths, not only heartbeat.

- Updated [worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/worker_dispatch_service.py) so `pause_local_run(...)`, `complete_local_run(...)`, and `fail_local_run(...)` pass `claim_missing` into Rust before any Python-side mutation or status update.
- Added focused Rust coverage in [local_worker.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/local_worker.rs) for `complete_run`, `pause_run`, and `fail_run` `claim_missing` denial.
- Added focused Python compatibility coverage in [test_worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_worker_dispatch_service.py).

Behavior shift:

- Python no longer decides “Run is not claimed by Gateway” before Rust on `pause`, `complete`, or `fail`.
- Rust is now the authority for claim existence legality across all main local-run mutation paths.

### Execution outcome retryability cutover - 2026-06-01

Rust `execution-outcome` is now active in the main Orion execution finalization path instead of remaining only a dormant normalization primitive.

- Added [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py) helper `_normalize_execution_outcome_with_rust(...)`.
- Orion success, timeout, cancellation-like stop, generic failure, and wrapper-level timeout/error paths now attach a Rust-normalized `execution_outcome` payload to the live run.
- Generic Orion retryability now uses Rust `execution-outcome.retryable` as the main transient-failure classifier before deciding whether to stop retrying.
- Added focused coverage in [test_runs_execution_rust_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runs_execution_rust_runtime.py).

Behavior shift:

- Python no longer decides transient-vs-nontransient runtime failure only with local heuristics on the main Orion loop.
- Rust now owns the normalized retryability and retention/audit classification for execution outcomes that reach the main runtime finalization path.

### Execution final-status normalization cutover - 2026-06-01

Rust `execution-runtime-decision` now returns the canonical finalized run status for runtime finalization instead of leaving Python to trust the caller-provided status string as the final mutation payload.

- Added `normalized_status` to [execution_runtime.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/execution_runtime.rs) for `finalize_run`.
- Updated [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py) so `_set_run_status_after_execution_runtime_decision(...)` uses the Rust-normalized status when mutating the live run state.
- Added focused coverage in [test_runs_execution_rust_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runs_execution_rust_runtime.py).

Behavior shift:

- Python no longer treats the input finalization status string as the sole authority on the persisted terminal state.
- Rust now owns canonical final-status normalization for the runtime finalization gate.

### Execution outcome terminal-status cutover - 2026-06-01

Rust `execution-outcome` now returns the canonical terminal run status, and the main Orion runtime paths consume that classification instead of re-deriving terminal state purely from Python branch heuristics.

- Added `final_status` to [execution_outcome.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/execution_outcome.rs).
- Updated [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py) so success, timeout, cancellation-like stop, generic failure, retry exhaustion, and wrapper-level timeout/error paths derive the final runtime status from the Rust-normalized outcome.
- Added focused coverage in [test_runs_execution_rust_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runs_execution_rust_runtime.py).

Behavior shift:

- Python no longer decides the final terminal run status only from local exception-branch heuristics in the main Orion execution loop.
- Rust now owns canonical execution-outcome terminal classification, and Python applies that result during finalization.

### Execution outcome summary/redaction cutover - 2026-06-01

Rust `execution-outcome` now provides the canonical final outcome summary used by the main Orion error/timeout/cancel log paths, so Python no longer has to surface raw exception-derived text as the final message when Rust already has the redacted/truncated preview.

- Added `summary` to [execution_outcome.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/execution_outcome.rs), derived from the redacted stdout/stderr previews and normalized status.
- Updated [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py) so the main Orion timeout, cancellation-like stop, non-retryable failure, retry exhaustion, and wrapper-level error paths emit the Rust-owned outcome summary instead of only the raw Python exception text.
- Added focused coverage in [test_runs_execution_rust_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runs_execution_rust_runtime.py).

Behavior shift:

- Python no longer solely shapes the final failure/timeout message in those runtime finalization paths.
- Rust now owns the canonical redacted/truncated outcome summary that Python emits during finalization.

### Execution outcome record-patch cutover - 2026-06-01

Rust `execution-outcome` now emits a canonical record patch for terminal result metadata, and the main Orion runtime applies that patch instead of assembling the structured outcome metadata locally.

- Added `record_patch` to [execution_outcome.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/execution_outcome.rs), including:
  - canonical `result`
  - canonical terminal `status`
  - structured `execution_outcome` metadata
- Updated [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py) so success, timeout, cancellation-like stop, generic failure, retry exhaustion, and wrapper-level error paths apply the Rust-owned patch to the live run.
- Added focused coverage in [test_runs_execution_rust_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runs_execution_rust_runtime.py).

Behavior shift:

- Python no longer solely assembles the terminal execution-outcome metadata payload for the main Orion finalization path.
- Rust now owns a larger share of the final result patch that Python applies to the run record.

### Execution outcome event-semantics cutover - 2026-06-01

Rust `execution-outcome` now owns the canonical terminal event name and log level used by the main Orion finalization/error paths.

- Added `event` and `log_level` to [execution_outcome.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/execution_outcome.rs).
- Updated [runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py) so timeout, cancellation-like stop, non-retryable failure, retry exhaustion, and wrapper-level timeout/error paths emit Rust-owned event semantics instead of hardcoded Python branch labels.
- Added focused coverage in [test_runs_execution_rust_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runs_execution_rust_runtime.py).

Behavior shift:

- Python no longer solely decides which terminal event label or log level to emit in those execution finalization branches.
- Rust now owns the canonical terminal event semantics for the main Orion outcome path.

### Execution outcome full record-patch emission - 2026-06-01

The Rust outcome kernel now emits the full structured terminal record patch that the Python Orion runtime is already prepared to consume, instead of leaving that patch partially implicit.

- [execution_outcome.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-runtime-kernel/src/execution_outcome.rs) now emits `record_patch.result`, `record_patch.status`, and a structured `record_patch.execution_outcome` payload in addition to event/level fields.
- Focused Rust and Python coverage now assert the full patch shape instead of only isolated outcome fields.

Why this matters:

- The Python finalization path can now apply a real Rust-owned terminal patch, not just status/summary/event fragments.
- This tightens the ownership boundary for terminal result persistence and reduces drift between Rust outcome classification and Python run-record mutation.
## Run-record persistence patch cutover - 2026-06-01

- `run-record-decision` now emits a Rust-owned `record_patch` for:
  - `register_live_run`
  - `persist_snapshot`
- `server_modules/run_execution_handle.py` now applies that patch in:
  - `build_run_record(...)`
  - `durable_run_payload(...)`
- This moves live-record and durable-snapshot shape normalization further into Rust instead of leaving Python to re-decide persisted `status`, `state`, `_event_seq`, and archive defaults after the gate.

## Archive payload run-record cutover - 2026-06-01

- `run-record-decision` now emits a Rust-owned `record_patch` for:
  - `archive_payload`
  - `record_transition`
- `server_modules/run_state_repository.py` now calls `run-record-decision` from `archive_run(...)` before durable archive persistence and applies the Rust patch to the archived payload.
- This moves archive payload normalization further into Rust instead of leaving durable archive writes to persist a Python-shaped final payload after only the runtime-state-store gate.

## Durable transition gate cutover - 2026-06-01

- `server_modules/run_state_repository.py` now calls `run-record-decision` from `record_transition(...)` before writing the durable transition row.
- The repository now resolves the current live run itself and forwards workspace, tenant, and version context into Rust instead of leaving transition legality entirely local to Python.
- Archive payload version parsing in the same repository path now uses safe integer normalization before hitting Rust, so malformed event-sequence values fail closed into `0` instead of raising before the kernel boundary.

## Outbox emit admission cutover - 2026-06-01

- `server_modules/outbox_service.py` now calls `run-record-decision` before emitting:
  - `emit_run_transition_event(...)`
  - `emit_artifact_created_event(...)`
- This activates the existing Rust `emit_transition_outbox` and `emit_artifact_outbox` command families on the live outbox emit path instead of leaving those domain admissions as Python-only payload construction followed by generic outbox delivery gating.

## Queue dead-letter admission cutover - 2026-06-01

- `empyralis-runtime-kernel/src/queue.rs` now supports a Rust-owned `dead_letter` operation.
- `server_modules/run_state_repository.py` now calls `queue-transition-decision` before `append_local_queue_dead_letter(...)` persists a durable dead-letter row.
- This moves another queue-state mutation out of raw Python persistence and into the same Rust queue kernel that already owns claim/release/fail/retry legality.

## Fleet worker registration state-store cutover - 2026-06-01

- `server_modules/run_state_repository.py` now routes `upsert_fleet_worker(...)` through `runtime-state-store-decision` using Rust `upsert_runtime_registration` semantics before persisting the durable fleet-worker row.
- The shared runtime-state-store helper now supports `runtime_id` and non-live-run `state_class` routing instead of assuming every write is a live-run mutation.
- This moves fleet-worker registration writes under the existing Rust runtime registration kernel instead of leaving them as pure Python payload shaping followed by Postgres persistence.

## Fleet queue partition state-store cutover - 2026-06-01

- `empyralis-runtime-kernel/src/runtime_state_store.rs` now supports `upsert_fleet_queue_partition` with Rust-owned `fleet_queue_partitions` state-class routing.
- `server_modules/run_state_repository.py` now routes `upsert_fleet_queue_partition(...)` through `runtime-state-store-decision` before durable partition persistence.
- This brings the durable fleet capacity snapshot path under the Rust runtime-state-store kernel instead of leaving it as raw Python-to-Postgres mutation logic.

## Live-run delete state-store cutover - 2026-06-01

- `empyralis-runtime-kernel/src/runtime_state_store.rs` now supports `delete_live_run` as a first-class destructive live-run state-store operation.
- `server_modules/run_state_repository.py` now resolves the current live run and routes `delete_live_run(...)` through `runtime-state-store-decision` before deleting the durable row.
- This removes another blind Python-side destructive mutation from the durable live-run repository path.

## Notification checkpoint state-store cutover - 2026-06-01

- `server_modules/runtime_state_store.py` now routes local SQLite checkpoint writes through `runtime-state-store-decision` for:
  - `upsert_notification(...)`
  - `mark_notifications_read(...)`
  - `upsert_notification_device(...)`
  - `upsert_notification_delivery(...)`
- The local checkpoint helper now forwards `notification_id`, `device_id`, and `actor_id` into the Rust state-store kernel so notification-side checkpoint writes are no longer raw Python-to-SQLite mutations.

## Chat-stream and channel-event checkpoint cutover - 2026-06-01

- `server_modules/runtime_state_store.py` now routes local SQLite checkpoint writes through `runtime-state-store-decision` for:
  - `upsert_chat_stream_state(...)`
  - `append_channel_event(...)`
- The local checkpoint helper now forwards `trace_id` into the Rust state-store kernel so append-only channel-event writes can be evaluated with the same Rust review semantics instead of being blind Python-to-SQLite mutations.

## Checkpoint replacement cutover - 2026-06-01

- `server_modules/runtime_state_store.py` now routes destructive local SQLite checkpoint replacements through `runtime-state-store-decision` for:
  - `replace_local_runtime_state(...)`
  - `replace_channel_events(...)`
- These bulk delete-and-rebuild checkpoint paths now hit Rust `checkpoint_snapshot` before any local rows are cleared, instead of remaining blind Python-side destructive checkpoint rewrites.

## Checkpoint cleanup/delete cutover - 2026-06-01

- `server_modules/runtime_state_store.py` now routes local SQLite cleanup/delete paths through `runtime-state-store-decision` for:
  - `delete_live_run_state(...)`
  - `delete_chat_stream_sessions_older_than(...)`
- The local checkpoint helper now supports `retention_days` and `records_requested`, so prune-style cleanup can hit Rust `prune_records` before deleting rows.

## Gateway websocket session lifecycle cutover - 2026-06-01

- `server_modules/gateway_protocol_service.py` now routes live gateway websocket session-state mutations through Rust `gateway-state-decision` before repository writes for:
  - `mark_gateway_session_connected(...)`
  - `touch_gateway_session(...)`
  - `mark_gateway_session_disconnected(...)`
- This covers the active connect, response/event, heartbeat, disconnect, and socket-error paths, so the Python websocket handler is no longer the first authority for those gateway session lifecycle mutations.

## Gateway registration identity sync cutover - 2026-06-01

- `server_modules/gateway_state_repository.py` now routes `sync_gateway_registration_identity(...)` through Rust `gateway-state-decision` before rewriting gateway registration tenant/workspace/user/device binding state.
- This closes a previously ungated repository mutation used by session creation and token rotation flows, so identity re-binding is no longer a blind Python-side write.

## Deployed-agent repository create/update cutover - 2026-06-01

- `server_modules/control_plane_repository.py` now routes `create_deployed_agent(...)` and `update_deployed_agent(...)` through Rust `control-plane-service-decision` before local or Postgres persistence.
- This moves shared deployed-agent configuration writes behind the control-plane kernel at the repository layer, so service callers no longer create or update deployed-agent records through blind Python-side mutation paths.
- Deployment-state changes now also hit Rust `status_transition` before the generic update write, so deployed-agent lifecycle moves are evaluated with the stronger control-plane transition contract instead of only a broad record-update gate.

## Deployed-agent lifecycle mutation-plan cutover - 2026-06-01

- `empyralis-runtime-kernel/src/deployed_agent_service.rs` now emits Rust-owned `mutation_plan` payloads for:
  - `pause`
  - `kill`
  - `recover`
  - `archive`
- `server_modules/deployed_agent_service.py` now consumes that Rust mutation plan for target deployment state and lifecycle side effects such as:
  - disabling channels on archive
  - stopping active runs on archive or kill
  - activating or clearing kill-switch metadata
  - pause timestamp behavior
- This moves more of the final lifecycle mutation semantics out of Python branch shaping and into the Rust service decision layer.

## Runtime binding next-action cutover - 2026-06-01

- `server_modules/deployed_agent_virtual_runtime_service.py` now follows Rust `runtime-binding-decision.next_action` for runtime session reuse on cloud and self-hosted binding paths instead of deciding reuse locally from Python metadata comparison.
- This moves the reuse-vs-create binding authority closer to the Rust kernel boundary, so Python binding helpers consume Rust binding actions instead of re-deriving them.

## Runtime termination gate cutover - 2026-06-01

- `server_modules/deployed_agent_virtual_runtime_service.py` now routes cloud and self-hosted bound runtime session termination through Rust `deployed-virtual-runtime-service-decision` when the deployed-agent record can be resolved from session metadata.
- This moves the terminate-and-meter admission boundary into Rust on the normal deployed-agent runtime session path instead of letting Python terminate sessions directly before the virtual-runtime kernel participates.

## Runtime action decision cutover - 2026-06-01

- `server_modules/deployed_agent_virtual_runtime_service.py` now routes bound cloud and self-hosted runtime actions through Rust `runtime-action-decision` before provider execution.
- Python still serializes provider-specific action arguments, but Rust now owns:
  - action support/deny
  - kill-state blocking
  - canonical `runtime_action` selection
- This reduces another Python-owned runtime branch where connector/action mapping and action admission were previously decided locally.

## Runtime-session kill termination-plan cutover - 2026-06-01

- `server_modules/deployed_agent_service.py` now resolves the bound runtime-session type once, sends it into Rust `deployed-agent-service-decision` for `runtime_session_kill`, and follows the Rust `mutation_plan` to choose cloud termination, self-hosted termination, and session-record termination.
- `empyralis-runtime-kernel/src/deployed_agent_service.rs` now emits a `runtime_session_kill` mutation plan keyed off the bound runtime type, so Python no longer fan-outs blindly to both runtime termination helpers before closing the session record.

## Run-service create approval cutover - 2026-06-01

- `server_modules/run_service.py` now treats Rust `run-service-decision` approval results as authoritative on the create path.
- When Rust returns `approval_required`, Python now:
  - defers local enqueue
  - records pending approval state
  - returns `waiting_for_input`
- This closes a live gap where the create path previously accepted Rust `requires_approval` but still continued as if the run were fully admitted.
- Billing external mutation cutover:
  - `billing_service.py` now calls Rust `control-plane-service-decision` before starting Stripe checkout, billing portal, and credit-purchase checkout sessions.
  - This moves billing-provider side effects behind Rust admission instead of only gating the later repository write.

## Workspace emergency-stop mutation-plan cutover - 2026-06-01

- `server_modules/deployed_agent_service.py` now follows Rust `mutation_plan` for workspace emergency stop instead of hardcoding suspension, run-stop, and workspace-emergency-stop metadata activation in Python.
- `empyralis-runtime-kernel/src/deployed_agent_service.rs` now emits a canonical emergency-stop mutation plan.

## Gateway registration revocation follow-up cutover - 2026-06-01

- `gateway_registry_service.py` now performs the Rust-backed registration revoke before revoking the auth device link, so local auth-link mutation no longer happens ahead of the gateway-state authority boundary.
- `routes_gateway.py` now follows a service-owned revocation follow-up plan for live connection shutdown and dedicated workstation revocation instead of hardcoding those follow-up actions in the route.

## Thread service next-action cutover - 2026-06-01

- `thread_service.py` now follows Rust `thread-record-decision.next_action` instead of treating any non-error decision as sufficient.
- Rust-normalized thread title, request id, list limit, and primary-thread fallback behavior now shape the Python service path.

## Run entry preparation next-action cutover - 2026-06-01

- `runtime_run_entry_service.py` now follows Rust `run-preparation-decision.next_action` instead of treating preparation as a simple allow/block gate.
- Rust-normalized engine, workflow id, and metadata preparation fields now shape the dispatched run request before Python hands execution off.

## Activity ledger next-action cutover - 2026-06-01

- `activity_ledger_service.py` now requires Rust `runtime-state-store-decision.next_action == append_activity_ledger_event` before repository persistence.
- This closes another “Rust allow is enough” path on a durable event-write surface.

## Webhook trigger next-action cutover - 2026-06-01

- `runtime_webhook_trigger_service.py` now requires Rust `next_action == register_webhook_trigger` for trigger registration and `next_action == start_run` for webhook ingest.
- This closes another external-ingest path where Python previously treated any Rust allow as enough.

## Approval memory next-action cutover - 2026-06-01

- `agent_approval_memory_service.py` now requires Rust `next_action == write_approval_memory_rule` for rule writes and `next_action == consume_approval_memory_rule` for rule consumption.
- This closes another durable workspace-state path where Python previously treated any Rust allow as enough.

## Workspace memory and transcript next-action cutover - 2026-06-01

- `memory_service.py` now requires Rust-owned `next_action` contracts before workspace-memory persistence:
  - `upsert_workspace_memory -> write_workspace_memory`
  - `delete_workspace_memory -> delete_workspace_memory`
  - `append_workspace_daily_log -> append_workspace_daily_log`
  - `update_workspace_context_file -> write_workspace_context_file`
- `session_transcript_store.py` now requires Rust `next_action == append_session_transcript` before transcript append persistence.
- This closes two more durable state-write paths where Python previously treated any Rust allow as enough.

## Shared operational board next-action cutover - 2026-06-01

- `shared_operational_board_service.py` now requires Rust `next_action == write_shared_operational_board_entry` before opening the board log file for append.
- This closes another durable workspace-state path where Python previously treated any Rust allow as enough.

## Run API next-action cutover - 2026-06-01

- `runtime_runs_api.py` now validates Rust `run-api-decision.next_action` against the canonical action set for:
  - `start_turn`
  - `start_run`
  - `get_run`
  - `stream_chat`
  - `cancel_run`
  - `retry_run`
  - `resume_run`
  - `approve_run`
  - `webhook_trigger`
- This closes a run-entry orchestration seam where Python previously treated any non-error Rust response as sufficient and only recorded `next_action` as metadata.

## Billing control-plane next-action cutover - 2026-06-01

- `billing_service.py` now requires Rust `control-plane-service-decision` billing mutations to return `mutation_plan.next_action == apply_control_plane_write` before Stripe checkout or portal side effects run.
- This closes another orchestration seam where Python previously treated any Rust mutation plan with `apply=true` as sufficient for external billing side effects.

## Gateway service next-action cutover - 2026-06-01

- `routes_gateway.py` now requires canonical Rust `gateway-service-decision.next_action` values before route-layer gateway dispatch continues:
  - tool and browser operations must return `dispatch_gateway_operation`
  - approval resolution must return `persist_approval_decision`
  - health checks must return `publish_gateway_health`
- This closes another gateway orchestration seam where Python previously treated any non-error Rust response as sufficient before provider dispatch.

## Workspace admin control-plane next-action hardening - 2026-06-01

- `workspace_admin_service.py` now requires canonical Rust `control-plane-service-decision` actions on the shared admin mutation helper:
  - `membership_update -> apply_control_plane_write`
  - `secret_reference_write -> apply_control_plane_write`
  - `membership_remove -> apply_control_plane_destructive_write`
- This closes another control-plane seam where Python previously treated any Rust mutation plan with `apply=true` as sufficient for workspace admin mutations.

## Workspace invite create service cutover - 2026-06-01

- `workspace_admin_service.py` now calls Rust `control-plane-service-decision` before `invite_workspace_member(...)` creates a workspace invite.
- The service now requires the canonical Rust action class `invite_create -> apply_control_plane_write` before repository persistence.
- This closes a remaining service-layer invite mutation gap where Python previously delegated straight to the repository without asserting the service-level Rust decision.

## Control-plane repository invite action hardening - 2026-06-01

- `control_plane_repository.py` now validates canonical Rust `next_action` classes for invite and pilot-invite mutations:
  - `invite_create -> apply_control_plane_write`
  - `invite_accept -> apply_control_plane_write`
  - `invite_revoke -> apply_control_plane_destructive_write | return_existing_control_plane_record`
  - `pilot_invite_create -> apply_control_plane_write`
  - `pilot_invite_claim -> apply_control_plane_write`
  - `pilot_invite_revoke -> apply_control_plane_destructive_write`
- `revoke_workspace_invite(...)` now loads the current invite status before calling Rust so Rust can correctly block accepted invites and return revoked invites idempotently instead of being asked against a pre-baked `revoked` target state.

## Control-plane repository billing action hardening - 2026-06-01

- `control_plane_repository.py` now validates canonical Rust `next_action == apply_control_plane_write` for:
  - `workspace_billing_plan_update`
  - `workspace_billing_account_write`
  - `workspace_billing_subscription_write`
- Added focused repository coverage proving unexpected Rust actions fail closed before billing account or subscription storage mutation begins.

## Control-plane repository privacy and scope-delete action hardening - 2026-06-01

- `control_plane_repository.py` now validates canonical Rust action classes for:
  - `external_user_privacy_request_write -> apply_control_plane_write`
  - `external_user_privacy_audit_write -> apply_control_plane_write`
  - `external_user_privacy_delete -> apply_control_plane_destructive_write`
  - `deployed_agent_scope_data_delete -> apply_control_plane_destructive_write`
  - `workspace_scope_data_delete -> apply_control_plane_destructive_write`
- Added focused repository coverage proving unexpected Rust actions fail closed before privacy-request writes or workspace-scope destructive deletes start.

## Workspace routes control-plane next-action hardening - 2026-06-01

- `routes_workspaces.py` now requires canonical Rust `control-plane-service-decision` actions before route-layer workspace mutations continue:
  - `workspace_create`
  - `workspace_update`
  - `transparency_settings_update`
  - `workspace_routing_update`
  - `workspace_policy_update`
  - `sage_tool_policy_update`
  - `invite_create`
  - `secret_reference_write`
  all require `apply_control_plane_write`
- Added focused route coverage proving unexpected Rust actions fail closed before workspace creation or invite-create service dispatch begins.

## Control-plane repository governance and event action hardening - 2026-06-01

- `control_plane_repository.py` now validates canonical Rust `apply_control_plane_write` action classes for:
  - `governance_hold_write`
  - `governance_hold_release`
  - `agent_channel_event_write`
  - `personal_context_event_write`
  - `personal_context_event_seen_update`
  - `activity_ledger_event_write`
  - `agent_trace_create`
  - `agent_trace_event_write`
  - `agent_trace_finish`
  - `agent_secret_access_event_write`
  - `agent_egress_event_write`
- Added focused repository coverage proving unexpected Rust actions fail closed before activity-ledger persistence or governance-hold release begins.

## Skills registry, Sage dreaming, and deployed-agent knowledge exact-action hardening - 2026-06-01

- `skills_registry.py` now requires canonical Rust `runtime-state-store-decision.next_action == write_skills_registry_file` before marketplace registry files are persisted.
- `sage_dreaming_pipeline.py` now requires the Rust-selected action to match the requested dreaming write operation:
  - `write_sage_dreaming_memory_state`
  - `write_sage_dreaming_staging_file`
- `deployed_agent_service.py` now requires canonical Rust `runtime-state-store-decision.next_action == write_deployed_agent_knowledge_file` before deployed-agent knowledge files are written.
- Added focused fail-closed coverage proving wrong Rust actions block all three file-write paths before persistence begins.

## Sage memory and outcome-pack exact-action hardening - 2026-06-01

- `sage_memory_service.py` no longer treats `runtime-state-store-decision` as a generic allow/block gate.
- It now requires the Rust-selected canonical action for each Sage memory mutation:
  - `upsert_sage_memory_entry -> write_sage_memory_entry`
  - `update_sage_memory_entry -> update_sage_memory_entry`
  - `delete_sage_memory_entry -> delete_sage_memory_entry`
  - `wipe_sage_memory -> wipe_sage_memory`
- `outcome_packs.py` now requires the Rust-selected action to match the exact file-write operation:
  - `write_outcome_pack_spreadsheet_file`
  - `write_outcome_pack_document_file`
  - `write_outcome_pack_remote_sync_file`
- Added focused fail-closed coverage proving wrong Rust actions block Sage memory persistence and outcome-pack file-write gating before mutation begins.

## Outbox delivery exact-action hardening - 2026-06-01

- `outbox_service.py` no longer treats `outbox-delivery-decision` as a generic allow/block gate on delivery persistence and claim paths.
- The shared outbox delivery helper now requires the Rust-selected canonical action for:
  - `persist_event -> persist_outbox_event`
  - `claim_due -> claim_due_outbox_events`
  - `patch_payload -> patch_outbox_event_payload`
  - `mark_delivered -> mark_outbox_event_delivered`
  - `record_failure -> record_outbox_delivery_failure`
  - `list_undelivered -> list_undelivered_outbox_events`
  - `list_poisoned -> list_poisoned_outbox_events`
  - `delivery_status -> get_outbox_delivery_status`
- Added focused fail-closed coverage proving wrong Rust actions block outbox persistence and outbox-claim execution before repository mutation begins.

## Local worker dispatch exact-action hardening - 2026-06-01

- `worker_dispatch_service.py` no longer treats `local-worker-decision` as a generic allow/block gate on worker queue and run-transition operations.
- The shared local-worker helper now requires the Rust-selected canonical action for:
  - `claim_run -> claim_local_run`
  - `claim_run -> return_backpressure` when the queue is empty
  - `worker_heartbeat -> record_worker_heartbeat`
  - `run_heartbeat -> record_run_heartbeat`
  - `complete_run -> complete_local_run`
  - `pause_run -> pause_local_run`
  - `fail_run -> fail_local_run`
- Added focused fail-closed coverage proving wrong Rust actions block worker completion handling before Python continues the local-run transition path.

## Runtime attachment exact-action hardening - 2026-06-01

- `runtime_attachment_service.py` no longer treats `runtime-attachment-decision` as a generic allow/block gate on shared runtime-attachment operations.
- The shared runtime-attachment helper now requires the Rust-selected canonical action for:
  - `normalize_target -> normalize_runtime_target_id`
  - `build_targets -> build_workspace_runtime_targets`
  - `select_attachment -> select_runtime_attachment`
  - `self_hosted_gate -> ensure_self_hosted_node_gate`
  - `local_companion_gate -> select_local_companion_attachment`
  - `usage_credit_event -> build_runtime_usage_credit_event`
- Added focused fail-closed coverage proving wrong Rust actions block runtime-target normalization and usage-credit event shaping before Python continues.

## Runtime session API exact-action hardening - 2026-06-01

- `runtime_runtime_api.py` no longer treats `runtime-session-api-decision` as a generic allow/block gate on shared runtime-session API operations.
- The shared runtime-session API helper now requires the Rust-selected canonical action for:
  - `stt_request -> transcribe_audio`
  - `tts_request -> synthesize_tts`
  - `machine_control -> apply_machine_control`
  - `run_hard_kill -> hard_kill_runtime_run`
  - `runtime_register -> register_runtime`
  - `runtime_bootstrap -> bootstrap_runtime_companion`
  - `self_hosted_command_enqueue -> enqueue_self_hosted_command`
  - `self_hosted_command_claim -> claim_self_hosted_command`
  - `self_hosted_command_result -> record_self_hosted_command_result`
  - `hardware_action_execute -> execute_hardware_action`
  - `hardware_action_stop -> stop_hardware_action`
  - `runtime_start -> start_runtime_session`
  - `runtime_heartbeat -> touch_runtime_session`
  - `runtime_stop -> stop_runtime_session`
  - `runtime_revoke -> revoke_runtime_session`
  - `runtime_recover -> recover_runtime_session`
  - `runtime_control_stream -> stream_runtime_control`
  - `runtime_task_claim -> claim_runtime_task`
  - `runtime_task_heartbeat -> record_runtime_task_heartbeat`
  - `runtime_task_control_state -> read_runtime_task_control_state`
  - `runtime_task_complete -> complete_runtime_task`
  - `runtime_task_pause -> pause_runtime_task`
  - `runtime_task_fail -> fail_runtime_task`
- Added focused fail-closed coverage proving wrong Rust actions block STT provider execution and runtime-control stream opening before Python continues.

## Docker sandbox exact-action hardening - 2026-06-01

- `docker_execution_sandbox.py` no longer treats the Rust sandbox builder and launch decisions as generic allow/block gates.
- The shared Docker sandbox helper now requires:
  - `build-sandbox-command -> build_hardened_container_command`
  - `sandbox-execution-decision(operation=launch_worker) -> launch_hosted_worker`
- Added focused fail-closed coverage proving wrong Rust actions block:
  - Docker command construction before the command is accepted
  - Docker worker launch before `subprocess.run(...)` executes

## Hardware action broker cloud runtime exact-action hardening - 2026-06-01

- `hardware_action_broker_service.py` no longer treats the cloud `runtime-action-decision` as a generic allow/block gate.
- The shared cloud runtime-action helper now requires canonical Rust `next_action == execute_cloud_runtime_action` before Python continues into cloud runtime session creation and downstream execution.
- Added focused fail-closed coverage proving a wrong Rust action blocks the cloud runtime-action gate before Python proceeds.

## Run approval exact-action hardening - 2026-06-01

- `runtime_run_approval_service.py` no longer treats `run-approval-decision` as a generic allow/block gate on its shared mutation helper.
- The shared run-approval helper now requires canonical Rust actions for:
  - `create_request -> create_or_update_approval_request`
  - `submit_decision -> submit_run_decision`
  - `resolve_approval -> resolve_run_approval`
  - `record_resolution -> record_approval_resolution`
- Added focused fail-closed coverage proving a wrong Rust action blocks the shared approval-resolution gate before Python continues.

## Machine lease exact-action hardening - 2026-06-01

- `machine_lease_service.py` no longer treats `machine-lease-decision` as a generic allow/block gate on its shared lease helper.
- The shared machine-lease helper now requires canonical Rust actions for:
  - `acquire -> persist_machine_lease_transition`
  - `renew -> persist_machine_lease_transition`
  - `release -> release_machine_lease_transition`
  - `heartbeat -> touch_machine_lease`
- Added focused fail-closed coverage proving a wrong Rust action blocks the shared machine-lease gate before Python continues the lease transition.

## Runtime state store exact-action hardening - 2026-06-01

- `runtime_state_store.py` no longer treats `runtime-state-store-decision` as a generic allow/block gate on its shared local SQLite mutation helper.
- The shared runtime-state store helper now requires canonical Rust actions for:
  - `upsert_runtime_session -> write_runtime_session`
  - `delete_runtime_session -> delete_runtime_session`
  - `upsert_runtime_session_turn -> write_runtime_session_turn`
  - `delete_runtime_session_turn -> delete_runtime_session_turn`
  - `upsert_chat_stream_state -> write_chat_stream_state`
  - `upsert_live_run -> write_live_run_state`
  - `delete_live_run -> delete_live_run_state`
  - `append_channel_event -> append_channel_event`
  - `checkpoint_snapshot -> write_checkpoint_snapshot`
  - `upsert_notification -> write_notification`
  - `mark_notification_read -> mark_notification_read`
  - `register_notification_device -> write_notification_device`
  - `update_notification_delivery -> write_notification_delivery`
  - `prune_records -> prune_state_records`
- Added focused fail-closed coverage proving wrong Rust actions block:
  - live-run checkpoint persistence before SQLite mutation
  - chat-stream prune before SQLite deletion

## Run state repository exact-action hardening - 2026-06-01

- `run_state_repository.py` no longer treats `runtime-state-store-decision` as a generic allow/block gate on its shared Postgres-backed run-state helper.
- The shared run-state repository helper now requires canonical Rust actions for:
  - `upsert_live_run -> write_live_run_state`
  - `delete_live_run -> delete_live_run_state`
  - `archive_run -> write_run_archive`
  - `create_or_update_approval_request -> write_run_approval_request`
  - `resolve_approval_if_pending -> resolve_run_approval`
  - `record_approval_resolution -> record_run_approval_resolution`
  - `upsert_runtime_registration -> write_runtime_registration`
  - `upsert_fleet_queue_partition -> write_fleet_queue_partition`
- Added focused fail-closed coverage proving wrong Rust actions block:
  - the shared run-state repository helper before live-run writes continue
  - approval-request persistence before durable pool access

## Gateway protocol service exact-action hardening - 2026-06-01

- `gateway_protocol_service.py` no longer treats its Rust-gated frame-send and session-mutation helpers as generic allow/block boundaries.
- The shared gateway protocol helpers now require canonical Rust actions for:
  - `send_gateway_protocol_request_frame -> send_gateway_protocol_request_frame`
  - `mark_session_connected -> mark_gateway_session_connected`
  - `mark_session_disconnected -> mark_gateway_session_disconnected`
  - `touch_session -> touch_gateway_session`
- Added focused fail-closed coverage proving wrong Rust actions block:
  - outbound gateway protocol request-frame admission
  - gateway session connect mutation admission

## Execution sandbox service exact-action hardening - 2026-06-01

- `execution_sandbox_service.py` no longer treats its shared `sandbox-execution-decision` helpers as generic allow/block boundaries.
- The shared hosted-sandbox helpers now require canonical Rust actions for:
  - `prepare_sandbox -> prepare_isolated_workspace`
  - `launch_worker -> launch_hosted_worker`
  - `sandbox_profile -> build_restricted_sandbox_profile`
  - `environment -> scrub_environment`
  - `cleanup_policy -> cleanup_ephemeral_workspace`
- Added focused fail-closed coverage proving wrong Rust actions block:
  - hosted sandbox preparation before OS-facing setup continues
  - hosted sandbox environment shaping before env scrubbing continues

## Cloud runtime adapter exact-action hardening - 2026-06-01

- `hardware_runtime_adapters/cloud_computer_adapter.py` no longer treats `virtual-computer-decision` as a generic allow/block gate on its shared cloud runtime-action helper.
- The shared cloud runtime adapter helper now requires canonical Rust `next_action == execute_cloud_runtime_action` before Python continues into cloud runtime action shaping and dispatch.
- Added focused fail-closed coverage proving a wrong Rust action blocks the shared cloud runtime-action gate before Python continues.

## Deployed runtime binding exact-action hardening - 2026-06-01

- `deployed_agent_virtual_runtime_service.py` no longer treats `runtime-binding-decision` as a generic allow/block gate on its shared runtime-binding helper.
- The shared deployed runtime-binding helper now requires canonical Rust actions for:
  - `ensure_cloud_runtime_session -> create_cloud_runtime_session | create_local_gateway_runtime_session | reuse_runtime_session | skip_runtime_binding`
  - `ensure_self_hosted_runtime_session -> create_self_hosted_runtime_session | reuse_runtime_session | skip_self_hosted_binding`
- Added focused fail-closed coverage proving wrong Rust actions block:
  - the shared runtime-binding helper itself
  - cloud runtime session creation before the provider session is opened

## Hardware runtime session binding exact-action hardening - 2026-06-01

- `hardware_runtime_session_service.py` no longer creates cloud/default/local-gateway hardware runtime sessions without consuming `runtime-binding-decision`.
- The shared hardware runtime-session helper now requires canonical Rust actions for:
  - `cloud_default -> ensure_runtime_session -> skip_runtime_binding`
  - `empyralis_cloud_computer -> ensure_cloud_runtime_session -> create_cloud_runtime_session`
  - `user_device_gateway -> ensure_runtime_session -> create_local_gateway_runtime_session`
- Added focused fail-closed coverage proving a wrong Rust action blocks local-gateway runtime-session creation before `session_service.create_session(...)`.
- The current cut deliberately does not claim self-hosted binding coverage in this helper yet, because the shared session-creation surface does not currently receive the full self-hosted attachment/profile facts that the Rust binding contract requires.

## Workspace context and agent memory exact-action hardening - 2026-06-01

- `workspace_context.py` no longer treats `runtime-state-store-decision` as a generic allow/block gate on shared workspace context file initialization and save helpers.
- The shared workspace-context helper now requires canonical Rust actions for:
  - `initialize_workspace_context_file -> initialize_workspace_context_file`
  - `save_workspace_context_file -> save_workspace_context_file`
- `agent_memory.py` no longer treats `append_agent_memory_daily_log` admission as a generic allow/block gate before daily-log file mutation.
- The shared agent-memory daily-log helper now requires the canonical Rust action:
  - `append_agent_memory_daily_log -> append_agent_memory_daily_log`
- Added focused fail-closed coverage proving wrong Rust actions block:
  - workspace context file save before file mutation
  - workspace context file initialization before file creation
  - agent memory daily-log append before log-file mutation

## Rust authorization shadow bridge exact-action hardening - 2026-06-01

- `rust_authorization_shadow_service.py` no longer trusts only the coarse Rust authorization decision class on opt-in and shadow authorization paths.
- The Rust authorization bridge now requires canonical Rust `next_action` values for successful authorization responses:
  - `allow -> allow_tool_execution`
  - `require_approval -> request_tool_execution_approval`
- Invalid Rust authorization actions now fail closed as a blocked Rust decision before the bridge treats Rust as authoritative.
- Added focused coverage proving:
  - shadow mode still preserves the Python decision when Rust returns the canonical approval action
  - opt-in Rust authorization fails closed when Rust returns the wrong action for an allow decision

## Local runtime health exact-action hardening - 2026-06-01

- `local_queue.py` no longer trusts `runtime_health_decision(operation=runtime_lane_health)` as a generic health classification payload.
- The local runtime health boundary now requires the Rust response to select one of the canonical runtime-health operator actions:
  - `restore_rust_kernel`
  - `inspect_plugin_system`
  - `investigate_runtime_health`
  - `complete_workspace_bootstrap`
  - `request_owner_approval`
  - `wait_for_quiet_hours`
  - `monitor_running_work`
  - `wait_for_retry`
  - `claim_next_work`
  - `idle`
- Added focused fail-closed coverage proving a wrong Rust action blocks local runtime health normalization instead of being forwarded to callers.

## Connectors core process lifecycle exact-action hardening - 2026-06-01

- `connectors_core.py` no longer treats `process_lifecycle_decision(operation=start)` as a generic allow/block gate before local provider CLI login launch.
- The connectors-core process lifecycle boundary now requires the canonical Rust action:
  - `start -> spawn`
- Added focused fail-closed coverage proving a wrong Rust action blocks the Anthropic CLI login `subprocess.Popen(...)` call before launch.

## Policy preset exact-action hardening - 2026-06-01

- `empyralis-runtime-kernel/src/presets.rs` now emits the canonical preset action:
  - `apply_policy_preset`
- `policy_presets.py` no longer treats the Rust `policy-preset` response as a generic policy payload.
- The Python preset bridge now requires:
  - `policy-preset -> apply_policy_preset`
- Added focused coverage proving:
  - the canonical preset action is accepted
  - a wrong Rust action blocks preset application with `unexpected_next_action`

## Queue transition exact-action hardening - 2026-06-01

- `empyralis-runtime-kernel/src/queue.rs` now emits canonical queue transition actions, including:
  - `enqueue_queue_item`
  - `claim_queue_item`
  - `complete_queue_item`
  - `schedule_queue_retry`
  - `fail_queue_item`
  - `retry_queue_item`
  - `cancel_queue_item`
  - `release_queue_item`
  - `dead_letter_queue_item`
- `machine_lease_service.py` no longer treats `queue-transition-decision` as a generic allow/approval/block gate.
- The shared queue-transition helper now requires the exact Rust action for each queue transition operation, including the retry-vs-terminal split on `fail`.
- Added focused coverage proving:
  - the canonical claim action is accepted
  - a wrong Rust action blocks a retry-scheduled `fail` transition

## Worker-dispatch state transition exact-action hardening - 2026-06-01

- `empyralis-runtime-kernel/src/state.rs` now emits canonical state transition actions, including:
  - `complete_state_transition`
  - `fail_state_transition`
- `worker_dispatch_service.py` no longer treats `state-transition-decision` as a generic allow/block gate on live complete/fail worker paths.
- The worker-dispatch state transition helper now requires:
  - `complete -> complete_state_transition`
  - `fail -> fail_state_transition`
- Added focused fail-closed coverage proving a wrong Rust action blocks `complete_local_run(...)` before queue mutation or run-status mutation.

## Deployed runtime action exact-action hardening - 2026-06-01

- `deployed_agent_virtual_runtime_service.py` no longer treats `runtime-action-decision` as a generic allow/block gate on live bound runtime action execution.
- The shared deployed runtime-action helper now requires canonical Rust actions by runtime binding:
  - `cloud_computer_agent -> execute_cloud_runtime_action | skip_runtime_action`
  - `self_hosted_agent -> execute_self_hosted_runtime_action | skip_runtime_action`
- Added focused fail-closed coverage proving a wrong Rust action blocks cloud runtime `execute_action(...)` before dispatch.

## Deployed virtual runtime service exact-action hardening - 2026-06-01

- `deployed_agent_virtual_runtime_service.py` no longer treats `deployed-virtual-runtime-service-decision` as a generic allow/block gate on its shared service-level helper.
- The shared deployed virtual-runtime service helper now requires canonical Rust actions for its live service operations:
  - `build_policy_payload -> build_deployed_agent_virtual_runtime_payload`
  - `execute_cloud_tool -> execute_bound_runtime_tool_call`
  - `terminate_cloud_session -> terminate_and_meter_runtime_session`
  - `terminate_self_hosted_session -> terminate_and_meter_runtime_session`
- Added focused fail-closed coverage proving:
  - the canonical build-policy action is accepted
  - a wrong Rust action blocks the cloud runtime termination service path

## Run-state repository outbox and queue exact-action hardening - 2026-06-01

- `run_state_repository.py` no longer treats `outbox-delivery-decision` as a generic allow/block gate in its shared repository helper.
- The shared outbox repository helper now requires canonical Rust actions for:
  - `persist_event -> persist_outbox_event`
  - `claim_due -> claim_due_outbox_events`
  - `patch_payload -> patch_outbox_event_payload`
  - `mark_delivered -> mark_outbox_event_delivered`
  - `record_failure -> record_outbox_delivery_failure`
- `run_state_repository.py` also no longer treats `queue-transition-decision` as a generic allow/block gate in its shared queue-claim repository helper.
- The shared queue-claim repository helper now requires canonical Rust actions for:
  - `claim -> claim_queue_item`
  - `release -> release_queue_item`
  - `dead_letter -> dead_letter_queue_item`
- Added focused fail-closed coverage proving:
  - a wrong Rust action blocks outbox event persistence before pool access
  - a wrong Rust action blocks queue claim persistence before pool access

## Scheduler wake repository exact-action hardening - 2026-06-01

- `control_plane_repository.py` no longer treats `session-scheduler-decision` as a generic allow/block gate in its shared scheduler-wake repository helper.
- The shared scheduler-wake repository helper now requires canonical Rust actions for:
  - `event_trigger -> schedule_event_trigger`
  - `self_proposed_trigger -> schedule_self_proposed_trigger`
  - `wake_decision -> trigger_wakeup`
  - `claim_wake_requests -> claim_due_wake_requests`
  - `schedule_retry -> schedule_retry`
  - `failure_decision -> record_scheduler_failure`
  - `finalize_wake_requests -> finalize_wake_requests`
- Added focused fail-closed coverage proving:
  - a wrong Rust action blocks wake-request append before database access
  - a wrong Rust action blocks wake-request claim before database access
  - a wrong Rust action blocks wake-request status update before repository mutation

## Deployed-agent service exact-action hardening - 2026-06-01

- `deployed_agent_service.py` no longer treats `deployed-agent-service-decision` as a generic allow/block gate in its shared lifecycle helper.
- The shared deployed-agent service helper now requires canonical Rust actions for:
  - `deploy -> deploy_deployed_agent`
  - `pause -> pause_deployed_agent`
  - `kill -> kill_deployed_agent`
  - `recover -> recover_deployed_agent`
  - `archive -> archive_deployed_agent`
  - `recovery_action -> apply_deployed_agent_recovery_action`
  - `runtime_session_kill -> kill_deployed_agent_runtime_session`
  - `emergency_stop -> emergency_stop_workspace_deployed_agents`
- Added focused fail-closed coverage proving:
  - a wrong Rust action blocks deployed-agent pause before state mutation
  - a wrong Rust action blocks deployed-agent archive before stop-run or repository mutation

## Run-record repository exact-action hardening - 2026-06-01

- `run_state_repository.py` no longer treats `run-record-decision` as a generic allow/block gate in its shared repository helper.
- The shared run-record repository helper now requires canonical Rust actions for:
  - `register_live_run -> create_live_run_initial`
  - `persist_snapshot -> update_live_run_if_version_matches`
  - `record_transition -> record_transition | noop`
  - `archive_payload -> archive_run`
  - `emit_transition_outbox -> emit_run_transition_event | noop`
  - `emit_artifact_outbox -> emit_artifact_created_events | noop`
  - `activate_live_run -> enqueue_local_companion_run | hydrate_local_memory_context | start_background_run`
- Added focused fail-closed coverage proving:
  - a wrong Rust action blocks run-transition persistence before pool access
  - a wrong Rust action blocks run-archive persistence before pool access

## Activity ledger runtime-state gate fix - 2026-06-01

- `activity_ledger_service.py` had a live bug in `_enforce_activity_ledger_state_decision(...)`: it returned from inside the Rust call path before validating `next_action`.
- The helper now stores the Rust decision, validates:
  - `append_activity_ledger_event -> append_activity_ledger_event`
- Updated focused coverage so the success fixture includes the canonical Rust action explicitly.

## Outbox run-record emission exact-action hardening - 2026-06-01

- `outbox_service.py` no longer treats `run-record-decision` as a generic allow/block gate in its shared outbox-emission helper.
- The shared run-record outbox helper now requires canonical Rust actions for:
  - `emit_transition_outbox -> emit_run_transition_event | noop`
  - `emit_artifact_outbox -> emit_artifact_created_events | noop`
- `emit_run_transition_event(...)` now honors Rust `noop` and skips outbox persistence instead of emitting a duplicate same-state transition event anyway.
- Added focused fail-closed coverage proving:
  - a wrong Rust action blocks run-transition outbox persistence
  - a wrong Rust action blocks artifact-created outbox persistence
  - Rust `noop` skips transition-event persistence

## Workspace membership remove repository hardening - 2026-06-01

- `control_plane_repository.py` now classifies `membership_remove` in the shared control-plane allowed-action map.
- The repository membership-removal path now requires:
  - `membership_remove -> apply_control_plane_destructive_write`
- Added focused fail-closed coverage proving a wrong non-destructive Rust action blocks workspace membership deletion before repository mutation.
- Hardened the agent-computer policy bridge so `check-path-containment` now requires `allow_path_access` and `validate-policy` now requires canonical Rust actions (`allow_agent_computer_request` / `request_agent_computer_approval`) before Python allows or requests approval.
- Hardened delegated child auto-retry scheduling so `schedule_auto_retry_for_failed_children(...)` now requires the scheduler kernel to select `schedule_retry` before Python starts retry timers.
- Hardened the safe-mode capability-disable bridge so `safe-mode-decision` now emits canonical actions and `resolve_capability_disable_state(...)` fails closed unless Rust selects the exact safe-mode action.
- Hardened session max-turn gating so `check_max_turns(...)` now requires the lifecycle kernel to return `next_action == continue` instead of trusting `decision == allow` alone.
- Hardened diagnostics redaction so `redact-diagnostics` now emits `return_redacted_diagnostics` and the Python diagnostics bridge fails closed unless Rust selects that exact action.
- Wired the live virtual-computer artifact boundary into Rust policy and hardened `artifact-policy` with canonical actions so artifact register/read/export now fail closed unless Rust selects the exact artifact action.
- Completed the Docker sandbox command contract so `build-sandbox-command` now emits `build_hardened_container_command`, matching the live Python caller that already fails closed on wrong sandbox-builder actions.
- Wired the live inbound gateway protocol frame path into `gateway-frame-decision` so parsed gateway frames now fail closed unless Rust selects the exact routing action (`accept_gateway_connect`, `route_gateway_request`, `resolve_gateway_response`, or `handle_gateway_event`).
- Wired the live hardware gateway adapter tool-execution path into `gateway-action-decision` so `execute_gateway_action(...)` now fails closed unless Rust selects `dispatch_tool_invoke` or `request_gateway_tool_approval` for the live gateway action.
- Wired the live run preview and precheck entry routes into `run-routing-decision` so those route-layer preview surfaces now fail closed unless Rust selects `build_routing_preview`.
- Wired the live browser start/action service path into `gateway-action-decision` so `gateway_browser_service.execute_browser_capability_via_gateway(...)` now fails closed unless Rust selects `start_browser_session` or `dispatch_browser_action` for those live browser operations.
- Wired the live gateway approval-resolution service path into `gateway-action-decision` so `gateway_approval_service.resolve_gateway_tool_approval(...)` now fails closed unless Rust selects `resolve_gateway_approval` before Python resolves the approval.
- Extended the live browser service cutover so browser interrupt now also consumes `gateway-action-decision` and fails closed unless Rust selects `browser_session_stop -> stop_browser_session`.
- Extended `gateway-action-decision` and the live browser service cutover so browser resume and takeover now also fail closed unless Rust selects `browser_session_resume -> resume_browser_session` and `browser_session_takeover -> takeover_browser_session`.
- Wired the live hardware broker stop path into `gateway-action-decision` so `gateway_adapter.stop_gateway_action(...)` now fails closed unless Rust selects `browser_session_stop -> stop_browser_session` before Python interrupts the gateway session.
- Wired the live cloud-browser fallback path into `gateway-action-decision` so `gateway_browser_service.build_cloud_browser_fallback(...)` now fails closed unless Rust selects `browser_session_start -> prepare_cloud_browser_fallback` before Python persists fallback-ready browser session state.
- Wired the live ACP turn and workspace diagnostics export routes into `gateway-action-decision` so `routes_gateway.acp_turn_endpoint(...)` now fails closed unless Rust selects `acp_turn -> route_acp_turn`, and `routes_gateway.export_workspace_diagnostics_endpoint(...)` now fails closed unless Rust selects `diagnostics_export -> export_diagnostics_bundle` before Python executes the turn or exports the diagnostics bundle.
- Wired the live gateway doctor route into `gateway-service-decision` so `routes_gateway.get_gateway_registration_doctor(...)` now fails closed unless Rust selects `health_check -> publish_gateway_health` before Python builds the gateway health payload.
- Wired the live gateway tool-interrupt route into `gateway-service-decision` so `routes_gateway.interrupt_gateway_tool(...)` now fails closed unless Rust selects `tool_interrupt -> dispatch_gateway_operation` before Python interrupts the live gateway tool request.
- Wired the personal WhatsApp and Telegram gateway setup service paths into `gateway-service-decision` so `personal_channels_service.configure_whatsapp_personal_gateway(...)` and `configure_telegram_personal_gateway(...)` now fail closed unless Rust selects `tool_execute -> dispatch_gateway_operation` before Python sends the live paired-gateway configuration tool call.
- Wired the personal-channel manual-send approval path into `gateway-service-decision` so `routes_personal_channels._request_personal_channel_send_approval(...)` now fails closed unless Rust selects `approval_request -> request_gateway_owner_approval` before Python creates the live gateway approval request.
- Wired the personal-channel manual-send dispatch path into `gateway-service-decision` so `personal_channels_service.send_whatsapp_personal_message(...)` and `send_telegram_personal_message(...)` now fail closed unless Rust selects `protocol_route -> dispatch_gateway_operation` before Python sends the live paired-gateway outbound frame.
- Extended that same `protocol_route` cutover to the automatic personal-channel reply path so `_deliver_whatsapp_personal_reply(...)` and `_deliver_telegram_personal_reply(...)` now also fail closed unless Rust selects `dispatch_gateway_operation` before Python sends the paired-gateway outbound reply frame.
- Extended the same `protocol_route` cutover to the local-bridge personal send helper so `personal_channels_service.send_local_bridge_personal_message(...)` now also fails closed unless Rust selects `dispatch_gateway_operation` before Python sends the paired-gateway outbound frame for Signal/iMessage/WeChat bridge traffic.
- Extended the same `protocol_route` cutover to the local-bridge automatic reply helper so `_deliver_local_bridge_personal_reply(...)` now also fails closed unless Rust selects `dispatch_gateway_operation` before Python sends the paired-gateway outbound reply frame for Signal/iMessage/WeChat bridge traffic.
- Moved the shared `gateway_protocol_service.dispatch_channel_outbound(...)` boundary itself behind `gateway-service-decision` so outbound paired-gateway channel frames now fail closed unless Rust selects `protocol_route -> dispatch_gateway_operation` before Python sends the websocket request. The personal-channel caller-side gates remain in place as outer admission layers.
- Moved the shared `gateway_protocol_service.dispatch_tool_invoke(...)` boundary itself behind `gateway-service-decision` so live gateway tool invocations now fail closed unless Rust selects `tool_execute -> dispatch_gateway_operation` before Python sends the websocket request.
- Moved the shared `gateway_protocol_service.dispatch_tool_interrupt(...)` boundary itself behind `gateway-service-decision` so live gateway tool interrupts now fail closed unless Rust selects `tool_interrupt -> dispatch_gateway_operation` before Python sends the websocket request.
- Wired the pre-registration pairing service bootstrap path into `gateway-service-decision` so `gateway_pairing_service.create_gateway_pairing_intent(...)` now fails closed unless Rust selects `pairing_bootstrap -> allow_gateway_service_operation` before Python writes the pairing intent.
- Extended that same `pairing_bootstrap` cutover to `gateway_pairing_service.register_gateway(...)` by resolving tenant/workspace/user from the unconsumed pairing intent first; the registration flow now also fails closed unless Rust selects `allow_gateway_service_operation` before Python consumes the pairing token and writes the gateway registration.
- Wired the live agent-computer policy GET and PUT routes into `gateway-service-decision` so `routes_gateway.get_agent_computer_policy(...)` now fails closed unless Rust selects `gateway_policy_read -> allow_gateway_service_operation`, and `routes_gateway.update_agent_computer_policy(...)` now fails closed unless Rust selects `gateway_policy_write -> allow_gateway_service_operation` before Python reads or mutates saved policy state.
- Extended that same policy-route cutover to `routes_gateway.validate_agent_computer_policy_route(...)`, which now also fails closed unless Rust selects `gateway_policy_write -> allow_gateway_service_operation` before Python validates a candidate policy payload.
- Wired the live browser action route into `gateway-service-decision` so `routes_gateway.execute_gateway_browser_action(...)` now fails closed unless Rust selects `browser_action -> dispatch_gateway_operation` before Python dispatches the paired-gateway browser action.
- Wired the shared route-layer approval-request helper into `gateway-service-decision` so `_gateway_approval_required_response(...)` now fails closed unless Rust selects `approval_request -> request_gateway_owner_approval` before Python creates the live gateway approval request for tool execution and browser start/action flows.
- Wired the live gateway approval-resolution route into `gateway-service-decision` so `routes_gateway.resolve_gateway_registration_approval(...)` now fails closed unless Rust selects `approval_resolve -> persist_approval_decision` before Python resolves the live gateway approval.
- Wired the explicit browser offline fallback branches into `gateway-service-decision` so the start/action routes now handle approval first and then fail closed unless Rust selects `cloud_fallback -> dispatch_gateway_operation` before Python builds the cloud browser fallback response.
- Extended that same `cloud_fallback` cutover to `routes_gateway.resume_gateway_browser_session(...)` so the resume route now also fails closed unless Rust selects `dispatch_gateway_operation` before Python builds the offline cloud browser fallback response.
- Wired the remaining direct-dispatch browser control routes into `gateway-service-decision` so `routes_gateway.takeover_gateway_browser_session(...)` and `interrupt_gateway_browser_session(...)` now fail closed unless Rust selects `browser_action -> dispatch_gateway_operation` before Python dispatches the paired-gateway browser control action.
- Wired the gateway websocket handshake path into `gateway-service-decision` so `gateway_protocol_service.handle_gateway_websocket(...)` now fails closed unless Rust selects `websocket_connect -> allow_gateway_service_operation` before Python accepts the live websocket.
- Wired the gateway approval-memory reuse helper into `gateway-service-decision` so `_consume_gateway_approval_memory(...)` now performs `find -> approval_memory_consume -> consume`, and fails closed unless Rust selects `allow_gateway_service_operation` before Python reuses a stored approval-memory rule on tool execution and browser allow paths.
- Wired the live channel-outbound quota path into `gateway-service-decision` so `gateway_protocol_service.dispatch_channel_outbound(...)` now fails closed unless Rust selects `quota_check -> allow_gateway_service_operation` before Python emits the paired-gateway outbound websocket request.
- Extended that same `quota_check` cutover to the shared tool-execution service so `gateway_execution_service.execute_tool_via_gateway(...)` now fails closed unless Rust selects `allow_gateway_service_operation` before Python dispatches the live paired-gateway tool invoke.
- Extended the same `quota_check` cutover to the live websocket handshake so `gateway_protocol_service.handle_gateway_websocket(...)` now also fails closed unless Rust selects `allow_gateway_service_operation` before Python accepts the websocket after session validation.
- Extended the same `quota_check` cutover to shared browser session execution so `gateway_browser_service.execute_browser_capability_via_gateway(...)` now also fails closed on the session-backed start/resume path unless Rust selects `allow_gateway_service_operation` before Python delegates to live paired-gateway execution.
- Extended the same `quota_check` cutover to the shared `tool.invoke` websocket dispatcher so `gateway_protocol_service.dispatch_tool_invoke(...)` now also fails closed unless Rust selects `allow_gateway_service_operation` before Python emits the live paired-gateway tool invoke request.
- Extended the same `quota_check` cutover to the interrupt path so both `gateway_execution_service.interrupt_tool_via_gateway(...)` and the shared `gateway_protocol_service.dispatch_tool_interrupt(...)` boundary now also fail closed unless Rust selects `allow_gateway_service_operation` before Python emits the live paired-gateway interrupt request.
- Wired the live browser resume dispatch route into `gateway-service-decision` so `routes_gateway.resume_gateway_browser_session(...)` now also fails closed unless Rust selects `browser_session -> dispatch_gateway_operation` before Python dispatches the resumed paired-gateway browser session.
- Wired the live run creation execution-boundary and local-confirmation shaping path into `run-routing-decision` so `resolve_run_execution_boundary(...)` and the local-confirmation branch in `create_run_from_prepared_request(...)` now fail closed unless Rust selects `write_execution_boundary_metadata` and `request_local_execution_confirmation` or a canonical continue action.
- Hardened the shared cloud-computer virtual policy bridge so `enforce_virtual_computer_decision(...)` now requires the exact Rust `next_action` for each `virtual-computer-decision` operation instead of treating every allow path as `execute_cloud_runtime_action`; this fixed the live cloud stop path, which uses `session_state -> assert_virtual_session_active`, and added focused coverage for the session-state branch.
- Wired the shared run-approval read paths behind the existing Rust `run-approval-decision` contract: `list_pending_approvals_payload(...)` now requires `list_pending -> list_pending_approvals` and per-item `filter_pending_item -> include_approval_item | skip_approval_item`, while `build_approval_detail_response(...)` now requires `get_detail -> build_approval_detail_response`, with focused fail-closed coverage and updated service tests to match the stricter contract.
- Hardened the workspace invite-revoke control-plane bridges so both the route-layer and workspace-admin helpers now accept the real Rust idempotent path `invite_revoke -> return_existing_control_plane_record` instead of treating revoke as a generic write-only action; also made `provider_models_refresh` explicit rather than relying on the default route/service action fallback.
- Fixed the follow-on invite-revoke regression in the workspace route/admin control-plane helpers: the canonical Rust idempotent revoke path is `invite_revoke -> return_existing_control_plane_record` with `mutation_plan.apply = false`, and both helpers now accept that exact shape while still failing closed on non-idempotent `apply = false` responses.
- Wired the shared `gateway_state_repository.sweep_stale_gateway_sessions(...)` boundary into Rust `gateway-state-decision` so stale-session expiry now fails closed unless Rust selects `sweep_stale_sessions -> sweep_stale_gateway_sessions`, and now also honors Rust `noop` by skipping the expiry mutation entirely when there are no stale sessions to sweep.
- Wired the live schedule CRUD/read/run-now and pending-heartbeat surfaces in `runs_core.py` into Rust `run-trigger-decision`: schedule list/logs now require `list_schedules` and `read_schedule`, create/update/delete now require the exact schedule mutation actions, manual run-now now requires `execute_scheduled_run`, and the shared pending-heartbeat wrapper now requires `trigger_pending_schedules` or honors Rust `noop` by skipping run-service dispatch entirely.
- Wired the live thread turn-normalization and thread history-filter helpers in `runtime_runs_api.py` into Rust `thread-record-decision`: turn normalization now requires `normalize_turn -> normalize_thread_turn_record`, and thread history shaping now requires `history_filter -> include_history_record` before Python applies the workspace history-window cutoff.
- Wired the run detail and workspace-scoped run list entrypoints into Rust `run-api-decision`: the workspace-filtered `/runs` list path in `runtime_runs_api.py` now requires `list_runs -> list_runs`, and the `/runs/{run_id}`, `/runs/{run_id}/browser-checkpoint`, and `/runs/{run_id}/browser-session` routes in `runtime_route_registry_service.py` now require `get_run -> get_run | request_owner_approval`, failing closed on the owner-approval branch instead of reading run detail or browser detail directly from Python.
- Hardened the shared `runtime_route_registry_service._enforce_registered_run_api_decision(...)` pause path so the live `/runs/{run_id}/pause` route now requires the canonical Rust action `pause_run -> pause_run`, instead of accepting any non-block Rust allow before Python pauses the run.
- Extended the route-layer `get_run` cutover to the live `/runs/{run_id}/stream` entrypoint in `runtime_route_registry_service.py`, so the stream route now requires `get_run -> get_run | request_owner_approval` and fails closed on the owner-approval branch before Python starts streaming run logs.
- Wired the lightweight chat-session mutation routes in `runtime_runs_api.py` into Rust `session-lifecycle-decision`: `POST /sessions` now requires `create -> create`, and `DELETE /sessions/{session_id}` now requires `close -> close`, so Python no longer creates or terminates those session records on a generic allow path.
- Pushed that same lifecycle contract down into the shared `session_service.py` mutation boundary, so `create_session(...)` now requires `create -> create` and `terminate_session(...)` now requires `close -> close` before any Postgres, SQLite checkpoint, or control-plane session mutation occurs.
- Extended the `thread-record-decision` shaping cutover from turn-level fields to thread-level fields in `runtime_runs_api.py`, so `normalize_thread_record(...)` now requires `normalize_thread -> normalize_thread_record` and uses Rust-provided normalized thread title/status before Python returns thread list/detail payloads.
- Wired the shared synchronous direct-chat reply helper in `direct_chat_runtime_service.py` into Rust `run-api-decision`, so `build_direct_operator_reply(...)` now requires `stream_chat -> start_chat_stream` before provider-backed reply generation, direct tool execution, or durable-run preview/handoff, and wrong Rust actions now fail closed in-band before route planning continues.
- Wired the basic deployed-agent management routes in `routes_deployed_agents.py` into the previously-unused Rust `deployed-agent-decision` contract, so route-layer `create_draft`, `list`, and `read` now require canonical Rust actions (`create_draft` or `read_agent`) before Python calls the shared deployed-agent service.
- Wired the shared public deployed-agent channel ingress boundary in `agent_channel_router.py` into Rust `deployed-agent-service-decision`, so public deployed-agent routing now requires `public_route -> route_public_deployed_agent` before Python records the inbound event or enters the shared turn engine.
- Extended the route-layer deployed-agent Rust cutover in `routes_deployed_agents.py` beyond basic create/list/read. The analytics detail, admin dashboard, memory list, activity list, Telegram readiness, conversation list, and conversation detail routes now require the canonical Rust `deployed-agent-service-decision` action before Python reads or shapes deployed-agent service data.
- Extended that same route-layer deployed-agent service cutover to the next higher-risk actions in `routes_deployed_agents.py`. Knowledge verify/upload, business-insight review/apply, shop evaluation, and studio test-turn now require the canonical Rust `deployed-agent-service-decision` action before Python invokes the downstream service or test-turn execution path.
- Pushed the shared deployed-agent service layer deeper behind `deployed-agent-service-decision` in `deployed_agent_service.py`. Knowledge verify/upload, shop evaluation, analytics detail, conversation list/detail, memory list, and activity list now require the canonical Rust-selected action before Python reaches the downstream retrieval, repository, or evaluator path.
- Extended that same shared deployed-agent service cutover to Telegram readiness shaping. `get_deployed_agent_telegram_readiness(...)` now requires `telegram_readiness -> read_telegram_readiness` before Python builds the shared readiness payload for Studio.
- Extended the deployed-agent shared-service cutover into owner business-insight mutations. `review_owner_business_insight(...)` and `apply_owner_business_insight(...)` in `deployed_agent_business_insights_service.py` now require the canonical Rust `deployed-agent-service-decision` action before Python mutates or applies an owner-reviewed business insight.
- Corrected the shared admin-dashboard boundary to use the exact deployed-agent service contract. `deployed_agent_admin_dashboard_service.py` no longer relies on the weaker `deployed-data-decision` analytics gate; it now loads the deployed-agent scope first and requires `admin_dashboard -> read_deployed_agent_admin_dashboard` from Rust before Python reads or shapes the shared dashboard payload.
- Corrected the shared deployed-agent test-turn executor to consume the exact deployed-agent service contract as well as the readiness contract. `execute_test_turn(...)` in `deployed_agent_test_turn_service.py` now requires `test_turn -> execute_deployed_agent_test_turn` before it runs the existing `deployed-readiness-decision` stage gate and before Python can reach live or simulated test-turn execution.
- Hardened the shared deployed-agent service helper itself so it no longer sends blanket caller authority into Rust. `_enforce_deployed_agent_service_decision(...)` in `deployed_agent_service.py` now derives `actor_role` and `owner_access` from the real `current_user` workspace access instead of hard-coding admin/owner semantics, which tightens every deployed-agent service operation already wired through that helper.
- Extended the deployed-agent Rust cutover to the remaining obvious privacy-heavy seams. `routes_deployed_agents.py` now route-gates `audit_export` and `external_user_delete` through `deployed-agent-service-decision`, and `deployed_agent_service.py` now requires the canonical Rust `export_deployed_agent_audit_logs` and `delete_deployed_agent_external_user_data` actions before Python reads activity for audit export or purges external-user data.
- Corrected the Rust kernel ownership manifest in `rust_runtime_kernel_client.py` so it matches the current live checkout. The following commands are no longer marked `shadow_only`: `artifact-policy`, `deployed-agent-decision`, `deployed-readiness-decision`, `gateway-action-decision`, `gateway-frame-decision`, and `run-routing-decision`. Those commands already have real fail-closed call sites on live Python paths, so the manifest now reports the actual active-enforcement boundary instead of understating rollout progress.
- Extended the deployed-agent data/privacy cutover so `deployed-data-decision` is now active on the shared audit-export and external-user-delete helpers in `deployed_agent_service.py`. After the broader `deployed-agent-service-decision` gate passes, audit export now also requires Rust `deployed-data-decision -> export_deployed_agent_audit_log`, and external-user deletion now also requires Rust `deployed-data-decision -> purge_deployed_agent_external_user_data` before Python reads audit activity or purges customer data.
- Extended the deployed-agent virtual-runtime cutover to the lower-level payload-builder contract. `build_deployed_agent_virtual_runtime_payload(...)` in `deployed_agent_virtual_runtime_service.py` now requires both the broader `deployed-virtual-runtime-service-decision` service gate and the narrower `deployed-virtual-runtime-decision -> build_deployed_agent_virtual_runtime_payload` decision before Python assembles the cloud runtime policy payload.
- Activated the Rust `heartbeat-snapshot` command on the live Sage heartbeat path. `build_sage_heartbeat_snapshot(...)` in `sage_heartbeat_service.py` now consumes `heartbeat-snapshot` for the top-level `health` and `operator_next_action` fields, while preserving the richer `runtime-health-decision` envelope and readiness gate as separate Rust-owned surfaces.
- Activated the lower-level Rust `control-plane-decision` contract on a real control-plane repository mutation. `upsert_workspace_billing_subscription(...)` in `control_plane_repository.py` now requires both the broader `control-plane-service-decision` service gate and the narrower `control-plane-decision -> upsert_record` record gate before Python persists billing-subscription state.
- Activated the Rust `authorize-execution` command on the live raw `shell.execute` policy path. `policy_service._rust_tool_policy_result(...)` now routes raw shell-command authorization through `authorize-execution` instead of the broader `authorize-request` bridge, `execution_authorization.rs` now emits canonical next actions (`allow_tool_execution`, `request_tool_execution_approval`, `deny_tool_execution`), and the ownership manifest now marks `authorize-execution` as active enforcement because Python fails closed on that exact Rust action for raw shell policy decisions.
- Activated the Rust `execution-plan` command on the live safe raw-shell policy path. `execution_plan.rs` now emits canonical next actions (`allow_tool_execution`, `request_tool_execution_approval`, `deny_tool_execution`), and `policy_service._rust_tool_policy_result(...)` now calls `execution-plan` directly for safe raw `shell.execute` requests before the broader authorization bridge continues, failing closed if Rust returns an unexpected plan action.
- Activated the Rust `capability-manifest` command on the live local-worker capability advertisement path. `capabilities.rs` now emits `next_action=return_capability_manifest`, and `scripts/orion_local_worker.py` now uses the Rust capability manifest as the source of its core advertised browser/filesystem/shell capabilities before layering on the worker-only extras (`screenshot.capture`, `local.worker`).
- Activated the Rust `run-orchestration-decision` command on the live delegated-child retry path. `runs.rs` now emits canonical next actions for orchestration operations, and `runtime_run_delegation_service.retry_failed_delegation_runs(...)` now requires Rust `retry -> retry_run` before Python builds and launches the retried child run.
- Activated the Rust `gateway-protocol-decision` command on the live outbound paired-gateway websocket boundary. `gateway.rs` now recognizes the real live outbound message taxonomy (`tool.invoke`, `tool.interrupt`, `channel.outbound`) and returns canonical `next_action` values for each, while `gateway_protocol_service.py` now fails closed unless that command selects `dispatch_tool_invoke`, `dispatch_tool_interrupt`, or `dispatch_channel_outbound` before the shared outbound websocket request is emitted.
