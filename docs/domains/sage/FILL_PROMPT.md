# Fill Prompt: Sage Docs

Status: Active prompt
Owner: Platform
Last verified: 2026-06-06

Read the source docs and code listed below. Fill the Sage docs with facts only.
Do not write desired architecture as current behavior.

## Required Code To Read

- `server_modules/sage_chat_api.py`
- `server_modules/sage_agent_runtime_service.py`
- `server_modules/sage_agent_runtime_contract.py`
- `server_modules/direct_chat_tool_catalog_service.py`
- `server_modules/direct_chat_generation_service.py`
- `server_modules/direct_chat_provider_service.py`
- `server_modules/sage_memory_api.py`
- `server_modules/sage_context_files_api.py`
- `server_modules/routes_gateway.py`
- `frontend/lib/workspace/workstation-chat-pane.tsx`
- `frontend/lib/workspace/chat-message.tsx`

## Questions To Answer

1. What can Sage do by default without Agent Computer?
2. What requires selected Agent Computer?
3. What requires personal channel state?
4. What uses platform AI credits?
5. What uses customer BYOK/provider credentials?
6. What is streamed to the UI?
7. What is persisted to memory, transcript, audit, or activity?
8. What tests prove each claim?
