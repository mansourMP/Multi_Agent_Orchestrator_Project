# Channels Domain

Status: Active
Owner: Platform
Last verified: 2026-06-06
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

## Code Catalog

`server_modules/channel_lane_contract_service.py` currently defines these
platform channel keys:

- Studio/business messaging: `web_chat`, `telegram_bot`, `discord_bot`,
  `slack`, `whatsapp_business`, `teams`, `matrix`.
- Email and work-system connectors: `gmail`, `smtp_imap`, `microsoft_365`,
  `github`, `linear`, `notion`, `dropbox`, `s3`, `smtp`, `wechat_work`,
  `instagram_business`.
- Sage personal Agent Computer channels: `telegram_personal`,
  `whatsapp_personal`, `signal_personal`, `imessage_personal`,
  `wechat_personal`.
- Reserved private runtime items, not user-facing channel bindings:
  `voice_wake`, `mobile_nodes`, `plugin_marketplace`.

`web_chat`, `whatsapp_business`, `teams`, and `matrix` are present in the
catalog but not launch-ready in the inspected code because their
`launch_allowed`/`live_capable` flags are false.

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
