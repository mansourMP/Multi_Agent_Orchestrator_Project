# Sage Runtime

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: Sage runtime and Agent Computer code

## Cloud Default

The inspected `/api/sage/chat` path is cloud-provider backed by default.
`server_modules/sage_agent_runtime_service.py` resolves a provider from
workspace credentials in priority order `anthropic`, `deepseek`, `openai`,
`gemini`, then calls `generate_chat_reply_with_provider_fallback()` with
`disable_provider_fallback=True` in the context.

`server_modules/direct_chat_provider_service.py` separates credential planes:
workspace BYOK credentials, platform runtime credentials, and local runtime
credentials. Platform runtime credentials are filtered out when hosted Sage AI
is not allowed for the workspace.

## Agent Computer Requirement

Agent Computer is required for local files, shell, browser automation,
screenshot, computer-control, and personal-channel sessions. Tool intent
detection for local file/shell/screenshot/computer requests lives in
`server_modules/direct_chat_tool_catalog_service.py`; actual gateway execution
is guarded in `server_modules/routes_gateway.py` and personal-channel services.

`/api/sage/chat` itself does not dispatch these local actions. It can expose
safe skill catalog entries and include setup/readiness context, but execution
requires the selected gateway/Agent Computer path.

## Offline Behavior

Capability truth marks local tools available only when runtime health and either
local gateway or local worker online state are true. Otherwise the inventory
reply says This Device capabilities require Agent Computer to be online. Source:
`server_modules/direct_chat_provider_service.py` and
`server_modules/direct_chat_tool_catalog_service.py`.

Browser gateway routes may prepare cloud browser fallback only where the route
explicitly allows it and the local gateway connection is not live. Source:
`server_modules/routes_gateway.py`.

## Access Modes

Product contract from `docs/domains/agent-computer/runtime.md`:

- Default: guarded Agent Computer access; risky local, send, install, payment,
  deploy, credential, and system actions require approval.
- Custom: guarded access with editable grants; missing custom policy behaves
  like Default.
- Full Access: Sage can use the selected Agent Computer without per-action
  Empyralis approval prompts, including broad filesystem, shell, browser data,
  token, SSH key, secret, delete, and connected-account access.

Do not weaken Full Access in code or docs. The controls are explicit consent,
Sage-only scope, signed requests, replay protection, audit, revocation, kill
switch, OS permission enforcement, and dedicated-hardware recommendation.

## Separation From Studio

Sage runtime is the owner/personal-agent contract. Studio agents are separate
deployed-agent runtime contracts, even when they eventually run work on the same
physical Agent Computer. Sage Agent Computer selection, Sage memory, personal
channel sessions, owner browser state, and Sage Full Access approval must not be
copied into Studio runtime bindings.

Code-level enforcement appears in two layers:

- Gateway dispatch requires Full Access to be Sage scoped. Source:
  `server_modules/gateway_execution_service.py`.
- The Rust supervisor rejects `full_access` unless the request resolves to
  `agent_scope=sage` and carries the Sage setup warning acknowledgement. Source:
  `empyralis-supervisor/src/main.rs`.

## ACP Bridge

`/gateway/acp/turn` accepts authenticated ACP `agent.turn`, checks that any
payload workspace matches the authenticated workspace, enforces the Rust
gateway action decision, then calls `handle_sage_chat(surface="acp")`.
Non-implemented ACP message types return `501`. Source:
`server_modules/routes_gateway.py`.

Migration debt: `normalize_sage_surface()` in
`server_modules/sage_agent_runtime_contract.py` does not list `acp` as an
allowed surface, while `/gateway/acp/turn` passes `surface="acp"` into
`handle_sage_chat()`. The gateway tests cover the Rust gate, but this surface
contract mismatch should be reconciled.
