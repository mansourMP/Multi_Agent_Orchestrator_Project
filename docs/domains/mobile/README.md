# Mobile Operator Surface

Status: Active
Owner: Platform
Last verified: 2026-06-07
Source of truth: `mobile/src/screens/HomeScreen.tsx`, `mobile/app/integrations.tsx`

Mobile is the lightweight Sage operator surface. It is not a desktop clone and
does not carry marketplace, Studio, or deep hardware setup as permanent bottom
navigation.

## Product Contract

- Primary action: message Sage.
- Secondary actions: approvals, active work, recipes, automations, and
  connections.
- Connections show the canonical backend truth for channels, apps, and tools.
- Planned or locked lanes must stay visible but non-deceptive.
- Agent Computer is optional for cloud/app work and required only for local
  hardware, browser profile, and personal-channel bridge work.

## Messaging Model

Messaging apps are remote-control lanes into Sage. They are not separate chat
history stores. Telegram is the first practical launch lane. Apple Messages for
Business is the official future lane and requires MSP/human-handoff review.
Private iMessage remains a planned Agent Computer bridge, not a public launch
promise.

## Navigation Contract

Mobile bottom navigation should stay minimal:

- Sage
- Activity
- Settings

Apps, Discover, recipes, automations, integrations, machines, and approvals are
reachable from Sage actions or direct routes, not permanent bottom tabs.
