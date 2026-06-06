# Apps Tests

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: app test files

## Current Tests

- `server_modules/tests/test_app_registry_api.py`: app registry route behavior,
  install/update/uninstall behavior, and registry normalization.
- `server_modules/tests/test_app_bridge_service.py`: bridge contract
  normalization, forbidden metadata, target requirements, and app runtime
  contract behavior.
- `server_modules/tests/test_mini_apps_service.py`: hosted mini-app service
  behavior.
- `server_modules/tests/test_mini_apps_service_rust_gate.py`: Rust-gated
  mini-app behavior.

Focused command:

```bash
python -m pytest \
  server_modules/tests/test_app_registry_api.py \
  server_modules/tests/test_app_bridge_service.py \
  server_modules/tests/test_mini_apps_service.py \
  server_modules/tests/test_mini_apps_service_rust_gate.py
```

## Missing Coverage To Keep Visible

- browser/frame origin restrictions for hosted mini-apps
- full app permission approval/revocation flow
- app-triggered hosted AI ledger attribution by `app_id`
