# Billing And Credits Domain

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: billing, entitlements, hosted AI usage, and provider code

Use this folder for hosted AI credits, BYOK vs platform keys, usage ledgers,
entitlements, quota enforcement, and secret separation.

Current source files:

- `server_modules/direct_chat_hosted_usage_service.py`
- `server_modules/billing_service.py`
- `server_modules/entitlements_service.py`
- `server_modules/control_plane_repository.py`
- `server_modules/provider_profiles.py`
- `server_modules/direct_chat_provider_service.py`
- `server_modules/secrets_broker.py`

## Files

- `hosted-ai-credits.md`
- `byok-vs-platform-keys.md`
- `usage-ledger.md`
- `security.md`
- `tests.md`
- `FILL_PROMPT.md`

## Existing Docs To Reconcile

- `docs/ai-credit-model-strategy.md`
- `docs/domains/studio/ai-provider-credits-strategy-2026-05-16.md`
- `docs/operations/hosted-provider-secret-governance.md`
