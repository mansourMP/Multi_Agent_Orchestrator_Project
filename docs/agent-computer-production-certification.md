# Agent Computer Production Certification

Date: 2026-05-29
Status: Phase 7 certification harness implemented; physical smoke evidence pending

Phase 7 proves Agent Computer survives real hardware conditions. The code-level
gate is repeatable through:

```bash
scripts/empyralis_hardware_transparency_certification.py --suite agent-computer
```

## Automated Gate

The `agent-computer` suite runs:

- `scripts/agent_computer.sh` syntax validation.
- Linux systemd service dry-run rendering.
- Agent Computer backend regression tests.
- Gateway TypeScript typecheck.
- Gateway heartbeat, inventory, and system-service tests.
- Supervisor Rust tests.
- `git diff --check`.

## Physical Smoke Matrix

Physical certification must record the report artifact plus operator notes for:

| Scenario | Mac desktop | Linux/VPS | Windows desktop/server |
| --- | --- | --- | --- |
| App window closed | User-session runtime reports expected status | Not applicable to server service | User-session helper reports expected status |
| User logs out | Desktop capabilities go offline | System service keeps server-safe core behavior | Desktop capabilities go offline |
| Reboot | User-session runtime returns after login | System service returns automatically | Service/helper returns by configured mode |
| Network drop | Gateway degrades, journals, reconnects, no double execution | Same | Same |
| Revocation | Reconnect and execution stop fail-closed | Same | Same |
| Stale heartbeat | Target unavailable for execution | Same | Same |
| Missing capability | Action blocks with missing-capability reason | Same | Same |
| Risky action | Approval required or blocked | Same | Same |
| Secret in logs | Redacted | Redacted | Redacted |

## Required Evidence

Each physical run should preserve:

- certification report JSON path
- OS and architecture
- install mode
- gateway id
- service/log paths checked
- approval prompt evidence for one risky action
- revoke/stale-heartbeat evidence
- rollback command used

## Rollback Commands

Desktop user-session runtime:

```bash
scripts/agent_computer.sh stop
scripts/agent_computer.sh launchd-uninstall
```

Server/VPS system runtime:

```bash
scripts/agent_computer.sh service-uninstall --system
```

Docker runtime:

```bash
docker compose -f deploy/agent-computer/docker-compose.yml down
```
