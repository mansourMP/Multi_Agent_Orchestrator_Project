from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4


@dataclass(frozen=True)
class DirectToolExecutionCallbacks:
    compact_step_detail: Callable[[Any], Optional[str]]
    titleize_direct_step_token: Callable[[str], str]
    run_async_tool_call: Callable[[Any], Any]
    parse_tool_name: Callable[[str], tuple[str, str]]
    tool_arguments_payload: Callable[[Any], Dict[str, Any]]
    parse_json_object_loose: Callable[[str], Any]
    safe_positive_int: Callable[[Any, int], int]
    normalize_reasoning_effort: Callable[[str], Optional[str]]
    build_direct_local_tool_config: Callable[[str, str, Dict[str, Any]], tuple[str, Dict[str, Any]]]
    format_direct_local_tool_result: Callable[[Any], str]
    build_direct_tool_config: Callable[[str, str, str], Dict[str, Any]]
    format_direct_tool_result: Callable[[Any], str]
    llm_task: Callable[..., Any]
    web_search: Callable[[str], List[Dict[str, Any]]]
    web_fetch: Callable[[str], str]
    search_memory_notebook: Callable[..., Any]
    get_memory_notebook_excerpt: Callable[..., Any]


def direct_tool_step_payload(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    *,
    step_id: str,
    status: str,
    detail_override: Optional[str] = None,
    callbacks: DirectToolExecutionCallbacks,
) -> Dict[str, Any]:
    normalized_connector = str(connector_id or "").strip().lower()
    normalized_action = str(action_id or "").strip().lower()
    label = "Running tool"
    kind = "connector"
    detail = callbacks.compact_step_detail(detail_override)

    if normalized_connector == "file" and normalized_action == "read":
        label = "Reading file"
        kind = "file"
        detail = detail or callbacks.compact_step_detail(arguments.get("path") or arguments.get("file_path"))
    elif normalized_connector == "file" and normalized_action == "write":
        label = "Writing file"
        kind = "file"
        detail = detail or callbacks.compact_step_detail(arguments.get("path") or arguments.get("file_path"))
    elif normalized_connector == "shell" and normalized_action == "exec":
        label = "Running command"
        kind = "shell"
        detail = detail or callbacks.compact_step_detail(arguments.get("command"))
    elif normalized_connector == "screenshot" and normalized_action == "capture":
        label = "Capturing screenshot"
        kind = "screenshot"
        detail = detail or callbacks.compact_step_detail(arguments.get("path") or arguments.get("file_path") or "Current screen")
    elif normalized_connector == "computer":
        kind = "computer"
        if normalized_action == "ocr":
            label = "Reading screen"
        elif normalized_action == "click":
            label = "Clicking screen"
            detail = detail or callbacks.compact_step_detail(arguments.get("text") or f"{arguments.get('x')}, {arguments.get('y')}")
        elif normalized_action == "type":
            label = "Typing text"
            detail = detail or callbacks.compact_step_detail(arguments.get("text"))
        elif normalized_action == "applescript":
            label = "Running AppleScript"
        elif normalized_action == "clipboard_read":
            label = "Reading clipboard"
        elif normalized_action == "clipboard_write":
            label = "Writing clipboard"
            detail = detail or callbacks.compact_step_detail(arguments.get("text"))
        elif normalized_action == "notify":
            label = "Sending notification"
            detail = detail or callbacks.compact_step_detail(arguments.get("title"))
        elif normalized_action == "list_apps":
            label = "Listing apps"
        elif normalized_action == "launch_app":
            label = "Launching app"
            detail = detail or callbacks.compact_step_detail(arguments.get("name_or_path"))
        elif normalized_action == "speak":
            label = "Speaking text"
            detail = detail or callbacks.compact_step_detail(arguments.get("text"))
        else:
            label = "Computer control"
    else:
        action_label = callbacks.titleize_direct_step_token(normalized_action) or "Connector action"
        connector_label = callbacks.titleize_direct_step_token(normalized_connector) or normalized_connector
        label = action_label
        kind = "connector"
        detail = detail or connector_label

    return {
        "type": "step",
        "id": step_id,
        "kind": kind,
        "label": label,
        "detail": detail,
        "status": status,
    }


def thinking_step_payload(iteration: int, status: str, detail: Optional[str] = None) -> Dict[str, Any]:
    return {
        "type": "step",
        "id": f"thinking:{iteration}",
        "kind": "thinking",
        "label": "Thinking",
        "detail": detail or ("Planning the response" if iteration <= 1 else "Planning the next step"),
        "status": status,
    }


def extract_first_url(value: str) -> str:
    match = re.search(r"https?://[^\s)>\]}]+", str(value or ""), flags=re.IGNORECASE)
    if match:
        return str(match.group(0) or "").rstrip(".,!?;:")
    bare_match = re.search(
        r"\b((?:[a-z0-9-]+\.)+[a-z]{2,}(?:/[^\s)>\]}]+)?)",
        str(value or ""),
        flags=re.IGNORECASE,
    )
    if not bare_match:
        return ""
    token = str(bare_match.group(1) or "").rstrip(".,!?;:")
    if "." not in token:
        return ""
    return f"https://{token}"


def extract_first_path_reference(value: str) -> str:
    matches = re.findall(
        r"(^|\s)(/|~/|\./|\.\./|[a-z]:[/\\])([^\s,;:]+)",
        str(value or ""),
        flags=re.IGNORECASE,
    )
    if not matches:
        bare_match = re.search(
            r"\b((?:[a-z0-9_.-]+/)+[a-z0-9_.-]+(?:\.[a-z0-9_.-]+)?)\b",
            str(value or ""),
            flags=re.IGNORECASE,
        )
        if not bare_match:
            return ""
        candidate = str(bare_match.group(1) or "").rstrip(".,!?;:")
        if "://" in candidate:
            return ""
        return candidate
    _prefix, root, remainder = matches[0]
    return f"{root}{remainder}".strip()


def resolve_chat_local_path(raw_path: str) -> Path:
    candidate = Path(str(raw_path or "").strip()).expanduser()
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return candidate


def direct_tool_followup_message(tool_name: str, result_text: str) -> str:
    cleaned_result = str(result_text or "").strip() or "No result."
    return (
        f"Tool result for {tool_name}:\n{cleaned_result}\n\n"
        "Continue until the task is complete. If another tool is needed, call it now. "
        "Otherwise provide the final answer to the user."
    )


def execute_single_direct_tool_call(
    *,
    tool_call: Dict[str, Any],
    workspace_id: str,
    thread_id: str,
    index: int = 1,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    reasoning_effort: str = "",
    session_ctx: Optional[Dict[str, Any]] = None,
    callbacks: DirectToolExecutionCallbacks,
) -> str:
    from server_modules.runs_execution import _workflow_execute_connector_action, _workflow_execute_local_tool
    from server_modules.tools_http import http_request as run_http_request
    from server_modules.tools_image_gen import generate_image as run_generate_image

    def _resolve_browser_engine() -> Any:
        context = session_ctx if isinstance(session_ctx, dict) else {}
        runtime_handle = context.get("runtime_handle")
        browser = getattr(runtime_handle, "browser", None)
        if browser is None:
            browser = context.get("browser")
        if browser is None:
            from server_modules.browser_engine import BrowserEngine

            browser = BrowserEngine()
            if runtime_handle is not None:
                try:
                    runtime_handle.browser = browser
                except Exception:
                    pass
            if isinstance(context, dict):
                context["browser"] = browser
        return browser

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
        body_text = json.dumps(body_value, ensure_ascii=False, indent=2) if isinstance(body_value, (dict, list)) else str(body_value or "").strip()
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
        browser = _resolve_browser_engine()
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


def execute_direct_tool_calls(
    *,
    tool_calls: List[Dict[str, Any]],
    workspace_id: str,
    thread_id: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    reasoning_effort: str = "",
    session_ctx: Optional[Dict[str, Any]] = None,
    execute_single_tool_call: Callable[..., str],
) -> str:
    if not tool_calls:
        return ""
    replies: List[str] = []
    for index, call in enumerate(tool_calls, start=1):
        replies.append(
            execute_single_tool_call(
                tool_call=call,
                workspace_id=workspace_id,
                thread_id=thread_id,
                index=index,
                provider=provider,
                model=model,
                credentials=credentials,
                reasoning_effort=reasoning_effort,
                session_ctx=session_ctx,
            )
        )
    return "\n\n".join(part for part in replies if part).strip()
