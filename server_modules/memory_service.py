from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import hashlib
import json
import sqlite3
import re
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from fastapi import HTTPException

from server_modules import agent_memory as _workspace_memory_store
from server_modules.telemetry import get_tracer, set_span_attributes
from server_modules.workspace_context import read_workspace_context_files


def _normalize_workspace_id(workspace_id: str) -> str:
    return str(workspace_id or "default").strip() or "default"


def _normalize_memory_lookup_key(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_. -]+", " ", str(value or "").strip().lower())
    return re.sub(r"\s+", "_", cleaned).strip("_")


def _trim_memory_value(value: str) -> str:
    return str(value or "").strip().rstrip(".")


@dataclass(slots=True)
class MemoryQuery:
    tenant_id: str = ""
    workspace_id: str = "default"
    agent_install_id: str = ""
    session_id: str = ""
    text: str = ""
    limit: int = 5
    include_workspace_context: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class MemoryItem:
    source: str
    text: str
    score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class MemoryResult:
    items: List[MemoryItem] = field(default_factory=list)
    context_blocks: List[str] = field(default_factory=list)


@dataclass(slots=True)
class WorkspaceMemorySnapshot:
    workspace_id: str
    agent_install_id: str = ""
    entries: List[Dict[str, Any]] = field(default_factory=list)
    text: str = ""

    def as_payload(self) -> Dict[str, Any]:
        return {
            "workspace_id": self.workspace_id,
            "agent_install_id": self.agent_install_id or None,
            "entries": list(self.entries),
            "text": self.text,
        }


UtcNowFn = Callable[[], Any]
UtcNowIsoFn = Callable[[], str]
ParseUtcTsFn = Callable[[Any], Any]
NormalizeWorkspaceFn = Callable[[Any], Optional[str]]
JsonSafeFn = Callable[[Any], Any]
CompactTextFn = Callable[[Any, int], str]
EmitLogFn = Callable[[Any, str, str], None]
RefreshArchivedFn = Callable[[str, Dict[str, Any]], None]


class _RuntimeMemoryCompat:
    def __init__(self) -> None:
        self.ORION_MEMORY_ENABLED = False
        self.ORION_MEMORY_LANCEDB_URI = ""
        self.ORION_MEMORY_DB_PATH = ""
        self.ORION_MEMORY_READ_K = 5
        self.ORION_MEMORY_RETENTION_DAYS_DEFAULT = 30
        self.ORION_MEMORY_MAX_TEXT_CHARS = 6000
        self.MEMORY_BUCKETS: Set[str] = set()
        self.RuntimeMemoryManager: Any = None
        self.UTC_NOW: Optional[UtcNowFn] = None
        self.UTC_NOW_ISO: Optional[UtcNowIsoFn] = None
        self.PARSE_UTC_TS: Optional[ParseUtcTsFn] = None
        self.NORMALIZE_WORKSPACE_ID: Optional[NormalizeWorkspaceFn] = None
        self.JSON_SAFE: Optional[JsonSafeFn] = None
        self.COMPACT_EVENT_TEXT: Optional[CompactTextFn] = None
        self.EMIT_LOG: Optional[EmitLogFn] = None
        self.REFRESH_ARCHIVED_RUN_SNAPSHOT: Optional[RefreshArchivedFn] = None
        self.MEMORY_MANAGER_LOCK = threading.Lock()
        self.MEMORY_MANAGER_INSTANCE: Any = None
        self.MEMORY_MANAGER_ERROR: Optional[str] = None

    def _configure_runtime_memory(
        self,
        *,
        memory_enabled: bool,
        memory_lancedb_uri: str,
        memory_db_path: str,
        memory_read_k: int,
        memory_retention_days_default: int,
        memory_max_text_chars: int,
        memory_buckets: Set[str],
        runtime_memory_manager: Any,
        utc_now: UtcNowFn,
        utc_now_iso: UtcNowIsoFn,
        parse_utc_ts: ParseUtcTsFn,
        normalize_workspace_id: NormalizeWorkspaceFn,
        json_safe: JsonSafeFn,
        compact_event_text: CompactTextFn,
        emit_log: EmitLogFn,
        refresh_archived_run_snapshot: RefreshArchivedFn,
    ) -> None:
        self.ORION_MEMORY_ENABLED = bool(memory_enabled)
        self.ORION_MEMORY_LANCEDB_URI = str(memory_lancedb_uri)
        self.ORION_MEMORY_DB_PATH = str(memory_db_path)
        self.ORION_MEMORY_READ_K = int(memory_read_k)
        self.ORION_MEMORY_RETENTION_DAYS_DEFAULT = int(memory_retention_days_default)
        self.ORION_MEMORY_MAX_TEXT_CHARS = int(memory_max_text_chars)
        self.MEMORY_BUCKETS = set(memory_buckets)
        self.RuntimeMemoryManager = runtime_memory_manager
        self.UTC_NOW = utc_now
        self.UTC_NOW_ISO = utc_now_iso
        self.PARSE_UTC_TS = parse_utc_ts
        self.NORMALIZE_WORKSPACE_ID = normalize_workspace_id
        self.JSON_SAFE = json_safe
        self.COMPACT_EVENT_TEXT = compact_event_text
        self.EMIT_LOG = emit_log
        self.REFRESH_ARCHIVED_RUN_SNAPSHOT = refresh_archived_run_snapshot

    def _utc_now(self) -> Any:
        if self.UTC_NOW is None:
            raise RuntimeError("UTC_NOW not configured")
        return self.UTC_NOW()

    def _utc_now_iso(self) -> str:
        if self.UTC_NOW_ISO is None:
            raise RuntimeError("UTC_NOW_ISO not configured")
        return self.UTC_NOW_ISO()

    def _parse_utc_ts(self, value: Any) -> Any:
        if self.PARSE_UTC_TS is None:
            raise RuntimeError("PARSE_UTC_TS not configured")
        return self.PARSE_UTC_TS(value)

    def _normalize_workspace_id(self, value: Any) -> Optional[str]:
        if self.NORMALIZE_WORKSPACE_ID is None:
            raise RuntimeError("NORMALIZE_WORKSPACE_ID not configured")
        return self.NORMALIZE_WORKSPACE_ID(value)

    def _json_safe(self, value: Any) -> Any:
        if self.JSON_SAFE is None:
            raise RuntimeError("JSON_SAFE not configured")
        return self.JSON_SAFE(value)

    def _compact_event_text(self, value: Any, limit: int = 800) -> str:
        if self.COMPACT_EVENT_TEXT is None:
            raise RuntimeError("COMPACT_EVENT_TEXT not configured")
        return self.COMPACT_EVENT_TEXT(value, limit)

    def _emit_log(self, log_queue: Any, level: str, message: str, event: str = "runtime", data: Optional[dict] = None) -> None:
        if self.EMIT_LOG is None:
            raise RuntimeError("EMIT_LOG not configured")
        self.EMIT_LOG(log_queue, level, message, event=event, data=data)

    def _refresh_archived_run_snapshot(self, run_id: str, run: Dict[str, Any]) -> None:
        if self.REFRESH_ARCHIVED_RUN_SNAPSHOT is None:
            return
        self.REFRESH_ARCHIVED_RUN_SNAPSHOT(run_id, run)

    def _normalize_memory_bucket(self, value: Any, *, required: bool = True) -> Optional[str]:
        bucket = str(value or "").strip().lower()
        if not bucket:
            if required:
                raise HTTPException(status_code=400, detail="memory bucket is required.")
            return None
        if bucket not in self.MEMORY_BUCKETS:
            raise HTTPException(status_code=400, detail="memory bucket must be one of: profile, project, session.")
        return bucket

    def _memory_manager(self) -> Any:
        if not self.ORION_MEMORY_ENABLED:
            self.MEMORY_MANAGER_ERROR = "memory_disabled"
            return None
        with self.MEMORY_MANAGER_LOCK:
            if self.MEMORY_MANAGER_INSTANCE is not None:
                return self.MEMORY_MANAGER_INSTANCE
            if self.RuntimeMemoryManager is None:
                self.MEMORY_MANAGER_ERROR = "memory_manager_import_failed"
                return None
            try:
                self.MEMORY_MANAGER_INSTANCE = self.RuntimeMemoryManager(
                    lancedb_uri=self.ORION_MEMORY_LANCEDB_URI,
                    sqlite_path=self.ORION_MEMORY_DB_PATH,
                )
                self.MEMORY_MANAGER_ERROR = None
                return self.MEMORY_MANAGER_INSTANCE
            except Exception as exc:
                self.MEMORY_MANAGER_ERROR = f"memory_manager_init_failed: {exc}"
                self.MEMORY_MANAGER_INSTANCE = None
                return None

    def _memory_manager_or_503(self) -> Any:
        manager = self._memory_manager()
        if manager is None:
            reason = self.MEMORY_MANAGER_ERROR or "memory_unavailable"
            raise HTTPException(status_code=503, detail=reason)
        return manager


# Internal runtime-memory state after folding the separate runtime_memory.py
# subsystem into this service boundary.
runtime_memory = _RuntimeMemoryCompat()


def list_memory_entries(workspace_id: str, *, agent_install_id: str | None = None) -> List[Dict[str, Any]]:
    return _workspace_memory_store._list_memory_entries(
        _normalize_workspace_id(workspace_id),
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def save_memory(
    workspace_id: str,
    key: str,
    content: str,
    *,
    sync_memory_md: bool = True,
    agent_install_id: str | None = None,
) -> None:
    _workspace_memory_store._save_memory(
        _normalize_workspace_id(workspace_id),
        key,
        content,
        sync_memory_md=sync_memory_md,
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def get_memory(workspace_id: str, *, agent_install_id: str | None = None) -> str:
    return _workspace_memory_store._get_memory(
        _normalize_workspace_id(workspace_id),
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def semantic_search(
    workspace_id: str,
    query: str,
    top_k: int = 5,
    *,
    agent_install_id: str | None = None,
) -> List[Dict[str, Any]]:
    return _workspace_memory_store._semantic_search(
        _normalize_workspace_id(workspace_id),
        query,
        top_k=top_k,
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def delete_memory(workspace_id: str, key: str, *, agent_install_id: str | None = None) -> bool:
    return _workspace_memory_store._delete_memory(
        _normalize_workspace_id(workspace_id),
        key,
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def save_daily_log(workspace_id: str, content: str, *, agent_install_id: str | None = None) -> None:
    _workspace_memory_store._save_daily_log(
        _normalize_workspace_id(workspace_id),
        content,
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def get_recent_logs(workspace_id: str, days: int = 7, *, agent_install_id: str | None = None) -> str:
    return _workspace_memory_store._get_recent_logs(
        _normalize_workspace_id(workspace_id),
        days=days,
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def list_memory_notebook_files(workspace_id: str, *, agent_install_id: str | None = None) -> List[Dict[str, Any]]:
    return _workspace_memory_store._list_memory_notebook_files(
        _normalize_workspace_id(workspace_id),
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def search_memory_notebook(
    workspace_id: str,
    query: str,
    *,
    max_results: int = 5,
    agent_install_id: str | None = None,
) -> List[Dict[str, Any]]:
    return _workspace_memory_store._search_memory_notebook(
        _normalize_workspace_id(workspace_id),
        query,
        max_results=max_results,
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def get_memory_notebook_excerpt(
    workspace_id: str,
    rel_path: str,
    *,
    from_line: int | None = None,
    line_count: int | None = None,
    agent_install_id: str | None = None,
) -> Dict[str, Any]:
    return _workspace_memory_store._get_memory_notebook_excerpt(
        _normalize_workspace_id(workspace_id),
        rel_path,
        from_line=from_line,
        line_count=line_count,
        agent_install_id=str(agent_install_id or "").strip() or None,
    )


def workspace_memory_snapshot(workspace_id: str, *, agent_install_id: str | None = None) -> WorkspaceMemorySnapshot:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_agent_install_id = str(agent_install_id or "").strip()
    entries = list_memory_entries(normalized_workspace_id, agent_install_id=normalized_agent_install_id or None)
    return WorkspaceMemorySnapshot(
        workspace_id=normalized_workspace_id,
        agent_install_id=normalized_agent_install_id,
        entries=entries,
        text=get_memory(normalized_workspace_id, agent_install_id=normalized_agent_install_id or None),
    )


def workspace_sidecar_dir(workspace_id: str, sidecar_name: str) -> Path:
    root = Path(_workspace_memory_store._MEMORY_DIR)
    root.mkdir(parents=True, exist_ok=True)
    workspace_token = _workspace_memory_store._normalize_workspace_token(_normalize_workspace_id(workspace_id))
    normalized_sidecar = str(sidecar_name or "").strip().lower() or "sidecar"
    path = root / workspace_token / normalized_sidecar
    path.mkdir(parents=True, exist_ok=True)
    return path


def _summary_bridge_dir(workspace_id: str) -> Path:
    return workspace_sidecar_dir(workspace_id, "hybrid_summary_bridge")


def _summary_bridge_log_path(workspace_id: str) -> Path:
    return _summary_bridge_dir(workspace_id) / "payloads.jsonl"


def _read_summary_bridge_records(workspace_id: str) -> List[Dict[str, Any]]:
    path = _summary_bridge_log_path(workspace_id)
    if not path.exists():
        return []
    items: List[Dict[str, Any]] = []
    try:
        raw_lines = path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return []
    for line in raw_lines:
        if not str(line or "").strip():
            continue
        try:
            payload = json.loads(line)
        except Exception:
            continue
        if isinstance(payload, dict):
            items.append(dict(payload))
    return items


def publish_hybrid_summary_bridge_payload(
    workspace_id: str,
    *,
    payload_class: str,
    summary: str,
    items: Optional[List[Dict[str, Any]]] = None,
    memory_layer: Optional[str] = None,
    agent_install_id: str | None = None,
    run_id: str | None = None,
    source_runtime_mode: str = "local_secure",
    last_safe: bool = False,
    allowed_payload_classes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    from server_modules import hybrid_policy_service

    record_payload = hybrid_policy_service.build_summary_bridge_payload_record(
        payload_class=payload_class,
        summary=summary,
        items=items,
        memory_layer=memory_layer,
        agent_install_id=agent_install_id,
        run_id=run_id,
        source_runtime_mode=source_runtime_mode,
        last_safe=last_safe,
        allowed_payload_classes=allowed_payload_classes,
    )
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    record_id = hashlib.sha1(
        json.dumps(
            {
                "workspace_id": _normalize_workspace_id(workspace_id),
                "payload_class": record_payload["payload_class"],
                "summary": record_payload["summary"],
                "agent_install_id": record_payload.get("agent_install_id"),
                "run_id": record_payload.get("run_id"),
                "created_at": created_at,
            },
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()[:16]
    record = {
        "record_id": record_id,
        "workspace_id": _normalize_workspace_id(workspace_id),
        "created_at": created_at,
        **record_payload,
    }
    path = _summary_bridge_log_path(workspace_id)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")
    return record


def list_hybrid_summary_bridge_payloads(
    workspace_id: str,
    *,
    payload_classes: Optional[List[str]] = None,
    agent_install_id: str | None = None,
    last_safe_only: bool = False,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    from server_modules import hybrid_policy_service

    records = _read_summary_bridge_records(workspace_id)
    allowed = set(hybrid_policy_service.normalize_summary_bridge_payload_classes(payload_classes or []))
    normalized_agent_install_id = str(agent_install_id or "").strip() or None
    items: List[Dict[str, Any]] = []
    for record in records:
        payload_class = str(record.get("payload_class") or "").strip()
        if payload_class not in hybrid_policy_service.SUMMARY_BRIDGE_ALLOWED_PAYLOADS:
            continue
        if allowed and payload_class not in allowed:
            continue
        record_agent_install_id = str(record.get("agent_install_id") or "").strip() or None
        if normalized_agent_install_id is not None and record_agent_install_id != normalized_agent_install_id:
            continue
        if last_safe_only and not bool(record.get("last_safe")):
            continue
        items.append(dict(record))
    items.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
    safe_limit = max(1, min(int(limit or 10), 50))
    return items[:safe_limit]


def hybrid_summary_bridge_status(
    workspace_id: str,
    *,
    payload_classes: Optional[List[str]] = None,
    agent_install_id: str | None = None,
) -> Dict[str, Any]:
    from server_modules import hybrid_policy_service

    records = list_hybrid_summary_bridge_payloads(
        workspace_id,
        payload_classes=payload_classes,
        agent_install_id=agent_install_id,
        limit=100,
    )
    return hybrid_policy_service.summarize_summary_bridge_records(
        records,
        payload_classes=payload_classes,
    )


def shared_operational_board_access_contract() -> Dict[str, Any]:
    return {
        "default_access": "permissioned_shared_read",
        "permission_tiers": ["read", "propose_update", "publish_update"],
        "published_entries_visible_by_default": True,
        "private_memory_import_allowed": False,
    }


def artifacts_history_access_contract() -> Dict[str, Any]:
    return {
        "default_access": "explicit_artifact_exchange",
        "cross_install_exchange_mode": "artifacts_only",
        "raw_private_memory_embeds_allowed": False,
        "shared_board_publish_required_for_workspace_visibility": True,
    }


def list_shared_operational_board_entries(
    workspace_id: str,
    *,
    actor_permission: str = "read",
    include_proposed: bool = False,
    entry_kind: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    from server_modules import shared_operational_board_service

    return shared_operational_board_service.list_shared_operational_board_entries(
        workspace_id,
        actor_permission=actor_permission,
        include_proposed=include_proposed,
        entry_kind=entry_kind,
        limit=limit,
    )


def get_shared_operational_board_history(
    workspace_id: str,
    entry_id: str,
    *,
    actor_permission: str = "read",
    include_proposed: bool = False,
) -> List[Dict[str, Any]]:
    from server_modules import shared_operational_board_service

    return shared_operational_board_service.get_shared_operational_board_history(
        workspace_id,
        entry_id,
        actor_permission=actor_permission,
        include_proposed=include_proposed,
    )


def query_memory(query: MemoryQuery) -> MemoryResult:
    normalized_workspace_id = _normalize_workspace_id(query.workspace_id)
    normalized_agent_install_id = str(query.agent_install_id or "").strip()
    safe_limit = max(1, min(int(query.limit or 5), 20))
    normalized_query_text = str(query.text or "").strip()
    tracer = get_tracer("server_modules.memory_service")
    with tracer.start_as_current_span("memory_service.query_memory") as span:
        set_span_attributes(
            span,
            {
                "memory_type": "workspace_query",
                "workspace_id": normalized_workspace_id,
                "agent_install_id": normalized_agent_install_id or None,
                "tenant_id": str(query.tenant_id or "").strip() or "default",
                "actor_type": str(query.metadata.get("actor_type") or "").strip() or "runtime",
                "run_id": str(query.metadata.get("run_id") or "").strip() or None,
                "memory_limit": safe_limit,
            },
        )
        items: List[MemoryItem] = []

        if normalized_query_text:
            for entry in semantic_search(
                normalized_workspace_id,
                normalized_query_text,
                top_k=safe_limit,
                agent_install_id=normalized_agent_install_id or None,
            ):
                key = str(entry.get("key") or "").strip()
                content = str(entry.get("content") or "").strip()
                if not content:
                    continue
                item_text = f"{key}: {content}" if key else content
                items.append(
                    MemoryItem(
                        source="workspace_memory",
                        text=item_text,
                        score=float(entry.get("score") or 0.0),
                        metadata={
                            "key": key,
                            "content": content,
                            "created_at": float(entry.get("created_at") or 0.0),
                            "updated_at": float(entry.get("updated_at") or 0.0),
                        },
                    )
                )

        context_blocks: List[str] = []
        if query.include_workspace_context:
            memory_text = get_memory(normalized_workspace_id, agent_install_id=normalized_agent_install_id or None)
            if memory_text:
                context_blocks.append(f"Runtime Memory Facts\n{memory_text}")
            recent_logs = get_recent_logs(
                normalized_workspace_id,
                days=7,
                agent_install_id=normalized_agent_install_id or None,
            )
            if recent_logs:
                context_blocks.append(f"Recent Daily Logs\n{recent_logs[:6000].rstrip()}")

        set_span_attributes(span, {"memory_result_count": len(items), "context_block_count": len(context_blocks)})
        return MemoryResult(items=items, context_blocks=context_blocks)


def direct_chat_memory_context_message(
    workspace_id: str,
    *,
    system_prefix: str,
    agent_install_id: str | None = None,
) -> Dict[str, str] | None:
    memory = get_memory(workspace_id, agent_install_id=agent_install_id)
    if not memory:
        return None
    return {
        "role": "system",
        "content": f"{system_prefix}{memory}",
    }


def direct_chat_workspace_context_text(
    workspace_id: str,
    *,
    memory_query: str = "",
    agent_install_id: str | None = None,
) -> str:
    sections: List[str] = []
    try:
        context_files = read_workspace_context_files(
            workspace_id=workspace_id,
            agent_install_id=str(agent_install_id or "").strip() or None,
        )
    except Exception:
        context_files = {}

    for filename in ("SOUL.md", "USER.md", "MEMORY.md"):
        content = str(context_files.get(filename) or "").strip()
        if content:
            sections.append(f"{filename}\n{content}")

    recent_logs = get_recent_logs(workspace_id, days=7, agent_install_id=agent_install_id)
    if recent_logs:
        sections.append(f"Recent Daily Logs\n{recent_logs[:6000].rstrip()}")

    memory_entries = (
        semantic_search(workspace_id, memory_query, top_k=5, agent_install_id=agent_install_id)
        if str(memory_query or "").strip()
        else []
    )
    if memory_entries:
        memory_facts = "\n".join(
            f"- {str(item.get('key') or '').strip()}: {str(item.get('content') or '').strip()}"
            for item in memory_entries
            if str(item.get("content") or "").strip()
        ).strip()
    else:
        memory_facts = get_memory(workspace_id, agent_install_id=agent_install_id)
    if memory_facts:
        sections.append(f"Runtime Memory Facts\n{memory_facts}")

    if not sections:
        return ""
    return (
        "Workspace context files. Use these as durable background instructions and facts when they are relevant.\n\n"
        + "\n\n".join(sections)
    ).strip()


def store_direct_chat_memory_fact(workspace_id: str, fact: str) -> None:
    normalized_fact = re.sub(r"\s+", " ", str(fact or "").strip())
    if not normalized_fact:
        return
    memory_key = f"fact-{hashlib.sha1(normalized_fact.encode('utf-8')).hexdigest()[:16]}"
    save_memory(workspace_id, memory_key, normalized_fact)


def build_direct_chat_daily_log_summary(*, user_message: str, assistant_reply: str) -> str:
    normalized_user_message = re.sub(r"\s+", " ", str(user_message or "").strip())
    normalized_assistant_reply = re.sub(r"\s+", " ", str(assistant_reply or "").strip())
    if not normalized_user_message or not normalized_assistant_reply:
        return ""
    user_excerpt = normalized_user_message[:320].rstrip()
    assistant_excerpt = normalized_assistant_reply[:500].rstrip()
    return (
        f"- User: {user_excerpt}\n"
        f"- Assistant: {assistant_excerpt}"
    ).strip()


def save_direct_chat_daily_log_summary(*, workspace_id: str, user_message: str, assistant_reply: str) -> str:
    summary = build_direct_chat_daily_log_summary(
        user_message=user_message,
        assistant_reply=assistant_reply,
    )
    if summary:
        save_daily_log(workspace_id, summary)
    return summary


def parse_direct_chat_memory_facts(raw_text: str) -> List[str]:
    text = str(raw_text or "").strip()
    if not text:
        return []
    candidate = text
    fenced = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
    if fenced:
        candidate = str(fenced.group(1) or "").strip()
    else:
        array_match = re.search(r"\[[\s\S]*\]", text)
        if array_match:
            candidate = str(array_match.group(0) or "").strip()
    parsed: Any = None
    try:
        parsed = json.loads(candidate)
    except Exception:
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = None
    if isinstance(parsed, dict):
        facts_value = parsed.get("facts")
        if isinstance(facts_value, list):
            parsed = facts_value
    if not isinstance(parsed, list):
        return []
    normalized: List[str] = []
    seen: set[str] = set()
    for item in parsed:
        fact = re.sub(r"\s+", " ", str(item or "").strip())
        if not fact:
            continue
        normalized_key = fact.lower()
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        normalized.append(fact)
    return normalized


def persist_direct_chat_memory_best_effort(
    *,
    workspace_id: str,
    provider: str | None,
    model: str | None,
    credentials: Dict[str, Any] | None,
    reasoning_effort: str,
    prior_messages: List[Dict[str, str]],
    user_message: str,
    assistant_reply: str,
    generate_reply: Any,
    extraction_prompt: str,
    extraction_system_prompt: str,
) -> None:
    normalized_user_message = str(user_message or "").strip()
    normalized_assistant_reply = str(assistant_reply or "").strip()
    if not normalized_user_message or not normalized_assistant_reply:
        return
    try:
        save_direct_chat_daily_log_summary(
            workspace_id=workspace_id,
            user_message=normalized_user_message,
            assistant_reply=normalized_assistant_reply,
        )
    except Exception:
        pass
    extraction_prior_messages: List[Dict[str, str]] = list(prior_messages or [])
    extraction_prior_messages.append({"role": "user", "content": normalized_user_message})
    extraction_prior_messages.append({"role": "assistant", "content": normalized_assistant_reply})
    extraction_context = {
        "workspace_id": workspace_id,
        "provider": provider,
        "model": model,
        "source": "chat_direct_memory_extract",
        "reasoning_effort": reasoning_effort,
        "tools": [],
    }
    extraction_metadata: Dict[str, Any] = {
        "provider": provider,
        "model": model,
        "source": "chat_direct_memory_extract",
        "reasoning_effort": reasoning_effort,
        "tools": [],
    }
    if isinstance(credentials, dict) and credentials:
        extraction_metadata["credentials"] = credentials
    try:
        extraction_reply, _usage, _attempted, extraction_error = generate_reply(
            context=extraction_context,
            metadata=extraction_metadata,
            user_goal=extraction_prompt,
            system_prompt=extraction_system_prompt,
            prior_messages=extraction_prior_messages,
        )
        if extraction_error or not extraction_reply:
            return
        extracted_facts = parse_direct_chat_memory_facts(extraction_reply)
        for fact in extracted_facts:
            store_direct_chat_memory_fact(workspace_id, fact)
    except Exception:
        return


def find_workspace_memory_entry(workspace_id: str, query: str) -> Dict[str, Any] | None:
    normalized_query = _normalize_memory_lookup_key(query)
    if not normalized_query:
        return None
    entries = list_memory_entries(workspace_id)
    for entry in entries:
        entry_key = _normalize_memory_lookup_key(str(entry.get("key") or ""))
        if entry_key == normalized_query:
            return entry
    for entry in entries:
        entry_key = _normalize_memory_lookup_key(str(entry.get("key") or ""))
        entry_content = str(entry.get("content") or "").strip().lower()
        if normalized_query in entry_key or normalized_query.replace("_", " ") in entry_content:
            return entry
    return None


def memory_suggestion_prompts(workspace_id: str, *, limit: int = 2) -> List[str]:
    prompts: List[str] = []
    for entry in list_memory_entries(workspace_id)[: max(1, int(limit or 2))]:
        fact = re.sub(r"\s+", " ", str(entry.get("content") or "").strip())
        if not fact:
            continue
        prompts.append(f"Use my saved context: {fact[:120].rstrip()}")
    return prompts


def parse_no_provider_memory_write(message: str) -> Dict[str, str] | None:
    text = str(message or "").strip()
    if not text:
        return None
    match = re.search(r"remember(?:\s+that)?\s+my\s+name\s+is\s+(.+)$", text, flags=re.IGNORECASE)
    if match:
        value = _trim_memory_value(match.group(1))
        if value:
            return {"key": "name", "value": value, "display_key": "name"}
    match = re.search(r"remember\s*:\s*([a-z0-9_. -]+?)\s*=\s*(.+)$", text, flags=re.IGNORECASE)
    if match:
        key = _normalize_memory_lookup_key(match.group(1))
        value = _trim_memory_value(match.group(2))
        if key and value:
            return {"key": key, "value": value, "display_key": str(match.group(1) or "").strip()}
    match = re.search(r"remember\s+that\s+([a-z0-9_. -]+?)\s*=\s*(.+)$", text, flags=re.IGNORECASE)
    if match:
        key = _normalize_memory_lookup_key(match.group(1))
        value = _trim_memory_value(match.group(2))
        if key and value:
            return {"key": key, "value": value, "display_key": str(match.group(1) or "").strip()}
    match = re.search(r"remember\s+that\s+([a-z0-9_. -]+?)\s+is\s+(.+)$", text, flags=re.IGNORECASE)
    if match:
        raw_key = str(match.group(1) or "").strip()
        key = _normalize_memory_lookup_key(raw_key)
        value = _trim_memory_value(match.group(2))
        if key and value:
            return {"key": key, "value": value, "display_key": raw_key}
    return None


def parse_no_provider_memory_read(message: str) -> str | None:
    text = str(message or "").strip()
    compact = re.sub(r"\s+", " ", text.lower()).strip()
    if not text:
        return None
    if compact == "what is my name" or compact == "recall my name":
        return "name"
    for pattern in (
        r"what\s+is\s+([a-z0-9_. -]+)$",
        r"recall\s+([a-z0-9_. -]+)$",
        r"what\s+did\s+i\s+say\s+about\s+([a-z0-9_. -]+)$",
    ):
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip()
    return None


def handle_no_provider_memory_request(workspace_id: str, message: str) -> str | None:
    memory_write = parse_no_provider_memory_write(message)
    if memory_write is not None:
        save_memory(workspace_id, memory_write["key"], memory_write["value"])
        return f"Stored memory: {memory_write['display_key']} = {memory_write['value']}"
    memory_read = parse_no_provider_memory_read(message)
    if memory_read is None:
        return None
    entry = find_workspace_memory_entry(workspace_id, memory_read)
    if isinstance(entry, dict):
        key = str(entry.get("key") or memory_read).strip()
        content = str(entry.get("content") or "").strip()
        return f"{key} = {content}"
    return f"I don't have {memory_read} saved in memory yet."


def runtime_memory_search(
    *,
    query: str,
    bucket: str | None = None,
    workspace_id: str | None = None,
    agent_install_id: str | None = None,
    profile_id: str | None = None,
    project_id: str | None = None,
    session_key: str | None = None,
    k: int = 5,
) -> Dict[str, Any]:
    tracer = get_tracer("server_modules.memory_service")
    with tracer.start_as_current_span("memory_service.runtime_memory_search") as span:
        _memory_manager_or_503()
        normalized_bucket = _normalize_memory_bucket(bucket, required=False)
        normalized_workspace_id = _runtime_workspace_id(workspace_id)
        set_span_attributes(
            span,
            {
                "memory_type": normalized_bucket or "scoped_search",
                "workspace_id": normalized_workspace_id,
                "agent_install_id": str(agent_install_id or "").strip() or None,
                "tenant_id": "default",
                "actor_type": "runtime",
                "memory_limit": int(k),
            },
        )
        items = _memory_search_scoped(
            query=str(query or "").strip(),
            bucket=normalized_bucket,
            workspace_id=normalized_workspace_id,
            agent_install_id=str(agent_install_id or "").strip() or None,
            profile_id=str(profile_id or "").strip() or None,
            project_id=str(project_id or "").strip() or None,
            session_key=str(session_key or "").strip() or None,
            k=int(k),
        )
        set_span_attributes(span, {"memory_result_count": len(items)})
        return {
            "ok": True,
            "query": str(query or "").strip(),
            "bucket": normalized_bucket,
            "workspace_id": normalized_workspace_id,
            "agent_install_id": str(agent_install_id or "").strip() or None,
            "count": len(items),
            "items": items,
        }


def runtime_memory_upsert(
    *,
    text: str,
    bucket: str,
    workspace_id: str | None = None,
    agent_install_id: str | None = None,
    profile_id: str | None = None,
    project_id: str | None = None,
    session_key: str | None = None,
    source: str | None = None,
    retention_days: int | None = None,
    metadata: Dict[str, Any] | None = None,
    memory_id: str | None = None,
) -> Dict[str, Any]:
    manager = _memory_manager_or_503()
    normalized_bucket = _normalize_memory_bucket(bucket, required=True) or "session"
    normalized_workspace_id = _runtime_workspace_id(workspace_id)
    normalized_retention_days = int(retention_days or runtime_memory.ORION_MEMORY_RETENTION_DAYS_DEFAULT)
    expires_at = (_runtime_utc_now() + timedelta(days=normalized_retention_days)).isoformat().replace("+00:00", "Z")
    record_metadata = dict(metadata) if isinstance(metadata, dict) else {}
    record_metadata.update(
        {
            "bucket": normalized_bucket,
            "workspace_id": normalized_workspace_id,
            "agent_install_id": str(agent_install_id or "").strip(),
            "profile_id": str(profile_id or "").strip(),
            "project_id": str(project_id or "").strip(),
            "session_key": str(session_key or "").strip(),
            "source": str(source or "api").strip().lower() or "api",
            "retention_days": normalized_retention_days,
            "expires_at": expires_at,
        }
    )
    if isinstance(memory_id, str) and memory_id.strip():
        record_metadata["id"] = memory_id.strip()
    stored_id = manager.upsert_memory(str(text or "").strip(), record_metadata)
    return {
        "ok": True,
        "id": stored_id,
        "bucket": normalized_bucket,
        "workspace_id": normalized_workspace_id,
        "agent_install_id": str(agent_install_id or "").strip() or None,
        "retention_days": normalized_retention_days,
        "expires_at": expires_at,
    }


def configure_runtime_memory(**kwargs: Any) -> None:
    runtime_memory._configure_runtime_memory(**kwargs)


def _runtime_workspace_id(value: Any) -> str:
    normalized = runtime_memory._normalize_workspace_id(value)
    return str(normalized or "default").strip() or "default"


def _runtime_utc_now() -> Any:
    return runtime_memory._utc_now()


def _runtime_utc_now_iso() -> str:
    return runtime_memory._utc_now_iso()


def _memory_manager_or_503() -> Any:
    return runtime_memory._memory_manager_or_503()


def _normalize_memory_bucket(value: Any, *, required: bool = True) -> Optional[str]:
    return runtime_memory._normalize_memory_bucket(value, required=required)


def _memory_item_matches_scope(
    metadata: Dict[str, Any],
    *,
    bucket: Optional[str],
    workspace_id: Optional[str],
    agent_install_id: Optional[str],
    profile_id: Optional[str],
    project_id: Optional[str],
    session_key: Optional[str],
) -> bool:
    if bucket and str(metadata.get("bucket") or "").strip().lower() != bucket:
        return False
    if workspace_id and str(metadata.get("workspace_id") or "").strip() != workspace_id:
        return False
    item_agent_install_id = str(metadata.get("agent_install_id") or "").strip()
    if agent_install_id:
        if item_agent_install_id and item_agent_install_id != agent_install_id:
            return False
        if not item_agent_install_id:
            pass
    if profile_id and str(metadata.get("profile_id") or "").strip() != profile_id:
        return False
    if project_id and str(metadata.get("project_id") or "").strip() != project_id:
        return False
    if session_key and str(metadata.get("session_key") or "").strip() != session_key:
        return False
    expires_value = metadata.get("expires_at")
    expires_at = runtime_memory._parse_utc_ts(expires_value) if expires_value else None
    if expires_at and expires_at <= _runtime_utc_now():
        return False
    return True


def _memory_search_scoped(
    query: str,
    *,
    bucket: Optional[str] = None,
    workspace_id: Optional[str] = None,
    agent_install_id: Optional[str] = None,
    profile_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_key: Optional[str] = None,
    k: int = 5,
) -> List[Dict[str, Any]]:
    tracer = get_tracer("server_modules.memory_service")
    with tracer.start_as_current_span("memory_service.search_scoped") as span:
        set_span_attributes(
            span,
            {
                "memory_type": str(bucket or "scoped_search").strip() or "scoped_search",
                "workspace_id": str(workspace_id or "default").strip() or "default",
                "agent_install_id": str(agent_install_id or "").strip() or None,
                "tenant_id": "default",
                "actor_type": "runtime",
                "run_id": None,
                "memory_limit": int(k),
            },
        )
        manager = runtime_memory._memory_manager()
        if manager is None:
            set_span_attributes(span, {"memory_result_count": 0})
            return []
        try:
            fetch_limit = max(int(k), 1)
            fetch_limit = min(max(fetch_limit * 8, 24), 120)
            raw_results = manager.search_memory(query, fetch_limit)
        except Exception as exc:
            try:
                span.record_exception(exc)
            except Exception:
                pass
            return []
        if not isinstance(raw_results, list):
            set_span_attributes(span, {"memory_result_count": 0})
            return []

        out: List[Dict[str, Any]] = []
        seen_ids: Set[str] = set()
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            mem_id = str(item.get("id") or "").strip()
            if not mem_id or mem_id in seen_ids:
                continue
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            if not _memory_item_matches_scope(
                metadata,
                bucket=bucket,
                workspace_id=workspace_id,
                agent_install_id=agent_install_id,
                profile_id=profile_id,
                project_id=project_id,
                session_key=session_key,
            ):
                continue
            seen_ids.add(mem_id)
            out.append(
                {
                    "id": mem_id,
                    "text": str(item.get("text") or ""),
                    "score": item.get("score"),
                    "metadata": metadata,
                }
            )
            if len(out) >= int(k):
                break
        set_span_attributes(span, {"memory_result_count": len(out)})
        return out


def memory_search_scoped(
    query: str,
    *,
    bucket: Optional[str] = None,
    workspace_id: Optional[str] = None,
    agent_install_id: Optional[str] = None,
    profile_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_key: Optional[str] = None,
    k: int = 5,
) -> List[Dict[str, Any]]:
    return _memory_search_scoped(
        query,
        bucket=bucket,
        workspace_id=workspace_id,
        agent_install_id=agent_install_id,
        profile_id=profile_id,
        project_id=project_id,
        session_key=session_key,
        k=k,
    )


def _memory_scope_from_context(context: Dict[str, Any]) -> Dict[str, str]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    workspace_id = _runtime_workspace_id(context.get("workspace_id") or metadata.get("workspace_id"))
    agent_install_id = str(
        metadata.get("active_agent_install_id")
        or metadata.get("workspace_agent_install_id")
        or ""
    ).strip()
    session_key = str(metadata.get("session_key") or "").strip()
    if not session_key:
        chat_id = str(metadata.get("chat_id") or "").strip()
        if chat_id:
            session_key = f"telegram:{chat_id}"
    return {
        "workspace_id": workspace_id,
        "agent_install_id": agent_install_id,
        "profile_id": str(metadata.get("profile_id") or metadata.get("user_id") or "").strip(),
        "project_id": str(metadata.get("project_id") or context.get("workflow_id") or "").strip(),
        "session_key": session_key,
    }


def _trim_memory_trace(trace: Dict[str, Any]) -> Dict[str, Any]:
    reads = trace.get("reads") if isinstance(trace.get("reads"), list) else []
    writes = trace.get("writes") if isinstance(trace.get("writes"), list) else []
    return {
        "enabled": bool(trace.get("enabled")),
        "reads": [runtime_memory._json_safe(item) for item in reads[-20:]],
        "writes": [runtime_memory._json_safe(item) for item in writes[-20:]],
        "last_error": str(trace.get("last_error") or "").strip() or None,
        "updated_at": str(trace.get("updated_at") or "").strip() or None,
    }


def trim_memory_trace(trace: Dict[str, Any]) -> Dict[str, Any]:
    return _trim_memory_trace(trace)


def _memory_prompt_context_block(context: Dict[str, Any], max_items: int = 6) -> str:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    memory_ctx = metadata.get("memory_context") if isinstance(metadata.get("memory_context"), dict) else {}
    items = memory_ctx.get("items") if isinstance(memory_ctx.get("items"), list) else []
    if not items:
        return "Memory Context:\n- none"
    lines: List[str] = []
    for item in items[: max(1, max_items)]:
        if not isinstance(item, dict):
            continue
        item_metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        bucket = str(item_metadata.get("bucket") or "unknown").strip().lower()
        text = runtime_memory._compact_event_text(item.get("text"), limit=220)
        if text:
            lines.append(f"- ({bucket}) {text}")
    if not lines:
        return "Memory Context:\n- none"
    return "Memory Context:\n" + "\n".join(lines)


def memory_prompt_context_block(context: Dict[str, Any], max_items: int = 6) -> str:
    return _memory_prompt_context_block(context, max_items=max_items)


def _run_result_summary(run: Dict[str, Any]) -> str:
    result_data = run.get("result_data") if isinstance(run.get("result_data"), dict) else {}
    if isinstance(run.get("result"), str) and str(run.get("result")).strip():
        return str(run.get("result")).strip()
    if isinstance(result_data.get("summary"), str) and str(result_data.get("summary")).strip():
        return str(result_data.get("summary")).strip()
    return ""


def _memory_health_snapshot() -> Dict[str, Any]:
    db_path = Path(runtime_memory.ORION_MEMORY_DB_PATH)
    rows = 0
    sqlite_error: Optional[str] = None
    if db_path.exists():
        try:
            conn = sqlite3.connect(str(db_path))
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM fallback_memory")
            row = cur.fetchone()
            rows = int(row[0] if row and row[0] is not None else 0)
            conn.close()
        except Exception as exc:
            sqlite_error = str(exc)
    manager = runtime_memory._memory_manager()
    lancedb_initialized = bool(getattr(getattr(manager, "lancedb", None), "_initialized", False)) if manager else False
    return {
        "enabled": runtime_memory.ORION_MEMORY_ENABLED,
        "manager_ready": manager is not None,
        "manager_error": runtime_memory.MEMORY_MANAGER_ERROR,
        "db_path": str(db_path),
        "db_exists": db_path.exists(),
        "db_size_bytes": int(db_path.stat().st_size) if db_path.exists() else 0,
        "sqlite_rows": rows,
        "sqlite_error": sqlite_error,
        "lancedb_uri": runtime_memory.ORION_MEMORY_LANCEDB_URI,
        "lancedb_initialized": lancedb_initialized,
    }


def memory_health_snapshot() -> Dict[str, Any]:
    return _memory_health_snapshot()


def _hydrate_run_memory_context(run_id: str, run: Dict[str, Any]) -> None:
    trace = run.setdefault(
        "memory_trace",
        {"enabled": runtime_memory.ORION_MEMORY_ENABLED, "reads": [], "writes": [], "last_error": None, "updated_at": None},
    )
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    tracer = get_tracer("server_modules.memory_service")
    with tracer.start_as_current_span("memory_service.hydrate_run_context") as span:
        set_span_attributes(
            span,
            {
                "memory_type": "run_context",
                "workspace_id": _runtime_workspace_id(context.get("workspace_id") or metadata.get("workspace_id")),
                "tenant_id": str(context.get("tenant_id") or metadata.get("tenant_id") or "default").strip() or "default",
                "actor_type": str(metadata.get("request_actor_type") or "").strip() or "runtime",
                "run_id": str(run_id or "").strip() or None,
            },
        )
        if not runtime_memory.ORION_MEMORY_ENABLED:
            trace["enabled"] = False
            trace["updated_at"] = _runtime_utc_now_iso()
            return
        manager = runtime_memory._memory_manager()
        if manager is None:
            trace["last_error"] = runtime_memory.MEMORY_MANAGER_ERROR or "memory_unavailable"
            trace["updated_at"] = _runtime_utc_now_iso()
            return

        if str(metadata.get("memory_read_enabled") or "1").strip().lower() in {"0", "false", "no", "off"}:
            trace["updated_at"] = _runtime_utc_now_iso()
            return

        user_goal = str(context.get("user_goal") or "").strip()
        business_plan = str(context.get("business_plan") or "").strip()
        query = "\n".join([part for part in [user_goal, business_plan] if part]).strip() or "recent context"
        try:
            read_k = max(1, min(int(metadata.get("memory_read_k") or runtime_memory.ORION_MEMORY_READ_K), 20))
        except Exception:
            read_k = runtime_memory.ORION_MEMORY_READ_K

        scope = _memory_scope_from_context(context)
        bucket_queries: List[tuple[str, Dict[str, Optional[str]]]] = []
        if scope.get("profile_id"):
            bucket_queries.append(("profile", {"profile_id": scope.get("profile_id")}))
        if scope.get("project_id"):
            bucket_queries.append(("project", {"project_id": scope.get("project_id")}))
        if scope.get("session_key"):
            bucket_queries.append(("session", {"session_key": scope.get("session_key")}))
        if not bucket_queries:
            bucket_queries.append(("session", {"session_key": f"run:{run_id}"}))

        aggregated: List[Dict[str, Any]] = []
        read_records: List[Dict[str, Any]] = []
        seen_ids: Set[str] = set()
        for bucket, bucket_scope in bucket_queries:
            items = _memory_search_scoped(
                query,
                bucket=bucket,
                workspace_id=scope.get("workspace_id"),
                agent_install_id=scope.get("agent_install_id"),
                profile_id=bucket_scope.get("profile_id"),
                project_id=bucket_scope.get("project_id"),
                session_key=bucket_scope.get("session_key"),
                k=read_k,
            )
            read_records.append({"bucket": bucket, "count": len(items), "k": read_k})
            for item in items:
                mem_id = str(item.get("id") or "").strip()
                if not mem_id or mem_id in seen_ids:
                    continue
                seen_ids.add(mem_id)
                aggregated.append(item)

        memory_context = {
            "query": runtime_memory._compact_event_text(query, limit=500),
            "scope": scope,
            "items": aggregated[: max(1, read_k * 2)],
            "count": len(aggregated),
        }
        metadata["memory_context"] = memory_context
        context["metadata"] = metadata
        run["context"] = context
        trace_reads = trace.get("reads") if isinstance(trace.get("reads"), list) else []
        trace_reads.extend(read_records)
        trace["reads"] = trace_reads[-20:]
        trace["updated_at"] = _runtime_utc_now_iso()
        run["memory_trace"] = trace

        runtime_memory._emit_log(
            run["logs"],
            "info",
            f"Memory context loaded: {len(aggregated)} item(s).",
            event="memory_context",
            data={"query": memory_context["query"], "scope": scope, "count": len(aggregated)},
        )
        set_span_attributes(span, {"memory_result_count": len(aggregated)})


def hydrate_run_memory_context(run_id: str, run: Dict[str, Any]) -> None:
    _hydrate_run_memory_context(run_id, run)


def _persist_run_memory(run_id: str, run: Dict[str, Any]) -> None:
    trace = run.setdefault(
        "memory_trace",
        {"enabled": runtime_memory.ORION_MEMORY_ENABLED, "reads": [], "writes": [], "last_error": None, "updated_at": None},
    )
    if not runtime_memory.ORION_MEMORY_ENABLED:
        trace["enabled"] = False
        trace["updated_at"] = _runtime_utc_now_iso()
        return
    manager = runtime_memory._memory_manager()
    if manager is None:
        trace["last_error"] = runtime_memory.MEMORY_MANAGER_ERROR or "memory_unavailable"
        trace["updated_at"] = _runtime_utc_now_iso()
        return
    if str(run.get("status") or "").strip().lower() != "completed":
        trace["updated_at"] = _runtime_utc_now_iso()
        return

    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if str(metadata.get("memory_write_enabled") or "1").strip().lower() in {"0", "false", "no", "off"}:
        trace["updated_at"] = _runtime_utc_now_iso()
        return

    scope = _memory_scope_from_context(context)
    goal = runtime_memory._compact_event_text(context.get("user_goal"), limit=700)
    summary = runtime_memory._compact_event_text(_run_result_summary(run), limit=1300)
    if not summary:
        trace["updated_at"] = _runtime_utc_now_iso()
        return
    memory_text = f"Goal: {goal or 'n/a'}\nResult: {summary}"[: runtime_memory.ORION_MEMORY_MAX_TEXT_CHARS]

    try:
        retention_days = max(1, min(int(metadata.get("memory_retention_days") or runtime_memory.ORION_MEMORY_RETENTION_DAYS_DEFAULT), 3650))
    except Exception:
        retention_days = runtime_memory.ORION_MEMORY_RETENTION_DAYS_DEFAULT
    expires_at = (_runtime_utc_now() + timedelta(days=retention_days)).isoformat().replace("+00:00", "Z")

    targets: List[Dict[str, str]] = []
    session_key = scope.get("session_key") or f"run:{run_id}"
    targets.append({"bucket": "session", "session_key": session_key})
    if scope.get("project_id"):
        targets.append({"bucket": "project", "project_id": scope["project_id"]})
    if scope.get("profile_id"):
        targets.append({"bucket": "profile", "profile_id": scope["profile_id"]})

    writes = trace.get("writes") if isinstance(trace.get("writes"), list) else []
    for target in targets:
        bucket = str(target.get("bucket") or "").strip().lower()
        if bucket not in runtime_memory.MEMORY_BUCKETS:
            continue
        record_metadata = {
            "bucket": bucket,
            "workspace_id": scope.get("workspace_id") or "default",
            "agent_install_id": scope.get("agent_install_id") or "",
            "profile_id": target.get("profile_id") or "",
            "project_id": target.get("project_id") or "",
            "session_key": target.get("session_key") or "",
            "source": "run_completion",
            "run_id": run_id,
            "engine": str(run.get("engine") or "").strip().lower(),
            "retention_days": retention_days,
            "expires_at": expires_at,
        }
        try:
            memory_id = manager.upsert_memory(memory_text, record_metadata)
            writes.append({"bucket": bucket, "id": memory_id, "scope": runtime_memory._json_safe(target)})
        except Exception as exc:
            trace["last_error"] = f"memory_write_failed:{exc}"

    trace["writes"] = writes[-20:]
    trace["updated_at"] = _runtime_utc_now_iso()
    run["memory_trace"] = trace
    runtime_memory._refresh_archived_run_snapshot(run_id, run)
    if writes:
        runtime_memory._emit_log(
            run["logs"],
            "info",
            f"Memory write completed: {len(writes)} item(s).",
            event="memory_write",
            data={"writes": writes[-len(targets):]},
        )


def persist_run_memory(run_id: str, run: Dict[str, Any]) -> None:
    _persist_run_memory(run_id, run)
