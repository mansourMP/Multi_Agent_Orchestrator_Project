from __future__ import annotations

from typing import Any, Dict, Optional
from urllib.parse import quote

from fastapi import HTTPException
from fastapi import Request

from server_modules import auth, gateway_state_repository, session_service


DEFAULT_GATEWAY_SESSION_TTL_SECONDS = 15 * 60
DEFAULT_GATEWAY_HEARTBEAT_INTERVAL_SECONDS = 20


def gateway_registration_public_payload(registration: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "gateway_id": str(registration.get("gateway_id") or ""),
        "device_id": str(registration.get("device_id") or ""),
        "tenant_id": str(registration.get("tenant_id") or ""),
        "workspace_id": str(registration.get("workspace_id") or ""),
        "user_id": str(registration.get("user_id") or ""),
        "status": str(registration.get("status") or ""),
        "device_trust_state": str(registration.get("device_trust_state") or ""),
        "display_name": registration.get("display_name"),
        "platform": registration.get("platform"),
        "metadata": dict(registration.get("metadata") or {}),
        "capabilities": list(registration.get("capabilities") or []),
        "journal_cursor": int(registration.get("journal_cursor") or 0),
        "checkpoint_cursor": int(registration.get("checkpoint_cursor") or 0),
        "created_at": registration.get("created_at"),
        "updated_at": registration.get("updated_at"),
        "last_seen_at": registration.get("last_seen_at"),
        "last_heartbeat_at": registration.get("last_heartbeat_at"),
        "token_rotated_at": registration.get("token_rotated_at"),
        "revoked_at": registration.get("revoked_at"),
        "revoked_reason": registration.get("revoked_reason"),
    }


def gateway_scope_payload(registration: Dict[str, Any]) -> Dict[str, str]:
    return {
        "tenant_id": str(registration.get("tenant_id") or ""),
        "workspace_id": str(registration.get("workspace_id") or ""),
        "user_id": str(registration.get("user_id") or ""),
        "device_id": str(registration.get("device_id") or ""),
        "gateway_id": str(registration.get("gateway_id") or ""),
    }


def build_gateway_ws_url(
    request: Request,
    *,
    gateway_id: str,
    session_token: str,
) -> str:
    scheme = "wss" if str(request.url.scheme or "").strip().lower() == "https" else "ws"
    netloc = request.headers.get("host") or request.url.netloc
    return (
        f"{scheme}://{netloc}/api/gateway/ws"
        f"?gateway_id={quote(str(gateway_id or '').strip())}"
        f"&session_token={quote(str(session_token or '').strip())}"
    )


async def create_gateway_session(
    request: Request,
    *,
    gateway_id: str,
    gateway_token: str,
    session_ttl_seconds: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise ValueError("Gateway registration was not found.")
    try:
        device_link = auth.validate_local_gateway_device_link(
            user_id=str(registration.get("user_id") or "").strip(),
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            device_id=str(registration.get("device_id") or "").strip(),
            gateway_id=str(registration.get("gateway_id") or "").strip(),
        )
    except HTTPException as exc:
        gateway_state_repository.update_gateway_registration_state(
            gateway_id=str(gateway_id or "").strip(),
            device_trust_state="revoked"
            if "revoked" in str(exc.detail or "").strip().lower()
            else str(registration.get("device_trust_state") or "verified").strip() or "verified",
            status="revoked"
            if "revoked" in str(exc.detail or "").strip().lower()
            else str(registration.get("status") or "active").strip() or "active",
            metadata={"last_identity_error": str(exc.detail)},
        )
        raise ValueError(str(exc.detail)) from exc
    session = gateway_state_repository.issue_gateway_session(
        gateway_id=gateway_id,
        gateway_token=gateway_token,
        ttl_seconds=int(session_ttl_seconds or DEFAULT_GATEWAY_SESSION_TTL_SECONDS),
        metadata=metadata,
    )
    session_metadata = {
        **dict(metadata or {}),
        "tenant_id": str(registration.get("tenant_id") or "").strip(),
        "workspace_id": str(registration.get("workspace_id") or "").strip(),
        "user_id": str(registration.get("user_id") or "").strip(),
        "device_id": str(registration.get("device_id") or "").strip(),
        "gateway_id": str(registration.get("gateway_id") or "").strip(),
        "device_trust_state": str(device_link.get("trust_state") or "verified").strip() or "verified",
    }
    auth.create_auth_session(
        str(registration.get("user_id") or "").strip(),
        channel="local_runtime_companion",
        device_id=str(registration.get("device_id") or "").strip() or None,
        runtime_id=str(registration.get("gateway_id") or "").strip() or None,
        trust_state=str(device_link.get("trust_state") or "verified").strip() or "verified",
        session_id=str(session.get("session_id") or "").strip() or None,
        session_family_id=str(registration.get("gateway_id") or "").strip() or None,
        metadata=session_metadata,
        ttl_seconds=int(session_ttl_seconds or DEFAULT_GATEWAY_SESSION_TTL_SECONDS),
    )
    await session_service.create_local_gateway_session(
        tenant_id=str(registration.get("tenant_id") or "").strip(),
        workspace_id=str(registration.get("workspace_id") or "").strip(),
        user_id=str(registration.get("user_id") or "").strip(),
        device_id=str(registration.get("device_id") or "").strip(),
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        display_name=str(registration.get("display_name") or "").strip() or None,
        metadata=session_metadata,
        session_id=str(session.get("session_id") or "").strip() or None,
        ttl_seconds=int(session_ttl_seconds or DEFAULT_GATEWAY_SESSION_TTL_SECONDS),
    )
    registration = gateway_state_repository.sync_gateway_registration_identity(
        gateway_id=str(gateway_id or "").strip(),
        tenant_id=str(registration.get("tenant_id") or "").strip() or None,
        workspace_id=str(registration.get("workspace_id") or "").strip() or None,
        user_id=str(registration.get("user_id") or "").strip() or None,
        device_id=str(registration.get("device_id") or "").strip() or None,
        device_trust_state=str(device_link.get("trust_state") or "verified").strip() or "verified",
        metadata={
            "auth_session_id": str(session.get("session_id") or "").strip() or None,
            "runtime_session_id": str(session.get("session_id") or "").strip() or None,
        },
    ) or registration
    return {
        "session_id": str(session.get("session_id") or ""),
        "gateway_id": str(gateway_id or ""),
        "session_token": str(session.get("session_token") or ""),
        "ws_url": build_gateway_ws_url(
            request,
            gateway_id=str(gateway_id or ""),
            session_token=str(session.get("session_token") or ""),
        ),
        "heartbeat_interval_seconds": DEFAULT_GATEWAY_HEARTBEAT_INTERVAL_SECONDS,
        "scope": gateway_scope_payload(registration),
        "gateway": gateway_registration_public_payload(registration),
        "created_at": session.get("created_at"),
        "expires_at": session.get("expires_at"),
    }


def list_workspace_gateways(*, workspace_id: str) -> Dict[str, Any]:
    items = [
        gateway_registration_public_payload(item)
        for item in gateway_state_repository.list_workspace_gateway_registrations(workspace_id)
    ]
    return {
        "workspace_id": str(workspace_id or "").strip() or "default",
        "count": len(items),
        "items": items,
    }


def rotate_gateway_registration_token(
    *,
    gateway_id: str,
    tenant_id: str,
    workspace_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise ValueError("Gateway registration was not found.")
    try:
        device_link = auth.validate_local_gateway_device_link(
            user_id=str(registration.get("user_id") or "").strip(),
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            device_id=str(registration.get("device_id") or "").strip(),
            gateway_id=str(registration.get("gateway_id") or "").strip(),
        )
    except HTTPException as exc:
        gateway_state_repository.update_gateway_registration_state(
            gateway_id=str(gateway_id or "").strip(),
            device_trust_state="revoked"
            if "revoked" in str(exc.detail or "").strip().lower()
            else str(registration.get("device_trust_state") or "verified").strip() or "verified",
            status="revoked"
            if "revoked" in str(exc.detail or "").strip().lower()
            else str(registration.get("status") or "active").strip() or "active",
            metadata={"last_identity_error": str(exc.detail)},
        )
        raise ValueError(str(exc.detail)) from exc
    rotated = gateway_state_repository.rotate_gateway_token(
        gateway_id=gateway_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        user_id=user_id,
    )
    fresh_gateway_token = str(rotated.get("gateway_token") or "")
    rotated = gateway_state_repository.sync_gateway_registration_identity(
        gateway_id=str(rotated.get("gateway_id") or "").strip(),
        tenant_id=str(rotated.get("tenant_id") or "").strip() or None,
        workspace_id=str(rotated.get("workspace_id") or "").strip() or None,
        user_id=str(rotated.get("user_id") or "").strip() or None,
        device_id=str(rotated.get("device_id") or "").strip() or None,
        device_trust_state=str(device_link.get("trust_state") or "verified").strip() or "verified",
        metadata={
            "device_link": {
                "device_id": str(device_link.get("device_id") or "").strip() or None,
                "workspace_id": str(device_link.get("workspace_id") or "").strip() or None,
                "status": str(device_link.get("status") or "").strip() or None,
                "trust_state": str(device_link.get("trust_state") or "").strip() or None,
            }
        },
    ) or rotated
    rotated["gateway_token"] = fresh_gateway_token
    return {
        "gateway": gateway_registration_public_payload(rotated),
        "gateway_token": str(rotated.get("gateway_token") or ""),
        "scope": gateway_scope_payload(rotated),
    }


def revoke_gateway_registration(
    *,
    gateway_id: str,
    tenant_id: str,
    workspace_id: str,
    user_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise ValueError("Gateway registration was not found.")
    if str(registration.get("tenant_id") or "").strip() != str(tenant_id or "").strip():
        raise ValueError("Gateway registration scope mismatch.")
    if str(registration.get("workspace_id") or "").strip() != str(workspace_id or "").strip():
        raise ValueError("Gateway registration scope mismatch.")
    if user_id and str(registration.get("user_id") or "").strip() != str(user_id or "").strip():
        raise ValueError("Gateway registration scope mismatch.")
    auth.revoke_local_gateway_device_link(
        user_id=str(registration.get("user_id") or "").strip(),
        device_id=str(registration.get("device_id") or "").strip(),
        reason=reason or "Gateway registration revoked.",
    )
    revoked = gateway_state_repository.revoke_gateway_registration(
        gateway_id=gateway_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        user_id=user_id,
        reason=reason,
    )
    if not revoked:
        raise ValueError("Gateway registration was not found.")
    return {
        "gateway": gateway_registration_public_payload(revoked),
        "scope": gateway_scope_payload(revoked),
    }
