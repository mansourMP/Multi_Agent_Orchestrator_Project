# History, Runtime, and Storage Boundary

Date: 2026-05-01
Status: demo architecture decision

## Decision

Sage conversation history is cloud-canonical. Local devices, gateways, and future cloud computers may keep encrypted caches, but they do not own the primary transcript.

## Why

- Phone, desktop web, and future native mobile must show the same conversation history.
- A paired Mac gateway can be offline, asleep, replaced, or revoked, so it cannot be the sole source of truth.
- A future Sage Cloud Computer needs the same thread context without depending on the user's personal machine.
- Studio agents and marketplace packages need auditable cloud-side event history for billing, safety, and support.

## Runtime Ownership

- Sage Cloud Brain owns threads, memory, provider routing, billing, policy, audit events, and approvals.
- This Mac / Gateway owns local execution only while paired and online: files, browser, screenshots, clipboard, terminal, and personal device channels.
- Sage Cloud Computer is an optional paid runtime for browser/sandbox/desktop tasks when the user does not want to use a local device.
- Studio specialists are cloud-worker agents by default. They only receive a dedicated cloud computer when the job requires a browser, terminal, desktop session, or long-running isolated compute.

## Storage Model

- Store full user/assistant transcript in the cloud with workspace-scoped access control.
- Store tool/action audit events separately from assistant text so logs can have shorter retention than conversation history.
- Store local screenshots, shell outputs, downloaded files, and other large artifacts in artifact storage with per-plan quotas and TTL policies.
- Store durable memory as explicit structured records with sensitivity classes, not as raw hidden transcript.
- Keep encrypted local cache on phone/desktop/gateway for speed and offline viewing where appropriate.

## Limits

- Free plan should cap retained messages, artifacts, and audit logs.
- Paid plans should increase history/artifact retention and allow cloud-computer runtime credits.
- Raw tool traces and screenshots should have short default retention.
- User-approved memories should be counted separately and shown in the Memory surface.
- Users need export, delete, and workspace wipe controls before public scale.

## OpenClaw-Style Parity Target

The competitive target is local power plus cloud continuity:

- Local-first tools stay powerful through the gateway.
- Cloud-first access stays available from phone and browser.
- Cloud computer fills the gap when the user's device is unavailable.
- Tool transparency is visible in the transcript regardless of which runtime executes the action.
- Provider choice changes model quality, not tool availability.

## Demo Gate

For public demo, certify:

- History tab lists previous conversations from cloud-canonical thread data.
- Sending messages from the web app updates the same cloud thread.
- Gateway offline does not erase history or block cloud chat.
- Local tool use adds transparent audit cells to the same thread.
- No raw runtime errors are shown as conversation history.
