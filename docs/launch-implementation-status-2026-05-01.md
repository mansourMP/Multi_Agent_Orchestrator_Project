# Launch Implementation Status

Date: 2026-05-01
Status: current implementation tracker

## Current Launch Verdict

The web Sage public-demo path is the only launch lane that should be treated as nearly certified. Native mobile, Tauri desktop companion, Cloud Computer, and Marketplace publishing remain separate certification lanes.

## Implemented Or Contract-Ready

- Production provider save and Sage chat have been certified with DeepSeek in prior checks.
- Chat uses Codex-style transcript cells for thinking, tool, approval, screenshot/artifact, and assistant output.
- Gateway offline state is part of the runtime/tool truth model.
- Studio has square templates and a custom-agent path.
- Marketplace has governed preview packages and hides developer publishing behind an explicit panel.
- Memory is modeled as structured sensitivity classes, with Markdown suitable as import/export rather than canonical runtime state.
- Cloud Computer has a backend/runtime contract but no live provisioner.
- Tauri has a desktop shell and update hooks, and is now documented as the local companion lane.

## Remaining Demo-Critical Work

1. Run a final visual browser sweep on production after the latest deploy.
2. Run a real phone-browser sweep against production.
3. Confirm the latest degraded account/onboarding recovery buttons render on mobile.
4. Keep live demo credentials outside git.
5. Do not demo Cloud Computer or native mobile until their separate certs pass.

## Remaining Product Work

- Native mobile certification: login, provider picker, chat, history, memory, tools, approvals, gateway status.
- Tauri certification: pairing, local tool execution, supervisor health, approval flow, signed release.
- Cloud Computer MVP: cloud browser, sandbox, TTL cleanup, spend meter, audit timeline, artifact egress.
- Billing and hosted AI credits: usage ledger, credit balance, spend caps, plan enforcement.
- Marketplace backend seed: installable packages with permissions, pricing, publisher, and trust metadata.

## Hard Rules

- Provider choice changes reasoning model only; it must not change tool truth.
- Local tools are enabled by gateway status, not provider.
- Full Access is only for local companion, never Cloud Computer.
- Cloud transcript history is canonical; local stores are caches.
- Raw runtime errors must never become chat transcript or composer text.
