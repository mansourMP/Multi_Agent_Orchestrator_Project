from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import os


def _local_workspace_root() -> Path:
    configured = str(os.getenv("ORION_LOCAL_COMPANION_ROOT") or "").strip()
    base = Path(configured).expanduser() if configured else Path.cwd()
    return base.resolve()


def _looks_like_workspace_listing_request(goal: str) -> bool:
    lowered = str(goal or "").strip().lower()
    if not lowered:
        return False
    markers = (
        "current folder",
        "current directory",
        "what files do i have",
        "list files",
        "show files",
        "list the files",
        "show the current folder",
        "what folders do i have",
        "list folders",
        "show folders",
    )
    return any(marker in lowered for marker in markers)


def _wants_hidden_file_listing(goal: str) -> bool:
    lowered = str(goal or "").strip().lower()
    return any(marker in lowered for marker in ("show hidden", "raw list", "full raw", "all files", "everything"))


def _is_internal_runtime_name(name: str) -> bool:
    lowered = str(name or "").strip().lower()
    if not lowered:
        return False
    if lowered in {".ds_store", "__pycache__"}:
        return True
    if lowered.startswith(".orion"):
        return True
    if lowered.endswith(".pyc"):
        return True
    if ".bak." in lowered:
        return True
    return False


def _sorted_child_names(children: List[Path]) -> List[str]:
    return sorted((item.name for item in children), key=lambda value: value.lower())


def format_workspace_listing_reply(goal: str) -> Optional[Tuple[str, Dict[str, Any], None]]:
    if not _looks_like_workspace_listing_request(goal):
        return None
    root = _local_workspace_root()
    try:
        children = list(root.iterdir())
    except Exception as exc:
        summary = f"I couldn’t read the current folder: {exc}"
        data = {
            "generated_by": "empyralis_local_worker_directory_v1",
            "kind": "directory_listing",
            "cwd": str(root),
            "error": str(exc),
        }
        return summary, data, None
    show_hidden = _wants_hidden_file_listing(goal)
    visible_dirs: List[Path] = []
    visible_files: List[Path] = []
    hidden_items: List[Path] = []
    for child in children:
        if child.name.startswith(".") or _is_internal_runtime_name(child.name):
            if show_hidden:
                if child.is_dir():
                    visible_dirs.append(child)
                else:
                    visible_files.append(child)
            else:
                hidden_items.append(child)
            continue
        if child.is_dir():
            visible_dirs.append(child)
        else:
            visible_files.append(child)
    folder_names = _sorted_child_names(visible_dirs)
    file_names = _sorted_child_names(visible_files)
    lines = [f"Current folder: `{root}`"]
    if folder_names:
        preview = ", ".join(f"`{name}`" for name in folder_names[:10])
        suffix = f" +{len(folder_names) - 10} more" if len(folder_names) > 10 else ""
        lines.append(f"Main folders: {preview}{suffix}")
    if file_names:
        preview = ", ".join(f"`{name}`" for name in file_names[:8])
        suffix = f" +{len(file_names) - 8} more" if len(file_names) > 8 else ""
        lines.append(f"Important files: {preview}{suffix}")
    if not folder_names and not file_names:
        lines.append("No visible files or folders in this location.")
    if hidden_items and not show_hidden:
        lines.append(f"Hidden/internal items: {len(hidden_items)} hidden by default. Say \"show hidden files\" for the raw list.")
    if show_hidden:
        raw_names = _sorted_child_names(children)
        if raw_names:
            lines.append("")
            lines.append("Raw top-level items:")
            lines.extend(f"- `{name}`" for name in raw_names[:80])
    summary = "\n".join(lines).strip()
    data = {
        "generated_by": "empyralis_local_worker_directory_v1",
        "kind": "directory_listing",
        "cwd": str(root),
        "show_hidden": show_hidden,
        "folders": folder_names,
        "files": file_names,
        "hidden_count": len(hidden_items),
    }
    return summary, data, None
