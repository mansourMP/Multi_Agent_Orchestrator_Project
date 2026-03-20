# Empyralis Lean Refactor Plan (Phase 0/1)

## Goal
Reduce repo and terminal complexity without breaking current runtime behavior.

## Baseline Snapshot (2026-02-26)
- Empyralis terminal code: `5786` lines across `scripts/orion_terminal/*.py`.
- Main hotspots:
  - `scripts/orion_terminal/flows_run.py` (`1257`)
  - `scripts/orion_terminal/core.py` (`1054`)
  - `scripts/orion_terminal/flows_setup.py` (`949`)
  - `scripts/orion_terminal/flows_shared.py` (`787`)
- Runtime API hotspot:
  - `server.py` (`8020`)
- Large directories:
  - `frontend` (`1.2G`)
  - `backend` (`665M`)
  - `python_engine` (`411M`)
  - `reference` (`94M`)
  - `archive` (`600K`)

## Keep / Critical Path
These files/dirs are runtime-critical for current Empyralis stack and should stay first-class:
- `server.py`
- `scripts/orion_terminal/*`
- `scripts/start_orion_local_stack.sh`
- `scripts/stop_orion_local_stack.sh`
- `scripts/status_orion_local_stack.sh`
- `scripts/logs_orion_local_stack.sh`
- `scripts/orion_local_worker.py`
- `bin/orion`
- `backend/src/*`
- `frontend/app/*`
- `docs/QUICKSTART_ORION_AUTOPILOT.md`
- `docs/ORION_TERMINAL_ARCHITECTURE.md`

## Archive / De-scope Candidates
These are not required for runtime path and can be de-scoped after review:
- `archive/legacy-docs/*` (already legacy)
- `archive/legacy-frontend-editor/*` (already legacy)
- top-level historical docs superseded by `docs/*`
- `reference/hadespy-src/*` unless actively used
- `reference/openclaw/*` after architecture parity work is complete

## Immediate Safe Cleanup (Non-breaking)
1. Ignore machine-local runtime state in git:
   - `.orion/`, `.orion-stack/`, state json files, vault key, `screenshots/`
2. Add repeatable audit and baseline scripts:
   - `scripts/lean_repo_audit.sh`
   - `scripts/orion_baseline_smoke.sh`
3. Keep all behavior unchanged while collecting regression baseline.

## Terminal Refactor Plan (Lean-by-Design)
Target architecture for `scripts/orion_terminal`:
- `flow/launcher.py`
- `flow/setup.py`
- `flow/preflight.py`
- `flow/run.py`
- `flow/live_tui.py`
- `ui/selectors.py`
- `ui/notes.py`
- `ui/spinner.py`
- `services/providers.py`
- `services/connectors.py`
- `services/sessions.py`
- `clients/runtime.py`
- `models.py`
- `constants.py`

## Code Moves (Priority)
1. Move duplicated collectors from `flows_shared.py` into one generic selector utility.
2. Move spinner and stream formatting from `flows_shared.py` into `ui/spinner.py`.
3. Move provider/auth/model helper logic from `flows_shared.py` into `services/providers.py`.
4. Move connector creation/validation helpers into `services/connectors.py`.
5. Keep `flows.py` as compatibility export only.

## Definition of Done (Phase 1)
- No behavior changes to setup/run flows.
- Baseline smoke script passes.
- `flows_shared.py` reduced by at least 35%.
- No duplicate section/channel collector functions.
- Every new module under 400 lines.

## Phase 1 Status (2026-02-26)
- Implemented shared runtime flags module: `scripts/orion_terminal/runtime_flags.py`.
- Implemented shared text helpers module: `scripts/orion_terminal/text_format.py`.
- Implemented shared spinner module: `scripts/orion_terminal/spinner.py`.
- Moved provider registry mappings/resolvers to `scripts/orion_terminal/services/provider_registry.py`.
- Moved channel mapping to `scripts/orion_terminal/services/channel_registry.py`.
- Moved connector creation/catalog logic to `scripts/orion_terminal/services/connectors.py`.
- Moved provider credential/session/profile logic to `scripts/orion_terminal/services/provider_credentials.py`.
- Moved live TUI dashboard/history/approval helpers to `scripts/orion_terminal/services/live_tui.py`.
- Added generic multi-select collector in `scripts/orion_terminal/services/selection.py`.
- Refactored `scripts/orion_terminal/flows_shared.py` from 787 to 285 lines (63.8% reduction).
- Refactored `scripts/orion_terminal/flows_run.py` from 1257 to 684 lines.
- Added unit tests:
  - `scripts/orion_terminal/tests/test_selection.py`
  - `scripts/orion_terminal/tests/test_text_format.py`

## Phase 2 Status (2026-02-26)
- Split setup flow monolith into focused modules:
  - `scripts/orion_terminal/flows_orion_setup.py`
  - `scripts/orion_terminal/flows_preflight.py`
  - `scripts/orion_terminal/flows_onboard.py`
  - `scripts/orion_terminal/flows_configure.py`
- Converted `scripts/orion_terminal/flows_setup.py` into compatibility exports only.
- Flow size outcome:
  - `flows_setup.py`: `949 -> 13` lines
  - `flows_orion_setup.py`: `581`
  - `flows_preflight.py`: `245`
  - `flows_onboard.py`: `53`
  - `flows_configure.py`: `109`
- All flow modules now satisfy the “under 800 lines” target.

## Next Slice (Phase 3)
- Convert Live TUI `if/elif` command loop into action registry + handlers.
- Move run/history/metrics/queue/approval action dispatch into `services/live_tui_actions.py`.
- Keep transcript/labels unchanged while reducing branching complexity in `flows_run.py`.

## Phase 3 Status (2026-02-26)
- Live TUI now dispatches via `action_handlers` registry in `scripts/orion_terminal/flows_run.py`.
- Replaced long `if/elif` action chain with explicit handler functions:
  - dashboard/status/runs/queue/metrics/approval/connectors
  - mode/trust/target updates
  - run and advanced command paths
- Behavior preserved:
  - dashboard refresh loop
  - run replay/stream path
  - slash-command handling in advanced input
  - exit flow semantics

## Phase 4 Status (2026-02-26)
- Added transcript snapshot suite:
  - `scripts/orion_terminal/tests/test_transcript_snapshots.py`
  - snapshots under `scripts/orion_terminal/tests/snapshots/`
- Added flow integration tests (stubbed runtime, deterministic UI):
  - `scripts/orion_terminal/tests/test_flows_integration.py`
  - coverage for setup/preflight/configure/live-tui critical paths
- Added shared test helpers:
  - `scripts/orion_terminal/tests/helpers.py`
- Validation:
  - `python3 -m unittest discover -s scripts/orion_terminal/tests -p 'test_*.py'` passing
  - baseline smoke and run sanity checks still passing

## Phase 5 Status (2026-02-26)
- Added typed terminal error taxonomy and mapper:
  - `scripts/orion_terminal/errors.py`
  - classes: `RuntimeUnavailable`, `AuthExpired`, `PermissionDenied`, `ValidationFailed`, `ConflictState`, `TimeoutExceeded`, `TransientUpstreamError`, `CompatibilityError`
- Upgraded runtime client hardening:
  - `scripts/orion_terminal/clients/runtime.py`
  - CLI headers: `X-Empyralis-CLI-Version`, `X-Empyralis-CLI-Session`
  - Idempotency key support for mutating calls (`X-Idempotency-Key`)
  - bounded retry/backoff for retryable failures
  - runtime compatibility checks (`runtime_api_version`, `runtime_api_min_cli_version`)
- Added workspace-local state persistence:
  - `scripts/orion_terminal/state/schemas.py`
  - `scripts/orion_terminal/state/workspace.py`
  - `scripts/orion_terminal/state/__init__.py`
- Wired preflight defaults to persisted workspace state:
  - `scripts/orion_terminal/flows_preflight.py`
  - persists/resumes execution target, trust mode, provider, credential source, model source, connector choice, file scope
- Runtime contract exposed by server and visible in doctor/status:
  - `server.py` (`/health` now returns runtime contract versions)
  - `server.py` doctor adds `runtime_contract` check
  - `bin/orion` status prints runtime API/min CLI versions
- Added tests for new hardening layer:
  - `scripts/orion_terminal/tests/test_errors.py`
  - `scripts/orion_terminal/tests/test_runtime_client.py`
  - `scripts/orion_terminal/tests/test_workspace_state.py`

## Phase 6 Status (2026-02-26)
- Strengthened lean governance and repository hygiene:
  - upgraded `scripts/lean_repo_audit.sh` with active-code filtering and hotspot reporting
  - added `scripts/lean_line_budget.sh` (report + strict modes)
  - added keep/archive matrix: `docs/ORION_LEAN_KEEP_ARCHIVE_MATRIX.md`
- New enforcement commands:
  - `bash scripts/lean_repo_audit.sh`
  - `bash scripts/lean_line_budget.sh --report-only`
  - `bash scripts/lean_line_budget.sh --strict`

## Phase 7 Status (2026-02-26)
- Extracted runtime doctor report logic from `server.py` into:
  - `server_modules/doctor_report.py`
  - `server_modules/__init__.py`
- `server.py` now delegates `/doctor` endpoint to `build_doctor_report(...)`.
- Server hotspot reduction:
  - `server.py`: `8043 -> 7711` lines
- Extracted Empyralis dashboard/page catalogs and UI/types from:
  - `frontend/app/page.tsx` -> `frontend/app/page.catalog.ts`
- Frontend hotspot reduction:
  - `frontend/app/page.tsx`: `4675 -> 4206` lines
- Validation:
  - `python3 -m py_compile server.py server_modules/doctor_report.py` passing
  - `npx tsc --noEmit` passing
  - `/doctor` runtime smoke check returning expected shape

## Phase 8 Status (2026-02-26)
- Extracted runtime health/probe helpers from `server.py` into:
  - `server_modules/runtime_status.py`
  - functions: `probe_openai_credential`, `collect_runtime_counts`, `collect_local_queue_counts`, `build_probe_payload`
- `server.py` now delegates `/health` OpenAI probe logic and `/probe` count assembly to shared server modules.
- Extracted local-worker content plan normalization into:
  - `scripts/orion_local_worker_content.py`
  - `scripts/orion_local_worker.py` reduced from `1119 -> 938` lines.
- Lean budget enforcement tightened and switched to strict-first:
  - `scripts/lean_line_budget.sh` now defaults to `--strict`
  - thresholds tightened to current hotspot targets
  - `scripts/lean_repo_audit.sh` now runs strict budget gate
- Validation:
  - `python3 -m py_compile server.py server_modules/*.py scripts/orion_local_worker.py scripts/orion_local_worker_content.py` passing
  - `python3 -m unittest discover -s scripts/orion_terminal/tests -p 'test_*.py'` passing (19 tests)
  - `frontend: npx tsc --noEmit` passing

## Phase 9 Status (2026-02-26)
- Split local-worker LLM/provider stack from `scripts/orion_local_worker.py` into:
  - `scripts/orion_local_worker_llm.py`
  - includes provider credentials, provider fallback order, model calls (OpenAI/Anthropic/Gemini/Ollama), usage masking.
- Kept content-plan normalization in:
  - `scripts/orion_local_worker_content.py`
- Local worker hotspot reduction:
  - `scripts/orion_local_worker.py`: `938 -> 508` lines
  - `scripts/orion_local_worker_llm.py`: `441` lines
- Validation:
  - `python3 -m py_compile` passing for runtime/server/worker/terminal modules
  - terminal unit tests passing (19 tests)
  - `npx tsc --noEmit` passing
  - strict lean budget gate passing (`0` violations)

## Phase 10 Status (2026-02-26)
- Added parity execution blueprint:
  - `docs/ORION_PARITY_EXECUTION_PLAN.md`
- Added parity scanner gate:
  - `scripts/openclaw_parity_scan.sh`
- Scanner verifies:
  - prompt/flow/service/runtime ownership files
  - onboarding/configure/provider/channel/runtime parity checks
  - strict line-budget and terminal tests
- Current scanner status:
  - `summary: pass=30 miss=0`

## Phase 11 Status (2026-02-26)
- Selector UX parity patch:
  - active option note now renders directly under selected row (instead of inline clutter or bottom drift)
  - applied to both selector paths:
    - `scripts/orion_terminal/widgets.py`
    - `scripts/orion_terminal/prompt_engine.py`
- Compact layout preserved by reserving note rows dynamically.
- Validation:
  - `python3 -m py_compile` passing for selector modules
  - terminal unit tests passing (19 tests)
  - parity scanner passing (`pass=30 miss=0`)

## Risks to Avoid
- Do not delete `reference/openclaw` before parity extraction is complete.
- Do not split `server.py` and terminal refactor in the same PR.
- Do not migrate UI text and flow branching in one pass; split into separate commits.
