# Gateway Runtime

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: gateway code

## Gateway Flow

`empyralis-gateway/src/index.ts` creates a token store, capability router, and
client. On startup it loads pairing or saved gateway credentials, registers from
pairing when a pairing token is present, stores the returned gateway token, and
starts the gateway client.

Backend execution enters through `execute_tool_via_gateway(...)` in
`server_modules/gateway_execution_service.py`. The service:

- loads active registration by `gateway_id`
- maps platform capability ids to supervisor capability ids
- resolves runtime access mode and policy payload
- runs gateway quota and Rust gateway-service decisions
- checks OS permission probes for screen/accessibility-gated capabilities
- verifies registration readiness and liveness
- dispatches a signed tool invoke through `gateway_protocol_service`
- records transparency/activity events and materializes screenshot artifacts

## Offline Behavior

Execution is rejected when the gateway is missing, inactive, offline, heartbeat
stale, unhealthy, degraded, revoked, workspace-mismatched, or missing the
requested capability.
