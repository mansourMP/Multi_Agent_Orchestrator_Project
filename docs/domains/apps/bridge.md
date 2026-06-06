# App Bridge

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: `server_modules/app_bridge_service.py`

## Bridge Contract

`server_modules/app_bridge_service.py` resolves app runtime contracts from the
registry and `config/application_runtime_contract_map.json`.

Bridge requests are normalized through `normalize_bridge_contract(...)` with:

- `app_id`
- `bridge_kind`
- `bridge_type`
- `target`
- `context_envelope`
- `metadata`
- `installed_only`

Unsupported bridge kinds or bridge types are rejected with HTTP 400. Installed
only bridge calls reject apps that are not installed.

Special target requirements:

- `app_to_specialist` requires `target_install_id` or `target_capability`.
- `sage_to_app` requires/resolves `target_app_id`.
- `app_to_connector_runtime` requires `connector_id`, `workflow_id`, or
  `route_key`.

Application bridge routes in `app_registry_api.py` enforce workspace access and
call Sage or specialist installed-agent turn execution only through normalized
bridge metadata.

## Audit

`record_app_bridge_audit(...)` writes an `application_activity` activity event
with bridge kind, bridge type, target, app id, actor, tenant, and workspace.
