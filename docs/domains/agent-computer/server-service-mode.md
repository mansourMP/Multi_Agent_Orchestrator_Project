# Agent Computer Server/VPS Service Mode

Date: 2026-05-29
Status: Phase 5 implementation contract

Server/VPS service mode makes Agent Computer durable on dedicated hardware
without changing the default desktop runtime path.

Desktop machines remain user-session-first. On macOS, `launchd-install`
continues to install a user LaunchAgent. `service-install --system` is reserved
for server/VPS use.

## Linux Systemd

Install and build the runtime first:

```bash
scripts/agent_computer.sh install
```

Install as a Linux system service:

```bash
sudo EMPYRALIS_AGENT_COMPUTER_SERVICE_USER="$USER" \
  scripts/agent_computer.sh service-install --system
```

Pair on first boot by exporting a pairing token before install, or by writing it
into `.orion-stack/agent-computer/agent-computer.env` with owner-only
permissions:

```bash
export EMPYRALIS_GATEWAY_PAIRING_TOKEN="..."
sudo -E EMPYRALIS_AGENT_COMPUTER_SERVICE_USER="$USER" \
  scripts/agent_computer.sh service-install --system
```

Check status:

```bash
scripts/agent_computer.sh service-status
```

Uninstall:

```bash
sudo scripts/agent_computer.sh service-uninstall --system
```

The generated unit uses:

- `Type=simple`
- `Restart=always`
- `RestartSec=5`
- `ExecStart=... service-run --system`
- `EMPYRALIS_AGENT_COMPUTER_SYSTEM_SERVICE_MODE=1`
- `EMPYRALIS_AGENT_COMPUTER_SERVICE_TARGET=server_vps`

## macOS

Default Mac desktop path:

```bash
scripts/agent_computer.sh launchd-install
```

The generated user LaunchAgent runs `scripts/agent_computer.sh launchd-run` as a
foreground user-session supervisor. It keeps the local runner and edge owned by
launchd without switching the desktop into system service mode.

Server-style Mac system LaunchDaemon is guarded and requires an explicit server
flag:

```bash
sudo EMPYRALIS_AGENT_COMPUTER_SERVICE_USER="$USER" \
  scripts/agent_computer.sh service-install --system --server-mac
```

Without `--server-mac`, the command refuses to install a system LaunchDaemon.
This prevents desktop Macs from silently moving away from user-session
permissions before the user-session bridge is implemented.

## Windows

The bash service command intentionally refuses Windows Service operations.
Windows service installation must be handled by the Windows-specific service
wrapper so that Session 0 and per-user desktop helper behavior are explicit.

Server-style Windows hosts use:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\install_agent_computer_windows_service.ps1 -Action install
powershell.exe -ExecutionPolicy Bypass -File scripts\install_agent_computer_windows_service.ps1 -Action status
powershell.exe -ExecutionPolicy Bypass -File scripts\install_agent_computer_windows_service.ps1 -Action uninstall
```

The wrapper installs `EmpyralisAgentComputer` as an automatic Windows Service,
sets `EMPYRALIS_AGENT_COMPUTER_SYSTEM_SERVICE_MODE=1`, and targets
`server_vps`. It is for server-style Windows hosts. Desktop UI control still
requires the user-session helper/bridge before desktop-only capabilities are
advertised.

## Docker

Container deployment is available under `deploy/agent-computer/`:

```bash
cd deploy/agent-computer
EMPYRALIS_GATEWAY_PAIRING_TOKEN="..." docker compose up -d --build
```

The compose file uses:

- `restart: unless-stopped`
- persistent state volume
- persistent logs volume
- `EMPYRALIS_AGENT_COMPUTER_SYSTEM_SERVICE_MODE=1`

## Capability Rules

System service mode may advertise server-safe capabilities by default:

- files
- shell
- passive service inventory
- Postgres/Docker/Ollama/Codex/GPU detection

System service mode must not advertise desktop-only capabilities unless a
trusted user-session bridge is online:

- screenshot
- OCR
- click/type/key
- clipboard
- window/app listing
- app launch
- local GUI browser session
- speech/notification/AppleScript-style desktop actions

## Acceptance Checks

```bash
bash -n scripts/agent_computer.sh
scripts/agent_computer.sh service-install --system --dry-run
python3 -m pytest -q server_modules/tests/test_agent_computer_service_script.py
scripts/empyralis_hardware_transparency_certification.py --suite agent-computer
```

Gateway tests also verify that system service mode reports
`system_service_mode=true` and filters desktop-only capability readiness unless
the user-session bridge is present.
