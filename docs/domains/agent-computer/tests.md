# Agent Computer Tests

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: test suite

## Existing Focus Areas

Known test paths from the inspected tree:

- `server_modules/tests/test_agent_channel_router_rust_gate.py`
- `server_modules/tests/test_local_queue_rust_gate.py`
- `server_modules/tests/test_runtime_runtime_api.py`
- `empyralis-supervisor/src/main.rs` unit tests for signed request verification,
  Full Access policy, and active execution interrupt behavior.

## Required Coverage Before Shipping Agent Computer Changes

- Full Access requires Sage scope.
- Full Access requires setup-warning acknowledgement.
- Non-Sage scopes cannot inherit Full Access.
- Gateway dispatch rejects offline, inactive, stale-heartbeat, unhealthy,
  degraded, revoked, workspace-mismatched, and missing-capability states.
- Screen recording and accessibility denial block relevant capabilities.
- Gateway quota and Rust gateway-service decisions are called before dispatch.
- Supervisor shell/filesystem policy handles Full Access and allowed roots
  correctly.
- Activity/audit events redact secrets.

Focused commands:

```bash
python -m pytest server_modules/tests/test_runtime_runtime_api.py
cargo test --manifest-path empyralis-supervisor/Cargo.toml
```
