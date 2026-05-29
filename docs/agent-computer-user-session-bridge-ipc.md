# Agent Computer User-Session Bridge IPC Contract

Date: 2026-05-29
Status: Phase 4 contract, not yet a default runtime path

This contract defines the future bridge between durable Agent Computer runtime
processes and the logged-in desktop session. It exists so server/VPS service
mode can be built without accidentally claiming desktop permissions on macOS,
Windows, or Linux.

## Boundary

The user-session bridge is the only component allowed to own desktop permission
prompts and desktop-session UI actions.

`empyralis-gateway` may ask the bridge for permission state and may route
approved local actions through it. The gateway must not treat bridge presence
as permission by itself.

## Required Identity

Every bridge session must bind:

- `tenant_id`
- `workspace_id`
- `user_id`
- `device_id`
- `gateway_id`
- `bridge_id`
- `desktop_session_id`
- `bridge_public_key`
- `created_at`
- `expires_at`

The bridge identity is subordinate to the paired gateway identity. It cannot
outlive gateway revocation.

## Handshake

1. Gateway creates a short-lived bridge challenge.
2. User-session bridge signs the challenge with its local bridge key.
3. Gateway validates the bridge belongs to the same device and user session.
4. Gateway reports bridge status in heartbeat metadata.
5. Cloud treats desktop-only capabilities as ready only when both gateway and
   bridge report the required permission state.

Challenge TTL must be short. Replay must fail. The bridge key must not be sent
to the cloud or frontend.

## Message Envelope

```json
{
  "kind": "agent_computer.bridge.request",
  "id": "bridge_req_123",
  "ts": "2026-05-29T00:00:00Z",
  "protocol_version": "2026-05-29",
  "gateway_id": "gw_123",
  "bridge_id": "bridge_123",
  "desktop_session_id": "uid_501_console",
  "type": "permission.status",
  "payload": {
    "capability_id": "screenshot.capture"
  },
  "nonce": "short-lived-random",
  "signature": "base64url"
}
```

Responses use the same `id` and return either:

```json
{
  "ok": true,
  "payload": {
    "capability_id": "screenshot.capture",
    "permission_state": "granted",
    "prompt_available": true,
    "checked_at": "2026-05-29T00:00:01Z"
  }
}
```

or:

```json
{
  "ok": false,
  "error": {
    "code": "local_permission_denied",
    "message": "Agent Computer needs local OS permission before this action can run."
  }
}
```

## Message Types

| Type | Direction | Purpose |
| --- | --- | --- |
| `bridge.hello` | bridge to gateway | register bridge session |
| `bridge.challenge` | gateway to bridge | prove bridge freshness |
| `permission.status` | gateway to bridge | check OS permission state |
| `permission.prompt` | gateway to bridge | ask bridge to show a user-session OS prompt or repair UI |
| `desktop.execute` | gateway to bridge | route desktop-only action after policy and approval gates |
| `desktop.interrupt` | gateway to bridge | stop a running desktop action |
| `bridge.goodbye` | bridge to gateway | graceful bridge shutdown |

## Permission States

| State | Meaning |
| --- | --- |
| `granted` | OS and bridge both allow the action |
| `promptable` | not granted, but the bridge can show the user the repair path |
| `denied` | user or OS denied permission |
| `restricted` | MDM, sandbox, Wayland, session, or OS policy blocks the action |
| `not_applicable` | capability is not desktop-session scoped |
| `unknown` | bridge cannot determine state |

Only `granted` can satisfy desktop-only execution readiness.

## Security Rules

- IPC transport must be local only.
- IPC endpoints must be authenticated and scoped to the active desktop session.
- IPC messages must carry nonce, expiry, and signature or equivalent
  authenticated-channel guarantees.
- The bridge must reject mismatched `gateway_id`, `device_id`, `workspace_id`,
  or expired challenge state.
- The gateway must reject bridge capability claims after heartbeat expiry,
  gateway revocation, bridge shutdown, or permission downgrade.
- Desktop execution requests remain subject to control-plane policy and
  approval state before they reach the bridge.
- Bridge diagnostics must be redacted before they are stored or displayed.

## Capability Readiness Mapping

| Capability | Requires bridge? | Requires OS permission? |
| --- | --- | --- |
| `filesystem.read_write` | no for scoped local files, yes for user-selected desktop folders | sometimes |
| `shell.execute` | no for server/VPS shell, yes for desktop-session commands that touch UI | sometimes |
| `screenshot.capture` | yes | yes |
| `computer_control.click` | yes | yes |
| `computer_control.type` | yes | yes |
| `computer_control.clipboard_read` | yes on desktop | yes or user-session access |
| `computer_control.clipboard_write` | yes on desktop | yes or user-session access |
| `computer_control.launch_app` | yes on desktop | maybe |
| `browser.session.*` | yes for local GUI browser, no for headless server browser | maybe |

## Acceptance Gates

- A system service without a bridge cannot report desktop-only capabilities as
  ready.
- A stale bridge heartbeat removes desktop-only capability readiness.
- A permission downgrade turns the relevant capability into `blocked`.
- A permission-denied execution result is stored as `blocked` with
  `local_permission_denied`.
- Diagnostics and IPC errors are redacted before control-plane storage.
