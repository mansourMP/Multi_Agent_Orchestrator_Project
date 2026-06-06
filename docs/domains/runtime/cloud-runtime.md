# Cloud Runtime

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: runtime API and service code

## Implemented Hosted/Cloud Controls

Runtime hardware actions can target cloud or hardware runtime targets through
`POST /runtime/hardware/actions/execute` and
`POST /runtime/hardware/actions/stop`. These routes enforce:

- workspace access
- owner/admin operator role
- advanced feature entitlement
- Rust runtime-kernel decision
- hardware action broker execution/stop

Tests in `server_modules/tests/test_runtime_runtime_api.py` cover cloud-style
hardware action execution with `runtime_target=empyralis_cloud_computer` and
`runtime_access_mode=full_access`, and verify non-operator users are blocked.

Hosted runtime entitlement checks live in
`server_modules/entitlements_service.py`. Hosted runtime access can be denied
for unavailable hosted runtime, exhausted monthly minutes, or exhausted
concurrency. Self-hosted business node attachments are treated as self-hosted,
not hosted runtime consumption.

## Difference From Local Runtime

Local runtime registration/worker task flow uses local queue and session tokens.
Hosted/cloud runtime controls are entitlement-gated and brokered through runtime
hardware action APIs rather than local worker claim loops.
