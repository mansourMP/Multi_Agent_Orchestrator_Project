# Empyralis Sage — Professional Implementation Plan

Date: 2026-05-30
Target: Make Empyralis Sage as powerful as OpenClaw 2026.5.27
Branch: feature/website-portal

## Executive Summary

This plan addresses 16 capability gaps identified in the OpenClaw-Sage gap analysis. The work is organized into four phases, ordered by impact-to-effort ratio. Each phase delivers a shippable increment that makes Sage provably more capable.

**Total new files:** ~18
**Total modified files:** ~28
**Estimated effort:** Phase 1 (1-2 weeks), Phase 2 (2-3 weeks), Phase 3 (3-4 weeks), Phase 4 (2-3 weeks)

---

## Phase 1: Foundation — Quick Wins With High User Impact

**Goal:** Ship the features that make Sage feel "alive" — memory consolidation, approval presets, session lifecycle, and diagnostics.

### Task 1.1: Memory Dreaming Pipeline

**Why:** OpenClaw's most distinctive capability. Sage already has consolidation staging in `memory/.dreams/` and a `consolidate_daily_memory_notes()` function. The missing piece is an automated multi-stage cycle.

**Files to create:**

| File | Purpose |
|---|---|
| `server_modules/sage_dreaming_pipeline.py` | Three-stage pipeline: Light sleep (dedup), REM sleep (cross-reference), Deep sleep (promotion/pruning) |
| `server_modules/sage_dreaming_state.py` | Per-workspace state tracking: last run timestamps, access counters, processed entry set, cross-reference graph |

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/memory_service.py` | Add `dreaming_light_sleep()`, `dreaming_rem_sleep()`, `dreaming_deep_sleep()`, `dreaming_status()`, `dreaming_history()`, `dreaming_entry_access_count()` |
| `server_modules/sage_memory_service.py` | Add `dreaming_deduplicate_sage_memory()`, `dreaming_promote_entry()`, `dreaming_demote_entry()`, `dreaming_prune_entries()`, `dreaming_cross_reference()`, `dreaming_access_count()`, `dreaming_apply_promotions()`. Modify `_read_state()` to track access count metadata |
| `server_modules/bounded_scheduler_service.py` | Add `dreaming_cycle` trigger kind with extended runtime allowance and quiet-hours-aware scheduling |
| `server_modules/sage_heartbeat_service.py` | Register dreaming cycle as recurring job (Light daily at 2 AM, REM weekly, Deep monthly). Add dreaming status to heartbeat snapshot |

**Pipeline stages:**

1. **Light Sleep** (runs daily): Deduplicate Sage memory entries within each category (Jaccard similarity >85%). Filter daily notes vs noise using existing heuristic. Cluster similar entries. Write staging proposals to `memory/.dreams/`.

2. **REM Sleep** (runs weekly): Cross-reference Sage memory across categories. Find connections between `safe_general` and `sensitive` entries. Cross-walk daily logs for repeated themes. Generate REFLECTION.md content. Extract patterns with usage-frequency scoring.

3. **Deep Sleep** (runs monthly): Promote frequently-accessed entries to higher categories. Demote entries unused for 30+ days. Prune stale unpinned entries. Merge consolidated results into root context files (MEMORY.md, REFLECTION.md, GOALS.md, PROCEDURES.md).

---

### Task 1.2: Policy Presets

**Why:** OpenClaw has `yolo`, `cautious`, and `deny-all` presets. Sage has 5 autonomy modes but no one-click presets. This is the highest-impact/lowest-effort gap.

**Files to create:**

| File | Purpose |
|---|---|
| `server_modules/policy_presets.py` | Three presets with `resolve_preset(name) -> PolicyPreset` and `apply_preset(preset, config)` |

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/agent_computer_policy_service.py` | Add `AUTONOMY_YOLO` to `AUTONOMY_MODES`. YOLO: all capabilities allowed, no domain filtering, full network, no credential restrictions, terminal=browser=allow |
| `server_modules/capability_risk_classifier_service.py` | Add YOLO override flag forcing all capabilities to `low` risk |
| `server_modules/computer_action_safety.py` | Expose `allow_all_dangerous` for YOLO mode |

**Preset definitions:**

| Preset | Description | Approvals | Tools | Browser | Terminal | Network |
|---|---|---|---|---|---|---|
| `yolo` | Maximum autonomy — no safety filters | None | All allowed | Full access, no domain filter | All commands | Unrestricted |
| `cautious` | Balanced — approval for writes | Write/execute only | Reads auto, writes require approval | Read-only auto, clicks/fills require approval | Allowlist only | Outbound only |
| `deny-all` | Read-only — no tool execution | Everything | All blocked | None | None | None |

---

### Task 1.3: Session Lifecycle Automation

**Why:** OpenClaw automatically resets sessions daily, prunes idle sessions, and enforces retention. Sage has TTL-based expiration but no automated lifecycle management.

**Files to create:**

| File | Purpose |
|---|---|
| `server_modules/session_lifecycle_service.py` | Auto-reset rules (max turns, max age, idle timeout), idle pruning daemon, retention enforcement |

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/session_service.py` | Add `auto_reset_session()` for turn history clearing and memory compaction. Add `prune_expired_sessions()` |
| `server_modules/session_manager/manager.py` | Add `reset_session()` for archiving current turns + fresh state. Add configurable per-session `max_turns` enforcement in `iter_turn_events` |

**Lifecycle rules (configurable per workspace):**
- Auto-reset: after N turns (default 100) or after N hours of inactivity (default 24)
- Idle pruning: sessions idle >7 days are compacted and archived
- Retention: turn history retained per retention preset (short=30d, standard=365d, extended=730d)
- Max turns per thread: configurable limit with graceful cutoff

---

### Task 1.4: Diagnostics Export

**Why:** OpenClaw has `openclaw diagnostics export` producing a support zip. Sage has health diagnostics but no exportable bundle.

**Files to create:**

| File | Purpose |
|---|---|
| `server_modules/session_diagnostics_service.py` | `export_session_trace(session_id)`, `export_session_diagnostics(session_id)`, `export_diagnostics_bundle(workspace_id)` |

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/session_manager/manager.py` | Add `export_trace()` dumping all turn records, timestamps, error history, runtime cache state |
| `server_modules/runtime_config.py` | Add routes: `/api/diagnostics/sessions/{id}/export`, `/api/diagnostics/workspace/{id}/bundle` |

**Bundle contents:**
- Manifest (workspace config summary, provider configs, active agents)
- Session traces (turn history, timing, errors)
- Gateway state snapshot (health, paired devices, browser sessions)
- Logs (recent activity, errors)
- Config dump (redacted secrets)

---

## Phase 2: Infrastructure — Sandbox & Execution Hardening

**Goal:** Add Docker sandbox for safe code execution, browser state emulation, and cron retry.

### Task 2.1: Docker Execution Sandbox

**Why:** OpenClaw sandboxes non-main sessions in Docker, SSH, or OpenShell. Sage uses macOS `sandbox-exec` only — no isolation on Linux, no Docker support.

**Files to create:**

| File | Purpose |
|---|---|
| `server_modules/docker_execution_sandbox.py` | Docker container lifecycle: pull image, create with `--memory`, `--cpus`, `--read-only`, `--cap-drop ALL`, `--network none`, run worker, collect output, cleanup |
| `server_modules/docker_sandbox_config.py` | Image definitions, Dockerfile templates, platform detection, image caching |

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/execution_sandbox_service.py` | Add `docker` driver option. New `_docker_worker_command()`, `_run_docker_worker()`. Update `hosted_secure_driver()` to detect Docker CLI. Add `workspace_kind: ephemeral_container` |
| `server_modules/hosted_secure_worker.py` | Docker-aware env setup — detect container environment, adjust resource limits to match Docker cgroup limits |
| `server_modules/agent_computer_policy_service.py` | Add `sandbox_type` field (`auto`, `sandbox_exec`, `docker`, `subprocess`) |
| `server_modules/runtime_policy.py` | Add Docker execution target to `build_browser_execution_binding()` |

**Docker sandbox parameters:**
- Memory limit: configurable per policy (default 512MB)
- CPU limit: 1 core, 20s timeout
- Read-only root filesystem
- No network access by default
- Capability drop: ALL
- Non-root user
- Ephemeral workspace volume mounted for input/output

---

### Task 2.2: Browser Instrumentation

**Why:** The browser engine is functional but lacks runtime introspection that OpenClaw has — console capture, network failure monitoring, full AX tree, cookie/storage inspection.

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/browser_engine.py` | Add `page.on("console")` listener to capture browser console output. Add `page.on("requestfailed")` listener for network failure capture. Add `snapshot_accessibility_tree()` using Playwright's `page.accessibility.snapshot()`. Add `page.context().cookies()` and `page.evaluate("localStorage")` / `page.evaluate("sessionStorage")` for cookie/storage access |
| `server_modules/browser_checkpoint_service.py` | Data models already support `console_entries` and `network_failures` fields — wire them up to actual capture |

**New browser capabilities:**
- `browser.console.capture` — capture browser console logs by level (error, warn, info, log)
- `browser.network.capture` — capture failed requests with URL, status, error
- `browser.cookies.get` / `browser.cookies.set` / `browser.cookies.clear`
- `browser.storage.get` / `browser.storage.set` / `browser.storage.clear`
- `browser.accessibility.snapshot` — full AX tree for screen-reader compatibility

---

### Task 2.3: Cron Retry with Backoff

**Why:** OpenClaw has exponential backoff on cron failures (30s → 1m → 5m → 15m → 60m). Sage's bounded scheduler has no retry logic.

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/bounded_scheduler_service.py` | Add `RetryPolicy` dataclass with `max_retries`, `base_delay_seconds`, `max_delay_seconds`, `backoff_multiplier`. Add `compute_retry_delay(attempt, policy) -> int`. Modify `finalize_wake_requests()` to re-queue on failure with delay. Add retry state tracking to wake request metadata |

**Retry configuration:**
- Base delay: 30 seconds
- Max delay: 60 minutes
- Multiplier: 2x per attempt
- Max retries: 5 per job
- Reset retry count: after successful run

---

## Phase 3: Extensibility — Hooks, Plugins, CLI, ACP

**Goal:** Make Empyralis extensible — a platform others can build on.

### Task 3.1: Hook System

**Why:** OpenClaw has a full plugin SDK with event hooks. Sage has no extension mechanism — all pipeline behavior is hard-coded.

**Files to create:**

| File | Purpose |
|---|---|
| `server_modules/plugin_system/__init__.py` | Public API exports, plugin bootstrapping |
| `server_modules/plugin_system/hook_points.py` | `HookPoint` enum, `HookContext` dataclass, `HookResult` dataclass |
| `server_modules/plugin_system/hook_registry.py` | `HookRegistry` with `register()`, `execute()`, priority ordering, abort short-circuit |
| `server_modules/plugin_system/plugin_base.py` | Abstract `Plugin` base class with typed methods |

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/direct_chat_generation_service.py` | Inject `HookRegistry` calls at pipeline points: before LLM, on stream delta, on result, before tool execution, on final response |
| `server_modules/session_manager/manager.py` | Hook into `iter_turn_events` around turn lifecycle |

**Hook points:**

| Hook | Trigger | Context | Can Modify | Can Abort |
|---|---|---|---|---|
| `LLM_INPUT` | Before messages sent to provider | `messages`, `system_prompt`, `tools`, `session_ctx` | messages, system_prompt | Yes |
| `LLM_OUTPUT` | After provider response received | `reply`, `tool_calls`, `usage` | reply | No |
| `TOOL_CALL` | Before tool execution | `tool_name`, `arguments` | arguments | Yes |
| `TOOL_RESULT` | After tool result | `tool_name`, `result` | result | No |
| `AGENT_START` | Before turn begins | `session_ctx`, `message` | message | Yes |
| `AGENT_END` | After turn completes | `session_ctx`, `reply`, `trace` | None | No |

---

### Task 3.2: CLI Companion

**Why:** OpenClaw is CLI-first. Sage is web-only. A CLI companion dramatically expands the developer audience.

**Files to create:**

| File | Purpose |
|---|---|
| `scripts/empyralis` | Entry-point shell script |
| `server_modules/cli_companion_service.py` | CLI turn processing, streaming SSE consumption, session persistence |

**Implementation (Tier 1 → Tier 3):**

**Tier 1 — REST Wrapper (immediate):**
- Wraps `POST /api/runs/turn` with `{"workspace_id": "...", "message": "...", "channel": "cli"}`
- Reads API key from `~/.empyralis/api_key`
- Stores session ID in `~/.empyralis/session`
- Commands: `empyralis chat "message"`, `empyralis status`, `empyralis login`
- **No server changes required**

**Tier 2 — Streaming (when needed):**
- Consume SSE stream from `/turn` with `response_mode: "stream"`
- Print tokens as they arrive, handle Ctrl+C
- Still no server changes

**Tier 3 — Local Tools (future):**
- Register CLI machine as a gateway using `gateway_protocol_service` WebSocket
- Access local tool execution (`tool.invoke`), shell commands, file system
- Requires gateway protocol client + device link auth flow

---

### Task 3.3: ACP Bridge (IDE Integration)

**Why:** OpenClaw bridges into Codex, Claude Code, and Zed via ACP. Sage has no IDE presence.

**Files to create:**

| File | Purpose |
|---|---|
| `server_modules/acp_bridge_service.py` | ACP protocol handler: frame translation, session mapping, auth, message routing |

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/gateway_protocol_service.py` | Add ACP frame type support alongside existing `request`/`response`/`event` kinds |
| Add new FastAPI router for ACP connections | SSE or WS endpoint accepting ACP clients |

**ACP bridge architecture:**
```
[VS Code / Zed / Codex] --(ACP)--> [Empyralis ACP Bridge] --(Gateway Protocol)--> [Sage Chat Pipeline]
```
- Translate ACP `agent.turn` → gateway `tool.invoke`
- Map ACP session IDs to gateway session IDs
- Auth: ACP token → device-link/API-key
- Delegate to existing `dispatch_tool_invoke()` / `dispatch_tool_interrupt()` / Sage chat

---

## Phase 4: Advanced — Cross-Cutting Capabilities

**Goal:** Browser state emulation, observability enhancements, and edge-case hardening.

### Task 4.1: Browser State Emulation

**Why:** OpenClaw can emulate viewport, offline, dark/light, timezone, locale, geolocation, device, and custom headers. Sage has none of this.

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/browser_engine.py` | Add browser context configuration: viewport size, color scheme (dark/light), timezone (`locale.timezone`), locale (`locale.lang`), geolocation (`latitude`, `longitude`, `accuracy`), device scale factor, user agent override, extra HTTP headers, offline mode |
| `server_modules/gateway_browser_service.py` | Pass emulation config through browser session creation |

**New emulation API parameters (on browser session creation):**
```json
{
  "viewport": {"width": 1280, "height": 720},
  "color_scheme": "dark",
  "timezone": "America/New_York",
  "locale": "en-US",
  "geolocation": {"latitude": 40.7128, "longitude": -74.006},
  "device_scale_factor": 2,
  "user_agent": "...",
  "extra_http_headers": {"X-Custom": "value"},
  "offline": false
}
```

---

### Task 4.2: Additional Observability

**Why:** Fill remaining observability gaps from OpenClaw.

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/sage_heartbeat_service.py` | Add dreaming status, retry queue status, plugin health to heartbeat snapshot |
| `server_modules/doctor_gate.py` | Add Docker availability check, browser introspection check, ACP bridge status |

**New observability endpoints:**
- `/api/health/plugins` — plugin load status, hook registration counts, last errors
- `/api/health/dreaming` — last pipeline run timestamps, entry counts, promotion/demotion log
- `/api/health/retries` — pending retry queue, recent failure summary

---

### Task 4.3: Edge Case Hardening

**Files to modify:**

| File | Changes |
|---|---|
| `server_modules/response_leak_guard_service.py` | Gate safety checks by policy preset level (skip for YOLO) |
| `server_modules/direct_chat_response_service.py` | Add `/export-trajectory` slash command (OpenClaw parity) |
| `server_modules/direct_chat_service.py` | Add provider preflight checks before isolated runs (OpenClaw parity) |
| `server_modules/direct_chat_provider_service.py` | Add failure delivery routing for cron jobs |

---

## Dependency Graph

```
Phase 1 (Foundation)
├── 1.1 Memory Dreaming ─────────── depends on: (none)
├── 1.2 Policy Presets ──────────── depends on: (none)
├── 1.3 Session Lifecycle ───────── depends on: (none)
└── 1.4 Diagnostics Export ──────── depends on: 1.3

Phase 2 (Infrastructure)
├── 2.1 Docker Sandbox ──────────── depends on: 1.2 (policy presets for sandbox_type)
├── 2.2 Browser Instrumentation ─── depends on: (none)
└── 2.3 Cron Retry ──────────────── depends on: (none)

Phase 3 (Extensibility)
├── 3.1 Hook System ─────────────── depends on: (none)
├── 3.2 CLI Companion ───────────── depends on: (none, Tier 1 is zero-server-change)
└── 3.3 ACP Bridge ──────────────── depends on: 3.1 (hooks) + gateway_protocol

Phase 4 (Advanced)
├── 4.1 Browser Emulation ───────── depends on: 2.2
├── 4.2 Observability ───────────── depends on: 1.1, 1.4, 3.1
└── 4.3 Edge Cases ──────────────── depends on: 1.2, 2.3
```

---

## Parallelizable Work

Within each phase, tasks can run in parallel (no file conflicts):

| Phase | Parallel Groups |
|---|---|
| Phase 1 | (1.1 + 1.2) parallel, (1.3 + 1.4) parallel |
| Phase 2 | All three tasks independent |
| Phase 3 | 3.1 first (unblocks 3.3), 3.2 fully independent |
| Phase 4 | All three independent |

---

## Success Metrics

| Metric | Before | After (Phase 1) | After (Phase 4) |
|---|---|---|---|
| Memory consolidation | Manual only, one-shot | Automated daily dreaming cycle | LLM-powered synthesis |
| Policy preset count | 5 modes, no presets | 3 one-click presets | User-defined custom presets |
| Session auto-reset | No | Daily/idle/max-turns | Per-workspace configurable |
| Sandbox isolation | macOS sandbox-exec only | + Docker container isolation | + SSH remote sandbox |
| Browser introspection | DOM only | Console, network, AX, cookies/storage | State emulation |
| Extension points | 0 (hard-coded pipeline) | 6 hook points | Plugin SDK |
| CLI access | Web only | REST wrapper CLI | Full CLI with local tools |
| IDE integration | None | None | ACP bridge (VS Code, Zed, Codex) |
| Cron reliability | Fire-and-forget | Exponential backoff retry | + Failure routing |
| Diagnostics | Health endpoints only | Exportable support bundle | + Plugin/retry/dreaming health |

---

## Files Summary

### New Files (18)

```
server_modules/
├── sage_dreaming_pipeline.py          # Phase 1.1
├── sage_dreaming_state.py             # Phase 1.1
├── policy_presets.py                  # Phase 1.2
├── session_lifecycle_service.py       # Phase 1.3
├── session_diagnostics_service.py     # Phase 1.4
├── docker_execution_sandbox.py        # Phase 2.1
├── docker_sandbox_config.py           # Phase 2.1
├── plugin_system/
│   ├── __init__.py                    # Phase 3.1
│   ├── hook_points.py                 # Phase 3.1
│   ├── hook_registry.py               # Phase 3.1
│   └── plugin_base.py                 # Phase 3.1
├── cli_companion_service.py           # Phase 3.2
└── acp_bridge_service.py              # Phase 3.3

scripts/
└── empyralis                          # Phase 3.2
```

### Modified Files (28)

```
server_modules/
├── memory_service.py                  # Phase 1.1
├── sage_memory_service.py             # Phase 1.1
├── bounded_scheduler_service.py       # Phase 1.1, 2.3
├── sage_heartbeat_service.py          # Phase 1.1, 4.2
├── agent_computer_policy_service.py   # Phase 1.2, 2.1
├── capability_risk_classifier_service.py # Phase 1.2
├── computer_action_safety.py          # Phase 1.2
├── session_service.py                 # Phase 1.3
├── session_manager/manager.py         # Phase 1.3, 1.4
├── runtime_config.py                  # Phase 1.4
├── execution_sandbox_service.py       # Phase 2.1
├── hosted_secure_worker.py            # Phase 2.1
├── runtime_policy.py                  # Phase 2.1
├── browser_engine.py                  # Phase 2.2, 4.1
├── browser_checkpoint_service.py      # Phase 2.2
├── gateway_browser_service.py         # Phase 4.1
├── direct_chat_generation_service.py  # Phase 3.1
├── direct_chat_response_service.py    # Phase 4.3
├── direct_chat_service.py             # Phase 4.3
├── direct_chat_provider_service.py    # Phase 4.3
├── gateway_protocol_service.py        # Phase 3.3
├── response_leak_guard_service.py     # Phase 4.3
├── doctor_gate.py                     # Phase 1.4, 4.2
├── routes_gateway.py                  # Phase 1.2 (policy preset wiring)
├── runtime_runs_api.py                # Phase 3.2
├── auth.py                            # Phase 3.2
└── sage_agent_runtime_service.py      # Phase 1.1 (dreaming cycle registration)
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Docker sandbox breaks existing sandbox-exec paths | Low | High | Feature-flag `docker` driver behind config toggle, keep `sandbox-exec` as default |
| Dreaming pipeline corrupts memory state | Medium | High | All mutations write through staging files first; rollback via existing versioning |
| Hook system degrades chat latency | Medium | Medium | Hook execution is synchronous but timeout-gated (default 500ms per hook); short-circuit on abort |
| ACP protocol mismatch with upstream changes | High | Medium | Vendor ACP spec version; pin and test against specific client versions |
| CLI auth model confusion | Low | Low | Tier 1 uses existing API key auth — no new auth paths |
