# Empyralis Launch + AI OS Master Plan

Date: 2026-05-01

This document is the durable handoff for the current launch plan. It merges the public demo path with the long-term AI OS architecture: Sage, hosted credits, BYOK, local gateway, Tauri companion, mobile, Studio, Marketplace, Mini Apps, privacy, and Cloud Computer.

## Product Rule

Normal users should not need to understand API keys.

- Default path: Use Empyralis credits.
- Advanced path: Use your own API key.
- BYOK remains available for power users and businesses that want direct provider billing.
- Hosted credits must keep provider keys server-side, enforce spend caps server-side, and ledger every hosted turn.

## Provider Error Policy

- Empyralis hosted credits: never expose raw provider/API errors to users. Show polished app-level messages only, for example: "Sage hit a temporary provider issue. Try again or switch model."
- BYOK: provider-specific setup/runtime errors may be shown in safe form, for example: "DeepSeek quota reached" or "Check your API key." Do not show stack traces, secrets, transport dumps, or raw internal exceptions.
- Internal logs may keep raw details with request id, workspace id, provider, and trace id for debugging.

## Launch-Critical Phases

### Phase 1 - Public Demo Hardening

Production Sage must load every time. Verify production signup/login, account shell, Sage bootstrap, provider catalog, and actionable empty states.

Exit gate: no 500/504, no raw bootstrap text, no dead shell screen.

### Phase 2 - Hosted Credits + BYOK Provider UX

Make provider setup understandable for non-technical users.

- Default CTA: Use Empyralis credits.
- Advanced CTA: Use your own API key.
- Provider picker and Integrations must clearly separate hosted credits from BYOK.
- Billing/credits UI must show balance, cap, used amount, and policy.

Exit gate: a non-technical user can start Sage without knowing what an API key is.

### Phase 3 - Production Sage Smoke

Use a clean demo workspace with hosted credits enabled or one reliable BYOK provider configured. Send 10 messages.

Verify:

- User message appears immediately.
- Input clears immediately.
- Assistant response appears.
- Thinking row appears.
- Stop square works.
- Provider metadata is truthful.
- No timeout/raw-error banners.

Exit gate: production Sage is demo-safe.

### Phase 4 - Chat Surface Finalization

Sage chat must use committed transcript plus active turn projection.

Required transcript cells:

- user
- assistant
- reasoning summary
- tool
- web search
- file
- shell/exec
- screenshot/artifact
- approval
- status
- error

Rules:

- Canonical refresh must never wipe pending user messages or active streaming output.
- Tool/file/search/shell rows render inline.
- "What tools do you have?" answers from backend tool catalog, not model hallucination.
- No debug cards like Run complete, Sage trace, stack traces, or text-only temporary-error banners.
- Stop square and Escape abort preserve partial output.

Exit gate: 20-message local and production runs pass with no flicker, dropped messages, false timeout banner, or fake tool list.

### Phase 5 - Phone Web Cert

Phone browser is part of the public web launch.

Verify:

- Signup/login.
- Sage chat.
- Provider picker.
- Hosted credits/BYOK setup.
- Runtime pill: Cloud, This Mac, or Gateway offline.
- Tools palette.
- Approvals.
- History.
- Memory.
- Integrations.
- Recovery actions.

Exit gate: phone user can complete a Sage chat without shell-unavailable dead screens.

### Phase 6 - Final Launch Cert

Run:

- Frontend typecheck.
- Frontend production build.
- Python compile.
- Targeted backend tests.
- Production auth smoke.
- Production provider save/catalog smoke.
- 10-message Sage smoke.
- Phone browser smoke.
- Gateway offline smoke.
- Optional gateway online local-tool demo.
- Studio/Marketplace visual sweep.

Exit gate: no raw errors, no disappearing messages, no blank dead screens.

## Follow-On Product Phases

### Phase 7 - Tauri Desktop Companion

Tauri is the local companion/gateway app, not a second product brain.

It owns:

- Pairing.
- Gateway/supervisor lifecycle.
- Local permissions.
- Tray/logs.
- Revoke access.

It reuses:

- Cloud account.
- Provider catalog.
- Tool catalog.
- Audit events.
- Approval policy.

Exit gate: user pairs Mac, sees This Mac, runs local file/shell task, approves risky actions, and can revoke.

### Phase 8 - Studio + Marketplace + Mini Apps

Studio creates and manages private agents. Marketplace installs governed templates, tools, providers, and mini-apps.

Studio templates:

- Restaurant Orders
- Auto Parts Sales
- Real Estate Leads
- Support FAQ
- Appointment Booking
- Spreadsheet Catalog Bot
- Custom Agent

Setup sheet tabs:

- Overview
- Knowledge
- Tools
- Channels
- Memory
- Safety
- Test
- Deploy

Marketplace packages must show publisher, permissions, pricing, runtime, data access, and trust state. Developer publishing stays hidden behind developer mode.

Exit gate: normal users understand create vs install.

### Phase 9 - History, Memory, Storage

History is cloud-canonical. Local, Tauri, and mobile storage are encrypted caches only.

Memory runtime truth is structured:

- Safe
- Sensitive
- Private
- Critical

Markdown can remain import/export format, not runtime truth.

Add retention, export/delete, workspace wipe, artifact TTL, per-plan storage caps, and separate audit storage for tool/action events.

Exit gate: cross-device continuity works and storage cannot grow unbounded.

### Phase 10 - Credits, Billing, Hosted AI

Complete the Manus-style credit system.

Required:

- Hosted credits for Sage/provider usage.
- BYOK fallback.
- Usage by provider, model, tool, runtime, image generation, Studio agent, and future Cloud Computer.
- Credit balance.
- Spend cap.
- Plan limits.
- Usage ledger UI.
- Server-side quota enforcement.
- Billing events with workspace, actor, provider/model/runtime/tool, units, cost/credit amount, and trace/run id.

Exit gate: user can pay inside Empyralis instead of buying API credits elsewhere.

### Phase 11 - Privacy, Security, Approvals

Every tool action creates an audit event.

Execution modes:

- Default
- Approvals
- Autopilot
- Full Access

Full Access is local-companion-only. Cloud Computer uses metered Autopilot sandbox, not Full Access.

Approval required for:

- Delete/write file.
- External send.
- Purchase.
- Dangerous shell.
- Connector side effects.

MCP/tools/connectors require permission manifests with risk, scopes, runtime modes, approval rules, cost class, and audit event type.

Exit gate: user can see what Sage did, approve risky actions, revoke access, and trust that tools/packages are policy-governed.

### Phase 12 - Cloud Computer MVP

Start with Cloud Browser plus ephemeral Linux sandbox, not full streamed desktop.

Required:

- Session create.
- Heartbeat.
- Idle timeout.
- TTL cleanup.
- Artifacts.
- Logs.
- Tool dispatch.
- Spend meter.
- Hard cap.
- Audit timeline.
- Screenshot/artifact rows.

Exit gate: user can pay for Sage to run web/code/file tasks in hosted compute while Mac is offline.

## What To Demo

Demo:

- Signup/login.
- Sage chat.
- Hosted credits or configured BYOK provider.
- Provider/model picker.
- Thinking/tool transparency.
- Web search.
- History.
- Memory.
- Integrations.

Optional:

- Tauri/gateway local file or shell.
- Studio template creation.

Do not demo until certified:

- Cloud Computer.
- Native mobile app.
- Video generation.
- Marketplace publishing.

## Current Dirty Files Outside Release Scope

Do not include unless explicitly chosen:

- `frontend/test-results/.last-run.json`
- `mobile/app/(tabs)/_layout.tsx`
- `mobile/package-lock.json`
- `.gemini/`
