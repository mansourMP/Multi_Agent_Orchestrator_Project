# Personal Channels

Status: Active
Owner: Platform
Last verified: 2026-06-07
Source of truth: personal channel service and routes

## Supported Providers

Implemented personal channel keys in
`server_modules/channel_lane_contract_service.py`:

- `telegram_personal`: provider `telegram_gramjs`, runtime lane
  `personal_gateway`, live capable.
- `whatsapp_personal`: provider `whatsapp_baileys`, runtime lane
  `personal_gateway`, live capable.
- `signal_personal`: provider `signal_local_bridge`, runtime lane
  `personal_gateway`, planned until the local bridge runtime is certified.
- `imessage_personal`: provider `bluebubbles_local_bridge`, runtime lane
  `personal_gateway`, planned private Mac bridge. This is not official Apple
  Messages for Business.
- `wechat_personal`: provider `wechat_local_bridge`, runtime lane
  `personal_gateway`, planned until the local bridge runtime is certified.

All require Agent Computer and are `surface_support: ["sage"]` in the platform
catalog. They are not launch-allowed Studio bindings. Only Telegram and
WhatsApp are currently launch-live personal lanes. Signal, iMessage, and WeChat
remain private bridge contracts until certified.

Official Apple Messages for Business is a separate business-channel lane:
`apple_messages_business`. It uses a cloud/MSP adapter and must satisfy Apple
review requirements such as AI disclosure and human handoff. It must not be
presented as personal iMessage support.

## Pairing And State

Personal setup/status routes are gateway-scoped under
`/personal-channels/.../gateways/{gateway_id}`. The route first asserts the
path is a personal route, then requires an accessible gateway registration in
the authenticated workspace. If the gateway registration has an owner user id,
the current user id must match it; otherwise only owner/admin can use ownerless
registrations. Source: `server_modules/routes_personal_channels.py`.

Agent Computer pairing itself uses gateway pairing intents and registration,
not the channel identity pairing code path. Gateway pairing is handled by
`server_modules/gateway_pairing_service.py`, `server_modules/gateway_state_repository.py`,
and `/gateway/pairings/...` routes in `server_modules/routes_gateway.py`.

There is also a separate channel identity pairing service for Telegram/WhatsApp
bot-style links. `frontend/lib/workspace/workspace-channel-pairing-surface.tsx`
creates/list/revokes pairing intents through `/api/channel-pairing/...`, while
`server_modules/channel_pairing_service.py` issues one-time pairing codes,
hashes stored codes, consumes them from inbound connector messages, and records
security audit events. This service is for external channel identity links; it
is not the personal Agent Computer session store.

WhatsApp setup accepts `phone_number` and `custom_pairing_code`. Telegram setup
accepts `api_id`, `api_hash`, `phone_number`, `login_code`, and `password`.
Setup dispatch is sent to the gateway only after a Rust
`gateway-service-decision` returns `dispatch_gateway_operation`. Source:
`server_modules/personal_channels_service.py`.

Gateway state sync stores WhatsApp and Telegram state in SQLite tables keyed by
`gateway_id` and `channel_key`, including tenant, workspace, user, provider,
status, linked identity fields, and metadata. Source:
`server_modules/personal_channels_repository.py`.

## Inbound Event Format

Personal inbound dispatch requires `channel_key` and matching `provider`; the
gateway must advertise the channel in its capabilities, manifests, or health.
Handlers require message fields `external_message_id`, `remote_jid`, and
`text`. `from_me` messages are ignored. Sources:
`server_modules/personal_channels_service.py` and
`server_modules/channel_lane_contract_service.py`.

The inbound message is recorded with a uniqueness constraint on
`gateway_id`, `channel_key`, and `external_message_id`; duplicate events reuse
the existing record. Source: `server_modules/personal_channels_repository.py`.

## Reply Path

Inbound text is guarded and routed to Sage through
`server_modules/personal_channel_sage_bridge_service.py`. The bridge disables
direct runtime tools for personal-channel replies and sends channel context into
the unified Sage turn adapter. A non-empty Sage reply creates or reuses an
outbound message with an idempotency key.

Automatic replies are marked pending and require owner approval before dispatch.
Approved or manual sends dispatch through `gateway_protocol_service.dispatch_channel_outbound()`
after Rust gateway service decision checks. Sources:
`server_modules/personal_channels_service.py` and
`server_modules/routes_personal_channels.py`.

## Messaging Thread Commands

Personal messaging lanes map into canonical Sage threads. The command contract
is defined in `server_modules/personal_channel_thread_command_service.py` and
documented in `docs/domains/channels/messaging-thread-contract.md`.

Supported commands are `/new [title]`, `/threads`, `/use <thread-id>`,
`/status`, and `/help`. They are parsed as control-plane requests, not as
external-write shortcuts. Parsed thread commands set `dispatch_allowed: false`
and require owner context, so they do not bypass the pending-approval outbound
model.

## Unsupported Media

Not implemented in the inspected code: attachment, voice, image, or file
payload normalization into Sage. Personal inbound handlers require text and do
not pass media payloads into Sage. Gateway manifest `media` is projected for
status only by `get_gateway_personal_channel_surfaces()`.
