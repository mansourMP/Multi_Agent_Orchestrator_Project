# Empyralis Parity Execution Plan

## Objective
Adopt proven terminal/onboarding/runtime UX patterns from OpenClaw while keeping Empyralis branding, wording, and architecture.

## Rules
- Copy behavior patterns, not brand text.
- Keep Empyralis command names and docs.
- No regression on current runtime APIs.
- Every parity slice must ship with tests and strict line-budget pass.

## Parity Scope (Must Match Behavior)
1. Prompt engine consistency:
- Single prompt contract for select, multiselect, confirm, input.
- Consistent keybind hints and cancellation semantics.

2. Configure/onboarding question flow:
- Gateway location.
- Section selection (including continue/skip behavior).
- Onboarding mode.
- Config handling.
- Provider/auth selection.
- Model filter.
- Channel setup.
- Final confirm/start behavior.

3. Provider/auth breadth:
- API key + token modes.
- Saved credential vs runtime/env vs setup later.
- Provider/model fallback behavior.

4. Channel onboarding:
- Registry-driven connector list.
- Per-connector schema-driven prompts.
- Retry-safe validation and clear errors.

5. Runtime operator loop:
- Predictable action menu.
- Status/metrics/recent runs/approval flows.
- Short progress + reliable completion/failure states.

## Empyralis File Ownership (Source of Truth)
- Prompt contracts and render path:
  - `scripts/orion_terminal/prompt_contracts.py`
  - `scripts/orion_terminal/prompt_engine.py`
  - `scripts/orion_terminal/widgets.py`
  - `scripts/orion_terminal/core.py`
- Flows:
  - `scripts/orion_terminal/flows_launcher.py`
  - `scripts/orion_terminal/flows_orion_setup.py`
  - `scripts/orion_terminal/flows_preflight.py`
  - `scripts/orion_terminal/flows_run.py`
  - `scripts/orion_terminal/flows_configure.py`
  - `scripts/orion_terminal/flows_onboard.py`
- Services:
  - `scripts/orion_terminal/services/provider_registry.py`
  - `scripts/orion_terminal/services/provider_credentials.py`
  - `scripts/orion_terminal/services/connectors.py`
  - `scripts/orion_terminal/services/live_tui.py`
- Runtime:
  - `server.py`
  - `server_modules/doctor_report.py`
  - `server_modules/runtime_status.py`

## Execution Phases
### Phase A: Prompt Engine Parity
- Normalize all selector/help/footer rendering through one path.
- Ensure inline description appears directly under active option.
- Add snapshot tests for launcher/setup/configure selectors.

### Phase B: Onboarding/Configure Parity
- Enforce question order and skip/continue semantics.
- Remove extra branching where not needed.
- Keep transcript concise and deterministic.

### Phase C: Provider/Auth/Model Parity
- Unify provider choice + credential source choice + model filtering.
- Add explicit token mode handling where supported.

### Phase D: Connector Parity
- Move connector prompt schemas fully to registry-driven definitions.
- Add connector validation test cases.

### Phase E: Runtime Loop Parity
- Tighten live progress states and terminal result semantics.
- Add end-to-end test for run start -> running -> terminal result.

## Definition of Done
- All parity checklist items pass in `scripts/openclaw_parity_scan.sh`.
- `python3 -m unittest discover -s scripts/orion_terminal/tests -p 'test_*.py'` passes.
- `npx tsc --noEmit` passes.
- `bash scripts/lean_line_budget.sh --strict` passes.
- No runtime regression in `/health`, `/probe`, `/doctor`.
