# Agent Computer Native Hardware Roadmap

Date: 2026-05-29
Status: accepted phased roadmap

This roadmap turns Agent Computer hardware nativity into a measured sequence.
It does not replace the frozen gateway architecture, gateway protocol, or
desktop companion contract. It layers implementation order and launch gates on
top of them.

Canonical references:

- `docs/gateway-architecture.md`
- `docs/gateway-protocol.md`
- `docs/agent-computer-runtime.md`
- `docs/tauri-desktop-companion-contract-2026-05-01.md`
- `server_modules/runtime_attachment_service.py`
- `server_modules/hardware_runtime_target_resolver.py`
- `empyralis-gateway/src/index.ts`
- `empyralis-supervisor/src/main.rs`

## Decision

Build one product surface called `Agent Computer`, backed by one gateway
protocol and one runtime fabric. Do not rewrite the runtime in one pass.

The first implementation phase is heartbeat and passive service inventory only.
No new desktop persistence model, no default LaunchDaemon path, no new native
execution routes, and no service spam in the top bar.

## Non-Negotiable Constraints

1. Implement in phases, not one large rewrite.
2. Phase 1 is heartbeat and service inventory only.
3. Keep the default desktop runtime in the user session until permissions,
   secrets, TCC, and user-session native bridges are designed.
4. `service-install --system` is for VPS/server use, not the default Mac
   desktop path.
5. `Codex CLI`, Postgres, Docker, Ollama, and GPU are passive detected
   capabilities only. Detection does not grant execution.
6. The top bar shows only selected target health. Service details belong in
   Agent Computer details/settings.
7. Routing stays fail-closed when heartbeat is stale, revoked, unhealthy, or a
   required execution capability is missing.
8. Every phase must add or preserve tests around heartbeat inventory, target
   selection, stale heartbeat, revoke, and approval-gated actions.

## Current Baseline

Already real:

- `empyralis-gateway` owns the persistent local edge, WSS session, journal,
  outbox, checkpoint state, personal-channel runtimes, browser runtime, and
  routing to the supervisor.
- `empyralis-supervisor` owns narrow local execution for shell, filesystem,
  screenshot, OCR, mouse, keyboard, clipboard, app launch, notification,
  AppleScript, and speech.
- The cloud control plane owns pairing, registration, sessions, policy,
  approvals, audit, quota, billing, and revocation.
- Runtime target taxonomy already distinguishes `Cloud`, `This Device`, `Cloud
  Computer`, and `Server/VPS`.
- Gateway doctor already treats heartbeat freshness as 45 seconds and sweeps
  stale sessions after 15 minutes.

Still missing:

- Heartbeat payload does not yet carry a structured passive service inventory.
- Passive service inventory is not yet normalized into the gateway registration
  or doctor payload.
- Frontend target health and detailed service health are not clearly separated
  as a production Agent Computer surface.
- Desktop/service install modes are not yet explicit enough for Mac desktop vs
  VPS/server behavior.

## Phase 1: Heartbeat And Passive Inventory

Goal: make every paired Agent Computer self-describing without expanding what
it is allowed to execute.

### Scope

Add a gateway-side service inventory collector and include the result in
`gateway.heartbeat` and `gateway.state.update`.

Passive probes:

| Item | Probe | Execution grant? |
| --- | --- | --- |
| Gateway process | current process metadata | No |
| Supervisor | `GET /health` on loopback | No |
| Browser runtime | runtime availability/config only | No |
| Filesystem | capability readiness only | No |
| Shell | capability readiness only | No |
| Postgres | `pg_isready` if present | No |
| Docker | CLI/API ping if present | No |
| Ollama | local API tag/version probe if reachable | No |
| Codex CLI | binary/version presence only | No |
| GPU | OS/vendor command presence and summary only | No |
| Node/Python/Git | version presence only | No |

The collector must never treat detected tools as callable agent tools. It only
reports inventory and health.

### Payload Shape

Add a structured inventory object under heartbeat metadata:

```json
{
  "health_state": "online",
  "capability_readiness": {
    "gateway": "ready",
    "supervisor": "ready",
    "browser": "ready",
    "shell.execute": "ready",
    "filesystem.read_write": "ready",
    "screenshot.capture": "ready"
  },
  "service_inventory": [
    {
      "id": "postgres",
      "label": "Postgres",
      "kind": "database",
      "status": "ready",
      "detected": true,
      "passive": true,
      "execution_enabled": false,
      "check": "pg_isready",
      "summary": "Accepting connections on localhost:5432",
      "last_checked_at": "2026-05-29T00:00:00Z"
    }
  ],
  "native_runtime": {
    "os": "macos",
    "arch": "arm64",
    "desktop_session": "user_session",
    "system_service_mode": false
  }
}
```

Statuses are limited to `ready`, `degraded`, `offline`, `missing`, `unknown`,
and `blocked`.

### Code Targets

- Add `empyralis-gateway/src/health/service-inventory.ts`.
- Extend `empyralis-gateway/src/runtime/runtime-metadata.ts`.
- Extend heartbeat creation in `empyralis-gateway/src/cloud/ws-client.ts`.
- Store `service_inventory` and `native_runtime` in
  `server_modules/gateway_protocol_service.py` metadata.
- Surface the same fields through `server_modules/gateway_health_service.py`
  doctor output.

### Frontend Rule

Top bar:

- `Agent Computer · This Mac · Healthy`
- `Agent Computer · This Mac · Degraded`
- `Agent Computer · Offline`

Agent Computer details/settings:

- Gateway
- Supervisor
- Browser
- Files
- Shell
- Postgres
- Docker
- Ollama
- Codex CLI
- GPU
- Logs
- Permissions
- Reconnect
- Revoke

No individual service status appears in the top bar.

### Phase 1 Tests

Gateway TypeScript:

- `service-inventory.test.ts`: detects present, missing, offline, and timeout
  states without throwing.
- `runtime-metadata.test.ts`: includes passive service inventory and native
  runtime metadata.
- `heartbeat-service-inventory.test.ts`: heartbeat payload includes inventory
  and marks every passive item with `execution_enabled: false`.

Backend Python:

- `test_gateway_heartbeat_inventory.py`: heartbeat stores sanitized
  `service_inventory`.
- `test_gateway_health_service.py`: doctor surfaces service details separately
  from overall target health.
- `test_gateway_routes.py`: revoked gateway cannot continue inventory updates.
- `test_hardware_gateway_adapter.py`: target selection fails closed when
  heartbeat is stale or capability readiness is missing.

Acceptance:

- A paired gateway can report Postgres/Docker/Ollama/Codex/GPU presence without
  enabling execution through them.
- A stale heartbeat makes `This Device` unavailable for execution.
- A missing execution capability blocks routing even if a passive service is
  detected.
- Frontend can show selected target health without service spam.

## Phase 2: Fail-Closed Target Selection

Goal: make routing decisions consume the richer heartbeat safely.

Rules:

- `This Device` is selectable only when registration is active, device trust is
  not revoked, live session is connected, heartbeat is fresh, health is not
  `blocked` or `offline`, and requested execution capability is ready.
- The current 45-second fresh heartbeat threshold remains the default unless the
  control plane explicitly changes the gateway heartbeat interval contract.
- Passive inventory never satisfies execution capability checks.
- Stale, revoked, unhealthy, or missing-capability states return a clear
  blocking reason. No silent fallback to local execution.

Tests:

- Target selection: fresh vs stale heartbeat.
- Target selection: passive Postgres detected but `shell.execute` missing.
- Revocation: live and reconnect paths stop execution.
- Approval: risky shell/file/browser actions still pause even when the machine
  is healthy.

## Phase 3: Agent Computer Details UI

Goal: productize visibility without changing execution semantics.

Build:

- Details drawer or settings page for the selected Agent Computer.
- Service inventory list with health, last checked time, and passive/execution
  distinction.
- Permission section for screen recording, accessibility, clipboard, files,
  browser, and shell.
- Logs and diagnostic export with secret redaction.
- Reconnect and revoke controls.

Do not build:

- Top-bar service list.
- Raw provider/model IDs.
- Technical launch mode controls in the default path.

Tests:

- Frontend renders top-bar target health only.
- Frontend details page renders passive services without exposing secrets.
- Revoked/offline/degraded states are visually distinct and block local action
  buttons.

## Phase 4: Desktop Permission And Secret Model

Goal: design the user-session native bridge before changing default desktop
install behavior.

Decisions required before implementation:

- Which process owns local secrets.
- Which process owns OS permission prompts.
- How Tauri, gateway, and supervisor share identity without leaking tokens.
- macOS TCC behavior for screen recording, accessibility, automation,
  filesystem access, and clipboard.
- Windows service-to-user-session IPC boundary.
- Linux desktop session bridge behavior under systemd user services.

Default remains user-session runtime until these are resolved.

Deliverables:

- Permission and secret design doc.
- Threat model update.
- IPC contract between core runtime and user-session bridge.
- Regression tests for secret redaction and permission-denied behavior.

## Phase 5: Server/VPS System Service Mode

Goal: make headless server runtimes durable without making system service mode
the default desktop path.

Build:

- `scripts/agent_computer.sh service-install --system`
- `scripts/agent_computer.sh service-uninstall --system`
- `scripts/agent_computer.sh service-status`
- Linux systemd unit for VPS/server.
- Windows Service support for server-style Windows hosts.
- Optional macOS LaunchDaemon path for server-style Macs only, not default Mac
  desktop.
- Docker deployment with restart policy for server nodes where appropriate.

Rules:

- System service mode may expose server capabilities: shell, files, process
  health, service health, logs, Docker, Postgres, Ollama, GPU.
- System service mode must not claim desktop screen/click/type capability unless
  a valid user-session bridge is also online and permissioned.

Tests:

- System service manifest does not advertise desktop-only capabilities by
  default.
- Server/VPS target selection requires explicit runtime target.
- Revocation stops reconnect.
- Service install status is visible in doctor output.

## Phase 6: Native Desktop Action Parity

Goal: expand native desktop control only after permission and bridge design are
ready.

Work:

- macOS accessibility/screen/session bridge.
- Windows UI Automation bridge.
- Linux AT-SPI/X11/Wayland strategy.
- Browser attach/open/navigate with explicit approval rules.
- Screenshot retention policy enforcement.
- Action audit chain for click/type/key/launch/clipboard.

Tests:

- Browser open/navigate can run under approved policy.
- Click/type require approval in guarded mode.
- Credential, payment, install, system setting, and destructive actions remain
  blocked or approval-gated.
- Permission-denied states produce blocked results, not partial execution.

## Phase 7: Production Certification

Goal: prove the runtime survives real machine conditions.

Certification matrix:

| Scenario | Required result |
| --- | --- |
| App window closed | Runtime status remains correct for current install mode. |
| User logs out | Desktop user-session capabilities go offline; server-safe core behavior follows install mode. |
| Reboot | Runtime returns according to install mode. |
| Network drop | Gateway degrades, journals state, reconnects, and does not double-execute. |
| Revocation | Reconnect and execution stop fail-closed. |
| Stale heartbeat | Target becomes unavailable for execution. |
| Missing capability | Action blocks with missing-capability reason. |
| Risky action | Approval is required or action is blocked. |
| Secret in logs | Redacted. |

Exit criteria:

- Gateway tests, backend hardware/runtime tests, and supervisor tests pass.
- Frontend target health and details views pass Playwright coverage.
- Physical Mac, Linux/VPS, and Windows smoke runs are recorded.
- A rollback path exists for each install mode.

## Implementation Order

1. Phase 1 heartbeat and passive inventory.
2. Phase 2 fail-closed target selection.
3. Phase 3 details/settings UI.
4. Phase 4 permission and secret design.
5. Phase 5 server/VPS system service mode.
6. Phase 6 native desktop action parity.
7. Phase 7 production certification.

Do not start Phase 5 desktop-default work before Phase 4 is accepted.
Do not start Phase 6 before Phase 1 through Phase 4 are tested.
