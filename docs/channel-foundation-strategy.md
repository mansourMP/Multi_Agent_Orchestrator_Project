# Empyralis Channel Foundation Strategy

## Status

Documentation-only strategy. No implementation in this commit.

## Core Rule

Personal/private channels belong to Sage through Gateway.
Business/customer channels belong to Studio Agents through official cloud connectors.

## Main Agent / Sage Channels

- Web Chat
- Telegram personal via Gateway
- WhatsApp personal via Gateway
- Email
- Later: Slack, Discord, Matrix
- Experimental/deferred: Signal, iMessage, WeChat, Zalo, voice

## Studio Agent Channels

- Web Chat
- Email
- Telegram Bot API
- Discord Bot
- Slack app
- WhatsApp Cloud API / Twilio
- Later: Matrix, Feishu/Lark, WeChat Work, Zalo OA

## Channel Priority

### Build now

1. Channel foundation (shared runtime, reconnect, typing, drafts, outbound store, credential redaction)
2. Web Chat
3. Telegram Bot API
4. Email
5. Discord Bot only after foundation

### Build next

1. Slack
2. WhatsApp Cloud API
3. Matrix

### Research only

1. Feishu/Lark
2. WeChat Work
3. Zalo OA
4. Voice / Twilio

### Avoid for production

1. WeChat personal
2. Zalo personal
3. Signal automation
4. iMessage / BlueBubbles production
5. Baileys for public Studio production

## Existing Personal Channels

Keep Telegram personal and WhatsApp Baileys personal for Sage-only closed/local pilot use.
Do not expose them as production Studio Agent channels.
Label them as Personal Gateway channels.

Telegram MTProto and WhatsApp Baileys are reverse-engineered protocols with TOS risk.
They are acceptable for a closed pilot with a single owner/operator but must not be
offered to external Studio Agent customers. Migrate WhatsApp to Cloud API before
any Studio-facing launch.

## Current Duplication Problem

Telegram and WhatsApp personal runtimes share an interface (`PersonalChannelRuntime`)
and a generic dispatch layer but duplicate ~2,000 lines of code across:

- Reconnect/backoff logic (identical delay math, policy constants)
- Typing indicators (identical interval/TTL/start/stop)
- Draft management (60 lines of byte-for-byte identical logic)
- Credential redaction (identical recursive walker, only key lists differ)
- Outbound store (identical beginSend/markDelivered/list/get pattern)
- State publishing (identical guard/publish/catch)
- sendFinalOutbound skeleton (identical flow across 55 lines)
- Session persistence (identical load/save template)

On the Python cloud side, `personal_channels_service.py` has structurally identical
handlers for WhatsApp and Telegram (~80 lines each, duplicated across 5 function pairs).
Health checks and state repository tables are also per-channel hardcoded.

Adding a third channel today requires touching ~11 files and writing ~300 lines of
near-duplicate code.

## OpenClaw Patterns Worth Copying

- Adapter composition — channels provide only the adapters they need
- Dock pattern — lightweight metadata bridge decoupled from heavy runtime imports
- Channel manager with backoff — exponential backoff, manual stop tracking, auto-restart caps
- Tiered routing — deterministic priority: peer, guild, team, account, channel, default
- Session key design — agent:channel:peer:thread with configurable DM scoping
- Allowlist merging — multi-source allowlist with wildcard, normalize per channel
- Status adapter — probe, audit, snapshot, issues pipeline per channel
- Gateway lifecycle contract — startAccount/stopAccount with AbortSignal and setStatus/getStatus
- Per-channel capability manifest — chatTypes, polls, reactions, media, nativeCommands, threads
- Channel health probes — per-channel/per-account running/connected/reconnectAttempts/lastError

## OpenClaw Patterns to Avoid Now

- 37-plugin marketplace — hardcode 4-6 channels for pilot
- npm plugin discovery — register channels at build time
- Local gateway HTTP/WS server — conflicts with Empyralis cloud-control architecture
- Native mobile apps — massive scope, not needed for pilot
- Voice/realtime audio — highest complexity, lowest RoI
- ACP replacement — Empyralis already has a working v1alpha2 protocol
- Self-hosted plugin registry — not needed until channel count exceeds 10

## Foundation Needed Before Adding More Channels

### TypeScript (local gateway)

- `ChannelRuntime` interface — formal `implements` enforcement
- `ChannelCapabilityManifest` — typed capability declarations per channel
- `ChannelHealthSnapshot` — standardized health shape
- `ChannelEventPublisher` — typed event bus
- `ChannelRedactor` — shared credential redaction with channel-specific key lists
- `ChannelDedupeStore` — generic outbound store parameterized by record type
- `ChannelBackoffManager` — shared reconnect policy and delay math
- `ChannelQuotaAdapter` — per-channel quota hook
- `ChannelApprovalAdapter` — per-channel outbound approval hook

### Python (cloud control plane)

- `CanonicalChannelEvent` — typed dataclass for all channel events
- `ChannelSafetyContext` — kill switch, quota, approval status per event
- `ChannelHealthPayload` — standardized health reporting
- `ChannelCapabilityContract` — per-channel spec from `PERSONAL_CHANNEL_SPECS`
- `PersonalChannelHandlerRegistry` — replaces hardcoded if/elif chains
- Per-channel quota profile and audit event format

## Required Safety Gates For Every Channel

- workspace scoping
- trace_id propagation
- inbound dedupe
- outbound idempotency key
- secret redaction
- attachment limits
- message length limits
- rate limits
- kill switch enforcement
- approval hook for outbound
- health reporting
- reconnect/backoff
- audit events

## Recommended Implementation Order

1. **Phase 1** — Channel foundation only, no new external channel. Extract shared modules.
2. **Phase 2** — Web Chat. Zero TOS risk, full control, primary pilot UI.
3. **Phase 3** — Telegram Bot API. Official sanctioned API, Grammy SDK.
4. **Phase 4** — Email. SendGrid/SES for transactional, IMAP for inbound.
5. **Phase 5** — Discord Bot. Lowest-barrier third-party bot API.
6. **Phase 6** — Slack and WhatsApp Cloud API. Enterprise channels.
7. **Phase 7** — Matrix and regional channels if needed.

## Agent Studio Implications

Agent Studio needs these per-channel UI elements:

- Channel selector — Web Chat, Email, Telegram Bot, Discord Bot, WhatsApp Cloud, Slack
- Channel type badge — Personal Gateway / Business Cloud / Webhook / Email
- Runtime compatibility indicator — Cloud-only / Local gateway required / Self-hosted
- Per-channel approval policy — auto-approve / require approval / require owner
- Per-channel memory policy — shared memory / isolated memory / no memory
- Launch checklist — token configured, webhook URL set, health check passed
- Test message simulator — send test message button with response display
- Health state — green (connected), yellow (degraded), red (offline)
- Rate-limit gauge — messages remaining this window
- Audit log — per-channel activity feed with trace_id links

## Final Recommendation

Do not add more channels directly. First extract the shared channel foundation.
Then build Web Chat. Then Telegram Bot API.

Keep private/personal channels isolated to Sage through Gateway.
Business/customer channels belong to Studio Agents through official cloud APIs.
