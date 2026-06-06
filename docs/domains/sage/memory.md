# Sage Memory

Status: Active
Owner: Platform
Last verified: 2026-06-06
Source of truth: Sage memory services

## Sources Loaded Into Sage

`handle_sage_chat()` loads three persistent context sources before generation:

- Sage profile from `sage_profile_service.list_sage_profile()`.
- Sage memory from
  `sage_memory_service.build_sage_memory_context_block(include_restricted=False)`.
- Workspace context files from
  `workspace_context.read_workspace_context_files()`, compiled by
  `sage_instruction_compiler_service.build_root_memory_brief_sections()`.

Sources: `server_modules/sage_agent_runtime_service.py`.

## Context Files

`/api/sage-context-files` lists all workspace context files for viewers and
`PATCH /api/sage-context-files/{filename}` writes one file for members after
workspace access enforcement. Invalid filenames are returned as HTTP 400 from
the route. Source: `server_modules/sage_context_files_api.py`.

Context files are workspace-scoped files, not a general filesystem browser.
Tests prove list/update behavior, invalid filename handling, cross-workspace
blocking, and inclusion of nested memory files such as `memory/2026-05-10.md`.
Source: `server_modules/tests/test_sage_context_files_api.py`.

## Sage Memory API

`/api/sage-memory` lists memory for viewers. Create, update, delete, and pin
routes require member access. Export requires member access and emits a security
audit with counts only. Wipe requires owner access and emits a security audit
with deleted-count metadata. Source: `server_modules/sage_memory_api.py`.

Tests cover route workspace enforcement, create actor propagation, storage
policy shape, export audit counts without content, and owner-only wipe. Source:
`server_modules/tests/test_sage_memory_api.py`.

## Persistence

Every successful `handle_sage_chat()` turn attempts to persist the interaction
through `conversation_memory_facade_service.persist_interaction()` using the
`DIRECT_CHAT_PROFILE` policy and metadata containing `trace_id`, `source`, and
optional `channel_context`. Persistence failure is best-effort and does not fail
the chat response. Source: `server_modules/sage_agent_runtime_service.py`.

## Sensitivity

The Sage runtime loads memory with `include_restricted=False` and redacts the
prompt envelope through `secret_redaction_service.redact_text()`. Tests cover
restricted memory exclusion and prompt redaction. Sources:
`server_modules/sage_agent_runtime_service.py` and
`server_modules/tests/test_sage_agent_runtime_service.py`.

Not implemented in the inspected code: `/api/sage/chat` does not return
`memory_updates`; the current result shape returns an empty list.
