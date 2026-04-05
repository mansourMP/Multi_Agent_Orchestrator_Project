from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


def connect_action(label: str, href: str) -> Dict[str, Any]:
    return {
        "id": f"connect:{href}",
        "kind": "connect",
        "label": label,
        "href": href,
        "variant": "primary",
    }


def open_action(label: str, href: str, *, variant: str = "primary") -> Dict[str, Any]:
    return {
        "id": f"open:{href}",
        "kind": "open",
        "label": label,
        "href": href,
        "variant": variant,
    }


def google_repair_action(
    *,
    connect_action_fn: Callable[[str, str], Dict[str, Any]],
) -> Dict[str, Any]:
    return connect_action_fn("Reconnect Google Workspace", "/credentials?connector=google_workspace")


def run_action(message: str) -> Dict[str, Any]:
    return {
        "id": "run:this",
        "kind": "run",
        "label": "Run this",
        "goal": str(message or "").strip(),
        "variant": "primary",
    }


def workflow_action(message: str) -> Dict[str, Any]:
    return {
        "id": "workflow:create",
        "kind": "workflow",
        "label": "Turn into workflow",
        "goal": str(message or "").strip(),
        "href": "/builder/new",
        "variant": "secondary",
    }


def question_like(compact_message: str, *, question_openers: tuple[str, ...]) -> bool:
    return compact_message.startswith(tuple(f"{token} " for token in question_openers))


def mentions_any(compact_message: str, *, markers: tuple[str, ...]) -> bool:
    return any(marker in compact_message for marker in markers)


def starts_like_direct_run(compact_message: str, *, direct_run_openers: tuple[str, ...]) -> bool:
    return compact_message.startswith(tuple(f"{token} " for token in direct_run_openers))


def is_obvious_telegram_write_request(
    compact_message: str,
    *,
    question_like_fn: Callable[[str], bool],
    mentions_any_fn: Callable[[str, tuple[str, ...]], bool],
    starts_like_direct_run_fn: Callable[[str], bool],
    telegram_keywords: tuple[str, ...],
) -> bool:
    if not compact_message or question_like_fn(compact_message):
        return False
    return mentions_any_fn(compact_message, telegram_keywords) and starts_like_direct_run_fn(compact_message)


def is_obvious_google_write_request(
    compact_message: str,
    *,
    question_like_fn: Callable[[str], bool],
    starts_like_direct_run_fn: Callable[[str], bool],
) -> bool:
    if not compact_message or question_like_fn(compact_message):
        return False
    if "send an email" in compact_message or "draft an email" in compact_message:
        return True
    if "send email" in compact_message or "draft email" in compact_message:
        return True
    if "calendar event" in compact_message and starts_like_direct_run_fn(compact_message):
        return True
    if "meeting invite" in compact_message and starts_like_direct_run_fn(compact_message):
        return True
    return False


def is_obvious_smtp_write_request(
    compact_message: str,
    *,
    question_like_fn: Callable[[str], bool],
    mentions_any_fn: Callable[[str, tuple[str, ...]], bool],
    starts_like_direct_run_fn: Callable[[str], bool],
    smtp_keywords: tuple[str, ...],
) -> bool:
    if not compact_message or question_like_fn(compact_message):
        return False
    if "send an email" in compact_message or "send email" in compact_message:
        return True
    return mentions_any_fn(compact_message, smtp_keywords) and starts_like_direct_run_fn(compact_message)


def connector_write_preview_allowed(
    message: str,
    availability: Dict[str, Any],
    *,
    compact_text_fn: Callable[[Any], str],
    is_obvious_telegram_write_request_fn: Callable[[str], bool],
    is_obvious_google_write_request_fn: Callable[[str], bool],
    is_obvious_smtp_write_request_fn: Callable[[str], bool],
    tool_runtime_usable_fn: Callable[[Dict[str, Any], str], Optional[bool]],
) -> bool:
    compact = compact_text_fn(message)
    if is_obvious_telegram_write_request_fn(compact):
        return tool_runtime_usable_fn(availability, "telegram_bot") is True
    if is_obvious_google_write_request_fn(compact):
        return (
            tool_runtime_usable_fn(availability, "google_workspace") is True
            or (
                is_obvious_smtp_write_request_fn(compact)
                and tool_runtime_usable_fn(availability, "smtp") is True
            )
        )
    return False


def is_explicit_workflow_request(
    message: str,
    *,
    compact_text_fn: Callable[[Any], str],
    mentions_any_fn: Callable[[str, tuple[str, ...]], bool],
    workflow_request_markers: tuple[str, ...],
) -> bool:
    compact = compact_text_fn(message)
    if not compact:
        return False
    return mentions_any_fn(compact, workflow_request_markers)


def no_ai_chat_response(
    availability: Dict[str, Any],
    *,
    normalize_tool_capabilities_fn: Callable[[Any], List[Dict[str, Any]]],
    connect_action_fn: Callable[[str, str], Dict[str, Any]],
) -> Dict[str, Any]:
    capabilities = normalize_tool_capabilities_fn(availability)
    connected_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("connected")]
    usable_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("runtime_usable") is True]
    unavailable_labels = [
        str(item.get("label") or "").strip()
        for item in capabilities
        if item.get("connected") and item.get("runtime_usable") is False
    ]
    unverified_labels = [
        str(item.get("label") or "").strip()
        for item in capabilities
        if item.get("connected") and item.get("runtime_usable") is None
    ]
    connected_line = ", ".join(connected_labels) if connected_labels else "none"
    usable_line = ", ".join(usable_labels) if usable_labels else "none verified"
    unavailable_line = ", ".join(unavailable_labels) if unavailable_labels else "none"
    unverified_line = ", ".join(unverified_labels) if unverified_labels else "none"
    reply = (
        "AI chat is not available right now because the workspace AI account is not ready. "
        f"Connected here right now: {connected_line}. "
        f"Usable now: {usable_line}. "
        f"Unavailable now: {unavailable_line}. "
        f"Not verified: {unverified_line}. "
        "Connect the workspace AI account to use normal chat and reasoning."
    )
    return {
        "reply": reply,
        "actions": [connect_action_fn("Connect", "/connect-ai")],
        "mode": "connect",
    }


def tool_gate_response(
    message: str,
    availability: Dict[str, Any],
    *,
    compact_text_fn: Callable[[Any], str],
    mentions_any_fn: Callable[[str, tuple[str, ...]], bool],
    is_obvious_smtp_write_request_fn: Callable[[str], bool],
    tool_connected_fn: Callable[[Dict[str, Any], str], bool],
    tool_runtime_usable_fn: Callable[[Dict[str, Any], str], Optional[bool]],
    connect_action_fn: Callable[[str, str], Dict[str, Any]],
    google_repair_action_fn: Callable[[], Dict[str, Any]],
    google_workspace_keywords: tuple[str, ...],
    telegram_keywords: tuple[str, ...],
    slack_keywords: tuple[str, ...],
    dropbox_keywords: tuple[str, ...],
    s3_keywords: tuple[str, ...],
) -> Optional[Dict[str, Any]]:
    compact = compact_text_fn(message)
    if is_obvious_smtp_write_request_fn(compact) and not tool_connected_fn(availability, "google_workspace") and not tool_connected_fn(availability, "smtp"):
        return {
            "reply": "No email connector is connected in this workspace.",
            "actions": [connect_action_fn("Connect", "/credentials?connector=smtp")],
            "mode": "connect",
        }
    if is_obvious_smtp_write_request_fn(compact) and tool_runtime_usable_fn(availability, "google_workspace") is not True and tool_runtime_usable_fn(availability, "smtp") is False:
        return {
            "reply": "An email connector is connected here, but it is not usable right now.",
            "actions": [],
            "mode": "connect",
        }
    if is_obvious_smtp_write_request_fn(compact) and tool_runtime_usable_fn(availability, "google_workspace") is not True and tool_runtime_usable_fn(availability, "smtp") is not True and tool_connected_fn(availability, "smtp"):
        return {
            "reply": "SMTP is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    if mentions_any_fn(compact, google_workspace_keywords) and not is_obvious_smtp_write_request_fn(compact) and not tool_connected_fn(availability, "google_workspace"):
        return {
            "reply": "Google Workspace is not connected in this workspace.",
            "actions": [connect_action_fn("Connect", "/credentials?connector=google_workspace")],
            "mode": "connect",
        }
    if mentions_any_fn(compact, google_workspace_keywords) and not is_obvious_smtp_write_request_fn(compact) and tool_runtime_usable_fn(availability, "google_workspace") is False:
        return {
            "reply": "Google Workspace is connected here, but is not usable right now.",
            "actions": [google_repair_action_fn()],
            "mode": "connect",
        }
    if mentions_any_fn(compact, google_workspace_keywords) and not is_obvious_smtp_write_request_fn(compact) and tool_runtime_usable_fn(availability, "google_workspace") is not True:
        return {
            "reply": "Google Workspace is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    for tool_id, label, keywords in (
        ("telegram_bot", "Telegram", telegram_keywords),
        ("slack", "Slack", slack_keywords),
        ("dropbox", "Dropbox", dropbox_keywords),
        ("s3", "Amazon S3", s3_keywords),
    ):
        if not mentions_any_fn(compact, keywords):
            continue
        if not tool_connected_fn(availability, tool_id):
            return {
                "reply": f"{label} is not connected in this workspace.",
                "actions": [connect_action_fn("Connect", f"/credentials?connector={tool_id}")],
                "mode": "connect",
            }
        if tool_runtime_usable_fn(availability, tool_id) is False:
            return {
                "reply": f"{label} is connected here, but is not usable right now.",
                "actions": [],
                "mode": "connect",
            }
        if tool_runtime_usable_fn(availability, tool_id) is not True:
            return {
                "reply": f"{label} is connected here, but its capability state is not verified right now.",
                "actions": [],
                "mode": "connect",
            }
    return None


def suggest_actions(
    message: str,
    availability: Dict[str, Any],
    *,
    compact_text_fn: Callable[[Any], str],
    mentions_any_fn: Callable[[str, tuple[str, ...]], bool],
    question_like_fn: Callable[[str], bool],
    is_explicit_workflow_request_fn: Callable[[str], bool],
    is_obvious_smtp_write_request_fn: Callable[[str], bool],
    tool_runtime_usable_fn: Callable[[Dict[str, Any], str], Optional[bool]],
    workflow_action_fn: Callable[[str], Dict[str, Any]],
    run_action_fn: Callable[[str], Dict[str, Any]],
    google_workspace_keywords: tuple[str, ...],
    telegram_keywords: tuple[str, ...],
    slack_keywords: tuple[str, ...],
    dropbox_keywords: tuple[str, ...],
    s3_keywords: tuple[str, ...],
    execution_markers: tuple[str, ...],
) -> List[Dict[str, Any]]:
    compact = compact_text_fn(message)
    actions: List[Dict[str, Any]] = []
    if is_explicit_workflow_request_fn(message):
        actions.append(workflow_action_fn(message))
        return actions
    if is_obvious_smtp_write_request_fn(compact) and tool_runtime_usable_fn(availability, "smtp") is True:
        actions.append(run_action_fn(message))
        return actions
    for tool_id, keywords in (
        ("google_workspace", google_workspace_keywords),
        ("telegram_bot", telegram_keywords),
        ("slack", slack_keywords),
        ("dropbox", dropbox_keywords),
        ("s3", s3_keywords),
    ):
        if mentions_any_fn(compact, keywords) and tool_runtime_usable_fn(availability, tool_id) is True:
            actions.append(run_action_fn(message))
            return actions
    if mentions_any_fn(compact, execution_markers) and not question_like_fn(compact):
        actions.append(run_action_fn(message))
    return actions
