# Codex Chat Surface Parity Contract

OpenAI Codex is the behavioral reference for the Sage chat surface. The local source reference is `/tmp/openai-codex`; remodex and CodexMobile are not the source of truth for this parity pass.

## Reference Files

- `/tmp/openai-codex/codex-rs/tui/src/chatwidget.rs`
- `/tmp/openai-codex/codex-rs/tui/src/history_cell.rs`
- `/tmp/openai-codex/codex-rs/tui/src/exec_cell/render.rs`
- `/tmp/openai-codex/codex-rs/tui/src/bottom_pane/mod.rs`
- `/tmp/openai-codex/codex-rs/tui/src/bottom_pane/chat_composer.rs`

## Definition Of Identical

For Empyralis web, "identical" means the same lifecycle, cell structure, transparency model, and composer behavior translated into React. It does not mean copying Rust code directly.

The target architecture is:

- Committed transcript cells are stable history.
- One active turn projection mutates in place while a response streams.
- Canonical reloads update only committed history; they never delete active or pending turn projection.
- Tool, shell, file, search, approval, reasoning-summary, assistant, and error states are distinct typed cells.
- The composer behaves like Codex's bottom pane: Enter sends, Shift+Enter inserts a newline, Escape aborts an active stream, the send arrow becomes a filled stop square while running, and draft clearing happens immediately on submit.
- Permission prompts are first-class UI with keyboard choices and mouse buttons.
- Private hidden chain-of-thought is never exposed. Only reasoning summaries, activity lines, and concrete tool/action events are rendered.

## Codex Event Families

Codex routes protocol events into explicit UI cells instead of rendering one generic trace card.

| Codex event family | Codex UI behavior | Empyralis web mapping |
| --- | --- | --- |
| `TurnStarted`, `TurnComplete`, `TurnAborted` | Starts, flushes, or aborts the active cell lifecycle | stream status plus active turn id |
| `AgentMessageDelta`, final agent message | Streams assistant output into the active message cell | `assistant.message.delta`, `chunk`, `final` |
| `AgentReasoningDelta` and summary events | Updates a reasoning summary cell | `reasoning.summary.delta`, `thinking_step_payload` |
| `ExecCommandBegin`, `ExecCommandOutputDelta`, `ExecCommandEnd` | Creates and updates an exec cell with running/done/failed state | shell/terminal tool events from `tool.started`, `tool.result`, `direct_tool_step_payload` |
| `McpToolCallBegin`, `McpToolCallEnd` | Creates and finalizes a tool-call cell | `tool.started`, `tool.result` |
| `WebSearchBegin`, `WebSearchEnd` | Creates and finalizes a web-search cell | search events and web tool payloads |
| `ExecApprovalRequest`, `ApplyPatchApprovalRequest`, `RequestPermissions` | Shows an approval UI while preserving the composer | approval queue and approval cells |
| `PatchApplyBegin`, `PatchApplyEnd`, file changes | Shows file-change cells | file/tool step payloads |
| image generation/view image events | Shows media tool cells | image generation tool events |
| warnings/errors | Shows status or error cells without corrupting draft text | error/status cells and notices |

## Cell Contract

Empyralis should render transcript state as typed cells, not a mixed message array with ad-hoc metadata.

Required cell kinds:

- `user`
- `assistant`
- `reasoning_summary`
- `exec`
- `tool`
- `web_search`
- `file_change`
- `approval_request`
- `status`
- `error`

Required state shape:

- `committedCells`
- `activeCell`
- `activeTurnId`
- `streamStatus`
- `approvalQueue`
- `composerState`

The visible transcript is the composition of committed cells plus the active turn projection. A canonical refresh may replace committed cells, but it must not clear the active projection while a stream, persistence write, or abort finalization is in progress.

## Composer Contract

The composer is the single source of visible provider/runtime controls.

- Model and reasoning selector lives in the composer.
- Runtime status pill lives in the composer.
- Tools palette button lives in the composer.
- Send/stop control lives in the composer.
- No duplicated provider/status strip above the transcript.
- Error strings never enter the textarea draft.

## Approval Contract

Destructive or externally visible actions use an approval cell/overlay with:

- Allow once
- Allow for session
- Deny
- Keyboard shortcuts using numbered choices

Obvious non-destructive tool use, such as web search for factual questions, should not require approval.

## Phase Gates

- Lifecycle gate: 10 local DeepSeek messages, no disappearing/reappearing user messages, no false timeout banner after a successful response.
- Transcript gate: stream renders as typed cells, no "Run complete" or "Sage trace" cards in normal chat.
- Composer gate: Codex-style model/reasoning, runtime, tools, send/stop behavior.
- Transparency gate: tool/search/file/shell actions are visible inline; hidden chain-of-thought remains hidden.
- Cert gate: TypeScript, frontend build, Python compile, chat lifecycle tests, projection tests, provider catalog tests, and gateway online/offline tests pass.
