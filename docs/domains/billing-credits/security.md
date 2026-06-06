# Billing And Credits Security

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: billing, entitlement, provider, and hosted usage services

## Security Controls

- Workspace isolation: hosted usage requires workspace id and tenant id before
  credit accounting.
- Platform runtime gate: hosted usage accounting requires
  `credential_plane=platform_runtime` and `platform_runtime_allowed=true`.
- BYOK separation: workspace provider profiles are classified separately from
  platform hosted runtime credentials.
- Platform secret resolution: hosted provider secrets resolve through
  `secrets_broker` and emit hosted provider secret audit rows.
- Credit ledger durability: hosted usage writes both cost ledger and unified
  credit ledger events before debiting workspace credit balance.
- Pricing safety: platform-paid accounting rejects usage that cannot be priced
  exactly enough.
- Entitlement enforcement: hosted AI can be denied for disabled policy, owner
  approval required, or cap reached.

## Gaps

Migration debt: docs should add a frontend response contract listing every
provider/credit field allowed to leave the backend.

Migration debt: rate limits for credit-draining chat calls should be documented
with the direct chat endpoint that triggers hosted usage.
