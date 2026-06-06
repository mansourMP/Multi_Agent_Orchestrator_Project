# Runtime Enrollment

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: `server_modules/runtime_runtime_api.py`

## Current Enrollment Flow

Runtime registration is exposed at
`POST /runtime/runtimes/{runtime_id}/register` in
`server_modules/runtime_runtime_api.py` and requires `require_api_key`.

The payload must include a non-empty `enrollment_token`. Missing token is
rejected with HTTP 403: `Runtime registration requires a machine enrollment
token.`

Before registration is persisted, `_enforce_runtime_session_api_decision(...)`
calls the Rust runtime kernel with operation `runtime_register`,
`runtime_id`, `runtime_type`, `runtime_role`, `instance_id`,
`enrollment_token_present=true`, and the requested capabilities.

Successful registration delegates to
`local_queue.handle_bootstrap_enrolled_local_companion_runtime(...)`, then
returns:

- `ok`
- normalized `runtime`
- `session_token`
- `machine_id`
- `instance_id`
- `capability_digest`
- `session_issued_at`
- `enrollment_bootstrap=true`
- `connection_mode`

Self-hosted runtime profiles use a separate endpoint:
`POST /runtime/self-hosted-nodes/{runtime_profile_id}/enroll`. It requires a
one-time enrollment token and public key, then returns a `node_session_token`.

## Denial Behavior

Runtime registration is now rate-limited as a control-plane mutation. Tests in
`server_modules/tests/test_runtime_common.py` assert
`/runtime/runtimes/{id}/register` is not exempt.
