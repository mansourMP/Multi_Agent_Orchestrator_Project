# Empyralis Transparency System

## Implementation Status — Closed Pilot

### What's Complete

| Component | Status |
|-----------|--------|
| AgentTransparencyEvent model | Complete |
| Sage runtime emission | Complete — wired into handle_sage_chat |
| Studio test-turn emission | Complete — wired into DeployedAgentTestTurnResponse |
| Gateway execution emission | Complete — execute_tool_via_gateway, interrupt_tool_via_gateway |
| Channel trace_id repair | Complete — generated at inbound boundary |
| Event persistence | Complete — stored via activity ledger by trace_id |
| Visibility settings model | Complete — 5 levels, customer restrictions |
| Frontend Sage pills/timeline | Complete — AssistantCell in cell-components.tsx |
| Frontend Studio timeline | Complete — DeployedAgentTestTurnPane |
| Trace ID copy | Complete — CopyTraceIdButton in timeline |
| Raw CoT protection | Complete — backend + frontend |
| Secret redaction | Complete — AgentTransparencyEvent.__post_init__ |
| Customer visibility restricted | Complete — off/minimal only |

### Visibility Levels

| Level | UI Label | What's Shown | Audience |
|-------|----------|-------------|----------|
| off | Quiet | Final answer, approval prompt | Customer (default) |
| minimal | Basic | Simple status indicators | Customer (verbose) |
| standard | Normal | Tool/channel names, safety decisions, trace_id | Sage chat (default) |
| full | Detailed | Step timeline, summarized I/O, policy decisions | Studio test (default) |
| enterprise | Admin | Full audit trail, runtime session, quotas | Admin Activity page |

### Event Types (20)

user_message_received, memory_loaded, memory_excluded, planning_started,
tool_selected, tool_started, tool_completed, tool_failed,
approval_required, approval_approved, approval_denied,
gateway_action_started, gateway_action_completed,
channel_message_sent, channel_message_received,
policy_blocked, quota_blocked, unsafe_url_blocked,
final_response_started, final_response_sent

### Key Files

| File | Purpose |
|------|---------|
| `server_modules/agent_transparency_events.py` | Event model + visibility logic |
| `server_modules/sage_transparency_service.py` | Sage event emission |
| `server_modules/gateway_transparency_service.py` | Gateway event emission |
| `server_modules/deployed_agent_transparency_service.py` | Studio event emission |
| `server_modules/transparency_settings_service.py` | Settings model + store |
| `server_modules/transparency_event_store_service.py` | Persistence via activity ledger |
| `frontend/lib/workspace/transparency-timeline.tsx` | UI component |
| `frontend/lib/workspace/codex-chat/cell-components.tsx` | Sage chat integration |
| `frontend/lib/workspace/workstation-deployed-agent-test-turn-pane.tsx` | Studio integration |

### What's Never Shown

- Raw chain-of-thought / model internals
- Raw tool arguments
- Private memory contents
- Secrets / credentials / API keys
- Internal policy engine decisions
- Raw provider/model names in customer view

### Known Limitations

1. Gateway approval/channel paths have helpers but are not fully wired for live emission (helpers exist, await integration).
2. Settings are in-memory only — restart resets to defaults. DB-backed store is Phase 8H.
3. Admin activity page does not yet filter by trace_id. Phase 8G.
4. No dedicated settings UI in frontend yet. Phase 8H.
5. Per-channel transparency overrides not yet implemented.
