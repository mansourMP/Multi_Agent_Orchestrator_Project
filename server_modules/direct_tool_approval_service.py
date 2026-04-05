from __future__ import annotations

from typing import Any

from server_modules import skills_service


def shell_command_requires_approval(command: str, *, compact_text) -> bool:
    compact = compact_text(command)
    if not compact:
        return False
    destructive_markers = (
        "rm -rf",
        "rm -r ",
        "rm -f ",
        "sudo rm",
        "del /f",
        "del /q",
        "rmdir /s",
        "format ",
        "mkfs",
        "diskutil erase",
        "shred ",
        "dd if=",
    )
    return any(marker in compact for marker in destructive_markers)


def file_write_requires_approval(arguments: dict[str, Any]) -> bool:
    path = str(arguments.get("path") or arguments.get("file_path") or "").strip().lower()
    if not path:
        return False
    protected_markers = (
        "/etc/",
        "/bin/",
        "/usr/",
        "/system/",
        "/library/",
        ".ssh/",
        ".gnupg/",
        ".env",
        ".git/config",
    )
    return any(marker in path for marker in protected_markers)


def local_direct_tool_requires_approval(
    connector_id: str,
    action_id: str,
    arguments: dict[str, Any],
    *,
    compact_text,
) -> bool:
    normalized_connector = str(connector_id or "").strip().lower()
    normalized_action = str(action_id or "").strip().lower()
    if normalized_connector == "shell" and normalized_action == "exec":
        return shell_command_requires_approval(str(arguments.get("command") or ""), compact_text=compact_text)
    if normalized_connector == "file" and normalized_action == "write":
        return file_write_requires_approval(arguments)
    if normalized_connector == "computer":
        return True
    return False


def browser_direct_tool_requires_approval(action_id: str) -> bool:
    normalized_action = str(action_id or "").strip().lower()
    return normalized_action in {"click", "fill", "execute_js", "download_file"}


def approval_required_for_direct_tool(
    connector_id: str,
    action_id: str,
    arguments: dict[str, Any],
    tool_capabilities: list[dict[str, Any]],
    *,
    compact_text,
    http_request_requires_approval=None,
) -> bool:
    normalized_connector_id = str(connector_id or "").strip().lower()
    normalized_action_id = str(action_id or "").strip()
    if http_request_requires_approval is None:
        from server_modules.tools_http import http_request_requires_approval as http_request_requires_approval
    if normalized_connector_id == "http" and normalized_action_id == "request":
        return http_request_requires_approval(arguments.get("method") or "GET", arguments.get("url") or "")
    if normalized_connector_id == "browser":
        return browser_direct_tool_requires_approval(normalized_action_id)
    if normalized_connector_id in {"file", "shell", "screenshot", "computer"}:
        return local_direct_tool_requires_approval(
            normalized_connector_id,
            normalized_action_id,
            arguments,
            compact_text=compact_text,
        )
    return skills_service.availability_capability_requires_approval_for_action(
        {"tool_capabilities": tool_capabilities},
        normalized_connector_id,
        normalized_action_id,
    )
