# Empyralis Runtime Boundary

This folder documents the runtime boundary for Empyralis.

The name "Hekor" appears here because this folder started as an architecture scaffold before the runtime implementation settled. The current live runtime is not implemented in this folder directly.

## What Is Current

The active runtime/backend lives in:

- [server.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server.py)
- [server_modules](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules)
- [scripts](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts)

This `runtime/` folder is still useful because it keeps the control-plane/runtime contract explicit.

## Purpose Of This Folder

- define the control-plane vs runtime boundary
- store runtime contract examples
- keep envelope and manifest ideas stable even if implementation details change

## Scope

The runtime model in this repo is intended to support:

- local machine execution
- headless worker execution
- shared task lifecycle contracts across those execution environments

## Artifacts Here

- `contracts/runtime-manifest.v1.example.json`
- `contracts/task-envelope.v1.example.json`

These are examples and contract scaffolds, not the primary runtime implementation.
