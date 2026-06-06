# Empyralis AI OS Five-Phase Execution Plan

Date: 2026-04-30

## Decision Summary

Empyralis should keep the public demo focused on the certified Sage path, then build the broader AI operating system in five dense phases.

The platform direction is valid:

- Sage is the personal cloud brain.
- Gateway is the trusted bridge to a user's own machine.
- Studio is the B2B specialist-agent builder.
- Marketplace is governed distribution for templates, mini-apps, providers, and third-party packages.
- Mini Apps are the in-chat application layer.
- Sage Cloud Computer is a paid premium runtime for users who want Sage to work even when their own computer is offline.

Do not make Sage Cloud Computer a launch blocker. It belongs in the architecture and pricing model now, but the first public demo should not depend on a live cloud desktop unless it has passed a separate security and cost certification.

## Current Platform Baseline

Already implemented or certified enough to treat as real foundation:

- FastAPI runtime in `server_modules`.
- Sage web shell and composer.
- Provider catalog and model picker.
- Gateway pairing, WSS registration, and local supervisor path.
- Cloud/local provider tool parity for the certified paths.
- Codex-style chat direction with typed transparency cells.
- Studio template direction.
- Marketplace as governed discovery, not private-agent creation.
- Hosted mini-app contract and bridge routes.
- Production credential save and basic Sage stream certification have passed in the current handoff.
- Sage Cloud Computer backend contract: runtime target, attachment kind, trust model, entitlement metering flag, bootstrap projection, and tool-inventory wording. It is optional and cannot be auto-selected by a generic hosted run.

Known demo risks that still need hardening before public use:

- Mobile/web bootstrap can still show 500/504 states in some environments.
- Studio has a useful template grid, but needs a clear custom-agent CTA and right-side detail pane.
- Marketplace is conceptually right, but empty states make it look unused.
- Integrations needs tighter density and clearer provider/tool visual hierarchy.
- Memory should become a structured store with optional Markdown export, not raw Markdown as the canonical data model.
- Sage Cloud Computer still needs a real provisioner/vendor adapter, live browser/sandbox session certification, spend UI, and security review before it is demoed as a live product.

## Layer Model

## Architecture Correctness Check

The hybrid model is correct, but only if these concepts stay separate:

- Agent definition: prompt, policy, connectors, memory rules, tool permissions, billing class.
- Run: one execution attempt with a run_id, status, audit timeline, cost, and output.
- Runtime: where a run executes. Examples: cloud brain, this Mac via gateway, Sage Cloud Computer, cloud worker, browser session, sandbox.
- Tool: a capability the run may invoke under policy. Examples: search, file read, shell, image generation, Telegram send.
- Connector: an authenticated account or API integration. Examples: Gmail, Telegram bot, Google Drive, WhatsApp Business.

Do not create a virtual computer for every agent. That would be expensive, slow, and hard to secure at scale. Most specialist agents should be definitions plus cloud worker runs. A virtual computer is only needed when the work requires an interactive browser, filesystem, terminal, GUI, persistent workspace, or isolated code execution.

Correct runtime mapping:

| Agent or task type | Default runtime | Virtual computer needed? | Reason |
| --- | --- | --- | --- |
| Sage normal chat | Cloud brain | No | Provider/model reasons, cloud tools execute through normal services. |
| Sage reading user's laptop file | This Mac via gateway | No | User's own machine is the runtime. |
| Sage working while laptop offline | Sage Cloud Computer | Yes, optional paid | Needs a substitute computer. |
| Restaurant order specialist | Cloud worker | No | Mostly messaging, catalog lookup, memory, connector calls. |
| Auto parts sales specialist | Cloud worker | No by default | Needs catalog/search/connectors, not a desktop. |
| Spreadsheet catalog bot | Cloud worker or sandbox per run | Sometimes | Sandbox only if it runs code or transforms uploaded files. |
| Web automation agent | Cloud browser | Sometimes | Browser session is enough before full desktop. |
| Code/data agent | Ephemeral sandbox | Yes, per run | Needs isolated execution and artifacts. |
| Heavy GUI automation | Cloud desktop | Yes, premium | Needs screen, browser, terminal, long-running state. |

Scale rule:

- One million configured agents must not mean one million running computers.
- Idle agents are rows/configuration, not infrastructure.
- Active runs enter a durable queue.
- Workers claim runs under per-user, per-workspace, and per-provider concurrency limits.
- Sandboxes, browsers, and cloud computers are created only for active runs that require them.
- Every runtime has TTL, idle timeout, spend cap, and cleanup.

AI must not own infrastructure decisions. The model may request a tool, but the control plane decides:

- whether the tool exists,
- whether the user has permission,
- which runtime can execute it,
- whether approval is required,
- whether quota/budget allows it,
- how results are logged and returned.

This keeps the infrastructure deterministic. The AI is the reasoning layer, not the scheduler, policy engine, secrets broker, or billing system.

### 1. Sage Cloud Brain

Purpose:

- Owns user identity, conversation state, policy, provider routing, tool catalog, approvals, billing, and audit timeline.

Must never do:

- Pretend a local device is online when gateway is offline.
- Hide effective provider/runtime fallback.
- Let a model decide tool availability from prompt text.

### 2. Local Gateway And Supervisor

Purpose:

- Runs on the user's trusted Mac/PC.
- Executes local files, shell, browser, screenshot, clipboard, and desktop actions.
- Streams action status back to Sage.

Boundary:

- Gateway is a device bridge, not a provider.
- Provider choice only changes reasoning model.
- Gateway status determines local tool availability.

### 3. Sage Cloud Computer

Purpose:

- A paid cloud runtime for autonomous work when the user's laptop is offline or when a task needs isolated compute.

Implemented contract as of 2026-04-30:

- Runtime target id: `sage_cloud_computer`.
- Attachment kind: `cloud_computer`.
- Trust model: `cloud_computer_secure`.
- Execution target: `cloud_computer`.
- Status truth: `Not enabled` until the workspace has a configured hosted session.
- Product rule: never auto-select Cloud Computer for a generic hosted run. It must be explicitly requested by runtime target, runtime profile, or placement manifest.
- Privacy rule: Cloud Computer can operate on its isolated cloud workspace volume, but personal-device files still require the paired gateway.
- Billing rule: Cloud Computer is marked as a metered entitlement target.

Not implemented yet:

- Real cloud browser/sandbox/desktop provisioner.
- Session lifecycle API with TTL and cleanup.
- Visible spend meter.
- Live tenant-isolation certification.
- Phone demo with laptop offline.

MVP ladder:

- Stage A: Cloud browser for web tasks.
- Stage B: Ephemeral Linux sandbox for code, files, data processing, and agent tools.
- Stage C: Full cloud desktop with GUI, browser, files, terminal, and screen streaming.

Positioning:

- "Use this Mac" means local gateway.
- "Use Sage Cloud Computer" means paid hosted runtime.
- "Use cloud tools only" means no local or cloud desktop.

### 4. Studio

Purpose:

- Builds private B2B specialist agents for a business workflow.

Examples:

- Restaurant orders.
- Auto parts sales.
- Support FAQ.
- Appointment booking.
- Spreadsheet catalog bot.

Boundary:

- Studio creates private specialists for a workspace.
- Studio does not publish marketplace packages by default.
- Studio specialists should run in cloud workers unless a premium/private runtime is explicitly selected.

### 5. Marketplace And Mini Apps

Marketplace purpose:

- Governed discovery and installation.
- Packages include templates, mini-apps, providers, tools, and connectors.

Mini App purpose:

- Chat-embedded UI loaded from governed URLs.
- Lets users interact with forms, catalogs, dashboards, calendars, and business workflows inside Sage.

Boundary:

- Marketplace installs.
- Studio builds.
- Mini Apps render.
- Sage orchestrates.

## Five Dense Phases

## Phase 1 - Demo Reliability And Sage Trust Surface

Goal:

- Make the public demo path reliable before adding more capability.

Build and fix:

- Production/mobile bootstrap 500/504 handling.
- Signup/login/account-shell timeout path.
- Provider save and provider catalog truth.
- Chat lifecycle: immediate user message, immediate draft clear, stable assistant response, stop square, no disappearing messages.
- Tool transparency cells: Thinking, Searching, Reading, Running, Done, Failed.
- Remove text-only error banners. Every failed state needs a retry, setup link, or clear next action.
- Ensure empty chat stays clean, not blank-broken.

Exit gate:

- A new demo user signs up on web and phone, connects one provider, sends 10 messages, sees stable responses, and never sees raw backend text.

Why this is proven:

- OpenAI's ChatGPT simplification removed model/tool switching friction by putting browsing, files, and analysis in one place.
- The demo must feel like a single product surface before the platform layers matter.

Implementation prompt:

```text
PHASE 1 - DEMO RELIABILITY AND SAGE TRUST SURFACE

Read first:
- docs/archive/2026-05-15-outdated-docs/current-state-handoff-2026-04-29.md
- docs/pending-tasks.md
- frontend/lib/workspace/workstation-chat-pane.tsx
- frontend/lib/workspace/chat-composer.tsx
- frontend/lib/workspace/codex-chat/*
- frontend/lib/server/control-plane-proxy.ts
- server_modules/auth.py
- server_modules/provider_catalog_service.py
- server_modules/direct_chat_generation_service.py
- server_modules/direct_chat_tool_catalog_service.py

Rules:
- No new feature surface.
- Fix only demo blockers.
- Do not reintroduce trace cards or raw errors.

Tasks:
- Certify production and local signup/login/bootstrap.
- Certify provider save and catalog truth.
- Certify 10-message chat stability.
- Certify stop square and Escape abort.
- Certify no text-only error banners.
- Certify tool transparency cells render from real events.

Exit gate:
- Web and phone demo path works without 500/504, disappearing messages, raw errors, or false provider state.
```

## Phase 2 - Studio Builder And Marketplace Seed

Goal:

- Make Studio and Marketplace understandable in 30 seconds.

Build and fix:

- Studio home shows square templates and existing specialists.
- Add a visible `+ Build custom agent` action.
- Selecting a template opens a setup sheet, not a route takeover.
- Right side of Studio shows selected template details: purpose, connectors, tools, memory, deploy checklist, estimated setup time.
- Marketplace gets seeded governed packages: Restaurant Orders, Auto Parts Sales, Spreadsheet Catalog, Web Search, Image Generation, Telegram Bot, Gmail, Notion, GitHub.
- Marketplace has install/configure buttons and trust metadata.
- Developer publishing stays behind explicit developer/admin mode.

Exit gate:

- A business owner can create a draft specialist from a template or custom flow without seeing developer publishing controls.
- A developer can understand where package publishing lives, but normal users are not forced through it.

Why this is proven:

- GPT Store proved that users understand picking a task-specific agent from a catalog.
- Stripe Apps proved that governed distribution works when packages carry permissions, settings, secrets, and review metadata.
- Apple App Store economics prove users understand app marketplaces and developers understand platform commissions.

Implementation prompt:

```text
PHASE 2 - STUDIO BUILDER AND MARKETPLACE SEED

Read first:
- docs/studio-marketplace-ux-boundary-2026-04-30.md
- frontend/lib/workspace/workstation-deployed-agents-pane.tsx
- frontend/lib/marketplace/marketplace-pane.tsx
- shared/design-system/tokens.ts

Rules:
- Keep Studio and Marketplace separate.
- No heavy redesign outside these surfaces.
- No production billing implementation yet.

Tasks:
- Add `+ Build custom agent` to Studio.
- Add template detail pane and setup sheet clarity.
- Seed Marketplace packages with governed metadata.
- Hide developer registration by default.
- Add install/configure empty-state actions.

Exit gate:
- Studio creates private specialists.
- Marketplace installs governed packages.
- The two pages no longer look blank or interchangeable.
```

## Phase 3 - Mini App Runtime And Package Governance

Goal:

- Turn Marketplace packages into usable in-chat experiences.

Build and fix:

- Mini App manifest schema: id, name, publisher, version, runtime URL, permissions, billing class, data scopes, safe-area support, theme support.
- Mini App bridge: Sage to app, app to Sage, app to specialist, app to connector runtime.
- Runtime events: open, close, submit, request approval, request tool, complete.
- Mobile-safe rendering: respects safe area, light/dark theme, responsive layout.
- App install grants scoped permissions, not global workspace access.
- Package review metadata: publisher, verified status, requested scopes, data retention, billing class.

Exit gate:

- A installed mini app can open inside Sage, submit structured data back to an agent, request approved tools, and close cleanly.

Why this is proven:

- Telegram Mini Apps prove chat-embedded web apps can support payments, storage, push-like experiences, theme adaptation, and mobile-first launch paths.
- The important lesson is not Telegram's exact UI. It is that apps should launch from the chat context with scoped data and native-feeling controls.

Implementation prompt:

```text
PHASE 3 - MINI APP RUNTIME AND PACKAGE GOVERNANCE

Read first:
- docs/pending-tasks.md
- server_modules/hosted_mini_app* if present
- server_modules/routes_marketplace.py
- frontend/lib/marketplace/marketplace-pane.tsx
- frontend/lib/workspace/workstation-chat-pane.tsx
- frontend/lib/workspace/codex-chat/*

Rules:
- No arbitrary iframe access.
- Every app action must be scoped by install permissions.
- Developer publishing remains hidden from normal users.

Tasks:
- Finalize mini app manifest and install permission shape.
- Wire app open/close/submit/runtime events into Sage.
- Add package trust metadata to Marketplace details.
- Add safe failure states when a mini app cannot load.
- Certify one sample mini app end to end.

Exit gate:
- One governed mini app opens in Sage, uses scoped permissions, returns data to the agent, and can be uninstalled.
```

## Phase 4 - Sage Cloud Computer MVP

Goal:

- Give Sage its own paid computer without weakening local-device privacy.

Decision:

- Include this in the platform architecture now.
- Do not block the immediate public demo on it.
- Start with cloud browser and sandbox. Full GUI desktop is a premium later step.

Current status:

- Backend contracts are now present for the optional metered runtime lane.
- The next work in this phase is provisioning, routing execution to the provisioned runtime, and user-visible spend/audit state.
- This phase is not closed until a real browser or sandbox task runs end to end while the local gateway is offline.

Build and fix:

- Runtime selector: Cloud tools only, This Mac, Sage Cloud Computer.
- Cloud Computer session model: computer_id, workspace_id, user_id, agent_id, run_id, state, ttl, spend_limit, recording_policy.
- Tool routing: local tools route to gateway when This Mac is selected; route to Cloud Computer when Sage Cloud Computer is selected.
- Ephemeral by default. Persistent volume only when user explicitly enables it.
- No local laptop access from Cloud Computer unless gateway is separately paired and approved.
- Hard tenant isolation: no shared filesystem, no shared browser profile, no cross-user network/session state.
- Network egress policy and dangerous-action approval.
- Per-minute metering and user-visible spend cap.

MVP order:

1. Cloud browser for web tasks and website automation.
2. Ephemeral Linux sandbox for shell, code, files, data processing, and generated artifacts.
3. Full cloud desktop with browser, terminal, screen stream, and download/export.

Exit gate:

- A user on phone can ask Sage to complete a task with Sage Cloud Computer while their laptop is offline.
- The UI shows what computer is being used, what tools are running, and how much paid runtime is being consumed.

Why this is proven:

- E2B exposes agent sandboxes for code execution, computer use, persistence, snapshots, interactive terminal, SSH, filesystem, internet, and proxy tunneling.
- Modal Sandboxes are explicitly designed for secure containers running untrusted user or agent code with timeouts, networking, file access, and secrets.
- Browserbase proves cloud browser agents are a practical first step before full cloud desktops.

Implementation prompt:

```text
PHASE 4 - SAGE CLOUD COMPUTER MVP

Read first:
- server_modules/gateway_execution_service.py
- server_modules/direct_chat_tool_catalog_service.py
- server_modules/direct_chat_generation_service.py
- frontend/lib/workspace/chat-composer.tsx
- frontend/lib/workspace/workstation-chat-pane.tsx
- docs/domains/agent-computer/gateway-architecture.md

Rules:
- This is a paid premium lane.
- Do not weaken gateway privacy.
- Do not make cloud computer required for normal cloud chat.
- Start ephemeral. Persistence must be explicit.

Tasks:
- Add runtime model for Sage Cloud Computer.
- Add cloud browser/sandbox provider abstraction.
- Route eligible tools to cloud runtime when selected.
- Add visible runtime pill and spend state.
- Add approval gates for destructive/external actions.
- Certify tenant isolation, TTL cleanup, and billing events.

Exit gate:
- Phone user can run one web task and one sandbox task through Sage Cloud Computer with visible audit and spend, while local gateway is offline.
```

## Phase 5 - Billing, Privacy, Certification, And Launch

Goal:

- Make the platform safe, monetizable, and demo-ready.

Build and fix:

- Credits ledger: hosted LLM, image generation, web search, cloud browser, cloud computer, Studio worker runs.
- BYOK mode: user pays provider, Empyralis charges for platform/runtime features.
- Hosted mode: Empyralis provides model credits and bills usage.
- Cloud computer: per-minute metering, spend cap, auto-shutdown.
- Studio: business subscription per deployed specialist plus message/connector usage.
- Marketplace: platform commission on paid packages, proposed initial 70 percent developer / 30 percent platform split, with option to start 85/15 to attract supply.
- Privacy center: devices, data scopes, memory, connectors, audit log, export/delete.
- Approval policy: allow once, allow for session, deny.
- Enterprise controls later: retention, admin logs, allowed providers, allowed apps, private marketplace.

Exit gate:

- Public demo script passes.
- No raw errors.
- No cross-tenant leakage.
- Users can understand what is free, what costs credits, what uses their device, and what uses Sage Cloud Computer.

Why this is proven:

- Apple uses a 15 percent reduced small-business commission and standard commission after thresholds.
- OpenAI's GPT Store introduced usage-based builder revenue and private workspace controls for team/enterprise customers.
- Stripe Apps shows that distribution, secret storage, permissions, and private/public app release paths are core marketplace primitives.

Implementation prompt:

```text
PHASE 5 - BILLING PRIVACY CERTIFICATION AND LAUNCH

Read first:
- docs/archive/2026-05-15-outdated-docs/current-state-handoff-2026-04-29.md
- docs/pending-tasks.md
- server_modules/provider_catalog_service.py
- server_modules/direct_chat_tool_catalog_service.py
- server_modules/gateway_execution_service.py
- server_modules/vault_store.py
- frontend/lib/workspace/workstation-sage-connectors-pane.tsx
- frontend/lib/workspace/workstation-chat-pane.tsx

Rules:
- Privacy and billing must be visible to users.
- No hidden paid runtime.
- No cross-tenant shared state.
- No demo of uncertified video generation.

Tasks:
- Add usage ledger events for hosted model, web, media, gateway, cloud computer, and Studio worker usage.
- Add user-facing credit and spend states.
- Add privacy center controls for devices, connectors, memory, audit, export/delete.
- Add marketplace commission metadata but do not process real payouts until legal/accounting review.
- Run public demo certification on web and phone.

Exit gate:
- The platform can be explained to a non-technical user, a business owner, a developer, and an investor without contradicting the product or code.
```

## Customer Usage Model

### Personal User

Flow:

1. Opens Sage on phone or web.
2. Connects provider or uses hosted credits.
3. Connects optional local gateway.
4. Asks Sage to do work.
5. Sage uses cloud tools by default.
6. If a task needs the user's Mac, Sage checks gateway status.
7. If gateway is offline, Sage says the device is unavailable and offers Sage Cloud Computer when appropriate.
8. User sees a transparent timeline of actions.

Value:

- One assistant that follows the user across phone, web, and local computer.
- Local control when needed.
- Cloud autonomy when the laptop is offline.

### Business Owner

Flow:

1. Opens Studio.
2. Chooses a template such as Auto Parts Sales.
3. Connects Telegram/WhatsApp bot and catalog source.
4. Tests the specialist.
5. Deploys it as a cloud worker.
6. Reviews conversations, escalations, and usage.

Value:

- Business automation without building software.
- Clear deployment and connector path.
- Specialist does not get full personal-device power.

### Developer

Flow:

1. Opens Marketplace developer mode.
2. Registers a package or mini app.
3. Declares permissions, scopes, billing, and runtime requirements.
4. Tests in a sandbox workspace.
5. Publishes for review.
6. Earns revenue when users install paid packages.

Value:

- Distribution into agent workflows.
- Clear governance and monetization.
- Mini Apps provide UI, not just backend tools.

## Privacy And Isolation Requirements

Non-negotiable:

- Tenant boundary: user_id, workspace_id, agent_id, run_id, device_id, computer_id.
- Secrets never enter prompts unless intentionally transformed into scoped tool calls.
- Tool availability comes from backend catalog, not model claims.
- Local gateway never shares files unless a tool call is authorized under workspace policy.
- Cloud Computer never reuses another user's filesystem, browser profile, terminal session, memory, or secrets.
- Persistent Cloud Computer volumes are opt-in and encrypted.
- External sends, purchases, destructive file operations, dangerous shell, and connector writes require approval.
- Every privileged action writes an audit event.
- Users can export and delete memory.
- Studio agents have isolated connector scopes and do not inherit Sage personal gateway by default.

Runtime isolation requirements:

- Cloud worker: no local filesystem, no desktop, scoped connector tokens only.
- Cloud browser: isolated browser profile, isolated cookies, explicit retention policy, no cross-run profile reuse unless user enables persistence.
- Sandbox: per-run filesystem, TTL cleanup, no shared process namespace, scoped network egress, no long-lived secrets in environment by default.
- Cloud desktop: one tenant per desktop session, spend cap, session recording policy, encrypted optional volume, explicit user stop control.
- Local gateway: user-owned device only; no Studio specialist receives Sage personal gateway access unless the user explicitly grants a business/private runtime.
- Secrets broker: short-lived tool credentials, never raw provider or connector secrets in model prompts.
- Audit timeline: every runtime start, tool call, file read/write, external send, approval, and cost event is visible.

## Monetization Model

Free:

- Basic Sage chat with BYOK provider.
- Limited hosted trial credits.
- Basic Marketplace browsing.
- Limited Studio drafts.

Paid:

- Hosted model credits.
- Image generation credits.
- Web/search/fetch credits if costs exceed free tier.
- Sage Cloud Computer minutes.
- Persistent cloud computer storage.
- Studio deployed specialists.
- Business connectors.
- Team/enterprise governance.
- Marketplace commission on paid packages.

Recommended commission:

- Early supply growth: 85 percent developer / 15 percent platform.
- Mature marketplace: 70 percent developer / 30 percent platform.
- High-cost hosted runtime packages: separate infrastructure fee before revenue share.

Hybrid platform economics:

- BYOK plus local gateway is the low-cost trust wedge. Users can bring their own model key and own computer, which reduces Empyralis inference cost and builds trust.
- Hosted credits are the simple mainstream path. Non-technical users should not need to understand API keys.
- Sage Cloud Computer is premium infrastructure. Charge per minute/hour plus storage if persistent volumes are enabled.
- Studio is recurring B2B revenue. Charge for deployed specialists, message volume, connector usage, and higher reliability/SLA tiers.
- Marketplace creates platform leverage. Free packages grow usage; paid packages and premium runtimes create revenue share.
- The platform should show usage as credits for normal users and detailed cost breakdowns for power users/admins.

## Public Demo Boundary

Demo now:

- Signup/login.
- Sage chat.
- Provider picker.
- Tool transparency.
- Gateway offline status.
- Web search.
- Optional local gateway file/shell demo if stable.
- Studio templates as B2B expansion.
- Marketplace as governed distribution.

Do not demo yet:

- Video generation.
- Cloud Computer live desktop unless separately certified.
- Developer payout flow.
- Enterprise admin controls.

## Reference Patterns

- OpenAI GPTs and GPT Store: custom agents, workspace controls, and builder revenue. Reference: https://openai.com/index/introducing-the-gpt-store/
- Telegram Mini Apps: chat-embedded mobile web apps, payments, storage, theme/safe-area support, and launch links. Reference: https://core.telegram.org/bots/webapps
- Stripe Apps: governed app distribution with secret storage, permissions, private/public release paths, and embedded custom UI. References: https://docs.stripe.com/stripe-apps and https://docs.stripe.com/stripe-apps/reference/permissions
- Apple App Store: marketplace economics and small-business commission precedent. Reference: https://developer.apple.com/app-store/small-business-program/
- E2B: cloud sandboxes for agent code execution, computer use, filesystem, terminal, internet, persistence, snapshots, and proxy tunneling. Reference: https://e2b.dev/docs
- Browserbase: cloud browser agents, search, fetch, browser automation, and scheduled/on-demand functions. Reference: https://docs.browserbase.com/welcome/introduction
- Modal Sandboxes: secure containers for untrusted user/agent code, lifecycle timeouts, networking, file access, secrets, and readiness. Reference: https://modal.com/docs/guide/sandboxes
