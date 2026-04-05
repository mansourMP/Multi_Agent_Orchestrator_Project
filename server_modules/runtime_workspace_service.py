from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


def list_workspace_memory_payload(workspace_id: str, *, workspace_memory_snapshot: Callable[[str], Any]) -> dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    return workspace_memory_snapshot(normalized_workspace_id).as_payload()


def delete_workspace_memory_payload(
    workspace_id: str,
    key: str,
    *,
    delete_memory: Callable[[str, str], bool],
) -> dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    normalized_key = str(key or "").strip()
    if not normalized_key:
        raise HTTPException(status_code=400, detail="Memory key is required.")
    deleted = delete_memory(normalized_workspace_id, normalized_key)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory entry not found.")
    return {
        "ok": True,
        "workspace_id": normalized_workspace_id,
        "key": normalized_key,
    }


def workspace_context_files_payload(*, read_workspace_context_files: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    files = read_workspace_context_files()
    return {
        "ok": True,
        "files": [
            {
                "filename": filename,
                "content": str(content or ""),
            }
            for filename, content in files.items()
        ],
    }


def update_workspace_context_file_payload(
    filename: str,
    body: Any,
    *,
    write_workspace_context_file: Callable[[str, str], dict[str, str]],
) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid context file payload.")
    content = body.get("content")
    if content is None:
        raise HTTPException(status_code=400, detail="Field 'content' is required.")
    try:
        saved = write_workspace_context_file(filename, str(content))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        **saved,
    }
