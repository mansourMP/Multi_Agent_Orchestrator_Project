# Agent Computer Threat Model

Date: 2026-05-29
Status: Phase 4 threat model update

This threat model covers Agent Computer desktop and server runtime work after
heartbeat inventory and fail-closed target selection. It is scoped to native
hardware access, permissions, secrets, diagnostics, and user-session bridging.

## Assets

- workspace identity and membership
- device registration and trust state
- gateway token and session token
- supervisor HMAC secret
- personal channel session material
- local files and folders
- screenshots, clipboard, OCR output, browser state, terminal output
- approval decisions and remembered approval rules
- diagnostic logs and service inventory

## Trust Boundaries

| Boundary | Trusted side | Untrusted or less trusted side |
| --- | --- | --- |
| Cloud to gateway WSS | authenticated control plane and paired gateway | network and stale/replayed frames |
| Gateway to supervisor loopback | signed gateway requests | local processes without supervisor secret |
| Gateway to user-session bridge | authenticated bridge session | system services, other users, stale sessions |
| Tauri webview to Rust core | Tauri capability-scoped commands | frontend compromise or injected UI content |
| Local diagnostics to cloud/UI | redacted payload | raw logs, local env, local command output |

## Threats And Mitigations

| Threat | Mitigation |
| --- | --- |
| Stale gateway keeps executing after disconnect | target selection requires live connection and fresh heartbeat |
| Revoked device reconnects and executes | registry and execution paths reject revoked trust |
| Passive service detection becomes execution grant | passive inventory always sets `execution_enabled=false`; readiness requires explicit capability readiness |
| Permission-denied desktop action partially executes | permission failures classify as `blocked` with `local_permission_denied` |
| Diagnostic payload leaks a token | service inventory, failure metadata, approvals, and diagnostics pass through redaction |
| System service claims screen/click/type capability | desktop-only readiness requires a user-session bridge and OS permission state |
| Frontend compromise invokes broad Tauri commands | Tauri capabilities must stay narrow and command scopes must be checked in Rust |
| Cross-workspace gateway misuse | execution readiness checks workspace binding before dispatch |
| Supervisor called by another local process | supervisor requests require HMAC signature, nonce, expiry, and loopback binding |
| Approval card leaks secrets or phone numbers | approval decision payloads are sanitized and asserted secret-free |
| Remembered approval escapes scope | approval memory is scoped by owner, workspace, policy, profile, gateway, agent, and target |
| Browser or channel sessions leak credentials into logs | local session material remains gateway-local and diagnostics are redacted |
| Windows service interacts with user desktop directly | service must use a per-user helper over authenticated IPC |
| Linux system service touches Wayland/X11 desktop directly | desktop automation requires a user-session bridge |

## Required Regression Coverage

- service inventory redacts secret-like values and remains passive
- local permission failures produce blocked state and safe summaries
- approval payloads remain secret-free
- stale heartbeat blocks local execution
- revoked gateway blocks local execution
- passive inventory cannot satisfy execution readiness
- missing capability readiness blocks routing
- approval-gated actions still pause on healthy machines

## Open Design Items Before Default Desktop Service Mode

- exact bridge key storage on macOS, Windows, and Linux
- signed/notarized macOS prompt owner identity
- Windows per-user helper installation and update path
- Linux Wayland/X11/AT-SPI bridge support matrix
- diagnostic export bundle format and retention
- user-facing repair flows for each permission state
- MDM/admin policy reporting for restricted permissions

No item in this list blocks server/VPS service mode. These items block making a
system service the default desktop path.
