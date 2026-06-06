# Sage Tools

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: tool catalog code

## Cloud And Built-In Tools

`server_modules/direct_chat_tool_catalog_service.py` classifies built-in web,
HTTP, image generation, browser, hardware, and LLM task requests. Web lookup and
browser automation are intentionally separated: web lookup ignores browser-tool
requests, while browser automation requires browser/open/click/fill/screenshot
style intent.

Built-in capability labels are grouped for inventory display as Web, Media,
Communication, Data, Agent Computer, or Other. The inventory reply is based on
actual tool list and capability truth, not model-provider identity.

## Connector/API Tools

Connector requests are routed only when the user message mentions a supported
connector family and the corresponding tool prefix exists in the active tool
list. The checked families include Google Workspace, SMTP, Telegram Bot, Slack,
Discord Bot, Dropbox, and S3. Source:
`server_modules/direct_chat_tool_catalog_service.py`.

## Agent Computer Tools

Local file, shell, screenshot, and computer-control intent detection is in
`server_modules/direct_chat_tool_catalog_service.py`. The local tool is usable
only when `file__read`/`file__write`, `shell__exec`, `screenshot__capture`,
`computer__*`, or the fallback `hardware__action` tool exists in the available
tool list.

Agent Computer readiness is built by
`direct_chat_provider_service.build_capability_truth()`: local tools become
available only when runtime is healthy and gateway or local worker state is
online. Offline state yields setup actions such as connecting or restarting the
Agent Computer.

## Sage Safe Skill Catalog

The `/api/sage/chat` runtime loads installed skills but filters out skills whose
`action_class` is `write` or `execute`. The remaining safe skills are returned
as `available_tools`; blocked/write skills are not auto-executed from that route.
Source: `server_modules/sage_agent_runtime_service.py`.

## Personal-Channel Tools

Personal-channel setup and sends are not generic Studio connector tools. They
are routed through `/api/personal-channels/...` routes, gateway service
decisions, approval requests, and gateway outbound dispatch. Sources:
`server_modules/routes_personal_channels.py` and
`server_modules/personal_channels_service.py`.

## Tests

`server_modules/tests/test_direct_chat_tool_catalog_service.py` covers local
file/shell/hardware intent detection, browser versus web lookup classification,
connector request detection, and inventory output. `server_modules/tests/test_sage_agent_runtime_service.py`
covers safe skill loading and verifies write/execute terms do not create
keyword-triggered approval cards.

Not implemented in the inspected `/api/sage/chat` path: direct tool execution
loops, local hardware dispatch, or personal-channel sends.
