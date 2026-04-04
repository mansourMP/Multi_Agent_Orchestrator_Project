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
