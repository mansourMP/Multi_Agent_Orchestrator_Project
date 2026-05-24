from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from server_modules import control_plane_repository, transcript_events_service


LOGGER = logging.getLogger(__name__)


build_default_thread_title = control_plane_repository.build_default_thread_title


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _request_id_from_metadata(metadata: Optional[Dict[str, Any]]) -> Optional[str]:
    payload = _coerce_dict(metadata)
    for key in ("request_id", "client_request_id"):
        token = str(payload.get(key) or "").strip()
        if token:
            return token
    return None


async def ensure_master_thread(
    *,
    thread_id: str,
    tenant_id: str,
    workspace_id: str,
    owner_user_id: Optional[str],
    master_agent_install_id: Optional[str] = None,
    channel: str,
    title: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return await control_plane_repository.ensure_agent_thread(
        thread_id=thread_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        master_agent_install_id=master_agent_install_id,
        channel=channel,
        title=title,
        metadata=metadata,
    )


async def record_user_turn(
    *,
    thread_id: str,
    tenant_id: str,
    workspace_id: str,
    session_id: Optional[str],
    actor: Dict[str, Any],
    content: str,
    runtime_profile_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return await control_plane_repository.upsert_agent_turn(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        thread_id=thread_id,
        session_id=session_id,
        role="user",
        status="completed",
        content=content,
        actor=actor,
        runtime_profile_id=runtime_profile_id,
        metadata=_coerce_dict(metadata),
        request_id=_request_id_from_metadata(metadata),
    )


async def record_assistant_turn(
    *,
    thread_id: str,
    tenant_id: str,
    workspace_id: str,
    session_id: Optional[str],
    actor: Dict[str, Any],
    reply: str,
    status: str,
    run_id: Optional[str] = None,
    active_agent_install_id: Optional[str] = None,
    runtime_profile_id: Optional[str] = None,
    approvals: Optional[List[Dict[str, Any]]] = None,
    interventions: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return await control_plane_repository.upsert_agent_turn(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        thread_id=thread_id,
        session_id=session_id,
        role="assistant",
        status=str(status or "completed").strip().lower() or "completed",
        content=reply,
        run_id=run_id,
        actor=actor,
        active_agent_install_id=active_agent_install_id,
        runtime_profile_id=runtime_profile_id,
        approvals=list(approvals or []),
        interventions=list(interventions or []),
        metadata=_coerce_dict(metadata),
        request_id=_request_id_from_metadata(metadata),
    )


async def append_assistant_turn_transcript_event(
    *,
    thread_id: str,
    tenant_id: str,
    workspace_id: str,
    event_name: str,
    payload: Dict[str, Any],
    request_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    run_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    transcript_event = transcript_events_service.build_transcript_event(event_name, payload)
    if transcript_event is None:
        return None
    return await control_plane_repository.append_agent_turn_transcript_event(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        thread_id=thread_id,
        transcript_event=transcript_event,
        request_id=request_id,
        trace_id=trace_id,
        run_id=run_id,
    )


async def list_threads(
    *,
    workspace_id: str,
    tenant_id: Optional[str] = None,
    owner_user_id: Optional[str] = None,
    include_turns: bool = False,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    return await control_plane_repository.list_agent_threads(
        workspace_id=workspace_id,
        tenant_id=tenant_id,
        owner_user_id=owner_user_id,
        include_turns=include_turns,
        limit=limit,
    )


async def get_thread(
    thread_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
    include_turns: bool = True,
) -> Optional[Dict[str, Any]]:
    return await control_plane_repository.get_agent_thread(
        thread_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        include_turns=include_turns,
    )
