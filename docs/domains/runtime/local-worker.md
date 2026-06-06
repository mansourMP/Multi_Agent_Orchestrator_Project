# Local Worker Runtime

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: local queue and worker runtime code

## Worker Flow

Local workers register through the runtime registration endpoint, then use
runtime task endpoints with `runtime_id`, `session_token`, and `instance_id`.
The runtime API defines payloads for:

- task claim
- task heartbeat
- task control-state read
- task completion
- task pause
- task failure

Worker-side behavior lives in `scripts/orion_local_worker_runtime.py`. Tests
cover stale-token retry, structured heartbeat events, runtime control-state
payloads, pause retry, supervisor interrupt calls, and hard-kill behavior.

`runtime_status_payload()` calls
`local_queue.recover_orphaned_local_runs_on_startup()` and returns normalized
worker summaries including workspace, machine/runtime ids, policy mode,
capabilities, online state, current task, lease holder, trust state, permission
probe, lifecycle state, health state, summary/artifact channels, and control
state.

## Queue And Lease Facts

Task summaries include `lease_seconds`, `machine_id`, `machine_lease_id`,
required capabilities, policy mode, context, metadata, and run payload. Self
hosted command claims accept `max_commands` and `lease_seconds`, bounded by the
Pydantic payload model.
