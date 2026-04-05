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

### 2026-04-04 - Telegram Inbound Update Context Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The Telegram poll loop no longer owns raw inbound message extraction, inbound-event context assembly, attachment-aware image-only fallback promotion, or guided automation setup reply orchestration inline.

This does not finish the Telegram poll loop yet. The loop still sequences updates, enforces sender allowlists, delegates non-run and run actions, and records processed-update state. But the inbound normalization block is now a real connector service boundary instead of monolith-owned glue.

#### Completed Work

- Added [server_modules/connectors/telegram_inbound_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_inbound_context_service.py).
- Moved Telegram raw inbound extraction behind that service:
  - update to message extraction
  - chat and bot-sender filtering
  - configured-chat matching
- Moved Telegram inbound event/context assembly behind that service:
  - attachment storage
  - routed action calculation
  - image-only attachment fallback to `run`
  - session key and trace id derivation
  - inbound channel event recording
- Moved Telegram guided automation setup interception behind that service:
  - guided-setup decision
  - automation setup reply event recording
  - automation setup reply send
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so `_telegram_poll_connector()` now delegates inbound extraction and inbound context assembly to the new service instead of owning that block inline.
- Added focused service coverage in [server_modules/tests/test_telegram_inbound_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_inbound_context_service.py).

#### Current Truth

- Telegram connector behavior is now split across smaller service boundaries for:
  - routing
  - profile/onboarding
  - camera setup
  - media handling
  - sender filtering
  - non-run actions
  - run actions
  - run dispatch
  - poll-state patching
  - inbound update context assembly
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is still the poll-loop coordinator, but another heavy inline ownership block has been removed.
- The Telegram poll loop is now closer to coordination-only code than to a single-module connector implementation.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the top-level Telegram poll sequencing loop.
- Sender allowlist enforcement still lives in the poll loop even though denied-sender handling is already service-owned.
- The remaining loop still coordinates action dispatch and processed-update bookkeeping inline.

### 2026-04-05 - Runtime Init, State, and Export Façade Moved Behind Runtime Service

#### Stage

Stage 2 connector convergence continues. The remaining runtime-facing helper band in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) no longer owns the runtime import sync logic or the full init/state/event/export delegation block inline.

This is still not the final connector cutover. The module remains the compatibility surface for historical imports, but another stateful ownership band has been reduced to service-backed wrappers.

#### Completed Work

- Added [server_modules/connectors/autopilot_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_facade_service.py).
- Added focused coverage in [server_modules/tests/test_autopilot_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_runtime_facade_service.py).
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so these historical helpers now delegate through the new runtime façade service:
  - `_init()`
  - `_load_telegram_autopilot_state()`
  - `_load_whatsapp_autopilot_state()`
  - `_telegram_autopilot_snapshot()`
  - `_whatsapp_autopilot_snapshot()`
  - `_whatsapp_autopilot_activate()`
  - `_telegram_increment_processed_updates()`
  - `_telegram_set_connectors_seen()`
  - `_mark_telegram_autopilot_started()`
  - `_record_channel_event()`
  - `_append_channel_dead_letter()`
  - `_record_channel_event_throttled()`
  - `handle_telegram_send_message()`
  - `handle_telegram_autopilot_test_message()`
  - `handle_whatsapp_twilio_webhook()`
  - `_run_telegram_autopilot_forever()`
  - `handle_telegram_autopilot_status()`
  - `handle_whatsapp_autopilot_status()`
  - `handle_list_autopilot_profiles()`
- Tightened the remaining wrappers in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) to use direct façade delegation instead of repeating large keyword-forwarding blocks.
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) from `905` lines to `862` lines in this cut.

#### Current Truth

- The connector module is now more clearly a compatibility/export shell instead of owning runtime initialization details inline.
- Runtime server import/sync behavior is preserved, including selective synchronization of `TELEGRAM_AUTOPILOT_THREAD`, `TELEGRAM_AUTOPILOT_STATE`, and `WHATSAPP_AUTOPILOT_STATE`.
- Event dedupe compatibility is preserved because `_record_channel_event_throttled()` still passes the late-bound `_record_channel_event` wrapper into the underlying event service.
- Runtime status, Telegram terminal actions, and WhatsApp webhook entrypoints still keep their historical import names, but now route through the shared runtime façade service.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is smaller, but it still owns the top-level compatibility layer for channel/runtime helpers.
- The module still contains registry singletons and compatibility wrappers that should continue converging toward thinner adapter-only responsibilities.
- The broader canonical architecture work remains unfinished outside this connector cut; this entry only covers the remaining runtime façade band.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) toward a pure compatibility shell with minimal singleton wiring.
2. Identify the next remaining ownership cluster in the connector surface and move it behind a dedicated service without breaking direct-import test paths.
3. Keep verifying late-bound behavior explicitly anywhere tests patch `server_modules.autopilot_connectors` globals after import.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_facade_service.py)
  - [server_modules/tests/test_autopilot_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_runtime_facade_service.py)
- Focused repo-venv tests passed:
  - `server_modules.tests.test_autopilot_runtime_facade_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_autopilot_terminal_bridge_service`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`
- Result: `23 passed`

### 2026-04-05 - Shared Bridge Assembly Moved Behind Bridge Façade Service

#### Stage

Stage 2 connector convergence continues. The shared-registry plus bridge-assembly constructor block is no longer owned inline by [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This does not change the historical import surface. The connector module still exports the same helpers, but the shared bridge graph is now assembled behind a dedicated façade service instead of being wired directly inside the compatibility module.

#### Completed Work

- Added [server_modules/connectors/autopilot_bridge_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_facade_service.py).
- Added focused coverage in [server_modules/tests/test_autopilot_bridge_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_bridge_facade_service.py).
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the shared bridge construction now flows through the bridge façade service instead of instantiating [server_modules/connectors/autopilot_bridge_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_registry_service.py) inline.
- Moved these access paths behind the new façade:
  - `_autopilot_shared_service_registry()`
  - `_autopilot_status_service()`
  - `_autopilot_endpoint_service()`
  - `_autopilot_event_service()`
  - `_autopilot_event_bridge_service()`
  - `_autopilot_terminal_bridge_service()`
  - `_autopilot_state_bridge_service()`
  - `_telegram_compatibility_bridge_service()`
  - `_whatsapp_webhook_bridge_service()`
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) from `862` lines to `850` lines in this cut.

#### Current Truth

- Shared event/status/endpoint service access and the shared bridge graph are now assembled in one dedicated façade service.
- The connector compatibility module remains the stable import boundary, but it owns less bridge wiring logic directly.
- Late-bound compatibility remains intact because enabled flags, profile catalogs, Telegram state/lock, and webhook secret values are still read through getters when the façade builds the bridge registry.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still contains the remaining singleton-construction layer for channel, helper, support, and runtime registries.
- The connector module is smaller, but it is still not a pure adapter shell.
- This cut only removes the shared bridge assembly block; broader canonical runtime convergence is still unfinished.

#### Next Required Work

1. Continue extracting the remaining singleton constructor bands from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially the channel/helper/support/runtime registry setup.
2. Keep preserving late-bound patchability for tests that override globals on `server_modules.autopilot_connectors` after import.
3. Maintain focused verification on webhook, runtime-status, agent-machine, and event-dedupe paths after each constructor-band move.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_bridge_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_facade_service.py)
  - [server_modules/tests/test_autopilot_bridge_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_bridge_facade_service.py)
- Focused repo-venv tests passed:
  - `server_modules.tests.test_autopilot_bridge_facade_service`
  - `server_modules.tests.test_autopilot_bridge_registry_service`
  - `server_modules.tests.test_autopilot_runtime_facade_service`
  - `server_modules.tests.test_whatsapp_webhook_bridge_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`
- Result: `24 passed`

### 2026-04-05 - Channel, Helper, Support, and Runtime Registry Setup Moved Behind Registry Façade

#### Stage

Stage 2 connector convergence continues. The remaining constructor band for channel, helper, support, and runtime registry setup is no longer owned inline by [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a material reduction, not just another wrapper shuffle. The compatibility module now delegates the registry build graph through one dedicated façade service instead of manually instantiating each registry bridge inline.

#### Completed Work

- Added [server_modules/connectors/autopilot_registry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py).
- Added focused coverage in [server_modules/tests/test_autopilot_registry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_registry_facade_service.py).
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so these constructor/access bands now delegate through the registry façade:
  - `_autopilot_channel_registry_bridge_service()`
  - `_telegram_service_registry()`
  - `_telegram_helper_registry_bridge_service()`
  - `_telegram_helper_registry()`
  - `_autopilot_support_service_registry()`
  - `_autopilot_runtime_service_registry()`
  - `_autopilot_profile_service()`
  - `_telegram_connector_support_service()`
  - `_runtime_status_service()`
  - `_autopilot_workflow_setup_service()`
  - `_telegram_connector_context_service()`
  - `_autopilot_approval_service()`
  - `_telegram_transport_service()`
  - `_telegram_terminal_service()`
  - `_autopilot_common_support_service()`
  - `_autopilot_run_entry_service()`
  - `_autopilot_runtime_support_service()`
  - `_autopilot_skill_service()`
  - `_autopilot_channel_support_service()`
  - `_telegram_menu_service()`
- Removed the inline singleton construction blocks for the four registry bridge builders from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- Removed stale connector-level singleton globals that were no longer the real owners after the bridge and runtime façade cuts.
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) from `850` lines to `729` lines in this cut.

#### Current Truth

- Registry construction for channel, helper, support, and runtime services now lives behind one façade service instead of being spread across multiple long inline constructor functions.
- The compatibility module remains the stable import boundary, but most of its former constructor weight is gone.
- Late-bound behavior is still preserved because workspace ids, enabled flags, prefixes, profile catalogs, engines, run timeouts, run/reply limits, state maps, locks, and webhook/runtime settings are still resolved through getters when the façade builds the registry bridges.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now smaller, but it still contains environment/constants setup, compatibility wrappers, and remaining top-level accessors.
- The module is not yet a pure thin adapter shell.
- This cut only addresses the registry-construction band; broader canonical runtime convergence remains unfinished outside the connector refactor.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) toward a minimal compatibility surface now that both bridge and registry assembly are externalized.
2. Audit the remaining top-of-file environment and state-resolution section for another coherent extraction seam.
3. Keep verifying direct-import and late-bound patch compatibility after each cut, especially on `test_agent_machine_mode` and `test_autopilot_event_dedupe`.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_registry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_registry_facade_service.py)
  - [server_modules/tests/test_autopilot_registry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_registry_facade_service.py)
- Focused repo-venv tests passed:
  - `server_modules.tests.test_autopilot_registry_facade_service`
  - `server_modules.tests.test_autopilot_channel_registry_bridge_service`
  - `server_modules.tests.test_telegram_helper_registry_bridge_service`
  - `server_modules.tests.test_autopilot_support_registry_bridge_service`
  - `server_modules.tests.test_autopilot_runtime_registry_bridge_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`
- Result: `22 passed`

### 2026-04-05 - Connector Config and State-Path Setup Moved Into Dedicated Config Module

#### Stage

Stage 2 connector convergence continues. The remaining environment/configuration and state-path setup block is no longer owned inline by [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This cut keeps the historical names available on the connector module, but the shell now imports those definitions from a dedicated config module instead of owning the env and path-resolution block directly.

#### Completed Work

- Added [server_modules/connectors/autopilot_connector_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_config.py).
- Added focused coverage in [server_modules/tests/test_autopilot_connector_config_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_config_exports.py).
- Moved the following setup out of [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) into the new config module:
  - `_AUTOPILOT_ERROR_CATEGORY_HINTS`
  - `_AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS`
  - `_AUTOPILOT_EVENT_DEDUP`
  - `_AUTOPILOT_EVENT_DEDUP_LOCK`
  - `EMPYRALIS_STATE_HOME`
  - `PROJECT_ROOT`
  - `EMPYRALIST_RUNTIME_URL`
  - `EMPYRALIST_WORKFLOW_API_URL`
  - `EMPYRALIST_WEB_URL`
  - `_telegram_get_updates_process_lock()`
  - `_resolve_state_file()`
  - `_resolve_state_dir()`
  - Telegram media/profile/onboarding/camera state path constants
  - channel dead-letter path and lock constants
  - Telegram quick-goal and menu template maps
  - `DEFAULT_CHAT_PREFIX`
- Trimmed the connector shell import block so it now imports these config names instead of defining them inline.
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) from `729` lines to `590` lines in this cut.

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) now behaves more clearly like a compatibility/export shell.
- The extracted config names are still available through `server_modules.autopilot_connectors`, so direct-import callers and tests do not need to change.
- The shell now owns far less inert setup code and more clearly contains only façade wiring plus compatibility wrappers.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is much smaller, but it still contains remaining façade builders and compatibility exports.
- The module is not yet a pure minimal adapter surface.
- This cut only externalizes configuration/state-path setup; broader runtime convergence and remaining connector shell cleanup still remain.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by identifying whether the remaining bridge/runtime façade builders can collapse further.
2. Keep direct-export tests in place wherever names move out of the connector shell but must remain accessible through it.
3. Maintain focused verification on `test_agent_machine_mode` and `test_autopilot_event_dedupe` after each shell-reduction cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_connector_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_config.py)
- Focused repo-venv tests passed:
  - `server_modules.tests.test_autopilot_connector_config_exports`
  - `server_modules.tests.test_autopilot_registry_facade_service`
  - `server_modules.tests.test_autopilot_bridge_facade_service`
  - `server_modules.tests.test_autopilot_runtime_facade_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`
- Result: `23 passed`
- The broader connector monolith still contains other channel behavior outside the Telegram slices already extracted.

#### Next Required Work

1. Keep reducing the remaining Telegram poll loop so it becomes sequencing code around services, not a place where connector behavior accumulates again.
2. Decide whether sender-allowlist evaluation itself should move behind a Telegram ingress service boundary now that denied-sender handling is already extracted.
3. Continue cutting non-Telegram channel behavior out of [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) until the file is a thin coordination layer rather than the connector implementation.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_inbound_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_inbound_context_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_inbound_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_inbound_context_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Poll Update Dispatch Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The Telegram poll loop no longer owns the per-update dispatch control flow inline.

The loop still fetches updates, tracks `max_seen`, and records poll-completion/error state. But the per-update branch that handled sender allowlists, inbound-context service calls, action dispatch, run dispatch, and fallback help reply is now a dedicated connector service.

#### Completed Work

- Added [server_modules/connectors/telegram_poll_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_dispatch_service.py).
- Moved Telegram per-update dispatch orchestration behind that service:
  - sender allowlist evaluation
  - denied-sender handoff into the sender-filter service
  - inbound-context service handoff
  - guided-setup short-circuit handling
  - non-run action dispatch via the action service
  - run action dispatch via the run-action service
  - final help fallback when a non-run action does not handle the message
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so `_telegram_poll_connector()` now delegates the per-update decision tree to the new dispatch service and only records processed state from the returned result.
- Added focused service coverage in [server_modules/tests/test_telegram_poll_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_poll_dispatch_service.py).

#### Current Truth

- The Telegram connector is now split across service boundaries for:
  - ingress context extraction
  - per-update dispatch orchestration
  - sender filtering
  - routing
  - onboarding/profile
  - media
  - guided camera setup
  - run action composition
  - run dispatch
  - poll-state patching
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) remains the poll coordinator, but another large conditional ownership block has been removed.
- The file is now below 4000 lines, which is a real structural reduction rather than only service scaffolding.

#### Open Gaps

- The Telegram poll loop still owns update fetching, `max_seen` progression, and completion/error state transitions inline.
- The connector monolith still contains non-Telegram channel behavior and top-level thread/poller orchestration.
- The channel adapters are moving in the right direction, but the monolith is not yet a thin coordination shell.

#### Next Required Work

1. Continue shrinking the Telegram poll loop until it becomes fetch/iterate/state coordination around service calls only.
2. Keep extracting non-Telegram channel control flow from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
3. After the connector monolith is thinner, decide whether the top-level poller lifecycle itself should move behind a channel supervisor boundary.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_poll_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_dispatch_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_poll_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_poll_dispatch_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Poll Cycle Lifecycle Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The Telegram poller no longer owns the `getUpdates` lifecycle edge inline.

Approval preflight, poll-lock handling, `getUpdates` fetch, poll completion patching, approval-only patching, and connector-error recording are now behind a dedicated service. The poll loop still iterates updates, but another top-level lifecycle block has been removed from the monolith.

#### Completed Work

- Added [server_modules/connectors/telegram_poll_cycle_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_cycle_service.py).
- Moved Telegram poll-cycle lifecycle behavior behind that service:
  - approval notification preflight
  - `getUpdates` lock acquisition handling
  - `getUpdates` fetch request construction
  - update list normalization
  - poll completion patching
  - approval-only patching when no updates are processed
  - connector-error event recording, connector-error state patching, and autopilot error marking
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so `_telegram_poll_connector()` now delegates poll begin, poll completion, and connector-error handling to the cycle service.
- Added focused service coverage in [server_modules/tests/test_telegram_poll_cycle_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_poll_cycle_service.py).

#### Current Truth

- The Telegram connector is now decomposed into service-owned boundaries for:
  - poll-cycle lifecycle
  - per-update dispatch
  - inbound context assembly
  - sender filtering
  - routing
  - profile/onboarding
  - media
  - guided camera setup
  - run action composition
  - run dispatch
  - poll-state patching
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still coordinates the outer Telegram poll flow, but it no longer owns most of the connector behavior inline.
- The monolith is still present, but the Telegram slice is increasingly a coordinator over connector services rather than a single blob.

#### Open Gaps

- The Telegram outer poll loop still owns update iteration, `max_seen` progression, and the surrounding forever-loop orchestration.
- The non-Telegram channel logic still lives in the same monolith file.
- The connector monolith is smaller and better factored, but it is not yet a thin coordination shell.

#### Next Required Work

1. Continue reducing the remaining Telegram outer loop until it is mostly iteration and delegation only.
2. Move the non-Telegram control flow out of [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) using the same bounded-service approach.
3. After the channel logic is thinner, decide whether the long-running autopilot loop should move behind a supervisor/runtime service boundary.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_poll_cycle_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_cycle_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_poll_cycle_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_poll_cycle_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Autopilot Loop Iteration Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The outer Telegram autopilot loop iteration is now a dedicated service boundary.

The monolith still owns the forever loop and thread lifecycle, but the per-iteration control flow (connector enumeration, connector error fan-in, poll markers, and loop error/backoff handling) is now a service that can be tested independently.

#### Completed Work

- Added `server_modules/connectors/telegram_autopilot_loop_service.py`.
- Moved the per-iteration Telegram autopilot logic behind that service:
  - connector enumeration
  - connectors-seen counter update
  - poll mark (success/error) update
  - per-connector error fan-in and event recording
  - loop-level error handling and backoff sleep selection
- Updated `server_modules/autopilot_connectors.py` so `_run_telegram_autopilot_forever()` delegates each iteration to the new service.
- Added focused coverage in `server_modules/tests/test_telegram_autopilot_loop_service.py`.

#### Current Truth

- Telegram connector behavior is now mostly service-owned:
  - poll-cycle lifecycle
  - per-update dispatch
  - inbound context assembly
  - sender filtering
  - routing
  - profile/onboarding
  - media
  - guided camera setup
  - run action composition
  - run dispatch
  - poll-state patching
  - autopilot loop iteration
- `server_modules/autopilot_connectors.py` still owns the forever loop shell and the other channel coordination, but the main Telegram runtime control blocks are now service boundaries.

#### Open Gaps

- The outer forever loop is still inline in `server_modules/autopilot_connectors.py`.
- Non-Telegram channels still sit in the same monolith file.
- The monolith is smaller but not yet a thin coordination shell.

#### Next Required Work

1. Keep extracting non-Telegram channel control flow from `server_modules/autopilot_connectors.py`.
2. Decide whether the outer Telegram forever loop belongs in a long-running supervisor service.
3. Consider a top-level channel supervisor to coordinate Telegram and WhatsApp runtime loops consistently.

#### Verification

- `python3 -m py_compile` passed for:
  - `server_modules/connectors/telegram_autopilot_loop_service.py`
  - `server_modules/autopilot_connectors.py`
  - `server_modules/tests/test_telegram_autopilot_loop_service.py`
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Autopilot Status Payload Assembly Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The Telegram and WhatsApp autopilot status endpoints no longer build their response payloads inline inside the monolith.

This moves another top-level ownership block out of `autopilot_connectors.py`: snapshot-to-response assembly for the two active channel status surfaces is now service-owned and directly testable.

#### Completed Work

- Added `server_modules/connectors/autopilot_status_service.py`.
- Moved Telegram autopilot status payload assembly behind that service:
  - snapshot consumption
  - connector-entry lookup
  - per-connector payload shaping
  - vault error capture
- Moved WhatsApp autopilot status payload assembly behind that service:
  - snapshot consumption
  - connector-entry lookup
  - per-connector payload shaping
  - vault error capture
- Updated `server_modules/autopilot_connectors.py` so:
  - `handle_telegram_autopilot_status()` delegates to the status service
  - `handle_whatsapp_autopilot_status()` delegates to the status service
- Added focused coverage in `server_modules/tests/test_autopilot_status_service.py`.

#### Current Truth

- The active connector status surfaces are now service-owned rather than monolith-owned.
- Telegram runtime control flow, status assembly, and most Telegram connector behavior are now behind bounded services.
- `server_modules/autopilot_connectors.py` still contains shared autopilot runtime code and remaining non-extracted channel logic, but another top-level endpoint block has been removed.

#### Open Gaps

- The monolith still owns profile-list endpoint assembly and remaining shared runtime state helpers.
- WhatsApp and shared autopilot lifecycle code still live in the same file.
- The connector monolith is significantly smaller, but it is still not reduced to a thin coordination shell.

#### Next Required Work

1. Continue moving top-level autopilot endpoint and runtime payload assembly out of `server_modules/autopilot_connectors.py`.
2. Keep extracting remaining WhatsApp and shared runtime control flow into bounded services.
3. Reassess whether `autopilot_connectors.py` should split into channel supervisor modules once the remaining shared state helpers are smaller.

#### Verification

- `python3 -m py_compile` passed for:
  - `server_modules/connectors/autopilot_status_service.py`
  - `server_modules/autopilot_connectors.py`
  - `server_modules/tests/test_autopilot_status_service.py`
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`

### 2026-04-04 - Autopilot Endpoint Wrappers Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The remaining inline endpoint wrapper logic for WhatsApp webhook handling and autopilot profile catalog payload assembly no longer lives in the monolith.

This removes another top-level endpoint ownership block from `server_modules/autopilot_connectors.py`: the file no longer assembles autopilot profile payloads itself and no longer owns the WhatsApp webhook gate logic inline.

#### Completed Work

- Added `server_modules/connectors/autopilot_endpoint_service.py`.
- Moved WhatsApp webhook endpoint wrapper behavior behind that service:
  - disabled-autopilot response selection
  - webhook secret validation result
  - inbound form handoff result shaping
- Moved autopilot profile catalog payload assembly behind that service:
  - Telegram profile list shaping
  - WhatsApp profile list shaping
  - static webhook path exposure
- Updated `server_modules/autopilot_connectors.py` so:
  - `handle_whatsapp_twilio_webhook()` delegates to the endpoint service
  - `handle_list_autopilot_profiles()` delegates to the endpoint service
- Added focused coverage in `server_modules/tests/test_autopilot_endpoint_service.py`.

#### Current Truth

- The top-level autopilot HTTP/status/profile endpoint surfaces are increasingly service-owned.
- Telegram runtime control flow, status assembly, and profile/status endpoint payloads are no longer monolith-owned blocks.
- `server_modules/autopilot_connectors.py` still contains shared runtime state helpers and remaining channel logic, but another endpoint slice has been removed cleanly.

#### Open Gaps

- Shared autopilot state/snapshot helpers still live in `server_modules/autopilot_connectors.py`.
- WhatsApp runtime state and shared connector registry helpers remain in the monolith.
- The monolith is smaller, but it is still not yet reduced to a thin coordination layer.

#### Next Required Work

1. Continue extracting shared autopilot state and registry helpers from `server_modules/autopilot_connectors.py`.
2. Move more WhatsApp/shared lifecycle behavior into bounded connector services.
3. Reassess whether the remaining state helpers should split into dedicated Telegram and WhatsApp runtime modules rather than staying in one shared monolith.

#### Verification

- `python3 -m py_compile` passed for:
  - `server_modules/connectors/autopilot_endpoint_service.py`
  - `server_modules/autopilot_connectors.py`
  - `server_modules/tests/test_autopilot_endpoint_service.py`
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`

### 2026-04-04 - WhatsApp Autopilot State And Registry Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The WhatsApp autopilot runtime-state block no longer lives inline inside the monolith.

This is a heavier cut than the recent endpoint extractions. The WhatsApp state persistence, mutation, snapshot assembly, and connector registry listing logic are now behind a dedicated service boundary instead of being spread across inline helper functions.

#### Completed Work

- Added `server_modules/connectors/whatsapp_autopilot_state_service.py`.
- Moved WhatsApp autopilot runtime-state behavior behind that service:
  - state load from disk
  - state persist to disk
  - error marking
  - activation
  - inbound marker updates
  - processed-message counter updates
  - per-connector state lookup and patching
  - vault-backed connector entry listing with identity de-duplication
  - snapshot assembly with connector counts and `connectors_seen`
- Updated `server_modules/autopilot_connectors.py` so the existing WhatsApp helper names now delegate to the new service boundary instead of owning the implementation inline.
- Added focused coverage in `server_modules/tests/test_whatsapp_autopilot_state_service.py`.

#### Current Truth

- Telegram connector behavior is mostly service-owned.
- WhatsApp webhook handling, run dispatch, status payloads, endpoint wrappers, and now runtime-state logic are service-owned as well.
- `server_modules/autopilot_connectors.py` still contains shared runtime helpers and some remaining Telegram state/helper logic, but a major WhatsApp ownership block is now out of it.

#### Open Gaps

- Telegram runtime-state and registry helpers still live inline in `server_modules/autopilot_connectors.py`.
- Shared autopilot helper code is still mixed with channel-specific code in the monolith.
- The monolith is materially smaller, but it is still not just a thin coordination layer yet.

#### Next Required Work

1. Apply the same pattern to the remaining Telegram runtime-state and connector-registry helper block.
2. After both channel state blocks are service-owned, reassess what shared autopilot helpers deserve their own runtime-state or supervisor module.
3. Keep pulling any remaining top-level channel-specific helpers out of `server_modules/autopilot_connectors.py` so the file converges toward composition only.

#### Verification

- `python3 -m py_compile` passed for:
  - `server_modules/connectors/whatsapp_autopilot_state_service.py`
  - `server_modules/autopilot_connectors.py`
  - `server_modules/tests/test_whatsapp_autopilot_state_service.py`
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - Telegram Autopilot State And Registry Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The Telegram runtime-state and connector-registry block no longer lives inline in the monolith.

This completes the same move already done for WhatsApp: both channel runtime-state surfaces are now service-owned instead of being implemented as long inline helper clusters in `server_modules/autopilot_connectors.py`.

#### Completed Work

- Added [server_modules/connectors/telegram_autopilot_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_state_service.py).
- Moved Telegram autopilot runtime-state behavior behind that service:
  - state load from disk
  - state persist to disk
  - per-connector state lookup and patching
  - vault-backed connector entry listing with identity de-duplication
  - snapshot assembly including thread liveness and dropped-sender counts
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the existing Telegram helper names now delegate to the new service boundary.
- Added focused coverage in [server_modules/tests/test_telegram_autopilot_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_state_service.py).

#### Current Truth

- Telegram connector behavior is mostly service-owned.
- WhatsApp connector behavior is also mostly service-owned.
- Both channel runtime-state and registry blocks are now outside the monolith.
- `server_modules/autopilot_connectors.py` still contains shared autopilot helpers and some remaining runtime glue, but the large channel-specific state blocks are no longer concentrated there.

#### Open Gaps

- Shared autopilot helper logic is still mixed into `server_modules/autopilot_connectors.py`.
- Some remaining runtime glue and endpoint registration logic still lives in the monolith.
- The file is much smaller, but it is still not yet just a thin composition layer.

#### Next Required Work

1. Continue extracting the remaining shared autopilot helper/runtime glue from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
2. Reassess whether the shared autopilot logic should split into dedicated supervisor/runtime modules now that both channel state surfaces are already service-owned.
3. Keep shrinking the monolith toward composition and endpoint registration only.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_autopilot_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_state_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_autopilot_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_state_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - Telegram Autopilot Runtime Mutation And Backoff Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The remaining Telegram runtime mutation helpers no longer live inline inside the monolith.

Processed-update counting, connectors-seen updates, poll-success clearing, and loop backoff/error mutation are now behind a dedicated runtime service instead of being owned directly by `server_modules/autopilot_connectors.py`.

#### Completed Work

- Added [server_modules/connectors/telegram_autopilot_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_runtime_service.py).
- Moved Telegram runtime mutation behavior behind that service:
  - processed-update counter increments
  - connectors-seen counter updates
  - loop/connector error state mutation with retry backoff
  - poll-success clearing and success timestamp updates
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the existing Telegram helper names now delegate to the new runtime service.
- Added focused coverage in [server_modules/tests/test_telegram_autopilot_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_runtime_service.py).

#### Current Truth

- Telegram runtime state, runtime mutation, poll-cycle, loop iteration, dispatch, inbound context, and status surfaces are now all service-owned.
- WhatsApp runtime state, webhook handling, status surfaces, and run dispatch are also service-owned.
- `server_modules/autopilot_connectors.py` still contains remaining shared autopilot glue and endpoint registration/runtime composition, but more of the behavior is now concentrated in smaller connector services instead of the monolith.

#### Open Gaps

- Shared autopilot helper code is still present in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- Some endpoint wiring and shared runtime composition still live inline in the monolith.
- The file is materially smaller, but it is not yet reduced to composition-only code.

#### Next Required Work

1. Continue extracting the remaining shared autopilot helper/runtime composition code from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
2. Reassess whether the remaining monolith should split into smaller registration/composition modules now that both channels’ runtime state and behavior blocks are mostly service-owned.
3. Keep shrinking the file toward thin coordination and endpoint registration only.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_autopilot_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_runtime_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_autopilot_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_runtime_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_runtime_service`
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

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

### 2026-04-04 - Durable Run Branch Moved Into Run Service

#### Stage

Stage 1 continues. The run service now owns more than request conversion.

The durable-run branch is no longer implemented inside the turn runtime module. It is now delegated to [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).

#### Completed Work

- Expanded [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) with:
  - `RunExecutionServices`
  - `execute_durable_turn_request()`
- Updated [server_modules/turn_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/turn_runtime.py) so the durable branch delegates into the run service instead of implementing durable-run orchestration directly.
- Updated [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) to pass an explicit run-service dependency bundle into the turn runtime layer.
- Added dedicated durable-run tests in:
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)
- Simplified [server_modules/tests/test_runtime_runs_api_session_manager.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runtime_runs_api_session_manager.py) so it focuses again on direct-chat/runtime-composition behavior instead of trying to own durable-run service coverage.

#### Current Truth

- `turn_runtime.py` is now primarily a turn router.
- `run_service.py` owns durable-turn request conversion and the current durable execution branch.
- The underlying legacy run internals are still invoked under that service layer.
- The API layer is still transport-oriented and thinner than before.

#### Open Gaps

- `run_service.py` still delegates to legacy `_prepare_run_start_request` and `_create_run_from_request` callbacks.
- Full durable run lifecycle ownership has not yet been migrated out of the legacy run modules.
- `operator_chat.py` still owns the direct chat engine.
- The memory, outbox, worker-dispatch, and connector-adapter cutovers are still incomplete.

#### Next Required Work

1. Move more durable run lifecycle behavior from legacy run modules into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
2. Introduce a dedicated direct-chat service so [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) stops being the only owner of direct-chat execution.
3. Keep `turn_runtime.py` as the canonical routing boundary while shrinking the remaining legacy callbacks behind service modules.
4. Continue recording each cutover step here without rewriting older entries.

#### Verification

- `python3 -m py_compile` passed for the updated service, runtime, and test files.
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_run_service`
  - `server_modules.tests.test_agent_turn`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Direct Chat Branch Moved Into Direct Chat Service

#### Stage

Stage 1 continues. Both major turn branches now delegate into dedicated service modules.

The direct-chat branch is no longer primarily owned by the transport route file.

#### Completed Work

- Added [server_modules/direct_chat_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_service.py) as the dedicated direct-chat execution service.
- Moved direct-chat execution ownership into that module, including:
  - direct-chat actor key resolution
  - session-manager toggle resolution
  - request-meta construction
  - event producer construction
  - direct-chat turn execution planning
- Updated [server_modules/turn_runtime.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/turn_runtime.py) so the direct-chat branch delegates into the direct-chat service the same way the durable branch delegates into the run service.
- Kept [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) as a transport layer with thin compatibility wrappers for the moved chat helpers.
- Added focused direct-chat service tests in:
  - [server_modules/tests/test_direct_chat_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_service.py)

#### Current Truth

- `turn_runtime.py` now routes into:
  - [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) for durable turns
  - [server_modules/direct_chat_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_service.py) for direct-chat turns
- `runtime_runs_api.py` is thinner than before and no longer owns the primary direct-chat branch logic.
- The legacy inner chat engine in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still exists under the direct-chat service layer.

#### Open Gaps

- `operator_chat.py` still contains the core direct-chat engine implementation.
- `run_service.py` and `direct_chat_service.py` still delegate into legacy inner implementations.
- The memory service, outbox service, worker dispatch service, and connector adapter cutovers are still incomplete.
- The legacy duplicated run modules still remain under the service boundary.

#### Next Required Work

1. Start isolating the direct-chat engine itself behind [server_modules/direct_chat_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_service.py) instead of leaving it embedded in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).
2. Continue moving durable-run orchestration behavior out of the legacy run modules and into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
3. Begin converging memory access behind [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py).
4. Keep transport files thin and service-owned behavior explicit.

#### Verification

- `python3 -m py_compile` passed for the new direct-chat service, updated runtime modules, and updated test modules.
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_run_service`
  - `server_modules.tests.test_agent_turn`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Workspace Memory Path Moved Behind Memory Service

#### Stage

Stage 1 continues. The canonical memory service now owns the active workspace/notebook memory boundary used by the live API and direct chat path.

This is a partial memory convergence step. The older `agent_memory.py` implementation still exists under the service layer, and the separate `runtime_memory.py` subsystem is not yet unified into the same canonical service.

#### Completed Work

- Expanded [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) from scaffolding into a usable service boundary with:
  - workspace ID normalization
  - workspace memory snapshot payload construction
  - semantic/query result mapping
  - wrapper ownership for memory listing, memory text export, memory write/delete, daily logs, notebook search, and notebook excerpt reads
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the direct-chat engine imports notebook/workspace memory behavior from [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) instead of reaching directly into `agent_memory.py`.
- Updated [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) so the live workspace memory endpoints use the memory service boundary, including `workspace_memory_snapshot()`.
- Updated [server_modules/tests/test_agent_memory_notebook.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_agent_memory_notebook.py) so notebook coverage now targets the service boundary rather than the raw memory implementation.
- Added focused service coverage in:
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)

#### Current Truth

- The live workspace/notebook memory path is now routed through [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py).
- `agent_memory.py` still contains the underlying notebook/database implementation, but it is now behind the service layer for the converged call sites.
- `runtime_memory.py` is still a separate subsystem and has not yet been folded into the canonical memory service.
- Direct chat and the runtime API are using the service boundary, but health/memory management surfaces outside this cut may still depend on older paths.

#### Open Gaps

- The canonical memory service is still a facade over `agent_memory.py`, not yet a full replacement implementation.
- `runtime_memory.py` remains separate from the converged workspace/notebook memory path.
- Health and admin memory endpoints still need to be audited for raw memory-path usage.
- Memory policy, artifact recall, and durable run recall are not yet unified behind one service contract.

#### Next Required Work

1. Audit the remaining runtime and health surfaces for raw memory-path usage and move them behind [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py).
2. Decide how [server_modules/runtime_memory.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_memory.py) should be folded into the canonical memory service without breaking existing durable-run behavior.
3. Keep shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so memory access stays declarative at the service boundary instead of mixed into inner engine logic.
4. Continue recording each convergence step here as append-only fact.

#### Verification

- `python3 -m py_compile` passed for the updated memory service, runtime files, and memory-focused tests.
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_memory_service`
  - `server_modules.tests.test_agent_memory_notebook`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Transcript Logging Moved Behind Memory Service

#### Stage

Stage 1 continues. The remaining raw workspace-memory write inside the active direct-chat transcript path has been routed through the canonical memory service.

This still does not unify the separate `runtime_memory.py` subsystem. The health memory endpoints remain intentionally backed by that subsystem.

#### Completed Work

- Updated [server_modules/session_transcript_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_transcript_store.py) so transcript summaries write daily logs through [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) instead of importing `agent_memory.py` directly.
- Added focused coverage in:
  - [server_modules/tests/test_session_transcript_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_session_transcript_store.py)
- Re-verified the adjacent memory and direct-chat boundaries after the transcript-path change.

#### Current Truth

- The active workspace/notebook memory write path used by direct chat, transcript persistence, and the live workspace memory endpoints is now behind [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py).
- [server_modules/session_transcript_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_transcript_store.py) no longer imports `agent_memory.py` directly.
- [server_modules/routes_health.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/routes_health.py) and [server_modules/health_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/health_core.py) still intentionally target the separate `runtime_memory.py` subsystem for `/memory/search` and `/memory/upsert`.

#### Open Gaps

- `runtime_memory.py` is still separate from the canonical workspace/notebook memory service.
- Health/admin memory surfaces are still split across two memory subsystems by design.
- The canonical memory service is still a facade over `agent_memory.py`, not yet a standalone implementation.

#### Next Required Work

1. Design the convergence plan between [server_modules/runtime_memory.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_memory.py) and [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) before changing `/memory/search` or `/memory/upsert`.
2. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so memory usage remains declarative at service boundaries.
3. Keep documenting each boundary decision here instead of collapsing distinct memory paths silently.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/session_transcript_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_transcript_store.py)
  - [server_modules/tests/test_session_transcript_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_session_transcript_store.py)
  - [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_memory_service`
  - `server_modules.tests.test_agent_memory_notebook`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Health Memory Endpoints Routed Through Memory Service

#### Stage

Stage 1 continues. The health memory API surface now delegates through the canonical memory service instead of owning runtime-memory orchestration inline.

This is still a service-boundary convergence step, not a storage migration. The `/memory/search` and `/memory/upsert` routes still use the `runtime_memory.py` subsystem as their backend.

#### Completed Work

- Expanded [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) with runtime-memory wrappers for:
  - scoped runtime memory search
  - runtime memory upsert
- Updated [server_modules/health_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/health_core.py) so:
  - `memory_search()` delegates to the canonical memory service
  - `memory_upsert()` delegates to the canonical memory service
- Added focused runtime-memory wrapper coverage in:
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)
- Added focused health-core delegation coverage in:
  - [server_modules/tests/test_health_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_health_core.py)

#### Current Truth

- The workspace/notebook memory path and the health runtime-memory API path now both cross [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) as the service boundary.
- [server_modules/health_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/health_core.py) no longer owns the search/upsert orchestration logic for runtime memory inline.
- The runtime-memory backend itself is still [server_modules/runtime_memory.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_memory.py).
- The memory layer is therefore converged at the service boundary, but still split at the storage/implementation layer.

#### Open Gaps

- `agent_memory.py` and `runtime_memory.py` are still separate implementations behind the same service boundary.
- The canonical memory service is still partly an adapter layer rather than a unified implementation.
- The long-term merge strategy between notebook/workspace memory and runtime semantic memory is still undecided.

#### Next Required Work

1. Define the target contract for a single canonical memory layer that can represent both workspace/notebook memory and runtime semantic memory without leaking backend details.
2. Move additional direct-chat memory composition in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) toward service-level helpers instead of local inline assembly.
3. Keep reducing hidden runtime-global dependencies as service boundaries become explicit.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py)
  - [server_modules/health_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/health_core.py)
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)
  - [server_modules/tests/test_health_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_health_core.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_health_core`
  - `server_modules.tests.test_memory_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_memory_notebook`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Direct Chat Memory Helpers Moved Behind Memory Service

#### Stage

Stage 1 continues. The direct-chat engine no longer owns the reusable memory-context assembly and simple memory persistence helpers inline.

This is still not a full direct-chat engine extraction. The LLM-driven memory extraction loop and message-parsing behavior remain in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

#### Completed Work

- Expanded [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) with direct-chat-oriented helpers for:
  - memory system-message payload construction
  - workspace context text assembly
  - direct-chat fact storage
  - daily-log summary building and persistence
  - workspace memory lookup by conversational query
  - memory-backed suggestion prompt construction
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the following wrappers now delegate to the canonical memory service:
  - `_direct_chat_memory_context_message()`
  - `_direct_chat_workspace_context_text()`
  - `_save_direct_chat_memory_fact()`
  - `_build_direct_chat_daily_log_summary()`
  - `_memory_entry_for_query()`
  - memory-backed portions of `_build_proactive_suggestions()`
- Kept the existing wrapper names in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the operator-chat test surface remained stable while ownership moved underneath.
- Expanded focused helper coverage in:
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)
- Hardened operator-chat tests to disable semantic model downloads during unit runs:
  - [server_modules/tests/test_operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_operator_chat.py)
  - [server_modules/tests/test_operator_chat_no_provider.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_operator_chat_no_provider.py)
  - [server_modules/tests/test_operator_chat_direct_tools.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_operator_chat_direct_tools.py)

#### Current Truth

- Direct chat now uses [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) for reusable memory-context shaping and basic memory persistence behaviors.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns:
  - prompt construction
  - provider selection
  - tool execution planning
  - LLM-driven fact extraction orchestration
  - no-provider message parsing
- The direct-chat engine is therefore thinner at the memory boundary, but not yet fully service-owned.

#### Open Gaps

- The LLM-driven direct-chat memory extraction flow still lives inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).
- No-provider message parsing for memory read/write still remains chat-module logic, even though the storage operations now route through the service.
- The direct-chat engine still mixes orchestration, prompting, and policy behavior in one module.

#### Next Required Work

1. Move more direct-chat memory orchestration, especially the fact-extraction persistence flow, behind service-level functions.
2. Continue thinning [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so it becomes a chat orchestrator rather than the owner of reusable subsystems.
3. Keep test harnesses offline and deterministic as service boundaries shift.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_memory_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Shared Run Service Bundle Construction Extracted

#### Stage

Stage 1 continues. The durable-run preparation and creation bundle wiring is now owned by [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) instead of being duplicated inline across the legacy run modules.

This is not the end of the durable-run refactor. [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) and [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) still own their top-level compatibility entrypoints and late-bound patch surfaces, but they now cross a more explicit shared boundary.

#### Completed Work

- Expanded [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) with:
  - `build_run_preparation_services()`
  - `build_prepared_run_creation_services()`
- Updated [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) so:
  - shared normalization and local-execution helper wrappers now bind directly to `run_service`
  - `_prepare_run_start_request()` builds its service bundle through the canonical `run_service` helper
  - `_create_run_from_request()` builds its prepared creation services through the canonical `run_service` helper before shaping the legacy result
- Updated [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) so:
  - shared normalization and local-execution helper wrappers now bind directly to `run_service`
  - `_prepare_run_start_request()` builds its service bundle through the canonical `run_service` helper
  - `_create_run_from_request()` builds its prepared creation services through the canonical `run_service` helper while preserving late-bound global lookup for patched delegation tests
- Expanded [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py) with coverage for the new shared bundle builders.

#### Current Truth

- The durable-run service layer now owns both:
  - the shared run-preparation service bundle construction
  - the shared prepared-run creation service bundle construction
- The legacy run modules still provide the historical module-level entrypoints:
  - `_prepare_run_start_request()`
  - `_create_run_from_request()`
- Compatibility is preserved for current tests and for runtime call sites that still import those legacy names.

#### Open Gaps

- [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) still owns a large amount of runtime lifecycle logic and schedule/run history behavior.
- [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) still mixes delegation orchestration, retry policy, and runtime snapshot behavior in one module.
- The durable-run path still spans multiple modules instead of treating [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) as the single obvious ownership boundary.

#### Next Required Work

1. Continue lifting duplicated run-lifecycle and creation-adjacent logic out of [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) and [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
2. Keep the legacy entrypoints stable while reducing their ownership to coordination and compatibility only.
3. Recenter future durable-run behavior additions in [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) instead of adding new logic to the legacy run modules.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py)
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_run_service`
  - `server_modules.tests.test_runs_delegation`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_runs_core_connector_intent_binding`

### 2026-04-05 - Operator Chat Support Helpers Moved Behind Service Boundary

#### Stage

Stage 1 refactor continues. The operator chat shell now owns less support logic and more of its remaining helper surface is delegated into explicit service code.

#### Completed Work

- Added [server_modules/direct_chat_operator_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_operator_support_service.py) to own:
  - tool-capability normalization and lookup
  - live tool connection/runtime helper checks
  - active-run counting
  - recent-run prompt sourcing from shared runtime history
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so those helpers now delegate through the new support service.
- Reduced shell-owned direct-tool glue further by:
  - delegating `_approval_required_for_direct_tool()` straight through [server_modules/direct_tool_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_approval_service.py)
  - collapsing `_direct_tool_execution_callbacks()` into a late-bound lambda
- Added focused coverage in:
  - [server_modules/tests/test_direct_chat_operator_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_operator_support_service.py)

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1153` lines to `1069` lines in this cut.
- The compatibility surface is preserved: the same underscored helper names remain patchable from the operator-chat tests.
- The remaining shell logic is now more concentrated on coordination than helper implementation.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns some coordination glue, especially around callback wiring and top-level orchestration.
- The operator shell is thinner, but it is still not yet the final minimal coordinator boundary.

#### Next Required Work

1. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) until it is mostly compatibility exports plus orchestration entrypoints.
2. Avoid adding any new behavior to the shell; new logic should land in service modules only.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/direct_chat_operator_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_operator_support_service.py)
  - [server_modules/direct_tool_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_approval_service.py)
  - [server_modules/tests/test_direct_chat_operator_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_operator_support_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_memory_facade_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_direct_chat_support_binding_service`
  - `server_modules.tests.test_direct_chat_operator_support_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Run Service Owns More Legacy Result Shaping

#### Stage

Stage 2 continues. The durable-run path is now slightly less fragmented because legacy wrapper result shaping moved into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).

#### Completed Work

- Expanded [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) with:
  - `build_runs_core_creation_result()`
  - `build_runs_delegation_creation_result()`
- Updated [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) so `_create_run_from_request()` now uses the shared `run_service.py` result shaper instead of building the legacy response inline.
- Updated [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) so its `_create_run_from_request()` result payload now also comes from `run_service.py`.
- Added focused coverage in:
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)

#### Current Truth

- Shared durable-run creation already flowed through [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py); now the legacy wrapper response shaping does too.
- [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) and [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) are a bit thinner and less likely to drift in their outer result payloads.

#### Open Gaps

- `run_service.py` still does not own the full durable lifecycle.
- The legacy run modules still construct their own service bundles and still own deeper orchestration branches.

#### Next Required Work

1. Keep moving wrapper-level durable-run behavior from the legacy run modules into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
2. Preserve the exact legacy response shape while centralizing more ownership.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py)
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_run_service`
  - `server_modules.tests.test_runs_delegation`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Operator Chat Import And Trivial Wrapper Cleanup

#### Stage

Stage 1 refactor continues. The operator shell is now in a smaller cleanup phase where remaining dead imports and tiny forwarding helpers are being trimmed without changing behavior.

#### Completed Work

- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) to:
  - remove now-dead module imports that no longer participate in the compatibility shell
  - collapse a few trivial forwarding helpers into direct aliases or late-bound lambdas
  - preserve the legacy `os.environ` patch surface required by the operator-chat tests

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1170` lines to `1153` lines in this cut.
- This was a shell cleanup cut, not a service-boundary extraction.
- The module still keeps the same test-visible compatibility namespace expected by the direct-chat and no-provider harnesses.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns nontrivial normalization, tool-capability shaping, callback assembly, and approval glue.
- The shell is meaningfully smaller, but it is not yet the final thin coordinator envisioned by the canonical architecture.
- Additional convergence work is still required in `run_service()` and `agent_turn()` beyond the operator shell.

#### Next Required Work

1. Continue reducing the remaining real helper ownership in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).
2. Keep preserving late-bound patchability for the offline harness while trimming shell-only code.
3. Push remaining orchestration into canonical direct-chat, run, and turn services.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_memory_facade_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_direct_chat_support_binding_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Operator Chat Handoff And Runtime Entry Wrappers Collapsed

#### Stage

Stage 1 refactor continues. The remaining handoff, callback-input, prompt, and runtime-entry compatibility band in the operator shell is thinner again.

#### Completed Work

- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) to collapse more thin wrappers into direct aliases and late-bound lambda bindings for:
  - direct-chat prompt construction
  - routing and tool-policy callback factories
  - handoff final-payload and stream delegation
  - callback-facade input construction
  - top-level direct-chat runtime entrypoints
- Kept the same exported names and late-bound namespace behavior that the operator-chat and composition tests depend on.

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1244` lines to `1170` lines in this cut.
- The module still preserves the same importable compatibility surface for runtime entry, handoff streaming, and callback wiring.
- This was a shell-thinning cut only; no intended behavior changes were introduced.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns some remaining normalization, tool-capability shaping, runtime callback assembly, and approval glue.
- The shell is thinner, but the full architecture target still requires more ownership transfer into canonical direct-chat, run, and turn boundaries.
- `run_service()` and `agent_turn()` still need further convergence work beyond this operator-chat cleanup.

#### Next Required Work

1. Continue reducing the remaining nontrivial helper ownership in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).
2. Keep preserving late-bound patchability for the offline operator-chat harness while collapsing shell noise.
3. Move the remaining shell-owned runtime glue toward the canonical architecture boundaries.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_memory_facade_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_direct_chat_support_binding_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Operator Chat Entry And Availability Wrapper Band Collapsed

#### Stage

Stage 1 refactor continues. The operator shell now owns materially less entry-policy, availability, routing, and direct-tool forwarding code.

#### Completed Work

- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) to collapse another large set of thin wrappers into direct aliases and late-bound lambda bindings for:
  - direct-chat entry-policy helpers
  - availability and suggestion helpers
  - routing preview and handoff preference helpers
  - direct-tool step and execution delegates
- Preserved module-level compatibility by keeping the patched underscored helper names intact and late-bound for the offline operator-chat tests.

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1364` lines to `1244` lines in this cut.
- The shell still exports the same names expected by the direct-chat binding, composition, and runtime tests.
- This was a structural shell-thinning cut; runtime behavior stayed the same.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns top-level direct-chat orchestration and runtime entry wiring.
- Some higher-level route planning and handoff coordination is still assembled in the shell rather than behind a single canonical boundary.
- The full Bible target still requires finishing the `run_service()` and `agent_turn()` cutovers beyond the chat shell.

#### Next Required Work

1. Continue collapsing or extracting the remaining orchestration-heavy bands in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).
2. Keep preserving late-bound patchability while shrinking the shell further.
3. Push the remaining ownership toward canonical direct-chat, run, and turn services instead of module-local coordination.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_memory_facade_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_direct_chat_support_binding_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Operator Chat Runtime Wrapper Band Collapsed

#### Stage

Stage 1 refactor continues. The direct-chat/operator shell now owns materially less fixed delegation code while keeping the same module-level compatibility surface.

#### Completed Work

- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) to collapse a dense group of thin wrappers into direct aliases and late-bound lambda bindings for:
  - direct-chat tool-policy delegation
  - no-provider runtime delegation
  - provider/runtime facade delegation
  - direct-chat composition delegation
- Preserved module-level patchability for the operator-chat tests by keeping callback lookups late-bound through the existing underscored names instead of eagerly binding patched helpers.

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1462` lines to `1364` lines in this cut.
- The operator shell still exports the same helper names used by the offline test harnesses.
- This was a shell-thinning cut, not a behavior change or architecture rewrite.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns too much top-level orchestration and entry-policy glue.
- The direct-chat runtime is still assembled from multiple late-bound compatibility helpers instead of a fully canonical single boundary.
- Higher-level route planning, approval control flow, and durable run handoff behavior are still partially coordinated from the operator shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by collapsing or extracting the remaining orchestration-heavy wrapper bands.
2. Keep preserving the patched module-level names that the offline operator-chat tests rely on while moving ownership outward.
3. Push the shell toward a thin coordinator around the canonical direct-chat and run services.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_memory_facade_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_direct_chat_support_binding_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Direct Chat Entry Policy Band Moved Behind Entry Policy Service

#### Stage

Stage 1 continues. The direct-chat entry/context/provider-routing helper band no longer lives directly in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut is a real shell reduction. It still does not make the chat shell thin, but it removes a denser block than the recent facade-only extractions.

#### Completed Work

- Added [server_modules/direct_chat_entry_policy_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_entry_policy_service.py) to own the delegation layer for:
  - chat-iteration limit parsing and reply text
  - direct-chat availability resolution
  - context/session helpers
  - provider selection for direct chat
  - route planning delegation
  - active-run counting and slash-command help delegation
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the following wrappers now delegate through the new service:
  - `_safe_positive_int()`
  - `_resolved_chat_iteration_limit()`
  - `_chat_iteration_limit_reply()`
  - `_direct_chat_runtime_available()`
  - `_resolve_direct_chat_availability()`
  - `_availability_lines()`
  - `_connected_system_labels()`
  - `_context_tool_capabilities()`
  - `_normalize_prior_messages()`
  - `_direct_tool_session_key()`
  - `_direct_chat_session_key()`
  - `_parse_slash_command()`
  - `_session_model_preference()`
  - `_set_session_model_preference()`
  - `_mark_thread_cleared()`
  - `_consume_thread_cleared()`
  - `_connected_provider_tokens()`
  - `_resolve_provider_for_direct_chat_message()`
  - `_plan_direct_chat_route()`
  - `_active_run_count()`
  - `_slash_command_help_text()`
- Added focused coverage in [server_modules/tests/test_direct_chat_entry_policy_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_entry_policy_service.py).

#### Current Truth

- The entry-policy band now has an explicit service boundary instead of living inline inside the operator shell.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) remains the compatibility surface for the historical helper names.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1788` to `1784` lines in this cut.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns a large amount of direct-chat orchestration and callback wiring.
- The restored docs tree is currently lagging behind the most recent pushed ledger history, so the repo still needs a later cleanup pass to reconcile document continuity.
- The chat shell is more modular now, but it is still not yet reduced to a thin coordinator over one canonical runtime graph.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by targeting another dense orchestration cluster rather than only wrapper bands.
2. Reconcile the restored docs history with the latest execution trail after the code refactor path is stable again.
3. Keep preserving late-bound compatibility so existing operator-chat tests and direct imports do not regress.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_entry_policy_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_entry_policy_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_entry_policy_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_entry_policy_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Callback And Tool Policy Wiring Moved Behind Operator Binding Service

#### Stage

Stage 1 continues. The bottom-of-file callback assembly and tool/routing policy binding cluster no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This is the largest operator-chat reduction in the current direct-chat pass. It removes a dense cluster of wiring code while preserving late-bound compatibility for tests that patch module-level helpers.

#### Completed Work

- Added [server_modules/direct_chat_operator_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_operator_binding_service.py) to own:
  - direct-chat tool-name parsing and argument normalization
  - approved-action normalization
  - direct-step title/detail shaping
  - direct-tool execution callback assembly
  - routing policy callback assembly
  - tool policy callback assembly
  - direct-chat callback facade input assembly using late-bound module namespace lookup
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these helpers now delegate through the new binding service:
  - `_direct_chat_routing_policy_callbacks()`
  - `_direct_chat_tool_policy_callbacks()`
  - `_parse_tool_name()`
  - `_tool_arguments_payload()`
  - `_normalize_direct_approved_action()`
  - `_titleize_direct_step_token()`
  - `_compact_step_detail()`
  - `_direct_tool_execution_callbacks()`
  - `_direct_chat_callback_facade_inputs()`
- Added focused coverage in [server_modules/tests/test_direct_chat_operator_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_operator_binding_service.py) for the late-bound underscored namespace behavior that the operator shell still relies on.

#### Current Truth

- The callback and policy wiring cluster now has an explicit service boundary instead of being assembled directly inside the operator shell.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) remains the compatibility surface for the historical helper names and still resolves callbacks at runtime.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1784` to `1667` lines in this cut.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns higher-level orchestration flow and some remaining provider/tool/runtime coordination logic.
- The restored docs set is still behind the full recent execution trail and should be reconciled in a later docs cleanup pass.
- The chat shell is now materially smaller, but it is still not yet the thin coordinator required by the architecture target.

#### Next Required Work

1. Continue targeting dense orchestration logic inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) rather than isolated wrapper helpers.
2. Reconcile the restored docs history after the code-side refactor band stabilizes.
3. Keep preserving late-bound operator-module patch behavior as more callback wiring moves out of the shell.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_operator_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_operator_binding_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_operator_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_operator_binding_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Pure Delegate Wrapper Band Collapsed Into Direct Aliases

#### Stage

Stage 1 continues. Another low-risk shell cleanup pass removed a large band of pure delegate wrappers from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut does not introduce a new subsystem boundary. It is a compatibility-preserving shell reduction that collapses identical pass-through helpers into direct aliases.

#### Completed Work

- Replaced the pure one-hop wrappers in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with direct callable aliases for:
  - action helpers
  - tool-catalog passthroughs
  - direct-tool config passthroughs
  - direct-tool execution passthroughs
  - provider display and reasoning normalization passthroughs
- Kept the higher-value injected wrappers in place where runtime callback binding or late-bound behavior is still required.

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1667` to `1600` lines in this cleanup pass.
- The affected helper names still exist on the module and remain directly importable.
- The runtime behavior remains the same; this is a structural cleanup rather than a behavior change.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns significant orchestration logic and callback assembly.
- The docs set still needs a later continuity pass because the restored history and the current refactor trail are not yet fully reconciled.
- The direct-chat shell is smaller, but still not yet reduced to the final thin coordinator target.

#### Next Required Work

1. Continue extracting dense orchestration logic rather than only continuing alias cleanups.
2. Keep protecting module-level import compatibility while reducing the remaining shell surface.
3. Reconcile document continuity once the current code refactor sequence settles.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Memory, Metadata, And Prompt Support Band Moved Behind Support Binding Service

#### Stage

Stage 1 continues. The memory-persistence, context-metadata, and proactive-suggestion support band no longer lives directly inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut is another ownership reduction rather than a raw line-count win. The shell size stayed effectively flat, but a coherent support cluster now has an explicit binding layer instead of being assembled inline.

#### Completed Work

- Added [server_modules/direct_chat_support_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_support_binding_service.py) to own delegation for:
  - direct-chat memory persistence
  - transcript persistence
  - `context_used` payload shaping
  - heartbeat-task suggestion sourcing
  - recent-run suggestion sourcing
  - proactive suggestion assembly
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the support-band wrappers now delegate through the new service.
- Added focused coverage in [server_modules/tests/test_direct_chat_support_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_support_binding_service.py).

#### Current Truth

- The support band now has an explicit service boundary instead of living directly inside the operator shell.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) remains the compatibility surface for the existing helper names.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) moved from `1556` to `1557` lines in this cut, so this should be understood as ownership cleanup, not size reduction.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns substantial orchestration flow and callback graph composition.
- Remaining improvements will increasingly need to move true orchestration logic, not just support bands.
- The restored docs set still needs a later continuity cleanup after the current refactor run settles.

#### Next Required Work

1. Continue targeting dense orchestration logic inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py), especially runtime/provider/direct-tool control flow.
2. Keep preserving the current compatibility surface so direct imports and focused tests remain stable.
3. Reconcile docs continuity after the code-side refactor sequence stabilizes.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_support_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_support_binding_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_support_binding_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_support_binding_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_support_binding_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_memory_facade_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Fixed-Dependency Direct Chat Wrapper Band Reduced With Late-Bound Partial Bindings

#### Stage

Stage 1 continues. Another large wrapper strip in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) was collapsed using direct aliases and late-bound `partial(...)` bindings.

This is a meaningful shell reduction. The change keeps the same helper names, but removes a large amount of repeated forwarding code where the only purpose was injecting fixed dependencies.

#### Completed Work

- Replaced another direct-chat helper band in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with aliases or `partial(...)` bindings for:
  - memory persistence support wrappers
  - context payload shaping wrapper
  - proactive suggestion wrapper
  - handoff start wrapper
  - direct-tool config and approval conversion wrappers
  - provider-unavailable and direct-chat error wrappers
  - title/detail helper wrappers
- Used late-bound lambdas where patch-sensitive helper references still needed to stay dynamic in tests.

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1557` to `1462` lines in this cut.
- The historical helper names remain available on the module.
- The behavior stayed stable across the focused operator/direct-chat test slice.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns core orchestration and runtime composition logic.
- Future reductions will need to target real orchestration flow, not just delegate strips.
- The documentation continuity cleanup still remains for later.

#### Next Required Work

1. Target the next dense orchestration cluster in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py), especially runtime/provider/direct-tool flow assembly.
2. Keep preserving patchable helper behavior where the test harness depends on module-level names.
3. Reconcile docs continuity after the refactor sequence stabilizes.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_memory_facade_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_direct_chat_support_binding_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Keyword-Injected Delegate Band Reduced With Alias And Partial Bindings

#### Stage

Stage 1 continues. Another strip of keyword-injected delegate wrappers was collapsed inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut is still structural cleanup rather than a new architecture boundary, but it removes another meaningful chunk of shell code while keeping the same module-level compatibility surface.

#### Completed Work

- Replaced a remaining band of thin wrappers in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with direct aliases or `partial(...)` bindings where the only job was injecting fixed callback arguments.
- Reduced wrapper noise for:
  - loop-guard helpers
  - memory facade passthroughs
  - metadata passthroughs
  - availability and workflow marker helpers
  - routing helper passthroughs
  - handoff helper passthroughs
  - local direct-tool catalog passthroughs
- Preserved explicit wrapper functions only where runtime callback assembly or dynamic imports still matter.

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1600` to `1556` lines in this cut.
- The affected helper names still exist on the module and remain importable.
- The behavior is unchanged; this is another shell-thinning pass.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns substantial orchestration and callback graph assembly.
- The remaining wins will increasingly require moving real orchestration logic, not just collapsing delegate glue.
- The docs continuity cleanup still remains for later after the current code-refactor run settles.

#### Next Required Work

1. Target another dense orchestration band in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py), not just additional alias cleanups.
2. Keep preserving module-level compatibility names while reducing internal ownership.
3. Reconcile the ledger/doc continuity once the current refactor band is stable.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_entry_policy_service`
  - `server_modules.tests.test_direct_chat_operator_binding_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Top-Level Runtime Entry Wiring Moved Behind Runtime Entry Facade

#### Stage

Stage 1 continues. The top-level direct-chat runtime entry wrappers no longer bind directly to the runtime service from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This is still an ownership reduction rather than a line-count win. The chat shell remains large, but another boundary in the runtime entry path is now explicit and testable.

#### Completed Work

- Added [server_modules/direct_chat_runtime_entry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_runtime_entry_facade_service.py) to own the delegation layer for:
  - `build_direct_operator_reply()`
  - `collect_direct_operator_reply()`
  - `build_chat_turn_event_stream()`
  - `execute_chat_turn()`
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the historical top-level runtime entry wrappers now delegate through the new facade instead of calling [server_modules/direct_chat_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_runtime_service.py) inline.
- Added focused compatibility coverage in [server_modules/tests/test_direct_chat_runtime_entry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_runtime_entry_facade_service.py).

#### Current Truth

- The direct-chat runtime service remains the canonical implementation boundary for execution behavior.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still exports the same public runtime entry names, but it no longer owns this delegation band inline.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) is now `1788` lines, up from `1787`, so this cut should be treated as a boundary extraction and compatibility cleanup rather than a shrink pass.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns too much direct-chat orchestration, including provider-aware reply flow, availability policy, and remaining runtime composition glue.
- Several recent cuts reduced ownership without materially reducing total shell size, which means the next reductions need to target higher-density orchestration clusters.
- The runtime path is more modular, but the chat shell is still not yet a thin coordinator around one canonical service graph.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another high-density orchestration band instead of only thin wrapper layers.
2. Keep the public compatibility surface stable while consolidating more of the direct-chat runtime path behind dedicated services.
3. Preserve deterministic offline test coverage as the remaining orchestration code is moved out of the chat shell.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_runtime_entry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_runtime_entry_facade_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_runtime_entry_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_runtime_entry_facade_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_runtime_entry_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Direct Tool Execution Flow Moved Behind Execution Service

#### Stage

Stage 1 continues. The direct-tool execution band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

The chat module still exports the historical helper names for compatibility, but the implementation now crosses a dedicated direct-tool execution boundary.

#### Completed Work

- Added [server_modules/direct_tool_execution_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_execution_service.py) to own:
  - direct-tool step payload shaping
  - thinking step payload shaping
  - first URL and file-path extraction
  - local-path resolution
  - direct-tool follow-up message formatting
  - single direct-tool execution dispatch
  - multi-tool direct execution aggregation
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the historical helpers now delegate through injected callbacks into the new service instead of owning the implementation inline.
- Preserved late-bound compatibility in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so tests and no-provider flows can still patch:
  - `_execute_single_direct_tool_call()`
  - `_execute_direct_tool_calls()`
  - `_direct_tool_step_payload()`
  - `_thinking_step_payload()`
  - `_extract_first_url()`
  - `_extract_first_path_reference()`
  - `_resolve_chat_local_path()`
  - `_direct_tool_followup_message()`
- Added focused coverage in [server_modules/tests/test_direct_tool_execution_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_execution_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `3243` to `2964` lines in this cut.
- Direct-tool execution behavior now has a dedicated service seam instead of a large inline branch cluster inside the chat module.
- The chat module still supplies the dependency graph and compatibility wrapper surface, so existing callers do not need to change.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns too much higher-level direct-chat orchestration, including provider routing, prompt assembly, and response coordination.
- The no-provider service still depends on callbacks exported from the chat module instead of a thinner runtime composition layer.
- Approval response shaping and execution planning already cross service boundaries, but the full no-provider runtime path is not yet reduced to a minimal coordinator.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting the next orchestration slice around no-provider runtime assembly or direct-chat response flow.
2. Keep preserving late-bound module patch points while the runtime composition moves into dedicated services.
3. Maintain focused offline tests around direct-tool, no-provider, and iteration-cap behavior after each extraction cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_tool_execution_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_execution_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_tool_execution_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_execution_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_tool_execution_service`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Direct Chat Runtime Assembly Moved Behind Runtime Facade

#### Stage

Stage 1 continues. The no-provider execution bundle and the direct-chat response/runtime assembly no longer live inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

The chat module still exports the historical wrapper names, but the assembly logic now crosses a dedicated runtime facade boundary.

#### Completed Work

- Added [server_modules/direct_chat_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_runtime_facade_service.py) to own:
  - no-provider execution service construction
  - direct-tool approval response shaping through the no-provider bundle
  - obvious direct-tool intent detection
  - direct-chat request preparation delegation
  - direct-chat response service assembly
  - direct-chat runtime service assembly
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the runtime facade:
  - `_no_provider_execution_services()`
  - `_build_direct_tool_approval_response()`
  - `_message_has_obvious_direct_tool_intent()`
  - `_prepare_direct_chat_request()`
  - `_direct_chat_response_services()`
  - `_direct_chat_runtime_services()`
- Preserved the operator-chat wrapper surface so late-bound patches and existing callers still resolve through the same names.
- Added focused coverage in [server_modules/tests/test_direct_chat_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_runtime_facade_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `2964` to `2962` lines in this cut. The line count reduction is small because the constructor band was replaced by a callback factory that keeps compatibility and late binding intact.
- The actual ownership reduction is still real: the direct-chat runtime composition now has a dedicated assembly seam instead of being built inline in the chat module.
- The runtime and no-provider bundles now share one explicit callback contract, which makes the next extraction cuts less risky.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns too much high-level coordination, especially provider routing, prompt assembly, and direct-chat entry logic.
- The callback factory in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) is still large because it is preserving the historical late-bound composition surface.
- The direct-chat orchestration path is still not yet reduced to a thin coordination shell around separated services.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration seam, not just callback assembly.
2. Keep the operator-chat wrappers stable while moving more of the direct-chat coordination path behind dedicated services.
3. Maintain focused regression coverage around no-provider fallback, approval shaping, and direct-chat runtime flow after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_runtime_facade_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_runtime_facade_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_tools_http`

### 2026-04-05 - Direct Chat Callback Builders Moved Behind Callback Facade

#### Stage

Stage 1 continues. The callback-construction blocks for direct-chat generation and runtime-facade assembly no longer live inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

The chat module still exports the same wrapper names, but the callback bundle assembly now crosses a dedicated callback facade boundary.

#### Completed Work

- Added [server_modules/direct_chat_callback_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_callback_facade_service.py) to own:
  - direct-chat generation service construction
  - direct-chat runtime facade callback construction
  - the shared callback input contract used by both builders
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so:
  - `_direct_chat_generation_services()` now delegates through the callback facade
  - `_direct_chat_runtime_facade_callbacks()` now delegates through the callback facade
  - the inline callback constructor band is reduced to a single `_direct_chat_callback_facade_inputs()` wrapper
- Added focused coverage in [server_modules/tests/test_direct_chat_callback_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_callback_facade_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) did not materially shrink in line count in this cut and moved from `2962` to `2963` lines because the extracted constructor band was replaced by one explicit input-bundle wrapper.
- The ownership reduction is still real: service construction is now centralized in a dedicated callback facade instead of being assembled directly in the chat module.
- The generation and runtime-facade builders now share one explicit callback input contract, which makes later refactors less error-prone.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns too much high-level direct-chat coordination, including provider routing, tool selection policy, and handoff planning.
- The callback input wrapper in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) is still large because it preserves the late-bound compatibility surface.
- The direct-chat path is still not yet reduced to a minimal coordination shell.

#### Next Required Work

1. Continue extracting a higher-level orchestration seam from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py), not just constructor bands.
2. Keep the wrapper names stable so operator-chat tests can still patch the same late-bound entrypoints.
3. Maintain focused regression coverage around direct-chat generation, runtime assembly, and no-provider fallback after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_callback_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_callback_facade_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_callback_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_callback_facade_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Direct Tool Config And Result Helpers Moved Behind Config Service

#### Stage

Stage 1 continues. The direct-tool config builders, approval-call conversion helper, async runner, and direct-tool result formatting band no longer live inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut materially reduced the chat module instead of only moving constructor bands.

#### Completed Work

- Added [server_modules/direct_tool_config_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_config_service.py) to own:
  - email/subject/body extraction helpers for tool input parsing
  - direct connector tool config construction
  - direct local tool config construction
  - write-action availability checks
  - approved-action to tool-call conversion
  - async tool-call execution helper
  - direct connector/local tool result formatting
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the historical helper names now delegate through the new service:
  - `_extract_first_email()`
  - `_extract_subject_text()`
  - `_extract_body_text()`
  - `_first_non_empty_line()`
  - `_build_direct_tool_config()`
  - `_build_direct_local_tool_config()`
  - `_tool_write_action_available()`
  - `_approved_action_to_tool_call()`
  - `_run_async_tool_call()`
  - `_format_direct_tool_result()`
  - `_format_direct_local_tool_result()`
- Added focused coverage in [server_modules/tests/test_direct_tool_config_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_config_service.py).
- Tightened subject parsing in the new service so phrases like `subject Demo body Hello there` stop the subject before the body marker instead of swallowing the whole tail.

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `2963` to `2522` lines in this cut.
- The direct-tool input normalization and result-shaping logic now has a dedicated service boundary instead of sitting as a large inline implementation block in the chat module.
- This is a real shell reduction, not just a constructor extraction.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns higher-level direct-chat coordination, including provider routing, tool-selection policy, and handoff planning.
- The remaining wrapper and policy surface is still larger than the target architecture wants.
- The direct-chat path is still not yet reduced to a minimal orchestration shell around separated services.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another implementation-heavy orchestration seam, not only callback builders.
2. Keep the operator-chat wrapper names stable while more behavior moves behind dedicated services.
3. Maintain focused regression coverage around direct-tool flow, no-provider fallback, and chat runtime behavior after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_tool_config_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_config_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_tool_config_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_config_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_tool_config_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Direct Chat Tool Catalog And Message Policy Moved Behind Catalog Service

#### Stage

Stage 1 continues. The direct-chat tool catalog builders and direct-tool message-policy band no longer live inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This is another implementation-heavy extraction, not just a constructor move.

#### Completed Work

- Added [server_modules/direct_chat_tool_catalog_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_tool_catalog_service.py) to own:
  - provider support checks for direct tool calls
  - local tool schema catalog construction
  - connector tool schema catalog construction
  - builtin direct tool schema catalog construction
  - direct-chat tool-name logging catalog
  - direct-tool message-intent and eligibility checks for:
    - builtin tools
    - connector tools
    - local machine tools
  - local-path request detection
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new service:
  - `_provider_supports_direct_tool_calls()`
  - `_build_local_direct_chat_tools()`
  - `_build_direct_chat_tools()`
  - `_build_builtin_direct_chat_tools()`
  - `registered_direct_chat_tool_names_for_logging()`
  - `_message_requests_http_request_tool()`
  - `_message_requests_image_generation_tool()`
  - `_message_requests_browser_tool()`
  - `_message_can_use_direct_connector_tools()`
  - `_looks_like_local_path_request()`
  - `_message_requests_local_file_tool()`
  - `_message_requests_local_shell_tool()`
  - `_message_requests_local_screenshot_tool()`
  - `_message_requests_local_computer_tool()`
  - `_message_can_use_direct_local_tools()`
  - `_message_can_use_builtin_direct_tools()`
- Added focused coverage in [server_modules/tests/test_direct_chat_tool_catalog_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_tool_catalog_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `2522` to `2065` lines in this cut.
- The direct-tool eligibility and tool-schema ownership is now concentrated in a dedicated service instead of being mixed into the chat runtime module.
- This is another real shell reduction toward the target architecture.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns higher-level direct-chat coordination and handoff policy.
- The module still contains substantial run-handoff logic and chat-entry control flow that should eventually cross clearer service boundaries.
- The direct-chat path is thinner than before, but it is still not yet a minimal orchestration shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another implementation-heavy orchestration seam, likely around run handoff or direct-chat route planning.
2. Keep operator-chat wrapper names stable so existing tests and callers still patch the same late-bound entrypoints.
3. Maintain focused regression coverage around tool eligibility, direct-tool execution, no-provider fallback, and runtime routing after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_tool_catalog_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_tool_catalog_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_tool_catalog_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_tool_catalog_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_tool_catalog_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_tool_config_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Durable Run Routing Policy Moved Behind Routing Service

#### Stage

Stage 1 continues. The durable-run preview and handoff-preference policy band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut moves more routing policy into the existing routing service boundary instead of creating another isolated helper island.

#### Completed Work

- Expanded [server_modules/direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_routing_service.py) with:
  - `DirectChatRoutingPolicyCallbacks`
  - `preview_run_response()`
  - `action_marker_count()`
  - `path_like_reference_count()`
  - `prefer_durable_run_handoff()`
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the routing service:
  - `_preview_run_response()`
  - `_action_marker_count()`
  - `_path_like_reference_count()`
  - `_prefer_durable_run_handoff()`
- Added `_direct_chat_routing_policy_callbacks()` in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the late-bound compatibility surface stays stable while the policy moves behind the service.
- Expanded focused routing coverage in [server_modules/tests/test_direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_routing_service.py) for:
  - imperative preview-run responses
  - multi-step local requests preferring durable run handoff

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `2065` to `2033` lines in this cut.
- The run-routing policy is now better aligned with the existing routing service boundary instead of being split between service and chat module.
- The remaining chat module is increasingly wrapper-oriented rather than policy-owned.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns significant direct-chat coordination and run-handoff composition.
- The direct-chat handoff flow still has wrapper-heavy orchestration in the chat module that should move further behind service boundaries.
- The module is thinner than before, but it is still not yet at the target shell size implied by the platform architecture.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around run-handoff composition or top-level response entry flow.
2. Keep wrapper names stable so existing operator-chat tests can still patch the same late-bound entrypoints.
3. Maintain focused regression coverage around routing, handoff, direct-tool execution, and fallback behavior after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_routing_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_routing_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_tool_catalog_service`
  - `server_modules.tests.test_direct_tool_config_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Direct Chat Context And Session Helpers Moved Behind Context Service

#### Stage

Stage 1 continues. The availability/context/session helper band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut removes another chunk of operator-owned state and formatting logic from the chat module.

#### Completed Work

- Added [server_modules/direct_chat_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_context_service.py) to own:
  - agent-machine owner resolution
  - availability/status line formatting
  - connected-system label extraction
  - context tool-capability trimming
  - prior-message normalization
  - direct-chat/direct-tool session key helpers
  - slash-command parsing
  - session model-preference storage helpers
  - thread-clear marker helpers
  - active-run counting
  - slash-command help text
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new service:
  - `_agent_machine_owner_user_id()`
  - `_availability_lines()`
  - `_connected_system_labels()`
  - `_context_tool_capabilities()`
  - `_normalize_prior_messages()`
  - `_direct_tool_session_key()`
  - `_direct_chat_session_key()`
  - `_parse_slash_command()`
  - `_session_model_preference()`
  - `_set_session_model_preference()`
  - `_mark_thread_cleared()`
  - `_consume_thread_cleared()`
  - `_active_run_count()`
  - `_slash_command_help_text()`
- Added focused coverage in [server_modules/tests/test_direct_chat_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_context_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `2033` to `1962` lines in this cut.
- Session-state and context formatting logic now has a dedicated service boundary instead of being embedded in the chat runtime module.
- The remaining chat module is increasingly concentrated on orchestration rather than local state and formatting helpers.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns high-level direct-chat orchestration and run-handoff composition.
- The handoff and top-level response entry flow still have meaningful orchestration weight inside the chat module.
- The module is much thinner than before, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around top-level direct-chat runtime composition or handoff flow.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around entry preparation, session state, routing, direct tools, and runtime handoff after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_context_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_context_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_context_service`
  - `server_modules.tests.test_direct_chat_entry_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_tool_catalog_service`
  - `server_modules.tests.test_direct_tool_config_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Availability Gates, Action Builders, and Suggestion Policy Moved Behind Availability Service

#### Stage

Stage 1 continues. The connector/action preview policy band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut removes another meaningful block of response-shaping logic from the chat runtime shell.

#### Completed Work

- Added [server_modules/direct_chat_availability_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_availability_service.py) to own:
  - connect/open/run/workflow action payload builders
  - question-like and marker matching helpers
  - obvious Telegram, Google Workspace, and SMTP write-request detection
  - connector write-preview gating
  - explicit workflow-request detection
  - no-AI availability response shaping
  - connector/tool gate response shaping
  - proactive action suggestion policy
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new service:
  - `_connect_action()`
  - `_open_action()`
  - `_google_repair_action()`
  - `_run_action()`
  - `_workflow_action()`
  - `_question_like()`
  - `_mentions_any()`
  - `_starts_like_direct_run()`
  - `_is_obvious_telegram_write_request()`
  - `_is_obvious_google_write_request()`
  - `_is_obvious_smtp_write_request()`
  - `_connector_write_preview_allowed()`
  - `_is_explicit_workflow_request()`
  - `_no_ai_chat_response()`
  - `_tool_gate_response()`
  - `_suggest_actions()`
- Added focused coverage in [server_modules/tests/test_direct_chat_availability_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_availability_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1962` to `1832` lines in this cut.
- Availability gating and action suggestion behavior now has a dedicated service boundary instead of being embedded in the chat runtime module.
- The remaining chat module is increasingly concentrated on orchestration, provider selection, and handoff/runtime wiring.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns high-level direct-chat orchestration and run-handoff composition.
- The provider-selection and top-level response entry flow still have meaningful orchestration weight inside the chat module.
- The module is much thinner than before, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around run handoff or top-level request preparation.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around availability gating, routing, direct tools, entry preparation, and runtime handoff after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_availability_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_availability_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_availability_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_availability_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_availability_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_tool_catalog_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_tool_config_service`
  - `server_modules.tests.test_direct_chat_context_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Context Metadata And Suggestion Sources Moved Behind Metadata Service

#### Stage

Stage 1 continues. The context-used payload shaping and suggestion-source helper band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut removes another metadata-heavy block from the chat runtime shell.

#### Completed Work

- Added [server_modules/direct_chat_metadata_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_metadata_service.py) to own:
  - `context_used` payload construction
  - payload wrapping with `context_used`
  - heartbeat-task extraction for proactive suggestions
  - recent run-prompt extraction and deduplication for proactive suggestions
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new service:
  - `_build_context_used()`
  - `_with_context_used()`
  - `_heartbeat_pending_tasks_for_suggestions()`
  - `_recent_run_prompts_for_suggestions()`
- Added focused coverage in [server_modules/tests/test_direct_chat_metadata_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_metadata_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1832` to `1797` lines in this cut.
- Context metadata shaping and proactive-suggestion source gathering now have a dedicated service boundary instead of being embedded in the chat runtime module.
- The remaining chat module is increasingly concentrated on orchestration, provider selection, and runtime handoff flow.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns high-level direct-chat orchestration and run-handoff composition.
- The provider-selection and top-level request/runtime assembly flow still have meaningful orchestration weight inside the chat module.
- The module is much thinner than before, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around run handoff or top-level request preparation.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around metadata shaping, routing, availability, direct tools, entry preparation, and runtime handoff after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_metadata_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_metadata_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_metadata_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_metadata_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_response_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_tool_catalog_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_tool_config_service`
  - `server_modules.tests.test_direct_chat_context_service`
  - `server_modules.tests.test_direct_chat_availability_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Durable Run Handoff Wrapper Band Moved Behind Handoff Facade

#### Stage

Stage 1 continues. The durable-run handoff wrapper band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut removes another orchestration-facing band from the chat runtime shell while preserving the same patchable wrapper names.

#### Completed Work

- Added [server_modules/direct_chat_handoff_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_handoff_facade_service.py) to own:
  - durable-run preferred response shaping
  - run-handoff execution-target and auto-start checks
  - handoff failure payload shaping
  - run-start dependency loading and handoff start orchestration
  - run snapshot dependency loading
  - snapshot/event/final-payload bridge helpers
  - live handoff stream delegation
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new facade:
  - `_durable_run_preferred_response()`
  - `_run_handoff_execution_target()`
  - `_can_auto_start_run_handoff()`
  - `_direct_chat_run_handoff_failure_payload()`
  - `_start_direct_chat_run_handoff()`
  - `_direct_chat_run_handoff_reply()`
  - `_direct_chat_run_actions()`
  - `_direct_chat_run_snapshot()`
  - `_direct_chat_run_event_to_step()`
  - `_direct_chat_run_snapshot_to_step()`
  - `_direct_chat_run_final_payload()`
  - `_stream_direct_chat_run_handoff()`
- Added focused coverage in [server_modules/tests/test_direct_chat_handoff_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_handoff_facade_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1797` to `1784` lines in this cut.
- Durable-run handoff wrapper assembly now has a dedicated facade boundary instead of being embedded directly in the chat runtime module.
- The remaining chat module is increasingly concentrated on provider/tool/runtime composition rather than handoff glue.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns top-level direct-chat orchestration and callback/input assembly.
- The provider-selection and request/runtime composition flow still have meaningful orchestration weight inside the chat module.
- The module is thinner than before, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around request preparation, provider/runtime composition, or direct-tool callback assembly.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around handoff flow, routing, availability, direct tools, entry preparation, and runtime assembly after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_handoff_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_handoff_facade_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_handoff_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_handoff_facade_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_handoff_facade_service`
  - `server_modules.tests.test_direct_chat_handoff_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_response_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_availability_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_context_service`
  - `server_modules.tests.test_direct_tool_config_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Callback And Runtime Composition Moved Behind Composition Service

#### Stage

Stage 1 continues. The direct-chat callback/runtime composition band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut moves bottom-of-file assembly logic behind a dedicated composition service even though it is not a raw line-count win.

#### Completed Work

- Added [server_modules/direct_chat_composition_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_composition_service.py) to own:
  - callback-facade input assembly from late-bound operator-chat dependencies
  - generation-service construction delegation
  - runtime-facade callback construction delegation
  - request-preparation/runtime-service/response-service composition delegation
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new composition service:
  - `_direct_chat_generation_services()`
  - `_direct_chat_callback_facade_inputs()`
  - `_direct_chat_runtime_facade_callbacks()`
  - `_prepare_direct_chat_request()`
  - `_direct_chat_response_services()`
  - `_direct_chat_runtime_services()`
- Added focused coverage in [server_modules/tests/test_direct_chat_composition_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_composition_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) moved from `1784` to `1787` lines in this cut.
- The shell is not shorter on raw lines here, but ownership is reduced: callback/runtime assembly now has a dedicated service boundary instead of living directly in the chat module.
- This keeps the refactor aligned with the architecture target of explicit composition seams and a thinner long-term operator shell.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns top-level direct-chat orchestration and some provider/tool/runtime assembly glue.
- The provider-selection and request/runtime orchestration flow still have meaningful weight inside the chat module.
- The module is structurally cleaner, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around provider/runtime composition or top-level request flow.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around callback wiring, runtime composition, handoff flow, routing, and direct tools after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_composition_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_composition_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_composition_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_composition_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_response_service`
  - `server_modules.tests.test_direct_chat_handoff_facade_service`
  - `server_modules.tests.test_direct_chat_handoff_service`
  - `server_modules.tests.test_direct_chat_availability_service`
  - `server_modules.tests.test_direct_chat_metadata_service`
  - `server_modules.tests.test_direct_chat_context_service`
  - `server_modules.tests.test_direct_tool_config_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Memory And Transcript Wrapper Band Moved Behind Memory Facade

#### Stage

Stage 1 continues. The direct-chat memory/transcript wrapper band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut moves persistence and memory-wrapper glue behind a dedicated facade even though it is not a raw line-count win.

#### Completed Work

- Added [server_modules/direct_chat_memory_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_memory_facade_service.py) to own:
  - direct-chat memory context-message delegation
  - workspace context-text delegation
  - daily-log summary delegation
  - memory persistence wiring with extraction prompt/system prompt injection
  - transcript persistence with best-effort error swallowing
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new facade:
  - `_direct_chat_memory_context_message()`
  - `_direct_chat_workspace_context_text()`
  - `_build_direct_chat_daily_log_summary()`
  - `_persist_direct_chat_memory_best_effort()`
  - `_persist_direct_chat_transcript_best_effort()`
- Added focused coverage in [server_modules/tests/test_direct_chat_memory_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_memory_facade_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) moved from `1787` to `1789` lines in this cut.
- The shell is not shorter on raw lines here, but ownership is reduced: memory and transcript persistence glue now has a dedicated facade boundary instead of living directly in the chat module.
- This keeps the refactor aligned with the architecture target of explicit service seams and a thinner long-term operator shell.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns top-level direct-chat orchestration and some provider/tool/runtime assembly glue.
- The provider-selection and request/runtime orchestration flow still have meaningful weight inside the chat module.
- The module is structurally cleaner, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around provider/runtime composition or direct-tool loop state.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around memory persistence, callback wiring, runtime composition, and direct-chat orchestration after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_memory_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_memory_facade_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_memory_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_memory_facade_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_memory_facade_service`
  - `server_modules.tests.test_memory_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Direct-Tool Loop State Moved Behind Loop Guard Service

#### Stage

Stage 1 continues. The direct-tool loop-signature and repeat-guard band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut removes one more stateful helper strip from the operator shell.

#### Completed Work

- Added [server_modules/direct_tool_loop_guard_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_loop_guard_service.py) to own:
  - direct-tool call signature normalization
  - nested local/computer input normalization for loop signatures
  - repeated tool-call detection against mutable loop state
  - loop-state clearing
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new service:
  - `_tool_call_signature()`
  - `_record_direct_tool_signature()`
  - `_clear_direct_tool_loop_state()`
- Added focused coverage in [server_modules/tests/test_direct_tool_loop_guard_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_loop_guard_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1789` to `1785` lines in this cut.
- Direct-tool repeat detection now has a dedicated service boundary instead of being embedded in the operator shell.
- The remaining chat module is increasingly concentrated on orchestration and provider/runtime composition.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns top-level direct-chat orchestration and some provider/tool/runtime assembly glue.
- The provider-selection and request/runtime orchestration flow still have meaningful weight inside the chat module.
- The module is structurally cleaner, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around provider/runtime composition or response/error shaping.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around direct-tool looping, composition, runtime flow, and top-level orchestration after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_tool_loop_guard_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_loop_guard_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_tool_loop_guard_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_loop_guard_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_tool_loop_guard_service`
  - `server_modules.tests.test_direct_tool_execution_service`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Direct-Tool And No-Provider Composition Moved Behind Runtime Facade Service

#### Stage

Stage 1 continues. The direct-tool execution/no-provider composition band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut moves one more assembly band behind a dedicated facade even though it is not a raw line-count win.

#### Completed Work

- Added [server_modules/direct_tool_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_runtime_facade_service.py) to own:
  - direct-tool execution callback construction
  - no-provider execution-service composition delegation
  - direct-tool approval response composition delegation
  - obvious direct-tool intent delegation
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new facade:
  - `_direct_tool_execution_callbacks()`
  - `_no_provider_execution_services()`
  - `_build_direct_tool_approval_response()`
  - `_message_has_obvious_direct_tool_intent()`
- Added focused coverage in [server_modules/tests/test_direct_tool_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_runtime_facade_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) moved from `1785` to `1788` lines in this cut.
- The shell is not shorter on raw lines here, but ownership is reduced: direct-tool/no-provider composition now has a dedicated facade boundary instead of living directly in the operator shell.
- This keeps the refactor aligned with the architecture target of explicit service seams and a thinner long-term operator shell.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns top-level direct-chat orchestration and some provider/tool/runtime assembly glue.
- The provider-selection and request/runtime orchestration flow still have meaningful weight inside the chat module.
- The module is structurally cleaner, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around provider/runtime composition or response/error shaping.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around no-provider flow, direct-tool composition, runtime composition, and top-level orchestration after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_tool_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_runtime_facade_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_tool_runtime_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_runtime_facade_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_tool_runtime_facade_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_tool_execution_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_tools_http`

### 2026-04-05 - Provider And Error Wrapper Band Moved Behind Provider Facade

#### Stage

Stage 1 continues. The provider/error wrapper band no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut removes one more provider-facing assembly strip from the operator shell.

#### Completed Work

- Added [server_modules/direct_chat_provider_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_facade_service.py) to own:
  - provider auth-mode delegation
  - native-chat capability delegation
  - preferred-provider delegation
  - provider-display and unavailable-response delegation
  - direct-chat credential delegation
  - reasoning-effort normalization
  - direct-chat error reply shaping for iteration-limit failures
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so these historical helpers now delegate through the new facade:
  - `_credential_auth_mode()`
  - `_supports_direct_message_native_chat()`
  - `_preferred_provider()`
  - `_provider_display_name()`
  - `_provider_unavailable_response()`
  - `_direct_chat_credentials()`
  - `_normalize_reasoning_effort()`
  - `_direct_chat_error_reply()`
- Added focused coverage in [server_modules/tests/test_direct_chat_provider_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_provider_facade_service.py).

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) dropped from `1788` to `1787` lines in this cut.
- Provider and error-shaping glue now has a dedicated facade boundary instead of being embedded in the operator shell.
- The remaining chat module is increasingly concentrated on top-level orchestration and final runtime composition.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns top-level direct-chat orchestration and some provider/tool/runtime assembly glue.
- The request/runtime orchestration flow still has meaningful weight inside the chat module.
- The module is structurally cleaner, but it is still not yet the target minimal shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting another orchestration-heavy seam, likely around top-level response/runtime composition.
2. Keep the operator-chat wrapper names stable so existing tests and callers can still patch the same entrypoints.
3. Maintain focused regression coverage around provider selection, no-provider flow, direct-tool composition, runtime composition, and top-level orchestration after each cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_provider_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_facade_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_provider_facade_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_provider_facade_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_provider_facade_service`
  - `server_modules.tests.test_direct_chat_provider_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_iteration_caps`
  - `server_modules.tests.test_direct_chat_composition_service`
  - `server_modules.tests.test_direct_chat_runtime_facade_service`
  - `server_modules.tests.test_direct_chat_callback_facade_service`
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Remaining Connector Constructor Graph Moved Behind Dedicated Shell Service

#### Stage

Stage 1 continues. The remaining top-level constructor graph in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) no longer assembles registry, bridge, and runtime facades inline.

This cut keeps the old compatibility exports in place, but the module now crosses a single shell-service boundary before it builds the façade stack.

#### Completed Work

- Added [server_modules/connectors/autopilot_connector_shell_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_shell_service.py) to own:
  - lazy shell construction for registry, bridge, and runtime facades
  - the shared top-level dependency bundle for the remaining connector shell
  - late-bound access paths needed by direct-import and patched test harnesses
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_autopilot_registry_facade_service()`
  - `_autopilot_bridge_facade_service()`
  - `_autopilot_runtime_facade_service()`
  now delegate through `_autopilot_connector_shell_service()` instead of assembling those facades inline
- Completed the extracted config surface in [server_modules/connectors/autopilot_connector_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_config.py) by adding the missing connector-owned runtime/path constants required by the shell boundary:
  - `ORION_LOCAL_LEASE_SECONDS`
  - `ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS`
  - `ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES`
  - `ORION_TELEGRAM_AUTOPILOT_STATE_FILE`
  - `ORION_WHATSAPP_AUTOPILOT_STATE_FILE`
- Added focused shell coverage in:
  - [server_modules/tests/test_autopilot_connector_shell_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_shell_service.py)
- Expanded config export coverage in:
  - [server_modules/tests/test_autopilot_connector_config_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_config_exports.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `528` lines from `590` before this cut.
- The connector module is still a compatibility shell, but it no longer owns the full remaining façade-construction cluster inline.
- Direct-import compatibility is preserved after the extraction:
  - machine-mode tests still patch module-level run functions after `_init()`
  - throttled event recording still works when `_init()` is stubbed out
  - stripped test harnesses no longer fail on missing runtime-injected globals during shell construction

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns a large compatibility-export surface and remains thicker than the target architecture wants.
- The shell service currently carries a broad dependency bundle because the monolith still exports many historical entrypoints.
- The top-level module still mixes compatibility wrappers with the remaining exported runtime/channel access points.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by removing more compatibility-export ownership, not just constructor ownership.
2. Decide whether the remaining public wrapper band should be grouped behind one additional façade/service or reduced directly into channel-specific exports.
3. Keep preserving late-bound compatibility for patched tests and direct-import harnesses as more of the shell is removed.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_connector_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_config.py)
  - [server_modules/connectors/autopilot_connector_shell_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_shell_service.py)
  - [server_modules/tests/test_autopilot_connector_config_exports.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_config_exports.py)
  - [server_modules/tests/test_autopilot_connector_shell_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_shell_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_connector_shell_service`
  - `server_modules.tests.test_autopilot_connector_config_exports`
  - `server_modules.tests.test_autopilot_registry_facade_service`
  - `server_modules.tests.test_autopilot_bridge_facade_service`
  - `server_modules.tests.test_autopilot_runtime_facade_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`

### 2026-04-05 - Connector Shell Construction Moved Behind Dedicated Builder Module

#### Stage

Stage 1 continues. The remaining late-bound shell-construction block no longer lives inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

The compatibility shell still exists, but the constructor assembly and fallback import logic now live behind a dedicated builder boundary.

#### Completed Work

- Added [server_modules/connectors/autopilot_connector_shell_builder.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_shell_builder.py) to own:
  - shell construction for [server_modules/connectors/autopilot_connector_shell_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_shell_service.py)
  - late-bound module-global lookup for runtime-owned callbacks and stores
  - fallback imports for runtime/common, vault, run, and policy helpers
  - workspace-id normalization fallback logic previously owned by the connector module
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so `_autopilot_connector_shell_service()` now delegates to the builder module instead of assembling the shell inline.
- Added focused builder coverage in:
  - [server_modules/tests/test_autopilot_connector_shell_builder.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_shell_builder.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `411` lines from `528` before this cut.
- The connector module still re-exports the compatibility surface, but it no longer owns the large late-bound builder block directly.
- The builder boundary preserves the behavior that matters for the historical shell:
  - patched module globals still override runtime callbacks when tests patch `create_run`, routing helpers, or runtime policy functions
  - direct-import harnesses still work when runtime-owned globals are absent during import
  - machine-mode and throttled-event flows still pass through the same public connector entrypoints

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still has a broad wrapper/export surface and remains thicker than the target architecture wants.
- The connector shell still re-exports many internal helper names that should eventually reduce to a smaller public contract.
- The module still imports a wide compatibility surface to preserve historical names, even though more of the ownership has moved out.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by shrinking the wrapper/export band, not just the construction band.
2. Decide whether the next cut should group the remaining public wrappers behind one additional export façade or collapse them into channel-specific boundaries.
3. Keep validating late-bound patch behavior as the compatibility shell gets thinner.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_connector_shell_builder.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_shell_builder.py)
  - [server_modules/tests/test_autopilot_connector_shell_builder.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_shell_builder.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_connector_shell_builder`
  - `server_modules.tests.test_autopilot_connector_shell_service`
  - `server_modules.tests.test_autopilot_connector_config_exports`
  - `server_modules.tests.test_autopilot_registry_facade_service`
  - `server_modules.tests.test_autopilot_bridge_facade_service`
  - `server_modules.tests.test_autopilot_runtime_facade_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`

### 2026-04-05 - Compatibility Wrapper Band Moved Behind Export Facade

#### Stage

Stage 1 continues. The remaining one-line compatibility wrapper band no longer lives inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

The connector module still exports the historical helper and endpoint names, but those names now route through a dedicated late-bound export facade instead of a long series of thin wrapper functions.

#### Completed Work

- Added [server_modules/connectors/autopilot_connector_export_facade.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py) to own:
  - service-registry wrapper exports
  - bridge/runtime wrapper exports
  - Telegram compatibility wrapper exports
  - channel event and dead-letter export forwarding
  - Telegram/WhatsApp status and webhook export forwarding
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the public compatibility names are now bound from a single `_AUTOPILOT_EXPORT_FACADE` instance instead of hand-written wrapper defs.
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_connector_export_facade.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_export_facade.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `272` lines from `411` before this cut.
- The compatibility shell still exports the same operational names, but it no longer owns the bulk wrapper boilerplate directly.
- Late-bound behavior is preserved where it matters:
  - patched module-level `_record_channel_event` still flows into throttled event recording
  - patched `create_run` and runtime policy helpers still flow through the builder path established in the prior cut
  - machine-mode and event-dedupe behavior still run through the same public connector names

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now materially smaller, but it still imports a broad compatibility surface and still acts as a re-export shell.
- The module still carries historical config and helper exports that may be reducible further once the public contract is narrowed.
- Some compatibility imports are now only there to preserve module-level availability rather than true ownership.

#### Next Required Work

1. Continue thinning [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by reducing unnecessary import/re-export surface after confirming which names are still part of the real public contract.
2. Decide whether the remaining connector shell should keep broad config re-exports or move to an explicitly smaller supported export set.
3. Keep preserving late-bound module patch semantics as the shell is reduced further.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_connector_export_facade.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_connector_export_facade.py)
  - [server_modules/tests/test_autopilot_connector_export_facade.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_connector_export_facade.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_connector_export_facade`
  - `server_modules.tests.test_autopilot_connector_shell_builder`
  - `server_modules.tests.test_autopilot_connector_shell_service`
  - `server_modules.tests.test_autopilot_connector_config_exports`
  - `server_modules.tests.test_autopilot_registry_facade_service`
  - `server_modules.tests.test_autopilot_bridge_facade_service`
  - `server_modules.tests.test_autopilot_runtime_facade_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`

### 2026-04-05 - Direct-Tool Approval Policy Moved Behind Dedicated Service

#### Stage

Stage 1 continues. Direct-tool approval policy no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This is a real control-flow extraction, not just helper shuffling. The chat module still wires the no-provider execution bundle, but the approval decision rules are now owned by a dedicated service boundary.

#### Completed Work

- Added [server_modules/direct_tool_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_approval_service.py) to own:
  - shell-command destructive approval rules
  - protected file-write approval rules
  - local direct-tool approval routing
  - browser direct-tool approval routing
  - connector/http approval decision logic for direct tools
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so `_approval_required_for_direct_tool()` now delegates into the dedicated approval service instead of owning that policy inline.
- Added focused service coverage in:
  - [server_modules/tests/test_direct_tool_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_approval_service.py)

#### Current Truth

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) is now down to `3243` lines.
- The direct-tool approval rules are now separated from the chat entrypoint/orchestration layer.
- The no-provider execution bundle still receives an approval callback from the chat module, but that callback now fronts a dedicated service instead of an inline policy band.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns too much top-level orchestration, especially around direct-tool execution flow and context assembly.
- The no-provider execution bundle still depends on injected callbacks from the chat module for direct-tool execution and loop orchestration.
- The direct-chat stack is still not yet reduced to a coordination-only shell.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting direct-tool execution orchestration or follow-up shaping, not just policy helpers.
2. Keep moving the no-provider path from callback injection toward service-owned control flow.
3. Preserve the current approval behavior across HTTP, browser, local tools, and machine-mode bypass while reducing chat-module ownership.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_tool_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_tool_approval_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_tool_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_tool_approval_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_tool_approval_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_tools_http`

### 2026-04-05 - Dead Pre-Facade Wrapper Layer And Import Overhead Removed From Connector Shell

#### Stage

Stage 1 continues. The connector shell no longer carries the dead pre-facade wrapper layer that was still sitting above the export facade.

This cut is not a new architectural boundary. It is cleanup that removes redundant ownership after the façade extractions were already in place.

#### Completed Work

- Removed the now-dead wrapper function layer from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) for:
  - registry/bridge/runtime service accessors that were immediately overwritten by export-facade bindings
  - support/runtime helper accessors that no longer had any direct callers
  - Telegram compatibility and webhook bridge wrapper defs that were already delegated through the export facade
- Reduced the connector module import surface so it now keeps:
  - the config re-exports that are still part of the compatibility surface
  - the shell builder
  - the shell service singleton type
  - the export facade
- Removed the now-unused FastAPI fallback class band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) because the webhook handler export is now owned through the export facade instead of a local function definition.

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `122` lines from `272` before this cut.
- The connector shell is now much closer to the target shape:
  - config compatibility surface
  - shell singleton construction
  - export-facade bindings
  and very little else.
- Public behavior remains intact:
  - config export tests still pass
  - machine-mode run tests still pass
  - throttled event dedupe still respects patched module exports

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now thin, but it still acts as a broad compatibility export surface rather than a deliberately minimal supported API.
- The remaining config re-exports may still be larger than the long-term public contract should be.
- Some historical callers may still depend on names that should eventually move behind a narrower connector API.

#### Next Required Work

1. Decide which remaining exports on [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) are truly part of the supported connector API versus pure legacy compatibility.
2. Continue shrinking the re-export surface only after validating any remaining external callers for those names.
3. Keep the focused late-bound tests in place as guardrails while the compatibility shell approaches its final minimal shape.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_connector_export_facade`
  - `server_modules.tests.test_autopilot_connector_shell_builder`
  - `server_modules.tests.test_autopilot_connector_shell_service`
  - `server_modules.tests.test_autopilot_connector_config_exports`
  - `server_modules.tests.test_autopilot_registry_facade_service`
  - `server_modules.tests.test_autopilot_bridge_facade_service`
  - `server_modules.tests.test_autopilot_runtime_facade_service`
  - `server_modules.tests.test_agent_machine_mode`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`

### 2026-04-05 - Top-Level Telegram And WhatsApp Registry Wiring Moved Behind Channel Registry Bridge

#### Stage

Stage 2 connector convergence continues. The autopilot connector module no longer owns the inline construction bodies for the top-level Telegram and WhatsApp service registries.

This is a composition cut, not just another helper wrapper. The live getter names still exist in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), but the registry wiring now crosses a dedicated bridge module first.

#### Completed Work

- Added [server_modules/connectors/autopilot_channel_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py) to own:
  - top-level Telegram autopilot registry construction
  - top-level WhatsApp autopilot registry construction
  - shared caching for both channel registries
  - the callback wiring from support/runtime/helper registries into the channel registries
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_autopilot_channel_registry_bridge_service()` owns bridge construction
  - `_telegram_service_registry()` now delegates through the bridge
  - `_whatsapp_service_registry()` now delegates through the bridge
  - the inline Telegram and WhatsApp registry constructor blocks were removed from the connector module
  - the bridge preserves late-bound `runs` lookup semantics so live module patches still flow into the Telegram run-dispatch service
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_channel_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_channel_registry_bridge_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports the historical channel entrypoints, but it no longer owns the full top-level registry assembly inline.
- The channel composition layer is now split more cleanly:
  - [server_modules/connectors/autopilot_channel_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py)
  - [server_modules/connectors/autopilot_support_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_service_registry.py)
  - [server_modules/connectors/autopilot_runtime_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_service_registry.py)
  - [server_modules/connectors/telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_helper_registry.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `996` lines from `1190` before this cut.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns a meaningful amount of top-level endpoint export surface and runtime bootstrap state.
- The Telegram helper registry bootstrapping and the shared endpoint registry are still the main remaining composition-heavy bands inside the connector module.
- The compatibility layer is thinner than before, but the module is not yet a pure shell around a single runtime contract.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by moving the remaining endpoint/bootstrap composition bands behind dedicated services.
2. Keep preserving the historical exported getter and entrypoint names while the internals converge on registry-based composition.
3. Maintain focused deterministic tests for each extracted bridge or registry cut before widening the verification set again.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_channel_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_registry_bridge_service.py)
  - [server_modules/tests/test_autopilot_channel_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_channel_registry_bridge_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_channel_registry_bridge_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_autopilot_runtime_service_registry`
  - `server_modules.tests.test_autopilot_support_service_registry`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Telegram Helper Registry Bootstrap Moved Behind Dedicated Bridge Service

#### Stage

Stage 2 connector convergence continues. The autopilot connector module no longer owns the inline bootstrap for the Telegram helper registry.

This is a smaller composition cut than the channel-registry bridge, but it removes another constructor band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) while keeping the exported `_telegram_helper_registry()` entrypoint stable.

#### Completed Work

- Added [server_modules/connectors/telegram_helper_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_helper_registry_bridge_service.py) to own:
  - Telegram helper-registry construction
  - helper-registry caching
  - callback wiring for profile/media/routing helper dependencies
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_telegram_helper_registry_bridge_service()` owns bridge construction
  - `_telegram_helper_registry()` now delegates through the bridge
  - the duplicate module-level helper-registry cache layer was removed
  - late-bound lookup semantics were preserved for `_safe_read_json`, `_safe_write_json`, and `_utc_now_iso` so direct module imports still work before runtime initialization
- Added focused coverage in:
  - [server_modules/tests/test_telegram_helper_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_helper_registry_bridge_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports `_telegram_helper_registry()`, but it no longer owns the helper-registry constructor body inline.
- The helper bootstrap boundary is now:
  - [server_modules/connectors/telegram_helper_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_helper_registry_bridge_service.py)
  - [server_modules/connectors/telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_helper_registry.py)
- The direct import path used by the terminal profile-command tests remains compatible after restoring late-bound callback resolution.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the large support/runtime registry assembly blocks inline.
- The shared endpoint/status registry construction is still part of the connector module rather than a dedicated composition bridge.
- The connector module is still a composition-heavy shell, not yet the minimal runtime entry surface described by the architecture document.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by moving the support/runtime registry construction bands behind dedicated bridge services.
2. Keep preserving late-bound behavior for direct module import tests whenever constructor wiring moves behind new bridges.
3. Prefer extraction boundaries that remove composition ownership without changing the historical exported getter and endpoint names.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_helper_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_helper_registry_bridge_service.py)
  - [server_modules/tests/test_telegram_helper_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_helper_registry_bridge_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_helper_registry_bridge_service`
  - `server_modules.tests.test_telegram_autopilot_helper_registry`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Support And Runtime Registry Assembly Moved Behind Dedicated Bridge Services

#### Stage

Stage 2 connector convergence continues. The autopilot connector module no longer owns the large inline constructor bodies for the support-service registry and runtime-service registry.

This is a real composition cut. The historical getters still exist in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), but the registry assembly now crosses dedicated bridge modules first.

#### Completed Work

- Added [server_modules/connectors/autopilot_support_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py) to own:
  - support-registry construction
  - support-registry caching
  - profile/runtime-status/workflow/context/approval/common/skill/channel builder wiring
- Added [server_modules/connectors/autopilot_runtime_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_registry_bridge_service.py) to own:
  - runtime-registry construction
  - runtime-registry caching
  - connector-support/transport/terminal/run-entry/runtime-support/menu builder wiring
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_autopilot_support_service_registry()` now delegates through the support bridge
  - `_autopilot_runtime_service_registry()` now delegates through the runtime bridge
  - the old inline registry-constructor blocks were removed from the connector module
  - direct-import compatibility was preserved with late-safe `globals().get(...)` lookups for profile defaults, profile catalogs, engine-validation errors, and other server-synced values
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_support_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_support_registry_bridge_service.py)
  - [server_modules/tests/test_autopilot_runtime_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_runtime_registry_bridge_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports the historical service getters, but it no longer owns the support/runtime registry assembly inline.
- The composition layer is now split more clearly across:
  - [server_modules/connectors/autopilot_support_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py)
  - [server_modules/connectors/autopilot_runtime_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_registry_bridge_service.py)
  - [server_modules/connectors/autopilot_support_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_service_registry.py)
  - [server_modules/connectors/autopilot_runtime_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_service_registry.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `926` lines from `1001` before this cut.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the shared endpoint/event/status export surface inline.
- The channel snapshot/load/init helper band is still local to the connector module.
- The module is materially smaller now, but it is still not yet the final thin runtime shell described by the architecture paper.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by moving the remaining endpoint/bootstrap/export bands behind dedicated bridges or services.
2. Keep preserving direct-import compatibility for terminal tests whenever constructor wiring depends on server-synced globals.
3. Prefer cuts that remove ownership of composition/state wiring rather than only renaming wrappers.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_support_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_registry_bridge_service.py)
  - [server_modules/connectors/autopilot_runtime_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_registry_bridge_service.py)
  - [server_modules/tests/test_autopilot_support_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_support_registry_bridge_service.py)
  - [server_modules/tests/test_autopilot_runtime_registry_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_runtime_registry_bridge_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_support_registry_bridge_service`
  - `server_modules.tests.test_autopilot_runtime_registry_bridge_service`
  - `server_modules.tests.test_autopilot_support_service_registry`
  - `server_modules.tests.test_autopilot_runtime_service_registry`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_telegram_transport_service`
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_autopilot_runtime_support_service`
  - `server_modules.tests.test_autopilot_profile_service`
  - `server_modules.tests.test_runtime_status_service`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - Shared Registry And Bridge-Construction Cluster Moved Behind Unified Bridge Registry

#### Stage

Stage 2 connector convergence continues. The autopilot connector module no longer owns the shared-service registry constructor or the remaining event/terminal/state/compatibility/webhook bridge-construction cluster inline.

This is a real ownership cut. The historical getters are still exported from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), but those getters now flow through a unified bridge registry first.

#### Completed Work

- Added [server_modules/connectors/autopilot_bridge_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_registry_service.py) to own:
  - shared-service registry construction and caching
  - event-bridge construction and caching
  - terminal-bridge construction and caching
  - state-bridge construction and caching
  - Telegram compatibility-bridge construction and caching
  - WhatsApp webhook-bridge construction and caching
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_autopilot_shared_service_registry()` now constructs the unified bridge registry and delegates to its shared-registry accessor
  - `_autopilot_event_bridge_service()`, `_autopilot_terminal_bridge_service()`, `_autopilot_state_bridge_service()`, `_telegram_compatibility_bridge_service()`, and `_whatsapp_webhook_bridge_service()` now delegate through the unified bridge registry
  - the old inline constructor blocks for those services were removed from the connector module
  - direct-import compatibility was preserved with late-safe lookups for enabled flags, profile catalogs/defaults, webhook secrets, and Telegram state/lock values
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_bridge_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_bridge_registry_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exposes the historical bridge getter names, but it no longer owns their constructor bodies inline.
- The remaining bridge/bootstrap composition now crosses:
  - [server_modules/connectors/autopilot_bridge_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_registry_service.py)
  - [server_modules/connectors/autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_shared_service_registry.py)
  - [server_modules/connectors/autopilot_event_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_event_bridge_service.py)
  - [server_modules/connectors/autopilot_terminal_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_terminal_bridge_service.py)
  - [server_modules/connectors/autopilot_state_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_state_bridge_service.py)
  - [server_modules/connectors/telegram_compatibility_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_compatibility_bridge_service.py)
  - [server_modules/connectors/whatsapp_webhook_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_webhook_bridge_service.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `905` lines from `926` before this cut.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the top-level exported wrapper functions and init/state helper surface.
- The `_init()` path and the top-level endpoint/export band are still local to the connector module.
- The connector module is approaching a thinner shell, but it still has live export and bootstrap responsibilities rather than being a pure runtime contract façade.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by moving the remaining init/state/export helper band behind dedicated services where that actually removes ownership.
2. Keep preserving direct-import compatibility for terminal and connector-context tests whenever bridge construction depends on server-hydrated globals.
3. Avoid wrapper-only churn; prefer cuts that remove constructor or bootstrap ownership from the connector module.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_bridge_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_bridge_registry_service.py)
  - [server_modules/tests/test_autopilot_bridge_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_bridge_registry_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_bridge_registry_service`
  - `server_modules.tests.test_autopilot_shared_service_registry`
  - `server_modules.tests.test_autopilot_terminal_bridge_service`
  - `server_modules.tests.test_autopilot_state_bridge_service`
  - `server_modules.tests.test_telegram_compatibility_bridge_service`
  - `server_modules.tests.test_whatsapp_webhook_bridge_service`
  - `server_modules.tests.test_autopilot_event_bridge_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Machine-Mode Run Wrapper Band Removed From Autopilot Connectors

#### Stage

Stage 2 connector convergence continues. The remaining machine-mode run wrapper band no longer lives in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This was a real subtraction cut, not another service add. The monolith now relies on the extracted run-entry and run-dispatch services directly for those paths, and the machine-mode tests now target the service boundaries instead of deleted compatibility aliases.

#### Completed Work

- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the WhatsApp service registry now calls [server_modules/connectors/telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_dispatch_service.py) directly for terminal-status waiting.
- Removed the forwarding-only compatibility wrappers from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py):
  - `_create_telegram_run()`
  - `_wait_for_run_terminal_status()`
  - `_create_whatsapp_run()`
- Updated [server_modules/tests/test_agent_machine_mode.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_agent_machine_mode.py) so the machine-mode assertions now target:
  - [server_modules/connectors/autopilot_run_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_run_entry_service.py)
  - [server_modules/connectors/telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_dispatch_service.py)
- Kept the true runtime contract intact:
  - [server_modules/runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py) still imports the stable autopilot entrypoints it needs
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exposes the runtime-facing Telegram and WhatsApp entrypoints and snapshots

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `1535` lines.
- The deleted run wrappers are no longer referenced anywhere in the repo.
- The remaining autopilot monolith is now much closer to a real compatibility and composition shell than a behavior-heavy connector runtime.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns a broad compatibility shell plus a smaller set of local helper functions.
- The remaining wrapper layer still needs a stricter audit to decide which names are true runtime exports and which are only historical aliases.
- The durable-run side and direct-chat side still have larger convergence work remaining than the connector shell now does.

#### Next Required Work

1. Audit the remaining exported names in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) against [server_modules/runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py) and [server_modules/__init__.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/__init__.py) so only real runtime entrypoints remain.
2. Continue reducing the connector monolith by deleting forwarding-only compatibility names instead of adding more aliases.
3. After the shell is tighter, shift attention back toward the larger remaining convergence areas on the durable-run and direct-chat sides.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_agent_machine_mode.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_agent_machine_mode.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_run_dispatch_service`

### 2026-04-05 - Dead Internal Service-Accessor Band Removed From Autopilot Connectors

#### Stage

Stage 2 connector convergence continues. Another dead compatibility strip is gone from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This cut removed internal-only service-accessor functions that no longer represented runtime contract and were no longer used outside their own definitions. The top-level module now calls the registries directly at the only remaining live callsites.

#### Completed Work

- Removed the dead internal accessor band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including definition-only wrappers for:
  - Telegram runtime, sender-filter, action, inbound-context, loop, poll-cycle, poll-dispatch, poll-state, run-action, connector-poll, and supervisor services
  - WhatsApp state, run-dispatch, and webhook services
- Inlined the only remaining live uses:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) now calls the WhatsApp webhook service directly through the WhatsApp registry inside `handle_whatsapp_twilio_webhook()`
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) now calls the Telegram supervisor service directly through the Telegram registry inside `_run_telegram_autopilot_forever()`
- Confirmed that none of those deleted internal accessor names remain referenced inside the module.

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `1472` lines.
- The removed service-accessor names were not part of the runtime import surface from:
  - [server_modules/runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py)
  - [server_modules/__init__.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/__init__.py)
- The remaining file is increasingly concentrated around the real runtime-facing entrypoints, service construction, and the smaller set of helper logic still not yet moved elsewhere.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns a non-trivial helper layer around workflow setup, runtime skill shaping, event recording, and transport/context support.
- The runtime export shell still needs a stricter audit so only true public entrypoints remain.
- Connector convergence is ahead of some other architecture tracks, especially durable runs and remaining direct-chat ownership.

#### Next Required Work

1. Keep auditing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) for dead wrapper and helper bands that are no longer part of the runtime surface.
2. Preserve the stable runtime imports used by [server_modules/runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py) and [server_modules/__init__.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/__init__.py), but remove internal-only names aggressively once they are no longer referenced.
3. After the connector shell is tighter, shift more effort back toward the larger remaining convergence work on the direct-chat and durable-run sides.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_telegram_autopilot_supervisor_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`

### 2026-04-05 - Runtime Skill Flow Extracted And Workflow Setup Wrapper Band Removed

#### Stage

Stage 2 connector convergence continues. The helper-heavy middle band in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) took a larger reduction pass.

This cut did two things at once:
- extracted the runtime skill selection and skill-menu behavior into a dedicated service
- removed the dead workflow-setup wrapper band that no longer had any live callers

#### Completed Work

- Added [server_modules/connectors/autopilot_skill_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_skill_service.py) to own:
  - runtime skill snapshot loading
  - builtin/custom skill normalization
  - active-skill selection by scope
  - Telegram skill-goal shaping
  - skill lookup from text
  - skills-menu text generation
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - the Telegram service registry now calls the skill service for `select_skill_from_text`, `skill_goal_builder`, and `skills_menu_text`
  - the Telegram helper registry now calls the skill service for skill selection and goal shaping
  - the Telegram menu service now calls the skill service for `runtime_active_skills`
- Removed the old monolith-owned runtime-skill helper cluster from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py):
  - `_runtime_skills_snapshot_safe()`
  - `_runtime_builtin_skills()`
  - `_normalize_runtime_skill_card()`
  - `_runtime_active_skills()`
  - `_telegram_skill_goal()`
  - `_telegram_select_skill_from_text()`
  - `_telegram_skills_menu_text()`
- Removed the dead workflow-setup wrapper band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py):
  - `_workspace_connector_flags()`
  - `_primary_email_connector_id()`
  - `_email_summary_workflow_definition()`
  - `_lead_followup_workflow_definition()`
  - `_create_published_workflow_record()`
  - `_create_email_summary_visibility_record()`
  - `_create_email_summary_execution_schedules()`
  - `_create_lead_followup_execution_schedules()`
  - `_create_lead_followup_visibility_record()`
  - `_email_summary_completion_text()`
  - `_lead_followup_completion_text()`
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_skill_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_skill_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `1282` lines.
- The removed workflow-setup wrapper names no longer exist in the monolith and had no external callers.
- Runtime skill behavior still exists, but it now crosses [server_modules/connectors/autopilot_skill_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_skill_service.py) as a dedicated boundary instead of staying hidden in the connector shell.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns some helper logic around events, transport/context support, and small runtime utilities.
- The remaining connector shell should still be audited against the true runtime import surface from [server_modules/runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py) and [server_modules/__init__.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/__init__.py).
- Durable-run and direct-chat convergence still remain larger unfinished tracks than the connector shell now does.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by deleting remaining dead helper and wrapper bands that are not part of the runtime contract.
2. Keep extracted behavior behind dedicated services rather than reintroducing helper logic into the connector shell.
3. After the connector shell is thinner, shift more sustained effort back into the remaining durable-run and direct-chat convergence work.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_skill_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_skill_service.py)
  - [server_modules/tests/test_autopilot_skill_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_skill_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_skill_service`
  - `server_modules.tests.test_telegram_menu_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_autopilot_helper_registry`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_autopilot_workflow_setup_service`

### 2026-04-05 - Dead Connector-Support Helper Strip Removed From Autopilot Connectors

#### Stage

Stage 2 connector convergence continues. Another dead helper strip is gone from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This cut did not move behavior into a new service. It removed definition-only helper names that no longer had live callers anywhere in the repo and were only inflating the connector shell.

#### Completed Work

- Removed the dead connector-support helper strip from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_data_url_from_local_file()`
  - `_connector_capability_summary()`
  - `_telegram_requested_recent_email_limit()`
  - `_telegram_prefixed_command()`
  - `_telegram_menu_keyboard()`
  - `_telegram_parse_allow_from()`
  - `_telegram_extension_from_attachment()`
  - `_telegram_download_file()`
  - `_bool_from_any()`
  - `_connector_metadata()`
  - `_telegram_strip_prefix()`
  - `_whatsapp_connector_match()`
- Removed now-unused imports from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) tied only to those deleted helpers.
- Confirmed that none of those names remain referenced anywhere under `server_modules` or `scripts`.

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `1214` lines.
- The connector shell is increasingly concentrated around:
  - true runtime-facing entrypoints
  - service construction and wiring
  - a smaller set of still-live helper functions that are actually used by the service graph

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns some shared helper logic around eventing, session/trace helpers, transport bridging, and context support.
- The remaining runtime-facing shell still needs to be audited carefully against [server_modules/runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py) and [server_modules/__init__.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/__init__.py) so only real public entrypoints survive.
- Connector convergence is far ahead now, but the broader architecture still has major remaining work on durable runs and direct-chat convergence.

#### Next Required Work

1. Keep removing definition-only and forwarding-only helper bands from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) while preserving the true runtime contract.
2. Continue favoring direct service ownership over shell-owned helper logic whenever a behavior boundary is already available.
3. After a few more connector-shell reductions, redirect more effort toward the larger remaining convergence tracks outside connectors.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_telegram_menu_service`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_webhook_service`

### 2026-04-05 - Service-Wiring Wrapper Band Reduced With Terminal Compatibility Preserved

#### Stage

Stage 2 connector convergence continues. Another large one-line delegate band was removed from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This pass focused on helper names that only existed to feed service lambdas into the Telegram and WhatsApp registries. The wiring now calls the extracted services directly in most places. A small Telegram helper subset was intentionally preserved because terminal-side tests still treat those names as part of the compatibility surface.

#### Completed Work

- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the Telegram and WhatsApp registries now call extracted services directly for:
  - profile resolution
  - allowlist resolution
  - secret lookup
  - paused-state checks
  - Telegram API request transport
  - message routing
  - sender checks
  - attachment storage
  - connector-context assembly
  - installed-skill query routing
  - role assignment
  - terminal profile/goal routing
- Removed the now-dead one-line delegate band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_runtime_api_headers()`
  - `_telegram_reply_keyboard()`
  - `_telegram_get_secret()`
  - `_telegram_api_request()`
  - `_telegram_chat_matches()`
  - `_telegram_resolve_allow_from()`
  - `_telegram_sender_allowed()`
  - `_telegram_store_attachments()`
  - `_connector_assigned_agent_role()`
  - `_connector_paused()`
  - `_resolve_telegram_autopilot_profile()`
  - `_resolve_whatsapp_autopilot_profile()`
  - `_telegram_is_explicit_run_command()`
  - `_cognitive_defaults()`
  - `_cognitive_module()`
- Kept these Telegram helper wrappers intentionally because the terminal-side test surface still imports or calls them directly:
  - `_telegram_build_goal_with_profile()`
  - `_telegram_workspace_connector_context()`
  - `_telegram_extract_message()`
  - `_telegram_build_goal_with_attachments()`
  - `_telegram_route_message()`

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `1131` lines.
- The connector shell is getting closer to a real runtime boundary:
  - service construction
  - runtime-facing entrypoints
  - a smaller compatibility layer for still-supported helper names
- The broader Telegram terminal-side compatibility surface is now explicit instead of accidental.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns event/session/trace helper logic plus a small remaining compatibility shell.
- Some helper names are still retained only because the terminal-side tests rely on them; those should be audited deliberately rather than removed blindly.
- The connector shell is much smaller now, but the overall architecture still has larger unfinished work in direct-chat and durable-run convergence.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by separating true runtime exports from legacy-but-still-tested compatibility helpers.
2. If terminal-side helper compatibility is still required, make that contract explicit and minimal rather than leaving broad helper ownership in the shell.
3. Keep redirecting service wiring straight to extracted services instead of routing through monolith-owned aliases.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_telegram_autopilot_helper_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_autopilot_workflow_setup_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - WhatsApp Helper Wrapper Band Removed

#### Stage

Stage 3 continues. The connector monolith no longer carries the small WhatsApp helper wrapper band for help text, number normalization, TwiML generation, and Twilio send forwarding.

This is another clean subtraction step. Those helpers had no real external callers left and only served local registry or endpoint wiring.

#### Completed Work

- Rewired the WhatsApp service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so it now calls the extracted profile service directly for WhatsApp help text.
- Rewired `_whatsapp_session_key()` in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so number normalization now goes directly through the extracted WhatsApp transport service.
- Rewired `handle_whatsapp_twilio_webhook()` in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so TwiML response generation now goes directly through the extracted WhatsApp transport service.
- Removed the dead helper wrapper band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_telegram_help_text()`
  - `_whatsapp_help_text()`
  - `_normalize_whatsapp_number()`
  - `_whatsapp_twiml()`
  - `_twilio_send_whatsapp_message()`

#### Current Truth

- The deleted WhatsApp helper wrapper names are fully gone from the monolith source.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `1644` lines to `1611` in this cut.
- The remaining shell is now even more concentrated around true compatibility entrypoints and the still-active run-entry wrappers.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still carries the stable compatibility wrappers for externally exercised run creation and terminal wait behavior.
- Some helper functions still remain because they encapsulate actual local logic instead of just forwarding into extracted services.
- The final compatibility audit of the remaining shell is still not complete.

#### Next Required Work

1. Continue auditing the remaining stable wrapper names in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) against real runtime imports and tests.
2. Delete any additional forwarding-only helpers that do not have a real external dependency.
3. Keep the remaining compatibility layer explicit and small instead of letting new internal helper aliases accumulate there again.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_transport_service.py)
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_transport_service`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`

### 2026-04-05 - Runtime-Support Wrapper Band Removed

#### Stage

Stage 3 continues. The connector monolith no longer carries the dead runtime-support wrapper band that only forwarded into the extracted runtime-support and runtime-status services.

This is another compatibility-safe subtraction step. The stable run-entry shell remains, but the runtime-support aliases had no real external callers left.

#### Completed Work

- Rewired the Telegram service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so it now calls the extracted runtime-status and runtime-support services directly for:
  - status text
  - run summary humanization
  - latest run error extraction
  - non-retryable error checks
  - friendly error shaping
  - terminal result summarization
  - local companion snapshot
- Rewired the WhatsApp service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so runtime status text now calls the extracted runtime-status service directly.
- Removed the dead runtime-support wrapper band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_latest_runtime_run_summary()`
  - `_current_runtime_metrics()`
  - `_runtime_status_text()`
  - `_autopilot_is_worker_online()`
  - `_local_companion_snapshot()`
  - `_telegram_runtime_status_text()`
  - `_extract_run_error_messages()`
  - `_latest_run_error_message()`
  - `_is_non_retryable_run_error()`
  - `_friendly_autopilot_run_error()`
  - `_humanize_telegram_run_summary()`
  - `_summarize_run_terminal_result()`

#### Current Truth

- The deleted runtime-support wrapper names are fully gone from the monolith source.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `1692` lines to `1644` in this cut.
- The remaining wrapper shell is now even more clearly limited to true runtime-facing entrypoints and the explicit run-entry compatibility layer.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still carries the stable compatibility wrappers for externally exercised run creation and terminal wait behavior.
- Some additional pure helper wrappers still remain where they encapsulate actual logic rather than simple forwarding.
- The final compatibility audit of the remaining shell is still not complete.

#### Next Required Work

1. Continue auditing the remaining stable wrapper names in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) against real runtime imports and tests.
2. Delete any additional forwarding-only helpers that do not have a real external dependency.
3. Keep the compatibility shell narrow and explicit instead of letting new helper aliases accumulate there again.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
  - [server_modules/connectors/runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/runtime_status_service.py)
  - [server_modules/connectors/autopilot_runtime_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_support_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_runtime_status_service`
  - `server_modules.tests.test_autopilot_runtime_support_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`

### 2026-04-05 - Dead Helper Alias Band Removed

#### Stage

Stage 3 continues. The connector monolith no longer carries the last dead helper alias band that only forwarded into approval, runtime-support, or common-support services without having any real external caller.

This is a small but honest subtraction step. The remaining stable run-entry wrappers were left alone because they still have compatibility callers, but these aliases did not.

#### Completed Work

- Rewired the Telegram service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so pending-approval notification now calls the extracted approval service directly.
- Rewired the WhatsApp service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so run-reply text now calls the extracted Telegram run-dispatch service directly.
- Removed the dead helper alias band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_autopilot_run_reply_text()`
  - `_chat_id_from_session_key()`
  - `_normalize_string_list()`
  - `_pending_approval_event_id()`
  - `_telegram_notify_pending_approvals()`

#### Current Truth

- The deleted helper alias names are fully gone from the monolith source.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `1723` lines to `1692` in this cut.
- The remaining shell is now more clearly the true compatibility layer: runtime-facing entrypoints and the still-used run-entry wrappers.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still carries the stable compatibility wrappers for externally exercised run creation and terminal wait behavior.
- Some remaining runtime-support helper wrappers are still in place because they participate in the broader runtime surface.
- The monolith is smaller, but the final compatibility audit is not done yet.

#### Next Required Work

1. Audit the remaining stable wrapper names in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) against actual external imports and tests.
2. Delete any remaining helper wrappers that no longer have a runtime or test dependency.
3. Keep preserving only the compatibility names that still matter for `runtime_config.py`, `runs_core.py`, and explicit test callers.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py)
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
  - [server_modules/connectors/telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_terminal_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_approval_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_terminal_service`

### 2026-04-05 - Endpoint And Run-Bridge Wrapper Band Reduced

#### Stage

Stage 3 continues. The connector monolith no longer owns the internal-only wrapper band around WhatsApp form parsing, WhatsApp finalize handoff, Telegram poll dispatch entry, and machine-mode helper forwarding.

This cut also reduced dependence on the remaining stable run-entry wrappers by wiring internal registries directly to the extracted run-entry and run-dispatch services wherever compatibility was not required.

#### Completed Work

- Rewired the Telegram service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so it now calls the extracted run-entry service directly for:
  - Telegram run creation
  - wait auto-approval checks
  - pending-confirmation payload resolution
- Rewired the WhatsApp service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so it now calls the extracted run-entry service directly for WhatsApp run creation.
- Rewired the Telegram terminal service in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so it now calls the extracted run-entry service directly for Telegram run creation and the extracted run-dispatch service directly for terminal wait behavior.
- Inlined the WhatsApp webhook form parse path inside `handle_whatsapp_twilio_webhook()` instead of routing through a local `_parse_form_urlencoded()` wrapper.
- Removed the obsolete internal-only wrapper band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_whatsapp_finalize_run_async()`
  - `_parse_form_urlencoded()`
  - `_telegram_poll_connector()`
  - `_agent_machine_owned_entrypoint_owner_user_id()`
  - `_agent_machine_full_trust_for_run()`
  - `_pending_confirmation_payload()`
  - `_autopilot_can_auto_approve_wait()`
- Restored only the actually externalized runtime entrypoints that still remain part of the runtime surface:
  - `_run_telegram_autopilot_forever()`
  - `_load_telegram_autopilot_state()`
  - `_load_whatsapp_autopilot_state()`
  - `_telegram_autopilot_snapshot()`
  - `_whatsapp_autopilot_snapshot()`
  - `_whatsapp_autopilot_activate()`

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) now uses the extracted run-entry and run-dispatch services directly for more of its internal wiring.
- The deleted internal wrapper names are fully gone from the monolith source.
- The monolith line count dropped from `1737` to `1723` after restoring the true runtime-facing compatibility entrypoints.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still carries the remaining stable wrapper shell for externally exercised run-entry helpers such as `_create_telegram_run()`, `_create_whatsapp_run()`, and `_wait_for_run_terminal_status()`.
- Some runtime-facing compatibility functions remain intentionally because other modules still import them directly.
- The file is close to a real composition shell, but still not fully reduced to endpoint-plus-registry wiring.

#### Next Required Work

1. Re-check the remaining stable wrapper names in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) against actual cross-module callers and delete any that no longer have a real external dependency.
2. Keep the remaining compatibility shell narrow: only preserve names that are still imported by runtime modules or exercised by compatibility tests.
3. Continue reducing mixed-channel glue while avoiding breakage in `runtime_config.py`, `runs_core.py`, and the machine-mode test surface.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_run_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_run_entry_service.py)
  - [server_modules/connectors/telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_terminal_service.py)
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_webhook_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_webhook_service.py)
  - [server_modules/__init__.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/__init__.py)
  - [server_modules/runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py)
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/health_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/health_core.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_run_entry_service`
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-05 - Approval And Telegram Transport Wrapper Band Removed

#### Stage

Stage 3 continues. The connector monolith no longer owns the compatibility band for approval operations and Telegram transport operations that only forwarded into already-extracted services.

This is another deletion-first cut. The approval service and Telegram transport service were already canonical, so the monolith should not keep local aliases for those behaviors.

#### Completed Work

- Rewired the Telegram service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so it now calls the extracted services directly for:
  - outbound Telegram send/edit/chat-action operations
  - approval listing
  - approval resolution
  - approval text rendering
  - approval result rendering
- Rewired the WhatsApp service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so approval-related operations now call the extracted approval service directly.
- Rewired the approval service constructor in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so outbound notifications now go straight through the extracted Telegram transport service.
- Rewired the Telegram terminal service in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so terminal sends now call the extracted Telegram transport service directly.
- Removed the obsolete wrapper band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_autopilot_approvals_list()`
  - `_autopilot_approval_resolve()`
  - `_autopilot_approvals_text()`
  - `_autopilot_approval_result_text()`
  - `_telegram_send_message()`
  - `_telegram_send_chat_action()`
  - `_telegram_edit_message()`

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) now treats approvals and Telegram outbound transport as service-owned behavior instead of monolith-owned aliases.
- The monolith line count dropped from `1818` to `1737` in this cut.
- The deleted wrapper names are fully gone from the monolith source.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the last bridge shell for run entry, endpoint wrappers, and some cross-channel runtime helper names.
- Some compatibility wrappers remain intentionally where tests or other modules still call stable monolith entrypoints.
- The file is approaching a composition shell, but it is not yet reduced to pure endpoint and registry wiring.

#### Next Required Work

1. Continue collapsing the remaining endpoint and run-entry bridge layer in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
2. Keep deleting internal-only forwarding names instead of preserving them as compatibility aliases without a real external caller.
3. Re-check the remaining stable wrapper names against cross-module usage before removing them.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py)
  - [server_modules/connectors/telegram_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_transport_service.py)
  - [server_modules/connectors/telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_terminal_service.py)
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_approval_service`
  - `server_modules.tests.test_telegram_transport_service`
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`

### 2026-04-05 - Telegram Helper-State Compatibility Band Removed

#### Stage

Stage 3 continues. The connector monolith no longer owns the old Telegram helper-state compatibility band for profile state, onboarding state, camera setup state, and guided setup delegation.

This is another deletion-first cut. The helper services already existed, so the correct move was to wire the registries to those services directly and delete the obsolete local forwarding layer.

#### Completed Work

- Rewired the Telegram service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so it now calls the extracted helper services directly for:
  - profile normalization
  - onboarding prompt and onboarding state access
  - profile get/set/clear operations
  - profile text and help text rendering
  - guided automation setup handling
  - profile-context detection and profile-based goal shaping
- Rewired the Telegram helper registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the camera-setup service now derives its session key directly from the extracted profile service instead of the monolith wrapper layer.
- Rewired the Telegram terminal service in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so chat-profile access now goes directly to the extracted profile service.
- Removed the obsolete Telegram helper-state wrapper band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including wrappers for:
  - profile state load/persist/get/set/clear
  - onboarding state load/persist/get/start/advance
  - camera setup state load/persist/get/set/clear
  - guided setup forwarding
  - internal profile/onboarding helper forwarding such as profile text/help and onboarding prompt routing

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) now treats Telegram helper state as service-owned instead of pretending to own it locally.
- The monolith line count dropped from `1936` to `1818` in this cut.
- The deleted wrapper names are fully gone from the monolith source.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the last thin transport, endpoint, and runtime bridge layer.
- Some externally exercised compatibility wrappers remain intentionally, especially where tests or other modules still call stable monolith names.
- The file is now much closer to a composition shell, but not yet reduced to pure endpoint wiring.

#### Next Required Work

1. Continue collapsing the last bridge layer in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially transport and endpoint wrappers that now only delegate.
2. Keep preserving externally exercised wrapper names only where compatibility still matters, and delete the rest.
3. Re-check the remaining shared runtime/approval bridge layer for any more internal-only forwarding bands.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_helper_registry.py)
  - [server_modules/connectors/telegram_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_profile_service.py)
  - [server_modules/connectors/telegram_camera_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_camera_setup_service.py)
  - [server_modules/connectors/telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_terminal_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_autopilot_helper_registry`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_terminal_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - Connector Monolith State Bridge Wrappers Removed

#### Stage

Stage 3 continues. The connector monolith no longer owns the thin Telegram and WhatsApp state-bridge wrapper band that only forwarded into already-extracted state and runtime services.

This cut is intentionally subtractive. The goal was not to add another service, but to stop [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) from pretending to own state helpers that were already implemented elsewhere.

#### Completed Work

- Rewired the Telegram lazy service registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so internal callers now hit the extracted services directly for:
  - state persistence
  - connector entry listing
  - connector state lookup and patching
  - error marking
  - poll bookkeeping
- Rewired the shared autopilot registry in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so Telegram and WhatsApp snapshots and connector listings now go straight through the extracted channel state services.
- Rewired the Telegram terminal and run-entry service bundles in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so run-count persistence and connector-state interactions go directly to the extracted Telegram and WhatsApp state services.
- Removed the now-dead wrapper band from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_load_telegram_autopilot_state()`
  - `_persist_telegram_autopilot_state()`
  - `_telegram_autopilot_snapshot()`
  - `_load_whatsapp_autopilot_state()`
  - `_persist_whatsapp_autopilot_state()`
  - `_whatsapp_autopilot_mark_error()`
  - `_whatsapp_autopilot_activate()`
  - `_whatsapp_autopilot_mark_inbound()`
  - `_whatsapp_autopilot_increment_processed()`
  - `_whatsapp_connector_state()`
  - `_set_whatsapp_connector_state()`
  - `_list_whatsapp_connector_entries()`
  - `_whatsapp_autopilot_snapshot()`
  - `_telegram_autopilot_mark_error()`
  - `_telegram_autopilot_mark_poll()`
  - `_telegram_connector_state()`
  - `_set_telegram_connector_state()`
  - `_list_telegram_connector_entries()`
  - `_whatsapp_autopilot_log()`

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) now calls the extracted Telegram and WhatsApp state/runtime services directly instead of routing through local wrapper aliases first.
- The monolith line count dropped from `2015` to `1936` in this cut.
- The remaining code in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now more honestly a transport and composition shell than a fake owner of channel state.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the last thin bridge layer for transport wrappers, endpoint handlers, and cross-channel runtime coordination.
- Some service construction still happens inside the monolith rather than through cleaner composition roots.
- The file is much smaller, but it is not yet reduced to a pure endpoint and registry shell.

#### Next Required Work

1. Continue thinning the last bridge layer in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially endpoint and transport wrappers that still only delegate.
2. Decide how far to collapse the remaining composition shell without making the service graph harder to understand.
3. Keep favoring deletion over compatibility aliases unless a stable external import path truly requires the wrapper.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_runtime_status_service`

### 2026-04-05 - Telegram Menu And Keyboard Flow Moved Behind Menu Service

#### Stage

Stage 3 connector-monolith reduction continues. The Telegram menu and reply-keyboard builder no longer lives inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This was one of the last remaining inline behavior blocks in the monolith rather than a simple wrapper cluster. The change keeps the UI semantics the same but moves the branching keyboard logic behind a dedicated service.

#### Completed Work

- Added [server_modules/connectors/telegram_menu_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_menu_service.py) with:
  - prefixed-command generation
  - main menu keyboard generation
  - study/project/context/skills submenu generation
  - reply-keyboard generation
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so these helpers now delegate instead of owning implementation inline:
  - `_telegram_prefixed_command()`
  - `_telegram_menu_keyboard()`
  - `_telegram_reply_keyboard()`
- Added focused coverage in:
  - [server_modules/tests/test_telegram_menu_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_menu_service.py)

#### Current Truth

- Telegram menu and keyboard behavior now has a dedicated service boundary instead of staying embedded in the connector monolith.
- The public wrappers and existing registry wiring still behave the same, but the real keyboard/menu branching logic is no longer inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2102` lines to `2015` lines in this cut.

#### Open Gaps

- The monolith still owns thin transport wrappers, endpoint entry functions, and a small band of bridge helpers.
- The remaining file is much thinner now, but it is not yet only a transport/composition shell.
- Future reductions will need to target the last meaningful grouped seams rather than isolated one-line delegates.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by targeting the remaining grouped bridge layers.
2. Keep Telegram UI behavior in dedicated services and keep the connector entry module focused on composition and routing.
3. Preserve focused service-level coverage for user-facing command/menu behavior.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_menu_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_menu_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_menu_service`
  - `server_modules.tests.test_autopilot_profile_service`

### 2026-04-05 - Approval And Terminal Common Helpers Moved Behind Common Support Service

#### Stage

Stage 3 connector-monolith reduction continues. The remaining shared approval and terminal helper slice for cognitive defaults, cognitive module loading, string-list normalization, and Telegram session-key parsing no longer lives inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a smaller cut than the runtime-support and connector-support moves, but it is still real helper ownership that fed both the approval service and the Telegram terminal path.

#### Completed Work

- Added [server_modules/connectors/autopilot_common_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_common_support_service.py) with:
  - cognitive defaults resolution
  - cognitive module loading
  - string-list normalization
  - Telegram `session_key -> chat_id` parsing
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - [server_modules/connectors/autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py) now receives cognitive defaults/module and string-list normalization through the common-support service
  - [server_modules/connectors/telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_terminal_service.py) now receives `chat_id_from_session_key` through the common-support service
  - these wrappers now delegate instead of owning logic inline:
    - `_cognitive_defaults()`
    - `_cognitive_module()`
    - `_chat_id_from_session_key()`
    - `_normalize_string_list()`
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_common_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_common_support_service.py)

#### Current Truth

- Shared approval and terminal helper behavior now has a dedicated service boundary instead of staying embedded in the connector monolith.
- The public wrappers and downstream services still behave the same, but the common helper logic is no longer inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2108` lines to `2102` lines in this cut.

#### Open Gaps

- The monolith still owns a remaining band of transport wrappers, endpoint entry functions, and other thin bridge helpers.
- The file is materially smaller now, but it is still not only transport/composition glue.
- Some of the remaining wrappers are already thin, so future reductions will need to target the last meaningful grouped seams rather than individual one-line delegates.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by targeting the last grouped bridge/helper seams instead of isolated wrappers.
2. Keep common helper logic in dedicated services when that logic is shared across approval, terminal, or channel flows.
3. Preserve focused service-level verification for the smaller helper boundaries instead of relying only on integration coverage.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_common_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_common_support_service.py)
  - [server_modules/connectors/autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py)
  - [server_modules/connectors/telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_terminal_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_common_support_service`
  - `server_modules.tests.test_autopilot_approval_service`
  - `server_modules.tests.test_telegram_terminal_service`

### 2026-04-05 - Telegram Connector Support Helpers Moved Behind Support Service

#### Stage

Stage 3 connector-monolith reduction continues. The remaining Telegram connector-support block for secret lookup, allowlist parsing, sender filtering, chat matching, and connector metadata helpers no longer lives inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This cut removes Telegram support logic, not transport or runtime orchestration. The existing wrappers and registry wiring remain stable, but the underlying helper ownership is now externalized.

#### Completed Work

- Added [server_modules/connectors/telegram_connector_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_connector_support_service.py) with:
  - boolean normalization
  - connector metadata lookup
  - assigned-agent-role normalization
  - connector paused-state evaluation
  - Telegram connector secret lookup
  - chat targeting checks
  - allowlist parsing and merged allowlist resolution
  - sender allowlist checks
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so these helpers now delegate instead of owning implementation inline:
  - `_telegram_get_secret()`
  - `_telegram_chat_matches()`
  - `_telegram_parse_allow_from()`
  - `_telegram_resolve_allow_from()`
  - `_telegram_sender_allowed()`
  - `_bool_from_any()`
  - `_connector_metadata()`
  - `_connector_assigned_agent_role()`
  - `_connector_paused()`
- Updated live dependency wiring so:
  - [server_modules/connectors/autopilot_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_profile_service.py) now receives boolean parsing through the support-service-backed wrapper
  - Telegram and WhatsApp registries continue using the same public wrappers, but those wrappers no longer own the helper logic inline
- Added focused coverage in:
  - [server_modules/tests/test_telegram_connector_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_connector_support_service.py)

#### Current Truth

- Telegram connector-support behavior now has a dedicated service boundary instead of being embedded in the monolith.
- Connector paused-state, role resolution, secret lookup, and sender-allowlist behavior still flow through the same wrappers, but the real logic is no longer inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2176` lines to `2108` lines in this cut.

#### Open Gaps

- The monolith still owns remaining shared wrappers around approvals, terminal send/edit paths, and endpoint entry functions.
- Telegram helper ownership is thinner now, but [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still is not only a transport/composition shell.
- Some tiny wrapper-only helper groups remain because they still bridge service registries or runtime globals.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining shared wrapper groups that still contain cross-channel utility ownership.
2. Keep Telegram support behavior in dedicated services and keep registry wiring thin.
3. Preserve direct support-service tests alongside the broader profile and state tests that depend on the same semantics.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_connector_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_connector_support_service.py)
  - [server_modules/connectors/autopilot_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_profile_service.py)
  - [server_modules/connectors/telegram_autopilot_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_state_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_connector_support_service`
  - `server_modules.tests.test_autopilot_profile_service`
  - `server_modules.tests.test_telegram_autopilot_state_service`

### 2026-04-05 - Shared Channel Event And Dead-Letter Flow Moved Behind Event Service

#### Stage

Stage 3 connector-monolith reduction continues. The remaining shared Telegram/WhatsApp event-recording and dead-letter block no longer lives as inline implementation inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is shared infrastructure, not channel-specific behavior. The goal of this cut was to move mixed-channel runtime support out of the monolith without changing the surrounding connector flow.

#### Completed Work

- Added [server_modules/connectors/autopilot_event_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_event_service.py) with:
  - shared channel event recording
  - throttled event recording with in-memory dedupe
  - channel dead-letter append behavior
- Expanded [server_modules/connectors/autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_shared_service_registry.py) so the shared registry now owns:
  - lazy event-service creation
  - dead-letter file/limit/lock wiring
  - shared append-channel-event dependency injection
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so these helpers now delegate instead of owning implementation inline:
  - `_record_channel_event()`
  - `_append_channel_dead_letter()`
  - `_record_channel_event_throttled()`
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_event_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_event_service.py)
  - [server_modules/tests/test_autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_shared_service_registry.py)

#### Current Truth

- Shared connector infrastructure now has a dedicated event-service boundary instead of living in the monolith.
- The shared registry now owns status, endpoint, and event services, which is closer to the intended composition role in the architecture.
- Channel services still call wrappers in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), but the mixed-channel implementation under those wrappers is now externalized.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2312` lines to `2278` lines in this cut.

#### Open Gaps

- The monolith still owns some remaining shared runtime glue, including top-level initialization helpers, runtime status helpers, and other cross-channel wrappers.
- The registry composition is stronger now, but not all remaining shared helper blocks have been moved behind dedicated services yet.
- The channel entry module is thinner, but it is not yet only transport/composition glue.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining shared runtime/helper blocks that do not belong to a channel shell.
2. Keep shared infrastructure in the shared registry and keep channel-specific behavior in channel registries.
3. Preserve direct service-level coverage for shared infrastructure boundaries instead of relying only on downstream connector tests.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_event_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_event_service.py)
  - [server_modules/connectors/autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_shared_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_event_service`
  - `server_modules.tests.test_autopilot_shared_service_registry`
  - `server_modules.tests.test_telegram_transport_service`
  - `server_modules.tests.test_whatsapp_transport_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`

### 2026-04-05 - Shared Runtime Metrics And Run Summary Flow Moved Behind Runtime Support Service

#### Stage

Stage 3 connector-monolith reduction continues. The shared runtime-support block for metrics, local companion state, worker-online detection, and run summary/error shaping no longer lives inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This cut targets shared runtime support, not channel-specific behavior. The status surface and Telegram run-dispatch path still behave the same, but they now consume a dedicated service boundary instead of inline helper ownership.

#### Completed Work

- Added [server_modules/connectors/autopilot_runtime_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_support_service.py) with:
  - runtime metrics snapshot
  - latest runtime run summary
  - worker-online detection with fallback logic
  - local companion snapshot
  - run error extraction and last-error resolution
  - non-retryable error detection
  - friendly run-error text shaping
  - Telegram-facing run-summary humanization
  - final terminal-run summary shaping
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so these helpers now delegate into the runtime-support service:
  - `_latest_runtime_run_summary()`
  - `_current_runtime_metrics()`
  - `_autopilot_is_worker_online()`
  - `_local_companion_snapshot()`
  - `_extract_run_error_messages()`
  - `_latest_run_error_message()`
  - `_is_non_retryable_run_error()`
  - `_friendly_autopilot_run_error()`
  - `_humanize_telegram_run_summary()`
  - `_summarize_run_terminal_result()`
- Updated the live composition path so:
  - [server_modules/connectors/runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/runtime_status_service.py) now reads runtime metrics and companion state through the runtime-support service wiring
  - [server_modules/connectors/telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_dispatch_service.py) continues using the same dependencies, but those dependencies are now service-owned under the wrappers
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_runtime_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_runtime_support_service.py)

#### Current Truth

- Shared runtime support now has its own service boundary instead of staying embedded in the connector monolith.
- Runtime status text and Telegram run waiting/error behavior still use the same public wrappers, but the underlying shared logic is no longer inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2278` lines to `2176` lines in this cut.

#### Open Gaps

- The monolith still owns remaining shared runtime/helper wrappers such as cognitive-approval defaults, transport wrappers, and some connector utility functions.
- Shared support is thinner now, but [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is still not only transport/composition glue.
- Some remaining helper groups are still mixed between channel-specific wrappers and shared runtime concerns.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining shared helper groups that do not belong to a channel entry module.
2. Keep shared runtime behavior in dedicated services and keep channel registries consuming those services through stable wrappers.
3. Preserve direct service-level tests for runtime support paths, especially where Telegram run dispatch depends on shared state and error shaping.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_runtime_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_support_service.py)
  - [server_modules/connectors/runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/runtime_status_service.py)
  - [server_modules/connectors/telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_dispatch_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_runtime_support_service`
  - `server_modules.tests.test_runtime_status_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_agent_machine_mode.AgentMachineModeTests.test_wait_for_run_terminal_status_auto_approves_matching_owner_confirmation`
  - `server_modules.tests.test_agent_machine_mode.AgentMachineModeTests.test_wait_for_run_terminal_status_does_not_auto_approve_owner_mismatch`
  - `server_modules.tests.test_agent_machine_mode.AgentMachineModeTests.test_wait_for_run_terminal_status_does_not_auto_approve_workflow_human_node`

### 2026-04-05 - WhatsApp Transport And Connector Matching Moved Behind Service Registry

#### Stage

Stage 3 connector-monolith reduction continues. The remaining WhatsApp transport and connector-matching slice no longer lives as inline implementation inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is another bounded ownership cut, not a behavior rewrite. The webhook flow, run-dispatch flow, and runtime state flow keep their current semantics, but they now consume service-owned transport and connector matching.

#### Completed Work

- Added [server_modules/connectors/whatsapp_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_transport_service.py) with:
  - WhatsApp number normalization
  - TwiML response rendering
  - Twilio Messages API send behavior
- Expanded [server_modules/connectors/whatsapp_autopilot_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_state_service.py) with:
  - connector matching against inbound account/from/to data
  - `connectors_seen` mutation at the service boundary
- Updated [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py) so the registry now owns:
  - lazy transport-service creation
  - transport injection into webhook and run-dispatch services
  - state-service-backed connector matching
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so these wrappers now delegate instead of owning implementation inline:
  - `_normalize_whatsapp_number()`
  - `_whatsapp_twiml()`
  - `_twilio_send_whatsapp_message()`
  - `_whatsapp_connector_match()`
- Added focused coverage in:
  - [server_modules/tests/test_whatsapp_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_transport_service.py)
  - [server_modules/tests/test_whatsapp_autopilot_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_autopilot_state_service.py)
  - [server_modules/tests/test_whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_autopilot_service_registry.py)

#### Current Truth

- WhatsApp transport concerns now have a dedicated service boundary instead of living in the connector monolith.
- WhatsApp connector matching now lives in the state service where connector enumeration and vault-backed resolution already belong.
- The webhook layer still enters through [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), but the remaining WhatsApp-specific implementation there is thinner than before.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2382` lines to `2312` lines in this cut.

#### Open Gaps

- The monolith still owns shared runtime/event helpers such as channel-event recording, dead-letter writes, and mixed Telegram/WhatsApp glue.
- Some remaining WhatsApp wrappers still live in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) even though the underlying ownership is now externalized.
- The channel layer is thinner, but the final target is still a composition shell rather than a behavior-heavy module.

#### Next Required Work

1. Continue shrinking [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining shared channel-event and dead-letter helper block.
2. Keep connector wiring in registries and keep runtime state or transport behavior out of the monolith.
3. Preserve focused service-level tests for each extracted connector slice instead of falling back to only broad integration coverage.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/whatsapp_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_transport_service.py)
  - [server_modules/connectors/whatsapp_autopilot_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_state_service.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_transport_service`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`

### 2026-04-05 - Shared Telegram And WhatsApp Run Entry Flow Moved Behind Run Entry Service

#### Stage

Stage 2 connector convergence continues. The shared Telegram/WhatsApp run-entry and machine-trust helper block no longer lives inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a shared runtime-bridge cut, not a channel-parser cut. The public wrappers still exist, but run metadata assembly, owner inheritance, route application, run-start event emission, and wait-auto-approval logic now belong to a dedicated service instead of the connector monolith.

#### Completed Work

- Added [server_modules/connectors/autopilot_run_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_run_entry_service.py).
- Moved shared run-entry ownership behind that service:
  - Telegram run creation metadata assembly
  - WhatsApp run creation metadata assembly
  - owner-user inheritance for agent machine mode
  - full-trust run detection
  - pending confirmation payload resolution
  - wait auto-approval eligibility logic
  - route application and run-start event emission
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so these wrappers now delegate through the new service:
  - `_create_telegram_run()`
  - `_create_whatsapp_run()`
  - `_agent_machine_owned_entrypoint_owner_user_id()`
  - `_agent_machine_full_trust_for_run()`
  - `_pending_confirmation_payload()`
  - `_autopilot_can_auto_approve_wait()`
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_run_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_run_entry_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2552` lines to `2382` lines in this cut.
- The connector monolith no longer owns the shared Telegram/WhatsApp run-entry implementation inline.
- Machine-mode wrapper compatibility is still preserved through the existing public helper names, but the underlying ownership is now service-based.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns remaining shared connector/runtime bridge logic such as WhatsApp connector matching and some top-level webhook/runtime helpers.
- The shared run-entry service is still injected from monolith-owned wrappers rather than from a broader canonical runtime composition layer.
- The broader connector architecture still needs more explicit thin-adapter boundaries around the remaining non-service helper blocks.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining shared connector-selection and webhook/runtime bridge helpers.
2. Decide whether `_whatsapp_connector_match()` or the remaining endpoint-level webhook/runtime helpers are the strongest next boundary cut.
3. Keep verifying new service boundaries directly, and keep wrapper-level machine-mode checks in place where the public compatibility surface still matters.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_run_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_run_entry_service.py)
  - [server_modules/tests/test_autopilot_run_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_run_entry_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_run_entry_service`
  - `server_modules.tests.test_agent_machine_mode.AgentMachineModeTests.test_telegram_autopilot_run_inherits_machine_owner`
  - `server_modules.tests.test_agent_machine_mode.AgentMachineModeTests.test_whatsapp_autopilot_run_inherits_machine_owner`
  - `server_modules.tests.test_agent_machine_mode.AgentMachineModeTests.test_wait_for_run_terminal_status_auto_approves_matching_owner_confirmation`
  - `server_modules.tests.test_agent_machine_mode.AgentMachineModeTests.test_wait_for_run_terminal_status_does_not_auto_approve_owner_mismatch`
  - `server_modules.tests.test_agent_machine_mode.AgentMachineModeTests.test_wait_for_run_terminal_status_does_not_auto_approve_workflow_human_node`

### 2026-04-05 - Telegram Terminal Send And Autopilot Test Flow Moved Behind Terminal Service

#### Stage

Stage 2 connector convergence continues. The Telegram terminal send entrypoint and the Telegram autopilot test entrypoint no longer live inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is an endpoint/runtime coordination cut. The shared run backend is still injected from the existing `_create_telegram_run()` and `_wait_for_run_terminal_status()` helpers, but the connector selection, profile routing, direct-skill short-circuiting, and terminal send/test orchestration are now owned by a dedicated service instead of the monolith.

#### Completed Work

- Added [server_modules/connectors/telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_terminal_service.py).
- Moved Telegram terminal send behavior behind that service:
  - connector selection by workspace/session/chat
  - credential resolution and chat targeting
  - outbound terminal send orchestration
  - connector state patching after terminal sends
- Moved Telegram autopilot test behavior behind that service:
  - connector selection by workspace/chat/connector id
  - profile resolution and routing
  - connector-context and installed-skill prompt shaping
  - direct-response short-circuiting
  - run creation handoff and terminal wait/result shaping
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so both async Telegram terminal entrypoints now delegate to the terminal service instead of owning those flows inline.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_terminal_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2728` lines to `2552` lines in this cut.
- The monolith no longer owns the full Telegram terminal send/test orchestration path inline.
- The remaining mass is increasingly concentrated in shared runtime glue and the still-shared run creation helpers rather than in terminal-facing endpoint logic.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns too much shared connector/runtime bridge logic.
- `_create_telegram_run()` and other shared run-entry helpers still live in the monolith because they are still coupled to machine-mode and run metadata behavior.
- The broader connector architecture still needs more explicit thin-adapter boundaries across the remaining shared runtime helpers.

#### Next Required Work

1. Keep reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining shared connector-selection and runtime bridge helpers.
2. Decide when `_create_telegram_run()` should move behind a more general run-entry service without destabilizing the machine-mode path.
3. Continue verifying extracted terminal/runtime services with focused suites even when the broader imported-runtime test stack is noisy or slow to exit.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_terminal_service.py)
  - [server_modules/tests/test_telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_terminal_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`

### 2026-04-05 - Telegram Transport And Approval Flow Moved Behind Shared Services

#### Stage

Stage 2 connector convergence continues. The Telegram transport block and the approval-query/notification block no longer live inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a shared-runtime cut rather than a channel-specific parser cut. The Telegram entrypoints and service registries keep the same contracts, but the monolith no longer owns the HTTP transport semantics or the approval notification/text logic inline.

#### Completed Work

- Added [server_modules/connectors/telegram_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_transport_service.py).
- Moved the Telegram transport helpers behind that service:
  - raw Telegram API request handling
  - outbound message send behavior
  - outbound chat-action behavior
  - outbound edit-message behavior
  - dead-letter and channel-event recording for transport operations
- Added [server_modules/connectors/autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py).
- Moved the approval helpers behind that service:
  - pending approval listing
  - approval resolution
  - approval text rendering
  - approval result text rendering
  - Telegram pending-approval notification patch calculation
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the old inline transport and approval helpers now delegate through service getters instead of owning those implementations.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_transport_service.py)
  - [server_modules/tests/test_autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_approval_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `2903` lines to `2728` lines in this cut.
- The connector monolith now delegates:
  - Telegram transport
  - approval list/resolve/text
  - approval notification patching
  through dedicated services instead of carrying those blocks inline.
- The remaining monolith mass is increasingly transport/composition glue and top-level channel entrypoint wiring, not large helper subsystems.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns too much top-level endpoint/runtime coordination.
- Terminal send/test entrypoints and some shared connector selection logic still live in the monolith.
- The broader connector architecture still needs more explicit thin-adapter boundaries across the remaining non-Telegram and non-WhatsApp helper surfaces.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining top-level endpoint/runtime coordination helpers.
2. Decide whether the next strongest cut is terminal send/test handling or the remaining shared connector-selection/runtime bridge logic.
3. Keep verifying both new service tests and the existing Telegram action/run tests so extracted runtime contracts stay stable.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_transport_service.py)
  - [server_modules/connectors/autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_approval_service.py)
  - [server_modules/tests/test_telegram_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_transport_service.py)
  - [server_modules/tests/test_autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_approval_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_approval_service`
  - `server_modules.tests.test_telegram_transport_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`

### 2026-04-05 - Channel Support Helpers Moved Behind Dedicated Support Service

#### Stage

Stage 2 connector convergence continues. Shared channel-formatting and session-key helpers no longer live as duplicated inline helper bodies inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a real ownership cut, not a rename pass. Telegram and WhatsApp registry wiring now consume one support service for error classification, timestamp formatting, session/trace keys, run-meta toggles, log formatting, and one-line text truncation.

#### Completed Work

- Added [server_modules/connectors/autopilot_channel_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_support_service.py) to own:
  - autopilot error categorization
  - ISO timestamp rendering from epoch values
  - Telegram autopilot log formatting
  - Telegram session-key and trace-id construction
  - WhatsApp session-key construction
  - single-line text truncation
  - run-metadata include flag parsing
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - Telegram autopilot service-registry wiring now calls the channel-support service for shared channel helpers
  - WhatsApp autopilot service-registry wiring now calls the channel-support service for shared channel helpers
  - helper, approval, runtime-support, transport, terminal, and run-entry service construction now use the channel-support service for shared text/session behavior
  - dead duplicate helper bodies were removed from the monolith after all internal references were rewired

#### Current Truth

- Shared channel helper ownership is now explicit in [server_modules/connectors/autopilot_channel_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_support_service.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exposes the live compatibility surface, but it no longer owns the duplicated channel helper block for classify/format/session/truncate/meta behavior.
- Event recording wrappers remain inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) because the current test surface still exercises them there.
- Terminal-compatibility wrappers also remain in place where external tests import them directly.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `1095` lines from `1131` before this cut.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns event/dead-letter wrapper glue and some remaining top-level adapter composition.
- The shared event helper surface is still monolith-local even though the formatting/session layer is now separated.
- More reduction is still needed before the file is only thin adapter and compatibility glue.

#### Next Required Work

1. Decide whether the next bounded cut is channel event/dead-letter ownership or another remaining adapter-composition cluster in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
2. Keep preserving externally imported compatibility wrappers until their test and call surface is moved behind stable services.
3. Continue using the focused Telegram, WhatsApp, and terminal suites as the regression gate for each extraction.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_channel_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_channel_support_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_telegram_autopilot_helper_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_autopilot_workflow_setup_service`

### 2026-04-05 - Event Wrapper Band Moved Behind Dedicated Event Bridge Service

#### Stage

Stage 2 connector convergence continues. The channel event/dead-letter runtime-init bridge no longer lives as owned inline logic inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This cut also repaired a real baseline regression in the terminal dedupe path. The previous wrapper flow could fail when `_init()` was patched out because service wiring still referenced `_normalize_workspace_id` directly with no local fallback.

#### Completed Work

- Added [server_modules/connectors/autopilot_event_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_event_bridge_service.py) to own:
  - runtime-init bridging before event persistence calls
  - channel-event forwarding
  - dead-letter forwarding
  - throttled-event forwarding with callback passthrough for compatibility wrappers
- Expanded [server_modules/connectors/autopilot_event_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_event_service.py) so throttled event recording can use an injected record callback when the compatibility wrapper surface needs to stay observable in tests.
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - Telegram and WhatsApp registry wiring now consumes the event bridge service directly for event and dead-letter operations
  - the module-level `_record_channel_event*` wrappers now delegate through the event bridge instead of owning the runtime-init body inline
  - service wiring now uses a local workspace-normalization fallback instead of assuming `_normalize_workspace_id` is always available from a booted server import
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_event_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_event_bridge_service.py)
  - [server_modules/tests/test_autopilot_event_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_event_service.py)

#### Current Truth

- Event bridge ownership is now explicit in [server_modules/connectors/autopilot_event_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_event_bridge_service.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports the event wrapper names for compatibility, but their implementation body now crosses the dedicated bridge service first.
- The previously failing terminal dedupe regression is fixed:
  - [scripts/orion_terminal/tests/test_autopilot_event_dedupe.py](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/tests/test_autopilot_event_dedupe.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now `1118` lines versus `1095` after the previous cut.
  This increase is expected for this step because the file now carries fallback-safe normalization and keeps externally imported compatibility wrappers while moving the owned runtime-init/event bridge logic behind a dedicated service.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns too much top-level adapter composition and compatibility-export surface.
- The compatibility wrapper names are still module-local and should only disappear after their external test/import surface is intentionally migrated.
- More composition cuts are still needed before this file becomes only thin runtime/export glue.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting another remaining adapter-composition cluster instead of only shuffling wrappers.
2. Keep preserving wrapper names that the terminal and connector tests import directly until those contracts are moved deliberately.
3. Keep including [scripts/orion_terminal/tests/test_autopilot_event_dedupe.py](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/tests/test_autopilot_event_dedupe.py) in the regression suite, because it caught a real broken path that the previous focused suite missed.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_event_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_event_service.py)
  - [server_modules/connectors/autopilot_event_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_event_bridge_service.py)
  - [server_modules/tests/test_autopilot_event_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_event_service.py)
  - [server_modules/tests/test_autopilot_event_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_event_bridge_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_event_service`
  - `server_modules.tests.test_autopilot_event_bridge_service`
  - `scripts.orion_terminal.tests.test_autopilot_event_dedupe`
  - `server_modules.tests.test_autopilot_shared_service_registry`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_telegram_transport_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_terminal_service`

### 2026-04-05 - Terminal And Status Wrapper Band Moved Behind Dedicated Terminal Bridge Service

#### Stage

Stage 2 connector convergence continues. The Telegram terminal entrypoint shell and the shared status/profile wrapper band no longer own their runtime-init and delegation body inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is still a real ownership cut even though the monolith did not shrink. The public wrapper names remain exported for compatibility, but their implementation body now crosses a dedicated terminal bridge service first.

#### Completed Work

- Added [server_modules/connectors/autopilot_terminal_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_terminal_bridge_service.py) to own:
  - runtime-init bridging for Telegram terminal send/test entrypoints
  - runtime-init bridging for Telegram supervisor start
  - runtime-init bridging for Telegram and WhatsApp autopilot status payloads
  - runtime-init bridging for autopilot profile-list payloads
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `handle_telegram_send_message()` now delegates through the terminal bridge
  - `handle_telegram_autopilot_test_message()` now delegates through the terminal bridge
  - `_run_telegram_autopilot_forever()` now delegates through the terminal bridge
  - `handle_telegram_autopilot_status()` now delegates through the terminal bridge
  - `handle_whatsapp_autopilot_status()` now delegates through the terminal bridge
  - `handle_list_autopilot_profiles()` now delegates through the terminal bridge
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_terminal_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_terminal_bridge_service.py)

#### Current Truth

- Terminal/status wrapper ownership is now explicit in [server_modules/connectors/autopilot_terminal_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_terminal_bridge_service.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports the public compatibility entrypoints, but it no longer owns their runtime-init/delegation body inline.
- The outer execution graph still passes through the public Telegram send entrypoint after this cut:
  - [server_modules/tests/test_runs_execution_graph.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runs_execution_graph.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now `1126` lines versus `1118` after the previous cut.
  This increase is expected because the compatibility wrappers remain exported while the new bridge factory and service wiring were added.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns substantial top-level composition and compatibility glue.
- The WhatsApp webhook wrapper band is still inline and could become the next bounded runtime-init bridge extraction.
- More service-composition cuts are still needed before the file is only thin adapter/export glue.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting another runtime-init wrapper or composition cluster with a real ownership boundary.
2. Keep verifying outer call sites, not only service tests, whenever public wrapper entrypoints move behind bridge services.
3. Preserve exported compatibility function names until the rest of the codebase stops importing them directly.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_terminal_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_terminal_bridge_service.py)
  - [server_modules/tests/test_autopilot_terminal_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_terminal_bridge_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_terminal_bridge_service`
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_runs_execution_graph -k launch_gate_connector_triage_workflow`

### 2026-04-05 - Autopilot State And Runtime Helper Band Moved Behind Dedicated State Bridge Service

#### Stage

Stage 2 connector convergence continues. The autopilot state/runtime helper band above `_init()` no longer owns its load/snapshot/activate/runtime-counter/start-state logic inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is another ownership cut with compatibility wrappers intentionally preserved. The exported helper names still exist for the rest of the runtime, but their implementation body now crosses a dedicated state bridge service first.

#### Completed Work

- Added [server_modules/connectors/autopilot_state_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_state_bridge_service.py) to own:
  - Telegram autopilot state loading
  - WhatsApp autopilot state loading
  - Telegram and WhatsApp snapshot access with connector payloads
  - WhatsApp autopilot activation
  - Telegram processed-update incrementing
  - Telegram connector-count updates
  - Telegram start-state mutation
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_load_telegram_autopilot_state()` now delegates through the state bridge
  - `_load_whatsapp_autopilot_state()` now delegates through the state bridge
  - `_telegram_autopilot_snapshot()` now delegates through the state bridge
  - `_whatsapp_autopilot_snapshot()` now delegates through the state bridge
  - `_whatsapp_autopilot_activate()` now delegates through the state bridge
  - `_telegram_increment_processed_updates()` now delegates through the state bridge
  - `_telegram_set_connectors_seen()` now delegates through the state bridge
  - `_mark_telegram_autopilot_started()` now delegates through the state bridge
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_state_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_state_bridge_service.py)

#### Current Truth

- State/runtime helper ownership is now explicit in [server_modules/connectors/autopilot_state_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_state_bridge_service.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports the historical helper names used by runtime startup, health, and connector orchestration code, but it no longer owns their load/snapshot/mutation body inline.
- The public consumers that rely on those wrappers still pass after this cut:
  - [server_modules/tests/test_autopilot_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_status_service.py)
  - [server_modules/tests/test_runs_execution_graph.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runs_execution_graph.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now `1138` lines versus `1126` after the previous cut.
  This increase is expected because the wrapper names remain exported while the new cached bridge service was added.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns too much top-level composition and compatibility glue.
- The remaining inline compatibility-wrapper band still includes event wrappers, Telegram helper shims, and the WhatsApp webhook shell.
- More service-composition reductions are still needed before the module becomes only thin adapter/export glue.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting another bounded compatibility-wrapper or composition cluster with real service ownership.
2. Keep verifying public consumers like health/runtime startup and execution-graph entrypoints whenever wrapper helpers move behind bridge services.
3. Leave wrapper names in place until the rest of the codebase stops importing them directly.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_state_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_state_bridge_service.py)
  - [server_modules/tests/test_autopilot_state_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_state_bridge_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_state_bridge_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_telegram_autopilot_runtime_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_runs_execution_graph -k launch_gate_connector_triage_workflow`

### 2026-04-05 - Telegram Compatibility Shim Band Moved Behind Dedicated Compatibility Bridge Service

#### Stage

Stage 2 connector convergence continues. The Telegram compatibility shim band near the bottom of [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) no longer owns its direct delegation logic inline.

This is a compatibility-surface extraction, not a behavior rewrite. The historical helper names still remain exported because terminal tests and runtime imports call them directly, but their implementation body now crosses a dedicated compatibility bridge service first.

#### Completed Work

- Added [server_modules/connectors/telegram_compatibility_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_compatibility_bridge_service.py) to own delegation for:
  - Telegram safe-path token rendering
  - goal building with chat profile context
  - workspace connector-context assembly
  - Telegram message extraction
  - goal building with media attachments
  - Telegram routing
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_telegram_safe_path_token()` now delegates through the compatibility bridge
  - `_telegram_build_goal_with_profile()` now delegates through the compatibility bridge
  - `_telegram_workspace_connector_context()` now delegates through the compatibility bridge
  - `_telegram_extract_message()` now delegates through the compatibility bridge
  - `_telegram_build_goal_with_attachments()` now delegates through the compatibility bridge
  - `_telegram_route_message()` now delegates through the compatibility bridge
- Added focused coverage in:
  - [server_modules/tests/test_telegram_compatibility_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_compatibility_bridge_service.py)

#### Current Truth

- Compatibility shim ownership is now explicit in [server_modules/connectors/telegram_compatibility_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_compatibility_bridge_service.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports the historical Telegram helper names because terminal and runtime call sites still import them directly.
- The terminal-facing wrapper consumers still pass after this cut:
  - [scripts/orion_terminal/tests/test_telegram_autopilot_profile_commands.py](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/tests/test_telegram_autopilot_profile_commands.py)
  - [scripts/orion_terminal/tests/test_telegram_connector_context.py](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/tests/test_telegram_connector_context.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now `1164` lines versus `1138` after the previous cut.
  This increase is expected because the bridge factory and service wiring were added while the compatibility wrapper exports remain in place.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns a large amount of top-level composition and compatibility glue.
- The WhatsApp webhook shell and remaining bridge/wrapper exports are still inline.
- More extractions are still needed before the file becomes only thin adapter/export glue.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting another bounded compatibility-wrapper or composition cluster.
2. Keep validating both terminal-facing wrapper tests and the underlying Telegram service suites whenever compatibility shims move behind bridge services.
3. Preserve exported shim names until the rest of the codebase stops importing them directly.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_compatibility_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_compatibility_bridge_service.py)
  - [server_modules/tests/test_telegram_compatibility_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_compatibility_bridge_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_compatibility_bridge_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_profile_service`

### 2026-04-05 - WhatsApp Webhook Shell Moved Behind Dedicated Webhook Bridge Service

#### Stage

Stage 2 connector convergence continues. The top-level WhatsApp Twilio webhook shell no longer owns request parsing, secret selection, endpoint-service dispatch, and response shaping inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a bounded runtime-bridge extraction. The exported async webhook entrypoint stays in place, but its owned request-handling body now crosses a dedicated webhook bridge service first.

#### Completed Work

- Added [server_modules/connectors/whatsapp_webhook_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_webhook_bridge_service.py) to own:
  - runtime-init bridging for the webhook path
  - form-urlencoded request parsing
  - configured/provided secret selection
  - autopilot endpoint-service webhook dispatch
  - forbidden-response shaping
  - TwiML success-response shaping
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so `handle_whatsapp_twilio_webhook()` now delegates through the webhook bridge service instead of owning that request-handling body inline.
- Added focused coverage in:
  - [server_modules/tests/test_whatsapp_webhook_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_webhook_bridge_service.py)

#### Current Truth

- WhatsApp webhook-shell ownership is now explicit in [server_modules/connectors/whatsapp_webhook_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_webhook_bridge_service.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports `handle_whatsapp_twilio_webhook()` for runtime compatibility, but it no longer owns the request parsing and response-shaping body inline.
- The underlying endpoint, webhook-service, and transport layers still pass after this cut:
  - [server_modules/tests/test_autopilot_endpoint_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_endpoint_service.py)
  - [server_modules/tests/test_whatsapp_webhook_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_webhook_service.py)
  - [server_modules/tests/test_whatsapp_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_transport_service.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now `1170` lines versus `1164` after the previous cut.
  This increase is expected because the exported webhook entrypoint remains while the new cached bridge service was added.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the large service-composition block and several exported compatibility wrappers.
- The remaining inline wrapper surface is now mostly compatibility and service-factory glue rather than owned runtime behavior.
- More consolidation is still needed before the file is reduced to thin adapter/export glue only.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by targeting another real ownership cluster in the remaining service-composition surface.
2. Keep verifying public wrapper entrypoints and the underlying service tests together whenever runtime-init bridges move out of the monolith.
3. Preserve exported runtime entrypoints until their import surface is intentionally migrated.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/whatsapp_webhook_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_webhook_bridge_service.py)
  - [server_modules/tests/test_whatsapp_webhook_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_webhook_bridge_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_webhook_bridge_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_whatsapp_transport_service`

### 2026-04-05 - Support-Service Composition Moved Behind Dedicated Support Registry

#### Stage

Stage 2 connector convergence continues. The lazy-construction block for shared support services no longer owns its caching/composition logic inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a real composition cut, not just another wrapper bridge. The top-level helper getters still exist, but the service construction and caching for profile, runtime-status, workflow-setup, connector-context, approval, common-support, skill, and channel-support helpers now belong to a dedicated support registry.

#### Completed Work

- Added [server_modules/connectors/autopilot_support_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_service_registry.py) to own lazy construction and caching for:
  - autopilot profile service
  - runtime status service
  - workflow setup service
  - Telegram connector-context service
  - autopilot approval service
  - common support service
  - skill service
  - channel support service
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_autopilot_profile_service()` now delegates through the support registry
  - `_runtime_status_service()` now delegates through the support registry
  - `_autopilot_workflow_setup_service()` now delegates through the support registry
  - `_telegram_connector_context_service()` now delegates through the support registry
  - `_autopilot_approval_service()` now delegates through the support registry
  - `_autopilot_common_support_service()` now delegates through the support registry
  - `_autopilot_skill_service()` now delegates through the support registry
  - `_autopilot_channel_support_service()` now delegates through the support registry
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_support_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_support_service_registry.py)

#### Current Truth

- Shared support-service composition is now explicit in [server_modules/connectors/autopilot_support_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_service_registry.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports the historical getter functions, but it no longer owns the multi-service lazy-construction bodies inline.
- The extracted service families still pass their focused suites after moving behind the support registry:
  - [server_modules/tests/test_autopilot_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_profile_service.py)
  - [server_modules/tests/test_runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runtime_status_service.py)
  - [server_modules/tests/test_autopilot_workflow_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_workflow_setup_service.py)
  - [server_modules/tests/test_telegram_connector_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_connector_context_service.py)
  - [server_modules/tests/test_autopilot_approval_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_approval_service.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now `1174` lines versus `1170` after the previous cut.
  This slight increase is expected because the new support-registry factory was added while the historical getter names remain exported.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns a large amount of registry wiring and adapter composition for Telegram and WhatsApp runtime construction.
- The remaining inline surface is now more dominated by service-registry assembly than by standalone helper logic.
- More reduction is still needed before the file becomes only thin composition/export glue.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by targeting a remaining registry/composition cluster, not just individual wrappers.
2. Keep verifying the extracted service families directly whenever their construction path moves behind a new registry.
3. Preserve the existing helper getter names until their callers stop importing them directly.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_support_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_support_service_registry.py)
  - [server_modules/tests/test_autopilot_support_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_support_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_support_service_registry`
  - `server_modules.tests.test_autopilot_profile_service`
  - `server_modules.tests.test_runtime_status_service`
  - `server_modules.tests.test_autopilot_workflow_setup_service`
  - `server_modules.tests.test_telegram_connector_context_service`
  - `server_modules.tests.test_autopilot_approval_service`

### 2026-04-05 - Runtime And Transport Composition Moved Behind Dedicated Runtime Registry

#### Stage

Stage 2 connector convergence continues. The lazy-construction block for connector support, Telegram transport, Telegram terminal, run-entry, runtime-support, and menu services no longer owns its caching/composition logic inline inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a real composition cut. The getter functions still exist, but the build-and-cache ownership for that runtime stack now belongs to a dedicated runtime registry.

#### Completed Work

- Added [server_modules/connectors/autopilot_runtime_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_service_registry.py) to own lazy construction and caching for:
  - Telegram connector support service
  - Telegram transport service
  - Telegram terminal service
  - autopilot run-entry service
  - autopilot runtime-support service
  - Telegram menu service
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_telegram_connector_support_service()` now delegates through the runtime registry
  - `_telegram_transport_service()` now delegates through the runtime registry
  - `_telegram_terminal_service()` now delegates through the runtime registry
  - `_autopilot_run_entry_service()` now delegates through the runtime registry
  - `_autopilot_runtime_support_service()` now delegates through the runtime registry
  - `_telegram_menu_service()` now delegates through the runtime registry
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_runtime_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_runtime_service_registry.py)

#### Current Truth

- Runtime/transport composition is now explicit in [server_modules/connectors/autopilot_runtime_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_service_registry.py).
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still exports the historical runtime getter names, but it no longer owns the multi-service build-and-cache bodies inline.
- The extracted runtime stack still passes its focused suites after moving behind the runtime registry:
  - [server_modules/tests/test_telegram_transport_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_transport_service.py)
  - [server_modules/tests/test_telegram_terminal_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_terminal_service.py)
  - [server_modules/tests/test_autopilot_runtime_support_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_runtime_support_service.py)
  - [server_modules/tests/test_whatsapp_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_run_dispatch_service.py)
  - [server_modules/tests/test_telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_service_registry.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now `1190` lines versus `1174` after the previous cut.
  This increase is expected because the runtime-registry factory was added while the historical getter names remain exported.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the largest registry-assembly blocks for Telegram and WhatsApp service graphs.
- The remaining inline surface is now mostly service-registry assembly and exported compatibility glue rather than standalone helper logic.
- More reduction is still needed before the module becomes only thin composition/export glue.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by targeting one of the remaining service-graph assembly blocks, not another one-off wrapper.
2. Keep verifying the runtime-facing suites directly whenever construction paths move behind a registry.
3. Preserve the getter names until the rest of the codebase stops importing them directly.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_runtime_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_runtime_service_registry.py)
  - [server_modules/tests/test_autopilot_runtime_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_runtime_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_runtime_service_registry`
  - `server_modules.tests.test_telegram_transport_service`
  - `server_modules.tests.test_telegram_terminal_service`
  - `server_modules.tests.test_autopilot_runtime_support_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`

### 2026-04-05 - Ledger Ordering Correction For Connector Context And Guided Workflow Setup Cut

#### Stage

Stage 2 connector convergence continues.

This entry exists to preserve append-only ordering. The full factual entry for the connector-context and guided-workflow-setup extraction already exists earlier in this file, but it landed out of sequence during editing. This note records the same milestone at the end of the ledger without deleting earlier history.

#### Current Truth

- [server_modules/connectors/telegram_connector_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_connector_context_service.py) now owns Telegram connector-context and installed-skill query helpers.
- [server_modules/connectors/autopilot_workflow_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_workflow_setup_service.py) now owns guided automation workflow-setup helpers.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `3261` lines to `2903` lines in that cut.

#### Verification

- `python3 -m py_compile` passed for the extracted services and updated connector module.
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_connector_context_service`
  - `server_modules.tests.test_autopilot_workflow_setup_service`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`

### 2026-04-05 - Connector Context And Guided Workflow Setup Moved Behind Shared Connector Services

#### Stage

Stage 2 connector convergence continues. The shared Telegram connector-context helpers and the guided automation workflow-setup block no longer live inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a real monolith-reduction cut, not just wiring. The top-level connector module still exposes compatibility wrappers, but the helper ownership for connector-aware goal shaping, installed-skill query handling, workflow-definition creation, and guided automation setup now belongs to dedicated services.

#### Completed Work

- Added [server_modules/connectors/telegram_connector_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_connector_context_service.py).
- Moved the Telegram connector-context helpers behind that service:
  - connector capability summaries
  - recent-email request detection
  - workspace connector discovery and prompt assembly
  - connector-context goal append behavior
  - installed-skill query fallback behavior
- Added [server_modules/connectors/autopilot_workflow_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_workflow_setup_service.py).
- Moved the guided automation workflow-setup helpers behind that service:
  - workspace connector-flag discovery
  - primary email connector selection
  - email-summary workflow definition and visibility creation
  - lead-follow-up workflow definition and visibility creation
  - schedule creation for both workflow types
  - completion text rendering
  - guided automation setup delegation into the Telegram camera-setup service
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the old inline helper block now delegates through service getters instead of owning those implementations.
- Added focused service coverage in:
  - [server_modules/tests/test_telegram_connector_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_connector_context_service.py)
  - [server_modules/tests/test_autopilot_workflow_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_workflow_setup_service.py)

#### Current Truth

- Telegram connector behavior is now split further into dedicated service boundaries for:
  - inbound context
  - routing
  - profile/onboarding
  - guided camera setup
  - media handling
  - run dispatch
  - poll lifecycle
  - runtime state
  - connector context and installed-skill query bridging
  - guided workflow setup
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) dropped from `3261` lines to `2903` lines in this cut.
- The connector monolith is still not finished, but one of the biggest remaining shared helper blocks is now service-owned instead of inline.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns too much shared transport and composition glue.
- The remaining helper mass is increasingly concentrated in top-level endpoint/runtime coordination instead of bounded Telegram behavior.
- The broader connector architecture still needs more explicit thin-adapter boundaries across the non-Telegram and non-WhatsApp surfaces.

#### Next Required Work

1. Keep reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining shared transport and composition helpers.
2. Decide whether the next strongest cut is the shared connector endpoint/runtime glue or a broader split of the remaining non-Telegram channel helpers.
3. Continue verifying against both direct service tests and the older terminal Telegram connector-context tests so the extracted contracts stay stable.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_connector_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_connector_context_service.py)
  - [server_modules/connectors/autopilot_workflow_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_workflow_setup_service.py)
  - [server_modules/tests/test_telegram_connector_context_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_connector_context_service.py)
  - [server_modules/tests/test_autopilot_workflow_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_workflow_setup_service.py)
  - [scripts/orion_terminal/tests/test_telegram_connector_context.py](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/orion_terminal/tests/test_telegram_connector_context.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_connector_context_service`
  - `server_modules.tests.test_autopilot_workflow_setup_service`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`

### 2026-04-05 - Telegram Autopilot Service Graph Moved Behind Dedicated Registry

#### Stage

Stage 2 connector convergence continues. The Telegram autopilot service-construction graph no longer lives inline as a long lazy-factory block inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a composition-layer cut, not a new behavior surface. The live Telegram entrypoints and runtime behavior remain the same, but the monolith no longer owns most of the Telegram dependency graph inline.

#### Completed Work

- Added [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py) as the dedicated registry for Telegram lazy service construction and caching.
- Moved the Telegram service graph behind the registry:
  - run dispatch
  - autopilot state
  - runtime mutation
  - sender filtering
  - non-run action handling
  - inbound context assembly
  - poll-cycle orchestration
  - poll dispatch
  - poll state updates
  - run-action handling
  - connector polling
  - autopilot supervisor loop
- Reduced [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the Telegram service helpers are now thin wrappers around the registry instead of owning full constructor bodies inline.
- Added focused registry coverage in:
  - [server_modules/tests/test_telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_service_registry.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns shared autopilot exports, endpoint wrappers, and some WhatsApp/shared runtime glue.
- The Telegram service graph is now centered in [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py).
- The monolith is now down to `3354` lines from `3470` before this registry cut.

#### Open Gaps

- The WhatsApp service-composition block still lives inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- Shared autopilot endpoint/status wiring still lives partly in the monolith.
- Telegram eager service bootstrapping for profile/media/routing still remains local to the file even though the lazy service graph is now externalized.

#### Next Required Work

1. Decide whether the next clean cut is a matching WhatsApp registry/composition extraction or a smaller shared autopilot composition module for endpoint/status/runtime glue.
2. Keep reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by ownership block, not by isolated helper edits.
3. Preserve the existing focused connector suite as the gate for each composition-layer move.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_connector_poll_service`
  - `server_modules.tests.test_telegram_autopilot_supervisor_service`
  - `server_modules.tests.test_telegram_autopilot_runtime_service`
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - WhatsApp Autopilot Service Graph Moved Behind Dedicated Registry

#### Stage

Stage 2 connector convergence continues. The WhatsApp autopilot service-construction graph no longer lives inline as separate lazy-factory blocks inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is the WhatsApp-side match to the Telegram registry cut. Runtime behavior stays the same, but the monolith now delegates the WhatsApp dependency graph through one registry instead of owning each constructor body inline.

#### Completed Work

- Added [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py) as the dedicated registry for WhatsApp lazy service construction and caching.
- Moved the WhatsApp service graph behind the registry:
  - autopilot state
  - run dispatch
  - webhook dispatch
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_whatsapp_autopilot_state_service()` now delegates to the registry
  - `_whatsapp_run_dispatch_service()` now delegates to the registry
  - `_whatsapp_webhook_service()` now delegates to the registry
- Added focused coverage in:
  - [server_modules/tests/test_whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_autopilot_service_registry.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns shared autopilot exports, endpoint wrappers, status wiring, and the eager Telegram profile/media/routing bootstrap objects.
- Both channel-side lazy service graphs are now externalized:
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `3331` lines from `3354` before this cut.

#### Open Gaps

- Shared autopilot endpoint/status composition still lives inline in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- The eager Telegram helper objects for profile/media/routing are still bootstrapped directly in the monolith.
- Channel-independent autopilot helper glue is still mixed with endpoint exports in one file.

#### Next Required Work

1. Reduce the remaining shared endpoint/status composition in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
2. Decide whether the next clean cut is a shared autopilot composition module or extraction of the eager Telegram helper bootstrap objects.
3. Keep the full focused connector suite as the gate for every remaining monolith reduction.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_autopilot_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_connector_poll_service`
  - `server_modules.tests.test_telegram_autopilot_supervisor_service`
  - `server_modules.tests.test_telegram_autopilot_runtime_service`
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - Shared Endpoint Wiring And Telegram Helper Bootstraps Moved Behind Registries

#### Stage

Stage 2 connector convergence continues. The remaining shared endpoint/status composition and the eager Telegram helper singletons no longer live inline as direct service ownership inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This is a composition-layer cleanup that removes more container-style ownership from the monolith. Runtime behavior stays the same, but shared wiring and helper bootstrapping now cross dedicated registries first.

#### Completed Work

- Added [server_modules/connectors/autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_shared_service_registry.py) to own:
  - `AutopilotStatusService` lazy construction and caching
  - `AutopilotEndpointService` lazy construction and caching
- Added [server_modules/connectors/telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_helper_registry.py) to own:
  - `TelegramProfileService`
  - `TelegramCameraSetupService`
  - `TelegramMediaService`
  - `TelegramRoutingService`
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_autopilot_status_service()` now delegates to the shared registry
  - `_autopilot_endpoint_service()` now delegates to the shared registry
  - Telegram profile/onboarding wrappers now delegate through the helper registry
  - Telegram camera-setup wrappers now delegate through the helper registry
  - Telegram media wrappers now delegate through the helper registry
  - Telegram routing wrappers now delegate through the helper registry
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_shared_service_registry.py)
  - [server_modules/tests/test_telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_helper_registry.py)

#### Current Truth

- Both channel-side lazy service graphs are externalized:
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
- Shared endpoint/status composition is externalized:
  - [server_modules/connectors/autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_shared_service_registry.py)
- The eager Telegram helper bootstraps are externalized:
  - [server_modules/connectors/telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_helper_registry.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `3314` lines from `3331` before this cut.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns a large amount of shared channel helper logic and endpoint exports.
- Profile resolution, capability summaries, runtime status rendering, and transport helpers still live in the monolith.
- The connector file is thinner as a container, but it is still not yet reduced to transport and compatibility glue only.

#### Next Required Work

1. Continue reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting the remaining shared helper blocks, not by moving tiny utility functions around.
2. Target the remaining shared channel/runtime helper ownership next, especially status/rendering and connector-profile helper logic.
3. Keep the full focused connector suite as the regression gate for every cut.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_helper_registry.py)
  - [server_modules/connectors/autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_shared_service_registry.py)
  - [server_modules/tests/test_telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_helper_registry.py)
  - [server_modules/tests/test_autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_shared_service_registry.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_autopilot_helper_registry`
  - `server_modules.tests.test_autopilot_shared_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_connector_poll_service`
  - `server_modules.tests.test_telegram_autopilot_supervisor_service`
  - `server_modules.tests.test_telegram_autopilot_runtime_service`
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - Profile Resolution And Runtime Status Moved Behind Shared Helper Services

#### Stage

Stage 2 connector convergence continues. Shared profile resolution and runtime-status rendering no longer live inline as owned helper blocks inside [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

This cut does not change transport behavior. It removes another chunk of shared support logic from the monolith and puts it behind dedicated helper services with direct tests.

#### Completed Work

- Added [server_modules/connectors/autopilot_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_profile_service.py) to own:
  - Telegram autopilot profile resolution
  - WhatsApp autopilot profile resolution
  - WhatsApp help-text rendering
- Added [server_modules/connectors/runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/runtime_status_service.py) to own:
  - runtime status text rendering from metrics, local companion snapshot, and latest-run summary
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_resolve_telegram_autopilot_profile()` now delegates to the profile service
  - `_resolve_whatsapp_autopilot_profile()` now delegates to the profile service
  - `_whatsapp_help_text()` now delegates to the profile service
  - `_runtime_status_text()` now delegates to the runtime status service
- Added focused coverage in:
  - [server_modules/tests/test_autopilot_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_profile_service.py)
  - [server_modules/tests/test_runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runtime_status_service.py)

#### Current Truth

- Shared service construction is externalized:
  - [server_modules/connectors/autopilot_shared_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_shared_service_registry.py)
  - [server_modules/connectors/telegram_autopilot_helper_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_helper_registry.py)
  - [server_modules/connectors/telegram_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_service_registry.py)
  - [server_modules/connectors/whatsapp_autopilot_service_registry.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_autopilot_service_registry.py)
- Shared helper ownership is thinner in the monolith:
  - [server_modules/connectors/autopilot_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_profile_service.py)
  - [server_modules/connectors/runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/runtime_status_service.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `3261` lines from `3314` before this cut.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns large shared helper blocks around connector-context assembly, workflow-definition/chat-bridge helpers, and some transport utilities.
- Runtime skill-card helpers and connector-context logic are still inline.
- The file is clearly thinner, but it is still not reduced to transport and compatibility glue only.

#### Next Required Work

1. Continue extracting shared helper ownership from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially connector-context and workflow-definition helpers.
2. Keep preferring bounded, directly testable helper-service moves over cosmetic helper shuffles.
3. Maintain the full focused connector suite as the regression gate.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/autopilot_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/autopilot_profile_service.py)
  - [server_modules/connectors/runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/runtime_status_service.py)
  - [server_modules/tests/test_autopilot_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_autopilot_profile_service.py)
  - [server_modules/tests/test_runtime_status_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_runtime_status_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_autopilot_profile_service`
  - `server_modules.tests.test_runtime_status_service`
  - `server_modules.tests.test_telegram_autopilot_helper_registry`
  - `server_modules.tests.test_autopilot_shared_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_service_registry`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_telegram_autopilot_service_registry`
  - `server_modules.tests.test_telegram_connector_poll_service`
  - `server_modules.tests.test_telegram_autopilot_supervisor_service`
  - `server_modules.tests.test_telegram_autopilot_runtime_service`
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-05 - Telegram Connector Poll Execution And Supervisor Loop Moved Behind Dedicated Services

#### Stage

Stage 2 connector convergence continues. The Telegram autopilot monolith no longer owns the per-connector poll execution body or the forever-loop shell inline.

This is a real behavior cut, not just helper movement. The top-level autopilot module still exposes the live entrypoints, but the connector poll lifecycle and the loop-start shell now cross dedicated service boundaries first.

#### Completed Work

- Added [server_modules/connectors/telegram_connector_poll_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_connector_poll_service.py) to own:
  - per-connector Telegram poll execution
  - secret resolution and bot/chat validation
  - `begin_poll()` orchestration
  - inbound update iteration
  - processed-update state recording
  - poll completion handoff
  - connector-error handoff
- Added [server_modules/connectors/telegram_autopilot_supervisor_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_supervisor_service.py) to own:
  - Telegram autopilot start-state mutation
  - startup persistence
  - startup log emission
  - forever-loop sleep orchestration around the loop service
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_telegram_poll_connector()` now delegates to the connector-poll service
  - `_run_telegram_autopilot_forever()` now delegates to the supervisor service
  - Telegram startup-state mutation now goes through `_mark_telegram_autopilot_started()`
- Added focused coverage in:
  - [server_modules/tests/test_telegram_connector_poll_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_connector_poll_service.py)
  - [server_modules/tests/test_telegram_autopilot_supervisor_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_supervisor_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the shared autopilot composition layer and live endpoint exports, but it no longer owns the full Telegram connector-poll execution block inline.
- The Telegram loop stack is now layered more cleanly:
  - [server_modules/connectors/telegram_autopilot_supervisor_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_supervisor_service.py)
  - [server_modules/connectors/telegram_autopilot_loop_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_loop_service.py)
  - [server_modules/connectors/telegram_connector_poll_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_connector_poll_service.py)
  - [server_modules/connectors/telegram_poll_cycle_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_cycle_service.py)
  - [server_modules/connectors/telegram_poll_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_dispatch_service.py)
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is now down to `3470` lines from `3532` before this cut.

#### Open Gaps

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the service-composition block for Telegram and WhatsApp autopilot services.
- The shared autopilot registration and endpoint-export glue still lives in the monolith.
- WhatsApp still depends on inline composition patterns that should eventually converge into the same service-owned model.

#### Next Required Work

1. Reduce the remaining shared composition and registration glue in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially where Telegram and WhatsApp runtime services are wired inline.
2. Decide whether the next safe cut is a dedicated autopilot service-registry/composition module or another real runtime-behavior extraction on the shared channel side.
3. Keep the connector split test-first and bounded so the live autopilot paths remain stable.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_connector_poll_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_connector_poll_service.py)
  - [server_modules/connectors/telegram_autopilot_supervisor_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_autopilot_supervisor_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_connector_poll_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_connector_poll_service.py)
  - [server_modules/tests/test_telegram_autopilot_supervisor_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_autopilot_supervisor_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_connector_poll_service`
  - `server_modules.tests.test_telegram_autopilot_supervisor_service`
  - `server_modules.tests.test_telegram_autopilot_runtime_service`
  - `server_modules.tests.test_telegram_autopilot_state_service`
  - `server_modules.tests.test_whatsapp_autopilot_state_service`
  - `server_modules.tests.test_autopilot_endpoint_service`
  - `server_modules.tests.test_autopilot_status_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_autopilot_loop_service`
  - `server_modules.tests.test_telegram_poll_cycle_service`
  - `server_modules.tests.test_telegram_poll_dispatch_service`
  - `server_modules.tests.test_telegram_inbound_context_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Run Dispatch Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The Telegram channel no longer owns its run start, terminal wait, and final reply lifecycle inline inside the connector monolith.

This is the first Telegram cut that moves an end-to-end dispatch path, not just a bounded parsing or profile helper.

#### Completed Work

- Added [server_modules/connectors/telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_dispatch_service.py) with service-owned:
  - run reply text shaping
  - terminal-status waiting and local-companion timeout handling
  - Telegram run action dispatch, including ack send, final event record, and edit-or-send final reply behavior
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_autopilot_run_reply_text()` delegates to the service
  - `_wait_for_run_terminal_status()` delegates to the service
  - the live Telegram `action == "run"` branch delegates to the service instead of owning the whole lifecycle inline
- Added focused coverage in:
  - [server_modules/tests/test_telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_run_dispatch_service.py)

#### Current Truth

- Telegram routing, profile/onboarding, camera setup, media handling, and run dispatch now all cross dedicated connector service boundaries.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the top-level polling loop and channel-wide orchestration, but no longer owns the inline Telegram run lifecycle.
- WhatsApp still reuses the compatible `_wait_for_run_terminal_status()` and `_autopilot_run_reply_text()` wrapper names, which now route through the Telegram run dispatch service.

#### Open Gaps

- The top-level Telegram poll loop still owns too much channel orchestration and state patching.
- The WhatsApp run finalization path still lives in the connector monolith instead of a dedicated service boundary.
- The broader channel monolith still contains cross-channel lifecycle behavior that should move behind thinner adapters.

#### Next Required Work

1. Keep reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting another top-level Telegram dispatch seam, or shift to the WhatsApp finalization path for parity.
2. Decide whether cross-channel run terminal waiting should live in a channel-neutral service instead of inside the Telegram connector package.
3. Continue toward the architecture target of thin channel adapters around canonical runtime services.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_dispatch_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_run_dispatch_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - WhatsApp Run Finalization Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The WhatsApp channel no longer owns its run-finalization lifecycle inline inside the connector monolith.

This keeps the webhook transport surface smaller while preserving the existing async finalization behavior.

#### Completed Work

- Added [server_modules/connectors/whatsapp_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_run_dispatch_service.py) with service-owned:
  - WhatsApp ack text shaping
  - async run finalization
  - Twilio outbound send handling
  - dead-letter fallback on outbound failure
  - run completion/error event recording
  - connector state updates for success and failure
  - finalizer thread startup
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_whatsapp_finalize_run_async()` delegates to the service
  - the WhatsApp webhook `action == "run"` branch gets ack text from the service
  - the webhook starts the async finalizer through the service instead of owning the thread creation inline
- Added focused coverage in:
  - [server_modules/tests/test_whatsapp_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_run_dispatch_service.py)

#### Current Truth

- Telegram and WhatsApp now both cross dedicated run-dispatch service boundaries for key channel run-lifecycle behavior.
- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the top-level webhook and polling transport orchestration.
- Cross-channel run waiting still reuses the compatible `_wait_for_run_terminal_status()` wrapper, which now routes through the Telegram run dispatch service.

#### Open Gaps

- The top-level Telegram polling loop still owns too much channel orchestration and connector-state patching.
- WhatsApp webhook routing still lives inline in the monolith.
- The broader channel monolith still mixes cross-channel transport, channel-specific flows, and state persistence concerns.

#### Next Required Work

1. Keep reducing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) by extracting another top-level channel routing or state-update seam.
2. Decide whether cross-channel run waiting should move into a channel-neutral service after the channel adapters are thinner.
3. Continue toward thin channel adapters around canonical runtime services.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/whatsapp_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_run_dispatch_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_whatsapp_run_dispatch_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_run_dispatch_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - WhatsApp Webhook Routing Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The WhatsApp webhook routing flow no longer lives inline in the connector monolith.

#### Completed Work

- Added [server_modules/connectors/whatsapp_webhook_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/whatsapp_webhook_service.py) with service-owned:
  - inbound form parsing
  - connector matching and profile routing
  - action execution and response shaping
  - connector state patching and processed-message tracking
  - outbound event recording and response text return
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so:
  - `_parse_form_urlencoded()` delegates to the service
  - `handle_whatsapp_twilio_webhook()` delegates to the service for the full routing flow
  - processed-message increment now uses a dedicated `_whatsapp_autopilot_increment_processed()` helper
- Added focused coverage in:
  - [server_modules/tests/test_whatsapp_webhook_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_whatsapp_webhook_service.py)

#### Current Truth

- WhatsApp inbound handling, run finalization, and ack shaping now live behind two dedicated connector services.
- The monolith still owns the top-level webhook entrypoint, but no longer owns the routing logic itself.

#### Open Gaps

- The WhatsApp webhook still shares the Telegram routing command parser.
- The broader channel monolith still mixes channel transport and shared helpers.

#### Next Required Work

1. Decide whether WhatsApp should have its own routing parser or continue using the Telegram command logic.
2. Continue extracting the remaining top-level Telegram polling/state patching loop.

#### Verification

- `python3 -m py_compile` passed for:
  - `server_modules/connectors/whatsapp_webhook_service.py`
  - `server_modules/connectors/whatsapp_run_dispatch_service.py`
  - `server_modules/autopilot_connectors.py`
  - `server_modules/tests/test_whatsapp_webhook_service.py`
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Sender Filter Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The Telegram “sender not allowed” handling no longer lives inline inside the poll loop.

#### Completed Work

- Added [server_modules/connectors/telegram_sender_filter_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_sender_filter_service.py) to own:
  - drop event recording
  - connector-state patching for denied senders
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the poll loop delegates denied-sender handling to the service.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_sender_filter_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_sender_filter_service.py)

#### Current Truth

- Telegram sender filtering is now a service boundary, keeping the poll loop thinner.

#### Open Gaps

- The top-level Telegram polling loop still owns most action handling and state patching.

#### Next Required Work

1. Continue extracting the remaining Telegram poll-loop action handling into a dedicated service or a smaller set of dedicated services.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_sender_filter_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_sender_filter_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_sender_filter_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_sender_filter_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Non-Run Action Handling Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The bulk of Telegram’s non-run action handling is no longer inline inside the poll loop.

#### Completed Work

- Added [server_modules/connectors/telegram_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_action_service.py) to own:
  - help/menu/onboarding/profile/status/approval action handling
  - message dispatch for non-run paths
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the poll loop delegates non-run actions to the service before the run branch.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_action_service.py)

#### Current Truth

- The Telegram poll loop still owns the run branch and state patching.
- Non-run action handling now crosses a dedicated service boundary.

#### Open Gaps

- The run branch still lives inside the poll loop.
- The poll loop still owns the state patching and connector-state updates.

#### Next Required Work

1. Extract the run branch and state patching into dedicated services so the poll loop becomes pure orchestration.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_action_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_action_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `server_modules.tests.test_whatsapp_webhook_service`
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Poll State Patching Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The Telegram poll loop no longer owns its end-of-turn state patching inline.

#### Completed Work

- Added [server_modules/connectors/telegram_poll_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_state_service.py) to own:
  - processed-update state patches
  - poll-completion state patches
  - approval-only poll patches
  - connector-error state patches
  - processed-update counter increments
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the Telegram poll loop delegates those state-update patterns to the service.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_poll_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_poll_state_service.py)

#### Current Truth

- Telegram sender filtering, non-run actions, run dispatch, routing, media, profile flow, and poll state patching now all cross dedicated service boundaries.
- The main remaining heavy ownership block in the Telegram poll loop is the run-branch decision path itself.

#### Open Gaps

- The run branch still lives inline in the Telegram poll loop.
- The poll loop still assembles message/update context before handing off to deeper services.

#### Next Required Work

1. Extract the remaining Telegram run branch into a dedicated service so the poll loop becomes coordination-only.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_poll_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_poll_state_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/connectors/telegram_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_action_service.py)
  - [server_modules/tests/test_telegram_poll_state_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_poll_state_service.py)
  - [server_modules/tests/test_telegram_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_action_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Run Branch Moved Behind Connector Service

#### Stage

Stage 2 connector convergence continues. The main Telegram run branch no longer lives inline in the poll loop.

#### Completed Work

- Added [server_modules/connectors/telegram_run_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_action_service.py) to own:
  - onboarding answer consumption for run-intent messages
  - automatic onboarding gating before free-text runs
  - help fallback for empty run goals
  - run-goal assembly with profile, attachments, connector context, MCP space status, and installed-skill prompt append
  - direct-response short-circuit handling for MCP/skill replies
  - final handoff into the Telegram run dispatch service
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the Telegram poll loop delegates the run branch to the service.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_run_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_run_action_service.py)

#### Current Truth

- Telegram sender filtering, non-run actions, run branching, run dispatch, routing, media, profile flow, and poll state patching now all cross dedicated service boundaries.
- The Telegram poll loop is now much closer to transport and sequencing glue than business-logic ownership.

#### Open Gaps

- The poll loop still assembles the inbound message/update context inline before handing off to services.
- A few remaining compatibility wrappers still live in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).

#### Next Required Work

1. Extract inbound update/message context assembly from the Telegram poll loop.
2. Continue reducing remaining channel-agnostic helpers out of the monolith.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_run_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_run_action_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_run_action_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_run_action_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_whatsapp_run_dispatch_service`
  - `server_modules.tests.test_telegram_run_dispatch_service`
  - `server_modules.tests.test_telegram_routing_service`
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `server_modules.tests.test_telegram_action_service`
  - `server_modules.tests.test_telegram_sender_filter_service`
  - `server_modules.tests.test_telegram_poll_state_service`
  - `server_modules.tests.test_telegram_run_action_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Telegram Space-Status MCP Slice Moved Behind Connector Service

#### Stage

Stage 2 connector decomposition has started with a bounded Telegram slice instead of a risky monolith rewrite.

This does not split the full Telegram or WhatsApp autopilot module yet. It moves one isolated MCP-backed Telegram capability behind a dedicated connector service so the monolith stops owning that logic inline.

#### Completed Work

- Added [server_modules/connectors/telegram_space_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_space_service.py) as the dedicated service boundary for:
  - space catalog discovery from `spaces/`
  - question detection for space-status prompts
  - space-id resolution
  - MCP result payload normalization
  - async MCP tool calls for `get_space_status`
  - Telegram-ready answer rendering
  - top-level handled/unhandled response shaping
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the live Telegram call site now delegates into the extracted service instead of owning the space-status helper block inline.
- Removed the old inline Telegram space-status helper block from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), including:
  - `_telegram_space_catalog()`
  - `_telegram_looks_like_space_question()`
  - `_telegram_resolve_space_id()`
  - `_mcp_result_payload()`
  - `_telegram_space_status_via_mcp_async()`
  - `_telegram_render_space_answer()`
  - `_telegram_space_question_via_mcp()`
- Added focused coverage in:
  - [server_modules/tests/test_telegram_space_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_space_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) is still the Telegram and WhatsApp monolith, but it no longer owns this MCP-backed space-status slice.
- The connector split is now happening by bounded capabilities, which matches the canonical architecture more safely than attempting a one-shot channel rewrite.
- The extracted service is independent enough to test directly without going through the full autopilot polling loop.

#### Open Gaps

- The main Telegram autopilot loop still owns most channel behavior, profile handling, action routing, and message lifecycle management.
- WhatsApp logic still lives in the same monolith.
- No shared channel adapter contract exists yet for inbound event normalization across Telegram and WhatsApp.

#### Next Required Work

1. Continue carving [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) into bounded connector services instead of moving helper functions around inside the same file.
2. Target the next self-contained Telegram or WhatsApp behavior slice with a direct test harness.
3. Keep the monolith live-call-site stable while reducing its ownership block by block.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_space_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_space_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_space_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_space_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_space_service`

### 2026-04-04 - Telegram Profile And Onboarding State Moved Behind Connector Service

#### Stage

Stage 2 connector decomposition continued with a second Telegram slice: profile context and onboarding state.

This keeps the live Telegram loop stable while moving another stateful subsystem behind a dedicated connector service. It also restores profile-context goal merging so saved Telegram context actually affects run goals again.

#### Completed Work

- Added [server_modules/connectors/telegram_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_profile_service.py) as the dedicated boundary for:
  - Telegram profile field normalization
  - profile state load, persist, get, set, and clear
  - onboarding state load, persist, get, start, and advance
  - onboarding prompt generation and answer consumption
  - profile text and help text rendering
  - profile-context goal shaping
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the monolith now delegates the Telegram profile and onboarding subsystem instead of owning those rules and state transitions inline.
- Fixed the Telegram profile-context run-goal merge by routing [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) through the new service-owned goal builder.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_profile_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the main Telegram polling and action loop, but it no longer owns the full profile/onboarding subsystem implementation.
- Telegram saved-context behavior is again part of the actual goal-building path instead of being silently dropped.
- The connector monolith is now losing both stateless and stateful bounded slices under direct test coverage.

#### Open Gaps

- Telegram command routing and message lifecycle orchestration still live in the monolith.
- Camera setup, media handling, and WhatsApp state still remain inside the same file.
- A shared adapter contract for Telegram and WhatsApp still does not exist yet.

#### Next Required Work

1. Continue extracting bounded Telegram subsystems from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially camera-setup or media-handling state.
2. Keep validating extracted Telegram slices with direct service tests plus the existing Telegram command tests.
3. Only after more bounded slices are removed should the main channel loop itself be broken apart.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_profile_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_profile_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_profile_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_profile_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `server_modules.tests.test_telegram_space_service`

### 2026-04-04 - Telegram Guided Automation Camera-Setup Flow Moved Behind Connector Service

#### Stage

Stage 2 connector decomposition continued with the Telegram guided automation setup bridge.

This moves the file-backed camera-setup state and the guided automation handoff flow behind a dedicated connector service while keeping the live Telegram loop stable.

#### Completed Work

- Added [server_modules/connectors/telegram_camera_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_camera_setup_service.py) as the dedicated boundary for:
  - camera-setup state load, persist, get, set, and clear
  - guided automation setup handling for email summary and lead follow-up flows
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the Telegram guided automation path now delegates into the service instead of owning that state and branch logic inline.
- Removed the old inline camera-setup state ownership block from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
- Added focused coverage in:
  - [server_modules/tests/test_telegram_camera_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_camera_setup_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the main Telegram action loop, but it no longer owns the guided automation setup state machine.
- The guided automation setup path is now directly testable without going through the full Telegram polling flow.
- The connector monolith has now lost three bounded Telegram slices:
  - MCP-backed space status
  - profile and onboarding state
  - guided automation camera-setup flow

#### Open Gaps

- Telegram message routing, media handling, and camera/media attachment behavior still remain in the monolith.
- WhatsApp behavior is still co-located in the same file.
- Channel adapter normalization is still not separated from the polling loop.

#### Next Required Work

1. Continue extracting bounded Telegram slices from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially media attachment handling or message parsing.
2. Keep adding direct service tests for each extracted connector subsystem.
3. Only after more bounded slices are removed should the top-level Telegram loop be broken apart.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_camera_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_camera_setup_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_camera_setup_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_camera_setup_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`

### 2026-04-04 - Telegram Media Attachment Flow Moved Behind Connector Service

#### Stage

Stage 2 connector decomposition continued with the Telegram media attachment path.

This moves attachment extraction, attachment storage, and attachment-aware goal shaping behind a dedicated connector service while keeping the live Telegram loop stable.

#### Completed Work

- Added [server_modules/connectors/telegram_media_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_media_service.py) as the dedicated boundary for:
  - Telegram message attachment extraction
  - attachment filename and extension resolution
  - Telegram file download and local storage
  - attachment-aware run-goal shaping
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the Telegram media path now delegates into the service instead of owning that logic inline.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_media_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_media_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the top-level Telegram polling and action loop, but it no longer owns the attachment extraction and storage subsystem.
- The media path is now directly testable without driving a live Telegram API flow.
- The connector monolith has now lost four bounded Telegram slices:
  - MCP-backed space status
  - profile and onboarding state
  - guided automation camera-setup flow
  - media attachment handling

#### Open Gaps

- Telegram message routing and remaining polling-loop orchestration still live in the monolith.
- WhatsApp behavior is still co-located in the same file.
- The channel adapter contract is still not separated from the loop.

#### Next Required Work

1. Continue extracting bounded Telegram slices from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially message parsing or routing.
2. Keep adding direct service tests for each extracted connector subsystem.
3. Only after more bounded slices are removed should the top-level channel loop be broken apart.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_media_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_media_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_media_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_media_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_media_service`
  - `server_modules.tests.test_telegram_camera_setup_service`
  - `server_modules.tests.test_telegram_profile_service`
  - `server_modules.tests.test_telegram_space_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`

### 2026-04-04 - Telegram Routing And Help Flow Moved Behind Connector Service

#### Stage

Stage 2 connector decomposition continued with the Telegram routing layer.

This moves command parsing, prefix handling, explicit-run detection, and Telegram help text behind a dedicated connector service while keeping the live Telegram loop stable.

#### Completed Work

- Added [server_modules/connectors/telegram_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_routing_service.py) as the dedicated boundary for:
  - Telegram prefix stripping
  - command routing and action shaping
  - explicit run-command detection
  - Telegram help text rendering
- Updated [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) so the Telegram routing path now delegates into the service instead of owning that parser inline.
- Added focused coverage in:
  - [server_modules/tests/test_telegram_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_routing_service.py)

#### Current Truth

- [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) still owns the top-level Telegram polling loop, but it no longer owns the full Telegram command-routing subsystem.
- Telegram user-facing command interpretation is now directly testable without driving the full autopilot loop.
- The connector monolith has now lost five bounded Telegram slices:
  - MCP-backed space status
  - profile and onboarding state
  - guided automation camera-setup flow
  - media attachment handling
  - command routing and help text

#### Open Gaps

- The top-level Telegram polling and action orchestration still live in the monolith.
- WhatsApp behavior is still co-located in the same file.
- Channel adapter normalization and the loop lifecycle are still not separated.

#### Next Required Work

1. Continue extracting bounded Telegram slices from [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py), especially top-level message dispatch helpers and polling-loop orchestration.
2. Keep adding direct service tests for each extracted connector subsystem.
3. Only after more bounded slices are removed should the full Telegram loop be broken apart.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/connectors/telegram_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors/telegram_routing_service.py)
  - [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py)
  - [server_modules/tests/test_telegram_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_telegram_routing_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_telegram_routing_service`
  - `scripts.orion_terminal.tests.test_telegram_autopilot_profile_commands`
  - `scripts.orion_terminal.tests.test_telegram_connector_context`

### 2026-04-04 - Direct Chat Runtime Loop Moved Behind Dedicated Runtime Service

#### Stage

Stage 1 continues. The top-level direct-chat runtime loop no longer lives primarily inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This is the biggest direct-chat orchestration collapse so far. The chat module now delegates its main runtime control flow to [server_modules/direct_chat_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_runtime_service.py), while preserving the public wrappers that the rest of the runtime and the tests already call.

#### Completed Work

- Added [server_modules/direct_chat_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_runtime_service.py) with:
  - `DirectChatRuntimeServices`
  - `build_direct_operator_reply()`
  - `collect_direct_operator_reply()`
  - `build_chat_turn_event_stream()`
  - `execute_chat_turn()`
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so:
  - `build_direct_operator_reply()` is now a thin wrapper over the runtime service
  - `collect_direct_operator_reply()` delegates to the runtime service
  - `build_chat_turn_event_stream()` delegates to the runtime service
  - `execute_chat_turn()` delegates to the runtime service
  - a new `_direct_chat_runtime_services()` bundle wires the existing extracted subsystems together
- Added focused coverage in:
  - [server_modules/tests/test_direct_chat_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_runtime_service.py)
- Reduced [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) from `3715` lines to `3308` lines in this cut

#### Current Truth

- The direct-chat stack now has service boundaries for:
  - entry preparation
  - prompt assembly
  - provider routing
  - tool and handoff routing
  - durable-run handoff lifecycle
  - provider-backed generation
  - top-level response shaping
  - top-level runtime orchestration
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) is materially smaller and closer to a compatibility-and-glue layer.
- The canonical direct-chat runtime now looks like a composed system rather than one oversized module.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) is still too large and still owns legacy helper and compatibility surface.
- The direct-chat runtime still depends on callback bundles assembled inside the legacy chat module rather than a more formal runtime composition root.
- Run orchestration, connector decomposition, skills convergence, computer-control formalization, Rust supervisor work, and durable infrastructure phases remain ahead.

#### Next Required Work

1. Keep shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) toward compatibility glue by extracting more wrappers or collapsing them into a formal composition root.
2. Start the next architecture phase by converging the run path more aggressively around [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) and the canonical turn runtime.
3. Decide how the connector monolith in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py) gets split into thin channel adapters without breaking production behavior.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_runtime_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_runtime_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_runtime_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_runtime_service`
  - `server_modules.tests.test_direct_chat_response_service`
  - `server_modules.tests.test_direct_chat_entry_service`
  - `server_modules.tests.test_direct_chat_generation_service`
  - `server_modules.tests.test_direct_chat_handoff_service`
  - `server_modules.tests.test_direct_chat_provider_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Runtime Run Creation Routed Through Run Service

#### Stage

Stage 2 continues. Raw durable-run creation in the API layer is now less scattered and more explicitly routed through [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).

This is not the final run-service cutover yet. The legacy run modules still own the underlying heavy run lifecycle, but [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) now reaches that legacy entrypoint through a service-owned boundary instead of repeating direct calls everywhere.

#### Completed Work

- Expanded [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) with:
  - `RunCreationServices`
  - `create_run_result_from_request()`
- Updated [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) with:
  - `_run_creation_services()`
  - `_run_execution_services()`
  - `_create_run_result()`
- Replaced repeated direct `_create_run_from_request` calls in [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py) for:
  - heartbeat-triggered run creation
  - webhook-triggered run creation
  - delegated child-run creation
  - auto-delegated child-run creation
  - retry-failed child-run creation
  - replay-triggered run creation
  - the canonical `/runs/start` and `/chat/respond` service wiring now also shares `_run_execution_services()`
- Added focused coverage in:
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)

#### Current Truth

- The runtime API no longer constructs durable-run execution services inline in multiple places.
- The runtime API now uses service helpers for both:
  - turn-based durable execution wiring
  - raw run creation from already-built `RunStartRequest` payloads
- [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) now owns more of the durable-run boundary, even though the underlying run engine is still legacy-heavy.

#### Open Gaps

- The actual run lifecycle logic still lives primarily in:
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
- [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) is still not the single durable-run owner envisioned by the canonical architecture.
- Delegation and replay still depend on late-bound legacy helpers even though the API call sites are cleaner now.

#### Next Required Work

1. Move more of `_create_run_from_request` ownership out of the legacy run modules and into [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
2. Decide whether run preparation, replay normalization, and delegation request assembly should each get first-class service boundaries.
3. Keep collapsing API-layer orchestration so durable runs converge on the canonical turn/runtime path.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py)
  - [server_modules/runtime_runs_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_runs_api.py)
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_run_service`
  - `server_modules.tests.test_runtime_runs_api_session_manager`
  - `server_modules.tests.test_agent_turn`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Shared Durable-Run Creation Body Moved Behind Run Service

#### Stage

Stage 2 continues. The duplicated durable-run creation body inside [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) and [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) no longer exists only in those legacy modules.

The legacy modules still own their own request-preparation logic and final result shaping, but they now share a common creation body from [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).

#### Completed Work

- Expanded [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) with:
  - `PreparedRunCreationServices`
  - `create_run_from_prepared_request()`
- Updated [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) so `_create_run_from_request()` now:
  - keeps `runs_core`-specific preparation behavior
  - delegates the shared durable-run creation body into the run service
  - preserves the richer `runs_core` return payload with active profile details
- Updated [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) so `_create_run_from_request()` now:
  - keeps `runs_delegation`-specific preparation behavior
  - delegates the shared durable-run creation body into the run service
  - preserves the delegation-oriented return shape
- Expanded focused coverage in:
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)

#### Current Truth

- The biggest shared part of durable-run creation is now centralized in [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
- [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) and [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) are both thinner in the exact place where they were most duplicated.
- Durable-run convergence is now happening both:
  - at the API boundary
  - inside the legacy run modules themselves

#### Open Gaps

- `_prepare_run_start_request()` still exists separately in:
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
- The run lifecycle after creation is still mostly owned by:
  - [server_modules/runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
- The service boundary is better, but durable runs are still not yet fully centered on a single canonical run owner.

#### Next Required Work

1. Collapse or unify the duplicated `_prepare_run_start_request()` logic.
2. Decide whether delegation planning/building becomes a first-class service or stays in the legacy delegation module temporarily.
3. Keep pulling the durable lifecycle toward [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) until the old run modules are mostly adapters.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py)
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_run_service`
  - `server_modules.tests.test_runs_delegation`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_runtime_runs_api_session_manager`

### 2026-04-04 - Shared Local-Execution Helper Block Moved Behind Run Service

#### Stage

Stage 2 continues. The duplicated local-execution helper block that both legacy run modules used is now centralized in [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).

This covers the small but high-churn helper surface around local execution gating and browser metadata, which had still been duplicated in both [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) and [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py).

#### Completed Work

- Expanded [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) with shared helpers for:
  - `safe_int()`
  - `normalize_requested_max_iterations()`
  - `local_execution_requires_start_confirmation()`
  - `precheck_human_action_labels()`
  - `local_execution_confirmation_prompt()`
  - `local_execution_block_prompt()`
  - `mark_local_execution_tools_approved()`
  - `apply_browser_execution_metadata()`
- Updated [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) so the legacy helper names now delegate into the run service.
- Updated [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) so the same helper names also delegate into the run service.
- Expanded focused coverage in:
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)

#### Current Truth

- Durable-run convergence now covers:
  - run-start preparation
  - prepared-request creation
  - the duplicated local-execution helper block
- The legacy run modules still expose the old helper names, but the implementation now belongs to [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).
- The durable-run layer is increasingly moving from duplicated implementation to compatibility wrappers over a shared service boundary.

#### Open Gaps

- Deeper lifecycle and orchestration still remain spread across:
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
  - [server_modules/runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py)
- Delegation planning and retry orchestration are still not service-owned.
- The connector monolith split is still the next major architecture phase after this durable-run cleanup.

#### Next Required Work

1. Choose the next durable-run ownership slice:
   - delegation planning and retry orchestration
   - replay/delegated request assembly
   - deeper run execution orchestration
2. Once durable ownership is sufficiently centered, start the connector monolith split in [server_modules/autopilot_connectors.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/autopilot_connectors.py).
3. Keep [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) as the only place new durable-run logic is added.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py)
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_run_service`
  - `server_modules.tests.test_runs_delegation`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_runtime_runs_api_session_manager`

### 2026-04-04 - Shared Run-Start Preparation Moved Behind Run Service

#### Stage

Stage 2 continues. The duplicated `_prepare_run_start_request()` logic in [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) and [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) is now centralized behind [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py).

This pairs with the previous durable-run creation cut. Together, the two largest duplicated durable-run setup bodies now live behind the canonical run service.

#### Completed Work

- Expanded [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) with:
  - `RunPreparationServices`
  - `prepare_run_start_request()`
- Updated [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) so `_prepare_run_start_request()` is now a thin wrapper over the shared service helper.
- Updated [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) so `_prepare_run_start_request()` is also now a thin wrapper over the shared service helper.
- Preserved the one important current difference:
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) still applies `_bind_obvious_connector_write_intent()` through the new postprocess hook.
- Expanded focused coverage in:
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)

#### Current Truth

- Durable-run setup now has shared ownership for both:
  - request preparation
  - prepared-request creation
- [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py) and [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py) are materially thinner at their most duplicated seams.
- [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py) is now becoming the real durable-run center rather than just a placeholder boundary.

#### Open Gaps

- The underlying durable lifecycle is still spread across:
  - [server_modules/runs_execution.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_execution.py)
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
- Delegation planning and retry orchestration are still legacy-heavy.
- The connector monolith, skills convergence, and machine-control formalization are still ahead.

#### Next Required Work

1. Keep moving the deeper durable lifecycle toward [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py), especially where `runs_core` and `runs_delegation` still mirror each other.
2. Decide whether delegation planning/building becomes its own service or gets absorbed into the run service in phases.
3. Once durable-run ownership is cleaner, move on to the connector monolith split.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_service.py)
  - [server_modules/runs_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_core.py)
  - [server_modules/runs_delegation.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_delegation.py)
  - [server_modules/tests/test_run_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_run_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_run_service`
  - `server_modules.tests.test_runs_delegation`
  - `server_modules.tests.test_agent_machine_mode`
  - `server_modules.tests.test_runtime_runs_api_session_manager`

### 2026-04-04 - Direct Chat Durable-Run Handoff Lifecycle Moved Behind Dedicated Handoff Service

#### Stage

Stage 1 continues. The direct-chat loop no longer owns the full inline implementation of durable-run handoff start, status shaping, snapshot interpretation, or live handoff streaming.

This is a larger ownership cut than the earlier route-planning extraction. The chat loop still decides when to trigger durable-run handoff, but the handoff lifecycle itself is now service-owned.

#### Completed Work

- Added a new handoff boundary in [server_modules/direct_chat_handoff_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_handoff_service.py) for:
  - `durable_run_preferred_response()`
  - `run_handoff_execution_target()`
  - `can_auto_start_run_handoff()`
  - `direct_chat_run_handoff_failure_payload()`
  - `start_direct_chat_run_handoff()`
  - `direct_chat_run_handoff_reply()`
  - `direct_chat_run_actions()`
  - `direct_chat_run_snapshot()`
  - `direct_chat_run_event_to_step()`
  - `direct_chat_run_snapshot_to_step()`
  - `direct_chat_run_final_payload()`
  - `stream_direct_chat_run_handoff()`
- Replaced the inline handoff implementation in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with thin compatibility wrappers for the extracted functions
- Preserved the current patch surface for older tests by keeping the wrapper names in the chat module while moving implementation ownership into the new handoff service
- Added focused service coverage in:
  - [server_modules/tests/test_direct_chat_handoff_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_handoff_service.py)

#### Current Truth

- The durable-run handoff lifecycle for direct chat now has its own dedicated service boundary.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still triggers the handoff path, but no longer owns the lifecycle implementation inline.
- Provider routing, prompt assembly, no-provider fallback execution, route planning, and handoff lifecycle are now all outside the main direct-chat loop as extracted service-owned subsystems.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns the main streaming reply loop and the final direct-chat generation/orchestration path.
- Older tests still patch wrapper functions in the chat module, so the chat module remains a public seam even though it no longer owns those implementations.
- The service extraction is still functional and injected rather than a fully composed runtime object graph.

#### Next Required Work

1. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting the remaining streaming reply orchestration and final payload shaping around provider-backed chat generation.
2. Decide whether the next service boundary should be the provider-backed streaming loop itself or the final payload assembly around chat results and fallbacks.
3. Keep removing ownership from the chat module instead of introducing new inline orchestration there.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_handoff_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_handoff_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_handoff_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_handoff_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_handoff_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_provider_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`
  - final rerun after the handoff-service extraction: `97 tests`, `OK`

### 2026-04-04 - Provider-Backed Direct Chat Generation Loop Moved Behind Dedicated Generation Service

#### Stage

Stage 1 continues. The direct-chat loop no longer owns the full inline provider-backed generation and direct-tool iteration path.

This is the next major ownership cut after handoff extraction. The chat module still assembles the request inputs for provider-backed chat, but the iterative generation loop itself is now service-owned.

#### Completed Work

- Added a new generation boundary in [server_modules/direct_chat_generation_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_generation_service.py) for:
  - `DirectChatGenerationServices`
  - `stream_provider_backed_direct_chat()`
- Moved the following provider-backed direct-chat behaviors behind the service boundary:
  - streaming model chunks
  - result handling for provider-backed direct chat
  - iterative direct-tool execution across provider responses
  - direct-tool approval handoff
  - tool-loop detection
  - final success payload shaping for the provider-backed path
  - final error payload shaping for the provider-backed path
  - post-reply memory persistence and transcript persistence triggers
- Replaced the inline generation loop in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with `_direct_chat_generation_services()` and a single delegated call into [server_modules/direct_chat_generation_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_generation_service.py)
- Added focused service coverage in:
  - [server_modules/tests/test_direct_chat_generation_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_generation_service.py)

#### Current Truth

- The provider-backed generation loop is now a dedicated service boundary instead of a large inline block inside the chat module.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) now mostly assembles the direct-chat request state and dispatches into extracted service-owned subsystems.
- Provider routing, route planning, handoff lifecycle, prompt assembly, memory behaviors, no-provider execution, and provider-backed generation are all now outside the main chat loop as separate ownership boundaries.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still remains the top-level direct-chat entrypoint and still carries some request normalization and transport glue.
- Several extracted services are still wired through callback bundles rather than a richer explicit runtime composition object.
- Older tests still patch chat-module wrappers and globals, so the chat module remains the compatibility seam for now.

#### Next Required Work

1. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting the remaining direct-chat entrypoint glue and result-collection helpers where it makes sense.
2. Decide whether the next convergence step should be a composed direct-chat runtime object that wires these service boundaries together explicitly.
3. Keep deleting ownership from the chat module rather than allowing new orchestration blocks to form there.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_generation_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_generation_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_generation_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_generation_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_generation_service`
  - `server_modules.tests.test_direct_chat_handoff_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_provider_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`
  - final rerun after the generation-service extraction: `99 tests`, `OK`

### 2026-04-04 - Direct Chat Entrypoint Preparation Moved Behind Dedicated Entry Service

#### Stage

Stage 1 continues. The top-level direct-chat entrypoint no longer owns the full inline preparation path for request normalization, session preference application, slash-command preprocessing, compaction, availability/tool setup, and base context assembly.

This does not remove [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) as the direct-chat entrypoint, but it does reduce how much preparation logic it owns before dispatching into the extracted services.

#### Completed Work

- Added a new entry boundary in [server_modules/direct_chat_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_entry_service.py) for:
  - `PreparedDirectChatRequest`
  - `prepare_direct_chat_request()`
- Moved the following direct-chat preparation behaviors behind the service boundary:
  - request normalization from turn/session inputs
  - session model preference application
  - slash-command preprocessing for `/model` and `/clear`
  - prior-message normalization and compaction
  - proactive suggestion setup
  - availability resolution and tool catalog assembly
  - approved-action normalization
  - base `context_used` envelope construction
- Replaced the large inline setup block in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with `_prepare_direct_chat_request()`, which delegates into [server_modules/direct_chat_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_entry_service.py)
- Added focused service coverage in:
  - [server_modules/tests/test_direct_chat_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_entry_service.py)

#### Current Truth

- The direct-chat entrypoint now mainly coordinates slash-command handling, fallback branching, and dispatch into extracted provider, routing, handoff, generation, prompt, and memory services.
- Request preparation for direct chat now has its own explicit service boundary instead of living as a long inline block inside the chat module.
- The chat module is materially closer to an orchestration-only boundary than it was at the start of Stage 1.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still remains the top-level entrypoint and still contains some direct final-response branching for slash commands, approvals, and provider-unavailable fallback cases.
- Several extracted services still communicate through callback bundles rather than a richer explicit runtime composition object.
- Older tests still patch chat-module helpers, so the chat module remains the compatibility seam.

#### Next Required Work

1. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting the remaining direct final-response branching where it forms reusable behavior.
2. Decide whether the next convergence step should introduce an explicit composed direct-chat runtime object that wires the extracted services together.
3. Keep using deletions in the chat module as the success metric instead of allowing new inline preparation logic to return.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_entry_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_entry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_entry_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_entry_service`
  - `server_modules.tests.test_direct_chat_generation_service`
  - `server_modules.tests.test_direct_chat_handoff_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_provider_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`
  - final rerun after the entry-service extraction: `101 tests`, `OK`

### 2026-04-04 - Direct Chat Top-Level Response Shaping Moved Behind Dedicated Response Service

#### Stage

Stage 1 continues. The direct-chat entrypoint no longer owns the full inline response shaping for slash commands, empty-input handling, approval-confirmation finalization, and provider-unavailable fallback final payloads.

This is another step toward making [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) an orchestration-only boundary instead of a payload-construction owner.

#### Completed Work

- Added a new response boundary in [server_modules/direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py) for:
  - `DirectChatResponseServices`
  - `slash_command_payload()`
  - `empty_message_payload()`
  - `approval_confirmation_payload()`
  - `unavailable_fallback_payload()`
- Moved the following top-level direct-chat response behaviors behind the service boundary:
  - slash-command final payload construction for `status`, `memory`, `forget`, `model`, `clear`, and `help`
  - empty-message final payload construction
  - approval-confirmation success and error payload construction
  - provider-unavailable fallback final payload construction for both tool-backed and no-provider cases
- Replaced the corresponding inline payload-building branches in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with calls into [server_modules/direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py)
- Added focused service coverage in:
  - [server_modules/tests/test_direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_response_service.py)

#### Current Truth

- Request preparation, provider routing, route planning, handoff lifecycle, provider-backed generation, prompt assembly, memory behaviors, and top-level response shaping are now all outside the main direct-chat loop as dedicated service-owned boundaries.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still remains the direct-chat entrypoint and transport seam, but it now owns materially less payload-shaping logic.
- The remaining weight in the chat module is increasingly concentrated in orchestration glue and compatibility wrappers rather than reusable subsystem logic.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still remains the compatibility seam that older tests patch directly.
- Several service boundaries still communicate through callback bundles rather than a more explicit composed runtime object.
- Some final branching and transport collection helpers still remain inline in the chat module.

#### Next Required Work

1. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting any remaining reusable final-branch behavior or transport helpers that are still inline.
2. Decide whether the next convergence step should be introducing an explicit composed direct-chat runtime object that wires these services together.
3. Keep using deletion pressure on the chat module as the measure of whether the architecture is becoming real in code.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_response_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_response_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_response_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_response_service`
  - `server_modules.tests.test_direct_chat_entry_service`
  - `server_modules.tests.test_direct_chat_generation_service`
  - `server_modules.tests.test_direct_chat_handoff_service`
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_provider_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`
  - final rerun after the response-service extraction: `104 tests`, `OK`

### 2026-04-04 - Direct Chat Provider Routing Moved Behind Dedicated Provider Service

#### Stage

Stage 1 continues. Direct-chat provider routing, credential lookup, native-chat readiness checks, availability payload assembly, and Codex-forcing policy for connector-heavy or local-machine requests no longer live inline as owned logic inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

#### Completed Work

- Added a new service boundary in [server_modules/direct_chat_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_service.py) for:
  - `credential_auth_mode()`
  - `supports_direct_message_native_chat()`
  - `direct_chat_credentials()`
  - `preferred_provider()`
  - `provider_display_name()`
  - `provider_unavailable_response()`
  - `direct_chat_runtime_available()`
  - `resolve_direct_chat_availability()`
  - `connected_provider_tokens()`
  - `message_prefers_codex_for_direct_chat()`
  - `resolve_provider_for_direct_chat_message()`
- Replaced inline provider ownership in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with thin compatibility wrappers for:
  - `_credential_auth_mode()`
  - `_supports_direct_message_native_chat()`
  - `_preferred_provider()`
  - `_provider_display_name()`
  - `_provider_unavailable_response()`
  - `_direct_chat_credentials()`
  - `_direct_chat_runtime_available()`
  - `_resolve_direct_chat_availability()`
  - `_connected_provider_tokens()`
- Moved the direct-chat Codex-forcing policy for:
  - connector-heavy requests that benefit from direct connector tooling
  - local file, shell, screenshot, and computer-control requests
  behind `_resolve_provider_for_direct_chat_message()`, which now delegates into [server_modules/direct_chat_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_service.py)
- Added focused service coverage in:
  - [server_modules/tests/test_direct_chat_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_provider_service.py)

#### Current Truth

- Provider resolution for direct chat now has a dedicated service boundary instead of living as a large inline block in the chat module.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still uses compatibility wrappers so the rest of the runtime and existing tests remain stable.
- The direct-chat path no longer owns the reusable provider-selection subsystem or the Codex-forcing decision policy for connector-heavy and local-machine requests.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns the main streaming execution loop and the surrounding orchestration around provider choice.
- The provider service is currently a function-based module, not yet a richer injected service object.
- Some older tests still patch the compatibility wrappers in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py), so the chat module remains the public patch surface for now.

#### Next Required Work

1. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting the remaining direct-chat execution loop concerns behind service boundaries.
2. Decide whether any remaining provider-choice orchestration should stay in the provider service or move into a higher-level direct-chat execution service.
3. Keep replacing compatibility wrappers only after the downstream call sites and tests no longer need the chat module as the patch surface.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_provider_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_provider_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_provider_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`
  - second provider-service-focused rerun after the Codex-forcing extraction: `91 tests`, `OK`

### 2026-04-04 - Direct Chat Tool And Handoff Routing Moved Behind Dedicated Routing Service

#### Stage

Stage 1 continues. The direct-chat execution loop no longer owns the entire inline policy block that decides between direct tool execution and durable run handoff.

This cut does not remove the streaming loop itself from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py), but it does move the routing policy that was previously embedded inside that loop.

#### Completed Work

- Added a new routing boundary in [server_modules/direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_routing_service.py) for:
  - `DirectChatRouteDecision`
  - `plan_direct_chat_route()`
- Moved the following direct-chat routing decisions behind the service boundary:
  - whether the message should prefer durable run handoff
  - whether a preview-backed connector request disables builtin direct tools
  - whether connector, local, and builtin direct tools are allowed
  - whether direct tool execution is disabled in favor of durable run handoff
  - whether the preview should auto-start a durable run immediately
- Replaced the inline policy block in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) with `_plan_direct_chat_route()`, which delegates into [server_modules/direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_routing_service.py)
- Preserved the existing handoff behavior for complex local tasks by moving the fallback preview synthesis into the routing service instead of leaving it in the chat loop
- Added focused service coverage in:
  - [server_modules/tests/test_direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_routing_service.py)

#### Current Truth

- The direct-chat loop still owns streaming, run kickoff, final payload emission, and higher-level orchestration.
- The decision policy that determines whether direct tools are allowed or whether the request should move toward durable run handoff is now service-owned.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) now composes provider selection, prompt assembly, fallback execution, memory behaviors, and route planning through extracted service boundaries instead of owning all of those inline.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns the actual streaming execution loop and the run-start / stream-yield orchestration.
- The routing service currently depends on injected callables from the chat module rather than owning a richer explicit dependency bundle.
- Compatibility wrappers in the chat module still remain the main patch surface for several older tests.

#### Next Required Work

1. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting the remaining streaming execution and final payload assembly logic.
2. Decide whether the direct-chat run handoff start/stream path should become its own service boundary next.
3. Keep deleting inline policy from the chat module rather than letting new orchestration accumulate there.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_routing_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_routing_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_routing_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_routing_service`
  - `server_modules.tests.test_direct_chat_provider_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`
  - final rerun after the route-planning regression fix: `94 tests`, `OK`

### 2026-04-04 - No-Provider Memory Parsing Moved Behind Memory Service

#### Stage

Stage 1 continues. The no-provider chat fallback no longer owns memory read/write parsing inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This is the beginning of the subtraction phase inside the chat module. The user-facing fallback behavior remains the same, but the canonical memory boundary now owns more of the direct-chat path.

#### Completed Work

- Expanded [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) with:
  - `parse_no_provider_memory_write()`
  - `parse_no_provider_memory_read()`
  - `handle_no_provider_memory_request()`
- Removed now-dead no-provider helper ownership from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py):
  - `_normalize_memory_key()`
  - `_extract_no_provider_memory_write()`
  - `_memory_entry_for_query()`
  - `_extract_no_provider_memory_read()`
- Updated the direct-chat fallback path so [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) now:
  - delegates no-provider memory handling to the canonical memory service
  - uses the memory service for direct-tool intent detection for memory read/write messages
- Expanded focused coverage in:
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)
  - [server_modules/tests/test_operator_chat_no_provider.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_operator_chat_no_provider.py)

#### Current Truth

- The direct-chat module still owns higher-level fallback orchestration, but it no longer owns no-provider memory parsing logic.
- The canonical memory boundary now covers:
  - workspace/notebook memory CRUD
  - runtime semantic memory search/upsert
  - transcript-linked daily-log writes
  - direct-chat memory extraction/persistence
  - no-provider direct-chat memory read/write behavior
- The chat module is shrinking by responsibility, not just by wrappers.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still mixes provider orchestration, prompt assembly, approval behavior, and no-provider fallback execution.
- The memory service still hides two different underlying implementations:
  - `agent_memory.py`
  - `runtime_memory.py`
- The no-provider fallback still sits inside the chat module as a large branch even though memory handling is now delegated.

#### Next Required Work

1. Continue subtracting from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting more no-provider fallback behavior behind service-owned helpers.
2. Define the service contract that should ultimately hide the split between notebook memory and runtime semantic memory.
3. Keep preserving user-visible behavior while reducing chat-module ownership.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)
  - [server_modules/tests/test_operator_chat_no_provider.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_operator_chat_no_provider.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_memory_service`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Lightweight No-Provider Fallback Helpers Extracted Into Dedicated Service

#### Stage

Stage 1 continues. The lightweight no-provider fallback helpers for local file analysis, directory listing, shell command parsing, web query parsing, and HTTP response parsing no longer live inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This is a real subtraction step. The chat module still orchestrates the no-provider fallback path, but it no longer owns the reusable helper logic for those lightweight behaviors.

#### Completed Work

- Added [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py) as the new service boundary for lightweight no-provider helpers:
  - `count_definitions_in_file()`
  - `count_functions_and_write_summary()`
  - `list_directory()`
  - `looks_like_directory_listing_request()`
  - `extract_shell_command()`
  - `extract_web_query()`
  - `parse_http_tool_output()`
- Removed the corresponding helper ownership from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py), including:
  - `_count_python_definition_lines()`
  - `_chat_count_definitions_in_file()`
  - `_chat_count_functions_and_write_summary()`
  - `_chat_list_directory()`
  - `_extract_no_provider_shell_command()`
  - `_extract_no_provider_web_query()`
  - `_parse_http_tool_output()`
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so the no-provider fallback path now delegates to the new service for:
  - summary/count replies
  - directory listing replies
  - shell and web query parsing for direct-tool planning
  - HTTP tool output parsing
  - syntactic detection of directory-list requests during direct-tool intent detection
- Added focused service coverage in:
  - [server_modules/tests/test_no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_no_provider_service.py)

#### Current Truth

- The no-provider fallback path is now split between service-owned helper logic and chat-module orchestration.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) lost a large block of inline helper code and now depends on:
  - [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) for memory fallback behavior
  - [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py) for lightweight fallback parsing and formatting helpers
- The directory-list intent detector is now syntactic-only, while path validation remains in execution-time fallback handling.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns the top-level no-provider fallback branch, approval handling, provider orchestration, and prompt assembly.
- The no-provider service still depends on injected callbacks for path resolution and message compaction rather than owning the whole local-path contract.
- The direct-chat engine still mixes too many responsibilities even after these helper extractions.

#### Next Required Work

1. Continue shrinking [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting more of the no-provider fallback orchestration into service-owned modules.
2. Decide whether the no-provider path should ultimately live behind a dedicated direct-chat fallback service instead of multiple helper services.
3. Keep preserving exact user-visible fallback replies while deleting chat-module-owned utility code.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_no_provider_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Direct Chat Prompt Assembly Moved Behind Dedicated Prompt Service

#### Stage

Stage 1 continues. The memory-recall prompt section and the direct-chat system-prompt assembly path no longer live primarily inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This extraction targets prompt composition rather than tool routing. The chat module still decides when to build the prompt, but the formatting and prompt-combination logic now belongs to a dedicated service.

#### Completed Work

- Added [server_modules/direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_prompt_service.py) with:
  - `memory_recall_section()`
  - `build_system_prompt()`
  - `combine_workspace_context()`
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so:
  - `_build_direct_chat_system_prompt()` delegates to the prompt service
  - workspace context and system prompt are combined through the prompt service
- Removed the old inline prompt-assembly ownership from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) for:
  - `_direct_chat_memory_recall_section()` implementation
  - the inline system-prompt composition logic
  - the inline workspace-context concatenation logic
- Added focused service coverage in:
  - [server_modules/tests/test_direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_prompt_service.py)

#### Current Truth

- Prompt composition for direct chat now has a dedicated service boundary.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still triggers prompt assembly, but it no longer owns the prompt-formatting implementation details inline.
- The direct-chat stack now has clearer service ownership across:
  - memory
  - no-provider fallback
  - direct-chat prompt assembly

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns large high-level orchestration paths including provider routing and the main direct-chat loop.
- The direct-chat prompt service is still intentionally narrow and does not yet own proactive suggestions or all prompt-adjacent concerns.
- The direct-chat engine is still not yet a thin coordination layer.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by targeting another large orchestration block, most likely provider routing or the main chat loop.
2. Keep moving repeated prompt and orchestration concerns into explicit services instead of helper clusters.
3. Preserve existing prompt behavior while shrinking chat-module ownership.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_prompt_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_prompt_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Proactive Suggestion Assembly Moved Behind Direct Chat Prompt Service

#### Stage

Stage 1 continues. The proactive suggestion assembly path no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This extends the prompt-service boundary beyond raw system-prompt composition. Prompt-adjacent suggestion logic is now also owned by the dedicated direct-chat prompt service.

#### Completed Work

- Expanded [server_modules/direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_prompt_service.py) with:
  - `time_of_day_suggestion()`
  - `build_proactive_suggestions()`
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so `_build_proactive_suggestions()` now delegates to the prompt service with injected sources for:
  - heartbeat tasks
  - recent run prompts
  - memory-backed suggestion prompts
- Removed now-dead inline ownership in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) for:
  - `_time_of_day_suggestion()`
  - the internal suggestion-deduping and fallback prompt assembly logic
- Expanded focused service coverage in:
  - [server_modules/tests/test_direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_prompt_service.py)

#### Current Truth

- [server_modules/direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_prompt_service.py) now owns:
  - memory-recall section generation
  - direct-chat system-prompt composition
  - workspace-context and prompt combination
  - proactive suggestion assembly
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) continues to lose prompt-adjacent ownership and now mainly supplies runtime data sources into the service.
- The direct-chat prompt path is becoming more explicit and testable.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns large high-level orchestration paths including provider routing and the main direct-chat execution loop.
- The prompt service still relies on injected sources from the chat module and does not yet own all prompt-adjacent concerns.
- The direct-chat engine still is not yet a thin coordination layer.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by targeting another orchestration-heavy block, most likely provider routing or the main loop.
2. Keep moving repeated prompt and orchestration concerns into explicit services instead of helper clusters.
3. Preserve current direct-chat behavior while shrinking chat-module ownership.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/direct_chat_prompt_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_direct_chat_prompt_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_direct_chat_prompt_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_direct_chat_prompt_service`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Direct Tool Approval Response Moved Behind No-Provider Service

#### Stage

Stage 1 continues. The direct-tool approval response construction no longer lives primarily inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This cut keeps a thin compatibility wrapper in the chat module so existing call sites and tests still work, but the real approval-response logic now belongs to [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py).

#### Completed Work

- Expanded [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py) with:
  - `build_direct_tool_approval_response()`
  - additional injected approval-related dependencies on `NoProviderExecutionServices`
- Updated `NoProviderExecutionServices` so the fallback service can receive:
  - tool-name parsing
  - tool-argument parsing
  - approval-policy evaluation
  - full-trust session checking
- Removed the old approval-response implementation body from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
- Replaced it with a thin compatibility wrapper in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) that delegates to the service-owned implementation
- Expanded focused service coverage in:
  - [server_modules/tests/test_no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_no_provider_service.py)

#### Current Truth

- [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py) now owns:
  - helper parsing for lightweight no-provider flows
  - direct-tool routing heuristics
  - no-provider fallback execution
  - direct-tool approval response construction
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still exposes `_build_direct_tool_approval_response()` only as a compatibility shim.
- The chat module continues to shrink toward a coordination-only role.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns large high-level direct-chat orchestration paths including provider routing and prompt assembly.
- The fallback service still relies on injected callbacks for approval-policy evaluation and tool execution rather than owning those subsystems outright.
- The direct-chat stack is still not yet a thin, fully layered orchestration path.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting more high-level direct-chat orchestration concerns.
2. Decide whether the next service boundary should target approval policy evaluation, provider routing, or prompt/system-message assembly.
3. Keep preserving current behavior while deleting chat-module-owned control flow.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_no_provider_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Direct Tool Planning And Obvious-Intent Detection Moved Behind No-Provider Service

#### Stage

Stage 1 continues. The no-provider fallback service now owns not only fallback execution, but also direct-tool planning and the syntactic detector for “obvious” direct-tool requests.

This is another routing-level subtraction step. [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still chooses when to invoke the service, but it no longer owns the planning heuristics that decide how lightweight no-provider requests map to direct tools.

#### Completed Work

- Expanded [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py) with:
  - `plan_tool_calls()`
  - `has_obvious_direct_tool_intent()`
- Updated `NoProviderExecutionServices` in [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py) so it now carries the memory-read/write parsers needed by the moved routing heuristics.
- Removed chat-module ownership from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) for:
  - `_plan_no_provider_tool_calls()`
  - the inline body of `_message_has_obvious_direct_tool_intent()`
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so:
  - `_no_provider_execution_services()` passes the parser dependencies into the fallback service
  - `_message_has_obvious_direct_tool_intent()` delegates to the fallback service
- Expanded focused service coverage in:
  - [server_modules/tests/test_no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_no_provider_service.py)

#### Current Truth

- The no-provider service now owns:
  - lightweight fallback helpers
  - no-provider fallback execution
  - direct-tool planning heuristics for lightweight requests
  - obvious-intent detection for direct-tool execution routing
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) continues to shrink toward a coordination role.
- The chat module still owns higher-level direct-chat orchestration and approval/prompt decisions.

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns provider routing, prompt assembly, approval orchestration, and the overall direct-chat execution flow.
- The fallback service still depends on injected approval and tool-execution callbacks from the chat module.
- The direct-chat stack is still not yet collapsed into a clearly layered orchestration path.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting approval shaping or direct-tool orchestration into dedicated services.
2. Keep moving from helper extraction to control-flow extraction so the chat module becomes coordination-only.
3. Preserve the exact behavior of the no-provider fast paths while reducing chat-module ownership.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_no_provider_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - No-Provider Fallback Executor Moved Behind Dedicated Service Boundary

#### Stage

Stage 1 continues. The top-level no-provider fallback executor no longer lives inline inside [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).

This is a bigger architectural move than the earlier helper extraction. The chat module still decides when to enter the no-provider path, but the actual fallback execution branch is now owned by [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py).

#### Completed Work

- Expanded [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py) with:
  - `NoProviderExecutionServices`
  - `execute_no_provider_request()`
  - `no_provider_reasoning_required_response()`
- Removed the inline fallback executor body from [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py):
  - deleted `_execute_no_provider_request()`
  - deleted `_no_provider_reasoning_required_response()`
  - replaced them with a thin dependency bundle helper: `_no_provider_execution_services()`
- Updated the direct-chat runtime flow in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so both:
  - obvious direct-tool execution
  - no-provider fallback execution
  now delegate to [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py)
- Expanded focused service coverage in:
  - [server_modules/tests/test_no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_no_provider_service.py)

#### Current Truth

- The no-provider fallback path now has a real execution service boundary, not just helper extraction.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns entrypoint orchestration, but it no longer owns the fallback executor implementation.
- [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py) now owns:
  - lightweight fallback helpers
  - the no-provider reasoning-required payload
  - the actual no-provider execution branch with injected dependencies

#### Open Gaps

- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still owns too much high-level direct-chat orchestration, including provider routing, prompt assembly, and approval control flow.
- The fallback service still depends on injected callbacks from the chat module for planning, approvals, and tool execution.
- The direct-chat engine is still not yet reduced to a thin orchestrator around fully separated services.

#### Next Required Work

1. Continue reducing [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) by extracting more of the direct-chat orchestration surface, not just fallback behavior.
2. Decide whether direct-tool planning and approval shaping should move behind a dedicated service boundary as well.
3. Keep matching the architecture paper by turning `operator_chat.py` into coordination code instead of subsystem ownership.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/no_provider_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_no_provider_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_no_provider_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_no_provider_service`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`

### 2026-04-04 - Direct Chat Memory Extraction Flow Moved Behind Memory Service

#### Stage

Stage 1 continues. The LLM-driven direct-chat memory extraction and persistence loop no longer lives inline inside the chat module.

This still does not make [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) a thin orchestrator yet. Prompt construction, provider selection, tool planning, and no-provider message parsing still remain there.

#### Completed Work

- Expanded [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) with:
  - direct-chat memory fact parsing
  - service-owned best-effort memory extraction and persistence orchestration with an injected generation callable
- Updated [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) so `_persist_direct_chat_memory_best_effort()` now delegates into the canonical memory service and only supplies:
  - the provider-generation callable
  - the extraction prompt
  - the extraction system prompt
- Removed now-dead local helper ownership in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) for:
  - `_parse_direct_chat_memory_facts()`
  - `_save_direct_chat_memory_fact()`
- Added focused service coverage in:
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)

#### Current Truth

- The direct-chat memory extraction loop now crosses [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py) as the service boundary.
- [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py) still triggers that flow, but no longer owns the parsing and persistence implementation details inline.
- The chat module still owns higher-level orchestration decisions and message parsing behavior.

#### Open Gaps

- No-provider memory read/write parsing still lives in [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py).
- The direct-chat engine still mixes prompting, orchestration, approval behavior, and fallback handling in one module.
- The memory service is now the canonical boundary, but the underlying memory implementations are still split between `agent_memory.py` and `runtime_memory.py`.

#### Next Required Work

1. Continue extracting direct-chat orchestration concerns out of [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py), especially around no-provider memory behavior and context assembly triggers.
2. Define the target unified memory contract that hides the split between notebook/workspace memory and runtime semantic memory.
3. Keep test harnesses offline and deterministic as more chat behavior moves behind service boundaries.

#### Verification

- `python3 -m py_compile` passed for:
  - [server_modules/memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py)
  - [server_modules/operator_chat.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/operator_chat.py)
  - [server_modules/tests/test_memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/tests/test_memory_service.py)
- Focused unit tests passed in the project virtualenv:
  - `server_modules.tests.test_memory_service`
  - `server_modules.tests.test_operator_chat`
  - `server_modules.tests.test_operator_chat_no_provider`
  - `server_modules.tests.test_operator_chat_direct_tools`
  - `server_modules.tests.test_direct_chat_service`
  - `server_modules.tests.test_session_transcript_store`
  - `server_modules.tests.test_agent_machine_mode`
