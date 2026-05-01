# Tauri Desktop Companion Contract

Date: 2026-05-01
Status: launch companion contract

## Decision

The Tauri app is the Empyralis desktop companion. It is not a second Sage brain, not a separate provider router, and not a replacement for web or mobile. Its job is to make the user's physical computer available to Sage through a trusted local gateway.

## Product Role

- Web and phone are the default daily-use surfaces.
- Tauri is installed when the user wants Sage to use this Mac or PC.
- Tauri packages local runtime health, gateway pairing, supervisor lifecycle, desktop permissions, approvals, logs, and updates.
- Sage Cloud Computer remains the paid hosted runtime when the user does not want to use a physical device.

## Runtime Boundary

Tauri may manage:

- local gateway connection and pairing
- supervisor process health
- local files, shell, browser, screenshot, clipboard, and desktop capability status
- local permission and approval prompts
- app update state and desktop shell status

Tauri must not own:

- provider selection or model routing
- cloud transcript storage
- billing ledger
- global tool availability policy
- Studio specialist identity
- Marketplace package trust decisions

Those remain cloud/control-plane truth so phone, web, desktop, and future cloud computers all agree.

## User-Visible States

The desktop companion should surface these states consistently across Tauri, web, and phone:

- `This Mac online`: paired gateway is connected and healthy.
- `Gateway offline`: no trusted device is currently available for local tools.
- `Supervisor unhealthy`: gateway exists but local execution is not ready.
- `Approval needed`: local action is blocked until the owner approves or denies.
- `Full Access active`: local-companion-only elevated session approved by the device owner.

Cloud Computer never uses `Full Access`; it uses metered sandbox/autopilot policy.

## Launch Gate

Tauri is not required for the first public web Sage demo unless the demo includes local-machine control. If local control is demoed, certify:

- Tauri boots without killing the web launch path.
- Pairing completes.
- Sage shows `This Mac`.
- Local tools become enabled.
- A local shell/file task routes through gateway and supervisor.
- A risky action pauses for approval.
- Revoking or closing Tauri returns web/phone to `Gateway offline`.

## Future Hardening

Before a public desktop release:

- signed and notarized builds
- auto-update with configured updater keys and endpoints
- startup/tray controls
- diagnostics export without secrets
- crash-safe gateway restart
- explicit device revoke flow
- local permission review before Full Access
