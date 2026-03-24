# Empyralis Desktop App (Frozen Local Bridge Shell)

The Electron desktop wrapper is frozen.

- Do not expand this surface.
- Keep it only for local bridge capabilities that the web/PWA path cannot replace yet.
- The primary distribution path is now the web app plus installable PWA.

## What this is
- Electron desktop shell
- Loads your local Empyralis frontend (`http://127.0.0.1:3000`)
- Auto-starts local Empyralis stack if runtime/frontend are down
- Keeps all current web features (workbench lanes, setup, channels, skills)

Desktop source:
- `desktop/main.js`
- `desktop/preload.js`
- `desktop/package.json`

## Local-only desktop usage
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

## Scope note
This is a desktop shell over the existing Empyralis runtime/frontend stack.  
It is not the primary distribution path anymore.
