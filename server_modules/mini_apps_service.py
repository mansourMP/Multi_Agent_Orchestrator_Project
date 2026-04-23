from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server_modules import mini_app_host_service, workspace_context


MINI_APP_CONTRACT_VERSION = 1
MAX_RETRIEVE_LIMIT = 200
DEFAULT_RETRIEVE_LIMIT = 25
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


def _mini_apps_state_path(workspace_id: str) -> Path:
    return workspace_context.workspace_scope_dir(workspace_id) / "mini_apps.json"


def _normalize_workspace_id(workspace_id: Any) -> str:
    return str(workspace_id or "default").strip() or "default"


def _normalize_app_id(app_id: Any) -> str:
    token = re.sub(r"[^a-z0-9_-]+", "_", str(app_id or "").strip().lower()).strip("_")
    return token


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
        "delivery_mode": "structured",
        "hosted_url": None,
        "embed_kind": "iframe",
        "allowed_origins": [],
        "bridge_contracts": {},
        "permissions": [],
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
        payload = _default_state()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        return payload
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
            "delivery_mode": str(entry.get("delivery_mode") or base["delivery_mode"]).strip().lower() or base["delivery_mode"],
            "hosted_url": str(entry.get("hosted_url") or "").strip() or None,
            "embed_kind": str(entry.get("embed_kind") or base["embed_kind"]).strip().lower() or base["embed_kind"],
            "allowed_origins": list(entry.get("allowed_origins") or []) if isinstance(entry.get("allowed_origins"), list) else [],
            "bridge_contracts": dict(entry.get("bridge_contracts") or {}) if isinstance(entry.get("bridge_contracts"), dict) else {},
            "permissions": list(entry.get("permissions") or []) if isinstance(entry.get("permissions"), list) else [],
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
    path.write_text(json.dumps(normalized, indent=2, sort_keys=True), encoding="utf-8")
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
        "delivery_mode": hosted_fields["delivery_mode"],
        "memory_scope": "none_by_default",
        "permissions": list(hosted_fields.get("permissions") or []),
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
    if hosted_fields.get("hosted_url"):
        contract_payload["hosted_url"] = hosted_fields["hosted_url"]
        manifest = mini_app_host_service.build_hosted_mini_app_manifest(
            workspace_id=_normalize_workspace_id(workspace_id),
            app_contract=contract_payload,
        )
        if manifest:
            contract_payload.update(manifest)
    return contract_payload


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


def upsert_mini_app_contract(
    workspace_id: str,
    app_id: str,
    *,
    label: Any = None,
    description: Any = None,
    delivery_mode: Any = None,
    hosted_url: Any = None,
    embed_kind: Any = None,
    allowed_origins: Any = None,
    bridge_contracts: Any = None,
    permissions: Any = None,
    context_envelope: Any = None,
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


def get_hosted_mini_app_manifest(workspace_id: str, app_id: str) -> Dict[str, Any]:
    contract = get_mini_app_contract(workspace_id, app_id)
    manifest = mini_app_host_service.build_hosted_mini_app_manifest(
        workspace_id=_normalize_workspace_id(workspace_id),
        app_contract=contract,
    )
    if not manifest:
        raise KeyError(f"Mini app '{_normalize_app_id(app_id)}' does not expose a hosted manifest.")
    return {
        "workspace_id": _normalize_workspace_id(workspace_id),
        "app_id": contract["app_id"],
        "label": contract.get("label"),
        "description": contract.get("description"),
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
