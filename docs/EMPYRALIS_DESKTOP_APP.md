# Empyralis Desktop App

The current packaged desktop shell is Tauri.

## Current Desktop Surfaces

- Active packaged shell: [src-tauri](/Users/mansur/Multi_Agent_Orchestrator_Project/src-tauri)
- Frozen legacy Electron shell: [desktop](/Users/mansur/Multi_Agent_Orchestrator_Project/desktop)

The desktop app should be treated as a shell over the main web/runtime stack, not as a separate product.

## Local Usage

Install or run from the project root:

```bash
bash scripts/install_empyralis_desktop.sh
bash scripts/run_empyralis_desktop.sh
```

Build a desktop package:

```bash
bash scripts/build_empyralis_desktop.sh
```

## Runtime Expectation

The desktop shell depends on the local stack being healthy.

Start the stack first when needed:

```bash
RUNTIME_KEY='replace-with-strong-key' bash scripts/start_empyralis_local_stack.sh
bash scripts/status_empyralis_local_stack.sh
```

If you need logs:

```bash
bash scripts/logs_empyralis_local_stack.sh
tail -f .orion-stack/logs/runtime.log
tail -f .orion-stack/logs/frontend.log
```

## Important Note

The Electron wrapper is frozen and should not be treated as the main desktop implementation anymore. The active desktop build path is Tauri.
