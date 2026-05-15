# Architecture Readiness - 2026-04-29

This document records current architecture truth for the public-demo track. It separates implemented platform lanes from lanes that are fully demo-certified.

## Readiness Verdict

The core architecture is in place, but not every lane is certified for public demo.

| Lane | Current Status | Demo Meaning |
| --- | --- | --- |
| Cloud provider Sage chat | Implemented and locally certified with DeepSeek. | Safe demo lane once production provider credential save is fixed. |
| Local gateway and supervisor tools | Implemented; local registration is working. | Safe only after one visual gateway-online/offline pass in the demo workspace. |
| Provider/runtime truth | Locally certified for DeepSeek. | Provider metadata is truthful; unconfigured Anthropic returns provider-unavailable instead of silent fallback. |
| Mobile shell | Implemented under `mobile/app/(tabs)`. | Present, but not certified in this pass. Do not promise mobile demo unless separately tested on device. |
| Desktop shell | Implemented through repo-local Tauri shell and shared web contracts. | Present, but not certified in this pass. |
| Studio / B2B specialists | Implemented as a separate Studio lane with deployed-agent surfaces. | Business expansion path exists; do not make it the core public demo unless separately certified. |
| Mini-app layer | Hosted mini-app routes, manifest route, and bridge route exist. | Architecture exists; product polish/certification remains future work. |
| Production provider credential save | Blocked by production `/api/credentials/vault` 500 per latest teammate report. | Hard demo blocker until fixed and rerun on Render. |

## Current Certified Path

Local certification has passed for:

- DeepSeek provider catalog truth: `configured=true`, `usable=true`, default model `deepseek-chat`.
- Direct Sage stream: `trace`, `step`, `chunk`, and `final` SSE events are emitted.
- Final provider metadata: requested provider/model and effective provider/model are both DeepSeek/deepseek-chat.
- No silent fallback: unconfigured Anthropic returns a provider-unavailable intervention with no effective provider.
- Tool inventory questions are backend-owned and reflect the actual tool catalog.

## Architectural Boundary

Provider choice should only change the reasoning model. Tool availability is determined by:

- gateway status for local-machine tools
- connector state for communication tools
- backend policy and configured credentials for cloud/web/media tools

Provider choice must not create a different UX surface or hidden tool set.

## Demo Rule

For the public demo, use only certified lanes:

- Sage chat with a usable cloud provider
- provider/model/reasoning picker
- transparent thinking/tool rows
- tools palette with gateway-offline state
- optional gateway local-tool demo only after the visual gateway pass

Do not demo as primary:

- mobile shell
- desktop shell
- Studio specialists
- mini-app builder
- video generation

These exist as architecture and roadmap proof, not as the current demo-critical golden path.
