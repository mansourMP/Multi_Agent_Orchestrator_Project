# Runtime Session Tokens

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: runtime API and runtime common code

## Token Types

Local companion registration returns a `session_token` and `instance_id` from
`local_queue.handle_bootstrap_enrolled_local_companion_runtime(...)`.
Subsequent worker calls pass `session_token`, `runtime_id`, and `instance_id`
through heartbeat, task claim, control-state, complete, pause, and fail payloads.

Self-hosted node enrollment returns `node_session_token`. Self-hosted heartbeat,
command claim, and command result routes require that token.

## Validation And Renewal

The worker client in `scripts/orion_local_worker_runtime.py` retries heartbeat,
completion, pause, and control calls after a stale-session failure by
re-registering and using the fresh session token. Tests in
`server_modules/tests/test_orion_local_worker_runtime.py` assert the retry uses
the newly issued token and instance id.

Runtime API decisions include `runtime_session_valid` and session-token fields
when calling the Rust runtime kernel.

## Gaps

Migration debt: this pass did not verify the exact persisted expiry/revocation
fields inside `local_queue.py`; keep token lifetime and revocation semantics
code-cited before relying on them in a security brief.
