# Hosted AI Credits

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: hosted usage, billing, and entitlement services

## Hosted AI Credit Flow

Hosted AI credit accounting happens in
`server_modules/direct_chat_hosted_usage_service.py` when provider availability
has `credential_plane=platform_runtime`.

The service requires:

- platform runtime allowed
- non-empty usage payload
- workspace id
- request id
- tenant id
- usage precise enough for platform-paid accounting

It builds a usage snapshot, normalizes it through
`usage_accounting_service.usage_row_from_snapshot(...)`, rejects unknown or
insufficient pricing, writes a workspace hosted AI monthly cost ledger entry,
writes a unified credit ledger event, then calls
`billing_service.debit_workspace_credit_balance_for_hosted_usage(...)`.

Credit debit happens after ledger persistence. Failure to write the cost ledger,
write the unified ledger, or debit credit raises runtime errors.

## Entitlement Fields

`server_modules/entitlements_service.py` exposes hosted Sage AI state including
policy, monthly cap USD, monthly cost USD, monthly remaining USD, credit balance,
total available credits, and reason. Chat tiers expose light/pro/max monthly
credit caps.

## Refunds

Not implemented in inspected code: no automatic refund path was verified in
this pass.
