"""
Sage / Main Agent transparency event emission.

Wraps the AgentTransparencyEvent model and emits events for the real
stages that exist in the Sage turn lifecycle.  Never exposes raw
chain-of-thought, private memory content, or model internals.

Callers should:

    from server_modules.sage_transparency_service import (
        emit_sage_turn_transparency_events,
    )

    events = emit_sage_turn_transparency_events(
        trace_id=result["trace_id"],
        workspace_id=workspace_id,
        user_message=message,
        sage_result=result,
        surface="chat",
        audience="owner",
        visibility_level="standard",
    )

The returned list[AgentTransparencyEvent] can be serialised and sent to
the frontend via the existing SSE / chat response envelope.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from server_modules.agent_transparency_events import (
    AgentTransparencyEvent,
    Audience,
    TransparencyEventType,
    VisibilityLevel,
)

# ── helpers ──────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_label(value: Any) -> str:
    return str(value or "").strip()


def _safe_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    return []


# ── public entry point ───────────────────────────────────────────────

def emit_sage_turn_transparency_events(
    *,
    trace_id: str,
    workspace_id: str,
    user_message: str,
    sage_result: Dict[str, Any],
    surface: str = "chat",
    audience: Audience = "owner",
    visibility_level: VisibilityLevel = "standard",
    agent_id: Optional[str] = None,
) -> List[AgentTransparencyEvent]:
    """
    Emit one transparency event per real stage present in the Sage result.

    Only stages with real data are emitted — no fake / placeholder events.
    """
    events: List[AgentTransparencyEvent] = []
    ts = _now()
    msg_text = _safe_label(user_message)

    # ── 1. user_message_received ─────────────────────────────────
    if msg_text:
        events.append(
            AgentTransparencyEvent(
                event_id=f"stevt-{uuid4().hex[:12]}",
                trace_id=trace_id,
                workspace_id=workspace_id,
                agent_id=agent_id,
                actor_type="sage",
                surface=surface if surface in ("chat", "channel") else "chat",
                audience=audience,
                visibility_level=visibility_level,
                event_type="user_message_received",
                title="Message received",
                summary=f"User message: {msg_text[:200]}",
                status="completed",
                timestamp=ts,
            )
        )

    # ── 2. memory_loaded ─────────────────────────────────────────
    used_context = _safe_list(sage_result.get("used_context"))
    if used_context:
        context_labels = [
            _safe_label(ctx.get("name") or ctx.get("source"))
            for ctx in used_context
            if isinstance(ctx, dict)
        ]
        if context_labels:
            events.append(
                AgentTransparencyEvent(
                    event_id=f"stevt-{uuid4().hex[:12]}",
                    trace_id=trace_id,
                    workspace_id=workspace_id,
                    agent_id=agent_id,
                    actor_type="sage",
                    surface="chat",
                    audience=audience,
                    visibility_level=visibility_level,
                    event_type="memory_loaded",
                    title="Memory loaded",
                    summary=f"Loaded: {', '.join(context_labels[:5])}",
                    status="completed",
                    timestamp=_now(),
                    memory_scope="workspace",
                    metadata={"context_labels": context_labels[:5]},
                )
            )

    # ── 3. blocked_tools ─────────────────────────────────────────
    blocked_tools = _safe_list(sage_result.get("blocked_tools"))
    if blocked_tools:
        events.append(
            AgentTransparencyEvent(
                event_id=f"stevt-{uuid4().hex[:12]}",
                trace_id=trace_id,
                workspace_id=workspace_id,
                agent_id=agent_id,
                actor_type="sage",
                surface="chat",
                audience=audience,
                visibility_level=visibility_level,
                event_type="policy_blocked",
                title="Tools blocked by policy",
                summary=f"{len(blocked_tools)} tool(s) blocked",
                status="blocked",
                timestamp=_now(),
                metadata={"blocked_tools": blocked_tools[:10]},
            )
        )

    # ── 4. tool_calls (started / completed / failed) ─────────────
    tool_calls = _safe_list(sage_result.get("tool_calls"))
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        tc_name = _safe_label(tc.get("name") or tc.get("tool_name"))
        tc_status = _safe_label(tc.get("status") or "completed")
        tc_error = _safe_label(tc.get("error") or tc.get("error_message") or "")
        if not tc_name:
            continue

        if tc_status in ("completed", "success", "done"):
            events.append(
                AgentTransparencyEvent(
                    event_id=f"stevt-{uuid4().hex[:12]}",
                    trace_id=trace_id,
                    workspace_id=workspace_id,
                    agent_id=agent_id,
                    actor_type="sage",
                    surface="chat",
                    audience=audience,
                    visibility_level=visibility_level,
                    event_type="tool_completed",
                    title=f"Tool completed: {tc_name}",
                    summary=f"Tool {tc_name} completed successfully.",
                    status="completed",
                    timestamp=_now(),
                    tool_name=tc_name,
                )
            )
        elif tc_status in ("failed", "error"):
            events.append(
                AgentTransparencyEvent(
                    event_id=f"stevt-{uuid4().hex[:12]}",
                    trace_id=trace_id,
                    workspace_id=workspace_id,
                    agent_id=agent_id,
                    actor_type="sage",
                    surface="chat",
                    audience=audience,
                    visibility_level=visibility_level,
                    event_type="tool_failed",
                    title=f"Tool failed: {tc_name}",
                    summary=f"Tool {tc_name} failed: {tc_error[:200]}" if tc_error else f"Tool {tc_name} failed.",
                    status="failed",
                    timestamp=_now(),
                    tool_name=tc_name,
                )
            )
        else:
            events.append(
                AgentTransparencyEvent(
                    event_id=f"stevt-{uuid4().hex[:12]}",
                    trace_id=trace_id,
                    workspace_id=workspace_id,
                    agent_id=agent_id,
                    actor_type="sage",
                    surface="chat",
                    audience=audience,
                    visibility_level=visibility_level,
                    event_type="tool_started",
                    title=f"Tool started: {tc_name}",
                    summary=f"Tool {tc_name} is running.",
                    status="running",
                    timestamp=_now(),
                    tool_name=tc_name,
                )
            )

    # ── 5. approvals_required ───────────────────────────────────
    approvals_required = _safe_list(sage_result.get("approvals_required"))
    if approvals_required:
        events.append(
            AgentTransparencyEvent(
                event_id=f"stevt-{uuid4().hex[:12]}",
                trace_id=trace_id,
                workspace_id=workspace_id,
                agent_id=agent_id,
                actor_type="sage",
                surface="chat",
                audience=audience,
                visibility_level=visibility_level,
                event_type="approval_required",
                title="Approval required",
                summary=f"{len(approvals_required)} action(s) need approval",
                status="running",
                timestamp=_now(),
                metadata={"approval_count": len(approvals_required)},
            )
        )

    # ── 6. error / llm failure ──────────────────────────────────
    sage_error = _safe_label(sage_result.get("error"))
    if sage_error:
        events.append(
            AgentTransparencyEvent(
                event_id=f"stevt-{uuid4().hex[:12]}",
                trace_id=trace_id,
                workspace_id=workspace_id,
                agent_id=agent_id,
                actor_type="sage",
                surface="chat",
                audience=audience,
                visibility_level=visibility_level,
                event_type="tool_failed",
                title="Sage encountered an error",
                summary="Sage was unable to complete this request.",
                status="failed",
                timestamp=_now(),
                metadata={"error_class": sage_error.split(":")[0][:100]},
            )
        )

    # ── 7. final_response_sent ──────────────────────────────────
    reply_text = _safe_label(sage_result.get("message"))
    if reply_text:
        events.append(
            AgentTransparencyEvent(
                event_id=f"stevt-{uuid4().hex[:12]}",
                trace_id=trace_id,
                workspace_id=workspace_id,
                agent_id=agent_id,
                actor_type="sage",
                surface="chat",
                audience=audience,
                visibility_level=visibility_level,
                event_type="final_response_sent",
                title="Response sent",
                summary=f"Sage replied ({len(reply_text)} chars)",
                status="completed",
                timestamp=_now(),
                metadata={"response_length": len(reply_text)},
            )
        )

    return events


def events_to_payloads(
    events: List[AgentTransparencyEvent],
    *,
    audience: Audience = "owner",
) -> List[Dict[str, Any]]:
    """Convert a list of events into serialisable payloads for the given audience."""
    return [evt.to_user_payload() if audience != "customer" else evt.to_customer_payload() for evt in events]
