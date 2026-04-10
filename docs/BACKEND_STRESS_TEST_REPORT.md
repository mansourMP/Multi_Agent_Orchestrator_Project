# BACKEND STRESS TEST REPORT

Date: 2026-04-09  
Mode: Red Team / architecture-only  
Scope: Logical failure analysis only. No destructive execution. No product code modifications.

## Executive Summary

The backend is no longer prototype-grade. It has real structure: canonical turn ingress, durable run startup, a real DAG/workflow executor, approval routing, a control plane, and Master/Specialist installs. But it still has several structural failure seams that can break safety, consistency, or execution determinism under load.

The most important conclusion is this:

- The system has strong **guardrails against naive failure**.
- It does **not yet have strong guarantees against concurrency, split-brain persistence, or legacy ingress bypasses**.

The most dangerous findings are:

1. **Timeout does not actually stop execution.**
2. **Legacy direct-chat approval can be bypassed with a client-supplied `approved_action`.**
3. **Local queue claims can be overwritten by a second worker.**
4. **Postgres failure often degrades to in-memory continuation instead of safe pause/fail.**
5. **Approval resolution and restored-run resume can race.**
6. **Compiled install artifacts can drift from current install config.**
7. **Master vs Specialist lineage can become ambiguous in metadata.**
8. **Tenant/workspace isolation is mostly app-enforced, not fully DB-enforced.**

If you fix only three things tomorrow, fix these:

1. Replace thread-join timeout with real cooperative cancellation or isolated worker kill semantics.
2. Kill legacy `approved_action` trust and require server-issued approval tokens/correlation.
3. Make run claiming and approval resolution atomic at the database level.

---

## Method

This report was produced by tracing the backend through the real execution path:

- `server_modules/agent_turn.py`
- `server_modules/run_service.py`
- `server_modules/runs_execution.py`
- `server_modules/run_state_repository.py`
- `server_modules/control_plane_repository.py`
- `server_modules/agent_registry_repository.py`
- `server_modules/template_compiler_service.py`
- `server_modules/runtime_runs_api.py`
- `server_modules/runtime_run_approval_service.py`
- `server_modules/runtime_local_execution_approval_service.py`
- `server_modules/runtime_route_binding_service.py`
- `server_modules/runtime_run_resume_service.py`
- direct-chat approval flow files

This was a logical stress test, not a destructive runtime test.

---

## System Surface Under Test

### Canonical path

1. `agent_turn.py` normalizes the turn, tenant/workspace/thread/session, and policy context.
2. `run_service.py` prepares run metadata, routing, approval prechecks, and run creation.
3. `runs_execution.py` compiles the DAG or workflow graph and executes it.
4. `run_state_repository.py` mirrors live run state, claims, outbox, approval records, and archives into Postgres.
5. `runtime_runs_api.py` and approval services expose resume/resolve/stream/control routes.
6. `control_plane_repository.py` persists threads, sessions, turns, workflows, installs, and runtime profiles.

### New substrate under test

1. `agent_definitions`
2. `workspace_agent_installs`
3. `runtime_profiles`
4. Template compiler output persisted as hidden `workflow_versions`
5. Master/Specialist metadata bindings inside turn/run context

---

## Severity Legend

- Critical: can directly violate safety, run duplicate side effects, or bypass trust boundaries
- High: can corrupt state, produce split-brain behavior, or make recovery unsafe
- Medium: bounded failures, but still serious under enterprise load

---

## Critical Findings

## 1. Timeout Does Not Actually Stop Execution

Severity: Critical

### Vector of failure

If a Specialist agent or tool blocks forever, or runs a very long local action, the runtime can mark the run as `timeout` while the underlying work keeps executing anyway.

### Evidence

- `server_modules/runs_execution.py:162-175`
- `_execute_engine_with_timeout(...)` launches a thread, waits with `join(timeout_seconds)`, and if the thread is still alive it only marks `timed_out = True`
- It does **not** kill the worker thread

### Why it fails structurally

The timeout model is observational, not authoritative.

- The runtime starts a daemon thread
- The controller thread stops waiting
- The worker thread can continue doing side effects
- `run_mission(...)` then records the run as timed out or failed

This means:

- a timed-out run may still be touching files
- a timed-out run may still be hitting connectors
- a timed-out run may still be driving local computer actions
- a kill/timeout can become a UI fiction instead of a true execution stop

### Blast radius

- local shell/code/file actions
- browser automation
- child runs
- connector mutations
- inaccurate audit trail: status says timed out while side effects continue

### Best architectural fix

Tomorrow’s fix should be:

1. Move dangerous execution into a cancellable boundary:
   - subprocess
   - worker process
   - local companion lease execution unit
2. Introduce a real cancellation token checked by all nodes/tool adapters.
3. For blocking calls, isolate them in killable processes, not threads.
4. Treat timeout as:
   - `cancel_requested`
   - then `cancelled`
   only after the worker confirms stop

The current thread-join timeout is not safe enough for an AI OS that can touch real devices.

---

## 2. Legacy Direct-Chat Approval Can Be Bypassed by Client-Supplied `approved_action`

Severity: Critical

### Vector of failure

A client can submit a special direct-chat payload that includes:

- a magic confirmation message such as `__approval_confirmed__`
- a client-provided `approved_action`

and trigger direct tool execution without any server-issued approval token being verified against a live pending approval.

### Evidence

- `server_modules/agent_turn.py:371-377`
  - direct chat accepts `approved_action` from the body into context hints
- `server_modules/direct_chat_entry_service.py:149-152`
  - `approved_action_payload = normalize_direct_approved_action_fn(approved_action)`
- `server_modules/direct_chat_runtime_service.py:193-212`
  - if message is `__approval_confirmed__`, it calls `approval_confirmation_payload(...)`
- `server_modules/direct_chat_response_service.py:103-180`
  - `approval_confirmation_payload(...)` executes the direct tool call if the action is available
  - it checks tool availability, but not a server-side approval correlation record

### Why it fails structurally

The approval surface here is not anchored to:

- a server-issued approval record
- a pending approval id
- a correlation id
- a signature or nonce
- a time-bounded approval state machine

It trusts a client-carried `approved_action` object and a confirmation message shape.

### Blast radius

- direct connector writes
- direct local tool calls
- any legacy direct-chat path still exposed through the canonical turn adapter

### Best architectural fix

Tomorrow’s fix should be:

1. Remove client-trusted `approved_action` execution.
2. Require a server-issued approval record with:
   - `approval_id`
   - `correlation_id`
   - expiry
   - exact bound action hash
3. Resolve approval only by looking up the pending approval server-side.
4. On approve:
   - execute the exact server-bound action
   - ignore any action payload sent by the client
5. Treat legacy direct-chat approval as deprecated compatibility and route it through the same structured approval system as durable runs.

Until that is done, the approval card is not the real boundary for that path.

---

## 3. Run Claims Can Be Overwritten by a Second Worker

Severity: Critical

### Vector of failure

Two workers can race to claim the same run, and the later claimer can overwrite the first claim.

### Evidence

- `server_modules/run_state_repository.py:441-462`
- `claim_run(...)` uses:
  - `INSERT ... ON CONFLICT (run_id) DO UPDATE`
  - and rewrites `worker_id`, `claimed_at`, `ttl`, `trace_id`

### Why it fails structurally

The claim path is not compare-and-swap. It is overwrite-on-conflict.

That means:

- worker A claims run
- worker B claims same run milliseconds later
- worker B overwrites the lease
- both may continue execution if higher layers already started work

This is a classic duplicate side effect risk.

### Blast radius

- duplicate local tool execution
- duplicate connector actions
- duplicate child-run spawning
- corrupted run status because two executors think they own the same run

### Best architectural fix

Tomorrow’s fix should be:

1. Change claim SQL to only acquire when:
   - no claim exists
   - or existing lease expired
2. Use one of:
   - `SELECT ... FOR UPDATE`
   - conditional `UPDATE ... WHERE claimed_at + ttl < NOW()`
   - advisory lock keyed by run id
3. Return a boolean “claim acquired” result and hard-stop if false.
4. Add a DB-visible `lease_owner` invariant and heartbeat refresh semantics.

This must become exclusive lease acquisition, not last-writer-wins.

---

## High Findings

## 4. Postgres Failure Mid-Turn Produces Split-Brain Persistence

Severity: High

### Vector of failure

If Postgres drops during a live run, the engine often continues in memory while persistence silently degrades.

### Evidence

`server_modules/run_state_repository.py` repeatedly swallows DB failures and returns empty/None:

- `archive_run(...)`
- `claim_run(...)`
- `release_claim(...)`
- `record_approval_resolution(...)`
- live run getters/listing paths

Also:

- `server_modules/session_service.py:220-379`
  - writes sessions to Postgres
  - also writes SQLite fallback
  - also mirrors to the control plane
  - failures are logged and continued

### Why it fails structurally

The system currently has three truths:

1. in-memory live run state
2. Postgres runtime state
3. SQLite session fallback / control-plane mirror

When Postgres dies:

- the run can continue
- session persistence may continue in SQLite
- control-plane mirror may fail
- outbox and archive writes may be lost

This creates split brain:

- UI may show stale status
- approvals may be recorded in one place but not another
- restart recovery may restore an incomplete run snapshot

### Blast radius

- audit gaps
- replay/recovery confusion
- invisible finished runs
- duplicate resumes after restart
- inconsistent session/thread metadata

### Best architectural fix

Tomorrow’s fix should be:

1. Classify writes into:
   - critical durability writes
   - best-effort telemetry writes
2. On critical persistence failure:
   - pause the run
   - or fail the run safely
   - do not just log-and-continue
3. Reduce storage split:
   - choose one primary runtime durability store
   - use SQLite only for local/offline mode explicitly
4. Add degraded-mode flags to live runs:
   - `persistence_degraded = true`
   - surfaced to UI and audit

Right now the engine is more durable in memory than in the database. Enterprise buyers will not accept that.

---

## 5. Approval Resolution and Restored Resume Can Race

Severity: High

### Vector of failure

Two clients or devices can resolve the same approval at nearly the same time, or a restored run can be resumed twice.

### Evidence

- `server_modules/runtime_run_approval_service.py:135-246`
  - approval resolution pushes decision into `input_queue`
  - if the run thread is dead and status is `waiting_for_input`, it mutates pending state and schedules restored resume
- `server_modules/runtime_run_resume_service.py:24-72`
  - resume scheduling relies on in-memory flag `_resume_after_confirmation_scheduled`
  - no DB lock around that flag
- `server_modules/runtime_route_binding_service.py:63-91`
  - `_ensure_live_run_handle(...)` can rebuild a live run handle from persisted snapshot with fresh queues
  - no obvious lock around parallel restore attempts
- `server_modules/run_state_repository.py:485-520`
  - approval resolution record is deduped weakly, not by a hard unique approval-state transition invariant

### Why it fails structurally

Approval state is split across:

- live in-memory run object
- persisted run snapshot
- approval audit
- `run_approvals` table

There is no single atomic approval transition lock.

### Failure modes

- approve and deny submitted concurrently
- two tabs both submit approve
- restored run is resumed twice
- one path enqueues a queue decision while another path marks resolved and schedules resume

### Best architectural fix

Tomorrow’s fix should be:

1. Add a dedicated approval state row with unique transition semantics:
   - `pending -> resolved`
   - exactly once
2. Resolve approval via a DB compare-and-swap:
   - `WHERE status = 'pending'`
3. Only the winner schedules resume.
4. All other attempts return:
   - already resolved
   - resolved by X at Y
5. Move `_resume_after_confirmation_scheduled` from in-memory-only flag to persisted state.

This is required for mobile + web + desktop concurrent control.

---

## 6. Compiled Install Artifacts Can Drift from Current Install Configuration

Severity: High

### Vector of failure

A `workspace_agent_install` can have toggles, placement, or policy changed while an older compiled workflow artifact still exists. If the system reuses the old artifact, execution can diverge from the current install settings.

### Evidence

- `server_modules/template_compiler_service.py:260-288`
  - if `compiled_workflow_id` and `compiled_workflow_version_id` already exist and `force_recompile` is false, the service reuses the existing snapshot
- `server_modules/template_compiler_service.py:127-236`
  - `compile_install_template(...)` builds a definition from current install settings
- `server_modules/agent_registry_repository.py:926-988`
  - install updates are read-modify-write updates with no optimistic version check
- `server_modules/agent_registry_api.py:332-399`
  - normal install update path does force a recompile
  - but the underlying repository model has no config hash or version pin guard

### Why it fails structurally

The compiled artifact cache is keyed by “install has a compiled workflow id/version” instead of “install config hash/version.”

There is no:

- install revision number
- config checksum
- artifact freshness check
- compare-and-swap between install update and recompile commit

### Failure modes

- stale compiled graph after concurrent install edits
- stale placement artifact after runtime profile change
- wrong folder grants or tool toggles baked into artifact metadata
- artifact row says one thing, install row now says another

### Best architectural fix

Tomorrow’s fix should be:

1. Add `config_version` or `config_hash` to `workspace_agent_installs`.
2. Stamp compiled artifacts with that exact config version/hash.
3. Reuse an artifact only if hashes match.
4. On install update:
   - increment version
   - invalidate current compiled artifact pointer until successful recompile
5. In runs:
   - pin the exact install config version into run metadata

The template compiler must become deterministic and freshness-aware.

---

## 7. Master vs Specialist Identity Can Drift in Run Metadata

Severity: High

### Vector of failure

A specialist install run can be stamped as both the active install and the master install, blurring lineage between Sage and the Specialist.

### Evidence

- `server_modules/agent_registry_api.py:373-376`
  - installed-agent run path sets:
    - `active_agent_install_id = install.id`
    - `master_agent_install_id = install.id`
- `server_modules/agent_turn.py:867-875`
  - thread/session creation consumes `master_agent_install_id` and `active_agent_install_id` from metadata

### Why it fails structurally

The system currently treats “who is running” and “who is orchestrating” as mutable metadata instead of distinct first-class lineage fields.

### Consequences

- Sage vs Specialist attribution becomes ambiguous
- thread/session ownership can look like the specialist is the master
- delegation auditing becomes muddy
- future store/billing/entitlement logic can attach costs to the wrong actor

### Best architectural fix

Tomorrow’s fix should be:

1. Separate:
   - `master_agent_install_id`
   - `active_agent_install_id`
   - `delegated_by_install_id`
2. For direct specialist runs:
   - either leave `master_agent_install_id` null
   - or set it only if Sage explicitly delegated
3. Add explicit lineage to run metadata and DB:
   - `invoking_install_id`
   - `target_install_id`
   - `delegation_root_install_id`

This is not just cosmetic. It affects audit, control, and later monetization.

---

## 8. Tenant/Workspace Isolation Is Not Fully Enforced by Composite Foreign Keys

Severity: High

### Vector of failure

An install/runtime/workflow ID from one workspace can theoretically be referenced by another workspace row if the application layer makes a mistake, because many relationships are enforced by single-column FKs instead of composite tenant/workspace-scoped FKs.

### Evidence

- `server_modules/control_plane_repository.py`
  - `agent_threads.master_agent_install_id -> workspace_agent_installs(id)`
  - `agent_sessions.runtime_profile_id -> runtime_profiles(id)`
  - `agent_turns.active_agent_install_id -> workspace_agent_installs(id)`
  - `workspace_agent_installs.compiled_workflow_version_id -> workflow_versions(id)`

These are real foreign keys, but not tenant/workspace composite foreign keys.

### Why it fails structurally

The system depends on globally unique ids plus app-layer checks.

That is good, but not maximum isolation.

A future bug or privileged API path could attach:

- the wrong runtime profile
- the wrong compiled workflow
- the wrong agent install

and the database would accept it as long as the raw `id` exists.

### Best architectural fix

Tomorrow’s fix should be:

1. Add composite uniqueness on referenced tables where needed:
   - `(id, tenant_id, workspace_id)`
2. Use composite foreign keys for workspace-scoped relations.
3. Add validation triggers or CHECK-like guards if composite FKs become too heavy.
4. Add row-level security later for true multi-tenant hardening.

The current model is workable. It is not yet fortress-grade.

---

## Medium Findings

## 9. Infinite Loops Are Mostly Capped, but Cost Explosion Is Still Possible

Severity: Medium

### Vector of failure

A Specialist cannot loop forever naively, but it can still create expensive bounded storms:

- large `for_each`
- nested loops
- child run spawning
- repeated local tool execution

### Evidence

- `server_modules/runs_execution.py:1275-1542`
  - loop node execution
- loop depth cap at `>= 3`
- `for_each` parallelism via `ThreadPoolExecutor(max_workers=min(len(items), 8))`
- while/repeat caps
- `server_modules/runs_execution.py:3727`
  - workflow graph safety counter capped at 100 nodes
- `server_modules/run_service.py`
  - max iterations normalized

### Why it fails structurally

The runtime has **iteration caps**, not **cost budgets**.

That means it prevents endless graph traversal, but not:

- huge input fanout
- many child runs inside bounded loops
- expensive external side effects within each bounded iteration

### Best architectural fix

Tomorrow’s fix should be:

1. Add explicit run budgets:
   - child-run spawn budget
   - local tool budget
   - connector mutation budget
   - estimated cost budget
2. Add per-node concurrency caps per run.
3. Make loop nodes record projected cost before executing.
4. Fail fast when projected cost exceeds workspace policy.

The loop guards are good. They are not enough for enterprise abuse or accidental explosions.

---

## 10. Session Storage Is Still Split Across Postgres, SQLite, and Control Plane

Severity: Medium

### Vector of failure

A session can exist in:

- `runtime_sessions` in Postgres
- SQLite fallback
- mirrored `agent_sessions` control-plane record

and these writes are not atomic.

### Evidence

- `server_modules/session_service.py:220-379`

### Why it fails structurally

This is a bridge-state architecture:

- good for migration
- risky for consistency

### Failure modes

- session terminated in one store but active in another
- session TTL extended in Postgres but not mirrored
- control plane shows stale master/runtime profile binding

### Best architectural fix

Tomorrow’s fix should be:

1. Decide the authoritative session store.
2. Treat the others as cache or compatibility mirrors.
3. Add reconciliation tooling until the bridge is removed.

This is survivable now, but it should not remain long-term.

---

## 11. Install Updates Are Last-Write-Wins JSON Merges

Severity: Medium

### Vector of failure

Two concurrent install edits can overwrite each other silently.

### Evidence

- `server_modules/agent_registry_repository.py:926-988`
  - reads existing install
  - merges JSON fields in Python
  - writes full updated payload back
  - no install version check

### Why it fails structurally

This is a classic read-modify-write race.

### Best architectural fix

Tomorrow’s fix should be:

1. Add `updated_at` or `version` optimistic concurrency enforcement.
2. Reject patch if install changed since client read it.
3. Surface conflict resolution in UI.

---

## 12. Restored Live Run Handles Can Rehydrate with Fresh Queues and Partial Context

Severity: Medium

### Vector of failure

When a run is not active in memory, the route layer can reconstruct it into the `runs` map with fresh empty queues and then schedule resume.

### Evidence

- `server_modules/runtime_route_binding_service.py:63-91`
  - `_ensure_live_run_handle(...)`
- `server_modules/runtime_run_resume_service.py:24-72`

### Why it fails structurally

This is a best-effort restoration mechanism, not a formally replayable execution checkpoint system.

### Consequences

- loss of in-memory ephemeral data
- resuming from incomplete context
- approval timing behavior differing after restore

### Best architectural fix

Tomorrow’s fix should be:

1. Define a real checkpoint format for waiting runs.
2. Persist resume-critical state explicitly.
3. Treat restored runs as replayed from checkpoint, not casually reconstructed.

---

## 13. Control Plane Writes Are Not Transactionally Grouped with Turn Lifecycle

Severity: Medium

### Vector of failure

Thread creation, session creation, user turn persistence, assistant turn persistence, and run creation happen across multiple calls and storage systems without a single lifecycle transaction.

### Evidence

- `server_modules/agent_turn.py:820-955`
- `server_modules/thread_service.py`
- `server_modules/session_service.py`
- `server_modules/control_plane_repository.py`

### Why it fails structurally

The system is optimized for progress, not atomicity.

### Failure modes

- user turn persisted without assistant turn
- session exists without matching thread metadata
- run created but assistant turn mirror missing after DB hiccup

### Best architectural fix

Tomorrow’s fix should be:

1. Introduce turn lifecycle envelopes:
   - accepted
   - running
   - completed
   - failed
2. Persist the envelope first.
3. Reconcile child artifacts against it asynchronously.

---

## Failure Simulations

## A. What happens if a Specialist loops infinitely?

Short answer:

- true infinite graph traversal is mostly prevented
- true infinite loop at the Python engine layer is less likely
- but expensive bounded storms are still possible

Current protections:

- loop nesting cap
- workflow safety counter of 100 nodes
- while/repeat caps
- run timeout

Real remaining risk:

- timeout does not kill execution
- expensive local or connector side effects can continue after timeout
- parallel `for_each` can amplify load before the cap hits

Conclusion:

- logical infinity: mostly contained
- side-effect infinity / runaway resource burn: not fully contained

---

## B. What happens if Postgres drops mid-turn?

Short answer:

- many code paths log and continue
- live execution can survive
- durability and observability can split

Likely symptom chain:

1. run continues in memory
2. outbox or archive write fails
3. approval resolution record may be missing
4. session/thread mirrors may diverge
5. restart recovery sees incomplete truth

Conclusion:

- uptime may survive
- correctness and audit may not

That is acceptable for dev resilience. It is not acceptable as the final enterprise durability model.

---

## C. Can malicious input bypass the Zero-Trust approval card?

For the durable/local execution approval path:

- harder
- server-side pending confirmation and approval ids exist
- `agent_turn.py` correctly treats agent mode as a request, not authority

For legacy direct-chat approval path:

- yes, there is a credible bypass class
- the server still accepts client-carried `approved_action`
- direct execution can be triggered by special confirmation message flow

Conclusion:

- zero-trust is strong in the canonical durable run path
- weaker in legacy direct chat compatibility paths

---

## Race Conditions Map

### Race 1: Dual worker claim

- Surface: `local_queue_claims`
- Risk: duplicate execution
- Fix: atomic lease acquisition

### Race 2: Dual approval resolve

- Surface: `/runs/{run_id}/approvals/{approval_id}/resolve` and `/approvals/{approval_id}/resolve`
- Risk: double resume or conflicting decisions
- Fix: DB compare-and-swap on approval state

### Race 3: Restored run resume duplication

- Surface: resume scheduling after restore
- Risk: same waiting run resumed twice
- Fix: persisted resume lock

### Race 4: Concurrent install edits

- Surface: `workspace_agent_installs`
- Risk: stale or silently lost config
- Fix: optimistic concurrency + config versioning

### Race 5: Concurrent compile and run

- Surface: template compiler + install run path
- Risk: run executes stale compiled artifact
- Fix: config hash pinning

### Race 6: Master/Specialist lineage overwrite

- Surface: metadata stamping
- Risk: wrong actor identity in thread/session/run
- Fix: separate lineage fields, not mutable metadata overload

---

## Architectural Recommendations for Tomorrow

## Priority 0

1. Replace thread-based timeout with killable execution boundaries.
2. Remove client-trusted `approved_action` execution.
3. Make claim acquisition exclusive.

## Priority 1

1. Add a dedicated approval state machine table.
2. Add persisted resume-lock semantics.
3. Classify persistence failures into critical vs best-effort.

## Priority 2

1. Add install config version/hash.
2. Pin compiled artifacts to config hash.
3. Add optimistic concurrency on install updates.

## Priority 3

1. Separate Master/Specialist lineage fields.
2. Add composite workspace-scoped foreign keys where possible.
3. Retire storage split between SQLite and Postgres for sessions.

---

## Final Verdict

The backend is fundamentally viable.

The DAG engine is not the weak point. The weak points are:

- execution cancellation semantics
- concurrency control
- legacy direct-chat approval trust
- split-brain persistence under failure
- config/artifact freshness guarantees

So the system is not “broken.”
It is **strong enough to continue building on**, but not yet safe enough to claim true enterprise-grade execution guarantees without these fixes.

The highest-risk myth to avoid is this:

- “The UI approval card means the system is safe.”

That is false.

The real safety boundary must live in:

- server-issued approval records
- exclusive worker claims
- durable approval state transitions
- killable execution boundaries
- deterministic compiled artifacts

Until those are hardened, the product is impressive, but not yet unbreakable.
