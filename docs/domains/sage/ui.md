# Sage UI

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: frontend chat code

## Streaming Lifecycle

`frontend/lib/workspace/workstation-chat-pane.tsx` implements a projected active
turn while the response streams. On send it clears the draft, creates or reuses
a session, persists the user turn, starts a stream, and updates live timeline
events from `trace`, `step`, `response`, `chunk`, and `final` events.

`chunk` and `response` deltas append to `streamingAssistantText`; `final`
replaces it with the final visible reply when present. Escape aborts the stream,
and stalled responses are stopped with a retryable notice.

## Typed Message Rows

`frontend/lib/workspace/chat-message.tsx` renders:

- normal user and assistant rows
- `thinking_row` with expandable reasoning summary text after filtering
  synthetic/internal markers
- `tool_row`, `file_row`, `search_row`, and `activity_step` system rows
- `provider_error` rows with a "Sage route needs attention" surface
- incomplete assistant rows with an `Incomplete` status

Provider/model metadata is shown in message meta. If billing source is
`empyralis_credits`, the UI displays the public AI label and Workspace AI
instead of raw provider details.

## Scroll And Draft Behavior

The pane tracks whether the transcript should stick to the bottom, forces stick
on submit, shows a jump affordance when the user is not at the bottom, and can
scroll to the latest transcript entry. Source:
`frontend/lib/workspace/workstation-chat-pane.tsx`.

Draft text is cleared immediately on submit. Errors and provider/runtime
notices are rendered as status/failure notices, not inserted back into the
textarea.

## Agent Computer Label

The composer/header includes an Agent Computer selector and permission menu.
When local tooling is unavailable the label is `Agent Computer offline`; when a
runtime target is selected it shows the selected Agent Computer label/status.
Source: `frontend/lib/workspace/workstation-chat-pane.tsx`.

## Channel Messages

Not implemented in the inspected UI code: a distinct transcript row type for
personal-channel inbound messages. Personal-channel context can be present in
Sage turn metadata server-side, but this chat renderer only handles generic
message/system row metadata.
