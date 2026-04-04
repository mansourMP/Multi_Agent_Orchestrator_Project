# Empyralis Execution Ledger

## Purpose

This file is the append-only execution ledger for Empyralis.

It exists to capture:

- the current implementation stage
- what has been completed
- what is in progress
- what is required next
- what constraints and requirements are in force

This file is the operational companion to:

- [EMPYRALIS_CANONICAL_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md)

The architecture paper defines what the platform is. This ledger records what has actually happened and what must happen next.

## File Rules

This file is append-only.

Do not delete prior entries.

Do not rewrite history to make the project look cleaner than it was.

Do not turn this file into brainstorming, marketing copy, or speculative wish lists.

Only add concrete platform-relevant updates such as:

- decisions locked
- files created
- files moved
- milestones completed
- requirements added
- verification performed
- blockers discovered
- next required work

If an older entry becomes incomplete or wrong, add a newer correcting entry instead of deleting the old one.

## Required Behavior For Agents

When updating this file, agents must:

- preserve all prior entries
- add a new dated entry at the end of the file
- record only factual changes that actually happened
- name the files, modules, commits, or milestones affected
- state what remains unfinished
- keep the architecture aligned with the canonical architecture paper

Agents must not:

- introduce a parallel architecture here
- quietly change the source-of-truth architecture through this file
- delete older progress notes
- pad the ledger with unnecessary detail unrelated to the platform

## Requirements In Force

The following requirements are currently active:

- [EMPYRALIS_CANONICAL_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md) is the architecture source of truth.
- New core logic must be built in the active product paths, not in legacy parallel stacks.
- The active product paths are:
  - [frontend](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend)
  - [src-tauri](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri)
  - [mobile](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile)
  - [server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server.py)
  - [server_modules](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules)
  - [scripts](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts)
- New core logic must not be added to:
  - [backend](/Users/mansur/Multi_Agent_Orchestrator_Project/backend)
  - [desktop](/Users/mansur/Multi_Agent_Orchestrator_Project/desktop)
- The platform must converge toward one `agent_turn()`, one `run_service()`, one `memory_service()`, one tool and policy contract, and thin channel adapters.
- Historical material must be preserved in archive paths rather than mixed into the active docs surface.
- This ledger must remain append-only.

## Entry Template

Every new entry should include:

- date
- stage
- completed work
- current truth
- open gaps
- next required work
- verification
- commit references if available

## Ledger

### 2026-04-04 - Canonical Architecture Baseline Established

#### Stage

Stage 0 is complete: the platform architecture has been frozen at the document level.

Stage 1 has started: canonical runtime convergence scaffolding has been created, but it is not yet wired into the live execution paths.

#### Completed Work

- Promoted [EMPYRALIS_CANONICAL_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md) into the official architecture source of truth.
- Updated [README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/README.md) and [docs/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/README.md) so the canonical architecture is the first-class reference.
- Reduced the active `/docs` surface to only the essential current documents:
  - [docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md)
  - [docs/EMPYRALIS_EXECUTION_LEDGER.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_EXECUTION_LEDGER.md)
  - [docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md)
  - [docs/DESKTOP_DISTRIBUTION_STRATEGY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/DESKTOP_DISTRIBUTION_STRATEGY.md)
  - [docs/EMPYRALIS_DESKTOP_APP.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_DESKTOP_APP.md)
  - [docs/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/README.md)
- Moved historical active-doc clutter from `/docs` into:
  - [archive/legacy-docs/docs-2026-04-04](/Users/mansur/Multi_Agent_Orchestrator_Project/archive/legacy-docs/docs-2026-04-04)
- Moved root historical notes and generated artifacts out of the repo root into:
  - [archive/legacy-docs/root-notes-2026-04-04](/Users/mansur/Multi_Agent_Orchestrator_Project/archive/legacy-docs/root-notes-2026-04-04)
- Added the first canonical backend service scaffolds:
  - [server_modules/agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_turn.py)
  - [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py)
  - [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py)
  - [server_modules/skills_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/skills_service.py)
  - [server_modules/policy_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/policy_service.py)
  - [server_modules/artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py)
  - [server_modules/machine_lease_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/machine_lease_service.py)
  - [server_modules/outbox_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/outbox_service.py)
  - [server_modules/worker_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/worker_dispatch_service.py)
  - [server_modules/safe_mode_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/safe_mode_service.py)
  - [server_modules/circuit_breaker_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/circuit_breaker_service.py)
  - [server_modules/connectors/base.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/base.py)

#### Current Truth

- The architecture is frozen at the paper level.
- The documentation surface has been cleaned and split into active versus archived material.
- The canonical service layer exists only as scaffolding so far.
- The live runtime is still using the older execution paths.
- Legacy parallel code paths still exist in the repository and are preserved until cutover.

#### Open Gaps

- `agent_turn()` is not yet the real entrypoint for `chat/respond`.
- `agent_turn()` is not yet the real entrypoint for `runs/start`.
- `run_service.py` is not yet replacing the existing run lifecycle code.
- `memory_service.py` is not yet replacing duplicated memory paths.
- thin connector adapters are not yet extracted from the current connector monoliths
- durable outbox and worker dispatch are not yet wired into production execution paths
- the Rust trusted machine-control layer is still a design target, not a completed cutover

#### Next Required Work

1. Route the current chat and run entrypoints through [server_modules/agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_turn.py).
2. Introduce a real runtime composition layer so `agent_turn()`, `run_service()`, `policy_service()`, and `memory_service()` can be called as one canonical flow.
3. Keep current behavior working while converging existing execution code into the canonical service boundary.
4. Split channel-specific normalization and reply formatting toward thin adapters based on [server_modules/connectors/base.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/base.py).
5. Replace duplicated durable-work plumbing with the new outbox and worker dispatcher interfaces.
6. Continue preserving historical material in archive rather than deleting it blindly.

#### Verification

- The new backend service scaffolds compiled successfully with `python3 -m py_compile`.
- The repository was committed and pushed with the canonical baseline changes.

#### Commit References

- `598ab02` `feat: add computer control and auth status support`
- `a7ac871` `docs: mark current documentation and quarantine legacy docs`
- `6a9359b` `chore: canonize architecture and scaffold core services`

### 2026-04-04 - Canonical Turn Contract Routed Into Live Entry Boundaries

#### Stage

Stage 1 is now active in the runtime boundary, not only in scaffolding.

The platform still uses the older execution internals, but both direct chat and durable run start now construct and carry the canonical turn envelope.

#### Completed Work

- Extended [server_modules/agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_turn.py) from placeholder types into a usable contract layer with:
  - direct-chat turn request builders
  - run-start turn request builders
  - serialized turn payload helpers
  - metadata binding helpers
  - turn request resolution helpers
- Updated [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) so:
  - `POST /runs/start` binds a canonical `agent_turn_request` into run metadata before the existing run-start pipeline continues
  - `POST /chat/respond` builds a canonical direct-chat turn envelope before streaming starts
  - direct-chat request meta now carries the serialized canonical turn request
  - direct-chat session context now carries the serialized canonical turn request
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so:
  - `build_chat_turn_event_stream()` can consume the canonical turn envelope
  - `build_direct_operator_reply()` can normalize from the canonical turn envelope instead of only raw ad hoc arguments
- Added focused tests:
  - [server_modules/tests/test_agent_turn.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_agent_turn.py)
  - updated [server_modules/tests/test_runtime_runs_api_session_manager.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runtime_runs_api_session_manager.py)
  - updated [server_modules/tests/test_agent_machine_mode.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_agent_machine_mode.py)

#### Current Truth

- The repo now has one canonical turn contract that is actually present at the live API boundary.
- `runs/start` still uses the old run creation machinery after the canonical request is bound into metadata.
- `chat/respond` still uses the old operator chat machinery after the canonical request is built and threaded through request meta and session context.
- This is a boundary convergence step, not yet a full internal cutover.

#### Open Gaps

- `agent_turn()` is still not the sole executor for direct chat.
- `agent_turn()` is still not the sole executor for durable runs.
- `run_service.py` remains scaffolding and is not yet replacing the older run orchestration path.
- `memory_service.py` remains scaffolding and is not yet the only memory facade.
- connector extraction into thin adapters is still incomplete.
- outbox and worker dispatcher are still not the production async backbone.

#### Next Required Work

1. Introduce a runtime composition function that accepts `AgentTurnRequest` and dispatches into the existing chat and run internals from one place.
2. Move `chat/respond` to call that composition function directly instead of building its own execution wiring.
3. Move `runs/start` to call the same composition function for durable turn creation.
4. Start shifting run lifecycle responsibilities out of the duplicated legacy run modules and into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
5. Record each further convergence step here as a new append-only entry.

#### Verification

- `python3 -m py_compile` passed for the modified runtime and test modules.
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_agent_turn`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Runtime Composition Function Introduced

#### Stage

Stage 1 advanced from boundary normalization into shared execution composition.

The live runtime still relies on older internal chat and run implementations, but route-level orchestration is now converging into one helper that accepts a canonical `AgentTurnRequest`.

#### Completed Work

- Expanded [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) with:
  - `build_run_start_request_from_turn()`
  - canonical metadata preservation for durable-run requests
  - conversion from `AgentTurnRequest` into `RunStartRequest`
- Added a shared executor helper in [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py):
  - `_execute_agent_turn_request()`
- Rewired both live entrypoints to use that helper:
  - `POST /runs/start`
  - `POST /chat/respond`
- Added focused tests for the new composition layer:
  - direct-chat stream plan branch
  - durable-run result branch
  - canonical run-start conversion path

#### Current Truth

- Route-level decision-making is now more centralized.
- The API boundary no longer assembles chat and run execution in two entirely separate ways.
- The runtime still dispatches into the existing legacy internals after the shared executor helper chooses the branch.

#### Open Gaps

- `agent_turn()` is still not the sole implementation entrypoint for all work.
- The shared executor helper still lives in `runtime_runs_api.py`, not yet in a dedicated canonical runtime composition module.
- `run_service.py` is still a conversion and state helper, not yet the full durable run lifecycle owner.
- `operator_chat.py` still contains the old direct-chat execution engine.
- `runs_core.py` and `runs_delegation.py` still remain duplicated orchestration territory.

#### Next Required Work

1. Extract the shared executor helper out of the API module into a dedicated canonical runtime composition layer.
2. Shift durable run orchestration responsibilities progressively from legacy modules into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
3. Start isolating the direct-chat execution engine behind the same canonical runtime composition boundary.
4. Continue converting duplicated infrastructure into service-owned modules without breaking current behavior.

#### Verification

- `python3 -m py_compile` passed for the modified service, runtime, and test files.
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_agent_turn`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Shared Executor Extracted Into Canonical Runtime Composition Module

#### Stage

Stage 1 continues. The shared executor is no longer trapped inside the API transport layer.

The API surface is thinner than before, and the canonical turn orchestration now has a dedicated module boundary.

#### Completed Work

- Added [server_modules/turn_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/turn_runtime.py) as the canonical runtime composition module for current turn execution branching.
- Moved the shared executor logic out of [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) into [server_modules/turn_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/turn_runtime.py).
- Introduced `TurnExecutionServices` so the composition layer depends on explicit callbacks instead of being tied directly to the API transport module.
- Kept [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) as the HTTP adapter that now delegates orchestration into the canonical runtime composition module.
- Updated focused tests to target the extracted composition behavior.

#### Current Truth

- Route orchestration now has a dedicated module boundary.
- `runtime_runs_api.py` still owns transport concerns like request parsing, chat stream session handling, and HTTP response shaping.
- The actual choice between direct-chat streaming and durable-run execution now lives in the extracted composition layer.

#### Open Gaps

- `turn_runtime.py` is the new composition boundary, but the platform still calls older internal chat and run implementations underneath it.
- `run_service.py` still does not own the full durable run lifecycle.
- `operator_chat.py` still owns the direct chat engine.
- The memory layer, outbox layer, and worker-dispatch layer are still only partially converged.
- Connector extraction into thin adapters is still incomplete.

#### Next Required Work

1. Start moving durable-run orchestration behavior from legacy modules into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
2. Introduce a dedicated direct-chat service boundary so [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) stops being the only direct-chat engine owner.
3. Keep shrinking [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) toward transport-only responsibilities.
4. Continue recording every cutover step here as append-only fact.

#### Verification

- `python3 -m py_compile` passed for the extracted composition module and modified runtime/test files.
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_agent_turn`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_machine_mode`
