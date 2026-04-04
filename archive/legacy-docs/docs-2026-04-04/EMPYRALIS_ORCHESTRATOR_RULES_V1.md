# Empyralis Orchestrator Rules V1

## Goal
Add a narrow automatic delegation layer on top of the existing manual parent/child run system.

This phase does not introduce a second orchestration engine. It reuses:
- orchestrator-owned runs
- delegated child runs
- existing parent/child run metadata
- existing `Run Inspect` delegation UI

## What V1 does
- Adds `POST /runs/{run_id}/delegate/auto`
- Only works for orchestrator-owned runs
- Generates specialist child runs from simple deterministic rules
- Reuses the same child-run creation path as manual delegation

## Specialist rule mapping
The current V1 rules can target:
- `research`
- `builder`
- `sales`
- `support`
- `finance`
- `private-assistant`

Rules are derived from:
- parent `user_goal`
- parent `business_plan`
- parent `result_summary`
- parent skill scope hints

## V1 behavior
- If the parent objective mentions planning, market, launch, research, or strategy:
  - create a `research` child run
- If it mentions build, implement, fix, platform, app, code, or automation:
  - create a `builder` child run
- Other specialist roles are triggered by their own keyword families
- If nothing matches:
  - create at least one `research` child run

## UI
`Run Inspect -> Delegation` now has:
- manual child-run creation
- `Auto-plan delegation`

The auto action:
- creates up to 3 child runs
- shows a success notice with the created specialist roles
- reloads the parent run so child runs appear immediately

## Smoke coverage
`A19 orchestrator auto-delegation`

The smoke creates an orchestrator run with a goal that should produce:
- `research`
- `builder`

The test passes when:
- the endpoint returns at least 2 child runs
- returned child roles include `research` and `builder`
- the parent run detail shows those child roles too

## Limits
V1 is deterministic and narrow.

It does not yet:
- infer complex plans from long execution history
- retry or rebalance child runs
- wait for child completion before planning further steps
- merge child outputs back into a structured orchestrator summary

Those are V2/V3 concerns.
