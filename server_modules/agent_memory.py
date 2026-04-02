from __future__ import annotations

import re
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

from server_modules.workspace_context import (
    read_workspace_context_file,
    workspace_context_dir,
    write_workspace_context_file,
)


_REPO_ROOT = Path(__file__).resolve().parents[1]
_MEMORY_DIR = _REPO_ROOT / ".orion-stack" / "memory"
_SEMANTIC_MODEL: Any = None
_NOTEBOOK_DIRNAME = "memory"


def _normalize_workspace_token(workspace_id: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(workspace_id or "default").strip()).strip("-")
    return token or "default"


def _memory_db_path(workspace_id: str) -> Path:
    _MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    return _MEMORY_DIR / f"{_normalize_workspace_token(workspace_id)}.db"


def _memory_logs_dir(workspace_id: str) -> Path:
    _MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    token = _normalize_workspace_token(workspace_id)
    if token == "default":
        return _MEMORY_DIR
    path = _MEMORY_DIR / token
    path.mkdir(parents=True, exist_ok=True)
    return path


def _memory_notebook_dir(_workspace_id: str) -> Path:
    path = workspace_context_dir() / _NOTEBOOK_DIRNAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def _memory_notebook_documents(workspace_id: str) -> List[Dict[str, Any]]:
    root = workspace_context_dir()
    docs: List[Dict[str, Any]] = []

    memory_md_path = root / "MEMORY.md"
    if memory_md_path.exists():
        docs.append({"path": "MEMORY.md", "abs_path": memory_md_path})

    notes_root = _memory_notebook_dir(workspace_id)
    for path in sorted(notes_root.rglob("*.md")):
        if not path.is_file():
            continue
        rel_path = path.relative_to(notes_root).as_posix()
        docs.append({"path": f"{_NOTEBOOK_DIRNAME}/{rel_path}", "abs_path": path})
    return docs


def _resolve_notebook_path(workspace_id: str, rel_path: str) -> Path:
    normalized = str(rel_path or "").strip().replace("\\", "/").lstrip("/")
    root = workspace_context_dir().resolve()
    if normalized == "MEMORY.md":
        path = (root / "MEMORY.md").resolve()
        if path.parent != root:
            raise ValueError("Invalid notebook path.")
        return path
    prefix = f"{_NOTEBOOK_DIRNAME}/"
    if not normalized.startswith(prefix):
        raise ValueError("Notebook path must be MEMORY.md or memory/*.md.")
    notes_root = _memory_notebook_dir(workspace_id).resolve()
    candidate = (notes_root / normalized[len(prefix):]).resolve()
    if candidate == notes_root or notes_root not in candidate.parents:
        raise ValueError("Notebook path escapes memory directory.")
    if candidate.suffix.lower() != ".md":
        raise ValueError("Notebook path must target a markdown file.")
    return candidate


@contextmanager
def _connect_memory_db(workspace_id: str):
    db_path = _memory_db_path(workspace_id)
    connection = sqlite3.connect(str(db_path), timeout=10.0)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS memory_entries (
                key TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        yield connection
    finally:
        connection.close()


def _cosine_similarity(left: List[float], right: List[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    return float(sum(float(a) * float(b) for a, b in zip(left, right)))


def _semantic_model():
    global _SEMANTIC_MODEL
    if _SEMANTIC_MODEL is False:
        return None
    if _SEMANTIC_MODEL is None:
        try:
            from sentence_transformers import SentenceTransformer

            _SEMANTIC_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception:
            _SEMANTIC_MODEL = False
    return _SEMANTIC_MODEL


def embed_text(text: str) -> List[float]:
    normalized = re.sub(r"\s+", " ", str(text or "").strip())
    if not normalized:
        return []
    model = _semantic_model()
    if model is None or isinstance(model, bool) or not hasattr(model, "encode"):
        return []
    vector = model.encode(normalized, normalize_embeddings=True)
    if hasattr(vector, "tolist"):
        return [float(item) for item in vector.tolist()]
    return [float(item) for item in vector]


def list_memory_entries(workspace_id: str) -> List[Dict[str, Any]]:
    with _connect_memory_db(workspace_id) as connection:
        rows = connection.execute(
            """
            SELECT key, content, created_at, updated_at
            FROM memory_entries
            ORDER BY updated_at DESC, key ASC
            """
        ).fetchall()
    return [
        {
            "key": str(row["key"] or ""),
            "content": str(row["content"] or ""),
            "created_at": float(row["created_at"] or 0.0),
            "updated_at": float(row["updated_at"] or 0.0),
        }
        for row in rows
    ]


def save_memory(workspace_id: str, key: str, content: str, *, sync_memory_md: bool = True) -> None:
    normalized_key = str(key or "").strip()
    normalized_content = str(content or "").strip()
    if not normalized_key or not normalized_content:
        return
    now_ts = time.time()
    with _connect_memory_db(workspace_id) as connection:
        connection.execute(
            """
            INSERT INTO memory_entries (key, content, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                content = excluded.content,
                updated_at = excluded.updated_at
            """,
            (normalized_key, normalized_content, now_ts, now_ts),
        )
        connection.commit()
    if sync_memory_md:
        try:
            export_memory_md(workspace_id)
        except Exception:
            pass


def get_memory(workspace_id: str) -> str:
    entries = list_memory_entries(workspace_id)
    if not entries:
        return ""
    return "\n".join(
        f"- {entry['key']}: {entry['content']}"
        for entry in entries
        if str(entry.get("content") or "").strip()
    ).strip()


def search_memory(workspace_id: str, query: str) -> List[Dict[str, Any]]:
    normalized_query = str(query or "").strip()
    if not normalized_query:
        return []
    pattern = f"%{normalized_query}%"
    with _connect_memory_db(workspace_id) as connection:
        rows = connection.execute(
            """
            SELECT key, content, created_at, updated_at
            FROM memory_entries
            WHERE key LIKE ? OR content LIKE ?
            ORDER BY updated_at DESC, key ASC
            """,
            (pattern, pattern),
        ).fetchall()
    return [
        {
            "key": str(row["key"] or ""),
            "content": str(row["content"] or ""),
            "created_at": float(row["created_at"] or 0.0),
            "updated_at": float(row["updated_at"] or 0.0),
        }
        for row in rows
    ]


def semantic_search(workspace_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    normalized_query = str(query or "").strip()
    if not normalized_query:
        return []
    entries = list_memory_entries(workspace_id)
    if not entries:
        return []
    query_vector = embed_text(normalized_query)
    if not query_vector:
        return search_memory(workspace_id, normalized_query)[: max(1, min(int(top_k or 5), 20))]
    scored: List[Dict[str, Any]] = []
    for entry in entries:
        combined_text = f"{entry.get('key')}: {entry.get('content')}"
        memory_vector = embed_text(combined_text)
        if not memory_vector:
            continue
        scored.append(
            {
                **entry,
                "score": _cosine_similarity(query_vector, memory_vector),
            }
        )
    scored.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    return scored[: max(1, min(int(top_k or 5), 20))]


def delete_memory(workspace_id: str, key: str) -> bool:
    normalized_key = str(key or "").strip()
    if not normalized_key:
        return False
    with _connect_memory_db(workspace_id) as connection:
        cursor = connection.execute(
            "DELETE FROM memory_entries WHERE key = ?",
            (normalized_key,),
        )
        connection.commit()
        deleted = bool(cursor.rowcount)
    if deleted:
        try:
            export_memory_md(workspace_id)
        except Exception:
            pass
    return deleted


def save_daily_log(workspace_id: str, content: str) -> None:
    normalized_content = str(content or "").strip()
    if not normalized_content:
        return
    log_dir = _memory_logs_dir(workspace_id)
    now = datetime.now(timezone.utc).astimezone()
    log_path = log_dir / f"{now.strftime('%Y-%m-%d')}.md"
    entry = f"## {now.strftime('%H:%M')}\n\n{normalized_content}\n"
    if not log_path.exists():
        log_path.write_text(f"# {now.strftime('%Y-%m-%d')}\n\n{entry}", encoding="utf-8")
        return
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write("\n" + entry)


def get_recent_logs(workspace_id: str, days: int = 7) -> str:
    safe_days = max(1, min(int(days or 7), 30))
    log_dir = _memory_logs_dir(workspace_id)
    now = datetime.now(timezone.utc).astimezone()
    parts: List[str] = []
    for offset in range(safe_days - 1, -1, -1):
        day = now - timedelta(days=offset)
        path = log_dir / f"{day.strftime('%Y-%m-%d')}.md"
        if not path.exists():
            continue
        try:
            text = path.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if text:
            parts.append(text)
    return "\n\n".join(parts).strip()


def update_memory_md(workspace_id: str, content: str) -> Dict[str, Any]:
    _ = _normalize_workspace_token(workspace_id)
    saved = write_workspace_context_file("MEMORY.md", str(content or ""))
    return {
        "workspace_id": _normalize_workspace_token(workspace_id),
        **saved,
    }


def export_memory_md(workspace_id: str) -> Dict[str, Any]:
    entries = list_memory_entries(workspace_id)
    lines = ["# Curated Memory", ""]
    for entry in entries:
        key = str(entry.get("key") or "").strip()
        content = str(entry.get("content") or "").strip()
        if not key or not content:
            continue
        lines.append(f"- {key}: {content}")
    return update_memory_md(workspace_id, "\n".join(lines).strip() + "\n")


def import_memory_md(workspace_id: str) -> Dict[str, Any]:
    raw = read_workspace_context_file("MEMORY.md")
    imported = 0
    for raw_line in str(raw or "").splitlines():
        line = raw_line.strip()
        if not line.startswith("- ") or ":" not in line:
            continue
        key, content = line[2:].split(":", 1)
        normalized_key = str(key or "").strip()
        normalized_content = str(content or "").strip()
        if not normalized_key or not normalized_content:
            continue
        save_memory(workspace_id, normalized_key, normalized_content, sync_memory_md=False)
        imported += 1
    export_memory_md(workspace_id)
    return {
        "workspace_id": _normalize_workspace_token(workspace_id),
        "imported": imported,
    }


def list_memory_notebook_files(workspace_id: str) -> List[Dict[str, Any]]:
    docs: List[Dict[str, Any]] = []
    for item in _memory_notebook_documents(workspace_id):
        path = item.get("abs_path")
        if not isinstance(path, Path):
            continue
        try:
            stat = path.stat()
        except Exception:
            continue
        docs.append(
            {
                "path": str(item.get("path") or "").strip(),
                "size": int(stat.st_size or 0),
                "updated_at": float(stat.st_mtime or 0.0),
            }
        )
    return docs


def search_memory_notebook(workspace_id: str, query: str, *, max_results: int = 5) -> List[Dict[str, Any]]:
    normalized_query = re.sub(r"\s+", " ", str(query or "").strip()).lower()
    if not normalized_query:
        return []
    query_tokens = [
        token
        for token in re.split(r"[^a-z0-9]+", normalized_query)
        if len(token) >= 2
    ]
    docs = _memory_notebook_documents(workspace_id)
    results: List[Dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()

    for item in docs:
        rel_path = str(item.get("path") or "").strip()
        abs_path = item.get("abs_path")
        if not rel_path or not isinstance(abs_path, Path):
            continue
        try:
            lines = abs_path.read_text(encoding="utf-8").splitlines()
        except Exception:
            continue
        for index, line in enumerate(lines):
            compact_line = re.sub(r"\s+", " ", str(line or "").strip()).lower()
            if not compact_line:
                continue
            score = 0
            if normalized_query in compact_line:
                score += 10
            token_hits = sum(1 for token in query_tokens if token in compact_line)
            score += token_hits
            if score <= 0:
                continue
            start_line = max(1, index)
            end_line = min(len(lines), index + 2)
            dedupe_key = (rel_path, start_line)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            snippet = "\n".join(lines[start_line - 1:end_line]).strip()
            results.append(
                {
                    "path": rel_path,
                    "start_line": start_line,
                    "end_line": end_line,
                    "score": score,
                    "snippet": snippet,
                }
            )

    results.sort(
        key=lambda item: (
            -int(item.get("score") or 0),
            str(item.get("path") or ""),
            int(item.get("start_line") or 0),
        )
    )
    return results[: max(1, min(int(max_results or 5), 20))]


def get_memory_notebook_excerpt(
    workspace_id: str,
    rel_path: str,
    *,
    from_line: int | None = None,
    line_count: int | None = None,
) -> Dict[str, Any]:
    path = _resolve_notebook_path(workspace_id, rel_path)
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    safe_from_line = max(1, int(from_line or 1))
    safe_line_count = max(1, min(int(line_count or max(len(lines), 1)), 200))
    if safe_from_line > len(lines):
        return {
            "path": str(rel_path or "").strip(),
            "from_line": safe_from_line,
            "to_line": safe_from_line - 1,
            "text": "",
            "total_lines": len(lines),
        }
    to_line = min(len(lines), safe_from_line + safe_line_count - 1)
    excerpt = "\n".join(lines[safe_from_line - 1:to_line])
    return {
        "path": str(rel_path or "").strip(),
        "from_line": safe_from_line,
        "to_line": to_line,
        "text": excerpt,
        "total_lines": len(lines),
    }
