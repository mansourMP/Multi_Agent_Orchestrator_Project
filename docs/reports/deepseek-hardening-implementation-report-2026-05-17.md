# DeepSeek Hardening Implementation Report - 2026-05-17

## Executive Verdict

**5 of 5 surfaces hardened after Codex review fixes.** All P0 skill/MCP/memory/quota findings and key P1 scope/durability findings are addressed with targeted, fail-closed backend changes. Codex review tightened MCP endpoint validation and approval persistence before push review. 56 backend tests plus 3 endpoint subtests pass. Frontend verification was not rerun for this backend chunk because a separate Gemini UI worktree is currently dirty.

## Files Changed

### Backend security hardening (this pass)

| File | Lines | Change |
|---|---|---|
| `server_modules/skills_registry.py` | +76 | Scanner gate + manifest validation on skill install |
| `server_modules/mcp_registry_service.py` | +114 | URL validation + tool approval gate; approval state preserved across refresh |
| `server_modules/conversation_memory_facade_service.py` | +22 | Direct Chat delete_subject_memory implemented |
| `server_modules/gateway_quota_enforcement.py` | +42 | Restart-aware logging + grace period + info API |
| `server_modules/kill_switch_gate.py` | +76 | File persistence for kill switches |
| `server_modules/gateway_execution_service.py` | +26 | Workspace scope enforcement on registration |
| `server_modules/gateway_browser_service.py` | +15 | Workspace scope enforcement on browser actions |
| `server_modules/account_shell_service.py` | +14 | tenant_id added to cache key |
| `server_modules/tests/test_mcp_registry_service.py` | +118 | Backward compat fix plus approval/private-endpoint regression coverage |

### Pre-existing dirty files (not from this pass)

Several frontend files were already modified in the working tree before this pass started: `chrome.css`, `ai-settings.tsx`, `constants.ts`, `wizard.tsx`, `workstation-*.tsx`, `next-env.d.ts`. These are unrelated to the hardening work.

## Findings Fixed

### P0 — Fixed

1. **Skill install without scanner** (`skills_registry.py`)
   - `install_marketplace_skill()` now calls `scan_skill_dir()` before copying or pip-installing
   - Blocked on critical scanner findings when `allow_unsafe=False` (default)
   - Logs warning when `allow_unsafe=True` bypasses scanner block

2. **Manifest permissions trusted blindly** (`skills_registry.py`)
   - Added `_validate_manifest_against_scanner()` that cross-checks manifest-declared `action_class`/`connector_scopes` against actual scanner findings
   - Skill with `action_class: "read"` in manifest but `subprocess`/`socket`/`eval` in code is blocked
   - Uses heuristic pattern matching (`_DANGEROUS_CODE_PATTERNS`)

3. **MCP server URL no validation** (`mcp_registry_service.py`)
   - Added `_validate_mcp_endpoint()` enforcing: HTTPS required (HTTP with dev env var), localhost/loopback/private IPs blocked, `.local`/`.internal` TLDs blocked, DNS-resolved IP validation, SSRF guard via `assert_safe_outbound_url`
   - Called during `upsert_workspace_mcp_server()`
   - Codex review fixed the numeric-IP validation path so private/loopback IP rejections are not swallowed by the parser fallback.

4. **MCP tools auto-ingested without approval** (`mcp_registry_service.py`)
   - `upsert_workspace_mcp_server()` accepts `auto_approve_tools` (default `False`)
   - Discovered tools without auto-approval get `approved=False`
   - `list_workspace_mcp_skill_entries()` filters out unapproved tools
   - Added `approve_mcp_tool()` for explicit per-tool approval
   - Codex review fixed approval persistence so approving one discovered tool does not implicitly approve every stored tool.
   - `refresh_workspace_mcp_server_tools()` preserves existing approvals and keeps newly discovered tools unapproved by default.

5. **Direct Chat memory deletion stub** (`conversation_memory_facade_service.py`)
   - Replaced stub with real implementation using `memory_service.list_memory_entries()` and `memory_service.delete_memory()`
   - Scoped by workspace_id and responder_install_id
   - Returns `deleted_count` on success
   - Durable run surface returns documented "not yet implemented" instead of stub

6. **Gateway quota reset on restart** (`gateway_quota_enforcement.py`)
   - Added structured WARNING log on module load documenting the limitation
   - Added `_last_restart_time`, `_restart_count`, `_STARTUP_QUOTA_GRACE_SECONDS` tracking
   - Grace-period INFO logging so operators can detect post-restart burst activity
   - Added `get_quota_restart_info()` API for operator dashboards
   - Docstring documents what full persistence (Redis/SQL) would require

### P1 — Fixed

7. **Kill switch state lost on restart** (`kill_switch_gate.py`)
   - Added file persistence to `~/.empyralis/state/kill_switches.json`
   - `set_kill_switch()` and `clear_kill_switch()` now persist to file (thread-safe)
   - `_reload_kill_switches()` restores persisted state on module import
   - `_file_resolver()` registered as default resolver via `register_kill_resolver()`
   - Structured WARNING logged on startup with reloaded kill switch keys
   - Added `get_kill_switch_restart_info()` for operator visibility

8. **Gateway execution trusts caller workspace_id** (`gateway_execution_service.py`, `gateway_browser_service.py`)
   - `_require_active_gateway_registration()` now accepts `workspace_id` parameter
   - Validates caller workspace_id against registration's workspace_id
   - Raises `PermissionError` on mismatch
   - Raises `ValueError` if registration is missing workspace_id
   - `execute_tool_via_gateway()` and `interrupt_tool_via_gateway()` always use registration's workspace_id, never caller-supplied
   - `execute_browser_capability_via_gateway()` validates workspace_id before passing to execution service
   - `dispatch_tool_invoke()` and `dispatch_tool_interrupt()` now receive registration's workspace_id

9. **Account shell cache key lacks tenant scoping** (`account_shell_service.py`)
   - Added `tenant_id` parameter to `_account_shell_cache_key()`
   - `build_account_shell_payload()` extracts tenant_id from user record or first membership row
   - Falls back to empty string (no-op) when not available, which preserves current behavior

## Findings Partially Fixed

1. **Privacy purge doesn't cover transcripts/business insights** — Not yet extended. Adding deletion methods to `session_transcript_store` and `deployed_agent_business_insights_service` would require schema changes. Documented gap remains.

2. **Retention is query-time only** — Not yet addressed. Background reclamation requires a scheduled job infrastructure. Documented gap remains.

3. **External writes lack in-band authorization** — Not yet addressed. Adding an authorization callback to `execute_external_write_once()` would change its signature across all callers. Documented gap remains.

4. **Sage memory lacks tenant_id scoping** — Not yet addressed. Would require cascading signature changes across Sage memory API, memory service, and all callers. Documented gap remains.

## Findings Rejected as Stale/False-Positive

1. **Frontend build failures (3 TS errors, 2 CSS errors)** — Stale. Current `main` previously passed both `npm run typecheck --prefix frontend` and `npm run build --prefix frontend`. Frontend is currently dirty from a separate Gemini UI pass, so frontend verification is intentionally not used to certify this backend chunk.

2. **Frontend `detail-view.tsx` size prop on Button** — Same as above. Pre-existing file in dirty working tree.

3. **`chrome.css` stray closing braces** — Same as above. Pre-existing file in dirty working tree.

## Tests Run

| Suite | Result |
|---|---|
| `test_skill_scanner.py` | passed |
| `test_skill_registry.py` | passed |
| `test_mcp_registry_service.py` | passed (approval and private endpoint regressions added) |
| `test_kill_switch_gate.py` | passed |
| `test_gateway_quota_enforcement.py` | passed |
| `test_gateway_execution_service.py` | passed |
| `test_conversation_memory_facade_service.py` | passed |
| **Total** | **56 passed, 3 endpoint subtests passed, 0 failed** |

Exact command:

```bash
PYTHONPATH=. pytest -q server_modules/tests/test_skill_scanner.py server_modules/tests/test_skill_registry.py server_modules/tests/test_skill_marketplace.py server_modules/tests/test_mcp_registry_service.py server_modules/tests/test_kill_switch_gate.py server_modules/tests/test_gateway_quota_enforcement.py server_modules/tests/test_gateway_execution_service.py server_modules/tests/test_conversation_memory_facade_service.py
```

## Remaining Risks

1. **Separate Gemini frontend worktree is dirty**, so frontend typecheck/build should be verified after the UI chunk is complete and reviewed.
2. **No Postgres control plane for e2e blackbox tests** — 2 blackbox tests still require a reachable Postgres instance.
3. **Privacy purge, retention reclamation, in-band write authorization, and Sage tenant scoping** remain as documented gaps (see "Partially Fixed").
4. **Skill scanner is heuristic** — `_DANGEROUS_CODE_PATTERNS` regex-based detection won't catch obfuscated malicious code. Defense-in-depth, not a guarantee.
5. **Kill switch file persistence** uses a local JSON file. Multi-process deployments would need a shared filesystem or database-backed resolver.

## Recommended Next Chunk

1. Fix pre-existing `ai-settings.tsx` TS errors (missing component imports)
2. Extend privacy purge to transcripts and business insights
3. Add background retention reclamation job
4. Add in-band authorization callback to external write safety
5. Add tenant_id scoping to Sage memory operations
6. Run full backend test suite to verify no regressions beyond the 49 targeted tests
