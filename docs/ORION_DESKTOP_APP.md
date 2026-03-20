# Empyralis Desktop App (VS Code-style Shell)

This project now includes a desktop wrapper so Empyralis can run as a real macOS app window (not only browser tabs).

## What this is
- Electron desktop shell
- Loads your local Empyralis frontend (`http://127.0.0.1:3000`)
- Auto-starts local Empyralis stack if runtime/frontend are down
- Keeps all current web features (workbench lanes, setup, channels, skills)

Desktop source:
- `desktop/main.js`
- `desktop/preload.js`
- `desktop/package.json`

## Fast start (dev desktop app)
From project root:

```bash
bash scripts/install_empyralis_desktop.sh
bash scripts/run_empyralis_desktop.sh
```

## Build macOS app package (DMG + ZIP)

```bash
bash scripts/build_empyralis_desktop.sh
```

Output:
- `desktop/dist/`

## If desktop opens but app feels "not working"
Run these checks first:

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

## Timeline to "VS Code-level" desktop polish
- Current (now): desktop shell + auto-start + packaging scripts.
- 1-2 days: native menu, command palette, desktop settings pane, window state restore.
- 3-5 days: signed installer, auto-update channel, crash reporting, release pipeline.

## Scope note
This is a desktop shell over the existing Empyralis runtime/frontend stack.  
It is the correct short path to a downloadable app while keeping your AGI workflow speed.
