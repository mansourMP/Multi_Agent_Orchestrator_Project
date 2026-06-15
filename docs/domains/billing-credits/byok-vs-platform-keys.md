# BYOK Vs Platform Keys

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: provider profile and direct chat provider services

## Credential Lanes

`server_modules/direct_chat_provider_service.py` classifies provider credential
planes:

- workspace BYOK: `credential_plane=workspace_connection`,
  `credential_owner_kind=workspace_byok`, source profile/vault/default.
- platform hosted: `credential_plane=platform_runtime`,
  `credential_owner_kind=platform_hosted`, source env/platform account.
- local runtime: `credential_plane=local_runtime`,
  `credential_owner_kind=local_machine`, source local CLI/subscription or local
  machine owner.
- unknown: fallback when no source can be classified.

Provider truth also exposes hosted AI policy, monthly cap/cost/remaining, and
whether platform runtime is allowed.

## Platform Secrets

Platform-hosted provider secrets resolve through
`server_modules/secrets_broker.py`:

- `resolve_hosted_provider_secret(...)`
- `resolve_hosted_openai_bearer(...)`

The hosted provider governance doc states platform secrets use managed hosted
secret bundles first with explicit env fallback for bootstrap compatibility.
Hosted secret resolution appends audit rows with
`secret_kind=platform_hosted_provider_secret` and ownership metadata.

## Frontend-Visible Metadata

Provider availability may expose provider id/label, connection mode,
credential-plane labels, hosted state, monthly cap/cost/remaining, and setup
actions. It should not expose raw API keys.

## Failure Behavior

When hosted platform runtime is blocked, direct chat provider truth marks the
runtime as restricted and sets issue codes such as
`hosted_ai_owner_approval_required`, `hosted_ai_cap_reached`, or
`hosted_ai_policy_disabled`.

## Platform Provider: DeepSeek Only

Empyralis credits use **only DeepSeek** as the internal provider. There is no fallback chain — `CLOUD_PROVIDER_IDS` in `sage_agent_runtime_service.py` contains only `("deepseek",)`. Users who want a different provider must use the "My API Key" or "My AI Account" tiers, which are documented in `hosted-ai-credits.md`.
