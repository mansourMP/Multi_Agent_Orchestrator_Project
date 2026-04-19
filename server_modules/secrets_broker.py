from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from server_modules import control_plane_repository, safe_mode_service
from server_modules.vault_helpers import (
    DecryptFn,
    LoadVaultFn,
    normalize_workspace_id,
    resolve_default_vault_credential as _raw_resolve_default_vault_credential,
    resolve_vault_credential as _raw_resolve_vault_credential,
)


_TOKEN_VERSION = "empyralis.secret-grant.v1"
DEFAULT_SECRET_GRANT_TTL_SECONDS = 30
_SUPPORTED_SECRET_KINDS = {"connector_credential", "provider_credential"}
_SUPPORTED_CONNECTOR_CLASSES = {"api_connector", "browser_connector", "media_generation_connector"}
_LOCAL_ENV_TOKENS = {"", "dev", "development", "local", "test", "testing"}
_INSECURE_BROKER_SECRETS = {
    "empyralis-dev-tool-broker-secret",
    "empyralis-dev-secrets-broker-secret",
}


@dataclass(frozen=True)
class SecretAccessGrant:
    token: str
    claims: Dict[str, Any]


class SecretBrokerError(RuntimeError):
    pass


class SecretAccessDeniedError(SecretBrokerError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = str(code or "secret_access_denied").strip() or "secret_access_denied"
        self.detail = str(detail or "Secret access was denied.").strip() or "Secret access was denied."


def _normalize_token(value: Any) -> str:
    return str(value or "").strip().lower()


def _ordered_unique(values: List[str]) -> List[str]:
    ordered: List[str] = []
    seen: set[str] = set()
    for raw in values:
        token = str(raw or "").strip()
        if not token or token in seen:
            continue
        seen.add(token)
        ordered.append(token)
    return ordered


def _normalize_secret_kind(secret_kind: Any) -> str:
    token = _normalize_token(secret_kind)
    if token not in _SUPPORTED_SECRET_KINDS:
        raise SecretAccessDeniedError("invalid_secret_kind", f"Unsupported secret kind '{secret_kind}'.")
    return token


def _normalize_connector_class(connector_class: Any) -> Optional[str]:
    token = _normalize_token(connector_class)
    if not token:
        return None
    if token not in _SUPPORTED_CONNECTOR_CLASSES:
        raise SecretAccessDeniedError("invalid_connector_class", f"Unsupported connector class '{connector_class}'.")
    return token


def _resolved_environment() -> str:
    return str(os.getenv("ORION_ENV") or os.getenv("ENV") or "").strip().lower()


def _environment_requires_explicit_secret() -> bool:
    return _resolved_environment() not in _LOCAL_ENV_TOKENS


def _signing_secret() -> bytes:
    secret = str(
        os.getenv("EMPYRALIS_SECRETS_BROKER_SECRET")
        or os.getenv("EMPYRALIS_TOOL_BROKER_SECRET")
        or ""
    ).strip()
    if secret and secret not in _INSECURE_BROKER_SECRETS:
        return secret.encode("utf-8")
    raise RuntimeError(
        "Broker secret must be explicitly set. Refusing to start with insecure default."
    )


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64decode(token: str) -> bytes:
    padding = "=" * (-len(token) % 4)
    return base64.urlsafe_b64decode(f"{token}{padding}")


def _json_dumps(value: Dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _normalize_allowed_fields(fields: Optional[List[str]]) -> List[str]:
    return _ordered_unique([str(item or "").strip() for item in list(fields or []) if str(item or "").strip()])


def issue_connector_secret_grant(
    *,
    tenant_id: Optional[str],
    workspace_id: Optional[str],
    credential_id: str,
    connector_id: Optional[str] = None,
    connector_class: Optional[str] = None,
    action_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    run_id: Optional[str] = None,
    runtime_mode: Optional[str] = None,
    allowed_fields: Optional[List[str]] = None,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    purpose: Optional[str] = None,
    ttl_seconds: int = DEFAULT_SECRET_GRANT_TTL_SECONDS,
) -> SecretAccessGrant:
    issued_at = int(time.time())
    expires_at = issued_at + max(int(ttl_seconds or DEFAULT_SECRET_GRANT_TTL_SECONDS), 1)
    claims = {
        "version": _TOKEN_VERSION,
        "access_id": f"sgrant_{secrets.token_urlsafe(12)}",
        "secret_kind": "connector_credential",
        "tenant_id": str(tenant_id or "").strip(),
        "workspace_id": normalize_workspace_id(workspace_id),
        "credential_id": str(credential_id or "").strip(),
        "provider_id": None,
        "connector_id": str(connector_id or "").strip().lower() or None,
        "connector_class": _normalize_connector_class(connector_class),
        "action_id": str(action_id or "").strip().lower() or None,
        "tool_name": str(tool_name or "").strip().lower() or None,
        "run_id": str(run_id or "").strip() or None,
        "runtime_mode": str(runtime_mode or "").strip().lower() or None,
        "allowed_fields": _normalize_allowed_fields(allowed_fields),
        "actor": {
            "type": str(actor_type or "runtime").strip().lower() or "runtime",
            "id": str(actor_id or "").strip() or None,
        },
        "purpose": str(purpose or "").strip().lower() or "connector_secret_resolution",
        "issued_at": issued_at,
        "expires_at": expires_at,
    }
    payload = _b64encode(_json_dumps(claims).encode("utf-8"))
    signature = _b64encode(hmac.new(_signing_secret(), payload.encode("utf-8"), hashlib.sha256).digest())
    return SecretAccessGrant(token=f"{payload}.{signature}", claims=claims)


def issue_provider_secret_grant(
    *,
    tenant_id: Optional[str],
    workspace_id: Optional[str],
    provider_id: str,
    credential_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    run_id: Optional[str] = None,
    runtime_mode: Optional[str] = None,
    allowed_fields: Optional[List[str]] = None,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    purpose: Optional[str] = None,
    ttl_seconds: int = DEFAULT_SECRET_GRANT_TTL_SECONDS,
) -> SecretAccessGrant:
    issued_at = int(time.time())
    expires_at = issued_at + max(int(ttl_seconds or DEFAULT_SECRET_GRANT_TTL_SECONDS), 1)
    claims = {
        "version": _TOKEN_VERSION,
        "access_id": f"sgrant_{secrets.token_urlsafe(12)}",
        "secret_kind": "provider_credential",
        "tenant_id": str(tenant_id or "").strip(),
        "workspace_id": normalize_workspace_id(workspace_id),
        "credential_id": str(credential_id or "").strip() or None,
        "provider_id": str(provider_id or "").strip().lower(),
        "connector_id": None,
        "action_id": None,
        "tool_name": str(tool_name or "").strip().lower() or None,
        "run_id": str(run_id or "").strip() or None,
        "runtime_mode": str(runtime_mode or "").strip().lower() or None,
        "allowed_fields": _normalize_allowed_fields(allowed_fields),
        "actor": {
            "type": str(actor_type or "runtime").strip().lower() or "runtime",
            "id": str(actor_id or "").strip() or None,
        },
        "purpose": str(purpose or "").strip().lower() or "provider_secret_resolution",
        "issued_at": issued_at,
        "expires_at": expires_at,
    }
    payload = _b64encode(_json_dumps(claims).encode("utf-8"))
    signature = _b64encode(hmac.new(_signing_secret(), payload.encode("utf-8"), hashlib.sha256).digest())
    return SecretAccessGrant(token=f"{payload}.{signature}", claims=claims)


def verify_secret_access_token(
    token: str,
    *,
    expected_secret_kind: str,
    expected_workspace_id: Optional[str] = None,
    expected_credential_id: Optional[str] = None,
    expected_provider_id: Optional[str] = None,
    now: Optional[int] = None,
) -> Dict[str, Any]:
    raw = str(token or "").strip()
    if "." not in raw:
        raise SecretAccessDeniedError("invalid_token", "Secret access token is malformed.")
    payload_part, signature_part = raw.split(".", 1)
    expected_signature = _b64encode(hmac.new(_signing_secret(), payload_part.encode("utf-8"), hashlib.sha256).digest())
    if not hmac.compare_digest(signature_part, expected_signature):
        raise SecretAccessDeniedError("invalid_token", "Secret access token signature is invalid.")
    try:
        claims = json.loads(_b64decode(payload_part))
    except Exception as error:
        raise SecretAccessDeniedError("invalid_token", "Secret access token payload is invalid.") from error
    if not isinstance(claims, dict):
        raise SecretAccessDeniedError("invalid_token", "Secret access token payload is invalid.")
    if str(claims.get("version") or "").strip() != _TOKEN_VERSION:
        raise SecretAccessDeniedError("invalid_token_version", "Secret access token version is invalid.")
    if _normalize_secret_kind(claims.get("secret_kind")) != _normalize_secret_kind(expected_secret_kind):
        raise SecretAccessDeniedError("secret_kind_mismatch", "Secret access token does not authorize this secret kind.")
    current_time = int(now if now is not None else time.time())
    if current_time >= int(claims.get("expires_at") or 0):
        raise SecretAccessDeniedError("token_expired", "Secret access token expired before the secret was resolved.")
    if expected_workspace_id is not None:
        actual_workspace_id = normalize_workspace_id(claims.get("workspace_id"))
        if actual_workspace_id != normalize_workspace_id(expected_workspace_id):
            raise SecretAccessDeniedError("workspace_mismatch", "Secret access token does not match the active workspace.")
    if expected_credential_id and str(claims.get("credential_id") or "").strip() != str(expected_credential_id or "").strip():
        raise SecretAccessDeniedError("credential_mismatch", "Secret access token does not match the credential id.")
    if expected_provider_id and str(claims.get("provider_id") or "").strip().lower() != str(expected_provider_id or "").strip().lower():
        raise SecretAccessDeniedError("provider_mismatch", "Secret access token does not match the provider.")
    return claims


def _project_secret_payload(payload: Dict[str, Any], allowed_fields: List[str]) -> Dict[str, Any]:
    if not allowed_fields:
        return dict(payload)
    projected: Dict[str, Any] = {}
    allowed_set = set(allowed_fields)
    for key, value in payload.items():
        if key.startswith("_") or key in allowed_set:
            projected[key] = value
    return projected


def _run_coro_sync(coro: Any) -> Any:
    try:
        return asyncio.run(coro)
    except RuntimeError as exc:
        if "asyncio.run() cannot be called from a running event loop" not in str(exc):
            raise

    result: Dict[str, Any] = {}
    failure: Dict[str, BaseException] = {}

    def _runner() -> None:
        try:
            result["value"] = asyncio.run(coro)
        except BaseException as err:  # pragma: no cover
            failure["error"] = err

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if "error" in failure:
        raise failure["error"]
    return result.get("value")


def _append_secret_access_audit(claims: Dict[str, Any], *, status: str, denial_code: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> None:
    tenant_id = str(claims.get("tenant_id") or "").strip()
    workspace_id = normalize_workspace_id(claims.get("workspace_id"))
    if not tenant_id or not workspace_id:
        return
    _run_coro_sync(
        control_plane_repository.append_agent_secret_access_event(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            secret_kind=str(claims.get("secret_kind") or "").strip().lower(),
            credential_id=str(claims.get("credential_id") or "").strip() or None,
            provider_id=str(claims.get("provider_id") or "").strip().lower() or None,
            connector_id=str(claims.get("connector_id") or "").strip().lower() or None,
            metadata={
                **(metadata or {}),
                "connector_class": str(claims.get("connector_class") or "").strip().lower() or None,
            },
            action_id=str(claims.get("action_id") or "").strip().lower() or None,
            tool_name=str(claims.get("tool_name") or "").strip().lower() or None,
            run_id=str(claims.get("run_id") or "").strip() or None,
            actor=claims.get("actor") if isinstance(claims.get("actor"), dict) else {},
            allowed_fields=[str(item) for item in list(claims.get("allowed_fields") or [])],
            status=status,
            denial_code=denial_code,
        )
    )


def _raise_if_connector_access_disabled(
    *,
    tenant_id: Optional[str],
    workspace_id: Optional[str],
    connector_id: str,
    credential_id: Optional[str] = None,
) -> None:
    state = safe_mode_service.resolve_connector_disable_state(
        tenant_id=str(tenant_id or "").strip() or None,
        workspace_id=workspace_id,
        connector_id=connector_id,
        credential_id=credential_id,
    )
    if not bool(state.get("active")):
        return
    metadata = dict((state.get("matched_chain") or [{}])[-1].get("metadata") or {})
    if bool(metadata.get("requires_rotation")):
        raise SecretAccessDeniedError("credential_rotation_required", "This credential was revoked and must be rotated before reuse.")
    if str(metadata.get("status") or "").strip().lower() == "rotated":
        raise SecretAccessDeniedError("credential_rotated", "This credential was rotated out of service and can no longer be used.")
    raise SecretAccessDeniedError("connector_disabled", "This connector is disabled by a security control.")


def resolve_connector_secret(
    load_vault_fn: LoadVaultFn,
    decrypt_fn: DecryptFn,
    *,
    tenant_id: Optional[str],
    workspace_id: Optional[str],
    credential_id: str,
    connector_id: Optional[str] = None,
    connector_class: Optional[str] = None,
    action_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    run_id: Optional[str] = None,
    runtime_mode: Optional[str] = None,
    allowed_fields: Optional[List[str]] = None,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    purpose: Optional[str] = None,
    ttl_seconds: int = DEFAULT_SECRET_GRANT_TTL_SECONDS,
) -> Dict[str, Any]:
    grant = issue_connector_secret_grant(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        credential_id=credential_id,
        connector_id=connector_id,
        connector_class=connector_class,
        action_id=action_id,
        tool_name=tool_name,
        run_id=run_id,
        runtime_mode=runtime_mode,
        allowed_fields=allowed_fields,
        actor_type=actor_type,
        actor_id=actor_id,
        purpose=purpose,
        ttl_seconds=ttl_seconds,
    )
    try:
        claims = verify_secret_access_token(
            grant.token,
            expected_secret_kind="connector_credential",
            expected_workspace_id=workspace_id,
            expected_credential_id=credential_id,
        )
        expected_connector_id = str(claims.get("connector_id") or connector_id or "").strip().lower()
        if expected_connector_id:
            _raise_if_connector_access_disabled(
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                connector_id=expected_connector_id,
                credential_id=credential_id,
            )
        secret = _raw_resolve_vault_credential(load_vault_fn, decrypt_fn, credential_id, workspace_id)
        resolved_provider = str(secret.get("_provider") or "").strip().lower()
        if expected_connector_id and resolved_provider and resolved_provider != expected_connector_id:
            raise SecretAccessDeniedError("connector_mismatch", "Resolved credential does not match the requested connector.")
        projected = _project_secret_payload(secret, _normalize_allowed_fields(list(claims.get("allowed_fields") or [])))
        _append_secret_access_audit(
            claims,
            status="allowed",
            metadata={
                "purpose": claims.get("purpose"),
                "projected": bool(claims.get("allowed_fields")),
                "resolved_provider": resolved_provider or None,
            },
        )
        return projected
    except SecretAccessDeniedError as error:
        _append_secret_access_audit(
            grant.claims,
            status="denied",
            denial_code=error.code,
            metadata={"purpose": grant.claims.get("purpose")},
        )
        raise


def resolve_provider_secret(
    load_vault_fn: LoadVaultFn,
    decrypt_fn: DecryptFn,
    *,
    tenant_id: Optional[str],
    workspace_id: Optional[str],
    provider_id: str,
    credential_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    run_id: Optional[str] = None,
    runtime_mode: Optional[str] = None,
    allowed_fields: Optional[List[str]] = None,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    purpose: Optional[str] = None,
    ttl_seconds: int = DEFAULT_SECRET_GRANT_TTL_SECONDS,
) -> Dict[str, Any]:
    normalized_provider_id = str(provider_id or "").strip().lower()
    grant = issue_provider_secret_grant(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        provider_id=normalized_provider_id,
        credential_id=credential_id,
        tool_name=tool_name,
        run_id=run_id,
        runtime_mode=runtime_mode,
        allowed_fields=allowed_fields,
        actor_type=actor_type,
        actor_id=actor_id,
        purpose=purpose,
        ttl_seconds=ttl_seconds,
    )
    try:
        claims = verify_secret_access_token(
            grant.token,
            expected_secret_kind="provider_credential",
            expected_workspace_id=workspace_id,
            expected_credential_id=credential_id,
            expected_provider_id=normalized_provider_id,
        )
        _raise_if_connector_access_disabled(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            connector_id=normalized_provider_id,
            credential_id=credential_id,
        )
        if credential_id:
            secret = _raw_resolve_vault_credential(load_vault_fn, decrypt_fn, credential_id, workspace_id)
        else:
            secret = _raw_resolve_default_vault_credential(load_vault_fn, decrypt_fn, normalized_provider_id, workspace_id)
        resolved_provider = str(secret.get("_provider") or "").strip().lower()
        if resolved_provider and resolved_provider != normalized_provider_id:
            raise SecretAccessDeniedError("provider_mismatch", "Resolved credential does not match the requested provider.")
        projected = _project_secret_payload(secret, _normalize_allowed_fields(list(claims.get("allowed_fields") or [])))
        _append_secret_access_audit(
            claims,
            status="allowed",
            metadata={
                "purpose": claims.get("purpose"),
                "projected": bool(claims.get("allowed_fields")),
                "resolved_provider": resolved_provider or normalized_provider_id,
            },
        )
        return projected
    except SecretAccessDeniedError as error:
        _append_secret_access_audit(
            grant.claims,
            status="denied",
            denial_code=error.code,
            metadata={"purpose": grant.claims.get("purpose")},
        )
        raise
