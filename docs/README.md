# Documentation Guide

This repository contains both current product documentation and older planning or research notes.

Use this file to decide what is authoritative.

## Authoritative Docs

These files describe the current repo shape and should be read first:

- [README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/README.md)
- [docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md)
- [docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md)
- [docs/DESKTOP_DISTRIBUTION_STRATEGY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/DESKTOP_DISTRIBUTION_STRATEGY.md)
- [docs/EMPYRALIS_DESKTOP_APP.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_DESKTOP_APP.md)
- [frontend/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/README.md)
- [mobile/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/README.md)
- [runtime/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/runtime/README.md)

## Current Code Paths

- Web app: [frontend](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend)
- Python runtime/backend: [server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server.py), [server_modules](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules), [scripts](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts)
- Mobile app: [mobile](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile)
- Desktop shell: [src-tauri](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri)

## Active Docs Surface

The active `/docs` surface is intentionally small.

Keep only:

- [docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md)
- [docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md)
- [docs/DESKTOP_DISTRIBUTION_STRATEGY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/DESKTOP_DISTRIBUTION_STRATEGY.md)
- [docs/EMPYRALIS_DESKTOP_APP.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_DESKTOP_APP.md)
- [docs/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/README.md)

## Historical Or Research-Only Material

Treat these as non-authoritative unless a current doc points to them explicitly:

- `docs/ORION_*`
- `docs/HEKOR_*`
- versioned design docs such as `docs/*_V1.md`, `docs/*_V2.md`, and similar blueprint files
- [archive/legacy-docs](/Users/mansur/Multi_Agent_Orchestrator_Project/archive/legacy-docs)
- [reference](/Users/mansur/Multi_Agent_Orchestrator_Project/reference)
- the parallel NestJS backend in [backend](/Users/mansur/Multi_Agent_Orchestrator_Project/backend)
- root notes such as archived context, versioned notes, and test summaries moved out of the repo root

## Rule Of Thumb

If a document conflicts with the current code or with the authoritative docs above, trust the code and the authoritative docs.
