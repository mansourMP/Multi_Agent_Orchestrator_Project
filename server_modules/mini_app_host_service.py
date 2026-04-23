from __future__ import annotations

import ipaddress
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import HTTPException

from server_modules import app_bridge_service


DEFAULT_HOSTED_BRIDGE_MESSAGE_TYPE = "empyralis.hosted_app.bridge.request"
DEFAULT_HOSTED_BRIDGE_RESPONSE_TYPE = "empyralis.hosted_app.bridge.response"
DEFAULT_HOSTED_BRIDGE_READY_TYPE = "empyralis.hosted_app.bridge.ready"
_SUPPORTED_DELIVERY_MODES = {"structured", "hosted"}
_SUPPORTED_EMBED_KINDS = {"iframe", "webview"}
_DEFAULT_IFRAME_SANDBOX = [
    "allow-forms",
    "allow-modals",
    "allow-popups",
    "allow-popups-to-escape-sandbox",
    "allow-same-origin",
    "allow-scripts",
]
_DEFAULT_IFRAME_ALLOW = [
    "clipboard-read",
    "clipboard-write",
]


def _normalized_text(value: Any) -> str:
    return str(value or "").strip()


def _is_local_dev_host(hostname: str) -> bool:
    normalized = _normalized_text(hostname).lower()
    if not normalized:
        return False
    if normalized in {"localhost", "127.0.0.1", "::1"} or normalized.endswith(".local"):
        return True
    try:
        parsed = ipaddress.ip_address(normalized)
    except ValueError:
        return False
    return bool(parsed.is_private or parsed.is_loopback)


def _normalize_origin(value: Any) -> Optional[str]:
    token = _normalized_text(value)
    if not token:
        return None
    parsed = urlparse(token)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Hosted mini apps require absolute http(s) URLs and origins.")
    if parsed.scheme != "https" and not _is_local_dev_host(parsed.hostname or ""):
        raise ValueError("Hosted mini apps require https origins unless they target a local development host.")
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _normalize_hosted_url(value: Any) -> Optional[str]:
    token = _normalized_text(value)
    if not token:
        return None
    parsed = urlparse(token)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("hosted_url must be an absolute http(s) URL.")
    if parsed.scheme != "https" and not _is_local_dev_host(parsed.hostname or ""):
        raise ValueError("hosted_url must use https unless it targets a local development host.")
    return token


def _normalize_delivery_mode(value: Any, *, hosted_url: Optional[str]) -> str:
    token = _normalized_text(value).lower() or ("hosted" if hosted_url else "structured")
    if token not in _SUPPORTED_DELIVERY_MODES:
        raise ValueError("delivery_mode must be either 'structured' or 'hosted'.")
    if token == "hosted" and not hosted_url:
        raise ValueError("hosted delivery_mode requires hosted_url.")
    return token


def _normalize_embed_kind(value: Any) -> str:
    token = _normalized_text(value).lower() or "iframe"
    if token not in _SUPPORTED_EMBED_KINDS:
        raise ValueError("embed_kind must be either 'iframe' or 'webview'.")
    return token


def _normalize_allowed_origins(value: Any, *, hosted_url: Optional[str]) -> List[str]:
    items: List[str] = []
    if hosted_url:
        origin = _normalize_origin(hosted_url)
        if origin:
            items.append(origin)
    raw_items = value if isinstance(value, list) else []
    for item in raw_items:
        origin = _normalize_origin(item)
        if origin and origin not in items:
            items.append(origin)
    return items


def _normalize_permission_tokens(
    value: Any,
    *,
    bridge_contracts: Dict[str, List[str]],
) -> List[str]:
    permissions: List[str] = []
    for item in value if isinstance(value, list) else []:
        token = _normalized_text(item).lower()
        if token and token not in permissions:
            permissions.append(token)
    for bridge_kind, bridge_types in bridge_contracts.items():
        for bridge_type in bridge_types:
            token = f"bridge.{bridge_kind}.{bridge_type}"
            if token not in permissions:
                permissions.append(token)
    return permissions


def _normalize_bridge_contracts(
    value: Any,
    *,
    app_id: str,
) -> Dict[str, List[str]]:
    allowed_map = app_bridge_service._bridge_contracts_map()
    normalized: Dict[str, List[str]] = {}
    raw_map = value if isinstance(value, dict) else {}
    for raw_kind, raw_types in raw_map.items():
        kind = _normalized_text(raw_kind).lower()
        if not kind:
            continue
        allowed_types = {
            _normalized_text(item).lower()
            for item in list(allowed_map.get(kind) or [])
            if _normalized_text(item)
        }
        normalized_types: List[str] = []
        for raw_type in raw_types if isinstance(raw_types, list) else []:
            bridge_type = _normalized_text(raw_type).lower()
            if not bridge_type:
                continue
            if allowed_types and bridge_type not in allowed_types:
                raise ValueError(f"Unsupported bridge_type '{bridge_type}' for bridge_kind '{kind}'.")
            if bridge_type not in normalized_types:
                normalized_types.append(bridge_type)
        if normalized_types:
            normalized[kind] = normalized_types
    return normalized


def _normalize_context_envelope(value: Any) -> Dict[str, List[str]]:
    envelope_map = app_bridge_service._context_envelope_map()
    allowed_default = {
        _normalized_text(item).lower()
        for item in list(envelope_map.get("default_classes") or [])
        if _normalized_text(item)
    }
    allowed_optional = {
        _normalized_text(item).lower()
        for item in list(envelope_map.get("optional_classes") or [])
        if _normalized_text(item)
    }
    payload = value if isinstance(value, dict) else {}
    normalized_default: List[str] = []
    normalized_optional: List[str] = []
    for item in payload.get("default_classes") if isinstance(payload.get("default_classes"), list) else []:
        token = _normalized_text(item).lower()
        if token and token in allowed_default and token not in normalized_default:
            normalized_default.append(token)
    for item in payload.get("optional_classes") if isinstance(payload.get("optional_classes"), list) else []:
        token = _normalized_text(item).lower()
        if token and token in allowed_optional and token not in normalized_optional:
            normalized_optional.append(token)
    return {
        "default_classes": normalized_default or sorted(allowed_default),
        "optional_classes": normalized_optional,
        "inherits_sage_memory_by_default": False,
        "inherits_specialist_memory_by_default": False,
    }


def normalize_hosted_app_fields(
    *,
    app_id: str,
    delivery_mode: Any = None,
    hosted_url: Any = None,
    embed_kind: Any = None,
    allowed_origins: Any = None,
    bridge_contracts: Any = None,
    permissions: Any = None,
    context_envelope: Any = None,
) -> Dict[str, Any]:
    normalized_hosted_url = _normalize_hosted_url(hosted_url)
    normalized_delivery_mode = _normalize_delivery_mode(delivery_mode, hosted_url=normalized_hosted_url)
    normalized_embed_kind = _normalize_embed_kind(embed_kind)
    normalized_bridge_contracts = _normalize_bridge_contracts(bridge_contracts, app_id=app_id)
    normalized_permissions = _normalize_permission_tokens(
        permissions,
        bridge_contracts=normalized_bridge_contracts,
    )
    normalized_context_envelope = _normalize_context_envelope(context_envelope)
    normalized_allowed_origins = _normalize_allowed_origins(
        allowed_origins,
        hosted_url=normalized_hosted_url if normalized_delivery_mode == "hosted" else None,
    )
    return {
        "delivery_mode": normalized_delivery_mode,
        "hosted_url": normalized_hosted_url,
        "embed_kind": normalized_embed_kind,
        "allowed_origins": normalized_allowed_origins,
        "bridge_contracts": normalized_bridge_contracts,
        "permissions": normalized_permissions,
        "context_envelope": normalized_context_envelope,
    }


def build_hosted_mini_app_manifest(
    *,
    workspace_id: str,
    app_contract: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    if str(app_contract.get("delivery_mode") or "").strip().lower() != "hosted":
        return None
    hosted_url = _normalize_hosted_url(app_contract.get("hosted_url"))
    if not hosted_url:
        return None
    app_id = _normalized_text(app_contract.get("app_id"))
    bridge_contracts = app_contract.get("bridge_contracts") if isinstance(app_contract.get("bridge_contracts"), dict) else {}
    permissions = [token for token in list(app_contract.get("permissions") or []) if _normalized_text(token)]
    allowed_origins = _normalize_allowed_origins(app_contract.get("allowed_origins"), hosted_url=hosted_url)
    context_envelope = app_contract.get("context_envelope") if isinstance(app_contract.get("context_envelope"), dict) else {}
    return {
        "app_id": app_id,
        "workspace_id": _normalized_text(workspace_id) or "default",
        "delivery_mode": "hosted",
        "memory_scope": "none_by_default",
        "hosted_app": {
            "hosted_url": hosted_url,
            "allowed_origins": allowed_origins,
            "embed": {
                "kind": _normalize_embed_kind(app_contract.get("embed_kind")),
                "sandbox": list(_DEFAULT_IFRAME_SANDBOX),
                "allow": list(_DEFAULT_IFRAME_ALLOW),
                "referrer_policy": "origin",
            },
            "bridge": {
                "transport": "post_message",
                "request_type": DEFAULT_HOSTED_BRIDGE_MESSAGE_TYPE,
                "response_type": DEFAULT_HOSTED_BRIDGE_RESPONSE_TYPE,
                "ready_type": DEFAULT_HOSTED_BRIDGE_READY_TYPE,
                "endpoint": f"/api/workspaces/{_normalized_text(workspace_id) or 'default'}/mini-apps/{app_id}/bridge/messages",
                "allowed_contracts": bridge_contracts,
                "permissions": permissions,
                "context_envelope": context_envelope,
                "denied_by_default": list(app_bridge_service._app_denials()),
            },
        },
    }


def _allowed_bridge_tokens(manifest: Dict[str, Any]) -> Dict[str, List[str]]:
    hosted = manifest.get("hosted_app") if isinstance(manifest.get("hosted_app"), dict) else {}
    bridge = hosted.get("bridge") if isinstance(hosted.get("bridge"), dict) else {}
    allowed = bridge.get("allowed_contracts") if isinstance(bridge.get("allowed_contracts"), dict) else {}
    return {
        _normalized_text(kind).lower(): [
            _normalized_text(item).lower()
            for item in list(types)
            if _normalized_text(item)
        ]
        for kind, types in allowed.items()
        if _normalized_text(kind)
    }


def _normalize_hosted_bridge_contract(
    *,
    app_id: str,
    bridge_kind: str,
    bridge_type: str,
    target: Optional[Dict[str, Any]] = None,
    context_envelope: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    kind = _normalized_text(bridge_kind).lower()
    bridge_token = _normalized_text(bridge_type).lower()
    allowed_map = app_bridge_service._bridge_contracts_map()
    if not kind or kind not in allowed_map:
        raise HTTPException(status_code=400, detail="Unsupported bridge_kind.")
    allowed_types = list(allowed_map.get(kind) or [])
    if not bridge_token or bridge_token not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported bridge_type for this bridge_kind.")

    target_payload = dict(target or {}) if isinstance(target, dict) else {}
    for key in list(target_payload):
        forbidden = app_bridge_service._forbidden_bridge_key(key)
        if forbidden:
            raise HTTPException(status_code=400, detail=f"bridge target field '{key}' is not allowed.")
    if kind == "app_to_specialist" and not (
        _normalized_text(target_payload.get("target_install_id"))
        or _normalized_text(target_payload.get("target_capability"))
    ):
        raise HTTPException(status_code=400, detail="App -> specialist bridges require target_install_id or target_capability.")
    if kind == "sage_to_app":
        target_app_id = _normalized_text(target_payload.get("target_app_id") or app_id)
        if not target_app_id:
            raise HTTPException(status_code=400, detail="Sage -> app bridges require target_app_id.")
        target_payload["target_app_id"] = target_app_id
    if kind == "app_to_connector_runtime" and not (
        _normalized_text(target_payload.get("connector_id"))
        or _normalized_text(target_payload.get("workflow_id"))
        or _normalized_text(target_payload.get("route_key"))
    ):
        raise HTTPException(status_code=400, detail="App -> connector/runtime bridges require connector_id, workflow_id, or route_key.")

    normalized_metadata = dict(metadata or {}) if isinstance(metadata, dict) else {}
    for key in normalized_metadata:
        forbidden = app_bridge_service._forbidden_bridge_key(key)
        if forbidden:
            raise HTTPException(status_code=400, detail=f"metadata.{key} is not allowed for explicit app bridges.")
    normalized_envelope = app_bridge_service.normalize_app_context_envelope(
        context_envelope,
        contract={"context_envelope": _normalize_context_envelope(None)},
    )
    return {
        "app_id": app_id,
        "bridge_kind": kind,
        "bridge_type": bridge_token,
        "target": target_payload,
        "context_envelope": normalized_envelope,
        "metadata": normalized_metadata,
        "denied_by_default": list(app_bridge_service._app_denials()),
        "allowed_bridge_types": allowed_types,
    }


async def process_hosted_bridge_request(
    *,
    workspace_id: str,
    tenant_id: str,
    current_user: Dict[str, Any],
    app_contract: Dict[str, Any],
    origin: str,
    bridge_kind: str,
    bridge_type: str,
    request_text: str = "",
    target: Optional[Dict[str, Any]] = None,
    context_envelope: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    manifest = build_hosted_mini_app_manifest(
        workspace_id=workspace_id,
        app_contract=app_contract,
    )
    if not manifest:
        raise ValueError("Hosted mini app manifest is not available for this app.")
    normalized_origin = _normalize_origin(origin)
    allowed_origins = set(manifest["hosted_app"]["allowed_origins"])
    if normalized_origin not in allowed_origins:
        raise PermissionError("Hosted mini app origin is not allowed.")

    kind = _normalized_text(bridge_kind).lower()
    bridge_token = _normalized_text(bridge_type).lower()
    allowed_tokens = _allowed_bridge_tokens(manifest)
    if kind not in allowed_tokens or bridge_token not in allowed_tokens.get(kind, []):
        raise ValueError("Hosted mini app bridge contract is not allowed.")

    bridge = _normalize_hosted_bridge_contract(
        app_id=_normalized_text(app_contract.get("app_id")),
        bridge_kind=kind,
        bridge_type=bridge_token,
        target=dict(target or {}) if isinstance(target, dict) else None,
        context_envelope=dict(context_envelope or {}) if isinstance(context_envelope, dict) else None,
        metadata={
            **(dict(metadata or {}) if isinstance(metadata, dict) else {}),
            "request_origin": normalized_origin,
            "delivery_mode": "hosted",
            "request_text": _normalized_text(request_text) or None,
        },
    )

    turn_payload: Dict[str, Any] = {}
    if kind == "app_to_sage" and _normalized_text(request_text):
        from server_modules import agent_registry_api

        master_install = await agent_registry_api.agent_registry_repository.get_workspace_master_agent_install(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            created_by_user_id=_normalized_text((current_user or {}).get("user_id")) or None,
        )
        if not isinstance(master_install, dict):
            raise HTTPException(status_code=500, detail="Workspace master agent is unavailable.")
        turn_result = await agent_registry_api.execute_install_agent_turn(
            install_id=_normalized_text(master_install.get("id")),
            current_user=current_user,
            message=_normalized_text(request_text),
            channel="web",
            execution_mode="durable",
            response_mode="artifact",
            metadata_overrides={
                "source": "mini_apps.hosted_bridge",
                "app_id": bridge.get("app_id"),
                "app_bridge": bridge,
                "app_context_envelope": bridge.get("context_envelope"),
            },
        )
        if hasattr(turn_result, "model_dump"):
            turn_payload = turn_result.model_dump()
        elif hasattr(turn_result, "dict"):
            turn_payload = turn_result.dict()
        elif isinstance(turn_result, dict):
            turn_payload = dict(turn_result)

    audit = await app_bridge_service.record_app_bridge_audit(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        actor_type="application",
        actor_id=_normalized_text(bridge.get("app_id")) or "hosted-mini-app",
        app_id=_normalized_text(bridge.get("app_id")) or "hosted-mini-app",
        bridge_kind=_normalized_text(bridge.get("bridge_kind")),
        bridge_type=_normalized_text(bridge.get("bridge_type")),
        target=bridge.get("target") if isinstance(bridge.get("target"), dict) else None,
        metadata={"source": "mini_apps.hosted_bridge", "origin": normalized_origin},
    )
    return {
        "status": "ok",
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "origin": normalized_origin,
        "bridge": bridge,
        "audit": {"activity_event_id": _normalized_text((audit or {}).get("id")) or None},
        "turn_result": turn_payload,
        "run_id": _normalized_text(turn_payload.get("run_id")) or None,
        "thread_id": _normalized_text(turn_payload.get("thread_id")) or None,
        "session_id": _normalized_text(turn_payload.get("session_id")) or None,
    }
