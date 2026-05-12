"""
Minimal persistence for transparency events.

Stores redacted transparency event payloads in the existing activity
ledger as activity events with event_class="transparency_event".
No new database tables required — events are retrievable by trace_id
via the existing activity ledger query infrastructure.

Persistence failure must never break the agent response.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from server_modules import activity_ledger_service


async def persist_transparency_events(
    *,
    trace_id: str,
    workspace_id: str,
    events: List[Dict[str, Any]],
    surface: str = "chat",
    audience: str = "owner",
) -> int:
    """
    Persist a batch of transparency events into the activity ledger.

    Returns the number of events successfully stored.  Exceptions are
    silently caught — persistence failure must not break the response.
    """
    stored = 0
    tid = str(trace_id or "").strip()
    if not tid or not events:
        return 0

    for evt in events:
        try:
            await activity_ledger_service.append_activity_event(
                tenant_id="",
                workspace_id=str(workspace_id or "").strip(),
                actor_type="system",
                actor_id=f"transparency:{tid}",
                event_class="transparency_event",
                detail_level="standard",
                action=str(evt.get("event_type") or "transparency_event"),
                title=str(evt.get("title") or "")[:200],
                summary=str(evt.get("summary") or "")[:500],
                status=str(evt.get("status") or "completed"),
                trace_id=tid,
                channel=str(evt.get("channel") or surface),
                direction="internal",
                metadata={
                    "event_id": str(evt.get("event_id") or ""),
                    "event_type": str(evt.get("event_type") or ""),
                    "tool_name": str(evt.get("tool_name") or ""),
                    "surface": surface,
                    "audience": audience,
                },
            )
            stored += 1
        except Exception:
            # Persistence is best-effort — never break the caller
            pass

    return stored
