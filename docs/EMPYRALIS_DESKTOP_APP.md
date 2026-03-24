# Empyralis Desktop App

This desktop wrapper is frozen.

- Do not expand it as the main product surface.
- Keep it only for local bridge capabilities.
- The web app plus installable PWA is the primary distribution path.

## Local-only desktop usage

```bash
bash scripts/install_empyralis_desktop.sh
bash scripts/run_empyralis_desktop.sh
```

## Build macOS package

```bash
bash scripts/build_empyralis_desktop.sh
```

## If the desktop app opens but the platform is not working

Start the stack first:

```bash
bash scripts/start_empyralis_local_stack.sh
curl -s -H "X-API-Key: replace-with-strong-key" http://127.0.0.1:8001/health | jq '.ok,.auth_mode,.errors'
curl -s -H "X-API-Key: replace-with-strong-key" http://127.0.0.1:8001/channels/telegram/autopilot/status | jq '.ok,.autopilot.active,.autopilot.thread_alive,.autopilot.last_error'
```

Then watch logs:

```bash
bash scripts/logs_empyralis_local_stack.sh
tail -f .orion-stack/logs/runtime.log
tail -f .orion-stack/logs/frontend.log
```
