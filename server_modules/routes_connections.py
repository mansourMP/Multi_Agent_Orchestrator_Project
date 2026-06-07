from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from server_modules import auth as auth_module
from server_modules import (
    connection_catalog_service,
    execution_mode_policy,
    gateway_registry_service,
    gateway_state_repository,
    sage_agent_computer_selection_service,
    setup_sessions,
)


router = APIRouter()
get_current_user = auth_module.get_current_user


class ConnectionActionRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)
    surface: Optional[str] = Field(default=None, max_length=80)
    selected_gateway_id: Optional[str] = Field(default=None, max_length=160)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SageAgentComputerSelectionRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)
    selected_gateway_id: str = Field(min_length=1, max_length=160)
    metadata: Dict[str, Any] = Field(default_factory=dict)


LOCAL_BRIDGE_SETUP_CONTRACTS: Dict[str, Dict[str, Any]] = {
    "signal_personal": {
        "bridge_label": "Signal Agent Computer bridge",
        "env_prefix": "EMPYRALIS_SIGNAL_BRIDGE",
        "native_bridge": "empyralis-gateway/src/bridges/signal-cli-bridge.ts",
        "required_upstream": ["EMPYRALIS_SIGNAL_CLI_RPC_URL"],
        "optional_upstream": ["EMPYRALIS_SIGNAL_CLI_ACCOUNT"],
    },
    "imessage_personal": {
        "bridge_label": "iMessage BlueBubbles Agent Computer bridge",
        "env_prefix": "EMPYRALIS_IMESSAGE_BRIDGE",
        "native_bridge": "empyralis-gateway/src/bridges/bluebubbles-bridge.ts",
        "required_upstream": ["EMPYRALIS_BLUEBUBBLES_SERVER_URL", "EMPYRALIS_BLUEBUBBLES_PASSWORD"],
        "optional_upstream": [],
    },
    "wechat_personal": {
        "bridge_label": "WeChat Agent Computer bridge",
        "env_prefix": "EMPYRALIS_WECHAT_BRIDGE",
        "native_bridge": None,
        "gateway_runtime": "empyralis-gateway/src/channels/local-bridge-runtime.ts",
        "required_upstream": ["EMPYRALIS_WECHAT_BRIDGE_URL"],
        "optional_upstream": ["EMPYRALIS_WECHAT_BRIDGE_TOKEN"],
    },
}


def _user_id(current_user: Any) -> Optional[str]:
    if isinstance(current_user, dict):
        return (
            str(current_user.get("user_id") or "").strip()
            or str(current_user.get("id") or "").strip()
            or None
        )
    return None


def _workspace_scope(current_user: Any, workspace_id: str, *, minimum_role: str = "viewer") -> tuple[str, str]:
    resolved_workspace_id = auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role=minimum_role,
    )
    return resolved_workspace_id, auth_module.workspace_tenant_id(current_user, resolved_workspace_id)


def _user_role(current_user: Any) -> str:
    if isinstance(current_user, dict):
        return str(current_user.get("role") or "").strip().lower()
    return ""


def _selection_payload(*, workspace_id: str, user_id: str) -> Dict[str, Any]:
    selection = sage_agent_computer_selection_service.get_selection(
        workspace_id=workspace_id,
        user_id=user_id,
    )
    gateway = None
    if selection:
        registration = gateway_state_repository.get_gateway_registration(str(selection.get("selected_gateway_id") or ""))
        if registration and str(registration.get("workspace_id") or "").strip() == workspace_id:
            gateway = gateway_registry_service.gateway_registration_public_payload(registration)
    return {
        "selection": selection,
        "gateway": gateway,
        "selected_gateway_id": str((selection or {}).get("selected_gateway_id") or "").strip() or None,
    }


def _require_selectable_gateway(*, gateway_id: str, workspace_id: str, current_user: Any) -> Dict[str, Any]:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Agent Computer was not found.")
    if str(registration.get("workspace_id") or "").strip() != workspace_id:
        raise HTTPException(status_code=403, detail="Agent Computer does not belong to this workspace.")
    registration_owner_id = str(registration.get("user_id") or "").strip()
    current_user_id = _user_id(current_user) or ""
    if registration_owner_id:
        if registration_owner_id != current_user_id:
            raise HTTPException(status_code=403, detail="This Agent Computer belongs to another user.")
    elif _user_role(current_user) not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Agent Computer ownership is missing. Ask an owner to reconnect it.")
    if str(registration.get("device_trust_state") or "").strip().lower() == "revoked":
        raise HTTPException(status_code=409, detail="This Agent Computer was revoked.")
    return registration


def _gateway_public_payload_online(gateway: Dict[str, Any]) -> bool:
    connection_status = str(gateway.get("connection_status") or "").strip().lower()
    if connection_status in {"online", "connected"}:
        return True
    status = str(gateway.get("status") or "").strip().lower()
    return bool(gateway.get("heartbeat_fresh")) and status == "active"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _runtime_access_mode_from_selection_metadata(metadata: Dict[str, Any]) -> str:
    return execution_mode_policy.normalize_runtime_access_mode(
        metadata.get("runtime_access_mode")
        or metadata.get("mode")
        or execution_mode_policy.GUARDED_RUNTIME_ACCESS_MODE
    )


def _sage_agent_computer_access_metadata(
    selection_metadata: Dict[str, Any],
) -> tuple[Dict[str, Any], list[str]]:
    now_iso = _utc_now_iso()
    requested_mode = _runtime_access_mode_from_selection_metadata(selection_metadata or {})
    warning_acknowledged = bool((selection_metadata or {}).get("autonomous_agent_setup_warning_acknowledged"))
    if requested_mode == execution_mode_policy.FULL_RUNTIME_ACCESS_MODE and not warning_acknowledged:
        raise HTTPException(status_code=400, detail="Full Access setup warning must be acknowledged.")
    next_metadata: Dict[str, Any] = dict(selection_metadata or {})
    next_metadata.update({
        "runtime_access_mode": requested_mode,
        "runtime_access_label": execution_mode_policy.public_runtime_access_label(
            requested_mode
        ),
        "agent_scope": "sage",
        "autonomous_agent_setup_warning_acknowledged": (
            True if requested_mode == execution_mode_policy.FULL_RUNTIME_ACCESS_MODE else False
        ),
        "sage_agent_computer_selected": True,
        "sage_agent_computer_selected_at": now_iso,
    })
    metadata_keys_to_remove: list[str] = []
    setup_warning = execution_mode_policy.runtime_access_setup_warning(requested_mode)
    if setup_warning:
        next_metadata["runtime_access_setup_warning"] = setup_warning
        next_metadata["autonomous_agent_setup_warning_acknowledged_at"] = now_iso
    else:
        metadata_keys_to_remove.extend(
            [
                "runtime_access_setup_warning",
                "autonomous_agent_setup_warning_acknowledged_at",
            ]
        )
        next_metadata.pop("runtime_access_setup_warning", None)
        next_metadata.pop("autonomous_agent_setup_warning_acknowledged_at", None)
    return next_metadata, metadata_keys_to_remove


def _apply_selected_sage_agent_computer_metadata(
    registration: Dict[str, Any],
    *,
    access_metadata: Dict[str, Any],
    metadata_keys_to_remove: list[str],
) -> Dict[str, Any]:
    gateway_id = str(registration.get("gateway_id") or "").strip()
    if not gateway_id:
        return registration
    return gateway_state_repository.update_gateway_registration_state(
        gateway_id=gateway_id,
        metadata=access_metadata,
        metadata_keys_to_remove=metadata_keys_to_remove,
    ) or registration


def _raise_catalog_error(error: Exception) -> None:
    if isinstance(error, PermissionError):
        raise HTTPException(status_code=409, detail=str(error) or "Connection is not launch-ready.") from error
    if isinstance(error, ValueError):
        raise HTTPException(status_code=404, detail="Connection was not found.") from error
    raise HTTPException(status_code=500, detail="Connection operation failed.") from error


@router.get("/connections/catalog")
async def list_connection_catalog(
    workspace_id: Optional[str] = Query(default=None, min_length=1),
    surface: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    if workspace_id:
        _workspace_scope(current_user, workspace_id, minimum_role="viewer")
    return connection_catalog_service.list_catalog_payload(surface=surface)


@router.get("/connections/status")
async def list_connection_status(
    workspace_id: str = Query(..., min_length=1),
    surface: Optional[str] = Query(default=None),
    selected_gateway_id: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, workspace_id, minimum_role="viewer")
    return connection_catalog_service.list_status_payload(
        workspace_id=resolved_workspace_id,
        tenant_id=tenant_id,
        user_id=_user_id(current_user),
        surface=surface,
        selected_gateway_id=selected_gateway_id,
    )


@router.get("/connections/sage-agent-computer")
async def get_sage_agent_computer_selection(
    workspace_id: str = Query(..., min_length=1),
    current_user=Depends(get_current_user),
):
    resolved_workspace_id, _tenant_id = _workspace_scope(current_user, workspace_id, minimum_role="viewer")
    current_user_id = _user_id(current_user)
    if not current_user_id:
        raise HTTPException(status_code=401, detail="User identity is required.")
    return _selection_payload(workspace_id=resolved_workspace_id, user_id=current_user_id)


@router.put("/connections/sage-agent-computer")
async def set_sage_agent_computer_selection(
    body: SageAgentComputerSelectionRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id, _tenant_id = _workspace_scope(current_user, body.workspace_id, minimum_role="member")
    current_user_id = _user_id(current_user)
    if not current_user_id:
        raise HTTPException(status_code=401, detail="User identity is required.")
    registration = _require_selectable_gateway(
        gateway_id=body.selected_gateway_id,
        workspace_id=resolved_workspace_id,
        current_user=current_user,
    )
    access_metadata, metadata_keys_to_remove = _sage_agent_computer_access_metadata(body.metadata)
    registration = _apply_selected_sage_agent_computer_metadata(
        registration,
        access_metadata=access_metadata,
        metadata_keys_to_remove=metadata_keys_to_remove,
    )
    selection = sage_agent_computer_selection_service.set_selection(
        workspace_id=resolved_workspace_id,
        user_id=current_user_id,
        selected_gateway_id=str(registration.get("gateway_id") or "").strip(),
        selected_by=current_user_id,
        metadata=access_metadata,
    )
    return {
        "selection": selection,
        "gateway": gateway_registry_service.gateway_registration_public_payload(registration),
        "selected_gateway_id": selection.get("selected_gateway_id"),
    }


@router.post("/connections/{connection_id}/setup/start")
async def start_connection_setup(
    connection_id: str,
    body: ConnectionActionRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id, _tenant_id = _workspace_scope(current_user, body.workspace_id, minimum_role="member")
    try:
        item = connection_catalog_service.reject_if_unusable(connection_id)
    except Exception as error:
        _raise_catalog_error(error)
    if item.get("requires_gateway"):
        selection = sage_agent_computer_selection_service.get_selection(
            workspace_id=resolved_workspace_id,
            user_id=_user_id(current_user) or "",
        )
        selected_gateway_id = str((selection or {}).get("selected_gateway_id") or "").strip()
        requested_gateway_id = str(body.selected_gateway_id or "").strip()
        if not selected_gateway_id:
            raise HTTPException(status_code=409, detail="Choose Agent Computer before setting up this connection.")
        if requested_gateway_id and requested_gateway_id != selected_gateway_id:
            raise HTTPException(status_code=409, detail="Personal channels can only use the selected Sage Agent Computer.")
        gateway_id = selected_gateway_id
        registration = _require_selectable_gateway(
            gateway_id=gateway_id,
            workspace_id=resolved_workspace_id,
            current_user=current_user,
        )
        public_registration = gateway_registry_service.gateway_registration_public_payload(registration)
        if not _gateway_public_payload_online(public_registration):
            raise HTTPException(status_code=409, detail="Selected Sage Agent Computer is offline.")
        if item.get("id") in {"telegram_personal", "whatsapp_personal"}:
            channel = "telegram" if item.get("id") == "telegram_personal" else "whatsapp"
            return {
                "ok": True,
                "connection": item,
                "gateway_id": gateway_id,
                "setup_endpoint": f"/api/personal-channels/{channel}/gateways/{gateway_id}/setup",
                "next_action": "personal_channel_setup",
            }
        local_bridge_contract = LOCAL_BRIDGE_SETUP_CONTRACTS.get(str(item.get("id") or "").strip())
        if local_bridge_contract:
            env_prefix = str(local_bridge_contract.get("env_prefix") or "").strip()
            return {
                "ok": True,
                "connection": item,
                "gateway_id": gateway_id,
                "setup_endpoint": f"/api/personal-channels/gateways/{gateway_id}/channels",
                "message_endpoint": f"/api/personal-channels/{item.get('id')}/gateways/{gateway_id}/messages",
                "next_action": "agent_computer_local_bridge_setup",
                "bridge_contract": {
                    **local_bridge_contract,
                    "channel_key": item.get("id"),
                    "provider": item.get("runtime_provider") or item.get("provider"),
                    "gateway_env": {
                        "url": f"{env_prefix}_URL",
                        "token": f"{env_prefix}_TOKEN",
                        "poll_ms": f"{env_prefix}_POLL_MS",
                    },
                    "http_contract": {
                        "health": "GET /health",
                        "send": "POST /messages",
                        "events": f"GET /events?channel_key={item.get('id')}",
                    },
                },
            }
    lane = str(item.get("lane") or "").strip().lower()
    if lane in {
        connection_catalog_service.LANE_WORK_APP_CONNECTOR,
        connection_catalog_service.LANE_STUDIO_BUSINESS_CHANNEL,
    }:
        provider = str(item.get("vault_provider") or item.get("account_provider") or item.get("connector_id") or item.get("id") or "").strip()
        return {
            "ok": True,
            "connection": item,
            "setup_endpoint": "/api/connectors/vault",
            "next_action": "connector_vault_setup",
            "provider": provider,
            "connector_id": item.get("connector_id") or item.get("id"),
            "connector_ids": item.get("connector_ids") or [],
            "auth_required_fields": item.get("auth_required_fields") or [],
        }
    if lane == connection_catalog_service.LANE_MCP_PLUGIN:
        return {
            "ok": True,
            "connection": item,
            "setup_endpoint": "/api/mcp/servers",
            "next_action": "mcp_server_setup",
        }
    if lane == connection_catalog_service.LANE_APPLICATION:
        return {
            "ok": True,
            "connection": item,
            "setup_endpoint": "/api/apps",
            "next_action": "hosted_application_setup",
        }
    session_payload = await setup_sessions.handle_create_setup_session(
        setup_sessions.SetupSessionCreateRequest(
            workspace_id=resolved_workspace_id,
            flow=str(item.get("setup_kind") or "configure"),
        )
    )
    session = session_payload.get("session") if isinstance(session_payload, dict) else None
    session_id = str((session or {}).get("id") or "").strip()
    if session_id:
        await setup_sessions.handle_setup_session_action(
            session_id,
            setup_sessions.SetupSessionActionRequest(
                action="connector_added",
                payload={
                    "connection_id": item.get("id"),
                    "surface": body.surface,
                    "selected_gateway_id": body.selected_gateway_id,
                    "metadata": body.metadata,
                },
            ),
        )
        session_payload = await setup_sessions.handle_get_setup_session(session_id)
    return {
        "ok": True,
        "connection": item,
        "setup_session": (session_payload or {}).get("session") if isinstance(session_payload, dict) else None,
        "next_action": "setup_session",
    }


@router.post("/connections/{connection_id}/test")
async def test_connection(
    connection_id: str,
    body: ConnectionActionRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    _workspace_scope(current_user, body.workspace_id, minimum_role="member")
    try:
        item = connection_catalog_service.reject_if_unusable(connection_id)
    except Exception as error:
        _raise_catalog_error(error)
    if not item.get("test_action"):
        raise HTTPException(status_code=409, detail="Connection has no launch-ready test action.")
    raise HTTPException(status_code=409, detail="Connection test is not implemented for this connection yet.")


@router.post("/connections/{connection_id}/disconnect")
async def disconnect_connection(
    connection_id: str,
    body: ConnectionActionRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    _workspace_scope(current_user, body.workspace_id, minimum_role="member")
    item = connection_catalog_service.catalog_item(connection_id)
    if not item:
        raise HTTPException(status_code=404, detail="Connection was not found.")
    raise HTTPException(status_code=409, detail="Use the specific connection surface to disconnect this connection.")
