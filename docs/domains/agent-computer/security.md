# Agent Computer Security

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: gateway, supervisor, and auth code

## Security Controls

- Workspace binding: gateway readiness rejects workspace mismatch in
  `gateway_execution_service.py`.
- Device trust: revoked devices are rejected before dispatch.
- Liveness: dispatch requires a live gateway connection, fresh heartbeat, online
  connection status, and non-degraded health state.
- Capability inventory: dispatch requires the requested capability to be present
  and ready.
- Full Access: allowed only for Sage scope and only after setup-warning
  acknowledgement metadata is present in backend and supervisor checks.
- Permission probes: screen/accessibility capabilities are blocked when the
  gateway metadata reports denied macOS permissions.
- Quota and policy: gateway dispatch runs quota and Rust gateway-service
  decision checks before tool invocation.
- Local audit: backend emits gateway transparency/activity events; supervisor
  persists execution records.
- Secret redaction: gateway activity payloads are sanitized before persistence.

## Gaps To Keep Visible

Migration debt: duplicate/stale gateway registrations can appear in UI and
should be collapsed or hidden without changing the selected Sage Agent Computer
contract.

Migration debt: docs need a single threat-model index tying gateway pairing,
supervisor request signing, token storage, revocation, and emergency-stop
behavior together.
