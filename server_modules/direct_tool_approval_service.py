from __future__ import annotations

from typing import Any

from server_modules import policy_service


def shell_command_requires_approval(command: str, *, compact_text) -> bool:
    return policy_service.shell_command_requires_approval(
        command,
        compact_text=compact_text,
    )


def file_write_requires_approval(arguments: dict[str, Any]) -> bool:
    return policy_service.file_write_requires_approval(arguments)


def local_direct_tool_requires_approval(
    connector_id: str,
    action_id: str,
    arguments: dict[str, Any],
    *,
    compact_text,
) -> bool:
    return policy_service.local_direct_tool_requires_approval(
        connector_id,
        action_id,
        arguments,
        compact_text=compact_text,
    )


def browser_direct_tool_requires_approval(action_id: str) -> bool:
    return policy_service.browser_direct_tool_requires_approval(action_id)


def approval_required_for_direct_tool(
    connector_id: str,
    action_id: str,
    arguments: dict[str, Any],
    tool_capabilities: list[dict[str, Any]],
    *,
    compact_text,
    http_request_requires_approval=None,
) -> bool:
    return policy_service.approval_required_for_direct_tool(
        connector_id,
        action_id,
        arguments,
        tool_capabilities,
        compact_text=compact_text,
        http_request_requires_approval=http_request_requires_approval,
    )
