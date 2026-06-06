# Agent Computer Native Desktop Action Parity

Date: 2026-05-29
Status: Phase 6 implementation contract

This phase makes native desktop actions safe to advertise and route through the
existing Agent Computer fabric. It does not replace the gateway, supervisor, or
future user-session bridge contract.

## What Is Implemented

- Desktop-only capabilities are permission-gated before advertisement.
- `screenshot.capture`, OCR, click, move, type, key, clipboard, app/window,
  launch, notification, AppleScript, speech, and local GUI browser capabilities
  map to explicit desktop permission gates.
- Heartbeat `capability_readiness` now distinguishes `ready` from `blocked`.
- Heartbeat metadata includes sanitized `permission_states`.
- Agent Computer details/settings show desktop permission state separately from
  passive service inventory.
- Browser open/navigate remains a read action under policy.
- Browser click/fill/upload/script-style actions remain approval-gated in
  guarded mode.
- Permission-denied execution failures classify as
  `blocked/local_permission_denied`.
- Screenshot responses honor `screenshot_retention=off` by stripping inline
  image data and not creating retained artifacts.

## Permission Environment Contract

The gateway accepts explicit permission state from the desktop companion or
future bridge through these environment variables:

| Permission | Environment variable |
| --- | --- |
| Screen recording | `EMPYRALIS_AGENT_COMPUTER_PERMISSION_SCREEN_RECORDING` |
| Accessibility/input | `EMPYRALIS_AGENT_COMPUTER_PERMISSION_ACCESSIBILITY` |
| Clipboard | `EMPYRALIS_AGENT_COMPUTER_PERMISSION_CLIPBOARD` |
| App/window automation | `EMPYRALIS_AGENT_COMPUTER_PERMISSION_AUTOMATION` |
| Local GUI browser | `EMPYRALIS_AGENT_COMPUTER_PERMISSION_BROWSER` |

Accepted states:

- `granted`
- `promptable`
- `denied`
- `restricted`
- `unknown`

Boolean-style values are normalized: `true`/`1`/`yes` means `granted`, and
`false`/`0`/`no` means `denied`.

When no permission state is reported, the default user-session runtime preserves
existing behavior and treats desktop permissions as granted. System service mode
without a ready user-session bridge treats desktop permissions as restricted and
does not advertise desktop-only capabilities.

## Capability Mapping

| Capability | Permission gate |
| --- | --- |
| `screenshot.capture` | Screen recording |
| `computer_control.ocr` | Screen recording |
| `computer_control.move` | Accessibility |
| `computer_control.click` | Accessibility |
| `computer_control.type` | Accessibility |
| `computer_control.key` | Accessibility |
| `computer_control.clipboard_read` | Clipboard |
| `computer_control.clipboard_write` | Clipboard |
| `computer_control.list_windows` | App/window automation |
| `computer_control.list_apps` | App/window automation |
| `computer_control.launch` | App/window automation |
| `computer_control.launch_app` | App/window automation |
| `computer_control.notify` | App/window automation |
| `computer_control.applescript` | App/window automation |
| `computer_control.speak` | App/window automation |
| `browser.session.*` | Local GUI browser |

## Routing Rules

1. Control-plane policy and owner approval still run before gateway execution.
2. Gateway advertisement excludes desktop-only capabilities whose permission
   state is not `granted`.
3. Direct invokes through the gateway router still re-check permission state and
   fail closed with `blocked/local_permission_denied` if stale or denied.
4. Passive detected tools such as Postgres, Docker, Ollama, Codex CLI, and GPU
   never satisfy execution capability readiness.
5. System service mode can advertise desktop capability only when the
   user-session bridge is ready and the permission state is granted.

## Verification

Implemented regression coverage:

- System service mode does not advertise desktop-only capabilities without a
  bridge.
- Explicit permission denial removes click and browser session capabilities.
- Heartbeat readiness reports blocked permission states.
- Backend readiness metadata is redacted before storage/display.
- Managed browser open/navigate can run as a read action under policy.
- Browser click requires approval in guarded mode.
- Screenshot retention `off` strips inline data and avoids artifact creation.

## Production Smoke Boundary

This phase is code-complete for the gateway/control-plane contract. Physical
certification is still Phase 7:

- macOS TCC prompt and denial smoke run.
- Windows interactive user-session helper smoke run.
- Linux X11/Wayland/AT-SPI smoke run.
- Reboot, logout, network-drop, revoke, and rollback runbooks.
