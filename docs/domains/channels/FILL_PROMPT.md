# Fill Prompt: Channels Docs

Status: Active prompt
Owner: Platform
Last verified: 2026-06-06

Read:

- `server_modules/agent_channel_router.py`
- `server_modules/routes_personal_channels.py`
- `server_modules/personal_channels_service.py`
- `server_modules/channel_platform_service.py`
- `server_modules/tests/test_agent_channel_router.py`
- `server_modules/tests/test_channel_platform_service.py`
- `server_modules/tests/test_personal_channels_service_rust_gate.py`
- `server_modules/tests/test_routes_personal_channels_rust_gate.py`
- `frontend/app/(account)/w/[workspaceId]/channels/page.tsx`
- `frontend/lib/workspace/workspace-channel-pairing-surface.tsx`
- `docs/domains/channels/personal-vs-studio-channel-model.md`
- `docs/domains/channels/foundation-strategy.md`
- `docs/reports/web-chat-channel-audit.md`

Fill Channels docs with code-backed facts only.

Required output:

- List each channel type that exists in code.
- Explain how inbound messages are authenticated, normalized, routed, and stored.
- Explain which channels are personal-to-Sage and which are business-to-Studio.
- Document attachment, voice, image, and file support only if code proves it.
- Document webhook and pairing security checks.
- Document test coverage and missing tests.

Do not invent future channels. If a channel is planned but not implemented, mark
it as planned or absent and cite the source.
