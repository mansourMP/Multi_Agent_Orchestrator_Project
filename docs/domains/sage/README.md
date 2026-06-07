# Sage Domain

Status: Active
Owner: Platform
Last verified: 2026-06-07
Source of truth: code, tests, and active decisions

Sage is the main workspace agent. This folder owns factual documentation for
Sage chat, tools, memory, channels, runtime routing, UI behavior, and security.

## Current Implementation Summary

Sage's direct API surface is `/api/sage/chat`, `/api/sage/voice-task`, and
approval resolve routes registered from `server_modules/sage_chat_api.py`.
`/api/sage/chat` enforces authenticated workspace membership, normalizes Sage
mode/surface, and delegates the turn to
`server_modules/sage_agent_runtime_service.py`.

The inspected `/api/sage/chat` path is cloud model-backed by default, but now
has a Sage action loop for action-shaped prompts. It loads Sage profile, Sage
memory, workspace context files, heartbeat summary, and safe read-only skills.
For normal chat it calls the selected cloud provider. For direct actions it can
execute built-in web/search/fetch tools, approved MCP skills, and guarded direct
tools through the existing direct-chat execution services. Local Agent Computer
work remains gated by selected gateway state and policy; personal-channel send
dispatch still belongs to the approval/channel routes, not raw chat text.
Daily Operator recipes for morning brief, email triage, and meeting prep run
through the same Sage runtime and connected-app tool contracts.

Agent Computer and personal channels are separate runtime lanes. Sage must use a
selected Agent Computer for local hardware work and personal-channel sessions;
Studio agents do not inherit that access. See `docs/domains/agent-computer/runtime.md`
and `docs/domains/channels/personal-vs-studio-channel-model.md`.

## Files

- `contract.md`: what Sage owns and does not own.
- `rules.md`: coding rules for Sage changes.
- `tools.md`: Sage tool catalog and routing.
- `channels.md`: personal and external message ingress/egress for Sage.
- `memory.md`: Sage memory and context boundaries.
- `runtime.md`: cloud, Agent Computer, and hardware-backed routing.
- `security.md`: auth, secrets, prompts, tool execution, abuse boundaries.
- `ui.md`: chat surface and streaming/display rules.
- `tests.md`: required regression and smoke tests.
- `FILL_PROMPT.md`: prompt for the documentation agent.

## Existing Source Docs

- `docs/SAGE_PROFESSIONAL_IMPLEMENTATION_PLAN.md`
- `docs/domains/agent-computer/runtime.md`
- `docs/domains/channels/personal-vs-studio-channel-model.md`
- `docs/codex-chat-surface-parity.md`
