# Empyralis Must-Do Roadmap

Last updated: 2026-05-02
Status: canonical execution roadmap for launch-to-beta

Implementation note, 2026-05-02:

- Production Sage hosted-credit smoke has passed in prior cert runs, but Render
  web uptime still needs final pre-demo monitoring because a transient `502`
  was observed after deploy.
- Hosted credits and BYOK are both represented in the product UI. Hosted
  credits are the default path for normal users; BYOK remains advanced.
- Backend tool inventory answers are catalog-based, not model-hallucinated.
- Phone web is the launch mobile surface. Native mobile and signed desktop
  companion remain follow-up cert lanes.
- The latest polish pass tightened phone navigation, top tabs, and Integrations
  tool-row alignment without changing provider or gateway routing.
- Gateway Connect now exposes selected-device capability manifests and a
  server-side revoke action in the web/phone operator surface. Pairing still
  uses the developer terminal setup path until the packaged companion exists.
- Sage memory now exposes first-class storage-policy, export, and owner-only
  wipe APIs. Runtime memory remains structured; Markdown is export/import only.
- Security audit emission now redacts obvious provider keys, bearer tokens,
  gateway pairing tokens, cookies, credentials, and nested authorization fields
  before events are stored or streamed.
- Web Google sign-in is now a real OAuth bridge through the Next auth route and
  backend `/auth/provider-login` token verification. Production must set
  `EMPYRALIS_AUTH_ALLOWED_ORIGINS` and Google web OAuth credentials before this
  button is considered certified.
- Hosted-credit UI should show credits only to normal users. Internal USD caps
  remain implementation detail for provider cost control.
- Native mobile launch scope is command-center focused: Chat, Agents,
  Applications, and Profile stay visible; Home/Notifications remain hidden.
  Chat now has a small Memory Capsule and compact transparency rows for
  structured actions/interventions.
- Native mobile Profile now reads `/billing/summary` and shows a credits-only
  Runtime fuel card. It intentionally hides dollar/cost language from normal
  users while still relying on server-side hosted-credit caps.
- Mobile Memory keeps the existing runtime buckets but displays sensitivity
  classes (`Safe`, `Sensitive`, `Private`, `Critical`) so users understand what
  kind of fact they are editing.

## Executive Decision

Empyralis should ship as a web/phone-first AI operating system with a cloud Sage
brain, optional local gateway power, hosted credits by default, BYOK for power
users, and Studio specialists for B2B expansion.

The main product should not be a desktop app and should not depend on official
WhatsApp Cloud API for personal use. The correct architecture is:

```text
Phone / Web / Telegram
  -> Sage Cloud Brain
  -> Hosted credits / BYOK / local model selection
  -> Cloud tools when possible
  -> Local gateway when user-owned device power is needed
  -> Supervisor / local browser / files / clipboard / shell / WhatsApp Web / Telegram
  -> Transparent result back to chat
```

## Non-Negotiable Product Principles

- Sage is the main personal agent.
- Studio agents are specialized B2B workers, not visible sub-agents inside the
  main chat.
- Marketplace is for governed templates, tools, providers, and mini-apps.
- Phone/web is the command center.
- The gateway is the moat.
- Hosted credits are the default path for normal users.
- BYOK and Ollama are advanced paths.
- The local gateway should be closed-source/signed, but never contain the crown
  jewels: billing, orchestration policy, provider keys, or marketplace logic.
- Transparency is a product feature, not debug output.

## Architecture Boundaries

### Cloud Owns

- Account, tenant, workspace, and identity.
- Sage chat, memory, history, audit timeline, and product UI.
- Provider routing.
- Hosted credits, usage ledger, spend caps, and quota enforcement.
- Tool policy and permission manifests.
- Gateway pairing, revocation, and online/offline truth.
- Studio agent definitions and deployments.
- Marketplace governance and package metadata.

### Local Gateway Owns

- One paired device identity.
- Outbound WSS connection to cloud.
- Local files, browser, screenshots, clipboard, terminal, and desktop actions.
- WhatsApp Web session via QR/pairing.
- Telegram personal/local bridge when configured.
- Optional Ollama/local model adapter.
- Local reconnect/journal/outbox/checkpoint state.
- Streaming audit/activity events back to cloud.

### Supervisor Owns

- Narrow local execution primitives only.
- Screenshot, OCR, mouse, keyboard, clipboard, app launch, shell, browser
  control, and local filesystem access.

### Studio Owns

- Specialized business agents.
- Customer channels and business connectors.
- Knowledge sources, catalogs, sheets, docs, and business rules.
- Official WhatsApp Business API later when the customer pays for reliability.

## Core Strategic Choices

### 1. Personal WhatsApp Uses Gateway, Not Official Cloud API

For personal users, WhatsApp should run through the user-owned local gateway:

- User scans QR or links WhatsApp Web on their own device.
- Gateway owns the local session.
- Sage can send/read through that session only with clear authorization.
- Every send is audited.

Why:

- Avoids Meta API costs for personal usage.
- Works for demos and early users.
- Aligns with the OpenClaw gateway/channel pattern.

Limit:

- It is less stable than official business API and should be positioned as a
  personal-device channel, not enterprise infrastructure.

### 2. Business WhatsApp Uses Official API Later

For B2B Studio agents, official WhatsApp Business Cloud API should be an
optional paid connector.

Why:

- Better for reliability, compliance, and customer support automation.
- Business customers can pay for that cost.

### 3. Two Visible Permission Modes Only

Expose only:

- `Default`: safe reads and normal cloud tools; risky actions ask approval.
- `Full Access`: local companion only; broad local automation on the user's
  paired device.

Internal policy may be richer, but normal users should not see four or five
mode names.

Important:

- Full Access is never invisible or unaudited.
- Full Access still protects irreversible/external high-risk actions such as
  purchases, mass deletion, credential exfiltration, and customer messaging.
- Full Access is not the same as cloud sandbox behavior.

### 4. Hosted Credits Default, BYOK Advanced

Normal users should not need to understand API keys.

Default:

- Empyralis credits.
- Cheap reliable model default, currently DeepSeek/Gemini Flash class.
- Hard server-side free cap around `$0.25-$0.50` per new user.

Advanced:

- BYOK provider keys.
- Ollama/local models through the paired computer.

Rule:

- Hosted-provider raw errors should not leak to users.
- BYOK/provider-owner errors can be more explicit, but still must be readable.

### 5. Visual Session Is Transparency, Not Core Automation

Use headless tools for reliability:

- filesystem APIs
- browser automation
- shell
- clipboard
- screenshots
- channel APIs

Use visual/screenshot rows to build trust:

- "Reading file..."
- "Running shell..."
- "Using WhatsApp..."
- "Sage clicked ..."
- screenshot/artifact rows

Do not build pure remote desktop as the primary automation layer.

## Launch Scope

Launch should prove:

- Production web loads.
- Phone web loads.
- New user can chat with Sage using hosted credits.
- Provider/model picker is truthful.
- Gateway offline is truthful.
- User can connect a local device.
- Sage can use that device when online.
- Tool/channel activity is transparent in chat.
- Studio templates exist and are understandable.
- Marketplace preview does not confuse normal users.

Launch should not promise:

- Native mobile app.
- Cross-platform signed companion for all OSes.
- Cloud Computer.
- Marketplace publishing.
- Official WhatsApp Business API for all users.
- Video generation.

## Must-Do Phases

### Phase 1: Production And Phone Reliability

Goal: nobody sees Render dead screens or broken shell states.

Build/fix:

- Production web health and runtime health checks.
- Mobile browser layout for Sage, History, Memory, Integrations, Studio, and
  Marketplace.
- Actionable empty states instead of "workspace unavailable" dead screens.
- Top navigation scroll/collapse on phone.
- Phone-safe composer and stop button.
- Login/signup/account shell cert on phone.

Exit gate:

- A phone user can sign up, open Sage, send a message, and navigate History,
  Memory, Integrations, Studio, and Marketplace without layout traps.

Current status:

- Current production cert passed in a phone-width browser: signup, onboarding,
  Sage shell tabs, Marketplace route, and Studio route loaded without bootstrap
  dead screens.
- Recoverable workspace bootstrap states are actionable, not raw stack text.
- Phone navigation must remain horizontally reachable across Sage, Studio,
  Marketplace, Gateway, Settings, and Sage sub-tabs.

### Phase 2: Hosted Credits And Usage Guardrails

Goal: normal people can use Sage without API keys, and company spend is capped.

Build/fix:

- Default hosted credits for new users.
- Server-side quota check before every hosted model/tool call.
- Credit balance and usage meter in the provider picker/Integrations.
- Clear `Use Empyralis credits` vs `Use your own API key` UX.
- Mask hosted provider errors into user-safe messages.
- Preserve explicit BYOK path for advanced users.

Exit gate:

- A new user can chat without API keys, and a hard cap prevents runaway cost.

Current status:

- New local accounts default to Empyralis-hosted AI with a `$0.50` monthly cap.
- Operators can override the defaults with
  `EMPYRALIS_NEW_ACCOUNT_HOSTED_SAGE_AI_MONTHLY_CAP_USD` and
  `EMPYRALIS_DEFAULT_HOSTED_SAGE_AI_MONTHLY_CAP_USD`.
- Billing shows hosted credits, dollar cap, monthly usage, and an owner-editable
  workspace cap. Integrations shows the remaining credits and cap beside the
  `Use Empyralis credits` path.
- BYOK remains the advanced provider path.

### Phase 3: Gateway Connect UX

Goal: non-developers can connect their own computer.

Build/fix:

- `Connect this computer` card in Integrations.
- Device states: Offline, Online, Degraded, Supervisor unhealthy, Revoked.
- One terminal command first.
- Later: signed Tauri/tray wrapper.
- Pairing token is scoped, revocable, and expires.
- Gateway capabilities are shown as a manifest, not guessed by the model.
- Revoke device from web/phone.

Exit gate:

- User can pair a Mac from web/phone and see `This Mac online` only when the
  gateway is truly connected.

Current status:

- Partially complete. Pairing, connection truth, capability manifest display,
  and revocation are wired. The remaining launch gap is packaging: normal users
  still need a friendly companion installer instead of a repo checkout command.

### Phase 4: Gateway Channel Setup

Goal: personal channels work through the user's device.

Build/fix:

- WhatsApp Web QR/pairing state in Integrations.
- Telegram personal/bot bridge setup in Integrations.
- Channel linked account/status/reconnect state.
- Send test message action.
- Revoke/logout action.
- Personal channel lane stays separate from Studio/business connector lane.
- Outbound sends are idempotent and audited.

Exit gate:

- User understands which channels are local-device powered and can test/revoke
  them without reading logs.

Current status:

- The backend exposes WhatsApp and Telegram personal gateway status, setup, and
  outbound-message routes.
- The Gateway/Device page shows linked identity, QR/login hints, recent message
  counts, channel setup forms, and audited send-test controls.
- Manual setup/send actions emit security audit events without storing message
  bodies or Telegram secrets in audit metadata.
- Per-channel logout is not exposed until the companion supports real channel
  logout. Current reliable revoke path is device revocation, which immediately
  disables all local channel tools for that computer.

### Phase 5: Capability Truth And Chat Transparency

Goal: Sage never lies about what it can do.

Build/fix:

- "What can you do?" answers from backend tool/gateway/channel catalog.
- Gateway offline disables local tools/channels only.
- Inline transcript cells for:
  - Thinking.
  - Searching web.
  - Reading file.
  - Running shell.
  - Using browser.
  - Using WhatsApp.
  - Sending Telegram.
  - Waiting for approval.
  - Screenshot/artifact.
- Remove raw internal/provider/debug cards.
- Successful stream clears stale timeout/error banners.

Exit gate:

- User can see what Sage is doing and why something is unavailable.

Current status:

- `What can you do?`, capability questions, and tool inventory questions are
  answered from the active backend tool/gateway availability catalog.
- The reply explicitly distinguishes paired gateway tools from Sage Cloud
  Computer and states that provider choice does not change the tool surface.

### Phase 6: Local Device Demo Cert

Goal: prove the moat live.

Run:

- Phone -> Sage -> gateway -> list local files -> result in phone chat.
- Phone -> Sage -> gateway -> screenshot/browser action -> screenshot cell.
- Phone -> Sage -> gateway -> send Telegram -> audited result.
- Phone -> Sage -> gateway -> WhatsApp QR/status/send test.
- Gateway offline -> local tools/channels disabled, cloud chat still works.

Exit gate:

- "Sage can use my computer from my phone" is proven end-to-end.

Current status:

- Local live cert passed on 2026-05-02 against a fresh paired gateway:
  `gateway_809b6844-5c4c-44df-87ae-aba5e75aa2d8`.
- The gateway connected over outbound WSS, reported 32 capabilities, passed
  doctor checks for active registration, trusted device, live session, fresh
  heartbeat, resumable checkpoint, and no pending approvals.
- Supervisor-backed local actions passed through the gateway:
  `shell.execute` (`pwd`), `filesystem.read_write` (read `docs/`), and
  `screenshot.capture` (primary monitor metadata returned).
- Browser session start returned the correct local `attach_required` state for
  an existing-session attach without falling back to fake cloud execution.
- Risky desktop action approval was created for `computer_control.type`.
- Gateway offline was verified: local tool execution returned retryable `409`
  `Gateway is not currently connected`, while the cloud runtime stayed healthy.
- Reconnect was verified with the same state directory and gateway identity;
  events showed two `gateway.connect` and two `gateway.hello` records.
- WhatsApp and Telegram personal channels surfaced truthful not-linked states:
  WhatsApp `disconnected`; Telegram `authorization_required`. No outbound
  channel send is certified until a real linked account/recipient is provided.
- Remaining launch cert is a real physical-phone run against the public
  production environment with the gateway online.

### Phase 7: Studio Builder

Goal: business users can create a specialized agent without understanding
infrastructure.

Build/fix:

- Square templates:
  - Restaurant Orders.
  - Auto Parts Sales.
  - Real Estate Leads.
  - Support FAQ.
  - Appointment Booking.
  - Spreadsheet Catalog Bot.
  - Custom Agent.
- Setup sheet tabs:
  - Overview.
  - Knowledge.
  - Tools.
  - Channels.
  - Memory.
  - Safety.
  - Test.
  - Deploy.
- Keep backend payload stable.
- Keep personal channels separate from Studio connectors.

Exit gate:

- A normal business owner can create/test/deploy a specialist from a template.

Current status:

- Studio has square templates for the launch specialist jobs plus a Custom
  Agent path.
- Marketplace has six preview packages from the backend when no registered
  inventory exists: Restaurant Orders, Auto Parts Sales, Spreadsheet Catalog,
  Web Search, Image Generation, and DeepSeek Provider.
- Marketplace preview packages carry publisher, verification/review, health,
  billing hook, runtime truth, permission, and preview-only metadata.
- Developer publishing remains hidden behind the explicit
  `Show developer registration` action.
- Targeted Phase 7 e2e passed on 2026-05-02:
  `npm run test:e2e:deployed-agents --prefix frontend` with 3 tests passing.

### Phase 8: Marketplace And Mini-App Boundary

Goal: users understand create vs install.

Build/fix:

- Studio = create/manage private agents.
- Marketplace = install governed templates, tools, providers, mini-apps.
- Developer publishing hidden behind explicit developer mode.
- Seed marketplace preview packages.
- Package trust metadata:
  - publisher
  - permissions
  - pricing
  - runtime
  - tools used
  - data access
  - review status
- Mini-app manifests require permission metadata before rendering.

Exit gate:

- Normal users are not confused by developer/admin publishing surfaces.

### Phase 9: History, Memory, Storage

Goal: cross-device continuity without unlimited storage risk.

Build/fix:

- Cloud-canonical chat history.
- Local/phone/companion caches are encrypted caches only.
- History visible across web and phone.
- Memory classes:
  - Safe.
  - Sensitive.
  - Private.
  - Critical.
- Markdown remains import/export format, not runtime truth.
- Retention, export, delete, workspace wipe, artifact TTL, and storage caps.
- Tool/action audit log is separate from assistant transcript.

Exit gate:

- User can trust history/memory and storage cannot grow unbounded.

Current status:

- Memory runtime is structured into Safe, Sensitive, Private, and Critical
  classes with legacy category aliases normalized into those classes.
- Workspace memory is capped at 50 entries and Critical memory is withheld from
  default model context unless explicitly requested by trusted server code.
- `/api/sage-memory/storage-policy` exposes the cloud-canonical authority,
  structured runtime format, encrypted-cache-only local policy, entry cap,
  remaining capacity, category counts, and export/delete/wipe capabilities.
- `/api/sage-memory/export` returns structured JSON plus Markdown for user
  export/import workflows. The export route requires member access and audits
  counts only, not memory content.
- `/api/sage-memory/wipe` requires owner access and the confirmation phrase
  `WIPE SAGE MEMORY`, then clears workspace memory and audits the deleted
  count.
- The Memory page shows cloud-canonical storage authority, used/available
  memory capacity, export, and wipe controls so this is visible on web/phone,
  not API-only.
- Targeted memory governance tests passed on 2026-05-02.

### Phase 10: Security And Abuse Cert

Goal: powerful automation is trustworthy.

Build/fix:

- Audit event for every local/channel/tool action.
- Risky actions require approval.
- Gateway tokens revocable.
- Secrets never hit frontend logs.
- Tool outputs redact obvious secrets.
- Dangerous shell guarded.
- File write/delete guarded.
- External send guarded.
- Rate limits and tenant isolation tests.
- Marketplace tools require permission manifests.

Exit gate:

- Local-device automation is powerful but not scary.

Current status:

- Gateway revocation, local approval creation, gateway offline disabling, and
  local tool execution audit paths are launch-certified for the paired Mac demo.
- Personal channel setup/send-test routes emit security audit events without
  storing message bodies or Telegram secrets in audit metadata.
- Security audit metadata is now sanitized centrally before emission. Sensitive
  keys and obvious secret strings are redacted recursively, including provider
  keys, bearer headers, gateway pairing tokens, GitHub/OpenAI/Google/Slack-style
  secrets, cookies, and credential fields.
- Targeted security redaction tests passed on 2026-05-02.
- Still not complete for paid beta: full abuse/rate-limit cert, tenant-isolation
  suite, external pentest, and marketplace package-review operations.

### Phase 11: Cloud Computer Later

Goal: paid hosted runtime when the user's device is offline.

Defer until launch path is stable.

Start with:

- Cloud browser.
- Ephemeral Linux sandbox.
- TTL cleanup.
- Spend meter.
- Artifacts/screenshots.
- Audit timeline.

Do not start with:

- full streamed desktop
- unlimited background compute
- local Full Access semantics

Exit gate:

- User can pay for Sage to run web/code/file tasks without their laptop.

### Phase 12: Final Launch Cert

Run:

- Frontend typecheck.
- Frontend build.
- Python compile.
- Production auth/signup/login.
- Production hosted-credit chat.
- 10-message Sage smoke.
- Phone browser smoke.
- Gateway offline/online smoke.
- Local file/shell smoke.
- Telegram/WhatsApp setup smoke if demoed.
- Studio/Marketplace visual sweep.

Exit gate:

- No raw errors.
- No disappearing messages.
- No blank dead screens.
- No uncontrolled provider spend.
- No false local-tool availability.

## Investor/Developer Explanation

Empyralis is not "another chatbot". The defensible wedge is:

1. Cloud brain makes the agent available everywhere.
2. Local gateway gives the agent real user-owned device power.
3. Phone/web control surface makes the power accessible to normal people.
4. Hosted credits remove API-key friction.
5. Studio turns the same infrastructure into B2B specialists.
6. Marketplace turns templates/tools/mini-apps into distribution.

The gateway is the bridge between consumer convenience and real-world
capability. The cloud brain is the business. The local companion is the
execution edge.

## Immediate Next Sprint

If there are only 5-7 hours before launch, do this and nothing else:

1. Production/phone reliability cert.
2. Hosted credits and quota visibility cert.
3. `Connect this computer` UX in Integrations.
4. Capability truth response for "what can you do?"
5. Chat transparency cells for gateway/cloud tools.
6. Gateway local file/shell live demo.
7. Studio/Marketplace visual sanity check.

Everything else moves after the public demo.
