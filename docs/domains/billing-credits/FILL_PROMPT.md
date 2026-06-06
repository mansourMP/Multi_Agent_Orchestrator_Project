# Fill Prompt: Billing And Credits Docs

Status: Active prompt
Owner: Platform
Last verified: 2026-06-06

Read:

- `server_modules/direct_chat_hosted_usage_service.py`
- `server_modules/billing_service.py`
- `server_modules/entitlements_service.py`
- `server_modules/control_plane_repository.py`
- `server_modules/provider_profiles.py`
- `server_modules/direct_chat_provider_service.py`
- `server_modules/tests/test_direct_chat_hosted_usage_service.py`
- `server_modules/tests/test_billing_service.py`
- `server_modules/tests/test_entitlements_service.py`
- `server_modules/tests/test_provider_profiles.py`
- `server_modules/tests/test_direct_chat_provider_service.py`
- `docs/ai-credit-model-strategy.md`
- `docs/domains/studio/ai-provider-credits-strategy-2026-05-16.md`
- `docs/operations/hosted-provider-secret-governance.md`

Fill Billing and Credits docs with code-backed facts only.

Required output:

- Explain hosted AI credit accounting.
- Explain BYOK vs platform-provider secret boundaries.
- Explain entitlements and plan checks.
- Explain usage ledger writes.
- Explain what data can appear in frontend responses.
- Document tests and missing tests.

Do not put pricing decisions here unless they are already enforced in code.
