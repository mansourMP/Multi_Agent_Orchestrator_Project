# Data And Secret Boundaries

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: provider, secrets, app bridge, channel, and billing code

## Secret Ownership Lanes

- Customer BYOK: workspace-owned provider credentials and connector credentials.
- Platform hosted: Empyralis-owned provider credentials used by hosted runtime.
- Local machine: local CLI/session credentials and personal-channel session
  files on customer hardware.
- App scoped: app-owned history, workflow state, explicit imports, scoped
  documents, and shared artifacts allowed by bridge contract.

## Platform Hosted Provider Secrets

Platform-hosted provider secrets resolve through:

- `server_modules/secrets_broker.py`
- `secrets_broker.resolve_hosted_provider_secret(...)`
- `secrets_broker.resolve_hosted_openai_bearer(...)`

The existing governance doc is
`docs/operations/hosted-provider-secret-governance.md`.

Required behavior:

- platform hosted secrets are owned by Empyralis runtime, not the workspace
  customer
- missing hosted secrets fail safely
- hosted secret access emits audit rows
- frontend responses expose status/metadata, not raw secret values

## Customer BYOK Secrets

Customer provider keys and connector credentials must stay workspace-owned and
resolved through vault/provider paths. They must not be copied into platform
hosted secret bundles or returned to app/agent/frontend payloads.

## App And Agent Context

Apps can receive only bridge-approved context classes. App metadata must not
contain private owner resources such as Sage memory, personal channels, gateway
ids, runtime session ids, owner files, shell, computer control, or raw tool
calls.

## Billing And Credit Data

Hosted AI usage records can include provider, model, token counts, estimated
cost, credit quantity, workspace id, tenant id, thread id, request id, and
surface metadata. They must not include raw provider keys or unredacted
customer secrets.

## Migration Debt

Add a frontend response contract listing every allowed provider/credit field
that may leave the backend.
