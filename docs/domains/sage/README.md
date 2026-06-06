# Sage Domain

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: code, tests, and active decisions

Sage is the main workspace agent. This folder owns factual documentation for
Sage chat, tools, memory, channels, runtime routing, UI behavior, and security.

## Current Implementation Summary

Sage's direct API surface is `/api/sage/chat`, `/api/sage/voice-task`, and
approval resolve routes registered from `server_modules/sage_chat_api.py`.
`/api/sage/chat` enforces authenticated workspace membership, normalizes Sage
mode/surface, and delegates the turn to
`server_modules/sage_agent_runtime_service.py`.

The inspected `/api/sage/chat` path is a model-backed text turn. It loads Sage
profile, Sage memory, workspace context files, heartbeat summary, and safe
read-only skills before calling the selected cloud provider. It persists direct
chat memory, activity, security audit, and transparency events on a best-effort
basis. It does not directly execute Agent Computer browser, shell, filesystem,
or personal-channel dispatch from that route.

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
- `docs/references/openclaw-sage-gap-analysis.md`
- `docs/domains/agent-computer/runtime.md`
- `docs/domains/channels/personal-vs-studio-channel-model.md`
- `docs/codex-chat-surface-parity.md`
