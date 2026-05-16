from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from ipaddress import ip_address
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from server_modules.config_loader import config_str
from server_modules.url_security import assert_safe_outbound_url

try:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client
except Exception:  # pragma: no cover - optional until dependency is installed
    ClientSession = None  # type: ignore[assignment]
    streamable_http_client = None  # type: ignore[assignment]

_log = logging.getLogger(__name__)

McpTransport = Literal["streamable_http"]
_STATE_HOME = Path(
    config_str("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()
MCP_SERVER_REGISTRY_FILE = Path(
    config_str(
        "EMPYRALIS_MCP_SERVERS_FILE",
        str(_STATE_HOME / "runtime" / "mcp_servers.json"),
    )
).expanduser()
_SUPPORTED_RUNTIME_MODES = {"hosted_secure", "local_secure", "privileged_device"}
_SUPPORTED_ACTION_CLASSES = {"read", "write", "execute"}
_SUPPORTED_RISK_LEVELS = {"low", "medium", "high", "critical"}
_SUPPORTED_COST_CLASSES = {"free", "standard", "metered", "external"}
_DANGEROUS_TOKENS = {"delete", "remove", "destroy", "drop", "truncate", "reset", "shutdown"}
_ARGUMENT_KEY_CANDIDATES = ("arguments", "args", "input", "payload")

_BLOCKED_MCP_HOSTS = {
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "[::]",
}


def _validate_mcp_endpoint(endpoint: str) -> None:
    """Validate an MCP server endpoint URL for safety.

    Raises ValueError if the URL is unsafe or unsupported.
    """
    raw = str(endpoint or "").strip()
    if not raw:
        raise ValueError("MCP endpoint URL is required.")
    parsed = urlparse(raw)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("https", "http"):
        raise ValueError(f"MCP endpoint must use https:// (or http:// in dev). Got scheme: {scheme!r}")
    if scheme == "http" and not os.getenv("EMPYRALIS_DEV_ALLOW_HTTP_MCP"):
        raise ValueError("MCP endpoint must use https://. Set EMPYRALIS_DEV_ALLOW_HTTP_MCP=1 for local dev.")
    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        raise ValueError("MCP endpoint URL has no parseable hostname.")
    if hostname in _BLOCKED_MCP_HOSTS:
        raise ValueError(f"MCP endpoint hostname {hostname!r} is blocked.")
    if hostname.endswith(".local") or hostname.endswith(".internal"):
        raise ValueError(f"MCP endpoint hostname {hostname!r} uses a reserved TLD.")
    try:
        addr = ip_address(hostname)
    except ValueError:
        addr = None
    if addr is not None and (
        addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_private
        or addr.is_unspecified
        or addr.is_reserved
    ):
        raise ValueError(f"MCP endpoint IP address {hostname!r} is not allowed.")
    assert_safe_outbound_url(raw)
    if not parsed.path or parsed.path == "/":
        _log.info("MCP endpoint %s has no explicit path; this may be intentional.", raw)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_server_id(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in raw)
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-_")


def _normalize_tool_name(value: Any) -> str:
    return str(value or "").strip()


def _normalize_transport(value: Any) -> McpTransport:
    token = str(value or "streamable_http").strip().lower() or "streamable_http"
    return "streamable_http"


def _normalize_list_of_strings(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    items: List[str] = []
    seen: set[str] = set()
    for item in value:
        token = str(item or "").strip()
        if not token or token in seen:
            continue
        seen.add(token)
        items.append(token)
    return items


def _normalize_runtime_modes(value: Any) -> List[str]:
    modes = []
    for token in _normalize_list_of_strings(value):
        compact = token.lower()
        if compact in _SUPPORTED_RUNTIME_MODES and compact not in modes:
            modes.append(compact)
    return modes or ["hosted_secure", "local_secure", "privileged_device"]


def _normalize_action_class(value: Any) -> str:
    token = str(value or "read").strip().lower() or "read"
    return token if token in _SUPPORTED_ACTION_CLASSES else "read"


def _risk_level_for_action(action_class: str) -> str:
    if action_class == "execute":
        return "critical"
    if action_class == "write":
        return "medium"
    return "low"


def _normalize_risk_level(value: Any, *, action_class: str) -> str:
    token = str(value or "").strip().lower()
    if token in _SUPPORTED_RISK_LEVELS:
        return token
    return _risk_level_for_action(action_class)


def _normalize_cost_class(value: Any) -> str:
    token = str(value or "").strip().lower()
    return token if token in _SUPPORTED_COST_CLASSES else "standard"


def _normalize_input_schema(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return dict(value)


def _read_json(path: Path) -> Dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _default_registry() -> Dict[str, Any]:
    return {
        "version": 1,
        "workspaces": {},
        "updated_at": None,
    }


def load_mcp_server_registry() -> Dict[str, Any]:
    payload = _read_json(MCP_SERVER_REGISTRY_FILE)
    workspaces = payload.get("workspaces") if isinstance(payload.get("workspaces"), dict) else {}
    return {
        "version": int(payload.get("version") or 1),
        "workspaces": workspaces,
        "updated_at": payload.get("updated_at"),
    }


def save_mcp_server_registry(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = _default_registry()
    data["workspaces"] = payload.get("workspaces") if isinstance(payload.get("workspaces"), dict) else {}
    data["updated_at"] = payload.get("updated_at")
    _write_json(MCP_SERVER_REGISTRY_FILE, data)
    return data


def _workspace_bucket(workspace_id: str, registry: Dict[str, Any]) -> Dict[str, Any]:
    workspaces = registry.get("workspaces") if isinstance(registry.get("workspaces"), dict) else {}
    bucket = workspaces.get(workspace_id)
    return dict(bucket) if isinstance(bucket, dict) else {"servers": {}}


def _save_workspace_bucket(workspace_id: str, registry: Dict[str, Any], bucket: Dict[str, Any]) -> None:
    workspaces = registry.get("workspaces") if isinstance(registry.get("workspaces"), dict) else {}
    workspaces[workspace_id] = {"servers": bucket.get("servers") if isinstance(bucket.get("servers"), dict) else {}}
    registry["workspaces"] = workspaces
    registry["updated_at"] = _utc_now_iso()


def _normalize_tool_payload(raw: Dict[str, Any], *, server_id: str) -> Dict[str, Any]:
    name = _normalize_tool_name(raw.get("name"))
    if not name:
        raise ValueError("MCP tool name is required.")
    label = str(raw.get("label") or name).strip() or name
    connector_scopes = _normalize_list_of_strings(raw.get("connector_scopes"))
    default_server_scope = f"mcp:{server_id}"
    normalized_scopes = ["mcp"]
    if default_server_scope not in normalized_scopes:
        normalized_scopes.append(default_server_scope)
    for scope in connector_scopes:
        compact = scope.lower()
        if compact not in normalized_scopes:
            normalized_scopes.append(compact)
    trigger_terms = [token.lower() for token in _normalize_list_of_strings(raw.get("trigger_terms"))]
    action_class = _normalize_action_class(raw.get("action_class"))
    risk_level = _normalize_risk_level(raw.get("risk_level"), action_class=action_class)
    permission_scopes = _normalize_list_of_strings(raw.get("permission_scopes")) or list(normalized_scopes)
    requires_approval = bool(raw.get("requires_approval")) or risk_level in {"high", "critical"}
    allowed_runtime_modes = _normalize_runtime_modes(raw.get("allowed_runtime_modes"))
    cost_class = _normalize_cost_class(raw.get("cost_class"))
    audit_event_type = str(raw.get("audit_event_type") or f"mcp.tool.{action_class}").strip() or f"mcp.tool.{action_class}"
    return {
        "name": name,
        "label": label[:160],
        "description": str(raw.get("description") or "").strip()[:500],
        "input_schema": _normalize_input_schema(raw.get("input_schema")),
        "action_class": action_class,
        "risk_level": risk_level,
        "connector_scopes": normalized_scopes,
        "permission_scopes": permission_scopes,
        "trigger_terms": trigger_terms,
        "allowed_runtime_modes": allowed_runtime_modes,
        "requires_approval": requires_approval,
        "audit_event_type": audit_event_type,
        "cost_class": cost_class,
        "permission_manifest": {
            "action_class": action_class,
            "risk_level": risk_level,
            "scopes": permission_scopes,
            "requires_approval": requires_approval,
            "allowed_runtime_modes": allowed_runtime_modes,
            "cost_class": cost_class,
            "audit_event_type": audit_event_type,
        },
        "enabled": bool(raw.get("enabled", True)),
        "approved": bool(raw.get("approved", True)),
    }


def _tool_items_from_list_result(result: Any, *, server_id: str) -> List[Dict[str, Any]]:
    tool_items = []
    raw_tools = None
    if isinstance(result, list):
        raw_tools = result
    elif isinstance(result, dict):
        raw_tools = result.get("tools")
    else:
        raw_tools = getattr(result, "tools", None)
    if not isinstance(raw_tools, list):
        return []
    for raw in raw_tools:
        if isinstance(raw, dict):
            tool = dict(raw)
        else:
            tool = {
                "name": getattr(raw, "name", None),
                "description": getattr(raw, "description", None),
                "input_schema": getattr(raw, "inputSchema", None) or getattr(raw, "input_schema", None),
            }
        try:
            tool_items.append(_normalize_tool_payload(tool, server_id=server_id))
        except ValueError:
            continue
    return tool_items


def _mcp_result_payload(result: Any) -> Any:
    if isinstance(result, dict):
        return result
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return structured
    content = getattr(result, "content", None)
    if isinstance(content, list):
        text_parts: List[str] = []
        for item in content:
            text = getattr(item, "text", None)
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())
        if len(text_parts) == 1:
            try:
                return json.loads(text_parts[0])
            except Exception:
                return {"text": text_parts[0]}
        if text_parts:
            return {"text": "\n".join(text_parts)}
    return {}


async def _list_tools_streamable_http_async(
    *,
    endpoint: str,
    client_session_cls: Any = ClientSession,
    streamable_http_client_fn: Any = streamable_http_client,
) -> List[Dict[str, Any]]:
    if client_session_cls is None or streamable_http_client_fn is None:
        raise RuntimeError("The MCP client dependency is not installed.")
    async with streamable_http_client_fn(endpoint) as (read_stream, write_stream, _):
        async with client_session_cls(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.list_tools()
    return _tool_items_from_list_result(result, server_id="temporary")


def discover_mcp_server_tools(
    *,
    transport: McpTransport,
    endpoint: str,
    server_id: str,
    client_session_cls: Any = ClientSession,
    streamable_http_client_fn: Any = streamable_http_client,
) -> List[Dict[str, Any]]:
    if transport != "streamable_http":
        raise RuntimeError(f"Unsupported MCP transport '{transport}'.")
    tools = asyncio.run(
        _list_tools_streamable_http_async(
            endpoint=endpoint,
            client_session_cls=client_session_cls,
            streamable_http_client_fn=streamable_http_client_fn,
        )
    )
    return [_normalize_tool_payload(tool, server_id=server_id) for tool in tools]


async def discover_mcp_server_tools_async(
    *,
    transport: McpTransport,
    endpoint: str,
    server_id: str,
    client_session_cls: Any = ClientSession,
    streamable_http_client_fn: Any = streamable_http_client,
) -> List[Dict[str, Any]]:
    if transport != "streamable_http":
        raise RuntimeError(f"Unsupported MCP transport '{transport}'.")
    tools = await _list_tools_streamable_http_async(
        endpoint=endpoint,
        client_session_cls=client_session_cls,
        streamable_http_client_fn=streamable_http_client_fn,
    )
    return [_normalize_tool_payload(tool, server_id=server_id) for tool in tools]


def _normalize_server_payload(
    *,
    server_id: str,
    label: Any,
    transport: Any,
    endpoint: Any,
    enabled: Any,
    tools: Any,
    metadata: Any,
    existing: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_server_id = _normalize_server_id(server_id)
    if not normalized_server_id:
        raise ValueError("MCP server id is required.")
    normalized_endpoint = str(endpoint or "").strip()
    if not normalized_endpoint:
        raise ValueError("MCP endpoint is required.")
    normalized_tools: List[Dict[str, Any]] = []
    if isinstance(tools, list):
        for raw_tool in tools:
            if not isinstance(raw_tool, dict):
                continue
            normalized_tools.append(_normalize_tool_payload(raw_tool, server_id=normalized_server_id))
    current = dict(existing) if isinstance(existing, dict) else {}
    return {
        "id": normalized_server_id,
        "label": str(label or normalized_server_id).strip()[:160] or normalized_server_id,
        "transport": _normalize_transport(transport),
        "endpoint": normalized_endpoint,
        "enabled": bool(enabled if enabled is not None else current.get("enabled", True)),
        "advanced_only": True,
        "tools": normalized_tools or (current.get("tools") if isinstance(current.get("tools"), list) else []),
        "metadata": dict(metadata) if isinstance(metadata, dict) else {},
        "last_synced_at": current.get("last_synced_at"),
        "created_at": str(current.get("created_at") or _utc_now_iso()),
        "updated_at": _utc_now_iso(),
    }


def list_workspace_mcp_servers(workspace_id: str) -> List[Dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    registry = load_mcp_server_registry()
    bucket = _workspace_bucket(normalized_workspace_id, registry)
    servers = bucket.get("servers") if isinstance(bucket.get("servers"), dict) else {}
    items: List[Dict[str, Any]] = []
    for server_id, raw in sorted(servers.items()):
        if not isinstance(raw, dict):
            continue
        payload = dict(raw)
        payload["id"] = _normalize_server_id(payload.get("id") or server_id)
        payload["tool_count"] = len(payload.get("tools") if isinstance(payload.get("tools"), list) else [])
        payload["skill_ids"] = [
            mcp_skill_id(payload["id"], str(tool.get("name") or ""))
            for tool in (payload.get("tools") if isinstance(payload.get("tools"), list) else [])
            if str(tool.get("name") or "").strip()
        ]
        items.append(payload)
    return items


def get_workspace_mcp_server(workspace_id: str, server_id: str) -> Optional[Dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_server_id = _normalize_server_id(server_id)
    if not normalized_workspace_id or not normalized_server_id:
        return None
    registry = load_mcp_server_registry()
    bucket = _workspace_bucket(normalized_workspace_id, registry)
    servers = bucket.get("servers") if isinstance(bucket.get("servers"), dict) else {}
    payload = servers.get(normalized_server_id)
    return dict(payload) if isinstance(payload, dict) else None


def upsert_workspace_mcp_server(
    *,
    workspace_id: str,
    server_id: str,
    label: Any,
    transport: Any,
    endpoint: Any,
    enabled: Any = True,
    tools: Any = None,
    metadata: Any = None,
    discover_tools: bool = False,
    auto_approve_tools: bool = False,
) -> Dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        raise ValueError("workspace_id is required.")
    registry = load_mcp_server_registry()
    bucket = _workspace_bucket(normalized_workspace_id, registry)
    servers = bucket.get("servers") if isinstance(bucket.get("servers"), dict) else {}
    normalized_server_id = _normalize_server_id(server_id)
    existing = servers.get(normalized_server_id) if isinstance(servers.get(normalized_server_id), dict) else None

    _validate_mcp_endpoint(str(endpoint or "").strip())

    payload = _normalize_server_payload(
        server_id=normalized_server_id,
        label=label,
        transport=transport,
        endpoint=endpoint,
        enabled=enabled,
        tools=tools,
        metadata=metadata,
        existing=existing,
    )
    if discover_tools:
        existing_approvals = {
            _normalize_tool_name(tool.get("name")): bool(tool.get("approved", True))
            for tool in (existing.get("tools") if isinstance(existing, dict) and isinstance(existing.get("tools"), list) else [])
            if isinstance(tool, dict) and _normalize_tool_name(tool.get("name"))
        }
        discovered = discover_mcp_server_tools(
            transport=payload["transport"],
            endpoint=payload["endpoint"],
            server_id=payload["id"],
        )
        if discovered:
            if auto_approve_tools:
                for tool in discovered:
                    tool["approved"] = True
            else:
                for tool in discovered:
                    normalized_name = _normalize_tool_name(tool.get("name"))
                    tool["approved"] = bool(existing_approvals.get(normalized_name, False))
                _log.warning(
                    "MCP server %s: %d tools discovered but not auto-approved. "
                    "Use approve_mcp_tool() or auto_approve_tools=True.",
                    payload["id"],
                    len(discovered),
                )
            payload["tools"] = discovered
        payload["last_synced_at"] = _utc_now_iso()
        payload["updated_at"] = payload["last_synced_at"]
    servers[payload["id"]] = payload
    bucket["servers"] = servers
    _save_workspace_bucket(normalized_workspace_id, registry, bucket)
    save_mcp_server_registry(registry)
    return payload


def approve_mcp_tool(*, workspace_id: str, server_id: str, tool_name: str) -> Dict[str, Any]:
    """Approve a single discovered-but-unapproved MCP tool for execution."""
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_server_id = _normalize_server_id(server_id)
    normalized_tool_name = _normalize_tool_name(tool_name)
    if not normalized_workspace_id or not normalized_server_id or not normalized_tool_name:
        raise ValueError("workspace_id, server_id, and tool_name are required.")
    server = get_workspace_mcp_server(normalized_workspace_id, normalized_server_id)
    if server is None:
        raise FileNotFoundError(f"MCP server '{server_id}' not found in workspace.")
    tools = server.get("tools") if isinstance(server.get("tools"), list) else []
    found = False
    for tool in tools:
        if _normalize_tool_name(tool.get("name")) == normalized_tool_name:
            tool["approved"] = True
            found = True
            break
    if not found:
        raise FileNotFoundError(f"MCP tool '{tool_name}' not found on server '{server_id}'.")
    return upsert_workspace_mcp_server(
        workspace_id=normalized_workspace_id,
        server_id=normalized_server_id,
        label=server.get("label"),
        transport=server.get("transport"),
        endpoint=server.get("endpoint"),
        enabled=server.get("enabled", True),
        tools=tools,
        metadata=server.get("metadata"),
        discover_tools=False,
    )


def refresh_workspace_mcp_server_tools(*, workspace_id: str, server_id: str) -> Dict[str, Any]:
    current = get_workspace_mcp_server(workspace_id, server_id)
    if current is None:
        raise FileNotFoundError(f"MCP server '{server_id}' is not registered for this workspace.")
    return upsert_workspace_mcp_server(
        workspace_id=workspace_id,
        server_id=server_id,
        label=current.get("label"),
        transport=current.get("transport"),
        endpoint=current.get("endpoint"),
        enabled=current.get("enabled", True),
        tools=current.get("tools"),
        metadata=current.get("metadata"),
        discover_tools=True,
        auto_approve_tools=False,
    )


def delete_workspace_mcp_server(*, workspace_id: str, server_id: str) -> Dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_server_id = _normalize_server_id(server_id)
    registry = load_mcp_server_registry()
    bucket = _workspace_bucket(normalized_workspace_id, registry)
    servers = bucket.get("servers") if isinstance(bucket.get("servers"), dict) else {}
    if normalized_server_id not in servers:
        raise FileNotFoundError(f"MCP server '{server_id}' is not registered for this workspace.")
    removed = dict(servers.pop(normalized_server_id))
    bucket["servers"] = servers
    _save_workspace_bucket(normalized_workspace_id, registry, bucket)
    save_mcp_server_registry(registry)
    return removed


def mcp_skill_id(server_id: str, tool_name: str) -> str:
    return f"mcp:{_normalize_server_id(server_id)}:{_normalize_tool_name(tool_name)}"


def parse_mcp_skill_id(skill_id: str) -> Optional[Dict[str, str]]:
    raw = str(skill_id or "").strip()
    if not raw.startswith("mcp:"):
        return None
    _prefix, server_id, tool_name = raw.split(":", 2) if raw.count(":") >= 2 else ("", "", "")
    normalized_server_id = _normalize_server_id(server_id)
    normalized_tool_name = _normalize_tool_name(tool_name)
    if not normalized_server_id or not normalized_tool_name:
        return None
    return {"server_id": normalized_server_id, "tool_name": normalized_tool_name}


def list_workspace_mcp_skill_entries(workspace_id: str) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for server in list_workspace_mcp_servers(workspace_id):
        if not bool(server.get("enabled", True)):
            continue
        server_id = str(server.get("id") or "").strip()
        for raw_tool in server.get("tools") if isinstance(server.get("tools"), list) else []:
            if not isinstance(raw_tool, dict) or not bool(raw_tool.get("enabled", True)):
                continue
            if not bool(raw_tool.get("approved", True)):
                continue
            tool_name = _normalize_tool_name(raw_tool.get("name"))
            if not tool_name:
                continue
            entries.append(
                {
                    "id": mcp_skill_id(server_id, tool_name),
                    "server_id": server_id,
                    "tool_name": tool_name,
                    "label": str(raw_tool.get("label") or tool_name).strip() or tool_name,
                    "description": str(raw_tool.get("description") or "").strip(),
                    "skill_class": "specialist_local",
                    "permission_label": f"MCP server {server.get('label') or server_id}",
                    "execution_mode": "live",
                    "action_class": _normalize_action_class(raw_tool.get("action_class")),
                    "connector_scopes": _normalize_list_of_strings(raw_tool.get("connector_scopes")) or ["mcp", f"mcp:{server_id}"],
                    "trigger_terms": [token.lower() for token in _normalize_list_of_strings(raw_tool.get("trigger_terms"))],
                    "allowed_runtime_modes": _normalize_runtime_modes(raw_tool.get("allowed_runtime_modes")),
                    "requires_approval": bool(raw_tool.get("requires_approval")),
                    "execution_adapter": "mcp_tool",
                    "source": "mcp_registry",
                    "path": str(server.get("endpoint") or "").strip(),
                    "enabled": True,
                    "metadata": {
                        "server_label": str(server.get("label") or server_id).strip() or server_id,
                        "transport": str(server.get("transport") or "streamable_http").strip() or "streamable_http",
                        "endpoint": str(server.get("endpoint") or "").strip(),
                        "input_schema": _normalize_input_schema(raw_tool.get("input_schema")),
                    },
                }
            )
    return entries


def _tool_from_server(server: Dict[str, Any], tool_name: str) -> Optional[Dict[str, Any]]:
    for raw_tool in server.get("tools") if isinstance(server.get("tools"), list) else []:
        if not isinstance(raw_tool, dict):
            continue
        if _normalize_tool_name(raw_tool.get("name")) == tool_name:
            return dict(raw_tool)
    return None


def _parse_goal_arguments(goal: str, tool_payload: Dict[str, Any]) -> Dict[str, Any]:
    compact = str(goal or "").strip()
    if not compact:
        return {}
    try:
        parsed = json.loads(compact)
        if isinstance(parsed, dict):
            for key in _ARGUMENT_KEY_CANDIDATES:
                candidate = parsed.get(key)
                if isinstance(candidate, dict):
                    return dict(candidate)
            return parsed
    except Exception:
        pass
    schema = _normalize_input_schema(tool_payload.get("input_schema"))
    properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
    required = [
        str(item).strip()
        for item in (schema.get("required") if isinstance(schema.get("required"), list) else [])
        if str(item).strip()
    ]
    candidate_keys = required or [str(key).strip() for key in properties.keys() if str(key).strip()]
    for key in candidate_keys:
        if key in {"question", "query", "goal", "input", "text", "prompt", "message", "url"}:
            return {key: compact}
    if len(candidate_keys) == 1:
        return {candidate_keys[0]: compact}
    if not candidate_keys:
        return {}
    return {"input": compact}


def _mcp_reply(payload: Any, *, agent_label: str, tool_name: str) -> str:
    if isinstance(payload, dict):
        for key in ("reply", "response", "answer", "text", "message", "summary"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return f"{agent_label} called MCP tool {tool_name} successfully."
    if isinstance(payload, list):
        return json.dumps(payload, ensure_ascii=False)[:4000]
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return f"{agent_label} called MCP tool {tool_name} successfully."


def _tool_kind(tool_payload: Dict[str, Any]) -> str:
    tool_name = str(tool_payload.get("name") or "").lower()
    action_class = _normalize_action_class(tool_payload.get("action_class"))
    if action_class != "read" or any(token in tool_name for token in _DANGEROUS_TOKENS):
        return "mcp-tool-result"
    return "mcp-live-data"


async def _call_streamable_http_tool_async(
    *,
    endpoint: str,
    tool_name: str,
    arguments: Dict[str, Any],
    client_session_cls: Any = ClientSession,
    streamable_http_client_fn: Any = streamable_http_client,
) -> Any:
    if client_session_cls is None or streamable_http_client_fn is None:
        raise RuntimeError("The MCP client dependency is not installed.")
    async with streamable_http_client_fn(endpoint) as (read_stream, write_stream, _):
        async with client_session_cls(read_stream, write_stream) as session:
            await session.initialize()
            return await session.call_tool(tool_name, arguments)


def invoke_workspace_mcp_skill(
    *,
    workspace_id: str,
    skill_id: str,
    goal: str,
    agent_label: str,
    client_session_cls: Any = ClientSession,
    streamable_http_client_fn: Any = streamable_http_client,
) -> Dict[str, Any]:
    parsed = parse_mcp_skill_id(skill_id)
    if parsed is None:
        raise RuntimeError("Invalid MCP skill id.")
    server = get_workspace_mcp_server(workspace_id, parsed["server_id"])
    if server is None:
        raise FileNotFoundError(f"MCP server '{parsed['server_id']}' is not registered for this workspace.")
    if not bool(server.get("enabled", True)):
        raise RuntimeError(f"MCP server '{parsed['server_id']}' is disabled for this workspace.")
    tool_payload = _tool_from_server(server, parsed["tool_name"])
    if tool_payload is None or not bool(tool_payload.get("enabled", True)):
        raise FileNotFoundError(f"MCP tool '{parsed['tool_name']}' is not available on server '{parsed['server_id']}'.")
    arguments = _parse_goal_arguments(goal, tool_payload)
    result = asyncio.run(
        _call_streamable_http_tool_async(
            endpoint=str(server.get("endpoint") or "").strip(),
            tool_name=parsed["tool_name"],
            arguments=arguments,
            client_session_cls=client_session_cls,
            streamable_http_client_fn=streamable_http_client_fn,
        )
    )
    payload = _mcp_result_payload(result)
    return {
        "status": "ok",
        "reply": _mcp_reply(payload, agent_label=agent_label, tool_name=parsed["tool_name"]),
        "artifact": {
            "label": str(tool_payload.get("label") or parsed["tool_name"]).strip() or parsed["tool_name"],
            "kind": _tool_kind(tool_payload),
            "summary": f"MCP tool {parsed['tool_name']} on server {server.get('label') or parsed['server_id']}",
            "media_type": "application/json",
            "preview_content": json.dumps(
                {
                    "server_id": parsed["server_id"],
                    "tool_name": parsed["tool_name"],
                    "arguments": arguments,
                    "payload": payload,
                },
                ensure_ascii=False,
                indent=2,
            )[:12000],
        },
        "steps": [
            {"label": "Resolving MCP server", "detail": str(server.get("label") or parsed["server_id"]).strip() or parsed["server_id"], "status": "done", "kind": "thinking"},
            {"label": "Invoking MCP tool", "detail": parsed["tool_name"], "status": "done", "kind": "connector"},
        ],
        "mcp": {
            "server_id": parsed["server_id"],
            "tool_name": parsed["tool_name"],
            "arguments": arguments,
            "payload": payload,
        },
    }


async def invoke_workspace_mcp_skill_async(
    *,
    workspace_id: str,
    skill_id: str,
    goal: str,
    agent_label: str,
    client_session_cls: Any = ClientSession,
    streamable_http_client_fn: Any = streamable_http_client,
) -> Dict[str, Any]:
    parsed = parse_mcp_skill_id(skill_id)
    if parsed is None:
        raise RuntimeError("Invalid MCP skill id.")
    server = get_workspace_mcp_server(workspace_id, parsed["server_id"])
    if server is None:
        raise FileNotFoundError(f"MCP server '{parsed['server_id']}' is not registered for this workspace.")
    if not bool(server.get("enabled", True)):
        raise RuntimeError(f"MCP server '{parsed['server_id']}' is disabled for this workspace.")
    tool_payload = _tool_from_server(server, parsed["tool_name"])
    if tool_payload is None or not bool(tool_payload.get("enabled", True)):
        raise FileNotFoundError(f"MCP tool '{parsed['tool_name']}' is not available on server '{parsed['server_id']}'.")
    arguments = _parse_goal_arguments(goal, tool_payload)
    result = await _call_streamable_http_tool_async(
        endpoint=str(server.get("endpoint") or "").strip(),
        tool_name=parsed["tool_name"],
        arguments=arguments,
        client_session_cls=client_session_cls,
        streamable_http_client_fn=streamable_http_client_fn,
    )
    payload = _mcp_result_payload(result)
    return {
        "status": "ok",
        "reply": _mcp_reply(payload, agent_label=agent_label, tool_name=parsed["tool_name"]),
        "artifact": {
            "label": str(tool_payload.get("label") or parsed["tool_name"]).strip() or parsed["tool_name"],
            "kind": _tool_kind(tool_payload),
            "summary": f"MCP tool {parsed['tool_name']} on server {server.get('label') or parsed['server_id']}",
            "media_type": "application/json",
            "preview_content": json.dumps(
                {
                    "server_id": parsed["server_id"],
                    "tool_name": parsed["tool_name"],
                    "arguments": arguments,
                    "payload": payload,
                },
                ensure_ascii=False,
                indent=2,
            )[:12000],
        },
        "steps": [
            {"label": "Resolving MCP server", "detail": str(server.get("label") or parsed["server_id"]).strip() or parsed["server_id"], "status": "done", "kind": "thinking"},
            {"label": "Invoking MCP tool", "detail": parsed["tool_name"], "status": "done", "kind": "connector"},
        ],
        "mcp": {
            "server_id": parsed["server_id"],
            "tool_name": parsed["tool_name"],
            "arguments": arguments,
            "payload": payload,
        },
    }
