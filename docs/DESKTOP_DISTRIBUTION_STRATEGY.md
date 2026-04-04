# Desktop Distribution Strategy

## Current State

Empyralis is web-first.

- Primary product surface: web application
- Preferred installable experience: PWA
- Packaged desktop shell: Tauri in [src-tauri](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri)
- Frozen legacy shell: Electron in [desktop](/Users/mansur/Multi_Agent_Orchestrator_Project/desktop)

## What This Means

- The web app remains the main control plane.
- Desktop packaging exists, but it should stay aligned with the web app rather than becoming a separate product.
- The old Electron wrapper is retained only for local bridge and compatibility reasons.

## Current Desktop Build Path

- Tauri config: [src-tauri/tauri.conf.json](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/tauri.conf.json)
- Tauri Rust entrypoints: [src-tauri/src/main.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/main.rs), [src-tauri/src/lib.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/lib.rs)
- Build helper: [scripts/build_empyralis_desktop.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/build_empyralis_desktop.sh)

## Packaging Rule

If a desktop-specific change conflicts with the web/PWA product path, prefer the web/PWA path unless there is a concrete local-system requirement that only the desktop shell can satisfy.
