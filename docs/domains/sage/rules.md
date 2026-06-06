# Sage Rules

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: code and active decisions

## Capability Truth

Do not add hardcoded happy-path copy that claims Sage can use unavailable tools.
The model-facing Sage boundary in
`server_modules/sage_agent_runtime_service.py` says to use only available tools
and to state exactly what is missing when no available tool or permission can do
the request. UI inventory copy must come from actual tool and capability truth
as in `server_modules/direct_chat_tool_catalog_service.py`.

## Agent Computer Usage

Never hide Agent Computer use. Local file, shell, browser, screenshot,
computer-control, and personal-channel actions require Agent Computer/gateway
state and policy gates. `/api/sage/chat` must not silently execute local work.
Gateway and personal-channel routes must keep Rust decisions, kill switches,
approval hooks, idempotency keys, and audit events in front of dispatch.

## Web Search Versus Browser Automation

Keep web lookup and browser automation separate. In
`server_modules/direct_chat_tool_catalog_service.py`,
`message_requests_web_lookup_tool()` returns false when the message is a browser
automation request. Browser automation requires browser/open/click/fill/page
title/screenshot style intent.

## Streaming UI

Do not collapse streaming into one generic trace card. The workstation pane
expects trace, step, chunk/response, and final events and renders typed activity
rows. Partial responses should become incomplete assistant messages on abort or
stream interruption. Source: `frontend/lib/workspace/workstation-chat-pane.tsx`.

## Prompt And Tool Safety

Do not parse command-looking assistant prose into shell execution. The current
generation service explicitly returns no shell tool call from natural-language
assistant shell blocks. Source: `server_modules/direct_chat_generation_service.py`.

## Channel Visibility

Personal-channel messages must stay in the personal gateway lane and Studio
business messages must stay in the connector/deployed-agent lane. Do not expose
personal Agent Computer sessions as Studio channel bindings. Sources:
`server_modules/channel_platform_service.py` and
`docs/domains/channels/personal-vs-studio-channel-model.md`.

Migration debt: personal-channel inbound messages are not rendered as a
dedicated chat row type in `frontend/lib/workspace/chat-message.tsx`; avoid UI
copy that implies a complete omnichannel inbox inside the inspected Sage pane.
