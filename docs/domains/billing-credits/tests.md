# Billing And Credits Tests

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: billing and provider test files

## Current Tests

- `server_modules/tests/test_direct_chat_hosted_usage_service.py`: hosted usage
  accounting, transparency ledger for non-platform usage, missing usage/scope
  failures, cost ledger persistence, unified ledger persistence, and credit
  debit.
- `server_modules/tests/test_billing_service.py`: billing summaries, credit
  balances, hosted AI history, and ledger-derived behavior.
- `server_modules/tests/test_entitlements_service.py`: plan capabilities,
  hosted AI access state, chat tier caps, hosted runtime access, and entitlement
  payloads.
- `server_modules/tests/test_provider_profiles.py`: provider catalog,
  credential resolution, hosted secret resolution, and provider metadata.
- `server_modules/tests/test_direct_chat_provider_service.py`: credential-plane
  truth, platform runtime allowance, provider availability, setup actions, and
  provider unavailable responses.

Focused command:

```bash
python -m pytest \
  server_modules/tests/test_direct_chat_hosted_usage_service.py \
  server_modules/tests/test_billing_service.py \
  server_modules/tests/test_entitlements_service.py \
  server_modules/tests/test_provider_profiles.py \
  server_modules/tests/test_direct_chat_provider_service.py
```

## Missing Coverage To Keep Visible

- complete frontend redaction contract for provider/credit payloads
- credit-drain rate-limit behavior at the direct chat endpoint
- refund/adjustment workflow, if the product needs one
