# Empyralis

Empyralis is the current AI agent workspace in this repository.

This repo contains a live Python runtime/backend, a Next.js web app, an Expo mobile app, and a Tauri desktop shell. It also contains older Orion, Hekor, AgentForge, and NestJS-era material that is still useful for reference but is not the primary product path.

## Read This First

These files are the current documentation entry points:

- [README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/README.md)
- [docs/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/README.md)
- [docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md)
- [docs/EMPYRALIS_EXECUTION_LEDGER.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_EXECUTION_LEDGER.md)
- [docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md)
- [docs/DESKTOP_DISTRIBUTION_STRATEGY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/DESKTOP_DISTRIBUTION_STRATEGY.md)
- [docs/EMPYRALIS_DESKTOP_APP.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_DESKTOP_APP.md)
- [frontend/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend/README.md)
- [mobile/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile/README.md)
- [runtime/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/runtime/README.md)

If another doc conflicts with these files, treat these files as authoritative.

The platform architecture source of truth is:

- [docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_CANONICAL_ARCHITECTURE.md)

The append-only implementation and progress ledger is:

- [docs/EMPYRALIS_EXECUTION_LEDGER.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_EXECUTION_LEDGER.md)

## Current Product Shape

- Web app: [frontend](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend)
- Primary backend/runtime: [server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server.py) and [server_modules](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules)
- Local stack scripts: [scripts](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts)
- Mobile app: [mobile](/Users/mansur/Multi_Agent_Orchestrator_Project/mobile)
- Desktop shell: [src-tauri](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri)

Older but still present:

- Frozen Electron wrapper: [desktop](/Users/mansur/Multi_Agent_Orchestrator_Project/desktop)
- Legacy parallel NestJS backend: [backend](/Users/mansur/Multi_Agent_Orchestrator_Project/backend)
- Archived plans and legacy docs: [archive/legacy-docs](/Users/mansur/Multi_Agent_Orchestrator_Project/archive/legacy-docs)
- Reference repos used for research: [reference](/Users/mansur/Multi_Agent_Orchestrator_Project/reference)

## Local Quickstart

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Start the local stack from the repo root:

```bash
RUNTIME_KEY='replace-with-strong-key' bash scripts/start_empyralis_local_stack.sh
```

Useful helpers:

```bash
bash scripts/status_empyralis_local_stack.sh
bash scripts/logs_empyralis_local_stack.sh
bash scripts/stop_empyralis_local_stack.sh
```

Open the web app:

```bash
open http://127.0.0.1:3000
```

The maintained operator quickstart is:

- [docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/QUICKSTART_EMPYRALIS_AUTOPILOT.md)

## Distribution

Empyralis is web-first.

- Primary experience: web app
- Installable option: PWA
- Packaged desktop shell: Tauri in [src-tauri](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri)
- Frozen legacy shell: Electron in [desktop](/Users/mansur/Multi_Agent_Orchestrator_Project/desktop)

See:

- [docs/DESKTOP_DISTRIBUTION_STRATEGY.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/DESKTOP_DISTRIBUTION_STRATEGY.md)
- [docs/EMPYRALIS_DESKTOP_APP.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/EMPYRALIS_DESKTOP_APP.md)

## Documentation Policy

This repo contains many old design docs and handoff notes. They are not all current.

- Files under [archive/legacy-docs](/Users/mansur/Multi_Agent_Orchestrator_Project/archive/legacy-docs) are historical only.
- Files under [reference](/Users/mansur/Multi_Agent_Orchestrator_Project/reference) are external reference material, not project documentation.
- Versioned docs like `*_V1.md`, `*_V2.md`, and similar architecture blueprints in [docs](/Users/mansur/Multi_Agent_Orchestrator_Project/docs) should be treated as research or planning documents unless they are explicitly linked from the authoritative docs above.
- The root README and [docs/README.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/README.md) are the canonical starting points for understanding the current system.
- Legacy docs removed from the active `/docs` surface are preserved under [archive/legacy-docs](/Users/mansur/Multi_Agent_Orchestrator_Project/archive/legacy-docs).
