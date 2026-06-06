# Sage Contract

Status: Active
Owner: Platform
Last verified: 2026-06-07
Source of truth: code

## Responsibilities

Sage is the owner workspace assistant for `owner_sage` mode. The request model
defaults to `mode="owner_sage"` and `surface="chat"`, while
`server_modules/sage_agent_runtime_contract.py` also allows `mobile`, `web`,
`desktop`, and `voice` surfaces. `server_modules/sage_chat_api.py` rejects
missing `workspace_id`, empty messages, unsupported modes, and unsupported
surfaces before calling runtime code.

Default Sage chat behavior is cloud text generation. `handle_sage_chat()` in
`server_modules/sage_agent_runtime_service.py` loads profile, memory, context
files, heartbeat, and safe skills, resolves a configured cloud provider, and
then chooses between the Sage action loop and the plain text-generation path.
Action-shaped prompts use action loop v2 for web search/fetch, guarded direct
tools, and approved MCP skills. Plain chat builds the prompt envelope, calls
`generate_chat_reply_with_provider_fallback()`, then returns the reply plus
`used_context`, `available_tools`, `trace_id`, `provider`, `model`, and
transparency events.

## Ingress Routes

- `/api/sage/chat`: authenticated workspace member chat turn. Source:
  `server_modules/sage_chat_api.py`.
- `/api/sage/voice-task`: authenticated workspace member voice transcript task.
  Source: `server_modules/sage_chat_api.py`.
- `/api/sage/approvals/approve` and `/api/sage/approvals/reject`: owner/member
  approval resolution routes that currently support the minimal
  `channel_send_draft` execution path. Source: `server_modules/sage_chat_api.py`.
- `/gateway/acp/turn`: authenticated ACP `agent.turn` bridge that enforces a
  Rust gateway action decision before calling `handle_sage_chat()`. Source:
  `server_modules/routes_gateway.py`.
- Personal channel inbound: gateway channel events are bridged into Sage through
  `server_modules/personal_channel_sage_bridge_service.py` and
  `server_modules/sage_turn_adapter.py`, not by the public Studio channel
  router.

## Forbidden Responsibilities

- Sage chat must not claim unavailable capabilities. The runtime injects a Sage
  surface boundary telling the model to use only available tools and to state
  exactly what is missing when no tool or permission can do a requested action.
  Source: `server_modules/sage_agent_runtime_service.py`.
- `/api/sage/chat` must not execute command-looking assistant text. The direct
  chat generation service explicitly refuses to promote natural-language shell
  plans into tool calls. Source: `server_modules/direct_chat_generation_service.py`.
- Studio/business channel routing is not Sage. Public deployed-agent channel
  traffic routes through `server_modules/agent_channel_router.py`; personal
  Sage channels route through gateway-bound personal-channel services.

## Runtime Boundary

Cloud model-backed chat is the default. Agent Computer work requires selected
hardware/gateway state and policy gates documented in
`docs/domains/agent-computer/runtime.md` and enforced by gateway routes in
`server_modules/routes_gateway.py`.

Personal-channel send execution is not a raw `/api/sage/chat` side effect.
Those actions are represented through tool availability, gateway routes,
approvals, or the streaming direct-chat/personal-channel dispatch surfaces.
