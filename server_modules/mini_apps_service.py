from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from server_modules import mini_app_host_service, workspace_context


MINI_APP_CONTRACT_VERSION = 1
MAX_RETRIEVE_LIMIT = 200
DEFAULT_RETRIEVE_LIMIT = 25
UNLISTED_SHARE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
DEFAULT_AI_MONTHLY_CREDIT_CAP = 500
DEFAULT_AI_INVOCATION_CREDIT_CAP = 50
MINI_APP_TRUST_TIERS = (
    "user_private",
    "first_party",
    "reviewed_partner",
    "public_untrusted_url",
)
FIRST_PARTY_MINI_APP_IDS = {
    "calorie_tracking",
    "flashcards",
}
APP_RUNTIME_TYPES = {"link", "platform", "community", "private"}
APP_RUNTIME_TYPE_ALIASES = {
    "link": "link",
    "url": "link",
    "external": "link",
    "external_link": "link",
    "platform": "platform",
    "first_party": "platform",
    "platform_hosted": "platform",
    "empyralis": "platform",
    "community": "community",
    "remote": "community",
    "hosted": "community",
    "hosted_url": "community",
    "remote_server": "community",
    "publisher_hosted": "community",
    "private": "private",
    "workspace_private": "private",
    "local": "community",
    "local_runtime": "community",
    "agent_computer": "community",
    "user_hardware": "community",
    "hybrid": "community",
}
SUPPORTED_RETRIEVE_FILTERS = (
    "ids",
    "kind",
    "tag",
    "tags",
    "since",
    "until",
    "text_query",
    "limit",
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(token: str) -> bytes:
    padding = "=" * ((4 - len(token) % 4) % 4)
    return base64.urlsafe_b64decode((token + padding).encode("ascii"))


def _share_token_secret() -> bytes:
    secret = (
        os.getenv("EMPYRALIS_MINI_APP_SHARE_SECRET")
        or os.getenv("EMPYRALIS_MINI_APP_LAUNCH_SECRET")
        or os.getenv("ORION_JWT_SECRET")
        or os.getenv("ORION_SECRET_KEY")
        or "empyralis-mini-app-share-local-dev-secret"
    )
    return secret.encode("utf-8")


def _mini_apps_state_path(workspace_id: str) -> Path:
    return workspace_context.workspace_scope_dir(workspace_id) / "mini_apps.json"


def _normalize_workspace_id(workspace_id: Any) -> str:
    return str(workspace_id or "default").strip() or "default"


def _normalize_app_id(app_id: Any) -> str:
    token = re.sub(r"[^a-z0-9_-]+", "_", str(app_id or "").strip().lower()).strip("_")
    return token


def _normalize_url(value: Any) -> Optional[str]:
    token = str(value or "").strip()
    return token or None


def _normalize_domain(value: Any) -> Optional[str]:
    token = str(value or "").strip().lower()
    if not token:
        return None
    candidate = token if "://" in token else f"https://{token}"
    parsed = urlparse(candidate)
    host = (parsed.hostname or token.split("/", 1)[0]).strip(".").lower()
    if host.startswith("www."):
        host = host[4:]
    return host or None


def _normalize_runtime_mode(value: Any) -> str:
    token = str(value or "").strip().lower().replace("-", "_")
    return APP_RUNTIME_TYPE_ALIASES.get(token, "community")


def _normalize_runtime_type(value: Any, *, app_id: Any = None) -> str:
    token = str(value or "").strip().lower().replace("-", "_")
    if not token:
        return "platform" if _normalize_app_id(app_id) in FIRST_PARTY_MINI_APP_IDS else "private"
    return APP_RUNTIME_TYPE_ALIASES.get(token, "private")


def _default_trust_tier(app_id: Any) -> str:
    return "first_party" if _normalize_app_id(app_id) in FIRST_PARTY_MINI_APP_IDS else "user_private"


def _normalize_trust_tier(value: Any, *, app_id: Any = None) -> str:
    token = str(value or "").strip().lower().replace("-", "_")
    if token in MINI_APP_TRUST_TIERS:
        return token
    return _default_trust_tier(app_id)


def issue_unlisted_share_token(
    *,
    workspace_id: str,
    app_id: str,
    ttl_seconds: int = UNLISTED_SHARE_TOKEN_TTL_SECONDS,
) -> Dict[str, Any]:
    now = int(time.time())
    payload = {
        "workspace_id": _normalize_workspace_id(workspace_id),
        "app_id": _normalize_app_id(app_id),
        "iat": now,
        "exp": now + max(60, int(ttl_seconds or UNLISTED_SHARE_TOKEN_TTL_SECONDS)),
    }
    payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    body = _b64url_encode(payload_bytes)
    signature = hmac.new(_share_token_secret(), body.encode("ascii"), hashlib.sha256).digest()
    return {
        "token": f"{body}.{_b64url_encode(signature)}",
        "expires_at": payload["exp"],
    }


def verify_unlisted_share_token(token: str, *, now: Optional[int] = None) -> Dict[str, Any]:
    raw_token = str(token or "").strip()
    if not raw_token or "." not in raw_token:
        raise PermissionError("Mini app share token is required.")
    body, signature = raw_token.split(".", 1)
    expected = _b64url_encode(hmac.new(_share_token_secret(), body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        raise PermissionError("Mini app share token signature is invalid.")
    try:
        payload = json.loads(_b64url_decode(body).decode("utf-8"))
    except Exception as exc:
        raise PermissionError("Mini app share token is malformed.") from exc
    if not isinstance(payload, dict):
        raise PermissionError("Mini app share token payload is malformed.")
    expiry = int(payload.get("exp") or 0)
    if expiry <= int(now if now is not None else time.time()):
        raise PermissionError("Mini app share token has expired.")
    workspace_id = _normalize_workspace_id(payload.get("workspace_id"))
    app_id = _normalize_app_id(payload.get("app_id"))
    if not workspace_id or not app_id:
        raise PermissionError("Mini app share token is missing its target.")
    return {
        "workspace_id": workspace_id,
        "app_id": app_id,
        "exp": expiry,
        "iat": int(payload.get("iat") or 0),
    }


def _default_state() -> Dict[str, Any]:
    return {
        "version": MINI_APP_CONTRACT_VERSION,
        "updated_at": _utc_now_iso(),
        "apps": {},
    }


def _default_app_entry(app_id: str) -> Dict[str, Any]:
    return {
        "id": app_id,
        "label": " ".join(part.capitalize() for part in app_id.replace("-", "_").split("_") if part) or app_id,
        "description": "",
        "icon_url": None,
        "category": None,
        "publisher_id": None,
        "publisher_name": None,
        "publisher_domain": None,
        "support_url": None,
        "privacy_url": None,
        "terms_url": None,
        "runtime_type": "platform" if _normalize_app_id(app_id) in FIRST_PARTY_MINI_APP_IDS else "private",
        "runtime_mode": "platform" if _normalize_app_id(app_id) in FIRST_PARTY_MINI_APP_IDS else "private",
        "destination_url": None,
        "platform_route": None,
        "verification_status": "unverified",
        "official_claim": {},
        "domain_proof": {},
        "delivery_mode": "structured",
        "visibility": "workspace_private",
        "install_status": "installed",
        "hosted_url": None,
        "embed_kind": "iframe",
        "allowed_origins": [],
        "bridge_contracts": {},
        "permissions": [],
        "trust_tier": _default_trust_tier(app_id),
        "background_ai_allowed": False,
        "runtime_access": "none",
        "ai_invoke_policy": {
            "consent_required": True,
            "consent_status": "not_granted",
            "payer": "platform_credits",
            "monthly_credit_cap": DEFAULT_AI_MONTHLY_CREDIT_CAP,
            "per_invocation_credit_cap": DEFAULT_AI_INVOCATION_CREDIT_CAP,
        },
        "context_envelope": {},
        "current_state": {},
        "recent_events": [],
        "daily_summary": {},
        "weekly_summary": {},
        "long_term_facts": [],
        "records": [],
        "updated_at": _utc_now_iso(),
    }


def _safe_read_state(workspace_id: str) -> Dict[str, Any]:
    path = _mini_apps_state_path(workspace_id)
    if not path.exists():
        return _default_state()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    apps = raw.get("apps")
    if not isinstance(apps, dict):
        apps = {}
    normalized_apps: Dict[str, Any] = {}
    for raw_app_id, raw_entry in apps.items():
        app_id = _normalize_app_id(raw_app_id)
        if not app_id:
            continue
        base = _default_app_entry(app_id)
        entry = dict(raw_entry or {}) if isinstance(raw_entry, dict) else {}
        normalized_apps[app_id] = {
            **base,
            **entry,
            "id": app_id,
            "label": str(entry.get("label") or base["label"]).strip() or base["label"],
            "description": str(entry.get("description") or "").strip(),
            "icon_url": _normalize_url(entry.get("icon_url")),
            "category": str(entry.get("category") or "").strip() or None,
            "publisher_id": str(entry.get("publisher_id") or "").strip() or None,
            "publisher_name": str(entry.get("publisher_name") or "").strip() or None,
            "publisher_domain": _normalize_domain(entry.get("publisher_domain")),
            "support_url": _normalize_url(entry.get("support_url")),
            "privacy_url": _normalize_url(entry.get("privacy_url")),
            "terms_url": _normalize_url(entry.get("terms_url")),
            "runtime_type": _normalize_runtime_type(entry.get("runtime_type") or entry.get("runtime_mode"), app_id=app_id),
            "runtime_mode": _normalize_runtime_type(entry.get("runtime_type") or entry.get("runtime_mode"), app_id=app_id),
            "destination_url": _normalize_url(entry.get("destination_url")),
            "platform_route": str(entry.get("platform_route") or "").strip() or None,
            "verification_status": str(entry.get("verification_status") or "unverified").strip().lower() or "unverified",
            "official_claim": dict(entry.get("official_claim") or {}) if isinstance(entry.get("official_claim"), dict) else {},
            "domain_proof": dict(entry.get("domain_proof") or {}) if isinstance(entry.get("domain_proof"), dict) else {},
            "delivery_mode": str(entry.get("delivery_mode") or base["delivery_mode"]).strip().lower() or base["delivery_mode"],
            "visibility": str(entry.get("visibility") or base["visibility"]).strip().lower() or base["visibility"],
            "install_status": str(entry.get("install_status") or base["install_status"]).strip().lower() or base["install_status"],
            "hosted_url": str(entry.get("hosted_url") or "").strip() or None,
            "embed_kind": str(entry.get("embed_kind") or base["embed_kind"]).strip().lower() or base["embed_kind"],
            "allowed_origins": list(entry.get("allowed_origins") or []) if isinstance(entry.get("allowed_origins"), list) else [],
            "bridge_contracts": dict(entry.get("bridge_contracts") or {}) if isinstance(entry.get("bridge_contracts"), dict) else {},
            "permissions": list(entry.get("permissions") or []) if isinstance(entry.get("permissions"), list) else [],
            "trust_tier": _normalize_trust_tier(entry.get("trust_tier"), app_id=app_id),
            "background_ai_allowed": bool(entry.get("background_ai_allowed", False)),
            "runtime_access": "none",
            "context_envelope": dict(entry.get("context_envelope") or {}) if isinstance(entry.get("context_envelope"), dict) else {},
            "current_state": dict(entry.get("current_state") or {}) if isinstance(entry.get("current_state"), dict) else {},
            "recent_events": list(entry.get("recent_events") or []) if isinstance(entry.get("recent_events"), list) else [],
            "daily_summary": dict(entry.get("daily_summary") or {}) if isinstance(entry.get("daily_summary"), dict) else {},
            "weekly_summary": dict(entry.get("weekly_summary") or {}) if isinstance(entry.get("weekly_summary"), dict) else {},
            "long_term_facts": list(entry.get("long_term_facts") or []) if isinstance(entry.get("long_term_facts"), list) else [],
            "records": list(entry.get("records") or []) if isinstance(entry.get("records"), list) else [],
            "updated_at": str(entry.get("updated_at") or base["updated_at"]).strip() or base["updated_at"],
        }
    return {
        "version": int(raw.get("version") or MINI_APP_CONTRACT_VERSION),
        "updated_at": str(raw.get("updated_at") or _utc_now_iso()).strip() or _utc_now_iso(),
        "apps": normalized_apps,
    }


def _save_state(workspace_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    path = _mini_apps_state_path(workspace_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = {
        "version": MINI_APP_CONTRACT_VERSION,
        "updated_at": _utc_now_iso(),
        "apps": dict(payload.get("apps") or {}),
    }
    serialized = json.dumps(normalized, indent=2, sort_keys=True)
    tmp_path = path.with_name(f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        handle.write(serialized)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp_path, path)
    try:
        dir_fd = os.open(str(path.parent), os.O_DIRECTORY)
    except Exception:
        dir_fd = None
    if dir_fd is not None:
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    return normalized


def _compact_scalar(value: Any, *, limit: int = 160) -> str:
    if isinstance(value, bool):
        text = "true" if value else "false"
    elif value is None:
        text = ""
    elif isinstance(value, (int, float)):
        text = str(value)
    elif isinstance(value, str):
        text = " ".join(value.split()).strip()
    elif isinstance(value, list):
        text = ", ".join(_compact_scalar(item, limit=48) for item in value if _compact_scalar(item, limit=48))
    elif isinstance(value, dict):
        text = ", ".join(
            f"{str(key).replace('_', ' ')}: {_compact_scalar(item, limit=48)}"
            for key, item in value.items()
            if _compact_scalar(item, limit=48)
        )
    else:
        text = " ".join(str(value).split()).strip()
    if len(text) <= limit:
        return text
    return f"{text[: max(0, limit - 1)].rstrip()}…"


def _record_timestamp(record: Dict[str, Any]) -> str:
    for key in ("timestamp", "updated_at", "updatedAt", "created_at", "createdAt", "occurred_at", "occurredAt", "date"):
        value = str(record.get(key) or "").strip()
        if value:
            return value
    return ""


def _parse_isoish(value: Any) -> Optional[datetime]:
    token = str(value or "").strip()
    if not token:
        return None
    try:
        normalized = token.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _has_narrow_retrieve_filters(payload: Dict[str, Any]) -> bool:
    if not isinstance(payload, dict):
        return False
    if any(str(item).strip() for item in list(payload.get("ids") or [])):
        return True
    if str(payload.get("kind") or "").strip():
        return True
    if str(payload.get("tag") or "").strip():
        return True
    if any(str(item).strip() for item in list(payload.get("tags") or [])):
        return True
    if str(payload.get("since") or "").strip():
        return True
    if str(payload.get("until") or "").strip():
        return True
    if str(payload.get("text_query") or "").strip():
        return True
    return False


def _normalize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(record or {})
    if not isinstance(payload, dict):
        payload = {}
    record_id = str(payload.get("id") or "").strip()
    if not record_id:
        timestamp = _record_timestamp(payload) or _utc_now_iso()
        kind = str(payload.get("kind") or payload.get("type") or "record").strip().lower() or "record"
        record_id = f"{kind}:{timestamp}"
    payload["id"] = record_id
    if not _record_timestamp(payload):
        payload["created_at"] = _utc_now_iso()
    return payload


def _normalize_fact_item(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        text = _compact_scalar(value.get("text") or value.get("fact") or value.get("value"))
        if not text:
            text = _compact_scalar(value)
        return {
            "id": str(value.get("id") or text[:48] or _utc_now_iso()).strip(),
            "text": text,
            "kind": str(value.get("kind") or "fact").strip() or "fact",
        }
    text = _compact_scalar(value)
    return {
        "id": text[:48] or _utc_now_iso(),
        "text": text,
        "kind": "fact",
    }


def _normalize_ai_invoke_policy(value: Any) -> Dict[str, Any]:
    payload = dict(value or {}) if isinstance(value, dict) else {}
    consent_status = str(payload.get("consent_status") or "not_granted").strip().lower() or "not_granted"
    if consent_status not in {"not_granted", "granted", "revoked"}:
        raise ValueError("ai_invoke_policy.consent_status must be not_granted, granted, or revoked.")
    payer = str(payload.get("payer") or "platform_credits").strip().lower() or "platform_credits"
    if payer not in {"platform_credits", "byok", "local", "subscription_passthrough"}:
        raise ValueError("ai_invoke_policy.payer must be platform_credits, byok, local, or subscription_passthrough.")
    def _cap_value(key: str, default: int) -> int:
        raw_value = payload.get(key)
        if raw_value is None or raw_value == "":
            return default
        return int(raw_value)

    monthly_cap = _cap_value("monthly_credit_cap", DEFAULT_AI_MONTHLY_CREDIT_CAP)
    invocation_cap = _cap_value("per_invocation_credit_cap", DEFAULT_AI_INVOCATION_CREDIT_CAP)
    if monthly_cap < 0 or invocation_cap < 0:
        raise ValueError("Mini-app AI credit caps must be non-negative.")
    return {
        "consent_required": bool(payload.get("consent_required", True)),
        "consent_status": consent_status,
        "payer": payer,
        "monthly_credit_cap": monthly_cap,
        "per_invocation_credit_cap": invocation_cap,
        "provider": str(payload.get("provider") or "").strip() or None,
        "model": str(payload.get("model") or "").strip() or None,
    }


def _normalized_contract_payload(workspace_id: str, entry: Dict[str, Any]) -> Dict[str, Any]:
    app_id = str(entry.get("id") or "").strip()
    records = [
        item
        for item in (entry.get("records") or [])
        if isinstance(item, dict)
    ]
    hosted_fields = mini_app_host_service.normalize_hosted_app_fields(
        app_id=app_id,
        delivery_mode=entry.get("delivery_mode"),
        hosted_url=entry.get("hosted_url"),
        embed_kind=entry.get("embed_kind"),
        allowed_origins=entry.get("allowed_origins"),
        bridge_contracts=entry.get("bridge_contracts"),
        permissions=entry.get("permissions"),
        context_envelope=entry.get("context_envelope"),
    )
    contract_payload = {
        "contract_version": MINI_APP_CONTRACT_VERSION,
        "app_id": app_id,
        "workspace_id": _normalize_workspace_id(workspace_id),
        "kind": "structured_mini_app",
        "label": str(entry.get("label") or app_id).strip() or app_id,
        "description": str(entry.get("description") or "").strip(),
        "icon_url": _normalize_url(entry.get("icon_url")),
        "category": str(entry.get("category") or "").strip() or None,
        "publisher_id": str(entry.get("publisher_id") or "").strip() or None,
        "publisher_name": str(entry.get("publisher_name") or "").strip() or None,
        "publisher_domain": _normalize_domain(entry.get("publisher_domain")),
        "support_url": _normalize_url(entry.get("support_url")),
        "privacy_url": _normalize_url(entry.get("privacy_url")),
        "terms_url": _normalize_url(entry.get("terms_url")),
        "runtime_type": _normalize_runtime_type(entry.get("runtime_type") or entry.get("runtime_mode"), app_id=app_id),
        "runtime_mode": _normalize_runtime_type(entry.get("runtime_type") or entry.get("runtime_mode"), app_id=app_id),
        "destination_url": _normalize_url(entry.get("destination_url")),
        "platform_route": str(entry.get("platform_route") or "").strip() or None,
        "verification_status": str(entry.get("verification_status") or "unverified").strip().lower() or "unverified",
        "official_claim": dict(entry.get("official_claim") or {}) if isinstance(entry.get("official_claim"), dict) else {},
        "domain_proof": dict(entry.get("domain_proof") or {}) if isinstance(entry.get("domain_proof"), dict) else {},
        "delivery_mode": hosted_fields["delivery_mode"],
        "visibility": str(entry.get("visibility") or "workspace_private").strip().lower() or "workspace_private",
        "install_status": str(entry.get("install_status") or "installed").strip().lower() or "installed",
        "memory_scope": "none_by_default",
        "trust_tier": _normalize_trust_tier(entry.get("trust_tier"), app_id=app_id),
        "background_ai_allowed": bool(entry.get("background_ai_allowed", False)),
        "runtime_access": "none",
        "permissions": list(hosted_fields.get("permissions") or []),
        "ai_invoke_policy": _normalize_ai_invoke_policy(entry.get("ai_invoke_policy")),
        "bridge_contracts": dict(hosted_fields.get("bridge_contracts") or {}),
        "context_envelope": dict(hosted_fields.get("context_envelope") or {}),
        "embed_kind": hosted_fields.get("embed_kind"),
        "allowed_origins": list(hosted_fields.get("allowed_origins") or []),
        "current_state": dict(entry.get("current_state") or {}),
        "recent_events": list(entry.get("recent_events") or []),
        "daily_summary": dict(entry.get("daily_summary") or {}),
        "weekly_summary": dict(entry.get("weekly_summary") or {}),
        "long_term_facts": list(entry.get("long_term_facts") or []),
        "updated_at": str(entry.get("updated_at") or "").strip() or None,
        "records_count": len(records),
        "retrieve_records": {
            "method": "POST",
            "path": f"/api/workspaces/{_normalize_workspace_id(workspace_id)}/mini-apps/{app_id}/records/retrieve",
            "supported_filters": list(SUPPORTED_RETRIEVE_FILTERS),
            "default_limit": DEFAULT_RETRIEVE_LIMIT,
        },
    }
    if contract_payload["visibility"] == "unlisted_link":
        contract_payload["public_distribution"] = {
            "mode": "unlisted_link",
            "install_path": f"/apps/{app_id}/install",
            "requires_permission_review": True,
        }
    if hosted_fields.get("hosted_url"):
        contract_payload["hosted_url"] = hosted_fields["hosted_url"]
        manifest = mini_app_host_service.build_hosted_mini_app_manifest(
            workspace_id=_normalize_workspace_id(workspace_id),
            app_contract=contract_payload,
        )
        if manifest:
            contract_payload.update(manifest)
    return contract_payload


def _safe_unlisted_preview(contract: Dict[str, Any], *, token_expires_at: Optional[int] = None) -> Dict[str, Any]:
    hosted = contract.get("hosted_app") if isinstance(contract.get("hosted_app"), dict) else {}
    return {
        "app_id": contract.get("app_id"),
        "label": contract.get("label"),
        "description": contract.get("description"),
        "delivery_mode": contract.get("delivery_mode"),
        "visibility": contract.get("visibility"),
        "memory_scope": contract.get("memory_scope") or "none_by_default",
        "trust_tier": contract.get("trust_tier") or "public_untrusted_url",
        "background_ai_allowed": False,
        "runtime_access": "none",
        "permissions": list(contract.get("permissions") or []),
        "bridge_contracts": dict(contract.get("bridge_contracts") or {}),
        "allowed_origins": list(contract.get("allowed_origins") or hosted.get("allowed_origins") or []),
        "hosted_url": hosted.get("hosted_url") or contract.get("hosted_url"),
        "expires_at": token_expires_at,
    }


def list_mini_app_contracts(workspace_id: str) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    state = _safe_read_state(normalized_workspace_id)
    items = [
        _normalized_contract_payload(normalized_workspace_id, entry)
        for _app_id, entry in sorted(state.get("apps", {}).items())
        if isinstance(entry, dict)
    ]
    return {
        "workspace_id": normalized_workspace_id,
        "contract_version": MINI_APP_CONTRACT_VERSION,
        "items": items,
        "count": len(items),
        "updated_at": state.get("updated_at"),
    }


def get_mini_app_contract(workspace_id: str, app_id: str) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_app_id = _normalize_app_id(app_id)
    if not normalized_app_id:
        raise KeyError("Mini app id is required.")
    state = _safe_read_state(normalized_workspace_id)
    entry = state.get("apps", {}).get(normalized_app_id)
    if not isinstance(entry, dict):
        raise KeyError(f"Mini app '{normalized_app_id}' was not found.")
    return _normalized_contract_payload(normalized_workspace_id, entry)


def generate_unlisted_share_link(workspace_id: str, app_id: str) -> Dict[str, Any]:
    existing_contract = get_mini_app_contract(workspace_id, app_id)
    contract = upsert_mini_app_contract(
        workspace_id,
        str(existing_contract.get("app_id") or app_id),
        visibility="unlisted_link",
        install_status="installed",
    )
    issued = issue_unlisted_share_token(
        workspace_id=_normalize_workspace_id(workspace_id),
        app_id=str(contract.get("app_id") or app_id),
    )
    return {
        "workspace_id": _normalize_workspace_id(workspace_id),
        "app_id": contract.get("app_id"),
        "visibility": contract.get("visibility"),
        "token": issued["token"],
        "expires_at": issued["expires_at"],
        "preview_path": f"/api/mini-apps/share/{issued['token']}",
        "install_path": "/api/workspaces/{workspace_id}/mini-apps/install-shared",
    }


def preview_unlisted_shared_app(token: str) -> Dict[str, Any]:
    target = verify_unlisted_share_token(token)
    contract = get_mini_app_contract(target["workspace_id"], target["app_id"])
    if contract.get("visibility") != "unlisted_link":
        raise PermissionError("Mini app is not shared by unlisted link.")
    return {
        "source_workspace_id": target["workspace_id"],
        "share": {
            "mode": "unlisted_link",
            "expires_at": target["exp"],
        },
        "app": _safe_unlisted_preview(contract, token_expires_at=target["exp"]),
    }


def install_unlisted_shared_app(target_workspace_id: str, token: str) -> Dict[str, Any]:
    target = verify_unlisted_share_token(token)
    source_contract = get_mini_app_contract(target["workspace_id"], target["app_id"])
    if source_contract.get("visibility") != "unlisted_link":
        raise PermissionError("Mini app is not shared by unlisted link.")
    return upsert_mini_app_contract(
        target_workspace_id,
        str(source_contract.get("app_id") or target["app_id"]),
        label=source_contract.get("label"),
        description=source_contract.get("description"),
        delivery_mode=source_contract.get("delivery_mode"),
        hosted_url=source_contract.get("hosted_url") or (source_contract.get("hosted_app") or {}).get("hosted_url"),
        embed_kind=source_contract.get("embed_kind"),
        allowed_origins=source_contract.get("allowed_origins"),
        bridge_contracts=source_contract.get("bridge_contracts"),
        permissions=[
            item
            for item in list(source_contract.get("permissions") or [])
            if str(item or "").strip().lower() != mini_app_host_service.APP_PERMISSION_AI_INVOKE
        ],
        context_envelope=source_contract.get("context_envelope"),
        trust_tier="public_untrusted_url",
        background_ai_allowed=False,
        ai_invoke_policy={
            "consent_required": True,
            "consent_status": "not_granted",
            "payer": "platform_credits",
            "monthly_credit_cap": 0,
            "per_invocation_credit_cap": 0,
        },
        visibility="workspace_private",
        install_status="installed",
    )


def upsert_mini_app_contract(
    workspace_id: str,
    app_id: str,
    *,
    label: Any = None,
    description: Any = None,
    icon_url: Any = None,
    category: Any = None,
    publisher_id: Any = None,
    publisher_name: Any = None,
    publisher_domain: Any = None,
    support_url: Any = None,
    privacy_url: Any = None,
    terms_url: Any = None,
    runtime_type: Any = None,
    runtime_mode: Any = None,
    destination_url: Any = None,
    platform_route: Any = None,
    verification_status: Any = None,
    official_claim: Any = None,
    domain_proof: Any = None,
    delivery_mode: Any = None,
    hosted_url: Any = None,
    embed_kind: Any = None,
    allowed_origins: Any = None,
    bridge_contracts: Any = None,
    permissions: Any = None,
    ai_invoke_policy: Any = None,
    context_envelope: Any = None,
    trust_tier: Any = None,
    background_ai_allowed: Any = None,
    visibility: Any = None,
    install_status: Any = None,
    current_state: Any = None,
    recent_events: Any = None,
    daily_summary: Any = None,
    weekly_summary: Any = None,
    long_term_facts: Any = None,
    records: Any = None,
) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_app_id = _normalize_app_id(app_id)
    if not normalized_app_id:
        raise ValueError("Mini app id is required.")
    state = _safe_read_state(normalized_workspace_id)
    apps = dict(state.get("apps") or {})
    entry = dict(apps.get(normalized_app_id) or _default_app_entry(normalized_app_id))
    if label is not None:
        entry["label"] = str(label or "").strip() or entry["label"]
    if description is not None:
        entry["description"] = str(description or "").strip()
    if icon_url is not None:
        entry["icon_url"] = _normalize_url(icon_url)
    if category is not None:
        entry["category"] = str(category or "").strip() or None
    if publisher_id is not None:
        entry["publisher_id"] = str(publisher_id or "").strip() or None
    if publisher_name is not None:
        entry["publisher_name"] = str(publisher_name or "").strip() or None
    if publisher_domain is not None:
        entry["publisher_domain"] = _normalize_domain(publisher_domain)
    if support_url is not None:
        entry["support_url"] = _normalize_url(support_url)
    if privacy_url is not None:
        entry["privacy_url"] = _normalize_url(privacy_url)
    if terms_url is not None:
        entry["terms_url"] = _normalize_url(terms_url)
    if runtime_type is not None or runtime_mode is not None:
        normalized_runtime_type = _normalize_runtime_type(runtime_type if runtime_type is not None else runtime_mode, app_id=normalized_app_id)
        entry["runtime_type"] = normalized_runtime_type
        entry["runtime_mode"] = normalized_runtime_type
    if destination_url is not None:
        entry["destination_url"] = _normalize_url(destination_url)
    if platform_route is not None:
        entry["platform_route"] = str(platform_route or "").strip() or None
    if verification_status is not None:
        token = str(verification_status or "unverified").strip().lower() or "unverified"
        entry["verification_status"] = token if token in {"unverified", "partner", "verified"} else "unverified"
    if isinstance(official_claim, dict):
        entry["official_claim"] = dict(official_claim)
    if isinstance(domain_proof, dict):
        entry["domain_proof"] = dict(domain_proof)
    if visibility is not None:
        normalized_visibility = str(visibility or "workspace_private").strip().lower() or "workspace_private"
        if normalized_visibility not in {"workspace_private", "unlisted_link"}:
            raise ValueError("visibility must be either 'workspace_private' or 'unlisted_link'.")
        entry["visibility"] = normalized_visibility
    if install_status is not None:
        normalized_install_status = str(install_status or "installed").strip().lower() or "installed"
        if normalized_install_status not in {"installed", "pending", "removed"}:
            raise ValueError("install_status must be installed, pending, or removed.")
        entry["install_status"] = normalized_install_status
    if ai_invoke_policy is not None:
        entry["ai_invoke_policy"] = _normalize_ai_invoke_policy(ai_invoke_policy)
    if trust_tier is not None:
        entry["trust_tier"] = _normalize_trust_tier(trust_tier, app_id=normalized_app_id)
    if background_ai_allowed is not None:
        entry["background_ai_allowed"] = bool(background_ai_allowed)
    entry["runtime_access"] = "none"
    if any(
        value is not None
        for value in (
            delivery_mode,
            hosted_url,
            embed_kind,
            allowed_origins,
            bridge_contracts,
            permissions,
            context_envelope,
        )
    ):
        hosted_fields = mini_app_host_service.normalize_hosted_app_fields(
            app_id=normalized_app_id,
            delivery_mode=delivery_mode if delivery_mode is not None else entry.get("delivery_mode"),
            hosted_url=hosted_url if hosted_url is not None else entry.get("hosted_url"),
            embed_kind=embed_kind if embed_kind is not None else entry.get("embed_kind"),
            allowed_origins=allowed_origins if allowed_origins is not None else entry.get("allowed_origins"),
            bridge_contracts=bridge_contracts if bridge_contracts is not None else entry.get("bridge_contracts"),
            permissions=permissions if permissions is not None else entry.get("permissions"),
            context_envelope=context_envelope if context_envelope is not None else entry.get("context_envelope"),
        )
        entry["delivery_mode"] = hosted_fields["delivery_mode"]
        entry["hosted_url"] = hosted_fields["hosted_url"]
        entry["embed_kind"] = hosted_fields["embed_kind"]
        entry["allowed_origins"] = list(hosted_fields["allowed_origins"])
        entry["bridge_contracts"] = dict(hosted_fields["bridge_contracts"])
        entry["permissions"] = list(hosted_fields["permissions"])
        entry["context_envelope"] = dict(hosted_fields["context_envelope"])
    if isinstance(current_state, dict):
        entry["current_state"] = dict(current_state)
    if isinstance(recent_events, list):
        entry["recent_events"] = [_normalize_record(item) for item in recent_events if isinstance(item, dict)]
    if isinstance(daily_summary, dict):
        entry["daily_summary"] = dict(daily_summary)
    if isinstance(weekly_summary, dict):
        entry["weekly_summary"] = dict(weekly_summary)
    if isinstance(long_term_facts, list):
        entry["long_term_facts"] = [
            _normalize_fact_item(item)
            for item in long_term_facts
            if _compact_scalar(item)
        ]
    if isinstance(records, list):
        entry["records"] = [_normalize_record(item) for item in records if isinstance(item, dict)]
    entry["updated_at"] = _utc_now_iso()
    apps[normalized_app_id] = entry
    _save_state(normalized_workspace_id, {"apps": apps})
    return _normalized_contract_payload(normalized_workspace_id, entry)


def get_hosted_mini_app_manifest(workspace_id: str, app_id: str, *, user_id: str = "") -> Dict[str, Any]:
    contract = get_mini_app_contract(workspace_id, app_id)
    manifest = mini_app_host_service.build_hosted_mini_app_manifest(
        workspace_id=_normalize_workspace_id(workspace_id),
        app_contract=contract,
        launch_user_id=user_id,
        install_id=str(contract.get("install_id") or contract.get("install_status") or "").strip(),
    )
    if not manifest:
        raise KeyError(f"Mini app '{_normalize_app_id(app_id)}' does not expose a hosted manifest.")
    return {
        "workspace_id": _normalize_workspace_id(workspace_id),
        "app_id": contract["app_id"],
        "label": contract.get("label"),
        "description": contract.get("description"),
        "icon_url": contract.get("icon_url"),
        "category": contract.get("category"),
        "publisher_id": contract.get("publisher_id"),
        "publisher_name": contract.get("publisher_name"),
        "publisher_domain": contract.get("publisher_domain"),
        "support_url": contract.get("support_url"),
        "privacy_url": contract.get("privacy_url"),
        "terms_url": contract.get("terms_url"),
        "runtime_type": contract.get("runtime_type"),
        "runtime_mode": contract.get("runtime_mode"),
        "destination_url": contract.get("destination_url"),
        "platform_route": contract.get("platform_route"),
        "verification_status": contract.get("verification_status"),
        "official_claim": dict(contract.get("official_claim") or {}),
        "domain_proof": dict(contract.get("domain_proof") or {}),
        **manifest,
    }


def retrieve_mini_app_records(
    workspace_id: str,
    app_id: str,
    *,
    filters: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_app_id = _normalize_app_id(app_id)
    state = _safe_read_state(normalized_workspace_id)
    entry = state.get("apps", {}).get(normalized_app_id)
    if not isinstance(entry, dict):
        raise KeyError(f"Mini app '{normalized_app_id}' was not found.")
    payload = dict(filters or {})
    if not _has_narrow_retrieve_filters(payload):
        raise ValueError(
            "Raw mini-app record retrieval requires a narrow user query "
            "(ids, kind, tag/tags, since/until, or text_query)."
        )
    ids_filter = {
        str(item).strip()
        for item in list(payload.get("ids") or [])
        if str(item).strip()
    }
    kind_filter = str(payload.get("kind") or "").strip().lower()
    tag_filter = {
        str(item).strip().lower()
        for item in (
            list(payload.get("tags") or [])
            + ([payload.get("tag")] if str(payload.get("tag") or "").strip() else [])
        )
        if str(item).strip()
    }
    since_dt = _parse_isoish(payload.get("since"))
    until_dt = _parse_isoish(payload.get("until"))
    text_query = str(payload.get("text_query") or "").strip().lower()
    limit = min(MAX_RETRIEVE_LIMIT, max(1, int(payload.get("limit") or DEFAULT_RETRIEVE_LIMIT)))
    items = []
    for item in list(entry.get("records") or []):
        if not isinstance(item, dict):
            continue
        record = _normalize_record(item)
        if ids_filter and str(record.get("id") or "").strip() not in ids_filter:
            continue
        if kind_filter and str(record.get("kind") or record.get("type") or "").strip().lower() != kind_filter:
            continue
        record_tags = {
            str(tag).strip().lower()
            for tag in (record.get("tags") if isinstance(record.get("tags"), list) else [record.get("tags")])
            if str(tag or "").strip()
        }
        if tag_filter and not (record_tags & tag_filter):
            continue
        timestamp = _parse_isoish(_record_timestamp(record))
        if since_dt is not None and timestamp is not None and timestamp < since_dt:
            continue
        if until_dt is not None and timestamp is not None and timestamp > until_dt:
            continue
        if text_query:
            haystack = json.dumps(record, sort_keys=True, ensure_ascii=False).lower()
            if text_query not in haystack:
                continue
        items.append(record)
    items.sort(key=lambda record: _record_timestamp(record), reverse=True)
    return {
        "workspace_id": normalized_workspace_id,
        "app_id": normalized_app_id,
        "filters_applied": {
            "ids": sorted(ids_filter),
            "kind": kind_filter or None,
            "tags": sorted(tag_filter),
            "since": str(payload.get("since") or "").strip() or None,
            "until": str(payload.get("until") or "").strip() or None,
            "text_query": text_query or None,
            "limit": limit,
        },
        "items": items[:limit],
        "count": len(items[:limit]),
        "total_matches": len(items),
    }


def list_mini_app_records(
    workspace_id: str,
    app_id: str,
) -> List[Dict[str, Any]]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_app_id = _normalize_app_id(app_id)
    if not normalized_app_id:
        raise ValueError("Mini app id is required.")
    state = _safe_read_state(normalized_workspace_id)
    entry = state.get("apps", {}).get(normalized_app_id)
    if not isinstance(entry, dict):
        return []
    records = [
        _normalize_record(item)
        for item in list(entry.get("records") or [])
        if isinstance(item, dict)
    ]
    records.sort(key=lambda record: _record_timestamp(record), reverse=True)
    return records


def export_mini_apps_state(workspace_id: str) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    state = _safe_read_state(normalized_workspace_id)
    apps = []
    total_records = 0
    for app_id, entry in sorted((state.get("apps") or {}).items()):
        if not isinstance(entry, dict):
            continue
        records = [
            _normalize_record(item)
            for item in list(entry.get("records") or [])
            if isinstance(item, dict)
        ]
        records.sort(key=lambda record: _record_timestamp(record), reverse=True)
        total_records += len(records)
        contract = _normalized_contract_payload(normalized_workspace_id, entry)
        apps.append(
            {
                "app_id": app_id,
                "label": contract.get("label"),
                "description": contract.get("description"),
                "delivery_mode": contract.get("delivery_mode"),
                "permissions": list(contract.get("permissions") or []),
                "records_count": len(records),
                "records": records,
                "current_state": dict(entry.get("current_state") or {}),
                "daily_summary": dict(entry.get("daily_summary") or {}),
                "weekly_summary": dict(entry.get("weekly_summary") or {}),
                "long_term_facts": list(entry.get("long_term_facts") or []),
                "updated_at": str(entry.get("updated_at") or "").strip() or None,
            }
        )
    return {
        "workspace_id": normalized_workspace_id,
        "export_type": "mini_apps_state",
        "exported_at": _utc_now_iso(),
        "apps": apps,
        "count": len(apps),
        "total_records": total_records,
    }


def wipe_mini_apps_state(workspace_id: str) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    state = _safe_read_state(normalized_workspace_id)
    apps = state.get("apps") if isinstance(state.get("apps"), dict) else {}
    deleted_apps_count = len(apps)
    deleted_records_count = 0
    for entry in apps.values():
        if isinstance(entry, dict):
            deleted_records_count += len(list(entry.get("records") or []))
    _save_state(normalized_workspace_id, _default_state())
    return {
        "workspace_id": normalized_workspace_id,
        "deleted_apps_count": deleted_apps_count,
        "deleted_records_count": deleted_records_count,
        "wiped_at": _utc_now_iso(),
    }


def build_mini_apps_context_block(
    workspace_id: str,
    *,
    max_apps: int = 5,
    max_recent_events: int = 3,
    max_long_term_facts: int = 4,
) -> str:
    payload = list_mini_app_contracts(workspace_id)
    items = list(payload.get("items") or [])
    if not items:
        return ""
    sections = [
        "Mini App Summaries\n"
        "These are compact app-level summaries for Sage. They are not complete raw histories. "
        "Use mini-app record retrieval when deeper detail is needed."
    ]
    for item in items[:max_apps]:
        lines = [f"[{item['label']}]"]
        current_state = _compact_scalar(item.get("current_state"))
        if current_state:
            lines.append(f"- Current state: {current_state}")
        recent_events = list(item.get("recent_events") or [])[:max_recent_events]
        if recent_events:
            rendered_events = "; ".join(
                _compact_scalar(event, limit=120)
                for event in recent_events
                if _compact_scalar(event, limit=120)
            )
            if rendered_events:
                lines.append(f"- Recent events: {rendered_events}")
        daily_summary = _compact_scalar(item.get("daily_summary"))
        if daily_summary:
            lines.append(f"- Daily summary: {daily_summary}")
        weekly_summary = _compact_scalar(item.get("weekly_summary"))
        if weekly_summary:
            lines.append(f"- Weekly summary: {weekly_summary}")
        facts = [
            _compact_scalar(fact.get("text") if isinstance(fact, dict) else fact, limit=120)
            for fact in list(item.get("long_term_facts") or [])[:max_long_term_facts]
        ]
        facts = [fact for fact in facts if fact]
        if facts:
            lines.append(f"- Long-term facts: {'; '.join(facts)}")
        lines.append("- Retrieval hook: retrieve_records(filters) for narrow raw history slices.")
        sections.append("\n".join(lines))
    return "\n\n".join(section for section in sections if section).strip()
