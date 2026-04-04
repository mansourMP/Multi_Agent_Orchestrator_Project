# Empyralis Keep/Archive Matrix (Lean Baseline)

Date: 2026-02-26

## Objective
Keep the runtime path lean and predictable while preserving reference material and legacy assets in archive-only areas.

## Keep Now (Runtime Critical)
- `server.py`
- `bin/orion`
- `scripts/orion_terminal/*`
- `scripts/orion_terminal_wizard.py`
- `scripts/start_orion_local_stack.sh`
- `scripts/stop_orion_local_stack.sh`
- `scripts/status_orion_local_stack.sh`
- `scripts/logs_orion_local_stack.sh`
- `scripts/orion_local_worker.py`
- `backend/src/*`
- `frontend/app/*`
- `frontend/components/Sidebar.tsx`
- `docs/ORION_TERMINAL_ARCHITECTURE.md`
- `docs/ORION_LEAN_REFACTOR_PLAN.md`

## Keep For Near-Term Blueprint (Not Runtime-Critical)
- `reference/openclaw/*` (keep until parity extraction is complete)
- `ORION_OPENCLAW_ADOPTION_BLUEPRINT.md`
- `ORION_PREFLIGHT_UX_AUDIT.md`
- `ORION_OPENCLAW_STRONG_SCAN_REPORT.md`

## Archive Candidates (After Verification)
- `archive/legacy-docs/*` (already archived)
- `archive/legacy-frontend-editor/*` (already archived)
- `reference/hadespy-src/*` (if no active dependency remains)
- dormant top-level operational notes superseded by `docs/*`

## Current Hotspots (Active Code)
- `server.py` (~8043 lines)
- `frontend/app/page.tsx` (~4675 lines)
- `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx` (~1526 lines)
- `scripts/orion_local_worker.py` (~1119 lines)
- `scripts/orion_terminal/core.py` (~1060 lines)

## Lean Rules
1. No new single source file should exceed 800 lines in terminal modules.
2. Runtime monolith files must shrink by extraction, never expand by copy/paste.
3. New feature work must add or update tests in the same phase.
4. Reference code is read-only blueprint material, never mixed into runtime paths.

## Next Splits (Priority Order)
1. `server.py`: extract provider/auth/connectors endpoints into `server_modules/`.
2. `server.py`: extract health/doctor and autopilot status into dedicated modules.
3. `frontend/app/page.tsx`: split to feature sections and API hooks.
4. `scripts/orion_local_worker.py`: split provider adapters and pack formatters.
5. `scripts/orion_terminal/core.py`: split UI rendering vs constants vs transport utilities.

## Enforcement
- Audit: `bash scripts/lean_repo_audit.sh`
- Budget gate (report): `bash scripts/lean_line_budget.sh --report-only`
- Budget gate (strict): `bash scripts/lean_line_budget.sh --strict`

