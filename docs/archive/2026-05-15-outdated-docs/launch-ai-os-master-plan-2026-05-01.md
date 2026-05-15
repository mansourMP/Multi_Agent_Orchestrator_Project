# Empyralis Launch + AI OS Master Plan

Date: 2026-05-01

This is the canonical launch plan. It merges the demo path with the long-term AI OS architecture: Sage, hosted credits, BYOK, local gateway, phone web, Studio, Marketplace, Mini Apps, privacy, and the later Cloud Computer runtime.

## Product Rules

- Normal users should not need to understand API keys.
- Default path: use Empyralis credits.
- Advanced path: use your own API key.
- Hosted credits keep provider keys server-side, enforce spend caps server-side, and ledger every hosted turn.
- BYOK remains available for power users and businesses that want direct provider billing.
- Empyralis-hosted provider errors must be polished app-level errors only. BYOK provider setup/runtime errors can be shown in safe form, without stack traces, secrets, transport dumps, or raw internal exceptions.

## Runtime Decision

Use both headless execution and visual transparency.

- Headless Gateway: primary execution layer for files, shell, browser automation, clipboard, screenshots, Telegram, and local tool dispatch.
- Visual Session: transparency layer for screenshots, progress rows, and later optional live WebRTC viewing.
- Do not use pure remote desktop as the primary automation engine. Pixel clicking is fragile; tool APIs are the reliable layer.
- Cloud Computer is a separate paid runtime for when the user's computer is offline. It is deferred for launch.

## Phase 1 - Public Demo Hardening

Production web must load on desktop and phone. Fix Render 500/502/504, shell bootstrap, provider catalog, and dead screens.

Exit gate: production Sage opens reliably with no raw bootstrap text and no dead shell screen.

## Phase 2 - Hosted Credits + BYOK

Default path is Empyralis free credits. Advanced path is user API key. Add hard usage limits before model calls.

Exit gate: a normal user can chat without knowing what an API key is, and hosted usage cannot create uncontrolled spend.

## Phase 3 - Production Sage Smoke

Run 10 messages on production. Verify no disappearing messages, clean thinking row, stop square, truthful provider metadata, and no raw provider errors.

Exit gate: Sage is demo-safe.

## Phase 4 - Chat Surface + Transparency

Show inline cells for Thinking, Searching web, Reading file, Running shell, Sending Telegram, Waiting for approval, Screenshot/artifact, and final assistant output. "What can you do?" must answer from the backend tool catalog.

Exit gate: Sage feels transparent and not fake.

## Phase 5 - Phone Web Cert

Phone browser must support signup/login, Sage chat, model picker, credits/BYOK setup, gateway status, tools, approvals, History, Memory, Integrations, Studio, Marketplace, Gateway, and Settings.

Exit gate: phone user can command Sage without opening a laptop and can still reach non-chat product surfaces.

## Phase 6 - Headless Gateway Contract

The gateway is the core device-control layer.

Build or lock:

- One gateway identity per device.
- Outbound WSS only.
- Revocable pairing token.
- Device states: Offline, Online, Degraded, Supervisor unhealthy.
- Tools exposed by manifest only.
- No inbound ports required.

Exit gate: website shows This Mac only when gateway is online; cloud chat still works when the local computer is offline.

## Phase 7 - Install UX

Do not expose WSS/gateway language to normal users.

UX:

- Connect this computer.
- Install Empyralis Companion.
- Pair this Mac.
- Permission checklist: Files, Screen Recording, Accessibility, Browser, Clipboard, Terminal.

Exit gate: a non-developer can understand what must be installed and which local permissions are needed. Packaged Mac installer is the next production packaging gate.

## Phase 8 - Permission Modes

Expose only two user-facing modes.

- Default: safe tools run automatically; risky actions ask approval.
- Full Access: broad local access for the paired user-owned computer session only.

Full Access remains governed:

- Local companion only.
- Explicit owner approval.
- Audited.
- Revocable.
- Stop button still works.
- Secrets are redacted from user-visible logs.
- Never applies to Cloud Computer.

Exit gate: user understands what Sage can do before enabling local power.

## Phase 9 - Gateway Visual Transparency

Headless tools remain primary. Visual is the trust layer.

Build:

- Screenshot rows.
- "Sage clicked X".
- "Reading file".
- "Running shell".
- "Sending Telegram".
- Optional periodic screenshots for long local/desktop tasks.
- Later: live WebRTC view.

Exit gate: user sees what happened without reading logs.

## Phase 10 - Studio + Marketplace + Mini Apps

Studio creates/manages private specialists. Marketplace installs governed templates, tools, providers, and mini-apps.

For demo:

- Studio templates: Restaurant Orders, Auto Parts Sales, Real Estate Leads, Support FAQ, Appointment Booking, Spreadsheet Catalog Bot, Custom Agent.
- Marketplace preview only.
- Developer publishing hidden by default.

Exit gate: normal users understand create vs install.

## Phase 11 - History, Memory, Storage

History is cloud-canonical. Local, phone, Tauri, and future native stores are encrypted caches. Memory is structured: Safe, Sensitive, Private, Critical.

Exit gate: history follows the user across devices without unlimited storage risk.

## Phase 12 - Privacy/Security Cert

Verify:

- Gateway tokens are revocable.
- Secrets never hit frontend logs.
- Dangerous shell requires approval in Default mode.
- File write/delete requires approval in Default mode.
- External send requires approval in Default mode.
- Tool outputs redact obvious secrets.
- Every local action creates an audit event.
- Gateway offline disables local tools immediately.

Exit gate: local-device automation is powerful but not scary.

## Phase 13 - Cross-Platform Companion

Deferred for launch.

Order:

- Mac first: Tauri + LaunchAgent.
- Windows second: signed tray/service.
- Linux third: AppImage/deb/rpm, with Wayland caveats.

Exit gate: do not promise platforms until each has real certification.

## Phase 14 - Cloud Computer MVP

Deferred.

Start with:

- Cloud browser.
- Ephemeral Linux sandbox.
- TTL cleanup.
- Spend meter.
- Audit timeline.
- Artifacts/screenshots.

Exit gate: user can pay for Sage to work when the local computer is offline.

## Phase 15 - Final Launch Cert

Run:

- Typecheck/build.
- Python compile.
- Production auth.
- Provider save/catalog.
- 10-message Sage.
- Phone browser smoke.
- Gateway online/offline.
- Studio/Marketplace visual sweep.
- Credits/quota enforcement.

Exit gate: no raw errors, no disappearing messages, no blank dead screens.

## Current Dirty Files Outside Release Scope

Do not include unless explicitly chosen:

- `frontend/test-results/.last-run.json`
- `mobile/app/(tabs)/_layout.tsx`
- `mobile/package-lock.json`
- `.gemini/`
- `docs/READ THIS MD FILE!!!.md`
