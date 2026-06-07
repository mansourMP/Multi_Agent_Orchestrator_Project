# Empyralis Channel Foundation Strategy

## Status

Implementation started. The cloud catalog, Agent Computer personal-channel
runtime contract, generic personal-channel surface projection, and local-bridge
adapter contract now exist. Telegram personal and WhatsApp personal are the
current launch-live Sage personal channels. Signal, iMessage, and WeChat are
planned/private bridge contracts until their local runtimes are certified
end-to-end.

## Core Rule

Personal/private channels belong to Sage through Agent Computer.
Business/customer channels belong to Studio Agents through official cloud connectors.
Connected Apps are work systems, not chat surfaces. Extension/plugin packages may
provide channels, apps, tools, runtime capabilities, or safe external sections,
but those surfaces remain separate in UI and permissions.

## Main Agent / Sage Channels

- Live: Telegram personal and WhatsApp personal through the selected Agent Computer
- Live when configured: Slack and Discord bot channels when connected as business/team channels
- Partial: Email as an inbound channel; use Google Workspace or SMTP app actions for mailbox work until durable channel ingress is complete
- Planned/private: Signal, iMessage, and WeChat through Agent Computer local bridges
- Planned official business lane: Apple Messages for Business through an approved MSP/human-handoff adapter
- Planned: Web Chat, WhatsApp Business, Webhook, Teams, Matrix, Zalo, voice

## Signal Agent Computer Bridge

Signal remains a planned Agent Computer bridge until the signal-cli wrapper is
certified with a real account, durable inbound replay, outbound approval, and
health reporting. The intended local bridge shape is:

- `GET /health`
- `POST /messages`
- `GET /events?channel_key=signal_personal`

Run signal-cli in daemon HTTP mode first, then start:

```bash
cd empyralis-gateway
EMPYRALIS_SIGNAL_CLI_RPC_URL=http://127.0.0.1:8080 \
EMPYRALIS_SIGNAL_CLI_ACCOUNT=+15551234567 \
npm run signal:bridge
```

Then point the gateway at the bridge URL printed by the process:

```bash
export EMPYRALIS_SIGNAL_BRIDGE_URL=http://127.0.0.1:8901
```

This is the intended platform-owned bridge boundary without making Signal a
Studio business/customer channel. It remains Sage-only and Agent Computer-only.

## Agent Computer Doctor

The gateway doctor treats personal messaging as a first-class Agent Computer
readiness surface. It should aggregate Telegram and WhatsApp as live personal
lanes, while Signal, iMessage, and WeChat remain planned/private bridge
readiness items until their runtimes are certified.

This is the OpenClaw-style direction we should copy: every local channel or node
reports a manifest, health snapshot, issues, and connected state. The platform
shows those facts and can block unsafe work, but it does not pretend those
personal bridges are cloud customer channels.

## Studio Agent Channels

- Live when configured: Telegram Bot API, Discord Bot, Slack app
- Live when configured as connected apps: GitHub, Notion, Linear, Dropbox, Amazon S3, SMTP / IMAP, WeChat Work, Instagram Business
- Partial: Email as a durable inbound channel, Microsoft 365
- Planned: Web Chat, WhatsApp Business / Twilio, Webhook, Teams, Matrix, Feishu/Lark, Zalo OA

## Channel Priority

### Build now

1. Canonical catalog/UI alignment for live connected apps and channels
2. Durable Email channel ingress with mailbox journaling and idempotency
3. Web Chat widget/runtime proof before marking it launch-ready
4. WhatsApp Business provider path before marking it launch-ready

### Build next

1. Microsoft 365 OAuth/mail/calendar/file proof
2. Webhook channel with signed ingress and outbox delivery
3. Matrix and Teams

### Research only

1. Feishu/Lark
2. Zalo OA
3. Voice / Twilio

### Avoid for production

1. WeChat personal as a cloud/customer channel
2. Zalo personal as a cloud/customer channel
3. Signal automation outside Agent Computer
4. iMessage / BlueBubbles outside a user-owned Mac runtime
5. Baileys for public Studio production

## Existing Personal Channels

Keep Telegram personal and WhatsApp Baileys personal for Sage-only closed/local pilot use.
Do not expose them as production Studio Agent channels.
Label them as personal Agent Computer channels.

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
The generic `/personal-channels/gateways/{gateway_id}/channels` projection
reports personal-channel manifests from Agent Computer. Telegram and WhatsApp
have native local runtimes. Signal, iMessage, and WeChat must stay planned until
bridge-specific runtime certification proves inbound durability, outbound
approval, health reporting, and account lifecycle.

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

- `PersonalChannelRuntime` interface — formal runtime boundary
- `PersonalChannelCapabilityManifest` — typed capability declarations per channel
- `PersonalChannelHealthSnapshot` — standardized health shape
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

1. **Phase 1** — Keep the canonical connection catalog, Studio channel catalog, and UI cards aligned.
2. **Phase 2** — Finish durable Email channel ingress. Google Workspace/SMTP app actions are not enough to call Email a live channel.
3. **Phase 3** — Web Chat widget/runtime proof.
4. **Phase 4** — WhatsApp Business / Twilio provider proof.
5. **Phase 5** — Microsoft 365 OAuth/mail/calendar/file proof.
6. **Phase 6** — Webhook, Matrix, Teams, and regional channels if needed.

## Agent Studio Implications

Agent Studio needs these per-channel UI elements:

- Channel selector — Telegram Bot, Slack, Discord, Email, Web Chat, WhatsApp Business, Webhook
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

Do not add more channels by hardcoding UI cards only. First update the
canonical connection catalog and platform lane contract, then expose the same
truth in the UI.

Keep private/personal channels isolated to Sage through Gateway.
Business/customer channels belong to Studio Agents through official cloud APIs.
