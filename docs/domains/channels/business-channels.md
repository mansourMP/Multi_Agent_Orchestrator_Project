# Business Channels

Status: Active
Owner: Platform
Last verified: 2026-06-07
Source of truth: deployed agent channel and channel platform services

## Studio Channel Catalog

`server_modules/channel_lane_contract_service.py` and
`server_modules/channel_platform_service.py` define the business/Studio catalog.
Launch-capable business messaging channels in the inspected catalog include:

- `telegram_bot` / binding `telegram`: Telegram Bot API, live capable,
  launch allowed.
- `discord_bot` / binding `discord`: Discord Bot, live capable, launch allowed.
- `slack`: Slack App, live capable, launch allowed.

Launch-capable connected-app style channels include `github`, `linear`,
`notion`, `dropbox`, `s3`, `smtp`, `wechat_work`, and `instagram_business`.
They are categorized as work systems or connected apps, not necessarily
customer chat surfaces.

Partial or roadmap business channels in the inspected catalog include
`web_chat`, `gmail`, `smtp_imap`, `whatsapp_business`, `microsoft_365`, `teams`,
`matrix`, and `apple_messages_business`, depending on `live_capable` and
`launch_allowed` flags. Web Chat is explicitly not launch-ready in
`docs/reports/web-chat-channel-audit.md`.

## Apple Messages For Business

`apple_messages_business` is the official Apple Messages lane. It is a planned
business channel, not a personal iMessage API and not an Agent Computer bridge.
It is modeled as a cloud/MSP business messaging adapter with:

- user-initiated conversations
- mandatory AI disclosure
- mandatory human handoff
- MSP-backed inbound/outbound transport
- proof-log fields for transcript, approvals, handoff state, and outbound
  message ids

The adapter contract lives in
`server_modules/business_messaging_channel_adapter_service.py`. The connection
catalog keeps setup disabled until Apple Business identity, MSP credentials,
privacy/support review materials, and launch testing are complete.

## Channel Accounts And Bindings

Studio channel accounts are projected from vault connectors as
`vault:{credential_id}` account refs with `vault://credential/{id}` secret refs;
raw secrets are redacted from account projections. Source:
`server_modules/channel_platform_service.py`.

`upsert_agent_channel_binding()` loads a deployed agent in the authenticated
tenant/workspace, validates the selected catalog item and account provider,
then persists a per-agent endpoint key such as `agent:{deployed_agent_id}:telegram`
into the deployed agent's `channels` field. It also saves specialist channel
bindings when a backing install exists and emits a security audit event. Source:
`server_modules/channel_platform_service.py`.

Studio cannot bind personal Agent Computer channels. The platform service
rejects personal runtime lane items and rejects accounts whose runtime lane is
`personal_gateway`. Source: `server_modules/channel_platform_service.py`.

## Routing

Inbound business messages route to deployed Studio agents through
`server_modules/agent_channel_router.py`. The router resolves a public channel
owner, enforces the Rust deployed-agent public-route gate, records inbound
events, checks duplicates, pause/incident state, daily quota, applies memory and
business plan overlays, executes the canonical channel turn, records outbound
events, persists memory snapshots, and records channel activity.

## Test Sends

`test_agent_channel_binding()` is dry-run only. Live test sends from Studio are
blocked by a `ChannelPlatformError`. Source:
`server_modules/channel_platform_service.py`.

Not implemented in the inspected code: a live Studio Web Chat widget launch
flow; durable Email ingress marked launch-ready; WhatsApp Business launch-ready
binding; Apple Messages for Business dispatch through a real MSP account.
