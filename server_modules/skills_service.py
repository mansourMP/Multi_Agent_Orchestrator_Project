from __future__ import annotations

from dataclasses import dataclass, field
import json
import re
from typing import Any, Dict, List
from uuid import uuid4

from server_modules.capability_registry import resolve_capability


@dataclass(slots=True)
class CapabilityDescriptor:
    capability_id: str
    label: str
    risk_level: str = "medium"
    requires_approval: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SkillDescriptor:
    skill_id: str
    label: str
    capabilities: List[CapabilityDescriptor] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ToolDescriptor:
    tool_name: str
    label: str
    connector_id: str
    action_id: str
    description: str
    capability_id: str = ""
    risk_level: str = "medium"
    requires_approval: bool = False
    parameters: Dict[str, Any] = field(default_factory=dict)
    requires_runtime: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


def _normalize_action_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    normalized: List[str] = []
    seen = set()
    for item in value:
        token = str(item or "").strip()
        if not token or token in seen:
            continue
        seen.add(token)
        normalized.append(token)
    return normalized


def _normalize_capability_id(value: Any) -> str:
    token = re.sub(r"[^a-z0-9_. -]+", " ", str(value or "").strip().lower())
    return re.sub(r"\s+", "_", token).strip("_")


def capability_descriptor_from_payload(item: Any) -> CapabilityDescriptor | None:
    if not isinstance(item, dict):
        return None
    capability_id = _normalize_capability_id(
        item.get("id") or item.get("capability_id") or item.get("label")
    )
    if not capability_id:
        return None
    approval_actions = _normalize_action_list(item.get("approval_required_actions"))
    connected = bool(item.get("connected"))
    authenticated = item.get("authenticated") if isinstance(item.get("authenticated"), bool) else None
    runtime_usable = item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None
    contract = resolve_capability(capability_id)
    return CapabilityDescriptor(
        capability_id=capability_id,
        label=str(item.get("label") or capability_id).strip() or capability_id,
        risk_level=(contract.risk_level if contract is not None else "medium"),
        requires_approval=bool(approval_actions) or bool(contract and contract.requires_approval),
        metadata={
            "connected": connected,
            "authenticated": authenticated,
            "runtime_usable": runtime_usable,
            "read_actions": _normalize_action_list(item.get("read_actions")),
            "write_actions": _normalize_action_list(item.get("write_actions")),
            "approval_required_actions": approval_actions,
        },
    )


def capability_payload_from_descriptor(descriptor: CapabilityDescriptor) -> Dict[str, Any]:
    metadata = descriptor.metadata if isinstance(descriptor.metadata, dict) else {}
    return {
        "id": descriptor.capability_id,
        "label": str(descriptor.label or descriptor.capability_id).strip() or descriptor.capability_id,
        "risk_level": str(descriptor.risk_level or "medium").strip() or "medium",
        "requires_approval": bool(descriptor.requires_approval),
        "connected": bool(metadata.get("connected")),
        "authenticated": metadata.get("authenticated") if isinstance(metadata.get("authenticated"), bool) else None,
        "runtime_usable": metadata.get("runtime_usable") if isinstance(metadata.get("runtime_usable"), bool) else None,
        "read_actions": _normalize_action_list(metadata.get("read_actions")),
        "write_actions": _normalize_action_list(metadata.get("write_actions")),
        "approval_required_actions": _normalize_action_list(metadata.get("approval_required_actions")),
    }


def normalize_capability_payloads(items: Any) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for item in items:
        descriptor = capability_descriptor_from_payload(item)
        if descriptor is None:
            continue
        normalized.append(capability_payload_from_descriptor(descriptor))
    return normalized


def normalize_availability_capability_payloads(availability: Any) -> List[Dict[str, Any]]:
    items = availability.get("tool_capabilities") if isinstance(availability, dict) else []
    return normalize_capability_payloads(items)


def availability_capability(availability: Any, capability_id: str) -> Dict[str, Any] | None:
    token = str(capability_id or "").strip().lower()
    if not token:
        return None
    for item in normalize_availability_capability_payloads(availability):
        if str(item.get("id") or "").strip().lower() == token:
            return item
    return None


def availability_capability_connected(availability: Any, capability_id: str) -> bool:
    item = availability_capability(availability, capability_id)
    return bool(item and item.get("connected"))


def availability_capability_runtime_usable(availability: Any, capability_id: str) -> bool | None:
    item = availability_capability(availability, capability_id)
    return capability_payload_runtime_usable(item)


def capability_payload_connected(item: Any) -> bool:
    return bool(isinstance(item, dict) and item.get("connected"))


def capability_payload_runtime_usable(item: Any) -> bool | None:
    if not isinstance(item, dict):
        return None
    return item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None


def capability_payload_write_actions(item: Any) -> List[str]:
    if not isinstance(item, dict):
        return []
    return _normalize_action_list(item.get("write_actions"))


def capability_payload_approval_required_actions(item: Any) -> List[str]:
    if not isinstance(item, dict):
        return []
    return _normalize_action_list(item.get("approval_required_actions"))


def capability_payload_supports_write_action(item: Any, action_id: str) -> bool:
    normalized_action_id = str(action_id or "").strip()
    if not normalized_action_id:
        return False
    return normalized_action_id in set(capability_payload_write_actions(item))


def capability_payload_requires_approval_for_action(item: Any, action_id: str) -> bool:
    normalized_action_id = str(action_id or "").strip()
    if not normalized_action_id:
        return False
    return normalized_action_id in set(capability_payload_approval_required_actions(item))


def availability_capability_write_actions(availability: Any, capability_id: str) -> List[str]:
    item = availability_capability(availability, capability_id)
    return capability_payload_write_actions(item)


def availability_capability_approval_required_actions(availability: Any, capability_id: str) -> List[str]:
    item = availability_capability(availability, capability_id)
    return capability_payload_approval_required_actions(item)


def availability_capability_supports_write_action(availability: Any, capability_id: str, action_id: str) -> bool:
    item = availability_capability(availability, capability_id)
    return capability_payload_connected(item) and capability_payload_supports_write_action(item, action_id)


def availability_capability_requires_approval_for_action(availability: Any, capability_id: str, action_id: str) -> bool:
    item = availability_capability(availability, capability_id)
    return capability_payload_requires_approval_for_action(item, action_id)


def connected_availability_capabilities(availability: Any) -> List[Dict[str, Any]]:
    return [
        item
        for item in normalize_availability_capability_payloads(availability)
        if item.get("connected")
    ]


def connected_availability_labels(availability: Any) -> List[str]:
    return [str(item.get("label") or "").strip() for item in connected_availability_capabilities(availability)]


def unavailable_connected_availability_labels(availability: Any) -> List[str]:
    return [
        str(item.get("label") or "").strip()
        for item in connected_availability_capabilities(availability)
        if item.get("runtime_usable") is False
    ]


def unverified_connected_availability_labels(availability: Any) -> List[str]:
    return [
        str(item.get("label") or "").strip()
        for item in connected_availability_capabilities(availability)
        if item.get("runtime_usable") is None
    ]


def context_availability_capabilities(
    availability: Any,
    *,
    max_context_tool_actions: int,
    max_context_tool_capabilities: int,
) -> List[Dict[str, Any]]:
    trimmed: List[Dict[str, Any]] = []
    for item in connected_availability_capabilities(availability):
        trimmed.append(
            {
                "id": item.get("id"),
                "label": item.get("label"),
                "connected": True,
                "authenticated": item.get("authenticated") if isinstance(item.get("authenticated"), bool) else None,
                "runtime_usable": item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None,
                "read_actions": (item.get("read_actions") or [])[:max_context_tool_actions],
                "write_actions": (item.get("write_actions") or [])[:max_context_tool_actions],
                "approval_required_actions": (item.get("approval_required_actions") or [])[:max_context_tool_actions],
            }
        )
        if len(trimmed) >= max_context_tool_capabilities:
            break
    return trimmed


def availability_label_summary(availability: Any) -> Dict[str, List[str]]:
    connected_labels = connected_availability_labels(availability)
    unavailable_labels = unavailable_connected_availability_labels(availability)
    unverified_labels = unverified_connected_availability_labels(availability)
    usable_labels = [
        str(item.get("label") or "").strip()
        for item in connected_availability_capabilities(availability)
        if item.get("runtime_usable") is True
    ]
    return {
        "connected": connected_labels,
        "usable": usable_labels,
        "unavailable": unavailable_labels,
        "unverified": unverified_labels,
    }


def resolve_workspace_capability_payloads(
    workspace_id: str,
    *,
    resolve_workspace_tool_capabilities_fn: Any,
) -> List[Dict[str, Any]]:
    raw_items = resolve_workspace_tool_capabilities_fn(str(workspace_id or "default").strip() or "default")
    if not isinstance(raw_items, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        descriptor = capability_descriptor_from_payload(item)
        if descriptor is None:
            continue
        payload = dict(item)
        payload["id"] = descriptor.capability_id
        if "label" in payload or descriptor.label != descriptor.capability_id:
            payload["label"] = descriptor.label
        if "read_actions" in payload:
            payload["read_actions"] = _normalize_action_list(payload.get("read_actions"))
        if "write_actions" in payload:
            payload["write_actions"] = _normalize_action_list(payload.get("write_actions"))
        if "approval_required_actions" in payload:
            payload["approval_required_actions"] = _normalize_action_list(payload.get("approval_required_actions"))
        normalized.append(payload)
    return normalized


def _tool_payload_from_descriptor(descriptor: ToolDescriptor) -> Dict[str, Any]:
    contract = resolve_capability(descriptor.capability_id)
    return {
        "name": descriptor.tool_name,
        "description": descriptor.description,
        "capability_id": descriptor.capability_id or None,
        "risk_level": (contract.risk_level if contract is not None else str(descriptor.risk_level or "medium").strip() or "medium"),
        "requires_approval": bool(contract.requires_approval) if contract is not None else bool(descriptor.requires_approval),
        "parameters": descriptor.parameters if isinstance(descriptor.parameters, dict) else {},
    }


def _local_tool_descriptors() -> List[ToolDescriptor]:
    return [
        ToolDescriptor(
            tool_name="file__read",
            label="Local file read",
            connector_id="file",
            action_id="read",
            description="Read a file from the local machine",
            capability_id="filesystem.read",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"path": {"type": "string", "description": "File path to read"}}, "required": ["path"]},
        ),
        ToolDescriptor(
            tool_name="file__write",
            label="Local file write",
            connector_id="file",
            action_id="write",
            description="Write content to a file on the local machine",
            capability_id="filesystem.write",
            requires_runtime=True,
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"},
                    "content": {"type": "string", "description": "Content to write"},
                },
                "required": ["path", "content"],
            },
        ),
        ToolDescriptor(
            tool_name="shell__exec",
            label="Local shell exec",
            connector_id="shell",
            action_id="exec",
            description="Execute a shell command on the local machine",
            capability_id="shell.execute",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"command": {"type": "string", "description": "Shell command to run"}}, "required": ["command"]},
        ),
        ToolDescriptor(
            tool_name="screenshot__capture",
            label="Local screenshot",
            connector_id="screenshot",
            action_id="capture",
            description="Take a screenshot of the current screen",
            capability_id="screenshot.capture",
            requires_runtime=True,
            parameters={"type": "object", "properties": {}},
        ),
        ToolDescriptor(
            tool_name="computer__ocr",
            label="Computer OCR",
            connector_id="computer",
            action_id="ocr",
            description="Read visible text from the screen using OCR",
            capability_id="computer_control.ocr",
            requires_runtime=True,
            parameters={
                "type": "object",
                "properties": {
                    "region": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "integer"},
                            "y": {"type": "integer"},
                            "width": {"type": "integer"},
                            "height": {"type": "integer"},
                        },
                    },
                },
            },
        ),
        ToolDescriptor(
            tool_name="computer__click",
            label="Computer click",
            connector_id="computer",
            action_id="click",
            description="Click on the screen by coordinates or visible text",
            capability_id="computer_control.click",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}, "text": {"type": "string"}}},
        ),
        ToolDescriptor(
            tool_name="computer__type",
            label="Computer type",
            connector_id="computer",
            action_id="type",
            description="Type text into the active application",
            capability_id="computer_control.type",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
        ),
        ToolDescriptor(
            tool_name="computer__applescript",
            label="Computer AppleScript",
            connector_id="computer",
            action_id="applescript",
            description="Run AppleScript on macOS",
            capability_id="computer_control.applescript",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"script": {"type": "string"}}, "required": ["script"]},
        ),
        ToolDescriptor(
            tool_name="computer__clipboard_read",
            label="Computer clipboard read",
            connector_id="computer",
            action_id="clipboard_read",
            description="Read the current system clipboard",
            capability_id="computer_control.clipboard_read",
            requires_runtime=True,
            parameters={"type": "object", "properties": {}},
        ),
        ToolDescriptor(
            tool_name="computer__clipboard_write",
            label="Computer clipboard write",
            connector_id="computer",
            action_id="clipboard_write",
            description="Write text to the system clipboard",
            capability_id="computer_control.clipboard_write",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
        ),
        ToolDescriptor(
            tool_name="computer__notify",
            label="Computer notify",
            connector_id="computer",
            action_id="notify",
            description="Send a system notification",
            capability_id="computer_control.notify",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"title": {"type": "string"}, "message": {"type": "string"}}, "required": ["title", "message"]},
        ),
        ToolDescriptor(
            tool_name="computer__list_apps",
            label="Computer list apps",
            connector_id="computer",
            action_id="list_apps",
            description="List running applications and processes",
            capability_id="computer_control.list_apps",
            requires_runtime=True,
            parameters={"type": "object", "properties": {}},
        ),
        ToolDescriptor(
            tool_name="computer__launch_app",
            label="Computer launch app",
            connector_id="computer",
            action_id="launch_app",
            description="Launch an application by name or path",
            capability_id="computer_control.launch_app",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"name_or_path": {"type": "string"}}, "required": ["name_or_path"]},
        ),
        ToolDescriptor(
            tool_name="computer__speak",
            label="Computer speak",
            connector_id="computer",
            action_id="speak",
            description="Speak text aloud using the local system voice",
            capability_id="computer_control.speak",
            requires_runtime=True,
            parameters={"type": "object", "properties": {"text": {"type": "string"}, "voice": {"type": "string"}}, "required": ["text"]},
        ),
    ]


def _builtin_tool_descriptors() -> List[ToolDescriptor]:
    return [
        ToolDescriptor(
            tool_name="memory_search",
            label="Memory search",
            connector_id="memory",
            action_id="search",
            description=(
                "Mandatory recall step before answering about prior work, decisions, dates, people, "
                "preferences, or todos. Search MEMORY.md and memory/*.md and return matching snippets "
                "with paths and line numbers."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The memory query to search for."},
                    "max_results": {"type": "integer", "description": "Optional maximum number of snippets to return."},
                },
                "required": ["query"],
            },
        ),
        ToolDescriptor(
            tool_name="memory_get",
            label="Memory get",
            connector_id="memory",
            action_id="get",
            description="Read a small excerpt from MEMORY.md or memory/*.md after memory_search identifies the file and lines.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative notebook path such as MEMORY.md or memory/2026-04-02.md."},
                    "from": {"type": "integer", "description": "Starting line number (1-based)."},
                    "lines": {"type": "integer", "description": "Maximum number of lines to read."},
                },
                "required": ["path"],
            },
        ),
        ToolDescriptor(
            tool_name="web__search",
            label="Web search",
            connector_id="web",
            action_id="search",
            description="Search the web and return the top 5 results with titles, URLs, and snippets.",
            parameters={"type": "object", "properties": {"query": {"type": "string", "description": "The search query to run."}}, "required": ["query"]},
        ),
        ToolDescriptor(
            tool_name="web__fetch",
            label="Web fetch",
            connector_id="web",
            action_id="fetch",
            description="Fetch a webpage and extract readable text from it.",
            parameters={"type": "object", "properties": {"url": {"type": "string", "description": "The URL to fetch."}}, "required": ["url"]},
        ),
        ToolDescriptor(
            tool_name="llm__task",
            label="LLM task",
            connector_id="llm",
            action_id="task",
            description="Run a focused sub-task with no tools. Optionally require JSON output with a schema.",
            parameters={
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "The sub-task prompt."},
                    "schema": {"type": "object", "description": "Optional JSON schema for the required output."},
                },
                "required": ["prompt"],
            },
        ),
        ToolDescriptor(
            tool_name="http_request",
            label="HTTP request",
            connector_id="http",
            action_id="request",
            description="Make a generic HTTP request and return status, headers, and body.",
            parameters={
                "type": "object",
                "properties": {
                    "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]},
                    "url": {"type": "string", "description": "The target URL."},
                    "headers": {"type": "object", "description": "Optional request headers."},
                    "body": {"description": "Optional request body as a string or JSON object."},
                    "params": {"type": "object", "description": "Optional query parameters."},
                    "timeout": {"type": "integer", "description": "Timeout in seconds."},
                    "auth_type": {"type": "string", "enum": ["none", "bearer", "basic"]},
                    "auth_value": {"type": "string", "description": "Token or user:pass credentials."},
                },
                "required": ["method", "url"],
            },
        ),
        ToolDescriptor(
            tool_name="generate_image",
            label="Generate image",
            connector_id="image",
            action_id="generate",
            description="Generate one or more images from a prompt and save them locally.",
            parameters={
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "The image prompt."},
                    "model": {"type": "string", "enum": ["dall-e-3", "dall-e-2", "stable-diffusion"]},
                    "size": {"type": "string", "enum": ["256x256", "512x512", "1024x1024"]},
                    "quality": {"type": "string", "enum": ["standard", "hd"]},
                    "n": {"type": "integer", "minimum": 1, "maximum": 4},
                    "save_to": {"type": "string", "description": "Optional local output path or directory."},
                },
                "required": ["prompt"],
            },
        ),
        ToolDescriptor("browser__navigate", "Browser navigate", "browser", "navigate", "Open a URL in the backend browser engine.", {"type": "object", "properties": {"url": {"type": "string", "description": "The URL to open."}}, "required": ["url"]}),
        ToolDescriptor("browser__screenshot", "Browser screenshot", "browser", "screenshot", "Capture a screenshot from the backend browser engine.", {"type": "object", "properties": {"selector": {"type": "string", "description": "Optional CSS/XPath/text selector."}}}),
        ToolDescriptor("browser__observe", "Browser observe", "browser", "observe", "Return the current browser page state plus a screenshot for vision-style reasoning.", {"type": "object", "properties": {}}),
        ToolDescriptor("browser__click", "Browser click", "browser", "click", "Click an element in the backend browser engine.", {"type": "object", "properties": {"selector": {"type": "string", "description": "CSS, XPath, or visible text selector."}}, "required": ["selector"]}),
        ToolDescriptor("browser__fill", "Browser fill", "browser", "fill", "Fill an input in the backend browser engine.", {"type": "object", "properties": {"selector": {"type": "string"}, "value": {"type": "string"}}, "required": ["selector", "value"]}),
        ToolDescriptor("browser__extract_text", "Browser extract text", "browser", "extract_text", "Extract readable text from the current page or a selected element.", {"type": "object", "properties": {"selector": {"type": "string"}}}),
        ToolDescriptor("browser__get_page_state", "Browser get page state", "browser", "get_page_state", "Return the current page title, URL, text preview, and interactive elements.", {"type": "object", "properties": {}}),
        ToolDescriptor("browser__execute_js", "Browser execute js", "browser", "execute_js", "Execute JavaScript in the active browser tab.", {"type": "object", "properties": {"script": {"type": "string"}}, "required": ["script"]}),
        ToolDescriptor("browser__new_tab", "Browser new tab", "browser", "new_tab", "Open a new browser tab.", {"type": "object", "properties": {"url": {"type": "string"}}}),
        ToolDescriptor("browser__switch_tab", "Browser switch tab", "browser", "switch_tab", "Switch to another browser tab.", {"type": "object", "properties": {"tab_id": {"type": "integer"}}, "required": ["tab_id"]}),
        ToolDescriptor("browser__download_file", "Browser download file", "browser", "download_file", "Download a file through the backend browser engine.", {"type": "object", "properties": {"url": {"type": "string"}, "save_path": {"type": "string"}}, "required": ["url"]}),
        ToolDescriptor("browser__start_intercept", "Browser start intercept", "browser", "start_intercept", "Start capturing browser network responses matching a URL pattern.", {"type": "object", "properties": {"url_pattern": {"type": "string"}}}),
        ToolDescriptor("browser__stop_intercept", "Browser stop intercept", "browser", "stop_intercept", "Stop browser network interception and return the captured responses.", {"type": "object", "properties": {}}),
        ToolDescriptor("browser__pdf", "Browser pdf", "browser", "pdf", "Print the current browser page to PDF.", {"type": "object", "properties": {"output_path": {"type": "string"}}}),
    ]


def build_local_direct_chat_tools(
    availability: Dict[str, Any],
    *,
    local_worker_available: Any,
) -> List[Dict[str, Any]]:
    if not local_worker_available(availability):
        return []
    return [_tool_payload_from_descriptor(item) for item in _local_tool_descriptors()]


def build_direct_chat_tools(tool_capabilities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for cap in tool_capabilities:
        if not isinstance(cap, dict):
            continue
        if capability_payload_runtime_usable(cap) is not True:
            continue
        connector_id = str(cap.get("id") or "").strip().lower()
        label = str(cap.get("label") or connector_id).strip() or connector_id
        if not connector_id:
            continue
        for action in capability_payload_write_actions(cap):
            tool_name = tool_name_for_action(connector_id, action)
            if not tool_name or tool_name in seen:
                continue
            seen.add(tool_name)
            tools.append(
                {
                    "name": tool_name,
                    "description": f"Execute {action} on {label}",
                    "parameters": {
                        "type": "object",
                        "properties": {"input": {"type": "string", "description": "The input for this action"}},
                        "required": ["input"],
                    },
                }
            )
    return tools


def build_builtin_direct_chat_tools() -> List[Dict[str, Any]]:
    return [_tool_payload_from_descriptor(item) for item in _builtin_tool_descriptors()]


def registered_direct_chat_tool_names_for_logging() -> List[str]:
    tool_names = {
        str(item.get("name") or "").strip()
        for item in (
            build_builtin_direct_chat_tools()
            + build_local_direct_chat_tools({"runtime_ok": True}, local_worker_available=lambda availability: True)
        )
        if isinstance(item, dict) and str(item.get("name") or "").strip()
    }
    return sorted(tool_names)


def extract_first_email(text: str) -> str:
    match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", str(text or ""), flags=re.IGNORECASE)
    return match.group(0).strip() if match else ""


def extract_subject_text(text: str) -> str:
    raw = str(text or "").strip()
    for pattern in (
        r"subject\s*[:=]\s*([^\n]+)",
        r"subject\s+(.+?)(?:(?:\s+(?:body|message|content)\s*:?)|$)",
    ):
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip(" \"'")
    return ""


def extract_body_text(text: str) -> str:
    raw = str(text or "").strip()
    for pattern in (r"(?:body|message|content|saying)\s*[:=]?\s+(.+)$",):
        match = re.search(pattern, raw, flags=re.IGNORECASE | re.DOTALL)
        if match:
            body = str(match.group(1) or "").strip()
            if body:
                return body
    return raw


def first_non_empty_line(text: str) -> str:
    for line in str(text or "").splitlines():
        token = line.strip()
        if token:
            return token
    return ""


def _approval_path_tool_descriptors() -> List[ToolDescriptor]:
    return _local_tool_descriptors() + [
        descriptor
        for descriptor in _builtin_tool_descriptors()
        if descriptor.tool_name == "http_request"
    ]


def tool_descriptor_for_action(
    connector_id: str,
    action_id: str,
    *,
    include_builtin: bool = True,
) -> ToolDescriptor | None:
    tool_name = tool_name_for_action(connector_id, action_id)
    if not tool_name:
        return None
    descriptor_sets: List[ToolDescriptor] = list(_local_tool_descriptors())
    if include_builtin:
        descriptor_sets.extend(_builtin_tool_descriptors())
    for descriptor in descriptor_sets:
        if descriptor.tool_name == tool_name:
            return descriptor
    return None


def approval_path_tool_descriptor_for_action(
    connector_id: str,
    action_id: str,
) -> ToolDescriptor | None:
    tool_name = tool_name_for_action(connector_id, action_id)
    if not tool_name:
        return None
    for descriptor in _approval_path_tool_descriptors():
        if descriptor.tool_name == tool_name:
            return descriptor
    return None


def tool_name_for_action(connector_id: str, action_id: str) -> str:
    normalized_connector_id = str(connector_id or "").strip().lower()
    normalized_action_id = str(action_id or "").strip()
    if normalized_connector_id == "http" and normalized_action_id == "request":
        return "http_request"
    if not normalized_connector_id or not normalized_action_id:
        return ""
    return f"{normalized_connector_id}__{normalized_action_id}"


def capability_action_metadata(
    tool_capabilities: List[Dict[str, Any]],
    connector_id: str,
    action_id: str,
) -> Dict[str, Any]:
    availability = {"tool_capabilities": tool_capabilities}
    normalized_connector_id = str(connector_id or "").strip().lower()
    normalized_action_id = str(action_id or "").strip()
    item = availability_capability(availability, normalized_connector_id)
    return {
        "capability": dict(item) if isinstance(item, dict) else None,
        "connected": capability_payload_connected(item),
        "runtime_usable": capability_payload_runtime_usable(item),
        "supports_write_action": availability_capability_supports_write_action(
            availability,
            normalized_connector_id,
            normalized_action_id,
        ),
        "requires_approval": availability_capability_requires_approval_for_action(
            availability,
            normalized_connector_id,
            normalized_action_id,
        ),
    }


def tool_write_action_available(
    connector_id: str,
    action_id: str,
    tool_capabilities: List[Dict[str, Any]],
) -> bool:
    normalized_connector_id = str(connector_id or "").strip().lower()
    normalized_action_id = str(action_id or "").strip()
    tool_name = tool_name_for_action(normalized_connector_id, normalized_action_id)
    if tool_name and approval_path_tool_descriptor_for_action(normalized_connector_id, normalized_action_id):
        return True
    return capability_action_metadata(tool_capabilities, normalized_connector_id, normalized_action_id).get(
        "supports_write_action",
        False,
    )


def tool_action_requires_approval(
    connector_id: str,
    action_id: str,
    tool_capabilities: List[Dict[str, Any]],
) -> bool:
    return bool(
        capability_action_metadata(tool_capabilities, connector_id, action_id).get(
            "requires_approval",
            False,
        )
    )


def approved_action_to_tool_call(
    approved_action: Dict[str, str],
    *,
    parse_json_object_loose: Any,
) -> Dict[str, Any]:
    connector_id = str(approved_action.get("connector") or "").strip().lower()
    raw_input = str(approved_action.get("input") or "").strip()
    if approval_path_tool_descriptor_for_action(connector_id, approved_action.get("action") or ""):
        parsed_input = parse_json_object_loose(raw_input)
        arguments = (
            parsed_input
            if isinstance(parsed_input, dict)
            else ({} if connector_id == "screenshot" else {"input": raw_input})
        )
    else:
        arguments = {"input": raw_input}
    return {
        "name": tool_name_for_action(approved_action.get("connector") or "", approved_action.get("action") or ""),
        "arguments": json.dumps(arguments, ensure_ascii=False),
    }


def build_direct_tool_config(
    connector_id: str,
    action_id: str,
    tool_input: str,
    *,
    parse_json_object_loose: Any,
) -> Dict[str, Any]:
    config: Dict[str, Any] = {
        "connector": connector_id,
        "action_id": action_id,
    }
    parsed_input = parse_json_object_loose(tool_input) or {}

    if connector_id == "telegram_bot":
        for key in ("chat_id", "session_key"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        config["text"] = str(
            parsed_input.get("body")
            or parsed_input.get("message")
            or parsed_input.get("content")
            or tool_input
        ).strip()
        return config

    if connector_id == "slack":
        for key in ("channel", "channel_id", "user_id", "recipient_id", "thread_ts", "title", "file_path", "path"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        if action_id in {"send_message", "send_dm", "post_reply"}:
            config["text"] = str(
                parsed_input.get("body")
                or parsed_input.get("message")
                or parsed_input.get("content")
                or tool_input
            ).strip()
        if action_id in {"list_channels", "get_history"}:
            try:
                limit = int(parsed_input.get("limit") or 20)
            except Exception:
                limit = 20
            config["limit"] = max(1, min(limit, 200))
        return config

    if connector_id == "discord_bot":
        for key in ("channel_id", "guild_id", "user_id", "message_id", "emoji", "name", "title", "file_path", "path"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        files = parsed_input.get("files")
        if isinstance(files, list) and files:
            config["files"] = files
        embeds = parsed_input.get("embeds")
        if isinstance(embeds, list) and embeds:
            config["embeds"] = embeds
        if action_id in {"send_message", "send_dm", "edit_message", "send_embed"}:
            config["text"] = str(
                parsed_input.get("body")
                or parsed_input.get("message")
                or parsed_input.get("content")
                or tool_input
            ).strip()
        if action_id in {"list_guilds", "list_members", "get_message_history"}:
            try:
                limit = int(parsed_input.get("limit") or 20)
            except Exception:
                limit = 20
            config["limit"] = max(1, min(limit, 100))
        return config

    if connector_id == "smtp" and action_id in {"send_email", "send_message"}:
        to_email = str(
            parsed_input.get("to_email")
            or parsed_input.get("to")
            or parsed_input.get("email")
            or parsed_input.get("recipient")
            or extract_first_email(tool_input)
            or ""
        ).strip()
        subject = str(parsed_input.get("subject") or extract_subject_text(tool_input) or "").strip()
        body_text = str(
            parsed_input.get("body")
            or parsed_input.get("message")
            or parsed_input.get("content")
            or extract_body_text(tool_input)
            or ""
        ).strip()
        if to_email:
            config["to_email"] = to_email
        if subject:
            config["subject"] = subject
        if body_text:
            config["text"] = body_text
        return config

    if connector_id == "smtp" and action_id == "fetch_emails":
        folder = str(parsed_input.get("folder") or "INBOX").strip() or "INBOX"
        try:
            limit = int(parsed_input.get("limit") or 10)
        except Exception:
            limit = 10
        config["folder"] = folder
        config["limit"] = max(1, min(limit, 50))
        if parsed_input.get("unread_only") is not None:
            config["unread_only"] = bool(parsed_input.get("unread_only"))
        return config

    if connector_id == "google_workspace" and action_id in {"send_email", "send_message", "draft_email"}:
        to_email = str(
            parsed_input.get("to_email")
            or parsed_input.get("to")
            or parsed_input.get("email")
            or parsed_input.get("recipient")
            or extract_first_email(tool_input)
            or ""
        ).strip()
        subject = str(parsed_input.get("subject") or extract_subject_text(tool_input) or "").strip()
        body_text = str(
            parsed_input.get("body")
            or parsed_input.get("message")
            or parsed_input.get("content")
            or extract_body_text(tool_input)
            or ""
        ).strip()
        if to_email:
            config["to_email"] = to_email
        if subject:
            config["subject"] = subject
        if body_text:
            config["text"] = body_text
        return config

    if connector_id == "google_workspace" and action_id == "create_calendar_event":
        payload = parsed_input.get("payload") if isinstance(parsed_input.get("payload"), dict) else None
        if payload:
            config["payload"] = payload
        for key in ("title", "description", "start", "end", "timezone", "calendar_id"):
            value = parsed_input.get(key)
            if value is None:
                continue
            token = str(value).strip()
            if token:
                config[key] = token
        if "description" not in config and tool_input.strip():
            config["description"] = tool_input.strip()
        return config

    if connector_id == "google_workspace" and action_id in {"create_doc", "create_document", "create_sheet", "create_spreadsheet"}:
        title = str(
            parsed_input.get("title")
            or parsed_input.get("name")
            or first_non_empty_line(tool_input)
            or ""
        ).strip()
        if title:
            config["title"] = title[:180]
        return config

    if tool_input.strip():
        config["text"] = tool_input.strip()
    return config


def build_direct_local_tool_config(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    if connector_id == "file" and action_id == "read":
        path = str(arguments.get("path") or arguments.get("file_path") or "").strip()
        if not path:
            raise RuntimeError("Tool 'file__read' requires a file path.")
        return "file", {
            "path": path,
            "mode": "read",
            "summary": f"Read local file: {path}",
        }
    if connector_id == "file" and action_id == "write":
        path = str(arguments.get("path") or arguments.get("file_path") or "").strip()
        content = str(arguments.get("content") or "").strip()
        if not path or not content:
            raise RuntimeError("Tool 'file__write' requires path and content.")
        return "file", {
            "path": path,
            "content": content,
            "mode": "write",
            "summary": f"Write local file: {path}",
        }
    if connector_id == "shell" and action_id == "exec":
        command = str(arguments.get("command") or "").strip()
        if not command:
            raise RuntimeError("Tool 'shell__exec' requires a command.")
        return "shell", {
            "command": command,
            "summary": f"Execute shell command: {command}",
        }
    if connector_id == "screenshot" and action_id == "capture":
        return "screenshot", {
            "summary": "Capture screenshot of the current screen.",
        }
    if connector_id == "computer":
        if action_id == "ocr":
            return "computer", {
                "action": "ocr",
                "region": arguments.get("region"),
                "summary": "Read screen text with OCR.",
            }
        if action_id == "click":
            has_text = bool(str(arguments.get("text") or "").strip())
            has_coords = arguments.get("x") is not None and arguments.get("y") is not None
            if not has_text and not has_coords:
                raise RuntimeError("Tool 'computer__click' requires x/y or text.")
            return "computer", {
                "action": "click",
                "x": arguments.get("x"),
                "y": arguments.get("y"),
                "text": str(arguments.get("text") or "").strip() or None,
                "summary": "Click on the screen.",
            }
        if action_id == "type":
            text = str(arguments.get("text") or arguments.get("input") or "")
            if not text:
                raise RuntimeError("Tool 'computer__type' requires text.")
            return "computer", {
                "action": "type",
                "text": text,
                "summary": "Type into the active application.",
            }
        if action_id == "applescript":
            script = str(arguments.get("script") or arguments.get("input") or "").strip()
            if not script:
                raise RuntimeError("Tool 'computer__applescript' requires a script.")
            return "computer", {
                "action": "applescript",
                "script": script,
                "summary": "Run AppleScript.",
            }
        if action_id == "clipboard_read":
            return "computer", {
                "action": "clipboard_read",
                "summary": "Read the system clipboard.",
            }
        if action_id == "clipboard_write":
            text = str(arguments.get("text") or arguments.get("input") or "")
            if not text:
                raise RuntimeError("Tool 'computer__clipboard_write' requires text.")
            return "computer", {
                "action": "clipboard_write",
                "text": text,
                "summary": "Write to the system clipboard.",
            }
        if action_id == "notify":
            title = str(arguments.get("title") or "").strip()
            message = str(arguments.get("message") or arguments.get("text") or "").strip()
            if not title or not message:
                raise RuntimeError("Tool 'computer__notify' requires title and message.")
            return "computer", {
                "action": "notify",
                "title": title,
                "message": message,
                "summary": "Send a system notification.",
            }
        if action_id == "list_apps":
            return "computer", {
                "action": "list_apps",
                "summary": "List running applications.",
            }
        if action_id == "launch_app":
            name_or_path = str(arguments.get("name_or_path") or arguments.get("input") or "").strip()
            if not name_or_path:
                raise RuntimeError("Tool 'computer__launch_app' requires name_or_path.")
            return "computer", {
                "action": "launch_app",
                "name_or_path": name_or_path,
                "summary": f"Launch application: {name_or_path}",
            }
        if action_id == "speak":
            text = str(arguments.get("text") or arguments.get("input") or "").strip()
            if not text:
                raise RuntimeError("Tool 'computer__speak' requires text.")
            voice = str(arguments.get("voice") or "").strip()
            return "computer", {
                "action": "speak",
                "text": text,
                "voice": voice or None,
                "summary": "Speak text aloud.",
            }
    raise RuntimeError(f"Unsupported direct local tool '{connector_id}__{action_id}'.")


def _is_authorized_browser_adapter(browser: Any) -> bool:
    return bool(getattr(browser, "__empyralis_browser_adapter__", False))


def _resolve_direct_tool_browser_adapter(session_ctx: Any) -> Any:
    context = session_ctx if isinstance(session_ctx, dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    runtime_handle = context.get("runtime_handle")
    browser = getattr(runtime_handle, "browser", None)
    if browser is None:
        browser = context.get("browser")
    if not _is_authorized_browser_adapter(browser):
        from server_modules.execution_router import get_browser_adapter

        browser = get_browser_adapter(metadata, target="local_companion")
        if runtime_handle is not None:
            try:
                runtime_handle.browser = browser
            except Exception:
                pass
        if isinstance(context, dict):
            context["browser"] = browser
    return browser


def execute_single_direct_tool_call(
    *,
    tool_call: Dict[str, Any],
    workspace_id: str,
    thread_id: str,
    index: int = 1,
    provider: Any = None,
    model: Any = None,
    credentials: Dict[str, Any] | None = None,
    reasoning_effort: str = "",
    session_ctx: Dict[str, Any] | None = None,
    callbacks: Any,
) -> str:
    from server_modules.runs_execution import _workflow_execute_connector_action, _workflow_execute_local_tool
    from server_modules.tools_http import http_request as run_http_request
    from server_modules.tools_image_gen import generate_image as run_generate_image

    connector_id, action_id = callbacks.parse_tool_name(str(tool_call.get("name") or ""))
    argument_payload = callbacks.tool_arguments_payload(tool_call.get("arguments"))
    if connector_id == "http" and action_id == "request":
        response = callbacks.run_async_tool_call(
            run_http_request(
                method=argument_payload.get("method") or "GET",
                url=argument_payload.get("url") or "",
                headers=argument_payload.get("headers"),
                body=argument_payload.get("body"),
                params=argument_payload.get("params"),
                timeout=argument_payload.get("timeout") or 30,
                auth_type=argument_payload.get("auth_type"),
                auth_value=argument_payload.get("auth_value"),
            )
        )
        body_value = response.get("body")
        body_text = (
            json.dumps(body_value, ensure_ascii=False, indent=2)
            if isinstance(body_value, (dict, list))
            else str(body_value or "").strip()
        )
        lines = [f"HTTP {int(response.get('status_code') or 0)}"]
        if body_text:
            lines.extend(["", body_text])
        if bool(response.get("truncated")):
            lines.extend(["", "Response body was truncated at 100KB."])
        return "\n".join(lines).strip()
    if connector_id == "image" and action_id == "generate":
        saved_images = run_generate_image(
            prompt=argument_payload.get("prompt") or "",
            model=argument_payload.get("model") or "dall-e-3",
            size=argument_payload.get("size") or "1024x1024",
            quality=argument_payload.get("quality") or "standard",
            n=argument_payload.get("n") or 1,
            save_to=argument_payload.get("save_to"),
        )
        return "\n".join(
            [f"Generated {len(saved_images)} image(s):", *[f"{tool_index}. {path}" for tool_index, path in enumerate(saved_images, start=1)]]
        ).strip()
    if connector_id == "browser":
        browser = _resolve_direct_tool_browser_adapter(session_ctx)
        if action_id == "navigate":
            return json.dumps(browser.run_sync("navigate", argument_payload.get("url") or ""), ensure_ascii=False)
        if action_id == "screenshot":
            return str(browser.run_sync("screenshot", argument_payload.get("selector")))
        if action_id == "observe":
            return json.dumps(browser.run_sync("observe"), ensure_ascii=False)
        if action_id == "click":
            return json.dumps(browser.run_sync("click", argument_payload.get("selector") or ""), ensure_ascii=False)
        if action_id == "fill":
            return json.dumps(
                browser.run_sync(
                    "fill",
                    argument_payload.get("selector") or "",
                    argument_payload.get("value") or "",
                ),
                ensure_ascii=False,
            )
        if action_id == "extract_text":
            return str(browser.run_sync("extract_text", argument_payload.get("selector")))
        if action_id == "get_page_state":
            return json.dumps(browser.run_sync("get_page_state"), ensure_ascii=False)
        if action_id == "execute_js":
            return json.dumps(browser.run_sync("execute_js", argument_payload.get("script") or ""), ensure_ascii=False)
        if action_id == "new_tab":
            return str(browser.run_sync("new_tab", argument_payload.get("url")))
        if action_id == "switch_tab":
            browser.run_sync("switch_tab", argument_payload.get("tab_id") or 0)
            return "Switched browser tab."
        if action_id == "download_file":
            return str(browser.run_sync("download_file", argument_payload.get("url") or "", argument_payload.get("save_path")))
        if action_id == "start_intercept":
            browser.run_sync("start_intercept", argument_payload.get("url_pattern") or "*")
            return "Browser interception started."
        if action_id == "stop_intercept":
            return json.dumps(browser.run_sync("stop_intercept"), ensure_ascii=False)
        if action_id == "pdf":
            return str(browser.run_sync("save_pdf", argument_payload.get("output_path")))
        raise RuntimeError(f"Unsupported browser direct tool '{action_id}'.")
    if connector_id == "web" and action_id == "search":
        query = str(argument_payload.get("query") or argument_payload.get("input") or "").strip()
        results = callbacks.web_search(query)
        if not results:
            return f"No web search results found for '{query}'."
        return "\n\n".join(
            f"{result_index}. {result['title']}\nURL: {result['url']}\nSnippet: {result['snippet']}"
            for result_index, result in enumerate(results, start=1)
        )
    if connector_id == "web" and action_id == "fetch":
        url = str(argument_payload.get("url") or argument_payload.get("input") or "").strip()
        return callbacks.web_fetch(url)
    if connector_id == "llm" and action_id == "task":
        prompt = str(argument_payload.get("prompt") or argument_payload.get("input") or "").strip()
        schema = argument_payload.get("schema") if isinstance(argument_payload.get("schema"), dict) else None
        llm_task_metadata: Dict[str, Any] = {
            "provider": provider,
            "model": model,
            "source": "chat_direct_llm_task",
            "reasoning_effort": callbacks.normalize_reasoning_effort(reasoning_effort),
            "tools": [],
            "disable_provider_fallback": True,
        }
        if isinstance(credentials, dict) and credentials:
            llm_task_metadata["credentials"] = credentials
        result = callbacks.llm_task(
            prompt,
            schema=schema,
            context={
                "workspace_id": workspace_id,
                "provider": provider,
                "model": model,
                "source": "chat_direct_llm_task",
                "reasoning_effort": callbacks.normalize_reasoning_effort(reasoning_effort),
                "tools": [],
                "disable_provider_fallback": True,
            },
            metadata=llm_task_metadata,
        )
        if isinstance(result, (dict, list)):
            return json.dumps(result, ensure_ascii=False, indent=2)
        return str(result or "").strip()
    if connector_id == "memory" and action_id == "search":
        query = str(argument_payload.get("query") or argument_payload.get("input") or "").strip()
        if not query:
            raise RuntimeError("Tool 'memory_search' requires a query.")
        results = callbacks.search_memory_notebook(
            workspace_id,
            query,
            max_results=callbacks.safe_positive_int(argument_payload.get("max_results"), 5),
        )
        return json.dumps({"results": results}, ensure_ascii=False)
    if connector_id == "memory" and action_id == "get":
        rel_path = str(argument_payload.get("path") or argument_payload.get("input") or "").strip()
        if not rel_path:
            raise RuntimeError("Tool 'memory_get' requires a path.")
        excerpt = callbacks.get_memory_notebook_excerpt(
            workspace_id,
            rel_path,
            from_line=argument_payload.get("from"),
            line_count=argument_payload.get("lines"),
        )
        return json.dumps(excerpt, ensure_ascii=False)
    if connector_id in {"file", "shell", "screenshot", "computer"} and isinstance(argument_payload.get("input"), str):
        nested_input = callbacks.parse_json_object_loose(str(argument_payload.get("input") or ""))
        if isinstance(nested_input, dict):
            argument_payload = nested_input

    run_id = f"direct-chat-{uuid4().hex}"
    execution_context: Dict[str, Any] = {
        "workspace_id": workspace_id,
        "workflow_id": "direct_chat",
        "workflow_name": "Direct chat",
        "metadata": {
            "source": "chat_direct",
            "thread_id": thread_id or None,
            "execution_target": "local_companion",
            "execution_target_selected": "local_companion",
        },
    }

    if connector_id in {"file", "shell", "screenshot", "computer"}:
        variant, config = callbacks.build_direct_local_tool_config(connector_id, action_id, argument_payload)
        result = _workflow_execute_local_tool(
            run_id,
            execution_context,
            config,
            label=f"{connector_id}__{action_id}",
            variant=variant,
            current_text=str(argument_payload.get("content") or argument_payload.get("command") or "").strip(),
        )
        return callbacks.format_direct_local_tool_result(result)

    tool_input = str(argument_payload.get("input") or "").strip()
    if not tool_input:
        raise RuntimeError(f"Tool '{connector_id}__{action_id}' requires a non-empty input argument.")
    config = callbacks.build_direct_tool_config(connector_id, action_id, tool_input)
    result = _workflow_execute_connector_action(
        run_id,
        f"direct_chat_tool:{index}",
        execution_context,
        config,
        current_text=tool_input,
    )
    return callbacks.format_direct_tool_result(result)
