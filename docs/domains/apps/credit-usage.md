# App Credit Usage

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: app, billing, and hosted AI usage services

## Current Usage Path

Apps can invoke Sage or specialist agents through app bridge routes. When a
bridge request includes `request_text`, the backend executes an agent turn with
metadata containing:

- `source` such as `apps.bridge.captain` or `apps.bridge.specialist`
- `app_id`
- `app_bridge`
- `app_context_envelope`

Credit usage for the actual AI turn is handled by the direct chat/agent runtime
usage pipeline, not by app registry install itself.

Hosted AI accounting is implemented in
`server_modules/direct_chat_hosted_usage_service.py` and
`server_modules/billing_service.py`; see `docs/domains/billing-credits/`.

## Gaps

Migration debt: this pass did not find a dedicated app-level credit meter that
charges simply for opening/installing apps. App-triggered AI work should be
traced by agent turn metadata and the hosted AI ledger.
