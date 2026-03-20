# Empyralis Terminal Schema Map

This map keeps Empyralis easy to evolve while minimizing break risk.

## Current Stable Layer (Use These Imports)

- `scripts/orion_terminal/commands/`
  - `launcher.py`
  - `configure.py`
  - `onboard.py`
  - `preflight.py`
  - `setup.py`
- `scripts/orion_terminal/tui/`
  - `shell.py`
  - `live_tui.py`
- `scripts/orion_terminal/wizard/`
  - `engine.py`
  - `prompts.py`
  - `contracts.py`

## Implementation Files (Do Not Move Yet)

- `flows_launcher.py`
- `flows_configure.py`
- `flows_onboard.py`
- `flows_preflight.py`
- `flows_orion_setup.py`
- `flows_run.py`
- `wizard_engine.py`
- `prompt_engine.py`
- `prompt_contracts.py`

These still contain the real logic. Wrappers above expose a stable schema now.

## Import Policy

- New code should import from:
  - `scripts.orion_terminal.commands`
  - `scripts.orion_terminal.tui`
  - `scripts.orion_terminal.wizard`
- Avoid adding new imports directly to `flows_*`, `wizard_engine.py`, `prompt_contracts.py`.

## Safe Move Plan

1. Keep wrappers as compatibility facade (done).
2. Move one implementation file at a time behind wrapper.
3. Run terminal tests after every move.
4. Remove old file only after all imports are migrated.

## First Moves Recommended

1. Move `wizard_engine.py` internals into `wizard/engine.py`.
2. Move `prompt_contracts.py` into `wizard/contracts.py`.
3. Move `prompt_engine.py` into `wizard/prompts.py`.
4. Move `flows_run.py` into `tui/shell.py`.
5. Move setup/configure/onboard/preflight/launcher into `commands/`.
