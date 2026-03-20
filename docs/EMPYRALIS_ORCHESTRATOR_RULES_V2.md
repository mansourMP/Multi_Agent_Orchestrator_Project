# Empyralis Orchestrator Rules V2

## Goal
Add completion awareness and merged orchestration summary on top of:
- manual delegation
- auto-delegation V1

This phase does not add a new agent planner. It adds runtime awareness for child-run outcomes.

## What V2 adds
- parent run detail now includes `delegation_summary`
- `Run Inspect` shows an `Orchestration summary` block when child runs exist
- summary tracks:
  - total children
  - completed
  - failed
  - waiting
  - active
  - child roles
  - merged summary text

## Runtime behavior
The summary is computed live from the parent run and its known child runs.

If child runs are still active:
- `ready = false`
- `overall_status = active`

If all child runs are terminal:
- `ready = true`
- `overall_status = completed` if none failed
- `overall_status = attention` if any failed

## Summary merge
The merged summary text is derived from child run outcomes:
- completed child runs contribute their `result_summary`
- failed child runs contribute `failed`
- waiting child runs contribute `waiting`

This keeps the parent orchestrator view readable without hiding the actual child runs.

## UI
`Run Inspect -> Delegation` now shows:
- child runs table
- orchestration summary block
- manual child-run creation
- auto-plan delegation button

## Smoke coverage
- `A19 orchestrator auto-delegation`
- `A20 orchestration summary merge`

`A20` waits for the auto-generated child runs to finish, then verifies:
- summary is ready
- completed children count is populated
- `research` and `builder` roles are present
- summary text is non-empty
