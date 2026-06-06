# Runtime Security

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: runtime API, runtime common policy, queue, lease, and tests

## Security Controls

- API authentication: most runtime routes are registered with
  `Depends(require_api_key)`.
- Runtime registration: requires a machine enrollment token and runtime-kernel
  decision before local companion registration.
- Self-hosted node enrollment: requires a one-time enrollment token and public
  key, returning a node session token.
- Operator controls: hardware action execute/stop and self-hosted command
  enqueue require workspace owner/admin role and advanced feature access.
- Workspace access: runtime action routes call `enforce_workspace_access(...)`.
- Rate limiting: runtime registration is control-plane rate-limited; runtime
  heartbeat/task paths are hot-path exempt.
- Rust gate: `_enforce_runtime_session_api_decision(...)` maps operations to
  expected next actions and blocks unexpected runtime-kernel decisions.
- Audit: hard-kill and machine-control routes emit security audit events.

## Missing Or Needs Tightening

Migration debt: token expiry and revocation behavior should be documented from
`local_queue.py` with exact storage fields.

Migration debt: hot-path runtime task endpoints need dedicated abuse-control
documentation beyond generic control-plane rate limits.
