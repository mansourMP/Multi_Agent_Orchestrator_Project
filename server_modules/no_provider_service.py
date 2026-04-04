from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any, Callable, Dict


def count_python_definition_lines(source_text: str, kind: str) -> int:
    if kind == "class":
        pattern = r"^\s*class\s+"
    else:
        pattern = r"^\s*(?:async\s+def|def)\s+"
    return sum(1 for line in str(source_text or "").splitlines() if re.search(pattern, line))


def count_definitions_in_file(
    message: str,
    *,
    compact_text: Callable[[Any], str],
    extract_first_path_reference: Callable[[str], str],
    resolve_local_path: Callable[[str], Path],
) -> str | None:
    compact = compact_text(message)
    if "count" not in compact and "how many" not in compact:
        return None
    path = extract_first_path_reference(message)
    if not path:
        return None
    wants_functions = "function" in compact
    wants_classes = "class" in compact
    if not wants_functions and not wants_classes:
        return None
    target = resolve_local_path(path)
    if not target.exists() or not target.is_file():
        raise RuntimeError(f"File not found: {target}")
    source_text = target.read_text(encoding="utf-8")
    counts: list[str] = []
    if wants_functions:
        function_count = count_python_definition_lines(source_text, "function")
        counts.append(f"{function_count} functions")
    if wants_classes:
        class_count = count_python_definition_lines(source_text, "class")
        counts.append(f"{class_count} classes")
    if not counts:
        return None
    if len(counts) == 1:
        return f"{target} defines {counts[0]}."
    return f"{target} defines {counts[0]} and {counts[1]}."


def count_functions_and_write_summary(
    message: str,
    *,
    compact_text: Callable[[Any], str],
    resolve_local_path: Callable[[str], Path],
) -> str | None:
    compact = compact_text(message)
    if ".py" not in compact or "function" not in compact or "count" not in compact:
        return None
    directory_match = re.search(r"\.py files in\s+([^\s,;:]+)", str(message or ""), flags=re.IGNORECASE)
    output_match = re.search(r"\bwrite(?:\s+\w+){0,4}\s+to\s+([^\s,;:]+)", str(message or ""), flags=re.IGNORECASE)
    if not directory_match or not output_match:
        return None
    source_dir = resolve_local_path(str(directory_match.group(1) or "").strip())
    output_path = resolve_local_path(str(output_match.group(1) or "").strip())
    if not source_dir.exists() or not source_dir.is_dir():
        raise RuntimeError(f"Directory not found: {source_dir}")

    python_files = sorted(source_dir.rglob("*.py"))
    total_functions = 0
    parse_failures: list[str] = []
    per_file_counts: list[tuple[str, int]] = []
    for path in python_files:
        try:
            source_text = path.read_text(encoding="utf-8")
            tree = ast.parse(source_text, filename=str(path))
            function_count = sum(
                1 for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            )
        except Exception:
            parse_failures.append(str(path.relative_to(source_dir)))
            function_count = 0
        total_functions += function_count
        per_file_counts.append((str(path.relative_to(source_dir)), function_count))

    summary_lines = [
        f"Directory: {source_dir}",
        f"Python files scanned: {len(python_files)}",
        f"Functions found: {total_functions}",
    ]
    if parse_failures:
        summary_lines.append(f"Parse failures: {len(parse_failures)}")
    summary_lines.append("")
    summary_lines.append("Per-file counts:")
    for relative_path, function_count in per_file_counts:
        summary_lines.append(f"- {relative_path}: {function_count}")
    if parse_failures:
        summary_lines.append("")
        summary_lines.append("Files with parse failures:")
        for relative_path in parse_failures:
            summary_lines.append(f"- {relative_path}")
    summary_text = "\n".join(summary_lines).strip()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(summary_text + "\n", encoding="utf-8")
    return (
        f"Counted {total_functions} functions across {len(python_files)} Python files in {source_dir}. "
        f"Wrote the summary to {output_path}."
    )


def list_directory(
    message: str,
    *,
    safe_positive_int: Callable[[Any, int], int],
    resolve_local_path: Callable[[str], Path],
) -> Dict[str, str] | None:
    if not looks_like_directory_listing_request(message):
        return None
    list_match = re.search(
        r"\blist(?:\s+the)?(?:\s+first\s+(\d+))?\s+files?\s+in\s+([^\s,;:()]+)",
        str(message or ""),
        flags=re.IGNORECASE,
    )
    if not list_match:
        return None
    requested_limit = safe_positive_int(list_match.group(1), default=0)
    directory = resolve_local_path(str(list_match.group(2) or "").strip())
    if not directory.exists() or not directory.is_dir():
        raise RuntimeError(f"Directory not found: {directory}")
    entries = sorted(path.name for path in directory.iterdir())
    if requested_limit > 0:
        entries = entries[:requested_limit]
    listing = "\n".join(entries) if entries else "(empty)"
    return {
        "directory": str(directory),
        "listing": listing,
        "limit": requested_limit if requested_limit > 0 else None,
    }


def looks_like_directory_listing_request(message: str) -> bool:
    return bool(
        re.search(
            r"\blist(?:\s+the)?(?:\s+first\s+\d+)?\s+files?\s+in\s+([^\s,;:()]+)",
            str(message or ""),
            flags=re.IGNORECASE,
        )
    )


def extract_shell_command(
    message: str,
    *,
    compact_text: Callable[[Any], str],
    extract_first_url: Callable[[str], str],
) -> str:
    text = str(message or "").strip()
    if not text:
        return ""
    patterns = (
        r"run\s+this\s+shell\s+command:\s*(.+)$",
        r"run\s+this\s+command:\s*(.+)$",
        r"execute\s+this\s+shell\s+command:\s*(.+)$",
        r"execute\s+this\s+command:\s*(.+)$",
        r"shell:\s*(.+)$",
        r"run:\s*(.+)$",
        r"execute:\s*(.+)$",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip().strip("`")
    backtick_match = re.search(r"`([^`]+)`", text)
    compact = compact_text(text)
    if backtick_match and any(token in compact for token in ("run", "execute", "shell", "command")):
        return str(backtick_match.group(1) or "").strip()
    for opener in ("run ", "execute "):
        if compact.startswith(opener):
            candidate = text[len(opener):].strip()
            if candidate and not extract_first_url(candidate):
                return candidate.strip("`")
    return ""


def extract_web_query(message: str) -> str:
    text = str(message or "").strip()
    if not text:
        return ""
    patterns = (
        r"search\s+for\s+(.+)$",
        r"look\s+up\s+(.+)$",
        r"find\s+(.+?)\s+on\s+the\s+web$",
        r"what\s+is\s+(.+)$",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip().rstrip("?.!")
    return ""


def parse_http_tool_output(output: str) -> Any:
    parts = str(output or "").split("\n\n", 1)
    payload = parts[1] if len(parts) > 1 else ""
    if not payload:
        return None
    try:
        return json.loads(payload)
    except Exception:
        return payload.strip()
