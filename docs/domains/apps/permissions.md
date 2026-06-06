# App Permissions

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: app registry, app bridge, and mini-app services

## Permission Representation

Registry app permissions are simple string ids stored on each registry item.
Observed defaults include:

- `files.read`
- `files.write`
- `device.control`

`resolve_app_permissions(app_id)` returns permissions only when the app exists
and has `status=installed`; available/uninstalled apps return no permissions.

## Boundary Enforcement

App bridge metadata blocks implicit owner-resource access. Forbidden fields and
action values include Sage/private memory, specialist memory, raw context
imports, screenshots, computer control, shell, MCP, skills, local companion,
runtime target, runtime session id, and tool calls.

`server_modules/studio_app_boundary_service.py` also blocks owner-resource keys
such as `gateway_id`, `runtime_node_id`, `runtime_profile_id`,
`runtime_session_id`, `sage_memory`, `personal_channel`, and `owner_files`.

## Gaps

Migration debt: app registry permissions are represented and read, but this pass
did not verify a complete per-permission approval UI or revocation flow.
