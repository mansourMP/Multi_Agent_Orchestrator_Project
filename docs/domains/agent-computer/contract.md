# Agent Computer Contract

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: gateway and policy code

## Contract

Agent Computer is the hardware lane used for local actions that cannot be done
as plain cloud/server API work. Gateway dispatch requires an active gateway
registration for the workspace, a live gateway connection, a fresh heartbeat,
reported online/healthy state, and the requested capability in the gateway
inventory. These checks are enforced in
`server_modules/gateway_execution_service.py`.

Sage and Studio do not share the same Full Access lane. Full Access dispatch is
blocked unless `agent_scope` resolves to `sage`; non-Sage scopes receive
`full_access Agent Computer execution is available only to Sage.`

The selected computer is represented by gateway registration metadata and
workspace binding. Gateway readiness rejects missing registrations, inactive
registrations, revoked devices, workspace mismatch, offline connections, stale
heartbeats, unhealthy/degraded reports, and missing capability readiness.

## Forbidden Inheritance

Studio/app metadata cannot silently inherit owner resources such as
`gateway_id`, `runtime_session_id`, `sage_memory`, `personal_channel`, or
`owner_files`; these owner-resource names are blocked by
`server_modules/studio_app_boundary_service.py` and app bridge enforcement.
