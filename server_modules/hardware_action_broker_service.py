from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import re
import uuid

from server_modules import (
    agent_trace_service,
    agent_registry_repository,
    execution_mode_policy,
    gateway_approval_service,
    gateway_execution_service,
    gateway_protocol_service,
    gateway_state_repository,
    runtime_attachment_service,
    secret_redaction_service,
    session_service,
    thread_service,
    virtual_computer_runtime,
)
from server_modules.capability_registry import canonical_capability_id, resolve_capability


HARDWARE_RUNTIME_SESSION_BINDING = "sage_hardware_action"
HARDWARE_RUNTIME_CHANNEL = "hardware_runtime"
HARDWARE_ACTION_STATES = {
    "ready",
    "running",
    "waiting_approval",
    "degraded",
    "offline",
    "failed",
    "terminated",
}
DEFAULT_GUARDED_RUNTIME_ACCESS_MODE = execution_mode_policy.GUARDED_RUNTIME_ACCESS_MODE
FULL_RUNTIME_ACCESS_MODE = execution_mode_policy.FULL_RUNTIME_ACCESS_MODE

_CLOUD_COMPUTER_RUNTIME_REGISTRY: Any = None

_CAPABILITY_ALIASES = {
    "browser": "browser_automation.interactive",
    "browser.open": "browser_automation.interactive",
    "browser.navigate": "browser_automation.interactive",
    "browser.interactive": "browser_automation.interactive",
    "browser__open": "browser_automation.interactive",
    "browser__navigate": "browser_automation.interactive",
    "file": "filesystem.read_write",
    "file.read": "filesystem.read",
    "file.write": "filesystem.write",
    "file.list": "filesystem.read",
    "file__read": "filesystem.read",
    "file__write": "filesystem.write",
    "file__list": "filesystem.read",
    "filesystem": "filesystem.read_write",
    "screenshot": "screenshot.capture",
    "screenshot.capture": "screenshot.capture",
    "screenshot__capture": "screenshot.capture",
    "shell": "shell.execute",
    "shell.exec": "shell.execute",
    "shell.execute": "shell.execute",
    "shell__exec": "shell.execute",
    "shell__execute": "shell.execute",
}

_DEFAULT_GUARDED_APPROVAL_CAPABILITIES = {
    "computer_control.click",
    "computer_control.type",
    "computer_control.key",
    "computer_control.move",
    "computer_control.clipboard_read",
    "computer_control.clipboard_write",
    "computer_control.launch",
    "computer_control.launch_app",
    "computer_control.applescript",
    "computer_control.notify",
    "computer_control.speak",
    "connector.action.write",
    "connector.action.execute",
    "send_message",
    "payment.charge",
    "payment.refund",
    "payment.transfer",
}

_DESTRUCTIVE_SHELL_MARKERS = (
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
    "chmod -r",
    "chown -r",
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _list_dicts(value: Any) -> List[Dict[str, Any]]:
    return [dict(item) for item in list(value or []) if isinstance(item, dict)]


def _new_runtime_session_id() -> str:
    return f"hrs_{uuid.uuid4().hex}"


def _new_run_id() -> str:
    return f"hrun_{uuid.uuid4().hex}"


def _new_request_id() -> str:
    return f"hreq_{uuid.uuid4().hex}"


def _normalize_state(value: Any) -> str:
    token = _text(value).lower()
    return token if token in HARDWARE_ACTION_STATES else "running"


def normalize_hardware_capability_id(action_id: Any, capability_id: Any = None) -> str:
    candidate = _text(capability_id) or _text(action_id)
    if not candidate:
        return ""
    lowered = candidate.lower().replace(" ", "_")
    resolved = _CAPABILITY_ALIASES.get(lowered) or _CAPABILITY_ALIASES.get(lowered.replace("__", "."))
    return canonical_capability_id(resolved or lowered)


def normalize_runtime_access_mode(value: Any = None, *, execution_mode: Any = None) -> str:
    return execution_mode_policy.normalize_runtime_access_mode(value, execution_mode=execution_mode)


def _runtime_access_metadata(runtime_access_mode: str, execution_mode: Optional[str]) -> Dict[str, Any]:
    mode = normalize_runtime_access_mode(runtime_access_mode, execution_mode=execution_mode)
    return {
        "runtime_access_mode": mode,
        "execution_mode": _text(execution_mode) or ("full_access" if mode == FULL_RUNTIME_ACCESS_MODE else "default"),
        "permission_mode": mode,
        "approval_mode": "no_empyralis_action_approvals" if mode == FULL_RUNTIME_ACCESS_MODE else "default_guarded",
        "empyralis_action_approvals_enabled": mode != FULL_RUNTIME_ACCESS_MODE,
    }


def _compact_command_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _shell_command_requires_guarded_approval(command: Any) -> bool:
    compact = _compact_command_text(command)
    if not compact:
        return False
    return any(marker in compact for marker in _DESTRUCTIVE_SHELL_MARKERS)


def _file_action_requires_guarded_approval(action_id: str, arguments: Dict[str, Any]) -> bool:
    mode = _text(arguments.get("mode") or arguments.get("operation") or action_id).lower().replace("__", ".")
    if "delete" in mode or mode in {"remove", "unlink", "trash"}:
        return True
    if "write" in mode or "append" in mode or action_id in {"file.write", "file__write"}:
        return True
    if action_id in {"file.read", "file.list", "file__read", "file__list"}:
        return False
    return False


def _action_requests_external_send(action_id: str, capability_id: str, arguments: Dict[str, Any]) -> bool:
    tokens = " ".join(
        [
            _text(action_id).lower(),
            _text(capability_id).lower(),
            _text(arguments.get("action")).lower(),
            _text(arguments.get("operation")).lower(),
            _text(arguments.get("tool")).lower(),
        ]
    )
    return any(
        marker in tokens
        for marker in (
            "send",
            "post",
            "reply",
            "publish",
            "purchase",
            "payment",
            "charge",
            "refund",
            "transfer",
        )
    )


def _default_guarded_action_requires_approval(
    *,
    capability_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    virtual_action: Optional[str] = None,
) -> bool:
    normalized_action = _text(action_id).lower().replace("__", ".")
    normalized_capability = canonical_capability_id(capability_id)
    if normalized_capability == "shell.execute":
        return _shell_command_requires_guarded_approval(arguments.get("command") or arguments.get("script"))
    if normalized_capability == "filesystem.read":
        return False
    if normalized_capability == "filesystem.write":
        return True
    if normalized_capability == "filesystem.read_write":
        return _file_action_requires_guarded_approval(normalized_action, arguments)
    if normalized_capability == "screenshot.capture":
        return False
    if normalized_capability == "browser_automation.interactive":
        browser_action = _text(arguments.get("action") or virtual_action or normalized_action).lower().replace("__", ".")
        return browser_action in {"click", "type", "fill", "download", "download_file", "execute_js"}
    if normalized_capability.startswith("computer_control."):
        return True
    if normalized_capability in _DEFAULT_GUARDED_APPROVAL_CAPABILITIES:
        return True
    if _action_requests_external_send(normalized_action, normalized_capability, arguments):
        return True
    contract = resolve_capability(normalized_capability, enforce_kill_switch=False) if normalized_capability else None
    if contract is None:
        return True
    return bool(contract.requires_approval) or str(contract.risk_level or "").strip().lower() in {"high", "critical"}


def _hardware_action_requires_software_approval(
    *,
    runtime_access_mode: str,
    capability_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    require_approval: Optional[bool],
    virtual_action: Optional[str] = None,
) -> bool:
    if normalize_runtime_access_mode(runtime_access_mode) == FULL_RUNTIME_ACCESS_MODE:
        return False
    if require_approval is not None:
        return bool(require_approval)
    return _default_guarded_action_requires_approval(
        capability_id=capability_id,
        action_id=action_id,
        arguments=arguments,
        virtual_action=virtual_action,
    )


def _runtime_target_ids(runtime_target: Any) -> Dict[str, str]:
    legacy_target = runtime_attachment_service.normalize_runtime_target_id(runtime_target or "cloud_default")
    canonical_target = runtime_attachment_service.canonical_runtime_target_id(legacy_target)
    return {
        "runtime_target": legacy_target or "cloud_default",
        "canonical_runtime_target": canonical_target or "cloud_default",
    }


def _runtime_edge(canonical_runtime_target: str) -> str:
    if canonical_runtime_target == "user_device_gateway":
        return "empyralis_gateway"
    if canonical_runtime_target == "empyralis_cloud_computer":
        return "empyralis_cloud_computer"
    if canonical_runtime_target == "self_hosted_node":
        return "self_hosted_node"
    return "managed_cloud"


def get_cloud_computer_runtime_registry() -> virtual_computer_runtime.VirtualComputerRuntimeRegistry:
    global _CLOUD_COMPUTER_RUNTIME_REGISTRY
    if _CLOUD_COMPUTER_RUNTIME_REGISTRY is None:
        _CLOUD_COMPUTER_RUNTIME_REGISTRY = virtual_computer_runtime.build_default_runtime_registry()
    return _CLOUD_COMPUTER_RUNTIME_REGISTRY


def _cloud_runtime_choice_for_action(capability_id: str, action_id: str, arguments: Dict[str, Any]) -> str:
    action_token = _text(action_id).lower().replace("__", ".")
    requested_action = _text(arguments.get("action") or arguments.get("virtual_action")).lower()
    if capability_id == "shell.execute" or "shell" in action_token or requested_action == "run_command":
        return virtual_computer_runtime.RUNTIME_CHOICE_VIRTUAL_CODE_SANDBOX
    if capability_id.startswith("computer_control."):
        return virtual_computer_runtime.RUNTIME_CHOICE_VIRTUAL_DESKTOP
    return virtual_computer_runtime.RUNTIME_CHOICE_VIRTUAL_BROWSER


def _cloud_computer_virtual_action(
    *,
    capability_id: str,
    action_id: str,
    arguments: Dict[str, Any],
) -> tuple[str, Dict[str, Any], str]:
    action_token = _text(action_id).lower().replace("__", ".")
    requested_action = _text(arguments.get("action") or arguments.get("virtual_action")).lower()
    requested_action = requested_action.replace("__", ".")
    if capability_id == "screenshot.capture" or "screenshot" in action_token or requested_action in {"screenshot", "screen"}:
        return virtual_computer_runtime.ACTION_SCREENSHOT, {}, "stream_screenshot"
    if capability_id == "shell.execute" or requested_action in {"run_command", "shell.execute", "shell.exec"}:
        command = _text(arguments.get("command") or arguments.get("script"))
        return virtual_computer_runtime.ACTION_RUN_COMMAND, {"command": command}, "execute_action"
    if capability_id == "computer_control.click" or requested_action in {"click", "computer.click"}:
        return (
            virtual_computer_runtime.ACTION_CLICK,
            {
                "x": arguments.get("x"),
                "y": arguments.get("y"),
                "target_text": arguments.get("target_text"),
                "target_description": arguments.get("target_description"),
            },
            "execute_action",
        )
    if capability_id == "computer_control.type" or requested_action in {"type", "computer.type"}:
        return (
            virtual_computer_runtime.ACTION_TYPE,
            {
                "text": arguments.get("text") or arguments.get("value"),
                "target_text": arguments.get("target_text"),
                "target_description": arguments.get("target_description"),
            },
            "execute_action",
        )
    if capability_id == "computer_control.key" or requested_action in {"hotkey", "key", "press"}:
        keys = arguments.get("keys") or arguments.get("key")
        key_args = {"keys": keys} if isinstance(keys, list) else {"key": keys}
        return virtual_computer_runtime.ACTION_HOTKEY, key_args, "execute_action"
    if requested_action in {"scroll", "browser.scroll"}:
        return (
            virtual_computer_runtime.ACTION_SCROLL,
            {
                "delta_x": arguments.get("delta_x"),
                "delta_y": arguments.get("delta_y"),
            },
            "execute_action",
        )
    if requested_action in {"wait", "browser.wait"}:
        return (
            virtual_computer_runtime.ACTION_WAIT,
            {
                "duration_ms": arguments.get("duration_ms"),
                "seconds": arguments.get("seconds"),
            },
            "execute_action",
        )
    if requested_action in {"download", "download_file", "browser.download"} or "download" in action_token:
        return (
            virtual_computer_runtime.ACTION_DOWNLOAD_ARTIFACT,
            {"url": arguments.get("url"), "artifact_type": arguments.get("artifact_type")},
            "execute_action",
        )
    if capability_id == "browser_automation.interactive":
        return (
            virtual_computer_runtime.ACTION_OPEN_URL,
            {"url": arguments.get("url") or arguments.get("start_url")},
            "execute_action",
        )
    return "", {}, ""


def _cloud_computer_approval_required(
    *,
    capability_id: str,
    action_id: str,
    virtual_action: str,
    arguments: Dict[str, Any],
    runtime_access_mode: str,
    require_approval: Optional[bool],
) -> bool:
    if virtual_action == virtual_computer_runtime.ACTION_KILL_SWITCH:
        return normalize_runtime_access_mode(runtime_access_mode) != FULL_RUNTIME_ACCESS_MODE
    return _hardware_action_requires_software_approval(
        runtime_access_mode=runtime_access_mode,
        capability_id=capability_id,
        action_id=action_id,
        arguments=arguments,
        require_approval=require_approval,
        virtual_action=virtual_action,
    )


def _runtime_artifact_ids_from_response(response: Dict[str, Any]) -> List[str]:
    candidates: List[Any] = []
    artifact = response.get("artifact")
    if isinstance(artifact, dict):
        candidates.append(artifact.get("artifact_id") or artifact.get("id"))
    artifacts = response.get("artifacts")
    if isinstance(artifacts, list):
        for item in artifacts:
            if isinstance(item, dict):
                candidates.append(item.get("artifact_id") or item.get("id"))
            else:
                candidates.append(item)
    streaming_ui = response.get("streaming_ui")
    if isinstance(streaming_ui, dict):
        live_screenshot = streaming_ui.get("live_screenshot")
        if isinstance(live_screenshot, dict):
            candidates.append(live_screenshot.get("artifact_id") or live_screenshot.get("id"))
        streaming_artifacts = streaming_ui.get("artifacts")
        if isinstance(streaming_artifacts, list):
            for item in streaming_artifacts:
                if isinstance(item, dict):
                    candidates.append(item.get("artifact_id") or item.get("id"))
                else:
                    candidates.append(item)
    return list(dict.fromkeys([_text(item) for item in candidates if _text(item)]))


def _runtime_cost_metadata(response: Dict[str, Any], *, runtime_choice: str, provider_id: Optional[str]) -> Dict[str, Any]:
    action_result = response.get("action_result") if isinstance(response.get("action_result"), dict) else {}
    cost_metadata = {
        "runtime_choice": runtime_choice,
        "runtime_provider_id": _text(provider_id) or _text(response.get("runtime_provider_id")) or None,
        "runtime_kind": _text(response.get("runtime_kind")) or None,
        "cost_quota": response.get("cost_quota") if isinstance(response.get("cost_quota"), dict) else None,
        "cost_usage": response.get("cost_usage") if isinstance(response.get("cost_usage"), dict) else None,
        "action_cost_estimate": action_result.get("cost_estimate") if isinstance(action_result.get("cost_estimate"), dict) else None,
    }
    return {key: value for key, value in cost_metadata.items() if value not in (None, "", {})}


def _cloud_computer_session_persistence(cost_metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    metadata = _dict(cost_metadata)
    requested = metadata.get("session_persistence") or metadata.get("runtime_session_persistence")
    if isinstance(requested, dict) and requested:
        return dict(requested)
    return {
        "session_mode": virtual_computer_runtime.SESSION_PERSISTENCE_EPHEMERAL,
        "auto_terminate_on_task_complete": True,
    }


def _self_hosted_required_capabilities(capability_id: str) -> List[str]:
    if capability_id == "shell.execute":
        return ["shell.execute"]
    if capability_id.startswith("filesystem."):
        return ["file_access"]
    if capability_id == "browser_automation.interactive":
        return ["browser.automation"]
    if capability_id == "screenshot.capture" or capability_id.startswith("computer_control."):
        return ["computer_control"]
    return []


def _self_hosted_capability_aliases(capability_id: str) -> set[str]:
    if capability_id == "tool.interrupt":
        return set()
    if capability_id == "shell.execute":
        return {"shell.execute", "terminal.exec", "shell", "command"}
    if capability_id.startswith("filesystem."):
        return {"file_access", "filesystem", "filesystem.read", "filesystem.write", "filesystem.read_write"}
    if capability_id == "browser_automation.interactive":
        return {"browser.automation", "browser_automation.interactive", "browser", "web"}
    if capability_id == "screenshot.capture":
        return {"screenshot.capture", "screenshot", "computer_control"}
    if capability_id.startswith("computer_control."):
        return {"computer_control", capability_id}
    return {capability_id} if capability_id else set()


def _self_hosted_attachment_matches_node(attachment: Dict[str, Any], node_token: str) -> bool:
    if not node_token:
        return True
    candidate_values = {
        _text(attachment.get("runtime_node_id")),
        _text(attachment.get("runtime_id")),
        _text(attachment.get("machine_id")),
        _text(attachment.get("attachment_id")),
        _text(attachment.get("runtime_profile_id")),
        _text(attachment.get("runtime_profile_slug")),
    }
    return node_token in candidate_values


def _self_hosted_capability_available(attachment: Dict[str, Any], capability_id: str) -> bool:
    aliases = {item.lower() for item in _self_hosted_capability_aliases(capability_id)}
    if not aliases:
        return True
    available = {
        _text(item).lower()
        for item in list(attachment.get("capabilities") or [])
        if _text(item)
    }
    if not available:
        return False
    return bool(aliases & available)


async def _select_self_hosted_attachment(
    *,
    tenant_id: str,
    workspace_id: str,
    node_id: Optional[str],
    capability_id: str,
) -> tuple[Optional[Dict[str, Any]], str]:
    inventory = await runtime_attachment_service.list_workspace_runtime_attachments(
        tenant_id=_text(tenant_id) or "default",
        workspace_id=_text(workspace_id) or "default",
    )
    node_token = _text(node_id)
    attachments = [
        dict(item)
        for item in list((inventory or {}).get("attachments") or [])
        if isinstance(item, dict)
        and _text(item.get("attachment_kind")) == "self_hosted_business_node"
        and _self_hosted_attachment_matches_node(item, node_token)
    ]
    if not attachments:
        return None, "self_hosted_node_not_found"
    attachment = attachments[0]
    try:
        runtime_attachment_service.ensure_self_hosted_node_gate(
            attachment=attachment,
            workspace_id=_text(workspace_id) or "default",
            required_capabilities=[],
        )
    except runtime_attachment_service.RuntimeAttachmentSelectionError as exc:
        return attachment, exc.reason
    if not _self_hosted_capability_available(attachment, capability_id):
        return attachment, "self_hosted_node_capability_mismatch"
    return attachment, ""


def _cloud_computer_summary(capability_id: str, virtual_action: str, response: Dict[str, Any]) -> str:
    action_result = response.get("action_result") if isinstance(response.get("action_result"), dict) else {}
    if virtual_action == virtual_computer_runtime.ACTION_OPEN_URL:
        session = response.get("session") if isinstance(response.get("session"), dict) else {}
        url = _text(session.get("ui_current_url"))
        return f"Used cloud computer browser: {url}" if url else "Used cloud computer browser."
    if virtual_action == virtual_computer_runtime.ACTION_SCREENSHOT:
        return "Captured cloud computer screenshot."
    if virtual_action == virtual_computer_runtime.ACTION_RUN_COMMAND:
        return "Ran command in cloud computer sandbox."
    completed_action = _text(action_result.get("action") or virtual_action)
    if completed_action:
        return f"Cloud computer action completed: {completed_action}."
    return f"{capability_id or 'cloud computer action'} completed."


def _audit_event(action: str, *, state: str, reason: Optional[str] = None, payload: Any = None) -> Dict[str, Any]:
    event = {
        "action": _text(action) or "hardware_action.event",
        "state": _normalize_state(state),
        "at": _utc_now_iso(),
    }
    if reason:
        event["reason"] = _text(reason)
    if isinstance(payload, dict) and payload:
        event["payload"] = secret_redaction_service.sanitize_mapping(payload)
    return event


def _session_view(session_id: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "session_id": _text(session_id),
        "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
        "state": _normalize_state(metadata.get("state")),
        "runtime_target": _text(metadata.get("runtime_target")) or "cloud_default",
        "canonical_runtime_target": _text(metadata.get("canonical_runtime_target")) or "cloud_default",
        "runtime_fabric_target": _text(metadata.get("runtime_fabric_target"))
        or _text(metadata.get("canonical_runtime_target"))
        or "cloud_default",
        "hardware_edge": _text(metadata.get("hardware_edge")) or "managed_cloud",
        "runtime_access_mode": normalize_runtime_access_mode(metadata.get("runtime_access_mode")),
        "execution_mode": _text(metadata.get("execution_mode")) or None,
        "permission_mode": _text(metadata.get("permission_mode")) or None,
        "approval_mode": _text(metadata.get("approval_mode")) or None,
        "empyralis_action_approvals_enabled": bool(metadata.get("empyralis_action_approvals_enabled", True)),
        "tenant_id": _text(metadata.get("tenant_id")) or None,
        "workspace_id": _text(metadata.get("workspace_id")) or None,
        "thread_id": _text(metadata.get("thread_id")) or None,
        "user_id": _text(metadata.get("user_id")) or None,
        "gateway_id": _text(metadata.get("gateway_id")) or None,
        "device_id": _text(metadata.get("device_id")) or None,
        "node_id": _text(metadata.get("node_id")) or None,
        "runtime_node_id": _text(metadata.get("runtime_node_id")) or None,
        "runtime_profile_id": _text(metadata.get("runtime_profile_id")) or None,
        "runtime_attachment_id": _text(metadata.get("runtime_attachment_id")) or None,
        "self_hosted_command_id": _text(metadata.get("self_hosted_command_id")) or None,
        "runtime_choice": _text(metadata.get("runtime_choice")) or None,
        "runtime_kind": _text(metadata.get("runtime_kind")) or None,
        "cloud_computer_session_id": _text(metadata.get("cloud_computer_session_id")) or None,
        "run_id": _text(metadata.get("run_id")) or None,
        "trace_id": _text(metadata.get("trace_id")) or None,
        "request_id": _text(metadata.get("request_id")) or None,
        "capability_id": _text(metadata.get("capability_id")) or None,
        "action_id": _text(metadata.get("action_id")) or None,
        "approvals": _list_dicts(metadata.get("approvals")),
        "artifacts": list(metadata.get("artifacts") or []),
        "audit_events": _list_dicts(metadata.get("audit_events")),
        "billing": _dict(metadata.get("billing")),
    }


def _runtime_session_with_correlation(
    runtime_session: Dict[str, Any],
    *,
    payload: Optional[Dict[str, Any]] = None,
    session_record: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    session = dict(runtime_session or {})
    source = _dict(payload)
    record = _dict(session_record)
    for key in (
        "tenant_id",
        "workspace_id",
        "thread_id",
        "user_id",
        "run_id",
        "trace_id",
        "request_id",
        "capability_id",
        "action_id",
        "runtime_node_id",
        "runtime_profile_id",
    ):
        if _text(session.get(key)):
            continue
        candidate = _text(source.get(key)) or _text(record.get(key))
        if candidate:
            session[key] = candidate
    return session


async def _create_runtime_session(
    *,
    tenant_id: str,
    workspace_id: str,
    user_id: str,
    runtime_target: str,
    canonical_runtime_target: str,
    gateway_id: Optional[str],
    device_id: Optional[str],
    node_id: Optional[str],
    action_id: str,
    capability_id: str,
    run_id: str,
    trace_id: str,
    request_id: str,
    thread_id: Optional[str],
    session_id: Optional[str],
    initial_state: str,
    cost_metadata: Optional[Dict[str, Any]],
    runtime_access_mode: str,
    execution_mode: Optional[str],
) -> Dict[str, Any]:
    resolved_session_id = _text(session_id) or _new_runtime_session_id()
    access_metadata = _runtime_access_metadata(runtime_access_mode, execution_mode)
    metadata = {
        "thread_id": _text(thread_id) or resolved_session_id,
        "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
        "runtime_session_id": resolved_session_id,
        "runtime_target": runtime_target,
        "canonical_runtime_target": canonical_runtime_target,
        "runtime_fabric_target": canonical_runtime_target,
        "hardware_edge": _runtime_edge(canonical_runtime_target),
        **access_metadata,
        "state": _normalize_state(initial_state),
        "tenant_id": _text(tenant_id) or "default",
        "workspace_id": _text(workspace_id) or "default",
        "user_id": _text(user_id),
        "gateway_id": _text(gateway_id) or None,
        "device_id": _text(device_id) or None,
        "node_id": _text(node_id) or None,
        "action_id": action_id,
        "capability_id": capability_id,
        "run_id": run_id,
        "trace_id": trace_id,
        "request_id": request_id,
        "approvals": [],
        "artifacts": [],
        "audit_events": [
            _audit_event(
                "hardware_runtime_session.created",
                state=_normalize_state(initial_state),
                payload={
                    "runtime_target": runtime_target,
                    "canonical_runtime_target": canonical_runtime_target,
                    "runtime_access_mode": access_metadata["runtime_access_mode"],
                    "capability_id": capability_id,
                    "request_id": request_id,
                },
            )
        ],
        "billing": _dict(cost_metadata),
    }
    await session_service.create_session(
        workspace_id=_text(workspace_id) or "default",
        tenant_id=_text(tenant_id) or "default",
        actor={
            "type": "sage_hardware_runtime",
            "id": _text(user_id) or "sage",
            "display_name": "Sage hardware runtime",
        },
        channel=HARDWARE_RUNTIME_CHANNEL,
        metadata=metadata,
        session_id=resolved_session_id,
    )
    return _session_view(resolved_session_id, metadata)


async def _update_runtime_session(
    runtime_session: Dict[str, Any],
    *,
    state: str,
    audit_action: str,
    reason: Optional[str] = None,
    approvals: Optional[List[Dict[str, Any]]] = None,
    artifacts: Optional[List[Any]] = None,
    extra_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    metadata = {
        key: value
        for key, value in runtime_session.items()
        if key
        in {
            "runtime_session_binding",
            "state",
            "runtime_target",
            "canonical_runtime_target",
            "runtime_fabric_target",
            "hardware_edge",
            "runtime_access_mode",
            "execution_mode",
            "permission_mode",
            "approval_mode",
            "empyralis_action_approvals_enabled",
            "tenant_id",
            "workspace_id",
            "thread_id",
            "user_id",
            "gateway_id",
            "device_id",
            "node_id",
            "runtime_node_id",
            "runtime_profile_id",
            "runtime_attachment_id",
            "self_hosted_command_id",
            "runtime_choice",
            "runtime_kind",
            "cloud_computer_session_id",
            "run_id",
            "trace_id",
            "request_id",
            "capability_id",
            "action_id",
            "approvals",
            "artifacts",
            "audit_events",
            "billing",
        }
    }
    metadata["state"] = _normalize_state(state)
    merged_approvals = _list_dicts(metadata.get("approvals"))
    for approval in list(approvals or []):
        if isinstance(approval, dict):
            merged_approvals.append(secret_redaction_service.sanitize_mapping(approval))
    metadata["approvals"] = merged_approvals
    merged_artifacts = list(metadata.get("artifacts") or [])
    for artifact in list(artifacts or []):
        if artifact and artifact not in merged_artifacts:
            merged_artifacts.append(artifact)
    metadata["artifacts"] = merged_artifacts
    audit_events = _list_dicts(metadata.get("audit_events"))
    audit_events.append(
        _audit_event(
            audit_action,
            state=metadata["state"],
            reason=reason,
            payload=extra_metadata,
        )
    )
    metadata["audit_events"] = audit_events
    if isinstance(extra_metadata, dict):
        for key, value in extra_metadata.items():
            if key not in {"arguments", "raw_arguments"}:
                metadata[key] = value
    session_id = _text(runtime_session.get("session_id"))
    try:
        updated = await session_service.extend_session(session_id, metadata_updates=metadata)
    except Exception:
        updated = None
    if isinstance(updated, dict):
        updated_metadata = _dict(updated.get("metadata"))
        if updated_metadata:
            return _session_view(session_id, updated_metadata)
    return _session_view(session_id, metadata)


async def _resolve_trace_context(
    trace_context: Any,
    *,
    trace_id: str,
    tenant_id: str,
    workspace_id: str,
    thread_id: Optional[str],
    run_id: str,
) -> Any:
    if trace_context is not None:
        return trace_context
    if not trace_id:
        return None
    return await agent_trace_service.resume_trace(
        trace_id=trace_id,
        tenant_id=_text(tenant_id) or "default",
        workspace_id=_text(workspace_id) or "default",
        thread_id=_text(thread_id) or None,
        run_id=run_id,
        root_agent_id="sage",
    )


def _find_gateway_registration(
    *,
    gateway_id: Optional[str],
    workspace_id: str,
) -> Optional[Dict[str, Any]]:
    gateway_token = _text(gateway_id)
    if gateway_token:
        return gateway_state_repository.get_gateway_registration(gateway_token)
    registrations = gateway_state_repository.list_workspace_gateway_registrations(
        _text(workspace_id) or "default",
        include_revoked=False,
    )
    active: List[Dict[str, Any]] = [
        item
        for item in registrations
        if _text(item.get("status")).lower() == "active"
        and _text(item.get("device_trust_state")).lower() != "revoked"
    ]
    for registration in active:
        candidate_gateway_id = _text(registration.get("gateway_id"))
        if candidate_gateway_id and gateway_protocol_service.gateway_connection_is_live(candidate_gateway_id):
            return registration
    return active[0] if active else None


def _registration_is_usable(registration: Optional[Dict[str, Any]], *, workspace_id: str) -> tuple[bool, str]:
    if not isinstance(registration, dict) or not registration:
        return False, "gateway_registration_missing"
    if _text(registration.get("status")).lower() != "active":
        return False, "gateway_registration_inactive"
    if _text(registration.get("device_trust_state")).lower() == "revoked":
        return False, "gateway_device_revoked"
    registration_workspace_id = _text(registration.get("workspace_id"))
    if registration_workspace_id and registration_workspace_id != (_text(workspace_id) or "default"):
        return False, "gateway_workspace_mismatch"
    return True, ""


def _artifact_ids_from_execution(execution: Dict[str, Any]) -> List[str]:
    result = _dict(execution.get("result"))
    candidates: List[Any] = []
    for key in ("artifact_id", "screenshot_artifact_id"):
        if result.get(key):
            candidates.append(result.get(key))
    artifacts = result.get("artifacts")
    if isinstance(artifacts, list):
        for item in artifacts:
            if isinstance(item, dict):
                candidates.append(item.get("artifact_id") or item.get("id"))
            else:
                candidates.append(item)
    return [_text(item) for item in candidates if _text(item)]


def _execution_summary(capability_id: str, execution: Dict[str, Any]) -> str:
    result = _dict(execution.get("result"))
    summary = _text(result.get("summary") or execution.get("summary"))
    if summary:
        return summary
    if capability_id == "shell.execute":
        command = _text(result.get("command"))
        exit_code = result.get("exit_code")
        if command:
            return f"Ran command: {command}"
        if exit_code is not None:
            return f"Shell command finished with exit code {exit_code}."
    if capability_id.startswith("filesystem."):
        path = _text(result.get("path"))
        mode = _text(result.get("mode")) or "file"
        if path:
            return f"{mode.capitalize()} file action completed: {path}"
    return f"{capability_id or 'hardware action'} completed."


async def _emit_tool_started(
    trace_context: Any,
    *,
    tool_call_id: str,
    capability_id: str,
    arguments: Dict[str, Any],
) -> None:
    await agent_trace_service.emit_tool_started(
        trace_context,
        item_id=None,
        tool_call_id=tool_call_id,
        tool_name=capability_id,
        capability_id=capability_id,
        connector_id="hardware_runtime",
        args_preview=secret_redaction_service.sanitize_mapping(arguments),
    )


async def _emit_tool_result(
    trace_context: Any,
    *,
    tool_call_id: str,
    status: str,
    summary: str,
    artifact_ids: Optional[List[str]] = None,
    capability_id: Optional[str] = None,
    arguments: Optional[Dict[str, Any]] = None,
    runtime_session: Optional[Dict[str, Any]] = None,
    runtime_target: Optional[str] = None,
    request_id: Optional[str] = None,
    action_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    session = _dict(runtime_session)
    resolved_capability_id = _text(capability_id) or _text(session.get("capability_id"))
    resolved_runtime_target = (
        _text(runtime_target)
        or _text(session.get("canonical_runtime_target"))
        or _text(session.get("runtime_target"))
    )
    resolved_session_id = _text(session.get("session_id")) or _text(session.get("runtime_session_id"))
    resolved_request_id = _text(request_id) or _text(session.get("request_id")) or _text(tool_call_id)
    resolved_action_id = _text(action_id) or _text(session.get("action_id"))
    result_metadata = {
        "hardware_action": True,
        "runtime_access_mode": _text(session.get("runtime_access_mode")) or None,
        "execution_mode": _text(session.get("execution_mode")) or None,
        "state": _text(session.get("state")) or None,
        "canonical_runtime_target": _text(session.get("canonical_runtime_target")) or None,
        **_dict(metadata),
    }
    result_metadata = {
        key: value
        for key, value in result_metadata.items()
        if value not in (None, "", [], {})
    }
    trace_data = {
        "status": _text(status),
        "summary": _text(summary),
        "artifact_ids": list(artifact_ids or []),
    }
    for key, value in {
        "tool_name": resolved_capability_id,
        "capability_id": resolved_capability_id,
        "connector_id": "hardware_runtime",
        "runtime_session_id": resolved_session_id,
        "runtime_target": resolved_runtime_target,
        "request_id": resolved_request_id,
        "action_id": resolved_action_id,
    }.items():
        token = _text(value)
        if token:
            trace_data[key] = token
    if result_metadata:
        trace_data["metadata"] = result_metadata
    await agent_trace_service.emit_tool_result(
        trace_context,
        tool_call_id=tool_call_id,
        status=status,
        summary=summary,
        artifact_ids=artifact_ids or [],
        tool_name=resolved_capability_id or None,
        capability_id=resolved_capability_id or None,
        connector_id="hardware_runtime",
        args_preview=secret_redaction_service.sanitize_mapping(_dict(arguments)),
        runtime_session_id=resolved_session_id or None,
        runtime_target=resolved_runtime_target or None,
        request_id=resolved_request_id or None,
        action_id=resolved_action_id or None,
        metadata=result_metadata,
    )
    await _append_hardware_transcript_event(
        session,
        event_type="tool.result",
        data=trace_data,
        tool_call_id=tool_call_id,
    )


async def _append_hardware_transcript_event(
    runtime_session: Dict[str, Any],
    *,
    event_type: str,
    data: Optional[Dict[str, Any]] = None,
    tool_call_id: Optional[str] = None,
    artifact_id: Optional[str] = None,
    approval_id: Optional[str] = None,
) -> None:
    session = _dict(runtime_session)
    thread_id = _text(session.get("thread_id"))
    if not thread_id:
        return
    payload: Dict[str, Any] = {
        "event_type": _text(event_type),
        "data": _dict(data),
    }
    if tool_call_id:
        payload["tool_call_id"] = _text(tool_call_id)
    if artifact_id:
        payload["artifact_id"] = _text(artifact_id)
    if approval_id:
        payload["approval_id"] = _text(approval_id)
    try:
        await thread_service.append_assistant_turn_transcript_event(
            tenant_id=_text(session.get("tenant_id")) or "default",
            workspace_id=_text(session.get("workspace_id")) or "default",
            thread_id=thread_id,
            event_name="trace",
            payload=payload,
            request_id=_text(session.get("request_id")) or None,
            trace_id=_text(session.get("trace_id")) or None,
            run_id=_text(session.get("run_id")) or None,
        )
    except Exception:
        return


async def _emit_artifacts(
    trace_context: Any,
    artifact_ids: List[str],
    capability_id: str,
    *,
    runtime_session: Optional[Dict[str, Any]] = None,
) -> None:
    for artifact_id in artifact_ids:
        title = f"{capability_id} artifact"
        await agent_trace_service.emit_artifact_created(
            trace_context,
            artifact_id=artifact_id,
            kind="hardware_action",
            title=title,
            mime_type=None,
        )
        if isinstance(runtime_session, dict):
            await _append_hardware_transcript_event(
                runtime_session,
                event_type="artifact.created",
                data={
                    "kind": "hardware_action",
                    "title": title,
                    "artifact_id": artifact_id,
                    "capability_id": capability_id,
                },
                artifact_id=artifact_id,
            )


async def _emit_approval_resolved(
    trace_context: Any,
    runtime_session: Dict[str, Any],
    *,
    approval_id: str,
    decision: str,
    actor: str,
    note: Optional[str],
) -> None:
    await agent_trace_service.emit_approval_resolved(
        trace_context,
        approval_id=approval_id,
        decision=decision,
        actor=_text(actor) or "user",
        note=note,
    )
    await _append_hardware_transcript_event(
        runtime_session,
        event_type="approval.resolved",
        data={
            "approval_id": approval_id,
            "decision": decision,
            "actor": _text(actor) or "user",
        },
        approval_id=approval_id,
    )


def _artifact_ids_from_artifact_records(items: Any) -> List[str]:
    ids: List[str] = []
    for item in list(items or []):
        if isinstance(item, dict):
            candidate = item.get("artifact_id") or item.get("id")
        else:
            candidate = item
        token = _text(candidate)
        if token and token not in ids:
            ids.append(token)
    return ids


def _self_hosted_completion_summary(
    *,
    capability_id: str,
    status: str,
    result_payload: Dict[str, Any],
    error: Optional[str],
) -> str:
    if _text(error):
        return _text(error)
    summary = _text(result_payload.get("summary") or result_payload.get("message") or result_payload.get("output_summary"))
    if summary:
        return summary
    if capability_id == "shell.execute":
        command = _text(result_payload.get("command"))
        exit_code = result_payload.get("exit_code")
        if command:
            return f"Ran command: {command}" if status == "completed" else f"Command failed: {command}"
        if exit_code is not None:
            return f"Shell command finished with exit code {exit_code}."
    if capability_id.startswith("filesystem."):
        path = _text(result_payload.get("path"))
        if path:
            return f"File action completed: {path}" if status == "completed" else f"File action failed: {path}"
    return "Self-hosted node action completed." if status == "completed" else "Self-hosted node action failed."


def _runtime_session_approval_by_id(runtime_session: Dict[str, Any], approval_id: str) -> Optional[Dict[str, Any]]:
    token = _text(approval_id)
    if not token:
        return None
    for approval in _list_dicts(runtime_session.get("approvals")):
        if _text(approval.get("approval_id")) == token:
            return approval
    return None


def _runtime_session_raw_approval_payload(metadata: Dict[str, Any], approval_id: str) -> Dict[str, Any]:
    token = _text(approval_id)
    payloads = _dict(metadata.get("approval_execution_payloads"))
    payload = payloads.get(token) if token else None
    return _dict(payload)


async def _find_runtime_hardware_approval(
    approval_id: str,
    *,
    workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    token = _text(approval_id)
    if not token:
        return None
    record = await session_service.find_runtime_session_by_approval_id(
        token,
        workspace_id=_text(workspace_id) or None,
    )
    if not isinstance(record, dict):
        return None
    metadata = _dict(record.get("metadata"))
    if _text(metadata.get("runtime_session_binding")) != HARDWARE_RUNTIME_SESSION_BINDING:
        return None
    request_payload = _runtime_session_raw_approval_payload(metadata, token)
    runtime_session = _runtime_session_with_correlation(
        _session_view(_text(record.get("session_id")), metadata),
        payload=request_payload,
        session_record=record,
    )
    approval = _runtime_session_approval_by_id(runtime_session, token)
    if not isinstance(approval, dict):
        return None
    request_payload = request_payload or _dict(approval.get("request_payload"))
    return {
        "approval": approval,
        "request_payload": request_payload,
        "runtime_session": runtime_session,
        "session_record": record,
        "metadata": metadata,
    }


async def get_runtime_hardware_approval(
    approval_id: str,
    *,
    workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    match = await _find_runtime_hardware_approval(approval_id, workspace_id=workspace_id)
    if not isinstance(match, dict):
        return None
    approval = _dict(match.get("approval"))
    runtime_session = _dict(match.get("runtime_session"))
    return {
        **approval,
        "approval_id": _text(approval.get("approval_id")),
        "runtime_session_id": _text(runtime_session.get("session_id")),
        "runtime_target": _text(runtime_session.get("canonical_runtime_target")) or _text(runtime_session.get("runtime_target")),
        "workspace_id": _text(runtime_session.get("workspace_id")) or None,
        "run_id": _text(runtime_session.get("run_id")) or None,
        "trace_id": _text(runtime_session.get("trace_id")) or None,
    }


def _approval_resolution_status(decision: str) -> str:
    token = _text(decision).lower()
    if token in {"proceed", "approve", "approved", "yes", "y", "continue", "ok", "allow_once", "allow_session"}:
        return "approved"
    if token in {"hold", "reject", "rejected", "no", "n", "abort", "stop", "cancel", "deny", "denied"}:
        return "rejected"
    raise ValueError("Hardware approval decision must be approved or rejected.")


async def _set_runtime_session_approval_status(
    runtime_session: Dict[str, Any],
    *,
    approval_id: str,
    status: str,
    decision: str,
    actor: str,
    note: Optional[str],
    approval_scope: Optional[str],
    state: str,
    audit_action: str,
    extra_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    token = _text(approval_id)
    resolved_at = _utc_now_iso()
    approvals: List[Dict[str, Any]] = []
    found = False
    for item in _list_dicts(runtime_session.get("approvals")):
        approval = dict(item)
        if _text(approval.get("approval_id")) == token:
            found = True
            approval.update(
                {
                    "status": _text(status),
                    "decision": _text(decision),
                    "decision_actor": _text(actor) or "user",
                    "decision_note": _text(note) or None,
                    "approval_scope": _text(approval_scope) or "once",
                    "resolved_at": resolved_at,
                }
            )
        approvals.append(approval)
    if not found and token:
        approvals.append(
            {
                "approval_id": token,
                "status": _text(status),
                "decision": _text(decision),
                "decision_actor": _text(actor) or "user",
                "decision_note": _text(note) or None,
                "approval_scope": _text(approval_scope) or "once",
                "resolved_at": resolved_at,
            }
        )
    return await _update_runtime_session(
        runtime_session,
        state=state,
        audit_action=audit_action,
        reason=_text(note) or None,
        extra_metadata={
            "approval_id": token,
            "approval_decision": _text(decision),
            "approval_scope": _text(approval_scope) or "once",
            "approvals": approvals,
            **_dict(extra_metadata),
        },
    )


async def resolve_runtime_hardware_approval(
    approval_id: str,
    *,
    decision: str,
    actor: str,
    note: Optional[str] = None,
    workspace_id: Optional[str] = None,
    approval_scope: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    resolved_decision = _approval_resolution_status(decision)
    match = await _find_runtime_hardware_approval(approval_id, workspace_id=workspace_id)
    if not isinstance(match, dict):
        return {"status": "not_found", "approval_id": _text(approval_id)}
    approval = _dict(match.get("approval"))
    runtime_session = _dict(match.get("runtime_session"))
    request_payload = _dict(match.get("request_payload")) or _dict(approval.get("request_payload"))
    approval_id = _text(approval.get("approval_id")) or _text(approval_id)
    current_status = _text(approval.get("status")).lower()
    if current_status in {"executed", "completed", "running", "rejected", "denied", "failed", "terminated"}:
        return {
            "status": current_status,
            "approval": approval,
            "runtime_session": runtime_session,
            "trace_id": _text(runtime_session.get("trace_id")) or None,
        }

    capability_id = _text(request_payload.get("capability_id")) or _text(runtime_session.get("capability_id"))
    action_id = _text(request_payload.get("action_id") or request_payload.get("action")) or _text(runtime_session.get("action_id"))
    arguments = _dict(request_payload.get("arguments"))
    runtime_target = _text(request_payload.get("runtime_target")) or _text(runtime_session.get("canonical_runtime_target"))
    run_id = _text(request_payload.get("run_id")) or _text(runtime_session.get("run_id")) or _text(runtime_session.get("session_id"))
    trace_id = _text(request_payload.get("trace_id")) or _text(runtime_session.get("trace_id"))
    request_id = _text(request_payload.get("request_id")) or _text(runtime_session.get("request_id")) or approval_id
    thread_id = _text(request_payload.get("thread_id")) or _text(runtime_session.get("thread_id")) or None
    runtime_access_mode = _text(request_payload.get("runtime_access_mode")) or _text(runtime_session.get("runtime_access_mode"))
    trace_context = await _resolve_trace_context(
        None,
        trace_id=trace_id,
        tenant_id=_text(request_payload.get("tenant_id")) or _text(runtime_session.get("tenant_id")) or "default",
        workspace_id=_text(request_payload.get("workspace_id")) or _text(runtime_session.get("workspace_id")) or "default",
        thread_id=thread_id,
        run_id=run_id,
    )
    await _emit_approval_resolved(
        trace_context,
        runtime_session,
        approval_id=approval_id,
        decision=resolved_decision,
        actor=actor,
        note=note,
    )

    if resolved_decision == "rejected":
        runtime_session = await _set_runtime_session_approval_status(
            runtime_session,
            approval_id=approval_id,
            status="rejected",
            decision=resolved_decision,
            actor=actor,
            note=note,
            approval_scope=approval_scope,
            state="terminated",
            audit_action="hardware_action.approval_rejected",
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=request_id,
            status="terminated",
            summary="Hardware action denied.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target=runtime_target,
            request_id=request_id,
            action_id=action_id,
            metadata={"approval_id": approval_id, "approval_decision": resolved_decision},
        )
        return {
            "status": "rejected",
            "approval": _runtime_session_approval_by_id(runtime_session, approval_id) or approval,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    runtime_session = await _set_runtime_session_approval_status(
        runtime_session,
        approval_id=approval_id,
        status="approved",
        decision=resolved_decision,
        actor=actor,
        note=note,
        approval_scope=approval_scope,
        state="running",
        audit_action="hardware_action.approval_approved",
    )
    if runtime_target == "empyralis_cloud_computer":
        result = await _execute_cloud_computer_action(
            tenant_id=_text(request_payload.get("tenant_id")) or _text(runtime_session.get("tenant_id")) or "default",
            workspace_id=_text(request_payload.get("workspace_id")) or _text(runtime_session.get("workspace_id")) or "default",
            user_id=_text(request_payload.get("user_id")) or _text(runtime_session.get("user_id")) or None,
            action_id=action_id,
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            run_id=run_id,
            trace_id=trace_id,
            thread_id=thread_id,
            request_id=request_id,
            trace_context=trace_context,
            require_approval=False,
            runtime_access_mode=runtime_access_mode,
            cost_metadata=_dict(runtime_session.get("billing")),
            tool_call_id=request_id,
        )
    elif runtime_target == "self_hosted_node":
        result = await _execute_self_hosted_node_action(
            tenant_id=_text(request_payload.get("tenant_id")) or _text(runtime_session.get("tenant_id")) or "default",
            workspace_id=_text(request_payload.get("workspace_id")) or _text(runtime_session.get("workspace_id")) or "default",
            user_id=_text(request_payload.get("user_id")) or _text(runtime_session.get("user_id")) or None,
            node_id=_text(request_payload.get("runtime_node_id") or request_payload.get("node_id")) or _text(runtime_session.get("runtime_node_id")) or None,
            action_id=action_id,
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            run_id=run_id,
            trace_id=trace_id,
            thread_id=thread_id,
            request_id=request_id,
            trace_context=trace_context,
            require_approval=False,
            runtime_access_mode=runtime_access_mode,
            tool_call_id=request_id,
        )
    else:
        runtime_session = await _set_runtime_session_approval_status(
            runtime_session,
            approval_id=approval_id,
            status="failed",
            decision=resolved_decision,
            actor=actor,
            note="Unsupported runtime approval target.",
            approval_scope=approval_scope,
            state="failed",
            audit_action="hardware_action.approval_resume_failed",
            extra_metadata={"runtime_target": runtime_target, "failure_reason": "unsupported_runtime_target"},
        )
        result = {
            "status": "failed",
            "reason": "unsupported_runtime_target",
            "approval": _runtime_session_approval_by_id(runtime_session, approval_id) or approval,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }
    final_session = _dict(result.get("runtime_session")) or runtime_session
    final_status = _text(result.get("status")).lower()
    approval_status = "executed" if final_status in {"completed", "running"} else "failed"
    final_session = await _set_runtime_session_approval_status(
        final_session,
        approval_id=approval_id,
        status=approval_status,
        decision=resolved_decision,
        actor=actor,
        note=note,
        approval_scope=approval_scope,
        state=_text(final_session.get("state")) or ("running" if final_status == "running" else "ready"),
        audit_action="hardware_action.approval_resumed",
        extra_metadata={
            "resume_status": final_status,
            "execution_request_id": request_id,
        },
    )
    result["approval"] = _runtime_session_approval_by_id(final_session, approval_id) or approval
    result["runtime_session"] = final_session
    result["approval_id"] = approval_id
    return result


async def record_gateway_approval_resolution(
    result: Dict[str, Any],
    *,
    actor: str = "user",
    note: Optional[str] = None,
) -> Dict[str, Any]:
    approval = _dict(result.get("approval"))
    request_payload = _dict(approval.get("request_payload"))
    if _text(request_payload.get("runtime_session_binding")) != HARDWARE_RUNTIME_SESSION_BINDING:
        return result
    session_id = _text(request_payload.get("runtime_session_id"))
    if not session_id:
        return result
    session_record = await session_service.get_session(session_id) or {}
    runtime_session = _runtime_session_with_correlation(
        _session_view(session_id, _dict(session_record.get("metadata")) or request_payload),
        payload=request_payload,
        session_record=session_record,
    )
    trace_id = _text(request_payload.get("trace_id")) or _text(runtime_session.get("trace_id"))
    run_id = _text(request_payload.get("run_id")) or _text(runtime_session.get("run_id")) or session_id
    trace_context = await _resolve_trace_context(
        None,
        trace_id=trace_id,
        tenant_id=_text(runtime_session.get("tenant_id")) or _text((session_record or {}).get("tenant_id")) or "default",
        workspace_id=_text(runtime_session.get("workspace_id")) or _text((session_record or {}).get("workspace_id")) or "default",
        thread_id=_text(request_payload.get("thread_id")) or _text(runtime_session.get("thread_id")) or None,
        run_id=run_id,
    )
    approval_id = _text(approval.get("approval_id"))
    decision = _text(approval.get("decision") or result.get("status")) or "resolved"
    if approval_id:
        await _emit_approval_resolved(
            trace_context,
            runtime_session,
            approval_id=approval_id,
            decision=decision,
            actor=actor,
            note=note,
        )
    status = _text(result.get("status")).lower()
    capability_id = _text(request_payload.get("capability_id")) or _text(runtime_session.get("capability_id"))
    tool_call_id = _text(request_payload.get("request_id")) or _text(runtime_session.get("request_id")) or approval_id or session_id
    if status in {"executed", "approved"} and isinstance(result.get("execution"), dict):
        execution = _dict(result.get("execution"))
        artifact_ids = _artifact_ids_from_execution(execution)
        await _emit_artifacts(trace_context, artifact_ids, capability_id, runtime_session=runtime_session)
        summary = _execution_summary(capability_id, execution)
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="ready",
            audit_action="hardware_action.approval_executed",
            artifacts=artifact_ids,
            extra_metadata={
                "approval_id": approval_id,
                "approval_decision": decision,
                "result_summary": summary,
                "execution_request_id": _text(execution.get("request_id")) or tool_call_id,
            },
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="completed",
            summary=summary,
            artifact_ids=artifact_ids,
            capability_id=capability_id,
            arguments=_dict(request_payload.get("arguments")),
            runtime_session=runtime_session,
            runtime_target=_text(request_payload.get("runtime_target")),
            request_id=_text(request_payload.get("request_id")),
            action_id=_text(request_payload.get("action_id") or request_payload.get("action")),
            metadata={"approval_id": approval_id, "approval_decision": decision},
        )
        result["runtime_session"] = runtime_session
        result["artifacts"] = artifact_ids
        return result
    if status in {"rejected", "denied"} or decision in {"rejected", "denied"}:
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="terminated",
            audit_action="hardware_action.approval_rejected",
            reason=_text(note) or "approval_rejected",
            extra_metadata={"approval_id": approval_id, "approval_decision": decision},
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="terminated",
            summary="Hardware action denied.",
            capability_id=capability_id,
            arguments=_dict(request_payload.get("arguments")),
            runtime_session=runtime_session,
            runtime_target=_text(request_payload.get("runtime_target")),
            request_id=_text(request_payload.get("request_id")),
            action_id=_text(request_payload.get("action_id") or request_payload.get("action")),
            metadata={"approval_id": approval_id, "approval_decision": decision},
        )
        result["runtime_session"] = runtime_session
        return result
    return result


async def record_self_hosted_command_completion(completion: Dict[str, Any]) -> Dict[str, Any]:
    command = _dict(completion.get("command"))
    command_payload = _dict(command.get("command_payload"))
    if _text(command_payload.get("runtime_session_binding")) != HARDWARE_RUNTIME_SESSION_BINDING:
        return completion
    session_id = _text(command_payload.get("runtime_session_id"))
    if not session_id:
        return completion
    session_record = await session_service.get_session(session_id) or {}
    runtime_session = _runtime_session_with_correlation(
        _session_view(session_id, _dict(session_record.get("metadata")) or command_payload),
        payload=command_payload,
        session_record=session_record,
    )
    status = _text(completion.get("status")).lower()
    terminal_state = "ready" if status == "completed" else "failed"
    result_payload = _dict(completion.get("result_payload") or command.get("result_payload"))
    error = _text(completion.get("error") or command.get("error")) or None
    capability_id = _text(command_payload.get("capability_id")) or _text(runtime_session.get("capability_id"))
    artifact_ids = _artifact_ids_from_artifact_records(completion.get("artifacts") or command.get("artifacts"))
    summary = _self_hosted_completion_summary(
        capability_id=capability_id,
        status=status,
        result_payload=result_payload,
        error=error,
    )
    trace_context = await _resolve_trace_context(
        None,
        trace_id=_text(command_payload.get("trace_id")) or _text(runtime_session.get("trace_id")),
        tenant_id=_text(command_payload.get("tenant_id")) or _text((session_record or {}).get("tenant_id")) or "default",
        workspace_id=_text(command_payload.get("workspace_id")) or _text((session_record or {}).get("workspace_id")) or "default",
        thread_id=_text(command_payload.get("thread_id")) or _text(runtime_session.get("thread_id")) or None,
        run_id=_text(command_payload.get("run_id")) or _text(runtime_session.get("run_id")) or session_id,
    )
    await _emit_artifacts(trace_context, artifact_ids, capability_id, runtime_session=runtime_session)
    runtime_session = await _update_runtime_session(
        runtime_session,
        state=terminal_state,
        audit_action="hardware_action.completed" if status == "completed" else "hardware_action.failed",
        reason=error,
        artifacts=artifact_ids,
        extra_metadata={
            "runtime_node_id": _text(command_payload.get("runtime_node_id")) or None,
            "runtime_profile_id": _text(command_payload.get("runtime_profile_id")) or None,
            "self_hosted_command_id": _text(completion.get("command_id") or command.get("id")) or None,
            "result_summary": summary,
            "result_payload": result_payload,
            "completion_status": status,
        },
    )
    await _emit_tool_result(
        trace_context,
        tool_call_id=_text(command_payload.get("request_id")) or _text(runtime_session.get("request_id")) or session_id,
        status="completed" if status == "completed" else "failed",
        summary=summary,
        artifact_ids=artifact_ids,
        capability_id=capability_id,
        arguments=_dict(command_payload.get("arguments")),
        runtime_session=runtime_session,
        runtime_target="self_hosted_node",
        request_id=_text(command_payload.get("request_id")),
        action_id=_text(command_payload.get("action_id")),
        metadata={
            "self_hosted_command_id": _text(completion.get("command_id") or command.get("id")),
            "runtime_node_id": _text(command_payload.get("runtime_node_id")),
            "runtime_profile_id": _text(command_payload.get("runtime_profile_id")),
            "completion_status": status,
        },
    )
    completion["runtime_session"] = runtime_session
    completion["artifacts"] = artifact_ids
    return completion


async def _execute_cloud_computer_action(
    *,
    tenant_id: str,
    workspace_id: str,
    user_id: Optional[str],
    action_id: str,
    capability_id: str,
    arguments: Dict[str, Any],
    runtime_session: Dict[str, Any],
    run_id: str,
    trace_id: str,
    thread_id: Optional[str],
    request_id: str,
    trace_context: Any,
    require_approval: Optional[bool],
    runtime_access_mode: str,
    cost_metadata: Optional[Dict[str, Any]],
    tool_call_id: str,
) -> Dict[str, Any]:
    runtime_choice = _cloud_runtime_choice_for_action(capability_id, action_id, arguments)
    virtual_action, virtual_action_args, dispatch = _cloud_computer_virtual_action(
        capability_id=capability_id,
        action_id=action_id,
        arguments=arguments,
    )
    if not virtual_action or not dispatch:
        reason = "cloud_computer_action_not_supported"
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="degraded",
            audit_action="hardware_action.degraded",
            reason=reason,
            extra_metadata={
                "degraded_reason": reason,
                "runtime_choice": runtime_choice,
                "capability_id": capability_id,
            },
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="degraded",
            summary="Cloud computer target is available, but this action is not supported by the adapter yet.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target="empyralis_cloud_computer",
            request_id=request_id,
            action_id=action_id,
            metadata={"runtime_choice": runtime_choice, "degraded_reason": reason},
        )
        return {
            "status": "degraded",
            "reason": reason,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    if _cloud_computer_approval_required(
        capability_id=capability_id,
        action_id=action_id,
        virtual_action=virtual_action,
        arguments=arguments,
        runtime_access_mode=runtime_access_mode,
        require_approval=require_approval,
    ):
        approval = {
            "approval_id": f"cloudapproval_{uuid.uuid4().hex}",
            "status": "pending",
            "kind": "cloud_computer_action",
            "requested_at": _utc_now_iso(),
            "request_payload": {
                "runtime_target": "empyralis_cloud_computer",
                "runtime_access_mode": normalize_runtime_access_mode(runtime_access_mode),
                "runtime_session_id": _text(runtime_session.get("session_id")),
                "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
                "capability_id": capability_id,
                "action_id": action_id,
                "action": virtual_action,
                "arguments": secret_redaction_service.sanitize_mapping(virtual_action_args),
                "run_id": run_id,
                "trace_id": trace_id,
                "thread_id": _text(thread_id) or None,
                "request_id": request_id,
            },
        }
        approval_execution_payload = {
            **approval["request_payload"],
            "arguments": arguments,
            "user_id": _text(user_id) or None,
        }
        await agent_trace_service.emit_approval_requested(
            trace_context,
            approval_id=approval["approval_id"],
            kind="hardware_action",
            title=f"Approve {capability_id}",
            description=f"Approval required before running {capability_id} on the cloud computer.",
            blocking_item_id=None,
        )
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="waiting_approval",
            audit_action="hardware_action.approval_requested",
            approvals=[approval],
            extra_metadata={
                "runtime_choice": runtime_choice,
                "approval_id": approval["approval_id"],
                "capability_id": capability_id,
                "runtime_access_mode": normalize_runtime_access_mode(runtime_access_mode),
                "approval_execution_payloads": {approval["approval_id"]: approval_execution_payload},
            },
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="waiting_approval",
            summary=f"Waiting for approval to run {capability_id} on the cloud computer.",
            capability_id=capability_id,
            arguments=virtual_action_args,
            runtime_session=runtime_session,
            runtime_target="empyralis_cloud_computer",
            request_id=request_id,
            action_id=virtual_action,
            metadata={"runtime_choice": runtime_choice, "approval_id": approval["approval_id"]},
        )
        return {
            "status": "waiting_approval",
            "approval": approval,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    provider_id = _text((_dict(cost_metadata).get("runtime_provider_id") or _dict(cost_metadata).get("provider_id"))) or None
    session_persistence = _cloud_computer_session_persistence(cost_metadata)
    session_mode = _text(session_persistence.get("session_mode") or session_persistence.get("mode")).lower()
    runtime_session_id = _text(runtime_session.get("session_id")) or _new_runtime_session_id()
    create_payload = {
        "tenant_id": _text(tenant_id) or "default",
        "workspace_id": _text(workspace_id) or "default",
        "user_id": _text(user_id),
        "agent_id": "sage",
        "run_id": run_id,
        "trace_id": trace_id,
        "thread_id": _text(thread_id) or None,
        "request_id": request_id,
        "session_id": runtime_session_id,
        "runtime_session_id": runtime_session_id,
        "browser_session_id": runtime_session_id,
        "runtime_choice": runtime_choice,
        "runtime_provider_id": provider_id,
        "source": HARDWARE_RUNTIME_SESSION_BINDING,
        "require_session_token": False,
        "ephemeral_task": session_mode != virtual_computer_runtime.SESSION_PERSISTENCE_RESUMABLE,
        "session_persistence": session_persistence,
        "metadata": {
            "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
            "runtime_target": "empyralis_cloud_computer",
            "runtime_access_mode": normalize_runtime_access_mode(runtime_access_mode),
            "capability_id": capability_id,
        },
    }
    runtime = get_cloud_computer_runtime_registry().resolve(
        runtime_choice,
        preferred_provider_id=provider_id,
    )
    try:
        session_payload = await runtime.create_session(create_payload)
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="running",
            audit_action="hardware_action.cloud_computer_selected",
            extra_metadata={
                "runtime_choice": runtime_choice,
                "runtime_kind": _text(session_payload.get("runtime_kind")) or None,
                "cloud_computer_session_id": _text(session_payload.get("session_id")) or runtime_session_id,
            },
        )
        action_payload = {
            **create_payload,
            "session_id": _text(session_payload.get("session_id")) or runtime_session_id,
            "runtime_session_id": _text(session_payload.get("session_id")) or runtime_session_id,
            "browser_session_id": _text(session_payload.get("session_id")) or runtime_session_id,
            "action": virtual_action,
            "action_args": virtual_action_args,
            "policy_metadata": {
                "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
                "capability_id": capability_id,
            },
        }
        if dispatch == "stream_screenshot":
            action_response = await runtime.stream_screenshot(action_payload)
        else:
            action_response = await runtime.execute_action(action_payload)
    except Exception as exc:
        message = str(exc)
        state = "degraded" if "not configured" in message.lower() else "failed"
        runtime_session = await _update_runtime_session(
            runtime_session,
            state=state,
            audit_action="hardware_action.failed",
            reason=message,
            extra_metadata={
                "runtime_choice": runtime_choice,
                "capability_id": capability_id,
                "failure_reason": message,
            },
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status=state,
            summary=message or "Cloud computer action failed.",
            capability_id=capability_id,
            arguments=virtual_action_args,
            runtime_session=runtime_session,
            runtime_target="empyralis_cloud_computer",
            request_id=request_id,
            action_id=virtual_action,
            metadata={"runtime_choice": runtime_choice, "failure_reason": message},
        )
        return {
            "status": state,
            "reason": message,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    artifact_ids = _runtime_artifact_ids_from_response(action_response)
    await _emit_artifacts(trace_context, artifact_ids, capability_id, runtime_session=runtime_session)
    cost = _runtime_cost_metadata(action_response, runtime_choice=runtime_choice, provider_id=provider_id)
    summary = _cloud_computer_summary(capability_id, virtual_action, action_response)
    runtime_session = await _update_runtime_session(
        runtime_session,
        state="ready",
        audit_action="hardware_action.completed",
        artifacts=artifact_ids,
        extra_metadata={
            "runtime_choice": runtime_choice,
            "runtime_kind": _text(action_response.get("runtime_kind")) or None,
            "cloud_computer_session_id": _text(action_response.get("session_id")) or runtime_session_id,
            "result_summary": summary,
            "execution_request_id": request_id,
            "billing": cost,
        },
    )
    await _emit_tool_result(
        trace_context,
        tool_call_id=tool_call_id,
        status="completed",
        summary=summary,
        artifact_ids=artifact_ids,
        capability_id=capability_id,
        arguments=virtual_action_args,
        runtime_session=runtime_session,
        runtime_target="empyralis_cloud_computer",
        request_id=request_id,
        action_id=virtual_action,
        metadata={"runtime_choice": runtime_choice, "cloud_computer_session_id": _text(action_response.get("session_id")) or runtime_session_id},
    )
    execution = {
        "runtime_target": "empyralis_cloud_computer",
        "canonical_runtime_target": "empyralis_cloud_computer",
        "runtime_choice": runtime_choice,
        "runtime_provider_id": provider_id,
        "session": session_payload,
        "result": action_response,
        "capability_id": capability_id,
        "action": virtual_action,
        "run_id": run_id,
        "trace_id": trace_id,
        "request_id": request_id,
        "cost_metadata": cost,
    }
    return {
        "status": "completed",
        "execution": execution,
        "runtime_session": runtime_session,
        "artifacts": artifact_ids,
        "trace_id": trace_id,
    }


async def _execute_self_hosted_node_action(
    *,
    tenant_id: str,
    workspace_id: str,
    user_id: Optional[str],
    node_id: Optional[str],
    action_id: str,
    capability_id: str,
    arguments: Dict[str, Any],
    runtime_session: Dict[str, Any],
    run_id: str,
    trace_id: str,
    thread_id: Optional[str],
    request_id: str,
    trace_context: Any,
    require_approval: Optional[bool],
    runtime_access_mode: str,
    tool_call_id: str,
) -> Dict[str, Any]:
    attachment, unavailable_reason = await _select_self_hosted_attachment(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        node_id=node_id,
        capability_id=capability_id,
    )
    if unavailable_reason:
        state = "offline" if unavailable_reason == "self_hosted_node_offline" else "degraded"
        if unavailable_reason == "self_hosted_node_revoked":
            state = "failed"
        runtime_session = await _update_runtime_session(
            runtime_session,
            state=state,
            audit_action="hardware_action.self_hosted_unavailable",
            reason=unavailable_reason,
            extra_metadata={"unavailable_reason": unavailable_reason},
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status=state,
            summary="Self-hosted node is not available for this hardware action.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target="self_hosted_node",
            request_id=request_id,
            action_id=action_id,
            metadata={"unavailable_reason": unavailable_reason},
        )
        return {
            "status": state,
            "reason": unavailable_reason,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }
    attachment = dict(attachment or {})
    runtime_node_id = _text(attachment.get("runtime_node_id") or attachment.get("runtime_id"))
    runtime_profile_id = _text(attachment.get("runtime_profile_id"))
    runtime_attachment_id = _text(attachment.get("attachment_id"))
    node_kind = _text(attachment.get("node_kind"))
    approval_required = _hardware_action_requires_software_approval(
        runtime_access_mode=runtime_access_mode,
        capability_id=capability_id,
        action_id=action_id,
        arguments=arguments,
        require_approval=require_approval,
    )
    if approval_required:
        approval = {
            "approval_id": f"selfhostapproval_{uuid.uuid4().hex}",
            "status": "pending",
            "kind": "self_hosted_node_action",
            "requested_at": _utc_now_iso(),
            "request_payload": {
                "runtime_target": "self_hosted_node",
                "runtime_access_mode": normalize_runtime_access_mode(runtime_access_mode),
                "runtime_session_id": _text(runtime_session.get("session_id")),
                "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
                "runtime_node_id": runtime_node_id,
                "runtime_profile_id": runtime_profile_id,
                "capability_id": capability_id,
                "action_id": action_id,
                "arguments": secret_redaction_service.sanitize_mapping(arguments),
                "run_id": run_id,
                "trace_id": trace_id,
                "thread_id": _text(thread_id) or None,
                "request_id": request_id,
            },
        }
        approval_execution_payload = {
            **approval["request_payload"],
            "arguments": arguments,
            "user_id": _text(user_id) or None,
            "runtime_attachment_id": runtime_attachment_id,
            "node_kind": node_kind or None,
        }
        await agent_trace_service.emit_approval_requested(
            trace_context,
            approval_id=approval["approval_id"],
            kind="hardware_action",
            title=f"Approve {capability_id}",
            description=f"Approval required before running {capability_id} on the self-hosted node.",
            blocking_item_id=None,
        )
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="waiting_approval",
            audit_action="hardware_action.approval_requested",
            approvals=[approval],
            extra_metadata={
                "runtime_node_id": runtime_node_id,
                "runtime_profile_id": runtime_profile_id,
                "approval_id": approval["approval_id"],
                "runtime_access_mode": normalize_runtime_access_mode(runtime_access_mode),
                "approval_execution_payloads": {approval["approval_id"]: approval_execution_payload},
            },
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="waiting_approval",
            summary=f"Waiting for approval to run {capability_id} on the self-hosted node.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target="self_hosted_node",
            request_id=request_id,
            action_id=action_id,
            metadata={
                "approval_id": approval["approval_id"],
                "runtime_node_id": runtime_node_id,
                "runtime_profile_id": runtime_profile_id,
            },
        )
        return {
            "status": "waiting_approval",
            "approval": approval,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    command_payload = {
        "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
        "runtime_session_id": _text(runtime_session.get("session_id")),
        "runtime_target": "self_hosted_node",
        "runtime_access_mode": normalize_runtime_access_mode(runtime_access_mode),
        "runtime_node_id": runtime_node_id,
        "runtime_profile_id": runtime_profile_id,
        "runtime_attachment_id": runtime_attachment_id,
        "node_kind": node_kind or None,
        "workspace_id": _text(workspace_id) or "default",
        "tenant_id": _text(tenant_id) or "default",
        "user_id": _text(user_id) or None,
        "run_id": run_id,
        "trace_id": trace_id,
        "thread_id": _text(thread_id) or None,
        "request_id": request_id,
        "capability_id": capability_id,
        "action_id": action_id,
        "arguments": arguments,
        "required_capabilities": _self_hosted_required_capabilities(capability_id),
    }
    try:
        enqueued = await agent_registry_repository.enqueue_self_hosted_runtime_command(
            runtime_profile_id=runtime_profile_id,
            tenant_id=_text(tenant_id) or "default",
            workspace_id=_text(workspace_id) or "default",
            runtime_node_id=runtime_node_id,
            agent_id="sage",
            command_type="hardware_action",
            command_payload=command_payload,
            requested_by_user_id=_text(user_id) or None,
            ttl_seconds=agent_registry_repository.SELF_HOSTED_NODE_COMMAND_DEFAULT_TTL_SECONDS,
        )
    except Exception as exc:
        message = str(exc)
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="failed",
            audit_action="hardware_action.failed",
            reason=message,
            extra_metadata={
                "runtime_node_id": runtime_node_id,
                "runtime_profile_id": runtime_profile_id,
                "failure_reason": message,
            },
        )
        await _emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="failed",
            summary=message or "Self-hosted node command enqueue failed.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target="self_hosted_node",
            request_id=request_id,
            action_id=action_id,
            metadata={
                "runtime_node_id": runtime_node_id,
                "runtime_profile_id": runtime_profile_id,
                "failure_reason": message,
            },
        )
        return {
            "status": "failed",
            "reason": message,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    command = _dict(enqueued.get("command"))
    command_id = _text(command.get("id"))
    summary = "Queued self-hosted node action."
    runtime_session = await _update_runtime_session(
        runtime_session,
        state="running",
        audit_action="hardware_action.self_hosted_command_enqueued",
        extra_metadata={
            "runtime_node_id": runtime_node_id,
            "runtime_profile_id": runtime_profile_id,
            "runtime_attachment_id": runtime_attachment_id,
            "node_kind": node_kind or None,
            "self_hosted_command_id": command_id,
            "result_summary": summary,
        },
    )
    await _emit_tool_result(
        trace_context,
        tool_call_id=tool_call_id,
        status="running",
        summary=summary,
        capability_id=capability_id,
        arguments=arguments,
        runtime_session=runtime_session,
        runtime_target="self_hosted_node",
        request_id=request_id,
        action_id=action_id,
        metadata={
            "runtime_node_id": runtime_node_id,
            "runtime_profile_id": runtime_profile_id,
            "runtime_attachment_id": runtime_attachment_id,
            "self_hosted_command_id": command_id,
        },
    )
    return {
        "status": "running",
        "execution": {
            "runtime_target": "self_hosted_node",
            "canonical_runtime_target": "self_hosted_node",
            "runtime_node_id": runtime_node_id,
            "runtime_profile_id": runtime_profile_id,
            "runtime_attachment_id": runtime_attachment_id,
            "command": command,
            "command_enqueue": enqueued,
            "capability_id": capability_id,
            "action_id": action_id,
            "run_id": run_id,
            "trace_id": trace_id,
            "request_id": request_id,
        },
        "runtime_session": runtime_session,
        "artifacts": [],
        "trace_id": trace_id,
    }


async def execute_hardware_action(
    *,
    tenant_id: str,
    workspace_id: str,
    action_id: str,
    arguments: Optional[Dict[str, Any]] = None,
    runtime_target: str = "cloud_default",
    capability_id: Optional[str] = None,
    user_id: Optional[str] = None,
    gateway_id: Optional[str] = None,
    device_id: Optional[str] = None,
    node_id: Optional[str] = None,
    run_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    request_id: Optional[str] = None,
    session_id: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
    trace_context: Any = None,
    require_approval: Optional[bool] = None,
    runtime_access_mode: Optional[str] = None,
    execution_mode: Optional[str] = None,
    cost_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    args = _dict(arguments)
    target_ids = _runtime_target_ids(runtime_target)
    runtime_target_id = target_ids["runtime_target"]
    canonical_target_id = target_ids["canonical_runtime_target"]
    resolved_capability_id = normalize_hardware_capability_id(action_id, capability_id)
    resolved_run_id = _text(run_id) or _new_run_id()
    resolved_request_id = _text(request_id) or _new_request_id()
    resolved_trace_id = _text(trace_id) or f"trace_{uuid.uuid4().hex}"
    resolved_runtime_access_mode = normalize_runtime_access_mode(runtime_access_mode, execution_mode=execution_mode)
    raw_access_or_execution_mode = _text(runtime_access_mode).lower()
    resolved_execution_mode = _text(execution_mode) or (
        raw_access_or_execution_mode
        if raw_access_or_execution_mode in set(execution_mode_policy.SUPPORTED_EXECUTION_MODES)
        else ("full_access" if resolved_runtime_access_mode == FULL_RUNTIME_ACCESS_MODE else "default")
    )
    tool_call_id = resolved_request_id
    initial_state = (
        "running"
        if canonical_target_id in {"user_device_gateway", "empyralis_cloud_computer", "self_hosted_node"}
        else "degraded"
    )
    runtime_session = await _create_runtime_session(
        tenant_id=_text(tenant_id) or "default",
        workspace_id=_text(workspace_id) or "default",
        user_id=_text(user_id),
        runtime_target=runtime_target_id,
        canonical_runtime_target=canonical_target_id,
        gateway_id=gateway_id,
        device_id=device_id,
        node_id=node_id,
        action_id=_text(action_id),
        capability_id=resolved_capability_id,
        run_id=resolved_run_id,
        trace_id=resolved_trace_id,
        request_id=resolved_request_id,
        thread_id=thread_id,
        session_id=session_id,
        initial_state=initial_state,
        cost_metadata=cost_metadata,
        runtime_access_mode=resolved_runtime_access_mode,
        execution_mode=resolved_execution_mode,
    )
    resolved_trace_context = await _resolve_trace_context(
        trace_context,
        trace_id=resolved_trace_id,
        tenant_id=_text(tenant_id) or "default",
        workspace_id=_text(workspace_id) or "default",
        thread_id=thread_id,
        run_id=resolved_run_id,
    )
    await _emit_tool_started(
        resolved_trace_context,
        tool_call_id=tool_call_id,
        capability_id=resolved_capability_id,
        arguments=args,
    )

    if not resolved_capability_id or resolve_capability(resolved_capability_id, enforce_kill_switch=False) is None:
        reason = "unknown_hardware_capability"
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="failed",
            audit_action="hardware_action.failed",
            reason=reason,
            extra_metadata={"failure_reason": reason},
        )
        await _emit_tool_result(
            resolved_trace_context,
            tool_call_id=tool_call_id,
            status="failed",
            summary="Hardware capability is not registered.",
            capability_id=resolved_capability_id,
            arguments=args,
            runtime_session=runtime_session,
            runtime_target=canonical_target_id,
            request_id=resolved_request_id,
            action_id=_text(action_id),
            metadata={"failure_reason": reason},
        )
        return {
            "status": "failed",
            "reason": reason,
            "runtime_session": runtime_session,
            "trace_id": resolved_trace_id,
        }

    if canonical_target_id == "cloud_default":
        reason = "hardware_action_requires_optional_runtime_target"
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="degraded",
            audit_action="hardware_action.degraded",
            reason=reason,
            extra_metadata={"degraded_reason": reason},
        )
        await _emit_tool_result(
            resolved_trace_context,
            tool_call_id=tool_call_id,
            status="degraded",
            summary="Cloud chat remains available, but this hardware action needs a selected runtime target.",
            capability_id=resolved_capability_id,
            arguments=args,
            runtime_session=runtime_session,
            runtime_target=canonical_target_id,
            request_id=resolved_request_id,
            action_id=_text(action_id),
            metadata={"degraded_reason": reason},
        )
        return {
            "status": "degraded",
            "reason": reason,
            "runtime_session": runtime_session,
            "trace_id": resolved_trace_id,
        }

    if canonical_target_id == "empyralis_cloud_computer":
        return await _execute_cloud_computer_action(
            tenant_id=_text(tenant_id) or "default",
            workspace_id=_text(workspace_id) or "default",
            user_id=user_id,
            action_id=_text(action_id),
            capability_id=resolved_capability_id,
            arguments=args,
            runtime_session=runtime_session,
            run_id=resolved_run_id,
            trace_id=resolved_trace_id,
            thread_id=thread_id,
            request_id=resolved_request_id,
            trace_context=resolved_trace_context,
            require_approval=require_approval,
            runtime_access_mode=resolved_runtime_access_mode,
            cost_metadata=cost_metadata,
            tool_call_id=tool_call_id,
        )

    if canonical_target_id == "self_hosted_node":
        return await _execute_self_hosted_node_action(
            tenant_id=_text(tenant_id) or "default",
            workspace_id=_text(workspace_id) or "default",
            user_id=user_id,
            node_id=node_id,
            action_id=_text(action_id),
            capability_id=resolved_capability_id,
            arguments=args,
            runtime_session=runtime_session,
            run_id=resolved_run_id,
            trace_id=resolved_trace_id,
            thread_id=thread_id,
            request_id=resolved_request_id,
            trace_context=resolved_trace_context,
            require_approval=require_approval,
            runtime_access_mode=resolved_runtime_access_mode,
            tool_call_id=tool_call_id,
        )

    registration = _find_gateway_registration(
        gateway_id=gateway_id,
        workspace_id=_text(workspace_id) or "default",
    )
    usable, unusable_reason = _registration_is_usable(
        registration,
        workspace_id=_text(workspace_id) or "default",
    )
    if not usable:
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="offline",
            audit_action="hardware_action.offline",
            reason=unusable_reason,
            extra_metadata={"offline_reason": unusable_reason},
        )
        await _emit_tool_result(
            resolved_trace_context,
            tool_call_id=tool_call_id,
            status="offline",
            summary="Gateway is not available for this workspace.",
            capability_id=resolved_capability_id,
            arguments=args,
            runtime_session=runtime_session,
            runtime_target=canonical_target_id,
            request_id=resolved_request_id,
            action_id=_text(action_id),
            metadata={"offline_reason": unusable_reason},
        )
        return {
            "status": "offline",
            "reason": unusable_reason,
            "runtime_session": runtime_session,
            "trace_id": resolved_trace_id,
        }

    gateway_token = _text((registration or {}).get("gateway_id"))
    device_token = _text(device_id) or _text((registration or {}).get("device_id"))
    runtime_session = await _update_runtime_session(
        runtime_session,
        state="running",
        audit_action="hardware_action.gateway_selected",
        extra_metadata={"gateway_id": gateway_token, "device_id": device_token},
    )
    if not gateway_protocol_service.gateway_connection_is_live(gateway_token):
        reason = "gateway_offline"
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="offline",
            audit_action="hardware_action.offline",
            reason=reason,
            extra_metadata={"gateway_id": gateway_token, "device_id": device_token, "offline_reason": reason},
        )
        await _emit_tool_result(
            resolved_trace_context,
            tool_call_id=tool_call_id,
            status="offline",
            summary="Gateway is paired but currently offline.",
            capability_id=resolved_capability_id,
            arguments=args,
            runtime_session=runtime_session,
            runtime_target=canonical_target_id,
            request_id=resolved_request_id,
            action_id=_text(action_id),
            metadata={"gateway_id": gateway_token, "device_id": device_token, "offline_reason": reason},
        )
        return {
            "status": "offline",
            "reason": reason,
            "runtime_session": runtime_session,
            "trace_id": resolved_trace_id,
        }

    approval_required = _hardware_action_requires_software_approval(
        runtime_access_mode=resolved_runtime_access_mode,
        capability_id=resolved_capability_id,
        action_id=_text(action_id),
        arguments=args,
        require_approval=require_approval,
    )
    if approval_required:
        approval = await gateway_approval_service.request_gateway_tool_approval(
            registration=registration or {},
            capability_id=resolved_capability_id,
            arguments=args,
            run_id=resolved_run_id,
            trace_id=resolved_trace_id,
            request_id=resolved_request_id,
            runtime_session_id=_text(runtime_session.get("session_id")),
            runtime_target=canonical_target_id,
            runtime_access_mode=resolved_runtime_access_mode,
            runtime_session_binding=HARDWARE_RUNTIME_SESSION_BINDING,
        )
        approval_id = _text(approval.get("approval_id"))
        if approval_id:
            await agent_trace_service.emit_approval_requested(
                resolved_trace_context,
                approval_id=approval_id,
                kind="hardware_action",
                title=f"Approve {resolved_capability_id}",
                description=f"Approval required before running {resolved_capability_id} on the selected runtime.",
                blocking_item_id=None,
            )
        runtime_session = await _update_runtime_session(
            runtime_session,
            state="waiting_approval",
            audit_action="hardware_action.approval_requested",
            approvals=[approval],
            extra_metadata={
                "gateway_id": gateway_token,
                "device_id": device_token,
                "approval_id": approval_id,
                "runtime_access_mode": resolved_runtime_access_mode,
            },
        )
        await _emit_tool_result(
            resolved_trace_context,
            tool_call_id=tool_call_id,
            status="waiting_approval",
            summary=f"Waiting for approval to run {resolved_capability_id}.",
            capability_id=resolved_capability_id,
            arguments=args,
            runtime_session=runtime_session,
            runtime_target=canonical_target_id,
            request_id=resolved_request_id,
            action_id=_text(action_id),
            metadata={"gateway_id": gateway_token, "device_id": device_token, "approval_id": approval_id},
        )
        return {
            "status": "waiting_approval",
            "approval": approval,
            "runtime_session": runtime_session,
            "trace_id": resolved_trace_id,
        }

    try:
        execution = await gateway_execution_service.execute_tool_via_gateway(
            gateway_id=gateway_token,
            capability_id=resolved_capability_id,
            arguments=args,
            run_id=resolved_run_id,
            trace_id=resolved_trace_id,
            workspace_id=_text(workspace_id) or "default",
            timeout_seconds=int(timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=resolved_request_id,
        )
    except Exception as exc:
        message = str(exc)
        state = "offline" if "not currently connected" in message.lower() else "failed"
        runtime_session = await _update_runtime_session(
            runtime_session,
            state=state,
            audit_action="hardware_action.failed",
            reason=message,
            extra_metadata={"gateway_id": gateway_token, "device_id": device_token, "failure_reason": message},
        )
        await _emit_tool_result(
            resolved_trace_context,
            tool_call_id=tool_call_id,
            status=state,
            summary=message or "Hardware action failed.",
            capability_id=resolved_capability_id,
            arguments=args,
            runtime_session=runtime_session,
            runtime_target=canonical_target_id,
            request_id=resolved_request_id,
            action_id=_text(action_id),
            metadata={"gateway_id": gateway_token, "device_id": device_token, "failure_reason": message},
        )
        return {
            "status": state,
            "reason": message,
            "runtime_session": runtime_session,
            "trace_id": resolved_trace_id,
        }

    artifact_ids = _artifact_ids_from_execution(execution)
    await _emit_artifacts(
        resolved_trace_context,
        artifact_ids,
        resolved_capability_id,
        runtime_session=runtime_session,
    )
    summary = _execution_summary(resolved_capability_id, execution)
    runtime_session = await _update_runtime_session(
        runtime_session,
        state="ready",
        audit_action="hardware_action.completed",
        artifacts=artifact_ids,
        extra_metadata={
            "gateway_id": gateway_token,
            "device_id": device_token,
            "result_summary": summary,
            "execution_request_id": _text(execution.get("request_id")) or resolved_request_id,
        },
    )
    await _emit_tool_result(
        resolved_trace_context,
        tool_call_id=tool_call_id,
        status="completed",
        summary=summary,
        artifact_ids=artifact_ids,
        capability_id=resolved_capability_id,
        arguments=args,
        runtime_session=runtime_session,
        runtime_target=canonical_target_id,
        request_id=resolved_request_id,
        action_id=_text(action_id),
        metadata={"gateway_id": gateway_token, "device_id": device_token},
    )
    return {
        "status": "completed",
        "execution": execution,
        "runtime_session": runtime_session,
        "artifacts": artifact_ids,
        "trace_id": resolved_trace_id,
    }


async def stop_hardware_action(
    *,
    tenant_id: str,
    workspace_id: str,
    run_id: str,
    runtime_target: str = "user_device_gateway",
    gateway_id: Optional[str] = None,
    node_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    target_request_id: Optional[str] = None,
    request_id: Optional[str] = None,
    reason: Optional[str] = None,
    session_id: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    target_ids = _runtime_target_ids(runtime_target)
    canonical_target_id = target_ids["canonical_runtime_target"]
    resolved_trace_id = _text(trace_id) or f"trace_{uuid.uuid4().hex}"
    resolved_request_id = _text(request_id) or _new_request_id()
    if canonical_target_id == "empyralis_cloud_computer":
        runtime_session_id = _text(session_id)
        if not runtime_session_id:
            return {
                "status": "degraded",
                "reason": "cloud_computer_session_id_required",
                "runtime_target": target_ids["runtime_target"],
                "canonical_runtime_target": canonical_target_id,
                "trace_id": resolved_trace_id,
            }
        try:
            runtime = get_cloud_computer_runtime_registry().resolve(
                virtual_computer_runtime.RUNTIME_CHOICE_VIRTUAL_BROWSER
            )
            terminated = await runtime.terminate_session(
                {
                    "tenant_id": _text(tenant_id) or "default",
                    "workspace_id": _text(workspace_id) or "default",
                    "session_id": runtime_session_id,
                    "runtime_session_id": runtime_session_id,
                    "browser_session_id": runtime_session_id,
                    "run_id": _text(run_id),
                    "trace_id": resolved_trace_id,
                    "request_id": resolved_request_id,
                    "manual_terminate": True,
                    "reason": _text(reason) or "operator_requested_stop",
                }
            )
        except Exception as exc:
            return {
                "status": "failed",
                "reason": str(exc),
                "trace_id": resolved_trace_id,
            }
        session_view = {
            "session_id": runtime_session_id,
            "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
            "state": "running",
            "runtime_target": target_ids["runtime_target"],
            "canonical_runtime_target": canonical_target_id,
            "runtime_fabric_target": canonical_target_id,
            "hardware_edge": _runtime_edge(canonical_target_id),
            "run_id": _text(run_id),
            "trace_id": resolved_trace_id,
            "request_id": resolved_request_id,
            "capability_id": "tool.interrupt",
            "action_id": "hardware.stop",
            "approvals": [],
            "artifacts": [],
            "audit_events": [],
            "billing": {},
        }
        session_view = await _update_runtime_session(
            session_view,
            state="terminated",
            audit_action="hardware_action.terminated",
            reason=_text(reason) or "operator_requested_stop",
            extra_metadata={"interrupt_request_id": resolved_request_id},
        )
        return {
            "status": "terminated",
            "execution": terminated,
            "runtime_session": session_view,
            "trace_id": resolved_trace_id,
        }
    if canonical_target_id == "self_hosted_node":
        attachment, unavailable_reason = await _select_self_hosted_attachment(
            tenant_id=_text(tenant_id) or "default",
            workspace_id=_text(workspace_id) or "default",
            node_id=node_id,
            capability_id="tool.interrupt",
        )
        if unavailable_reason:
            return {
                "status": "offline" if unavailable_reason == "self_hosted_node_offline" else "degraded",
                "reason": unavailable_reason,
                "runtime_target": target_ids["runtime_target"],
                "canonical_runtime_target": canonical_target_id,
                "trace_id": resolved_trace_id,
            }
        attachment = dict(attachment or {})
        runtime_node_id = _text(attachment.get("runtime_node_id") or attachment.get("runtime_id"))
        runtime_profile_id = _text(attachment.get("runtime_profile_id"))
        command_payload = {
            "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
            "runtime_session_id": _text(session_id) or None,
            "runtime_target": "self_hosted_node",
            "runtime_node_id": runtime_node_id,
            "runtime_profile_id": runtime_profile_id,
            "run_id": _text(run_id),
            "trace_id": resolved_trace_id,
            "request_id": resolved_request_id,
            "target_request_id": _text(target_request_id) or None,
            "reason": _text(reason) or "operator_requested_stop",
        }
        try:
            enqueued = await agent_registry_repository.enqueue_self_hosted_runtime_command(
                runtime_profile_id=runtime_profile_id,
                tenant_id=_text(tenant_id) or "default",
                workspace_id=_text(workspace_id) or "default",
                runtime_node_id=runtime_node_id,
                agent_id="sage",
                command_type="cancel_runtime_action",
                command_payload=command_payload,
                requested_by_user_id=None,
                ttl_seconds=agent_registry_repository.SELF_HOSTED_NODE_COMMAND_DEFAULT_TTL_SECONDS,
            )
        except Exception as exc:
            return {
                "status": "failed",
                "reason": str(exc),
                "trace_id": resolved_trace_id,
            }
        session_view = None
        if _text(session_id):
            command = _dict(enqueued.get("command"))
            session_view = {
                "session_id": _text(session_id),
                "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
                "state": "running",
                "runtime_target": target_ids["runtime_target"],
                "canonical_runtime_target": canonical_target_id,
                "runtime_fabric_target": canonical_target_id,
                "hardware_edge": _runtime_edge(canonical_target_id),
                "runtime_node_id": runtime_node_id,
                "runtime_profile_id": runtime_profile_id,
                "self_hosted_command_id": _text(command.get("id")),
                "run_id": _text(run_id),
                "trace_id": resolved_trace_id,
                "request_id": resolved_request_id,
                "capability_id": "tool.interrupt",
                "action_id": "hardware.stop",
                "approvals": [],
                "artifacts": [],
                "audit_events": [],
                "billing": {},
            }
            session_view = await _update_runtime_session(
                session_view,
                state="terminated",
                audit_action="hardware_action.terminated",
                reason=_text(reason) or "operator_requested_stop",
                extra_metadata={"interrupt_request_id": resolved_request_id},
            )
        return {
            "status": "terminated",
            "execution": enqueued,
            "runtime_session": session_view,
            "trace_id": resolved_trace_id,
        }
    if canonical_target_id != "user_device_gateway":
        return {
            "status": "degraded",
            "reason": "stop_adapter_not_configured",
            "runtime_target": target_ids["runtime_target"],
            "canonical_runtime_target": canonical_target_id,
            "trace_id": resolved_trace_id,
        }
    registration = _find_gateway_registration(
        gateway_id=gateway_id,
        workspace_id=_text(workspace_id) or "default",
    )
    usable, unusable_reason = _registration_is_usable(
        registration,
        workspace_id=_text(workspace_id) or "default",
    )
    if not usable:
        return {
            "status": "offline",
            "reason": unusable_reason,
            "trace_id": resolved_trace_id,
        }
    gateway_token = _text((registration or {}).get("gateway_id"))
    if not gateway_protocol_service.gateway_connection_is_live(gateway_token):
        return {
            "status": "offline",
            "reason": "gateway_offline",
            "trace_id": resolved_trace_id,
        }
    try:
        interrupted = await gateway_execution_service.interrupt_tool_via_gateway(
            gateway_id=gateway_token,
            run_id=_text(run_id),
            trace_id=resolved_trace_id,
            workspace_id=_text(workspace_id) or "default",
            target_request_id=_text(target_request_id) or None,
            reason=_text(reason) or "operator_requested_stop",
            timeout_seconds=int(timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=resolved_request_id,
        )
    except Exception as exc:
        return {
            "status": "failed",
            "reason": str(exc),
            "trace_id": resolved_trace_id,
        }
    if _text(session_id):
        session_view = {
            "session_id": _text(session_id),
            "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
            "state": "running",
            "runtime_target": target_ids["runtime_target"],
            "canonical_runtime_target": canonical_target_id,
            "runtime_fabric_target": canonical_target_id,
            "hardware_edge": _runtime_edge(canonical_target_id),
            "gateway_id": gateway_token,
            "run_id": _text(run_id),
            "trace_id": resolved_trace_id,
            "request_id": resolved_request_id,
            "capability_id": "tool.interrupt",
            "action_id": "hardware.stop",
            "approvals": [],
            "artifacts": [],
            "audit_events": [],
            "billing": {},
        }
        session_view = await _update_runtime_session(
            session_view,
            state="terminated",
            audit_action="hardware_action.terminated",
            reason=_text(reason) or "operator_requested_stop",
            extra_metadata={"gateway_id": gateway_token, "interrupt_request_id": resolved_request_id},
        )
    else:
        session_view = None
    return {
        "status": "terminated",
        "execution": interrupted,
        "runtime_session": session_view,
        "trace_id": resolved_trace_id,
    }
