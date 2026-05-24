from __future__ import annotations

import ipaddress
import json
import asyncio
import os
import socket
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException

from server_modules import control_plane_repository
from server_modules import provider_profiles as provider_profiles_service


SURFACE_KIND_CONNECTED_EXTERNAL_AGENT = "connected_external_agent"
SURFACE_KIND_NATIVE_STUDIO_AGENT = "native_studio_agent"
SURFACE_KIND_AGENT_COMPUTER = "agent_computer"
SURFACE_KIND_AGENT_GROUP_RESERVED = "agent_group_reserved"

CONNECTION_STATE_UNVERIFIED = "unverified"
CONNECTION_STATE_VERIFIED = "verified"
CONNECTION_STATE_ERROR = "error"
CONNECTION_STATE_REVOKED = "revoked"

ALLOWED_PROVIDER_KINDS = {"openclaw", "hermes", "nemoclaw", "custom"}
EXTERNAL_AGENT_CAPABILITY_CHAT = "chat"
ALLOWED_EXTERNAL_AGENT_CAPABILITIES = {
    "actions",
    "activity",
    "channels",
    "chat",
    "events",
    "health",
    "knowledge",
    "knowledge_read",
    "knowledge_write",
    "logs",
    "mcp",
    "memory",
    "memory_read",
    "memory_write",
    "nodes",
    "skills",
    "tools",
}
ALLOWED_MANIFEST_KEYS = {
    "auth",
    "auth_mode",
    "auth_scheme",
    "auth_type",
    "capabilities",
    "description",
    "endpoint_refs",
    "endpoints",
    "features",
    "health",
    "id",
    "metadata",
    "model",
    "name",
    "protocol",
    "protocol_version",
    "provider_kind",
    "runtime",
    "summary",
    "version",
}
ALLOWED_AUTH_MANIFEST_KEYS = {"auth_mode", "auth_scheme", "auth_type", "header_name", "scheme", "secret_ref", "type"}
ALLOWED_ENDPOINT_KEYS = {"base_url", "manifest_url", "chat_url", "chat", "health_url", "health", "logs_url", "logs"}
SECRET_FIELD_MARKERS = {"secret", "token", "password", "api_key", "apikey", "authorization", "bearer"}
SECRET_FIELD_ALLOWLIST = {"auth", "auth_type", "auth_scheme", "auth_mode", "authentication", "secret_ref"}
SECRET_RESOLUTION_FIELDS = ["api_key", "access_token", "oauth_token", "token", "authorization", "auth_header", "header_value"]
MAX_MANIFEST_RESPONSE_BYTES = 256 * 1024
MAX_CHAT_RESPONSE_BYTES = 256 * 1024
MAX_CHAT_MESSAGE_CHARS = 16_000
MAX_RECENT_MESSAGES = 16
MAX_RECENT_MESSAGE_CHARS = 4_000
LOCAL_STORE: Dict[tuple[str, str, str], Dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_string(value: Any, default: str = "") -> str:
    return str(value or "").strip() or default


def _coerce_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def _coerce_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return list(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return []
        return list(parsed) if isinstance(parsed, list) else []
    return []


def _to_json(value: Any, *, default: Any) -> str:
    return json.dumps(value if value is not None else default, ensure_ascii=False, separators=(",", ":"), default=str)


def _normalize_provider_kind(value: Any) -> str:
    token = _read_string(value, "custom").lower().replace("-", "_").replace(" ", "_")
    if token in {"open_claw", "openclaw_gateway"}:
        token = "openclaw"
    if token in {"nemo_claw", "nvidia_nemoclaw"}:
        token = "nemoclaw"
    if token not in ALLOWED_PROVIDER_KINDS:
        return "custom"
    return token


def _redact_secret_fields(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: Dict[str, Any] = {}
        for key, item in value.items():
            lowered = str(key or "").lower()
            if lowered not in SECRET_FIELD_ALLOWLIST and any(marker in lowered for marker in SECRET_FIELD_MARKERS):
                redacted[key] = "[redacted]"
            else:
                redacted[key] = _redact_secret_fields(item)
        return redacted
    if isinstance(value, list):
        return [_redact_secret_fields(item) for item in value]
    return value


def _contains_raw_secret(value: Any) -> bool:
    if isinstance(value, dict):
        for key, item in value.items():
            lowered = str(key or "").lower()
            if lowered not in SECRET_FIELD_ALLOWLIST and any(marker in lowered for marker in SECRET_FIELD_MARKERS):
                if _read_string(item):
                    return True
            if _contains_raw_secret(item):
                return True
    elif isinstance(value, list):
        return any(_contains_raw_secret(item) for item in value)
    return False


def _normalize_capability_id(value: Any) -> str:
    return _read_string(value).lower().replace("-", "_").replace(" ", "_")


def _normalize_capabilities(value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    if not payload and isinstance(value, list):
        payload = {"capabilities": value}

    raw_capabilities = payload.get("capabilities")
    if raw_capabilities is None:
        raw_capabilities = payload.get("features")
    if isinstance(raw_capabilities, dict):
        capability_ids = [
            _normalize_capability_id(key)
            for key, enabled in raw_capabilities.items()
            if bool(enabled) and _normalize_capability_id(key)
        ]
    else:
        capability_ids = [_normalize_capability_id(item) for item in _coerce_list(raw_capabilities)]

    if _coerce_dict(payload.get("endpoints")).get("chat") or _coerce_dict(payload.get("endpoints")).get("chat_url"):
        capability_ids.append(EXTERNAL_AGENT_CAPABILITY_CHAT)

    unique = sorted({item for item in capability_ids if item in ALLOWED_EXTERNAL_AGENT_CAPABILITIES})
    return {
        "capabilities": unique,
        "chat": EXTERNAL_AGENT_CAPABILITY_CHAT in unique,
        "knowledge_read": "knowledge_read" in unique or "knowledge" in unique,
        "knowledge_write": "knowledge_write" in unique,
        "memory_read": "memory_read" in unique or "memory" in unique,
        "memory_write": "memory_write" in unique,
        "actions": "actions" in unique or "tools" in unique,
        "logs": "logs" in unique or "activity" in unique,
    }


def _is_ip_private_or_loopback(hostname: str) -> bool:
    try:
        address = ipaddress.ip_address(hostname)
        return address.is_private or address.is_loopback or address.is_link_local or address.is_reserved
    except ValueError:
        return False


def _resolve_host_is_private(hostname: str) -> bool:
    if _is_ip_private_or_loopback(hostname):
        return True
    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    for info in infos:
        address = info[4][0]
        if _is_ip_private_or_loopback(address):
            return True
    return False


def _environment_token() -> str:
    return str(os.getenv("EMPYRALIS_DEPLOY_ENV") or os.getenv("ORION_ENV") or os.getenv("ENV") or os.getenv("NODE_ENV") or "").strip().lower()


def _local_store_allowed() -> bool:
    token = _environment_token()
    if token in {"prod", "production", "staging"}:
        return False
    explicit = str(os.getenv("EMPYRALIS_EXTERNAL_AGENT_LOCAL_STORE") or "").strip().lower()
    if explicit in {"1", "true", "yes", "on"}:
        return True
    if os.getenv("PYTEST_CURRENT_TEST"):
        return True
    return token in {"dev", "development", "local", "test", "testing"}


def _require_control_plane_or_local_store(connection: Any) -> None:
    if connection is not None:
        return
    if _local_store_allowed():
        return
    raise RuntimeError("Connected external agents require control-plane storage; local store fallback is disabled.")


def validate_public_https_url(value: Any, *, field_name: str = "endpoint", check_dns: bool = False) -> str:
    url = _read_string(value)
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"{field_name} must use HTTPS unless routed through an Agent Computer connector.")
    hostname = _read_string(parsed.hostname)
    if not hostname:
        raise ValueError(f"{field_name} must include a hostname.")
    lowered = hostname.lower()
    if lowered in {"localhost", "localhost.localdomain"} or lowered.endswith(".local"):
        raise ValueError(f"{field_name} cannot target localhost/private-network hosts directly.")
    if check_dns and _resolve_host_is_private(hostname):
        raise ValueError(f"{field_name} cannot target private-network hosts directly.")
    return url


async def _validate_public_https_url_dns(value: Any, *, field_name: str = "endpoint") -> str:
    url = validate_public_https_url(value, field_name=field_name, check_dns=False)
    if not url:
        return ""
    hostname = _read_string(urlparse(url).hostname)
    if await asyncio.to_thread(_resolve_host_is_private, hostname):
        raise ValueError(f"{field_name} cannot target private-network hosts directly.")
    return url


def _normalize_endpoints(value: Any) -> Dict[str, str]:
    payload = _coerce_dict(value)
    unexpected = sorted(set(payload.keys()) - ALLOWED_ENDPOINT_KEYS)
    if unexpected:
        raise ValueError(f"External agent endpoint refs include unsupported fields: {', '.join(unexpected)}.")
    normalized: Dict[str, str] = {}
    for source_key, target_key in {
        "base_url": "base_url",
        "manifest_url": "manifest_url",
        "chat_url": "chat_url",
        "chat": "chat_url",
        "health_url": "health_url",
        "health": "health_url",
        "logs_url": "logs_url",
        "logs": "logs_url",
    }.items():
        if source_key not in payload:
            continue
        normalized[target_key] = validate_public_https_url(payload.get(source_key), field_name=source_key)
    if normalized.get("base_url") and not normalized.get("manifest_url"):
        normalized["manifest_url"] = urljoin(normalized["base_url"].rstrip("/") + "/", ".well-known/agent-manifest.json")
    return {key: value for key, value in normalized.items() if value}


async def _validate_endpoint_map_dns(endpoints: Dict[str, str]) -> Dict[str, str]:
    validated: Dict[str, str] = {}
    for key, value in dict(endpoints or {}).items():
        validated[key] = await _validate_public_https_url_dns(value, field_name=key)
    return {key: value for key, value in validated.items() if value}


def _manifest_endpoints(manifest: Any) -> Dict[str, str]:
    payload = _coerce_dict(manifest)
    endpoints = _coerce_dict(payload.get("endpoints"))
    if not endpoints:
        endpoints = _coerce_dict(payload.get("endpoint_refs"))
    return _normalize_endpoints(endpoints)


def _sanitize_manifest(value: Any) -> Dict[str, Any]:
    if value is None or value == "":
        return {}
    if isinstance(value, dict):
        payload = dict(value)
    elif isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception as error:
            raise ValueError("External agent manifest must be valid JSON.") from error
        if not isinstance(parsed, dict):
            raise ValueError("External agent manifest must be a JSON object.")
        payload = dict(parsed)
    else:
        raise ValueError("External agent manifest must be a JSON object.")
    unexpected = sorted(set(payload.keys()) - ALLOWED_MANIFEST_KEYS)
    if unexpected:
        raise ValueError(f"External agent manifest includes unsupported fields: {', '.join(unexpected)}.")
    auth_payload = payload.get("auth")
    if auth_payload is not None:
        auth = _coerce_dict(auth_payload)
        if not auth:
            raise ValueError("External agent manifest auth must be an object.")
        unexpected_auth = sorted(set(auth.keys()) - ALLOWED_AUTH_MANIFEST_KEYS)
        if unexpected_auth:
            raise ValueError(f"External agent manifest auth includes unsupported fields: {', '.join(unexpected_auth)}.")
    if _contains_raw_secret(payload):
        raise ValueError("External agent manifests may not contain raw secrets; store a secret_ref instead.")
    return _redact_secret_fields(payload)


def _json_response_payload(response: Any, *, max_bytes: int, label: str) -> Dict[str, Any]:
    content = getattr(response, "content", None)
    if isinstance(content, (bytes, bytearray)) and len(content) > max_bytes:
        raise ValueError(f"{label} response exceeded {max_bytes} bytes.")
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError(f"{label} response must be a JSON object.")
    if content is None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")
        if len(encoded) > max_bytes:
            raise ValueError(f"{label} response exceeded {max_bytes} bytes.")
    return payload


def _credential_id_from_secret_ref(secret_ref: Any) -> str:
    token = _read_string(secret_ref)
    if not token:
        return ""
    if token.startswith("vault://"):
        parsed = urlparse(token)
        path_parts = [part for part in parsed.path.split("/") if part]
        if path_parts:
            return path_parts[-1].strip()
        if parsed.netloc and parsed.netloc not in {"credential", "credentials", "workspace", "vault"}:
            return parsed.netloc.strip()
        return ""
    return token


def _auth_config_from_manifest(manifest: Any) -> Dict[str, str]:
    payload = _coerce_dict(manifest)
    auth = _coerce_dict(payload.get("auth"))
    return {
        "header_name": _read_string(auth.get("header_name"), "Authorization"),
        "scheme": _read_string(auth.get("scheme") or auth.get("auth_scheme") or payload.get("auth_scheme") or payload.get("auth_type") or payload.get("auth_mode"), "bearer").lower(),
    }


def _auth_headers_from_credentials(credentials: Dict[str, Any], manifest: Any) -> Dict[str, str]:
    config = _auth_config_from_manifest(manifest)
    header_name = config["header_name"] or "Authorization"
    direct_value = _read_string(credentials.get("authorization") or credentials.get("auth_header") or credentials.get("header_value"))
    if direct_value:
        return {header_name: direct_value}
    token = _read_string(
        credentials.get("api_key")
        or credentials.get("access_token")
        or credentials.get("oauth_token")
        or credentials.get("token")
    )
    if not token:
        raise ValueError("External agent credential payload does not contain an injectable auth token.")
    scheme = config["scheme"]
    if header_name.lower() == "authorization" and scheme not in {"raw", "none", "no_auth"}:
        prefix = "Bearer" if scheme in {"", "api_key", "bearer", "oauth", "oauth_token", "token"} else scheme.title()
        return {header_name: f"{prefix} {token}"}
    return {header_name: token}


def _target_domain(value: str) -> str:
    return _read_string(urlparse(value).hostname).lower()


def _resolve_auth_headers_for_call(
    *,
    tenant_id: str,
    workspace_id: str,
    agent: Dict[str, Any],
    target_url: str,
) -> Dict[str, str]:
    secret_ref = _read_string(agent.get("secret_ref"))
    if not secret_ref:
        return {}
    credential_id = _credential_id_from_secret_ref(secret_ref)
    if not credential_id:
        raise ValueError("External agent credential reference is invalid.")
    domain = _target_domain(target_url)
    try:
        credentials = provider_profiles_service.resolve_vault_credential(
            credential_id,
            workspace_id,
            tenant_id=tenant_id,
            allowed_fields=SECRET_RESOLUTION_FIELDS,
            actor_type="studio_connected_external_agent",
            actor_id=_read_string(agent.get("id")),
            purpose="connected_external_agent_proxy",
            target_domain=domain,
            allowed_domains=[domain] if domain else [],
            ttl_seconds=30,
        )
    except Exception as error:
        raise ValueError("External agent credential could not be resolved.") from error
    return _auth_headers_from_credentials(credentials, agent.get("manifest"))


def _validate_recent_messages(value: Any) -> List[Dict[str, str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("recent_messages must be a list.")
    if len(value) > MAX_RECENT_MESSAGES:
        raise ValueError(f"recent_messages cannot include more than {MAX_RECENT_MESSAGES} messages.")
    out: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("recent_messages entries must be objects.")
        role = _read_string(item.get("role")).lower()
        content = _read_string(item.get("content") or item.get("text"))
        if role not in {"user", "assistant", "system"}:
            raise ValueError("recent_messages role must be user, assistant, or system.")
        if not content:
            raise ValueError("recent_messages content is required.")
        if len(content) > MAX_RECENT_MESSAGE_CHARS:
            raise ValueError(f"recent_messages content cannot exceed {MAX_RECENT_MESSAGE_CHARS} characters.")
        out.append({"role": role, "content": content})
    return out


def _surface_from_record(record: Dict[str, Any]) -> Dict[str, Any]:
    metadata = _coerce_dict(record.get("metadata"))
    manifest = _coerce_dict(record.get("manifest"))
    endpoints = _normalize_endpoints(metadata.get("endpoint_refs") or {})
    capability_manifest = _normalize_capabilities(metadata.get("capability_manifest") or manifest)
    display_name = _read_string(record.get("label") or record.get("name"), "Connected Agent")
    status = _read_string(record.get("status"), "active")
    connection_state = _read_string(metadata.get("connection_state"), CONNECTION_STATE_UNVERIFIED)
    if status in {"revoked", "disabled"}:
        connection_state = CONNECTION_STATE_REVOKED
    return {
        "id": _read_string(record.get("id")),
        "surface_kind": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT,
        "studio_object_type": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT,
        "workspace_id": _read_string(record.get("workspace_id")),
        "tenant_id": _read_string(record.get("tenant_id")),
        "name": display_name,
        "label": display_name,
        "description": _read_string(record.get("description") or metadata.get("description")),
        "provider_kind": _normalize_provider_kind(metadata.get("provider_kind")),
        "status": status,
        "enabled": bool(record.get("enabled", status != "revoked")),
        "connection_state": connection_state,
        "trust_state": _read_string(metadata.get("trust_state"), connection_state),
        "endpoint_refs": endpoints,
        "secret_ref": _read_string(_coerce_dict(metadata.get("auth")).get("secret_ref")) or None,
        "capability_manifest": capability_manifest,
        "manifest": manifest,
        "last_error": _read_string(metadata.get("last_error")) or None,
        "last_manifest_refresh_at": _read_string(metadata.get("last_manifest_refresh_at")) or None,
        "created_at": _read_string(record.get("created_at")) or None,
        "updated_at": _read_string(record.get("updated_at")) or None,
    }


def _local_key(tenant_id: str, workspace_id: str, external_agent_id: str) -> tuple[str, str, str]:
    return (_read_string(tenant_id), _read_string(workspace_id), _read_string(external_agent_id))


def _local_insert(surface: Dict[str, Any]) -> Dict[str, Any]:
    LOCAL_STORE[_local_key(surface["tenant_id"], surface["workspace_id"], surface["id"])] = dict(surface)
    return dict(surface)


async def list_connected_external_agents(*, tenant_id: str, workspace_id: str) -> Dict[str, Any]:
    async with control_plane_repository._scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        _require_control_plane_or_local_store(connection)
        if connection is None:
            items = [
                dict(item)
                for (item_tenant, item_workspace, _), item in LOCAL_STORE.items()
                if item_tenant == tenant_id and item_workspace == workspace_id
            ]
            return {"workspace_id": workspace_id, "tenant_id": tenant_id, "items": items}
        rows = await connection.fetch(
            """
            SELECT
                wai.id,
                wai.tenant_id,
                wai.workspace_id,
                wai.label,
                wai.status,
                wai.enabled,
                wai.metadata,
                wai.created_at,
                wai.updated_at,
                ad.name,
                ad.description,
                am.manifest
            FROM workspace_agent_installs wai
            JOIN agent_definitions ad
                ON ad.id = wai.agent_definition_id
                AND ad.tenant_id = wai.tenant_id
                AND ad.workspace_id = wai.workspace_id
            LEFT JOIN agent_manifests am
                ON am.agent_install_id = wai.id
                AND am.tenant_id = wai.tenant_id
                AND am.workspace_id = wai.workspace_id
            WHERE wai.tenant_id = $1
              AND wai.workspace_id = $2
              AND wai.metadata->>'surface_kind' = $3
            ORDER BY wai.updated_at DESC
            """,
            tenant_id,
            workspace_id,
            SURFACE_KIND_CONNECTED_EXTERNAL_AGENT,
        )
    return {
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "items": [_surface_from_record(dict(row)) for row in rows],
    }


async def get_connected_external_agent(*, tenant_id: str, workspace_id: str, external_agent_id: str) -> Dict[str, Any]:
    token = _read_string(external_agent_id)
    if not token:
        raise ValueError("external_agent_id is required.")
    async with control_plane_repository._scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        _require_control_plane_or_local_store(connection)
        if connection is None:
            item = LOCAL_STORE.get(_local_key(tenant_id, workspace_id, token))
            if not item:
                raise LookupError("Connected external agent not found.")
            return dict(item)
        row = await connection.fetchrow(
            """
            SELECT
                wai.id,
                wai.tenant_id,
                wai.workspace_id,
                wai.label,
                wai.status,
                wai.enabled,
                wai.metadata,
                wai.created_at,
                wai.updated_at,
                ad.name,
                ad.description,
                am.manifest
            FROM workspace_agent_installs wai
            JOIN agent_definitions ad
                ON ad.id = wai.agent_definition_id
                AND ad.tenant_id = wai.tenant_id
                AND ad.workspace_id = wai.workspace_id
            LEFT JOIN agent_manifests am
                ON am.agent_install_id = wai.id
                AND am.tenant_id = wai.tenant_id
                AND am.workspace_id = wai.workspace_id
            WHERE wai.tenant_id = $1
              AND wai.workspace_id = $2
              AND wai.id = $3
              AND wai.metadata->>'surface_kind' = $4
            LIMIT 1
            """,
            tenant_id,
            workspace_id,
            token,
            SURFACE_KIND_CONNECTED_EXTERNAL_AGENT,
        )
    if row is None:
        raise LookupError("Connected external agent not found.")
    return _surface_from_record(dict(row))


def _build_metadata(
    *,
    provider_kind: str,
    endpoints: Dict[str, str],
    manifest: Dict[str, Any],
    secret_ref: Optional[str],
    connection_state: str,
    existing: Optional[Dict[str, Any]] = None,
    last_error: Optional[str] = None,
) -> Dict[str, Any]:
    current = _coerce_dict(existing)
    auth_payload = _coerce_dict(current.get("auth"))
    if secret_ref is not None:
        auth_payload = {"secret_ref": _read_string(secret_ref)}
    return {
        **current,
        "surface_kind": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT,
        "provider_kind": provider_kind,
        "endpoint_refs": dict(endpoints),
        "auth": auth_payload,
        "capability_manifest": _normalize_capabilities(manifest),
        "connection_state": connection_state,
        "trust_state": connection_state,
        "last_error": last_error,
    }


async def create_connected_external_agent(
    *,
    tenant_id: str,
    workspace_id: str,
    name: str,
    provider_kind: Any = "custom",
    endpoints: Any = None,
    manifest: Any = None,
    secret_ref: Optional[str] = None,
    created_by_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    display_name = _read_string(name)
    if not display_name:
        raise ValueError("name is required.")
    if _contains_raw_secret({"endpoints": endpoints, "manifest": manifest}):
        raise ValueError("Raw external-agent secrets are not allowed; provide secret_ref.")
    normalized_provider = _normalize_provider_kind(provider_kind)
    normalized_manifest = _sanitize_manifest(manifest)
    normalized_endpoints = _normalize_endpoints(endpoints or {})
    normalized_endpoints = {**normalized_endpoints, **_manifest_endpoints(normalized_manifest)}
    normalized_endpoints = await _validate_endpoint_map_dns(normalized_endpoints)
    install_id = f"extagent_{uuid.uuid4().hex}"
    definition_id = f"extdef_{uuid.uuid4().hex}"
    version_id = f"extver_{uuid.uuid4().hex}"
    now = _now_iso()
    metadata = _build_metadata(
        provider_kind=normalized_provider,
        endpoints=normalized_endpoints,
        manifest=normalized_manifest,
        secret_ref=secret_ref,
        connection_state=CONNECTION_STATE_UNVERIFIED,
    )

    async with control_plane_repository._scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        _require_control_plane_or_local_store(connection)
        if connection is None:
            return _local_insert(_surface_from_record({
                "id": install_id,
                "tenant_id": tenant_id,
                "workspace_id": workspace_id,
                "label": display_name,
                "name": display_name,
                "description": _read_string(normalized_manifest.get("description") or normalized_manifest.get("summary")),
                "status": "active",
                "enabled": True,
                "metadata": metadata,
                "manifest": normalized_manifest,
                "created_at": now,
                "updated_at": now,
            }))
        await connection.execute(
            """
            INSERT INTO agent_definitions (
                id, tenant_id, workspace_id, slug, name, description, agent_kind, visibility, status,
                category, icon, created_by_user_id, current_version_id, published_version_id,
                source_workflow_definition_id, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, 'specialist', 'workspace', 'draft',
                'Connected Agent', NULL, $7, $8, $8,
                NULL, $9::jsonb, NOW(), NOW()
            )
            """,
            definition_id,
            tenant_id,
            workspace_id,
            f"external-{install_id}",
            display_name,
            _read_string(normalized_manifest.get("description") or normalized_manifest.get("summary")),
            created_by_user_id,
            version_id,
            _to_json({"surface_kind": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT}, default={}),
        )
        await connection.execute(
            """
            INSERT INTO agent_definition_versions (
                id, tenant_id, workspace_id, agent_definition_id, version_number, status, manifest,
                compiled_workflow_version_id, capability_manifest, memory_scope_manifest, policy_manifest,
                placement_manifest, template_inputs_schema, metadata, created_by_user_id, created_at
            ) VALUES (
                $1, $2, $3, $4, 1, 'draft', $5::jsonb,
                NULL, $6::jsonb, '{}'::jsonb, $7::jsonb,
                $8::jsonb, '{}'::jsonb, $9::jsonb, $10, NOW()
            )
            """,
            version_id,
            tenant_id,
            workspace_id,
            definition_id,
            _to_json(normalized_manifest, default={}),
            _to_json(_normalize_capabilities(normalized_manifest), default={}),
            _to_json({"approval_default": "owner_approval"}, default={}),
            _to_json({"external_endpoint_refs": normalized_endpoints}, default={}),
            _to_json({"surface_kind": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT}, default={}),
            created_by_user_id,
        )
        await connection.execute(
            """
            INSERT INTO workspace_agent_installs (
                id, tenant_id, workspace_id, agent_definition_id, agent_definition_version_id, installed_by_user_id,
                install_scope, owner_user_id, thread_id, label, status, enabled, runtime_profile_id, compiled_workflow_version_id,
                root_folder_uri, tool_toggles, folder_grants, connector_bindings, memory_scope_overrides,
                policy_context_overrides, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                'workspace', $6, NULL, $7, 'active', TRUE, NULL, NULL,
                NULL, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
                $8::jsonb, $9::jsonb, NOW(), NOW()
            )
            """,
            install_id,
            tenant_id,
            workspace_id,
            definition_id,
            version_id,
            created_by_user_id,
            display_name,
            _to_json({"approval_default": "owner_approval"}, default={}),
            _to_json(metadata, default={}),
        )
        await connection.execute(
            """
            INSERT INTO agent_manifests (
                id, tenant_id, workspace_id, agent_install_id, manifest_id, status, manifest, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, 'draft', $6::jsonb, $7::jsonb, NOW(), NOW()
            )
            """,
            f"amanifest_{install_id}",
            tenant_id,
            workspace_id,
            install_id,
            _read_string(normalized_manifest.get("id"), f"external:{install_id}"),
            _to_json(normalized_manifest, default={}),
            _to_json({"surface_kind": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT}, default={}),
        )
    return await get_connected_external_agent(tenant_id=tenant_id, workspace_id=workspace_id, external_agent_id=install_id)


async def update_connected_external_agent(
    *,
    tenant_id: str,
    workspace_id: str,
    external_agent_id: str,
    name: Optional[str] = None,
    provider_kind: Any = None,
    endpoints: Any = None,
    manifest: Any = None,
    secret_ref: Optional[str] = None,
) -> Dict[str, Any]:
    current = await get_connected_external_agent(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        external_agent_id=external_agent_id,
    )
    if _contains_raw_secret({"endpoints": endpoints, "manifest": manifest}):
        raise ValueError("Raw external-agent secrets are not allowed; provide secret_ref.")
    next_name = _read_string(name, current["name"])
    next_provider = _normalize_provider_kind(provider_kind or current.get("provider_kind"))
    next_manifest = _sanitize_manifest(manifest if manifest is not None else current.get("manifest"))
    next_endpoints = dict(current.get("endpoint_refs") or {})
    if endpoints is not None:
        next_endpoints = _normalize_endpoints(endpoints)
    next_endpoints = {**next_endpoints, **_manifest_endpoints(next_manifest)}
    next_endpoints = await _validate_endpoint_map_dns(next_endpoints)
    endpoint_changed = next_endpoints != (current.get("endpoint_refs") or {})
    next_connection_state = CONNECTION_STATE_UNVERIFIED if endpoint_changed else _read_string(current.get("connection_state"), CONNECTION_STATE_UNVERIFIED)
    metadata = _build_metadata(
        provider_kind=next_provider,
        endpoints=next_endpoints,
        manifest=next_manifest,
        secret_ref=secret_ref,
        connection_state=next_connection_state,
        existing=current,
    )
    now = _now_iso()
    async with control_plane_repository._scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        _require_control_plane_or_local_store(connection)
        if connection is None:
            updated = {
                **current,
                "name": next_name,
                "label": next_name,
                "provider_kind": next_provider,
                "endpoint_refs": next_endpoints,
                "manifest": next_manifest,
                "capability_manifest": _normalize_capabilities(next_manifest),
                "connection_state": next_connection_state,
                "trust_state": next_connection_state,
                "updated_at": now,
            }
            _local_insert(updated)
            return updated
        await connection.execute(
            """
            UPDATE workspace_agent_installs
            SET label = $4, metadata = $5::jsonb, updated_at = NOW()
            WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3
            """,
            tenant_id,
            workspace_id,
            external_agent_id,
            next_name,
            _to_json(metadata, default={}),
        )
        await connection.execute(
            """
            UPDATE agent_manifests
            SET manifest = $4::jsonb, metadata = $5::jsonb, updated_at = NOW()
            WHERE tenant_id = $1 AND workspace_id = $2 AND agent_install_id = $3
            """,
            tenant_id,
            workspace_id,
            external_agent_id,
            _to_json(next_manifest, default={}),
            _to_json({"surface_kind": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT}, default={}),
        )
    return await get_connected_external_agent(tenant_id=tenant_id, workspace_id=workspace_id, external_agent_id=external_agent_id)


async def refresh_connected_external_agent_manifest(
    *,
    tenant_id: str,
    workspace_id: str,
    external_agent_id: str,
    http_client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, Any]:
    current = await get_connected_external_agent(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        external_agent_id=external_agent_id,
    )
    endpoints = dict(current.get("endpoint_refs") or {})
    manifest_url = await _validate_public_https_url_dns(endpoints.get("manifest_url"), field_name="manifest_url")
    if not manifest_url:
        raise ValueError("External agent has no manifest endpoint.")
    auth_headers = _resolve_auth_headers_for_call(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        agent=current,
        target_url=manifest_url,
    )
    close_client = False
    client = http_client
    if client is None:
        client = httpx.AsyncClient(timeout=10.0, follow_redirects=False)
        close_client = True
    try:
        try:
            response = await client.get(manifest_url, headers={"Accept": "application/json", **auth_headers})
            response.raise_for_status()
            manifest_payload = _sanitize_manifest(_json_response_payload(
                response,
                max_bytes=MAX_MANIFEST_RESPONSE_BYTES,
                label="Manifest",
            ))
        except Exception as error:
            await _mark_connection_error(
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                external_agent_id=external_agent_id,
                message=str(error),
            )
            raise ValueError(f"External agent manifest refresh failed: {error}") from error

        manifest_endpoints = _manifest_endpoints(manifest_payload)
        next_endpoints = {**endpoints, **manifest_endpoints}
        next_endpoints = await _validate_endpoint_map_dns(next_endpoints)
        health_url = next_endpoints.get("health_url")
        if health_url:
            try:
                health_response = await client.get(
                    health_url,
                    headers={"Accept": "application/json", **_resolve_auth_headers_for_call(
                        tenant_id=tenant_id,
                        workspace_id=workspace_id,
                        agent=current,
                        target_url=health_url,
                    )},
                )
                health_response.raise_for_status()
                _json_response_payload(health_response, max_bytes=MAX_MANIFEST_RESPONSE_BYTES, label="Health")
            except Exception as error:
                await _mark_connection_error(
                    tenant_id=tenant_id,
                    workspace_id=workspace_id,
                    external_agent_id=external_agent_id,
                    message="External agent health verification failed.",
                )
                raise ValueError("External agent health verification failed.") from error
    finally:
        if close_client:
            await client.aclose()
    metadata = _build_metadata(
        provider_kind=_normalize_provider_kind(current.get("provider_kind")),
        endpoints=next_endpoints,
        manifest=manifest_payload,
        secret_ref=current.get("secret_ref"),
        connection_state=CONNECTION_STATE_VERIFIED,
        existing=current,
    )
    metadata["last_manifest_refresh_at"] = _now_iso()
    metadata["handshake_status"] = "verified"
    metadata["handshake_verified_at"] = metadata["last_manifest_refresh_at"]
    metadata["last_error"] = None
    async with control_plane_repository._scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        _require_control_plane_or_local_store(connection)
        if connection is None:
            updated = {
                **current,
                "manifest": manifest_payload,
                "endpoint_refs": next_endpoints,
                "capability_manifest": _normalize_capabilities(manifest_payload),
                "connection_state": CONNECTION_STATE_VERIFIED,
                "trust_state": CONNECTION_STATE_VERIFIED,
                "last_manifest_refresh_at": metadata["last_manifest_refresh_at"],
                "handshake_status": metadata["handshake_status"],
                "handshake_verified_at": metadata["handshake_verified_at"],
                "last_error": None,
                "updated_at": _now_iso(),
            }
            _local_insert(updated)
            return updated
        await connection.execute(
            """
            UPDATE workspace_agent_installs
            SET metadata = $4::jsonb, updated_at = NOW()
            WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3
            """,
            tenant_id,
            workspace_id,
            external_agent_id,
            _to_json(metadata, default={}),
        )
        await connection.execute(
            """
            UPDATE agent_manifests
            SET manifest = $4::jsonb, metadata = $5::jsonb, status = 'active', updated_at = NOW()
            WHERE tenant_id = $1 AND workspace_id = $2 AND agent_install_id = $3
            """,
            tenant_id,
            workspace_id,
            external_agent_id,
            _to_json(manifest_payload, default={}),
            _to_json({"surface_kind": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT}, default={}),
        )
    return await get_connected_external_agent(tenant_id=tenant_id, workspace_id=workspace_id, external_agent_id=external_agent_id)


async def _mark_connection_error(*, tenant_id: str, workspace_id: str, external_agent_id: str, message: str) -> None:
    current = await get_connected_external_agent(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        external_agent_id=external_agent_id,
    )
    metadata = _build_metadata(
        provider_kind=_normalize_provider_kind(current.get("provider_kind")),
        endpoints=dict(current.get("endpoint_refs") or {}),
        manifest=_coerce_dict(current.get("manifest")),
        secret_ref=current.get("secret_ref"),
        connection_state=CONNECTION_STATE_ERROR,
        existing=current,
        last_error=message,
    )
    async with control_plane_repository._scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        _require_control_plane_or_local_store(connection)
        if connection is None:
            _local_insert({
                **current,
                "connection_state": CONNECTION_STATE_ERROR,
                "trust_state": CONNECTION_STATE_ERROR,
                "last_error": message,
                "updated_at": _now_iso(),
            })
            return
        await connection.execute(
            """
            UPDATE workspace_agent_installs
            SET metadata = $4::jsonb, updated_at = NOW()
            WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3
            """,
            tenant_id,
            workspace_id,
            external_agent_id,
            _to_json(metadata, default={}),
        )


def _extract_chat_reply(payload: Any) -> str:
    data = _coerce_dict(payload)
    for key in ("reply", "message", "content", "text", "output"):
        value = _read_string(data.get(key))
        if value:
            return value
    choices = _coerce_list(data.get("choices"))
    if choices:
        first = _coerce_dict(choices[0])
        message = _coerce_dict(first.get("message"))
        value = _read_string(message.get("content") or first.get("text"))
        if value:
            return value
    return ""


async def chat_with_connected_external_agent(
    *,
    tenant_id: str,
    workspace_id: str,
    external_agent_id: str,
    message: str,
    recent_messages: Optional[List[Dict[str, Any]]] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, Any]:
    normalized_message = _read_string(message)
    if not normalized_message:
        raise ValueError("message is required.")
    if len(normalized_message) > MAX_CHAT_MESSAGE_CHARS:
        raise ValueError(f"message cannot exceed {MAX_CHAT_MESSAGE_CHARS} characters.")
    validated_recent_messages = _validate_recent_messages(recent_messages)
    agent = await get_connected_external_agent(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        external_agent_id=external_agent_id,
    )
    if _read_string(agent.get("connection_state")) != CONNECTION_STATE_VERIFIED:
        raise ValueError("External agent must be verified before private chat is available.")
    if _read_string(agent.get("status")) == CONNECTION_STATE_REVOKED or not bool(agent.get("enabled", True)):
        raise ValueError("External agent is disconnected.")
    capabilities = _coerce_dict(agent.get("capability_manifest"))
    if not bool(capabilities.get("chat")):
        raise ValueError("External agent manifest does not expose private chat.")
    endpoints = _coerce_dict(agent.get("endpoint_refs"))
    chat_url = await _validate_public_https_url_dns(endpoints.get("chat_url"), field_name="chat_url")
    if not chat_url:
        raise ValueError("External agent has no chat endpoint.")
    auth_headers = _resolve_auth_headers_for_call(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        agent=agent,
        target_url=chat_url,
    )

    body = {
        "message": normalized_message,
        "workspace_id": workspace_id,
        "agent_id": external_agent_id,
        "channel": "private_workspace",
        "recent_messages": validated_recent_messages,
        "metadata": {
            "source": "empyralis_connected_external_agent_chat",
        },
    }
    close_client = False
    client = http_client
    if client is None:
        client = httpx.AsyncClient(timeout=20.0, follow_redirects=False)
        close_client = True
    try:
        response = await client.post(chat_url, json=body, headers={"Accept": "application/json", **auth_headers})
        response.raise_for_status()
        payload = _redact_secret_fields(_json_response_payload(
            response,
            max_bytes=MAX_CHAT_RESPONSE_BYTES,
            label="Chat",
        ))
    except Exception as error:
        raise ValueError(f"External agent chat failed: {error}") from error
    finally:
        if close_client:
            await client.aclose()

    reply = _extract_chat_reply(payload)
    if not reply:
        raise ValueError("External agent chat response did not include a reply.")
    return {
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "external_agent_id": external_agent_id,
        "reply": reply,
        "run_details": {
            "surface_kind": SURFACE_KIND_CONNECTED_EXTERNAL_AGENT,
            "provider_kind": agent.get("provider_kind"),
            "connection_state": agent.get("connection_state"),
            "endpoint": "chat_url",
        },
        "raw_response": payload,
    }


async def disconnect_connected_external_agent(
    *,
    tenant_id: str,
    workspace_id: str,
    external_agent_id: str,
) -> Dict[str, Any]:
    current = await get_connected_external_agent(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        external_agent_id=external_agent_id,
    )
    metadata = _build_metadata(
        provider_kind=_normalize_provider_kind(current.get("provider_kind")),
        endpoints=dict(current.get("endpoint_refs") or {}),
        manifest=_coerce_dict(current.get("manifest")),
        secret_ref=current.get("secret_ref"),
        connection_state=CONNECTION_STATE_REVOKED,
        existing=current,
    )
    async with control_plane_repository._scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        _require_control_plane_or_local_store(connection)
        if connection is None:
            updated = {
                **current,
                "status": "revoked",
                "enabled": False,
                "connection_state": CONNECTION_STATE_REVOKED,
                "trust_state": CONNECTION_STATE_REVOKED,
                "updated_at": _now_iso(),
            }
            _local_insert(updated)
            return updated
        await connection.execute(
            """
            UPDATE workspace_agent_installs
            SET status = 'revoked', enabled = FALSE, metadata = $4::jsonb, updated_at = NOW()
            WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3
            """,
            tenant_id,
            workspace_id,
            external_agent_id,
            _to_json(metadata, default={}),
        )
    return await get_connected_external_agent(tenant_id=tenant_id, workspace_id=workspace_id, external_agent_id=external_agent_id)


async def build_agent_surfaces_payload(
    *,
    tenant_id: str,
    workspace_id: str,
    native_agents: Optional[List[Dict[str, Any]]] = None,
    agent_computers: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    external_payload = await list_connected_external_agents(tenant_id=tenant_id, workspace_id=workspace_id)
    native_items = [
        {
            "id": _read_string(item.get("id")),
            "surface_kind": SURFACE_KIND_NATIVE_STUDIO_AGENT,
            "name": _read_string(item.get("name"), "Business Agent"),
            "status": _read_string(item.get("deployment_state"), "draft"),
            "record": item,
        }
        for item in list(native_agents or [])
        if isinstance(item, dict)
    ]
    computer_items = [
        {
            "id": _read_string(item.get("attachment_id") or item.get("id")),
            "surface_kind": SURFACE_KIND_AGENT_COMPUTER,
            "name": _read_string(item.get("label") or item.get("runtime_profile_label"), "Agent Computer"),
            "status": _read_string(item.get("status") or item.get("self_hosted_node_status"), "unknown"),
            "record": item,
        }
        for item in list(agent_computers or [])
        if isinstance(item, dict)
    ]
    external_items = list(external_payload.get("items") or [])
    return {
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "native_studio_agents": native_items,
        "connected_external_agents": external_items,
        "agent_computers": computer_items,
        "items": native_items + external_items + computer_items,
    }


def _reset_for_tests() -> None:
    LOCAL_STORE.clear()


def http_error_from_exception(error: Exception) -> HTTPException:
    if isinstance(error, LookupError):
        return HTTPException(status_code=404, detail=str(error))
    return HTTPException(status_code=400, detail=str(error))
