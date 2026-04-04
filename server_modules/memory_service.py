from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from server_modules import agent_memory


def _normalize_workspace_id(workspace_id: str) -> str:
    return str(workspace_id or "default").strip() or "default"


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
