# Empyralis Autopilot Quickstart

This is the current local quickstart for Empyralis in simple user mode.

## Terminal command center

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
pip install -r requirements.txt
empyralis
```

Useful commands:

```bash
empyralis setup
empyralis onboard
empyralis configure
empyralis hatch
empyralis tui
empyralis status
empyralis doctor
empyralis connectors
empyralis gateway status
empyralis stack status
empyralis go --watch
```

## Start the local stack

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
RUNTIME_KEY='replace-with-strong-key' bash scripts/start_empyralis_local_stack.sh
```

Helpers:

```bash
bash scripts/status_empyralis_local_stack.sh
bash scripts/logs_empyralis_local_stack.sh
bash scripts/stop_empyralis_local_stack.sh
```

Alternate startup:

```bash
BACKEND_MODE=auto RUNTIME_KEY='replace-with-strong-key' bash scripts/start_empyralis_local_stack.sh
START_BACKEND=0 START_FRONTEND=0 RUNTIME_KEY='replace-with-strong-key' bash scripts/start_empyralis_local_stack.sh
```

## Frontend

```bash
open http://127.0.0.1:3000
```

## Compatibility note

Use the `empyralis` command and the `scripts/start_empyralis_local_stack.sh` family as the primary public surface.
