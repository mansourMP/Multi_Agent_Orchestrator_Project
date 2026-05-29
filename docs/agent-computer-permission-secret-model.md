# Agent Computer Permission And Secret Model

Date: 2026-05-29
Status: Phase 4 implementation contract

This document defines the permission and secret model that must be true before
desktop Agent Computer moves beyond the default user-session runtime.

It does not authorize a default LaunchDaemon, Windows Service, or systemd
system service for desktop machines. Desktop remains user-session first until
the user-session bridge is implemented and verified.

## Decisions

1. The cloud control plane remains the primary identity, policy, approval,
   audit, billing, and revocation authority.
2. `empyralis-gateway` owns the local outbound connection, local journal,
   gateway pairing/session tokens, personal-channel session files, and routing
   to `empyralis-supervisor`.
3. `empyralis-supervisor` owns narrow local execution only. It does not own
   cloud identity, local pairing, billing, provider routing, or desktop
   permission prompts.
4. The desktop companion or future user-session bridge owns OS permission
   prompts and permission status checks.
5. System service mode cannot claim desktop-only capabilities unless a trusted
   user-session bridge is online and permissioned.
6. Missing OS permission is a blocked state, not a partial execution failure.
7. Diagnostics, passive service inventory, logs, approval cards, and exported
   traces must be secret-redacted before storage or display.

## Process Ownership

| Component | Owns | Must not own |
| --- | --- | --- |
| Cloud control plane | user/workspace identity, pairing grants, device trust, policy, approvals, audit, billing, revocation, hosted provider secrets | local OS prompts, local personal session files, direct device control |
| Tauri desktop companion | tray/status UI, permission prompts, permission status, logs/export UI, install/update UX, bridge lifecycle | model routing, billing, workspace policy, direct unsupervised execution |
| User-session bridge | desktop-session IPC, permission-gated prompt flow, OS permission checks, user-visible approvals | durable cloud auth, provider credentials, global policy |
| `empyralis-gateway` | WSS session, local journal/outbox/checkpoints, local pairing/session tokens, personal channel runtime files, supervisor routing | OS permission prompts, provider selection, billing, memory truth |
| `empyralis-supervisor` | signed loopback execution for files, shell, browser-adjacent local actions, screenshot, clipboard, OCR, app launch | cloud socket, pairing, approval truth, durable secrets beyond its local HMAC secret |

## Secret Classes

| Class | Examples | Storage owner | Public display |
| --- | --- | --- | --- |
| Cloud-only | provider API keys, billing secrets, workspace connector secrets | control plane or configured vault | never |
| Gateway-local | gateway token, session token, supervisor HMAC secret, personal channel session material | `empyralis-gateway` local state with owner-only permissions | never |
| Supervisor-local | loopback HMAC verification secret, audit DB path | supervisor environment/local runtime | never |
| User-session bridge | ephemeral IPC nonce, permission prompt result, bridge session id | user-session bridge memory or local state | redacted status only |
| Approval preview | sanitized action arguments, target domain/path summary, risk class | control plane approval/audit records | safe preview only |
| Diagnostics | service inventory, logs, failure messages, doctor output | gateway/control plane after sanitization | redacted |

Raw secrets must not be copied into heartbeat metadata, service inventory,
doctor payloads, approval cards, frontend settings, activity ledger rows, or
diagnostic export bundles.

## Permission Model

Platform policy and OS permission are separate gates.

- Platform policy decides whether an action is allowed, blocked, or requires an
  Empyralis approval.
- OS permission decides whether the local machine can actually perform the
  action.
- A platform approval cannot bypass macOS, Windows, or Linux desktop-session
  permissions.
- If OS permission is missing, execution returns `blocked` with
  `local_permission_denied`.
- Permission-denied results must be safe to show to the user and safe to store
  in audit logs.

## OS-Specific Rules

### macOS

- Screen capture, accessibility, automation, input control, and some clipboard
  behavior are user-session concerns.
- The companion or user-session bridge checks and prompts. The headless gateway
  only reports permission status.
- A LaunchDaemon must not advertise screenshot, click/type, window, browser UI,
  or clipboard capability unless a signed user-session bridge is connected and
  reports permission readiness.

### Windows

- A Windows Service is not the desktop UI process.
- Desktop interaction must go through a per-user helper launched in the
  interactive user session and connected with authenticated IPC.
- The service side may report server capabilities, but it must not directly
  present UI or claim user desktop control.

### Linux

- Server/VPS mode can run as a system service for server capabilities.
- Desktop UI control, Wayland/X11 access, clipboard, and AT-SPI-style desktop
  automation require a user-session bridge.
- `systemd --user` style ownership is preferred for desktop session helpers;
  system services remain server-oriented.

## Diagnostic Redaction Rules

Every local diagnostic payload must pass through the shared redaction layer
before leaving the local runtime boundary.

Redacted surfaces include:

- heartbeat `service_inventory`
- heartbeat `native_runtime`
- gateway doctor output
- gateway activity payloads
- approval cards and approval audit payloads
- failed local execution summaries
- diagnostic export bundles

Redaction must cover key-based secrets such as `api_key`, `token`, `secret`,
`password`, `authorization`, `cookie`, `gateway_token`, and `session_token`, and
pattern-based secrets such as bearer tokens, OpenAI-style keys, GitHub tokens,
Slack tokens, Telegram bot tokens, private keys, high-entropy tokens, and phone
numbers.

## Runtime States

| State | Meaning | Routing behavior |
| --- | --- | --- |
| `online` | gateway live, heartbeat fresh, health ready, requested capability ready | eligible |
| `degraded` | gateway live but some service/capability warning exists | eligible only for capabilities marked ready |
| `blocked` | policy, approval, revocation, permission, or kill switch blocks work | fail closed |
| `offline` | no live connection or stale heartbeat | fail closed |
| `revoked` | device trust or registration revoked | fail closed |
| `local_permission_denied` | OS permission missing for the requested action | fail closed and show permission repair |

## References

- Apple Accessibility trust prompt:
  https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions
- Apple ScreenCaptureKit:
  https://developer.apple.com/documentation/ScreenCaptureKit
- Microsoft interactive services guidance:
  https://learn.microsoft.com/en-us/windows/win32/services/interactive-services
- systemd user manager:
  https://www.freedesktop.org/software/systemd/man/user@.service.html
- Tauri capabilities:
  https://v2.tauri.app/security/capabilities/
