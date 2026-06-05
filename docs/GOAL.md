## Copy-paste goal

Make Empyralis launch-ready around Sage as the main agent: Sage must chat naturally with the selected AI model, stream visibly, use Agent Computer and channels through a native gateway, show honest transparency inside the conversation, manage memory/tasks safely, expose only working tools, and make every button/control feel native, intentional, and physically correct.

## Core product rule

Sage is the center.

Hardware, channels, connectors, local models, tools, files, memory, tasks, voice, image/video generation, and actions are not separate random surfaces. They are capabilities Sage can use, with the UI showing what is connected, what is happening, and what needs approval.

## Non-negotiables

- No hardcoded assistant replies in the chat.
- No fake “Sage said this” messages from the platform.
- No silent model fallback.
- If user selects DeepSeek, DeepSeek answers or the turn fails clearly.
- If user selects Gemini, Gemini answers or the turn fails clearly.
- Hardware actions must go through Agent Computer/Gateway/Supervisor.
- Channels must feel native, not like webhook demos.
- Every visible button must work, lead somewhere real, or be hidden.
- Transparency must show real work: thinking, using hardware, reading channel, running tool, waiting for approval, completed, failed.
- Streaming must appear while Sage is working, not only after everything is done.
- Unsupported features must not look available.

## Launch-readiness implementation plan

### Chunk 1: Sage natural-chat contract

Goal:
Make Sage feel like a real agent, not a platform script.

Implement:
- Remove remaining hardcoded assistant-style chat replies.
- Prevent pseudo-tool text like `run_command:`, JSON action blobs, internal plans, and fake tool syntax from rendering as assistant messages.
- Keep system errors as UI notices/interventions, not assistant speech.
- Ensure failed hardware/tool attempts can still produce a natural model answer when appropriate.

Acceptance:
- Normal chat streams a model answer.
- Hardware failure does not create fake Sage text.
- Internal command syntax never appears in chat.
- Old messages may remain, but new turns are clean.

### Chunk 2: Strict model/provider routing

Goal:
The selected model must be the model that answers.

Implement:
- Disable silent fallback in Sage chat.
- Make fallback opt-in only, later.
- Surface missing API key, quota, unavailable model, or local runner offline as UI status.
- Audit OpenAI, Gemini, DeepSeek, Anthropic, Ollama, local OpenAI-compatible, and Codex provider routes.

Acceptance:
- Selected DeepSeek cannot answer through Gemini/OpenAI.
- Selected Gemini cannot answer through Ollama.
- Selected local model fails clearly if Agent Computer/local runner is unavailable.
- Model picker becomes truthful.

### Chunk 3: Streaming and transparency inside conversation

Goal:
The user sees Sage working live.

Implement:
- Stream assistant text as provider chunks arrive.
- Show compact live trace rows in the chat.
- Add visible states: `Thinking`, `Using Agent Computer`, `Reading channel`, `Running command`, `Waiting for approval`, `Completed`, `Failed`.
- Show a cancel/stop affordance that maps to real cancellation.
- Do not expose hidden chain-of-thought; expose operational trace only.

Acceptance:
- User sees live progress before final answer.
- Hardware/tool/channel actions show real status.
- Failed step is visible and specific.
- Trace is honest, compact, and native.

### Chunk 4: Hardware top-right control redesign

Goal:
Replace the “papercut” hardware popover with the same clean grammar as the composer `+` menu.

Implement:
- Redesign the top-right Agent Computer/Hardware button.
- Use the same compact style as the `+` menu for skills/connectors/files.
- Sections: `This Mac`, `Channels`, `Local models`, `Permissions`, `Recent activity`.
- Hide Cloud Computer/VPS unless actually enabled.
- Show simple state: connected, offline, permission issue, working.
- Keep full Hardware page as the management surface.

Acceptance:
- Top-right hardware menu feels native and consistent.
- No big detached paper card.
- No unavailable VPS/cloud claims.
- User can understand hardware state in one glance.

### Chunk 5: Agent Computer action loop

Goal:
Sage can actually use the connected Mac.

Implement:
- First reliable action: screenshot through Gateway/Supervisor.
- Second action: system/hardware info through a macOS-safe capability.
- Then keyboard/mouse/file actions with approval.
- Hardware actions emit activity and chat trace events.
- Permission failures are exact: screen recording, accessibility, file access.

Acceptance:
- User asks Sage to take screenshot.
- Agent Computer executes.
- Hardware activity updates.
- Sage receives result and answers naturally.
- Permission gaps are shown clearly.

### Chunk 6: Native personal channels

Goal:
Sage uses channels like a human assistant, not only as reply hooks.

Implement:
- Keep Telegram and WhatsApp first because they already exist.
- Add conversation roster: people, groups, recent chats.
- Add direct send without needing an inbound message.
- Add group support where runtime supports it.
- Add typing/read/delivery events where available.
- Add channel health in hardware menu.
- Add future slots for Gmail, Calendar, Discord, Slack, iMessage/SMS if technically possible, and custom channels.
- Keep unsupported channels hidden or marked unavailable.

Acceptance:
- Sage can answer “who messaged me?”
- Sage can message a selected person/group.
- Sage can see recent channel context.
- User does not need to mention/reply to a specific inbound message.
- Channel actions go through Gateway and are audited.

### Chunk 7: Channel media ingestion

Goal:
Photos, voice notes, and files become real inputs.

Implement:
- Extend `channel.inbound` schema for attachments.
- Image path: download artifact, store it, pass artifact metadata to Sage, optionally run vision/OCR.
- Voice path: download audio, transcribe, pass transcript plus artifact.
- File path: store artifact, expose with permission boundary.
- Reaction/location/contact can be added later if the runtime supports it.
- Do not advertise media support until the path is real.

Acceptance:
- Voice note becomes transcript.
- Image becomes visible artifact plus optional summary.
- File becomes visible artifact.
- Sage can refer to media naturally.

### Chunk 8: Sage memory, tasks, and actions

Goal:
Sage can maintain useful context and work state.

Implement:
- Let Sage read allowed memory.
- Let Sage propose/edit memory safely.
- Add memory approval for sensitive changes.
- Implement real Tasks objects.
- Add action list/history for pending and completed work.
- Enforce memory sensitivity: RED never enters prompts, ORANGE requires confirmation, YELLOW contextual, GREEN normal.

Acceptance:
- “Remember this” creates a real memory update.
- “What do you remember?” reads allowed memory.
- Sage can create/update tasks.
- Sensitive memory is protected.

### Chunk 9: Unified capability menu

Goal:
The `+` menu becomes the clean native control surface.

Implement:
- Use one menu for `Add files`, `Skills`, `Connectors`, `Hardware`, `Voice`, `Images`, `Tools`.
- Every menu item must be working or hidden.
- Add files must attach real files.
- Skills must map to real tool capabilities.
- Connectors must show real auth/health.
- Voice/TTS/image/video only appear if backed by real capability.

Acceptance:
- Every visible menu row works.
- No dead “coming soon” actions.
- No fake install/connect flows.
- User can understand what Sage can use.

### Chunk 10: Local AI runners and third-party subscriptions

Goal:
Local models and user-owned model subscriptions work through the correct boundary.

Implement:
- Local Ollama/local OpenAI-compatible models route through Agent Computer.
- Detect local model availability from Gateway.
- BYOK cloud providers stay server-side and secure.
- Local-only providers require verified hardware.
- No silent swap from local to cloud.
- Show local model state in AI setup and hardware menu.

Acceptance:
- Ollama selected plus connected hardware uses Ollama.
- Ollama selected plus offline hardware fails clearly.
- DeepSeek/Gemini/OpenAI use their own configured keys.
- User-owned subscriptions do not leak into wrong provider path.

### Chunk 11: Multimodal tools

Goal:
Sage can use modern AI capabilities without cluttering the main UI.

Implement:
- TTS as a real voice output capability.
- Voice mode as a real speech input/output flow only after STT/TTS path is stable.
- Image generation as a real provider-backed tool.
- Image understanding as separate from image generation.
- Video generation only if a real provider and artifact flow exists.
- All generated media becomes artifact-backed.

Acceptance:
- Visible media tools work.
- Generated image/video/audio appears as artifact.
- Voice mode does not appear until usable.
- No raw provider/model labels on primary cards.

### Chunk 12: Button and route QA

Goal:
Every button must be physically correct and purposeful.

Implement:
- Audit every Sage button.
- Audit left trail.
- Audit top-right hardware button.
- Audit `+` menu.
- Audit model selector.
- Audit memory/tasks/library/actions/connections.
- Audit Hardware page.
- Remove duplicate, broken, misleading, or dead controls.
- Match selected/hover/default states everywhere.

Acceptance:
- Every visible control works.
- Every disabled control explains why.
- No duplicate hardware/settings routes.
- No inconsistent button shape, border, spacing, or selected state.

### Chunk 13: Security and trust hardening

Goal:
Launch without dangerous hidden behavior.

Implement:
- No hardcoded production secrets.
- No automatic demo seed in real accounts.
- Pairing tokens are single-use and expire.
- Gateway actions are approval-gated by risk.
- Channel send actions are auditable.
- Prompt injection wrappers around user/channel content.
- Memory sensitivity enforced before provider prompt construction.

Acceptance:
- Invalid/expired gateway token fails.
- RED memory cannot reach provider prompt.
- Channel webhook/input cannot silently trigger privileged actions.
- Every privileged action has trace/audit.

### Chunk 14: Launch smoke

Goal:
Prove the core loop end-to-end.

Smoke path:
- Log in.
- Select model.
- Ask normal question.
- Confirm streaming.
- Connect Agent Computer.
- Ask Sage to screenshot.
- See live trace.
- See Hardware activity.
- Ask Sage to read/send Telegram or WhatsApp message.
- Confirm channel event/action.
- Add a file.
- Ask Sage to remember something.
- Create a task.
- Confirm no fake/hardcoded assistant text.
- Confirm every visible button works or is hidden.

## Branch order

1. `codex/sage-natural-chat-streaming-contract`
2. `codex/strict-model-routing`
3. `codex/hardware-popover-native-menu`
4. `codex/agent-computer-action-loop`
5. `codex/native-personal-channels`
6. `codex/channel-media-ingestion`
7. `codex/sage-memory-tasks-actions`
8. `codex/unified-capability-menu`
9. `codex/local-ai-runner-routing`
10. `codex/multimodal-tools`
11. `codex/sage-button-route-qa`
12. `codex/security-launch-hardening`
13. `codex/launch-smoke-fixes`

## First implementation target

Start with:

`codex/sage-natural-chat-streaming-contract`

This is the correct first chunk because everything else depends on Sage being truthful, natural, streaming, and not hardcoded.

If Sage chat is not clean, channels and hardware will still feel broken even if they technically work.