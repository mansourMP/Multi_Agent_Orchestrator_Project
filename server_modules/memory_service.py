from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
import hashlib
import json
import re
from typing import Any, Dict, List

from server_modules import agent_memory
from server_modules import runtime_memory
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
    entries: List[Dict[str, Any]] = field(default_factory=list)
    text: str = ""

    def as_payload(self) -> Dict[str, Any]:
        return {
            "workspace_id": self.workspace_id,
            "entries": list(self.entries),
            "text": self.text,
        }


def list_memory_entries(workspace_id: str) -> List[Dict[str, Any]]:
    return agent_memory.list_memory_entries(_normalize_workspace_id(workspace_id))


def save_memory(workspace_id: str, key: str, content: str, *, sync_memory_md: bool = True) -> None:
    agent_memory.save_memory(
        _normalize_workspace_id(workspace_id),
        key,
        content,
        sync_memory_md=sync_memory_md,
    )


def get_memory(workspace_id: str) -> str:
    return agent_memory.get_memory(_normalize_workspace_id(workspace_id))


def semantic_search(workspace_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    return agent_memory.semantic_search(_normalize_workspace_id(workspace_id), query, top_k=top_k)


def delete_memory(workspace_id: str, key: str) -> bool:
    return agent_memory.delete_memory(_normalize_workspace_id(workspace_id), key)


def save_daily_log(workspace_id: str, content: str) -> None:
    agent_memory.save_daily_log(_normalize_workspace_id(workspace_id), content)


def get_recent_logs(workspace_id: str, days: int = 7) -> str:
    return agent_memory.get_recent_logs(_normalize_workspace_id(workspace_id), days=days)


def search_memory_notebook(workspace_id: str, query: str, *, max_results: int = 5) -> List[Dict[str, Any]]:
    return agent_memory.search_memory_notebook(
        _normalize_workspace_id(workspace_id),
        query,
        max_results=max_results,
    )


def get_memory_notebook_excerpt(
    workspace_id: str,
    rel_path: str,
    *,
    from_line: int | None = None,
    line_count: int | None = None,
) -> Dict[str, Any]:
    return agent_memory.get_memory_notebook_excerpt(
        _normalize_workspace_id(workspace_id),
        rel_path,
        from_line=from_line,
        line_count=line_count,
    )


def workspace_memory_snapshot(workspace_id: str) -> WorkspaceMemorySnapshot:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    entries = list_memory_entries(normalized_workspace_id)
    return WorkspaceMemorySnapshot(
        workspace_id=normalized_workspace_id,
        entries=entries,
        text=get_memory(normalized_workspace_id),
    )


def query_memory(query: MemoryQuery) -> MemoryResult:
    normalized_workspace_id = _normalize_workspace_id(query.workspace_id)
    safe_limit = max(1, min(int(query.limit or 5), 20))
    normalized_query_text = str(query.text or "").strip()
    items: List[MemoryItem] = []

    if normalized_query_text:
        for entry in semantic_search(normalized_workspace_id, normalized_query_text, top_k=safe_limit):
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
        memory_text = get_memory(normalized_workspace_id)
        if memory_text:
            context_blocks.append(f"Runtime Memory Facts\n{memory_text}")
        recent_logs = get_recent_logs(normalized_workspace_id, days=7)
        if recent_logs:
            context_blocks.append(f"Recent Daily Logs\n{recent_logs[:6000].rstrip()}")

    return MemoryResult(items=items, context_blocks=context_blocks)


def direct_chat_memory_context_message(workspace_id: str, *, system_prefix: str) -> Dict[str, str] | None:
    memory = get_memory(workspace_id)
    if not memory:
        return None
    return {
        "role": "system",
        "content": f"{system_prefix}{memory}",
    }


def direct_chat_workspace_context_text(workspace_id: str, *, memory_query: str = "") -> str:
    sections: List[str] = []
    try:
        context_files = read_workspace_context_files()
    except Exception:
        context_files = {}

    for filename in ("SOUL.md", "USER.md", "MEMORY.md"):
        content = str(context_files.get(filename) or "").strip()
        if content:
            sections.append(f"{filename}\n{content}")

    recent_logs = get_recent_logs(workspace_id, days=7)
    if recent_logs:
        sections.append(f"Recent Daily Logs\n{recent_logs[:6000].rstrip()}")

    memory_entries = semantic_search(workspace_id, memory_query, top_k=5) if str(memory_query or "").strip() else []
    if memory_entries:
        memory_facts = "\n".join(
            f"- {str(item.get('key') or '').strip()}: {str(item.get('content') or '').strip()}"
            for item in memory_entries
            if str(item.get("content") or "").strip()
        ).strip()
    else:
        memory_facts = get_memory(workspace_id)
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
    profile_id: str | None = None,
    project_id: str | None = None,
    session_key: str | None = None,
    k: int = 5,
) -> Dict[str, Any]:
    runtime_memory._memory_manager_or_503()
    normalized_bucket = runtime_memory._normalize_memory_bucket(bucket, required=False)
    normalized_workspace_id = runtime_memory._normalize_workspace_id(workspace_id) or "default"
    items = runtime_memory._memory_search_scoped(
        query=str(query or "").strip(),
        bucket=normalized_bucket,
        workspace_id=normalized_workspace_id,
        profile_id=str(profile_id or "").strip() or None,
        project_id=str(project_id or "").strip() or None,
        session_key=str(session_key or "").strip() or None,
        k=int(k),
    )
    return {
        "ok": True,
        "query": str(query or "").strip(),
        "bucket": normalized_bucket,
        "workspace_id": normalized_workspace_id,
        "count": len(items),
        "items": items,
    }


def runtime_memory_upsert(
    *,
    text: str,
    bucket: str,
    workspace_id: str | None = None,
    profile_id: str | None = None,
    project_id: str | None = None,
    session_key: str | None = None,
    source: str | None = None,
    retention_days: int | None = None,
    metadata: Dict[str, Any] | None = None,
    memory_id: str | None = None,
) -> Dict[str, Any]:
    manager = runtime_memory._memory_manager_or_503()
    normalized_bucket = runtime_memory._normalize_memory_bucket(bucket, required=True) or "session"
    normalized_workspace_id = runtime_memory._normalize_workspace_id(workspace_id) or "default"
    normalized_retention_days = int(retention_days or runtime_memory.ORION_MEMORY_RETENTION_DAYS_DEFAULT)
    expires_at = (runtime_memory._utc_now() + timedelta(days=normalized_retention_days)).isoformat().replace("+00:00", "Z")
    record_metadata = dict(metadata) if isinstance(metadata, dict) else {}
    record_metadata.update(
        {
            "bucket": normalized_bucket,
            "workspace_id": normalized_workspace_id,
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
        "retention_days": normalized_retention_days,
        "expires_at": expires_at,
    }
