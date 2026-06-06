# Usage Ledger

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: billing service and control plane repository

## Ledger Tables And Events

Hosted AI usage writes to
`workspace_hosted_ai_monthly_cost_ledger` through
`control_plane_repository.record_workspace_hosted_ai_monthly_cost_ledger_entry`.
The repository uses an idempotency key based on request id and hosted AI cost.

The same hosted usage flow also writes a unified credit ledger event through
`control_plane_repository.record_credit_ledger_event(...)`, with source table
`workspace_hosted_ai_monthly_cost_ledger` and source event id from the cost
ledger entry or request id.

Stored metadata includes workspace id, tenant id, request id, thread id,
source surface, provider, model, token counts, estimated cost USD, completed
timestamp, credential plane, billing source, public tier, credit quantity,
credit unit, credit multiplier, and the unified credit ledger event payload.

## Read Paths

`server_modules/billing_service.py` reads hosted AI monthly cost ledger entries
for billing and history summaries. Billing history sources include credit ledger
events, workspace hosted AI cost ledger entries, and activity ledger events.
