from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from server_modules import control_plane_repository


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
    channel: str,
    title: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return await control_plane_repository.ensure_agent_thread(
        thread_id=thread_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
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
        approvals=list(approvals or []),
        interventions=list(interventions or []),
        metadata=_coerce_dict(metadata),
        request_id=_request_id_from_metadata(metadata),
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


async def get_thread(thread_id: str, *, include_turns: bool = True) -> Optional[Dict[str, Any]]:
    return await control_plane_repository.get_agent_thread(thread_id, include_turns=include_turns)
