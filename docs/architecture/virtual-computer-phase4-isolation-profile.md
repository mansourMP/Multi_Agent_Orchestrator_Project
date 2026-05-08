# Virtual Computer Phase VC-4 Isolation Profile

Status: active contract for VC-4.

## Goal

Every virtual computer session starts locked down with enforceable runtime isolation defaults.

## Enforced Isolation Controls

Implemented in `server_modules/virtual_computer_runtime.py`:

- Filesystem quota (`filesystem_quota_bytes`)
- CPU quota (`cpu_quota_seconds`)
- Memory quota (`memory_quota_mb`)
- Runtime TTL auto-destroy (`runtime_ttl_seconds`)
- Network egress controls:
  - metadata endpoint denylist
  - private LAN/localhost blocked by default
  - host allowlist support (`allowed_hosts`)
- Clipboard disabled by default
- File upload/download disabled by default
- Kill switch support (`kill_switch` action + terminate path)
- Cost/quota guardrail:
  - per-session cost limit
  - workspace budget limit
  - provider concurrency limit
  - idle timeout
  - cost unit and estimated create/action cost

## Session Enforcement

Session isolation is tracked per session with:

- `created_at_epoch`
- `expires_at_epoch`
- `terminated`
- `termination_reason`

Each runtime operation checks active isolation state before executing actions.

## Runtime Surfaces Covered

- `LocalGatewayVirtualComputerRuntime`
- `InMemoryVirtualComputerRuntime`

Both now return `isolation_profile` and `ttl_expires_at_epoch` in responses.

Both also return:

- `cost_quota`
- `cost_usage`

This keeps cost controls in the foundation before live provider provisioning.
