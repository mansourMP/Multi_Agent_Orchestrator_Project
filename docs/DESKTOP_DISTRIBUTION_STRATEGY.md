# Desktop Distribution Strategy

## Current State

Empyralis is mobile-first for daily use and desktop-power for deep control.

- Daily-use default surface: mobile application
- Desktop-power surfaces: browser-hosted workspace and packaged desktop shell
- Packaged desktop shell: Tauri in [src-tauri](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri)
- Archived legacy Electron shell: removed from the active repo tree

## What This Means

- The browser-hosted workspace and the Tauri shell are one desktop-power family.
- Desktop packaging exists to support deeper building, configuration, and control work.
- Tauri is the only supported packaged desktop shell.
- Any legacy Electron notes are historical only and not part of the active runtime.

## Current Desktop Build Path

- Tauri config: [src-tauri/tauri.conf.json](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/tauri.conf.json)
- Tauri Rust entrypoints: [src-tauri/src/main.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/main.rs), [src-tauri/src/lib.rs](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri/src/lib.rs)
- Build helper: [scripts/build_empyralis_desktop.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/build_empyralis_desktop.sh)

## Packaging Rule

If a desktop-specific change conflicts with the mobile-first daily-use product model, keep daily use on mobile and reserve deeper configuration, builder, and runtime-control depth for the desktop-power surfaces.
