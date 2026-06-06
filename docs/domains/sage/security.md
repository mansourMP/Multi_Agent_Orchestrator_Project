# Sage Security

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: auth, runtime, gateway, and provider code

## Workspace Access

`/api/sage/chat`, `/api/sage/voice-task`, approvals, Sage memory, and Sage
context-file routes all depend on the API-key/session user and call
`enforce_workspace_access()` with role-specific minimums before touching
workspace data. Sources: `server_modules/sage_chat_api.py`,
`server_modules/sage_memory_api.py`, and `server_modules/sage_context_files_api.py`.

## Provider And Credit Separation

`server_modules/direct_chat_provider_service.py` distinguishes workspace BYOK,
platform runtime, and local runtime credential planes. Hosted Sage AI access is
checked through `entitlements_service.hosted_sage_ai_access_state_for_workspace_id()`.
When hosted AI is disabled, platform runtime candidates are filtered out and
platform runtime truth is restricted with reason codes such as
`hosted_ai_policy_disabled`, `hosted_ai_owner_approval_required`, or
`hosted_ai_cap_reached`.

Tests in `server_modules/tests/test_direct_chat_provider_service.py` cover
platform-runtime filtering, preferred provider fallback order, Codex mapping,
and availability choices. Tests in `server_modules/tests/test_entitlements_service.py`
cover hosted Sage AI cap and credit states.

## Prompt And Response Guardrails

`handle_sage_chat()` redacts the prompt envelope using
`secret_redaction_service.redact_text()`, injects Sage surface boundary copy
that forbids false capability claims, and loads memory with
`include_restricted=False`. Tests in
`server_modules/tests/test_sage_agent_runtime_service.py` cover restricted
memory exclusion, prompt redaction, and no keyword-triggered approval cards.

`server_modules/direct_chat_generation_service.py` blocks promotion of
natural-language command-looking assistant output into shell execution; shell
work must arrive as a structured tool call or approved payload.

## Persistence And Audit

Successful Sage turns attempt to persist:

- direct chat memory via `persist_interaction()`
- activity ledger event `sage_chat.completed`
- security audit event `sage_chat.completed`
- transparency events via `persist_transparency_events()`

Failures in these persistence paths are best-effort and do not fail the user
response. Source: `server_modules/sage_agent_runtime_service.py`.

Approval routes emit approval activity and security audit events for approve,
reject, execute, and failure states. Source: `server_modules/sage_chat_api.py`.

## Gateway And ACP Gates

Agent Computer routes use gateway service/action decisions before dispatch.
`/gateway/acp/turn` enforces workspace access and a Rust
`gateway-action-decision` before calling Sage. Source:
`server_modules/routes_gateway.py`.

P0 ACP route fix: tests in `server_modules/tests/test_routes_gateway_rust_gate.py`
cover that ACP turn accepts the canonical `route_acp_turn` action, blocks wrong
Rust actions before `handle_sage_chat()`, requires the API-key dependency, and
enforces workspace access before calling Sage.

Migration debt: `/gateway/acp/turn` currently passes `surface="acp"` into
`handle_sage_chat()` while the Sage surface contract does not include `acp`.
