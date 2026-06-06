# Sage Tests

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: test suite

## Focused Commands

Run focused backend coverage for the inspected Sage surface:

```bash
python3 -m pytest \
  server_modules/tests/test_sage_chat_api.py \
  server_modules/tests/test_sage_chat_api_approval_activity.py \
  server_modules/tests/test_sage_agent_runtime_contract.py \
  server_modules/tests/test_sage_agent_runtime_service.py \
  server_modules/tests/test_sage_turn_adapter.py \
  server_modules/tests/test_sage_memory_api.py \
  server_modules/tests/test_sage_memory_service.py \
  server_modules/tests/test_sage_context_files_api.py \
  server_modules/tests/test_direct_chat_tool_catalog_service.py \
  server_modules/tests/test_direct_chat_provider_service.py \
  server_modules/tests/test_direct_chat_generation_service.py \
  server_modules/tests/test_routes_gateway_rust_gate.py \
  server_modules/tests/test_personal_channel_sage_bridge_service.py
```

## Coverage Map

- API contract: request defaults, missing fields, invalid mode/surface, response
  keys, prompt guardrails. Source: `server_modules/tests/test_sage_chat_api.py`.
- Runtime context: profile, memory, context files, heartbeat, safe skills,
  restricted-memory exclusion, prompt redaction, persistence, activity, security
  audit, result shape, provider error handling. Source:
  `server_modules/tests/test_sage_agent_runtime_service.py`.
- Tool catalog: local tool intent detection, browser versus web search,
  connector detection, inventory reply from actual capability truth. Source:
  `server_modules/tests/test_direct_chat_tool_catalog_service.py`.
- Provider/credits: BYOK versus platform runtime filtering, hosted Sage AI
  restriction states, provider preference order, local runtime availability.
  Source: `server_modules/tests/test_direct_chat_provider_service.py`.
- Memory/context APIs: workspace enforcement, update/list/export/wipe behavior,
  invalid filename handling, audit metadata. Sources:
  `server_modules/tests/test_sage_memory_api.py` and
  `server_modules/tests/test_sage_context_files_api.py`.
- Gateway/ACP security: Rust action gates, ACP workspace enforcement, API-key
  dependency, browser/gateway dispatch gates. Source:
  `server_modules/tests/test_routes_gateway_rust_gate.py`.
- Personal channel bridge: external content guard and no-tools personal-channel
  reply path. Source:
  `server_modules/tests/test_personal_channel_sage_bridge_service.py`.

## Frontend Checks

The inspected files do not have a focused test named in the fill prompt. Run the
repo's frontend type/build checks before shipping UI behavior changes, and
manually verify streaming, abort, provider error, Agent Computer offline, and
incomplete response states in `frontend/lib/workspace/workstation-chat-pane.tsx`
and `frontend/lib/workspace/chat-message.tsx`.
