# Execution Plan Phase Prompts

Use these prompts in order.

This pack is for turning the forensic audit into an implementation program.
It assumes the research corpus already exists and that the model must stay grounded in repository reality.

Do not skip phases.
Do not start with cleanup.
Do not start with scale work before authority and durability are repaired.

## Operating Rule

For each phase, use a fresh chat if the context gets noisy.
If you are continuing in the same chat, tell the model to keep the prior decisions and acceptance criteria fixed unless new repo evidence disproves them.

## Prompt 0: Master Program Setup

Paste this first in a fresh GPT-5.4 Pro or Codex session before starting the implementation program:

```text
You are acting as the lead remediation engineer for this platform.

Your job is not to re-audit the platform. Your job is to convert the established forensic findings into the safest possible implementation program.

Operating constraints:

1. Be surgical and repository-grounded.
2. Do not give generic advice.
3. Every recommendation must map to exact files, exact seams, and exact runtime behavior.
4. Favor containment, authority unification, and durability before cleanup or performance work.
5. Do not propose broad rewrites unless the repository structure leaves no safer path.
6. Explicitly protect existing user-visible behavior unless the current behavior is itself the bug.
7. For every major change, include:
   - exact solution
   - exact files
   - exact tests
   - exact rollout order
   - exact rollback strategy
   - exact safety checks
8. Assume the current platform has these established truths:
   - foreign session adoption is a real risk
   - direct chat bypasses brokered tool policy
   - approvals are split
   - ingress is plural
   - local companion is a second auth plane
   - run creation and outbox delivery are not transactionally safe
   - read models are scan-and-poll heavy
   - deploy/config/secret truth is inconsistent
9. Do not write code until explicitly instructed.
10. Stay in implementation-planning mode unless I explicitly say IMPLEMENT.

When I give you a phase prompt, respond with:

1. objective
2. exact scope
3. non-goals
4. file-by-file change map
5. sequencing
6. test plan
7. rollout plan
8. rollback plan
9. risks
10. done criteria

Do not skip any section.
```

## Prompt 1: Wave 0 Program

Use this to plan the first containment wave.

```text
Plan Wave 0 only.

Wave 0 objective:
Stop the worst active trust-boundary failures without rewriting the platform.

Wave 0 must include exactly these workstreams:

1. Session wall hardening
   - stop blind adoption of foreign session_id values
   - enforce tenant/workspace/channel/thread scoping on session resume

2. Direct chat broker containment
   - remove or hard-disable tool execution, direct connector actions, llm__task, and direct HTTP from the direct-chat side path
   - preserve plain text chat if possible

3. Fail-closed secret/auth/config hardening
   - remove insecure broker signing-secret fallbacks
   - remove JWT secret fallback coupling
   - fix production auth-disable detection
   - stop hidden DATABASE_URL backfill behavior in production paths
   - split public /health from internal diagnostics

4. Safety harness
   - add the regression and adversarial tests needed before deeper refactors

Repository anchors you must reason from:
- server_modules/agent_turn.py
- server_modules/session_service.py
- server_modules/control_plane_repository.py
- server_modules/direct_chat_response_service.py
- server_modules/direct_chat_provider_service.py
- server_modules/skills_service.py
- server_modules/runs_execution.py
- server_modules/tool_broker.py
- server_modules/secrets_broker.py
- server_modules/auth.py
- server_modules/db.py
- server_modules/runtime_config.py
- render.yaml
- server_modules/tests/

Required output format:

1. Wave 0 thesis
2. Workstream W0.1 Session wall hardening
3. Workstream W0.2 Direct chat containment
4. Workstream W0.3 Fail-closed hardening
5. Workstream W0.4 Safety harness
6. Cross-workstream dependency graph
7. Wave 0 rollout sequence
8. Wave 0 rollback sequence
9. Wave 0 release gates

For each workstream include:
- exact solution
- exact files to touch
- exact tests to add or update
- exact safety checks
- exact compatibility concerns
- done criteria

Do not propose code yet.
```

## Prompt 2: Wave 1 Program

Use this after Wave 0 is locked.

```text
Plan Wave 1 only.

Wave 1 objective:
Collapse the platform onto one authority model for app root, ingress, approvals, and runtime identity.

Wave 1 must include exactly these workstreams:

1. Single app root
   - remove duplicate FastAPI root construction
   - make server.py the only app root
   - convert shared.py into shared state only

2. Single ingress contract
   - preserve public connector webhooks only as transport-facing adapters
   - normalize all connector ingress into one canonical inbound contract
   - converge on one AgentTurnRequest shape

3. Single approval authority
   - retire cognitive approval truth as an authority
   - make runtime approvals the only approval system
   - keep temporary compatibility adapters only if needed

4. Runtime identity unification
   - bind local_companion runtime sessions to tenant/workspace/runtime identity
   - stop trusting only runtime_id + session_token + instance_id

Repository anchors you must reason from:
- server.py
- server_modules/shared.py
- server_modules/runtime_runs_api.py
- server_modules/agent_registry_api.py
- server_modules/routes_connectors.py
- server_modules/agent_channel_router.py
- server_modules/agent_turn.py
- server_modules/connectors/autopilot_approval_service.py
- server_modules/runtime_route_registry_service.py
- server_modules/runtime_run_approval_service.py
- server_modules/routes_runs.py
- server_modules/runs_history.py
- server_modules/runtime_runtime_api.py
- server_modules/local_queue.py
- server_modules/machine_lease_service.py

Required output format:

1. Wave 1 thesis
2. Workstream W1.1 Single app root
3. Workstream W1.2 Single ingress contract
4. Workstream W1.3 Single approval authority
5. Workstream W1.4 Runtime identity unification
6. Compatibility strategy
7. Phase-over-phase cutover sequence
8. Rollback strategy
9. Release gates

For each workstream include:
- exact solution
- exact files to touch, merge, or retire
- exact adapter/shim strategy
- exact tests
- exact telemetry/shadow checks
- done criteria

Do not propose code yet.
```

## Prompt 3: Wave 2 Program

Use this after Wave 1 is fixed in scope.

```text
Plan Wave 2 only.

Wave 2 objective:
Repair correctness and durability so the runtime can be trusted under restart, concurrency, and replay.

Wave 2 must include exactly these workstreams:

1. Durable-before-visible run creation
   - durable run registration before execution starts
   - eliminate memory-first live-run creation for durable paths

2. Durable approval state machine
   - make durable approval rows authoritative
   - stop in-memory-first approval convergence

3. Claimed outbox delivery
   - add row claiming / fencing / retry-safe delivery
   - eliminate duplicate-send windows under multi-poller concurrency

4. Fenced local claims
   - add lease-fenced local companion claim/release semantics
   - eliminate unfenced delete-by-run_id behavior

5. Source-of-truth collapse
   - formally define which stores are authoritative
   - demote mirrors and side stores
   - stop triplicated session truth

Repository anchors you must reason from:
- server_modules/run_service.py
- server_modules/turn_runtime.py
- server_modules/runtime_run_approval_service.py
- server_modules/run_state_repository.py
- server_modules/outbox_service.py
- server_modules/machine_lease_service.py
- server_modules/local_queue.py
- server_modules/session_service.py
- server_modules/runtime_state_store.py
- server_modules/runtime_config.py
- server_modules/artifact_service.py
- server_modules/tests/

Required output format:

1. Wave 2 thesis
2. Workstream W2.1 Durable-before-visible runs
3. Workstream W2.2 Durable approvals
4. Workstream W2.3 Claimed outbox delivery
5. Workstream W2.4 Fenced local claims
6. Workstream W2.5 Source-of-truth collapse
7. Data migration and compatibility strategy
8. Crash-rehearsal test plan
9. Rollout and rollback sequence
10. Release gates

For each workstream include:
- exact solution
- exact schema and file changes
- exact migration steps
- exact crash/replay tests
- exact observability checks
- done criteria

Do not propose code yet.
```

## Prompt 4: Wave 3 Program

Use this after Wave 2 is stable.

```text
Plan Wave 3 only.

Wave 3 objective:
Remove the structural scale bottlenecks without changing the repaired authority and durability model.

Wave 3 must include exactly these workstreams:

1. Live-runs bounded read model
   - replace full live_runs scans with paged indexed queries
   - provide dedicated query paths for /runs, /approvals, hosted quota checks, and ops views

2. Event stream repair
   - replace tight poll loops for notifications and channel events with cursor-based durable streams or equivalent bounded models

3. Bootstrap and runtime target optimization
   - cache or snapshot workspace bootstrap
   - remove request-time registry seeding from hot paths
   - reduce runtime target assembly cost

4. Chat-write amplification reduction
   - stop rereading full threads after every turn write

Repository anchors you must reason from:
- server_modules/run_state_repository.py
- server_modules/runtime_runs_api.py
- server_modules/notification_service.py
- server_modules/runtime_events.py
- server_modules/activity_ledger_service.py
- server_modules/control_plane_repository.py
- server_modules/workspace_bootstrap_service.py
- server_modules/runtime_attachment_service.py
- server_modules/agent_registry_repository.py
- frontend/lib/workspace/server-workspace-bootstrap.ts

Required output format:

1. Wave 3 thesis
2. Workstream W3.1 Bounded live-run read model
3. Workstream W3.2 Stream repair
4. Workstream W3.3 Bootstrap and runtime-target optimization
5. Workstream W3.4 Chat-write amplification reduction
6. Performance measurement plan
7. Shadow-compare rollout plan
8. Rollback plan
9. Release gates

For each workstream include:
- exact solution
- exact files and query seams
- exact API compatibility strategy
- exact measurement plan
- exact tests and benchmarks
- done criteria

Do not propose code yet.
```

## Prompt 5: Wave 4 Program

Use this after Wave 3 is stable.

```text
Plan Wave 4 only.

Wave 4 objective:
Finish surface honesty, governance, deploy truth, and post-unification cleanup.

Wave 4 must include exactly these workstreams:

1. Canonical surface completion
   - move web chat onto the canonical turn contract
   - move mobile onto the canonical contract or an explicit BFF adapter
   - mount the real mobile shell

2. Governance and restoreability
   - define unified migration discipline
   - define backup/restore manifest and rehearsal process
   - define legal-hold, export, retention, and delete flows

3. Deploy truth repair
   - define one supported deploy story per target
   - remove stale deployment surfaces and hidden runtime fallbacks

4. Architectural fat removal
   - only after the live runtime graph is singular
   - collapse connector facade/bridge shells
   - collapse route-registration shells
   - remove dead UI files and stale compose paths

Repository anchors you must reason from:
- frontend/app/(account)/w/[workspaceId]/chat/page.tsx
- frontend/app/(account)/w/[workspaceId]/WorkspaceSurfacePage.tsx
- frontend/lib/workspace/workspace-feature-surface.tsx
- mobile/src/lib/surfaces/shared.js
- mobile/src/lib/surfaces/chat-surface.js
- mobile/app/(tabs)/_layout.tsx
- server_modules/control_plane_repository.py
- server_modules/runtime_state_store.py
- server_modules/artifact_service.py
- server_modules/connectors/*
- server_modules/runtime_route_registration_service.py
- server_modules/runtime_route_binding_service.py
- docker-compose.yml
- render.yaml
- src-tauri/src/lib.rs

Required output format:

1. Wave 4 thesis
2. Workstream W4.1 Canonical surface completion
3. Workstream W4.2 Governance and restoreability
4. Workstream W4.3 Deploy truth repair
5. Workstream W4.4 Architectural fat removal
6. Cutover strategy
7. Deletion safety criteria
8. Rollback strategy
9. Release gates

For each workstream include:
- exact solution
- exact files to modify, retire, or delete
- exact migration or cutover plan
- exact restore and governance checks
- exact tests
- done criteria

Do not propose code yet.
```

## Prompt 6: Whole Program Dependency Map

Use this after all five wave plans exist.

```text
Using the completed Wave 0 through Wave 4 plans, build the master dependency map.

Required outputs:

1. Program thesis
2. Dependency graph across all workstreams
3. Ordered execution sequence
4. Critical-path workstreams
5. Parallelizable workstreams
6. Workstreams that must not overlap
7. Cross-wave risk register
8. Program-level rollback posture
9. Enterprise-grade release gates

Rules:
- no code
- no generic PM language
- ground every dependency in repository structure or runtime coupling
- identify the specific waves that block feature work
```

## Prompt 7: File-By-File Docket

Use this after the dependency map is stable.

```text
Using the completed wave plans, convert the remediation program into a file-by-file execution docket.

Required outputs:

1. A table grouped by wave
2. For each row include:
   - workstream id
   - file path
   - reason this file changes
   - change type: modify / delete / merge / create
   - primary risk
   - prerequisite workstreams
   - required tests
   - rollback notes

Rules:
- include only files that are materially involved
- do not invent files unless a new file is clearly required
- if a file is uncertain, mark it as likely not confirmed
- no code
```

## Prompt 8: Acceptance Criteria Pack

Use this before implementation begins.

```text
Using the completed wave plans, write the final acceptance criteria pack for implementation.

For every workstream in Wave 0 through Wave 4, define:

1. preconditions
2. implementation completion criteria
3. regression tests required
4. observability checks required
5. cutover conditions
6. rollback trigger conditions
7. post-release validation checks

Rules:
- make the criteria binary and testable
- do not use vague words like improved, cleaner, better, or safer without measurable conditions
- no code
```

## Prompt 9: Implementation Prompt Template

Use this only when you are ready to actually start coding one workstream.

```text
IMPLEMENT WORKSTREAM: <workstream id>

Use the previously agreed remediation plan as the contract.

Rules:

1. Modify only the files required for this workstream.
2. Do not opportunistically refactor unrelated code.
3. Preserve compatibility shims if the plan requires them.
4. Add or update the exact tests defined in the acceptance criteria.
5. Run the minimal relevant verification for this workstream.
6. At the end, report:
   - files changed
   - tests run
   - tests not run
   - known residual risks
   - whether the workstream now meets its done criteria

Before editing, restate:
- objective
- exact scope
- non-goals
- rollback plan
```

## Recommended Sequence

Use the prompts in this order:

1. Prompt 0: Master Program Setup
2. Prompt 1: Wave 0 Program
3. Prompt 2: Wave 1 Program
4. Prompt 3: Wave 2 Program
5. Prompt 4: Wave 3 Program
6. Prompt 5: Wave 4 Program
7. Prompt 6: Whole Program Dependency Map
8. Prompt 7: File-By-File Docket
9. Prompt 8: Acceptance Criteria Pack
10. Prompt 9: Implementation Prompt Template

## Non-Negotiable Rule

Do not begin implementation until:

- Wave 0 through Wave 4 plans are written
- the dependency map exists
- the file-by-file docket exists
- acceptance criteria exist

That prevents random code churn and keeps the remediation program controlled.
