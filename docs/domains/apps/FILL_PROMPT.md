# Fill Prompt: Apps Docs

Status: Active prompt
Owner: Platform
Last verified: 2026-06-06

Read:

- `server_modules/app_registry_api.py`
- `server_modules/app_bridge_service.py`
- `server_modules/studio_app_boundary_service.py`
- `server_modules/mini_apps_service.py`
- `server_modules/tests/test_app_registry_api.py`
- `server_modules/tests/test_app_bridge_service.py`
- `server_modules/tests/test_mini_apps_service.py`
- `server_modules/tests/test_mini_apps_service_rust_gate.py`
- `frontend/lib/workspace/hosted-mini-apps-pane.tsx`
- `frontend/lib/workspace/hosted-mini-app-surface.tsx`
- `docs/domains/apps/platform-inventory-and-user-owned-apps.md`
- `docs/domains/apps/extension-manifest-contract.md`

Fill Apps docs with code-backed facts only.

Required output:

- Define app categories that actually exist in code.
- Explain app registration and manifest rules.
- Explain the app bridge and exposed capabilities.
- Explain user-owned credentials vs platform credentials.
- Explain app permissions, limits, and credit usage.
- Document tests and missing tests.

Do not invent a marketplace policy here. Put decisions in `docs/decisions/`.
