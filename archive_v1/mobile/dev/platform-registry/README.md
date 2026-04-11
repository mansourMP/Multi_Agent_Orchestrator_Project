# Platform Registry Dev Flow

This folder isolates the app-platform catalog from the mobile shell and the main repo root.

The start script will use the repo virtualenv at `/Users/mansur/Multi_Agent_Orchestrator_Project/.venv` automatically when it exists.

## Files

- `platform_registry_server.py`: tiny registry API
- `apps/*.json`: per-app manifests owned by the platform
- `publish_apps.py`: publish local manifests into the registry
- `start_platform_registry.sh`: start the local registry
- `state/registry.json`: local registry state written inside this folder tree

## Start the registry

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/mobile
export EMPYRALIS_PLATFORM_REGISTRY_KEY="replace-this"
bash dev/platform-registry/start_platform_registry.sh
```

## Publish the app manifests

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/mobile
export EMPYRALIS_PLATFORM_REGISTRY_KEY="replace-this"
export EMPYRALIS_PLATFORM_REGISTRY_URL="http://127.0.0.1:8011"
python3 dev/platform-registry/publish_apps.py
```

## Point the mobile app at the registry

- `Platform Registry URL`: `http://<your-mac-ip>:8011`
- `Platform Registry Key`: same key

## Current scope

This is only the catalog layer:

- app discovery
- manifest lookup
- publish/update metadata

The first-run catalog now comes from `apps/*.json`. Those per-app manifests are the real source of truth for local development.

It does **not** yet handle:

- downloadable app bundles
- signatures
- review workflow
- publisher accounts
