# Channels Domain

Status: Active
Owner: Platform
Last verified: 2026-06-10
Source of truth: channel router, personal channel services, channel docs

Use this folder for messaging channels that bring outside messages into the
platform and send replies back out.

## Current Implementation Summary

There are two enforced channel lanes:

- Personal-to-Sage channels run through Agent Computer/gateway state and are
  scoped to the paired user's personal session.
- Business-to-Studio channels run through cloud connectors, channel accounts,
  deployed-agent bindings, and the deployed-agent channel router.

The lane split is enforced in
`server_modules/channel_lane_contract_service.py`,
`server_modules/routes_personal_channels.py`,
`server_modules/personal_channels_service.py`,
`server_modules/channel_platform_service.py`, and
`server_modules/agent_channel_router.py`.

Channel setup is platform-owned. Telegram and WhatsApp message surfaces must
not become setup consoles. If an unlinked user messages a Telegram/WhatsApp
bot or channel, the runtime replies with an Empyralis `/continue` connect link;
account creation, sign-in, relinking, and provider credentials stay inside the
Empyralis web/native control plane.

## Code Catalog

`server_modules/channel_lane_contract_service.py` currently defines these
platform channel keys:

- Studio/business messaging: `web_chat`, `telegram_bot`, `discord_bot`,
  `slack`, `whatsapp_business`, `apple_messages_business`, `teams`, `matrix`.
- Email and work-system connectors: `google_workspace`, `gmail`, `smtp_imap`,
  `microsoft_365`, `github`, `linear`, `notion`, `dropbox`, `s3`, `smtp`,
  `wechat_work`, `instagram_business`.
- Sage personal Agent Computer channels: `telegram_personal`,
  `whatsapp_personal`, `signal_personal`, `imessage_personal`,
  `wechat_personal`.
- Reserved private runtime items, not user-facing channel bindings:
  `voice_wake`, `mobile_nodes`, `plugin_marketplace`.

`web_chat`, generic `email`, `smtp_imap` as a channel-platform record,
`whatsapp_business`, `apple_messages_business`, `teams`, and `matrix` are
present in the catalog but not launch-ready in the inspected code because their
`launch_allowed`, `runtime_usable`, or `live_capable` flags are false. `smtp`
as a work-app connector is separate and launchable when configured.

The canonical connection catalog also exposes readiness proof fields:
`readiness_status`, `certification_required`, and
`certification_requirements`. Channel work should use
`GET /api/connections/{connection_id}/doctor` and
`POST /api/connections/{connection_id}/certify` before changing user-facing
copy from planned to launch-ready.

## Files

- `personal-channels.md`
- `messaging-thread-contract.md`
- `business-channels.md`
- `routing.md`
- `security.md`
- `tests.md`
- `FILL_PROMPT.md`

## Existing Docs To Reconcile

- `docs/domains/channels/personal-vs-studio-channel-model.md`
- `docs/domains/channels/foundation-strategy.md`
- `docs/reports/web-chat-channel-audit.md`
