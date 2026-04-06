import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import sentry_sdk
import sys
import uuid
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
SERVER_MODULES_DIR = ROOT_DIR / "server_modules"
if str(SERVER_MODULES_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_MODULES_DIR))

try:
    from file_mount_security import assert_file_mount_access
except ImportError:
    from server_modules.file_mount_security import assert_file_mount_access  # type: ignore[no-redef]

try:
    from runtime_policy import (
        ACTION_RISK_LEVELS,
        browser_automation_plan_hash,
        build_local_operator_execution_binding,
        local_operator_approval_env_snapshot,
        local_operator_execution_binding_matches,
    )
except ImportError:
    from server_modules.runtime_policy import (  # type: ignore[no-redef]
        ACTION_RISK_LEVELS,
        browser_automation_plan_hash,
        build_local_operator_execution_binding,
        local_operator_approval_env_snapshot,
        local_operator_execution_binding_matches,
    )

try:
    from capability_registry import resolve_capability
except ImportError:
    from server_modules.capability_registry import resolve_capability  # type: ignore[no-redef]

try:
    from computer_control import (
        capture_screenshot,
        click_element_by_text,
        keyboard_type,
        launch_app,
        list_running_apps,
        mouse_click,
        read_clipboard,
        run_applescript,
        speak_text,
        screen_ocr,
        send_notification,
        write_clipboard,
    )
except ImportError:
    from server_modules.computer_control import (  # type: ignore[no-redef]
        capture_screenshot,
        click_element_by_text,
        keyboard_type,
        launch_app,
        list_running_apps,
        mouse_click,
        read_clipboard,
        run_applescript,
        speak_text,
        screen_ocr,
        send_notification,
        write_clipboard,
    )

try:
    from scripts.platform_execution import (
        capability_command,
        capability_metadata,
        capability_tool_id,
        command_spec_from_operation,
        default_local_companion_allow_prefixes,
        match_allowed_argv,
        screenshot_command,
        supports_capability,
    )
except ImportError:
    from platform_execution import (  # type: ignore[no-redef]
        capability_command,
        capability_metadata,
        capability_tool_id,
        command_spec_from_operation,
        default_local_companion_allow_prefixes,
        match_allowed_argv,
        screenshot_command,
        supports_capability,
    )

from server_modules.telemetry import get_tracer, set_span_attributes


LOCAL_EXECUTION_PACK_ID = "local-execution-v1"
LOCAL_EXECUTION_MAX_OPS_DEFAULT = 50
LOCAL_EXECUTION_MAX_OPS_CEILING = 200
LOCAL_EXECUTION_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".csv",
    ".tsv",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".scss",
    ".html",
    ".sh",
    ".toml",
}
BROWSER_CAPTURE_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
LOCAL_WORKER_REGISTERED_TOOLS = [
    "filesystem.read_write",
    "shell.execute",
    "screenshot.capture",
    "browser_automation.interactive",
    "computer_control.ocr",
    "computer_control.click",
    "computer_control.type",
    "computer_control.applescript",
    "computer_control.clipboard_read",
    "computer_control.clipboard_write",
    "computer_control.notify",
    "computer_control.list_apps",
    "computer_control.launch_app",
    "computer_control.speak",
]


def _safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def registered_local_worker_tool_names() -> List[str]:
    return list(LOCAL_WORKER_REGISTERED_TOOLS)


def _resolved_local_operation_limit(metadata: Optional[Dict[str, Any]] = None) -> int:
    payload = metadata if isinstance(metadata, dict) else {}
    configured = _safe_int(
        payload.get("max_iterations"),
        _safe_int(os.getenv("ORION_MAX_LOCAL_OPS", LOCAL_EXECUTION_MAX_OPS_DEFAULT), LOCAL_EXECUTION_MAX_OPS_DEFAULT),
    )
    return max(1, min(configured, LOCAL_EXECUTION_MAX_OPS_CEILING))


def _local_operation_limit_message(limit: int) -> str:
    return (
        f"Reached maximum steps ({limit}). "
        "To continue, start a new run or increase ORION_MAX_LOCAL_OPS."
    )


class LocalExecutionPauseRequired(RuntimeError):
    def __init__(
        self,
        summary: str,
        result_data: Dict[str, Any],
        *,
        browser_checkpoint: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(summary)
        self.summary = summary
        self.result_data = result_data
        self.browser_checkpoint = browser_checkpoint if isinstance(browser_checkpoint, dict) else {}


class _LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: List[Dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = ""
        title = ""
        for key, value in attrs:
            if key == "href" and value:
                href = value.strip()
            elif key == "title" and value:
                title = value.strip()
        if href:
            self.links.append({"href": href, "title": title})
def _normalize_action_id(raw: Any) -> str:
    value = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    normalized = re.sub(r"[^a-z0-9_.]", "", value)
    contract = resolve_capability(normalized)
    if contract is not None:
        return str(contract.capability_id or normalized).strip().lower()
    return normalized


def _local_execution_root() -> Path:
    configured = (
        str(os.getenv("ORION_LOCAL_COMPANION_ROOT") or "").strip()
        or str(os.getenv("ORION_COGNITIVE_OPERATOR_ROOT") or "").strip()
        or str(Path.cwd())
    )
    return Path(configured).expanduser().resolve()


def _artifact_root(root: Path) -> Path:
    target = (root / ".orion-artifacts" / "local-execution").resolve()
    target.mkdir(parents=True, exist_ok=True)
    return target


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _bounded_text(raw: Any, limit: int = 4000) -> str:
    text = str(raw or "")
    if len(text) <= limit:
        return text
    return text[:limit] + "\n...truncated..."


def _relative_to_root(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except Exception:
        return path.resolve().as_posix()


def _strip_html_to_text(raw_html: str) -> str:
    html = re.sub(r"(?is)<(script|style).*?>.*?</\\1>", " ", raw_html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_title(raw_html: str) -> str:
    match = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw_html)
    if not match:
        return ""
    return re.sub(r"\s+", " ", unescape(match.group(1))).strip()


def _validate_browser_url(raw_url: Any) -> str:
    url = str(raw_url or "").strip()
    if not url:
        raise RuntimeError("URL is required.")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("Browser Automation V1 only supports http and https URLs.")
    if not parsed.netloc:
        raise RuntimeError("URL must include a hostname.")
    return url


def _browser_artifact_paths(run_id: str, op_index: int, operation: Dict[str, Any], root: Path, artifacts_root: Path) -> Tuple[Path, Path]:
    browser_dir = artifacts_root / "browser"
    browser_dir.mkdir(parents=True, exist_ok=True)
    requested = str(operation.get("path") or operation.get("file_path") or "").strip()
    if requested:
        assert_file_mount_access(
            requested,
            "write",
            operation.get("file_mount_grants"),
            operation.get("__execution_target__") or "local_companion",
        )
        target = _resolve_local_path(requested, root, create_parent=True)
        report_target = target if target.suffix.lower() in {".txt", ".json"} else target.with_suffix(".txt")
        html_target = target if target.suffix.lower() in {".html", ".htm"} else target.with_suffix(".html")
        return html_target, report_target
    base = browser_dir / f"{run_id}-browser-{op_index + 1}"
    return base.with_suffix(".html"), base.with_suffix(".txt")


def _browser_capture_artifact_paths(run_id: str, op_index: int, operation: Dict[str, Any], root: Path, artifacts_root: Path) -> Tuple[Path, Path]:
    browser_dir = artifacts_root / "browser"
    browser_dir.mkdir(parents=True, exist_ok=True)
    requested = str(operation.get("path") or operation.get("file_path") or "").strip()
    if requested:
        assert_file_mount_access(
            requested,
            "write",
            operation.get("file_mount_grants"),
            operation.get("__execution_target__") or "local_companion",
        )
        target = _resolve_local_path(requested, root, create_parent=True)
        if target.suffix.lower() not in BROWSER_CAPTURE_IMAGE_EXTENSIONS:
            raise RuntimeError("Capture page save path must end in .png, .jpg, or .jpeg.")
        report_target = target.with_suffix(".txt")
        return target, report_target
    base = browser_dir / f"{run_id}-browser-{op_index + 1}"
    return base.with_suffix(".png"), base.with_suffix(".txt")


def _browser_download_dir(run_id: str, op_index: int, artifacts_root: Path) -> Path:
    target = artifacts_root / "browser" / f"{run_id}-downloads-{op_index + 1}"
    target.mkdir(parents=True, exist_ok=True)
    return target


def _browser_execution_binding(project_root: Path, browser_plan_hash: str, session_profile: str) -> Dict[str, Any]:
    argv = [sys.executable, "-m", "server_modules.browser_engine"]
    cwd = str(project_root.resolve())
    return build_local_operator_execution_binding(
        argv=argv,
        cwd=cwd,
        env_vars=local_operator_approval_env_snapshot(os.environ),
        browser_plan_hash=browser_plan_hash,
        session_profile=session_profile,
    )


def _run_async_value(coro: Any) -> Any:
    try:
        return asyncio.run(coro)
    except RuntimeError as exc:
        if "asyncio.run() cannot be called from a running event loop" not in str(exc):
            raise
        import threading

        result: Dict[str, Any] = {}

        def _runner():
            try:
                result["value"] = asyncio.run(coro)
            except Exception as thread_exc:
                result["error"] = thread_exc

        thread = threading.Thread(target=_runner, daemon=True)
        thread.start()
        thread.join()
        if "error" in result:
            raise result["error"]
        return result.get("value")


def _run_browser_capture_task(
    url: str,
    screenshot_target: Path,
    *,
    session_profile: str = "",
    download_dir: Optional[Path] = None,
    browser_actions: Optional[List[Dict[str, Any]]] = None,
    browser_checkpoint: Optional[Dict[str, Any]] = None,
    expected_execution_binding: Optional[Dict[str, Any]] = None,
    browser_plan_hash: str = "",
    resume_from_action_index: int = 0,
    wait_for_selector: str = "",
    click_selector: str = "",
    type_selector: str = "",
    type_text: str = "",
    timeout_seconds: int = 45,
) -> Dict[str, Any]:
    from server_modules.browser_engine import BrowserEngine

    project_root = _project_root()
    if expected_execution_binding:
        current_execution_binding = _browser_execution_binding(project_root, browser_plan_hash, session_profile)
        if not local_operator_execution_binding_matches(expected_execution_binding, current_execution_binding):
            raise RuntimeError("Browser execution binding drifted after approval.")

    normalized_actions = list(browser_actions or [])
    if wait_for_selector:
        normalized_actions.insert(0, {"action": "wait", "selector": wait_for_selector})
    if type_selector or type_text.strip():
        normalized_actions.append({"action": "type", "selector": type_selector, "text": type_text})
    if click_selector:
        normalized_actions.append({"action": "click", "selector": click_selector})

    async def _capture() -> Dict[str, Any]:
        engine = BrowserEngine()
        final_url = str(url or "").strip()
        if browser_checkpoint and str(browser_checkpoint.get("current_url") or "").strip():
            final_url = str(browser_checkpoint.get("current_url") or "").strip()
        await engine.navigate(final_url)

        action_results: List[Dict[str, Any]] = []
        paused = False
        pause_reason = ""
        pause_label = ""
        next_action_index = max(0, int(resume_from_action_index or 0))

        for index, action in enumerate(normalized_actions[next_action_index:], start=next_action_index):
            action_name = _normalize_action_id(action.get("action"))
            selector = str(action.get("selector") or "").strip()
            frame = str(action.get("frame") or "").strip()
            label = str(action.get("label") or "").strip()
            tab_value = str(action.get("tab") or "").strip()
            if action_name == "wait":
                page = await engine._active_page()
                await page.wait_for_selector(selector, timeout=max(1000, int(action.get("ms") or timeout_seconds * 1000)))
                action_results.append({"action": "wait", "selector": selector, "frame": frame, "tab": tab_value, "label": label})
            elif action_name == "type":
                result = await engine.fill(selector, str(action.get("text") or ""))
                action_results.append({"action": "type", "selector": selector, "frame": frame, "tab": tab_value, "text": result.get("value")})
            elif action_name == "click":
                result = await engine.click(selector)
                action_results.append({"action": "click", "selector": selector, "frame": frame, "tab": tab_value, "text": result.get("element_text")})
            elif action_name == "navigate":
                nav = await engine.navigate(str(action.get("url") or "").strip())
                action_results.append({"action": "navigate", "url": nav.get("url"), "tab": tab_value})
            elif action_name == "sleep":
                await asyncio.sleep(max(0, min(int(action.get("ms") or 0), 10000)) / 1000.0)
                action_results.append({"action": "sleep", "ms": int(action.get("ms") or 0)})
            elif action_name == "select":
                result = await engine.select(selector, str(action.get("value") or ""))
                action_results.append({"action": "select", "selector": selector, "value": result.get("value"), "tab": tab_value})
            elif action_name == "upload":
                upload_paths = [str(item).strip() for item in action.get("paths", []) if str(item).strip()]
                if not upload_paths and str(action.get("path") or "").strip():
                    upload_paths = [str(action.get("path") or "").strip()]
                result = await engine.upload_files(selector, upload_paths)
                action_results.append({"action": "upload", "selector": selector, "paths": result.get("paths"), "tab": tab_value})
            elif action_name == "extract":
                extracted = await engine.extract_text(selector or None)
                action_results.append({"action": "extract", "selector": selector, "text": _bounded_text(extracted, 500), "tab": tab_value})
            elif action_name == "open_tab":
                tab_id = await engine.new_tab(str(action.get("url") or "").strip() or None)
                action_results.append({"action": "open_tab", "tab": str(tab_id), "url": str(action.get("url") or "").strip()})
            elif action_name == "switch_tab":
                await engine.switch_tab(int(tab_value))
                action_results.append({"action": "switch_tab", "tab": tab_value})
            elif action_name == "close_tab":
                await engine.close_tab(int(tab_value))
                action_results.append({"action": "close_tab", "tab": tab_value})
            elif action_name == "pause_for_human":
                paused = True
                pause_reason = str(action.get("prompt") or "human_unblock_required").strip() or "human_unblock_required"
                pause_label = label or "Continue browser task"
                next_action_index = index
                break
            next_action_index = index + 1

        state = await engine.get_page_state()
        links = await engine.list_links()
        shot_path = await engine.screenshot()
        screenshot_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(shot_path, screenshot_target)
        tab_snapshots: List[Dict[str, Any]] = []
        for tab_id, page in list(engine._tabs.items()):
            if page is None or page.is_closed():
                continue
            try:
                title = await page.title()
            except Exception:
                title = ""
            tab_snapshots.append(
                {
                    "tabId": str(tab_id),
                    "url": str(page.url or "").strip(),
                    "title": title,
                    "active": tab_id == engine._active_tab_id,
                }
            )
        checkpoint_payload = {
            "current_url": state.get("url"),
            "next_action_index": next_action_index,
            "tabs": tab_snapshots,
        }
        return {
            "ok": True,
            "finalUrl": state.get("url"),
            "title": state.get("title"),
            "textPreview": state.get("text_preview"),
            "links": links,
            "downloads": [],
            "tabs": tab_snapshots,
            "consoleEntries": [],
            "networkFailures": [],
            "roleSnapshot": state.get("interactive_elements"),
            "accessibilitySnapshot": {"interactive_elements": state.get("interactive_elements")},
            "paused": paused,
            "pauseReason": pause_reason,
            "pauseLabel": pause_label,
            "browserCheckpoint": checkpoint_payload,
            "actionResults": action_results,
        }

    return _run_async_value(_capture())


def _normalize_browser_actions(operation: Dict[str, Any], root: Path) -> List[Dict[str, Any]]:
    raw_actions = operation.get("browser_actions")
    if not isinstance(raw_actions, list):
        raw_actions = operation.get("browserActions")
    actions: List[Dict[str, Any]] = []
    if isinstance(raw_actions, list):
        for index, item in enumerate(raw_actions):
            if not isinstance(item, dict):
                raise RuntimeError(f"Browser action {index + 1} must be an object.")
            action = _normalize_action_id(item.get("action"))
            if action not in {"wait", "type", "click", "navigate", "sleep", "select", "upload", "extract", "open_tab", "switch_tab", "close_tab", "download", "open_popup", "pause_for_human"}:
                raise RuntimeError(f"Browser action {index + 1} is not supported.")
            selector = str(item.get("selector") or "").strip()
            text = str(item.get("text") or "")
            url = str(item.get("url") or "").strip()
            ms = int(item.get("ms") or item.get("delayMs") or 0)
            value = str(item.get("value") or "")
            attribute = str(item.get("attribute") or "").strip()
            frame = str(item.get("frame") or item.get("frameSelector") or "").strip()
            tab = str(item.get("tab") or item.get("tabId") or "").strip()
            path = str(item.get("path") or item.get("file_path") or "").strip()
            label = str(item.get("label") or "").strip()
            prompt = str(item.get("prompt") or item.get("reason") or "").strip()
            paths_raw = item.get("paths")
            paths = [str(entry or "").strip() for entry in paths_raw] if isinstance(paths_raw, list) else []
            paths = [entry for entry in paths if entry]
            if action in {"wait", "type", "click", "select", "upload", "extract", "download", "open_popup"} and not selector:
                raise RuntimeError(f"Browser action {index + 1} requires a selector.")
            if action == "type" and not text.strip():
                raise RuntimeError(f"Browser action {index + 1} requires text.")
            if action == "select" and not value.strip():
                raise RuntimeError(f"Browser action {index + 1} requires a value.")
            if action in {"switch_tab", "close_tab"} and not tab:
                raise RuntimeError(f"Browser action {index + 1} requires a tab id.")
            if action == "open_popup":
                ms = max(1000, min(ms or 8000, 20000))
            if action == "download":
                ms = max(500, min(ms or 5000, 15000))
            if action == "upload" and not (path or paths):
                raise RuntimeError(f"Browser action {index + 1} requires a file path.")
            if action == "upload" and frame:
                raise RuntimeError(f"Browser action {index + 1} does not support iframe-targeted uploads yet.")
            if action in {"navigate", "open_tab"}:
                url = _validate_browser_url(url)
            if action == "sleep":
                ms = max(0, min(ms, 10000))
            if action == "upload":
                resolved_primary = _resolve_local_path(path, root) if path else None
                resolved_paths = [_resolve_local_path(entry, root) for entry in paths]
                path = str(resolved_primary) if resolved_primary else ""
                paths = [str(entry) for entry in resolved_paths]
            actions.append({
                "action": action,
                "selector": selector,
                "text": text,
                "url": url,
                "ms": ms,
                "value": value.strip(),
                "attribute": attribute,
                "frame": frame,
                "tab": tab,
                "path": path,
                "paths": paths,
                "label": label,
                "prompt": prompt,
            })
    if actions:
        return actions
    wait_for_selector = str(operation.get("wait_for_selector") or operation.get("waitForSelector") or "").strip()
    click_selector = str(operation.get("click_selector") or operation.get("clickSelector") or "").strip()
    type_selector = str(operation.get("type_selector") or operation.get("typeSelector") or "").strip()
    type_text = str(operation.get("type_text") or operation.get("typeText") or "")
    if wait_for_selector:
        actions.append({"action": "wait", "selector": wait_for_selector, "text": "", "url": "", "ms": 0})
    if type_selector or type_text.strip():
        if not type_selector:
            raise RuntimeError("Type text requires a selector to target.")
        if not type_text.strip():
            raise RuntimeError("Type selector requires non-empty type text.")
        actions.append({"action": "type", "selector": type_selector, "text": type_text, "url": "", "ms": 0})
    if click_selector:
        actions.append({"action": "click", "selector": click_selector, "text": "", "url": "", "ms": 0})
    return actions


def _browser_security_profile(session_profile: str, browser_actions: List[Dict[str, Any]]) -> str:
    action_set = {
        str(item.get("action") or "").strip().lower()
        for item in browser_actions
        if isinstance(item, dict)
    }
    interactive = action_set & {"type", "click", "select", "upload", "download", "open_popup", "open_tab", "switch_tab", "close_tab", "navigate"}
    privileged = action_set & {"upload", "download", "open_popup", "open_tab", "close_tab"}
    if session_profile and privileged:
        return "authenticated_privileged"
    if session_profile and interactive:
        return "authenticated_interactive"
    if session_profile:
        return "authenticated_readonly"
    if privileged:
        return "public_privileged"
    if interactive:
        return "public_interactive"
    return "public_readonly"


def _browser_policy_gate(operation: Dict[str, Any], session_profile: str, browser_actions: List[Dict[str, Any]], browser_security_profile: str) -> None:
    permissions = operation.get("browser_permissions") if isinstance(operation.get("browser_permissions"), dict) else {}
    metadata = operation.get("__metadata__") if isinstance(operation.get("__metadata__"), dict) else {}
    browser_allowed = bool(permissions.get("allow"))
    if (session_profile or browser_actions) and not browser_allowed:
        raise RuntimeError("Browser automation with session_profile or browser_actions requires browser_permissions.allow = true.")
    if browser_security_profile in {"authenticated_interactive", "authenticated_privileged"}:
        expected_plan_hash = str(metadata.get("browser_immutable_plan_hash") or "").strip()
        reviewed_approved = bool(metadata.get("browser_reviewed_approved"))
        current_plan_hash = browser_automation_plan_hash(
            [
                {
                    "tool": "browser_automation.interactive",
                    "mode": str(operation.get("mode") or "capture_page").strip() or "capture_page",
                    "url": str(operation.get("url") or "").strip(),
                    "session_profile": session_profile,
                    "browser_actions": browser_actions,
                }
            ]
        )
        if not reviewed_approved or not expected_plan_hash:
            raise RuntimeError(
                "Session-backed interactive or privileged browser automation requires reviewed approval before local execution."
            )
        if current_plan_hash != expected_plan_hash:
            raise RuntimeError("Browser execution plan drifted after approval.")


def _run_browser_operation(run_id: str, op_index: int, operation: Dict[str, Any], root: Path, artifacts_root: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    mode = _normalize_action_id(operation.get("mode") or "extract_text")
    if mode not in {"extract_text", "extract_links", "save_html", "capture_page"}:
        raise RuntimeError("Browser mode must be extract_text, extract_links, save_html, or capture_page.")
    url = _validate_browser_url(operation.get("url"))
    if mode == "capture_page":
        screenshot_target, report_target = _browser_capture_artifact_paths(run_id, op_index, operation, root, artifacts_root)
        download_dir = _browser_download_dir(run_id, op_index, artifacts_root)
        session_profile = str(operation.get("session_profile") or operation.get("sessionProfile") or "").strip()
        checkpoint = operation.get("__browser_checkpoint__") if isinstance(operation.get("__browser_checkpoint__"), dict) else {}
        metadata = operation.get("__metadata__") if isinstance(operation.get("__metadata__"), dict) else {}
        browser_actions = _normalize_browser_actions(operation, root)
        browser_security_profile = _browser_security_profile(session_profile, browser_actions)
        _browser_policy_gate(operation, session_profile, browser_actions, browser_security_profile)
        resume_from_action_index = int(checkpoint.get("next_action_index") or 0) if checkpoint else 0
        target_url = str(checkpoint.get("current_url") or url).strip() if checkpoint else url
        current_plan_hash = browser_automation_plan_hash(
            [
                {
                    "tool": "browser_automation.interactive",
                    "mode": mode,
                    "url": url,
                    "session_profile": session_profile,
                    "browser_actions": browser_actions,
                }
            ]
        )
        if browser_security_profile in {"authenticated_interactive", "authenticated_privileged"}:
            expected_plan_hash = str(metadata.get("browser_immutable_plan_hash") or "").strip()
            if not expected_plan_hash or current_plan_hash != expected_plan_hash:
                raise RuntimeError("Browser execution plan drifted after approval.")
        expected_execution_binding = (
            metadata.get("browser_execution_binding")
            if isinstance(metadata.get("browser_execution_binding"), dict)
            else {}
        )
        current_execution_binding = _browser_execution_binding(_project_root(), current_plan_hash, session_profile)
        if expected_execution_binding and not local_operator_execution_binding_matches(expected_execution_binding, current_execution_binding):
            raise RuntimeError("Browser execution binding drifted after approval.")
        capture_result = _run_browser_capture_task(
            target_url,
            screenshot_target,
            session_profile=session_profile,
            download_dir=download_dir,
            browser_actions=browser_actions,
            browser_checkpoint=checkpoint,
            expected_execution_binding=expected_execution_binding,
            browser_plan_hash=current_plan_hash,
            resume_from_action_index=resume_from_action_index,
        )
        links = capture_result.get("links") if isinstance(capture_result.get("links"), list) else []
        downloads = capture_result.get("downloads") if isinstance(capture_result.get("downloads"), list) else []
        tab_snapshots = capture_result.get("tabs") if isinstance(capture_result.get("tabs"), list) else []
        console_entries = capture_result.get("consoleEntries") if isinstance(capture_result.get("consoleEntries"), list) else []
        network_failures = capture_result.get("networkFailures") if isinstance(capture_result.get("networkFailures"), list) else []
        role_snapshot = capture_result.get("roleSnapshot") if isinstance(capture_result.get("roleSnapshot"), list) else []
        accessibility_snapshot = capture_result.get("accessibilitySnapshot") if isinstance(capture_result.get("accessibilitySnapshot"), dict) else {}
        paused = bool(capture_result.get("paused"))
        browser_checkpoint = capture_result.get("browserCheckpoint") if isinstance(capture_result.get("browserCheckpoint"), dict) else {}
        pause_reason = str(capture_result.get("pauseReason") or "").strip()
        pause_label = str(capture_result.get("pauseLabel") or "").strip()
        report_lines = [
            f"URL: {capture_result.get('finalUrl') or target_url}",
            f"Title: {capture_result.get('title') or '-'}",
            f"Session profile: {session_profile or '-'}",
            f"Security profile: {browser_security_profile}",
            f"Screenshot: {_relative_to_root(screenshot_target, root)}",
        ]
        if paused:
            report_lines.extend(
                [
                    f"Pause reason: {pause_reason or 'human_unblock_required'}",
                    f"Resume from action index: {browser_checkpoint.get('next_action_index')}",
                ]
            )
        if tab_snapshots:
            report_lines.extend(["", "Tabs:"])
            for item in tab_snapshots[:20]:
                if not isinstance(item, dict):
                    continue
                report_lines.append(
                    f"- {str(item.get('tabId') or item.get('tab_id') or '').strip() or 'tab'}"
                    f"{' [active]' if bool(item.get('active')) else ''}"
                    f" -> {_bounded_text(str(item.get('url') or '').strip(), 240)}"
                )
        report_lines.extend(
            [
                "",
                "Text preview:",
                _bounded_text(capture_result.get("textPreview") or "", 2000),
            ]
        )
        action_results = capture_result.get("actionResults") if isinstance(capture_result.get("actionResults"), list) else []
        if action_results:
            report_lines.extend(["", "Action results:"])
            for item in action_results[:20]:
                if not isinstance(item, dict):
                    continue
                label = str(item.get("action") or "action").strip() or "action"
                selector = str(item.get("selector") or "").strip()
                frame = str(item.get("frame") or "").strip()
                tab = str(item.get("tab") or "").strip()
                detail = (
                    str(item.get("text") or "").strip()
                    or str(item.get("value") or "").strip()
                    or str(item.get("url") or "").strip()
                    or str(item.get("attributeValue") or "").strip()
                    or ", ".join([str(name).strip() for name in item.get("names", [])[:3]]) if isinstance(item.get("names"), list) else ""
                )
                line = f"- {label}"
                if tab:
                    line += f" <{tab}>"
                if frame:
                    line += f" @ {frame}"
                if selector:
                    line += f" [{selector}]"
                if detail:
                    line += f" -> {_bounded_text(detail, 240)}"
                report_lines.append(line)
        if downloads:
            report_lines.extend(["", "Downloads:"])
            for item in downloads[:20]:
                if not isinstance(item, dict):
                    continue
                saved_path = str(item.get("savedPath") or "").strip()
                relative_saved = _relative_to_root(Path(saved_path), root) if saved_path else "-"
                line = f"- {str(item.get('suggestedFilename') or Path(saved_path).name or 'download').strip()}"
                if str(item.get("tab") or "").strip():
                    line += f" <{str(item.get('tab') or '').strip()}>"
                if relative_saved:
                    line += f" -> {relative_saved}"
                if str(item.get("state") or "").strip():
                    line += f" [{str(item.get('state') or '').strip()}]"
                report_lines.append(line)
        if links:
            report_lines.extend(["", "Links:"])
            for item in links[:20]:
                href = str(item.get("href") or "").strip()
                text = str(item.get("text") or "").strip()
                report_lines.append(f"- {href}{f' | {text}' if text else ''}")
        if network_failures:
            report_lines.extend(["", "Network failures:"])
            for item in network_failures[:20]:
                if not isinstance(item, dict):
                    continue
                report_lines.append(
                    f"- {str(item.get('tab') or '').strip() or 'tab'}"
                    f" -> {_bounded_text(str(item.get('url') or item.get('errorDescription') or item.get('error') or '').strip(), 240)}"
                )
        if console_entries:
            report_lines.extend(["", "Console events:"])
            for item in console_entries[:20]:
                if not isinstance(item, dict):
                    continue
                report_lines.append(
                    f"- {str(item.get('tab') or '').strip() or 'tab'}"
                    f" -> {_bounded_text(str(item.get('message') or '').strip(), 240)}"
                )
        report_target.write_text("\n".join(report_lines).strip(), encoding="utf-8")
        action = {
            "step_index": op_index,
            "step_number": op_index + 1,
            "tool": "browser_automation.interactive",
            "status": "waiting_for_input" if paused else "completed",
            "summary": _operation_summary(operation, op_index),
            "action": "browser_automation.interactive",
            "mode": mode,
            "url": str(capture_result.get("finalUrl") or target_url),
            "title": str(capture_result.get("title") or ""),
            "text_preview": _bounded_text(capture_result.get("textPreview") or "", 2000),
            "links_count": len(links),
            "file_path": _relative_to_root(screenshot_target, root),
            "report_file_path": _relative_to_root(report_target, root),
            "session_profile": session_profile or None,
            "browser_security_profile": browser_security_profile,
            "browser_actions": browser_actions,
            "action_results": action_results,
            "pause_reason": pause_reason or None,
            "pause_label": pause_label or None,
            "browser_checkpoint": browser_checkpoint if paused else None,
            "tabs": tab_snapshots,
            "console_entries": console_entries,
            "network_failures": network_failures,
            "role_snapshot": role_snapshot,
            "accessibility_snapshot": accessibility_snapshot,
            "browser_execution_binding": current_execution_binding,
            "downloads": [
                {
                    "tab": str(item.get("tab") or "").strip(),
                    "url": str(item.get("url") or "").strip(),
                    "filename": str(item.get("suggestedFilename") or Path(str(item.get("savedPath") or "")).name).strip(),
                    "file_path": _relative_to_root(Path(str(item.get("savedPath") or "")).resolve(), root)
                    if str(item.get("savedPath") or "").strip()
                    else "",
                    "state": str(item.get("state") or "").strip(),
                }
                for item in downloads
                if isinstance(item, dict)
            ],
        }
        artifacts = [
            {
                "step_index": op_index,
                "step_number": op_index + 1,
                "tool": "browser_automation.interactive",
                "kind": "screenshot",
                "file_path": _relative_to_root(screenshot_target, root),
                "label": screenshot_target.name,
            },
            {
                "step_index": op_index,
                "step_number": op_index + 1,
                "tool": "browser_automation.interactive",
                "kind": "report",
                "file_path": _relative_to_root(report_target, root),
                "label": report_target.name,
            },
        ]
        for item in downloads:
            if not isinstance(item, dict):
                continue
            saved_path = str(item.get("savedPath") or "").strip()
            if not saved_path:
                continue
            try:
                saved_path_obj = Path(saved_path).resolve()
                relative_saved = _relative_to_root(saved_path_obj, root)
            except Exception:
                continue
            artifacts.append(
                {
                    "step_index": op_index,
                    "step_number": op_index + 1,
                    "tool": "browser_automation.interactive",
                    "kind": "download",
                    "file_path": relative_saved,
                    "label": str(item.get("suggestedFilename") or saved_path_obj.name).strip() or saved_path_obj.name,
                }
            )
        return action, artifacts

    html_target, report_target = _browser_artifact_paths(run_id, op_index, operation, root, artifacts_root)
    try:
        req = urlrequest.Request(
            url,
            headers={
                "User-Agent": "EmpyralisBrowserAutomationV1/1.0",
                "Accept": "text/html,application/xhtml+xml",
            },
            method="GET",
        )
        with urlrequest.urlopen(req, timeout=20) as resp:
            content_type = str(resp.headers.get("Content-Type") or "").lower()
            if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                raise RuntimeError(f"Expected an HTML page, got {content_type or 'unknown content type'}.")
            raw_html = resp.read().decode("utf-8", errors="ignore")
            final_url = str(resp.geturl() or url)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else str(exc)
        raise RuntimeError(f"Browser fetch failed ({exc.code}): {_bounded_text(detail, 500)}") from exc
    except URLError as exc:
        raise RuntimeError(f"Browser fetch failed: {exc.reason}") from exc

    html_target.write_text(raw_html, encoding="utf-8")
    title = _extract_title(raw_html)
    text_content = _strip_html_to_text(raw_html)
    link_parser = _LinkCollector()
    link_parser.feed(raw_html)
    links = link_parser.links[:40]

    if mode == "extract_links":
        link_lines = []
        for item in links:
            href = str(item.get("href") or "").strip()
            item_title = str(item.get("title") or "").strip()
            link_lines.append(f"- {href}{f' | {item_title}' if item_title else ''}")
        report_body = "\n".join(
            [f"URL: {final_url}", f"Title: {title or '-'}", "", "Links:"] + link_lines
        ).strip()
        preview = _bounded_text(report_body, 2000)
    elif mode == "save_html":
        report_body = "\n".join(
            [
                f"Saved HTML for: {final_url}",
                f"Title: {title or '-'}",
                f"HTML file: {_relative_to_root(html_target, root)}",
            ]
        )
        preview = _bounded_text(report_body, 1200)
    else:
        report_body = "\n".join(
            [
                f"URL: {final_url}",
                f"Title: {title or '-'}",
                "",
                "Extracted text:",
                text_content,
            ]
        ).strip()
        preview = _bounded_text(text_content, 2000)

    report_target.write_text(report_body, encoding="utf-8")
    action = {
        "step_index": op_index,
        "step_number": op_index + 1,
        "tool": "browser_automation.interactive",
        "status": "completed",
        "summary": _operation_summary(operation, op_index),
        "action": "browser_automation.interactive",
        "mode": mode,
        "url": final_url,
        "title": title,
        "text_preview": preview if mode == "extract_text" else None,
        "links_count": len(links) if mode == "extract_links" else None,
        "html_file_path": _relative_to_root(html_target, root),
        "report_file_path": _relative_to_root(report_target, root),
    }
    artifacts = [
        {
            "step_index": op_index,
            "step_number": op_index + 1,
            "tool": "browser_automation.interactive",
            "kind": "file",
            "file_path": _relative_to_root(report_target, root),
            "label": report_target.name,
        },
        {
            "step_index": op_index,
            "step_number": op_index + 1,
            "tool": "browser_automation.interactive",
            "kind": "file",
            "file_path": _relative_to_root(html_target, root),
            "label": html_target.name,
        },
    ]
    return action, artifacts


def _resolve_local_path(raw_path: Any, root: Path, *, create_parent: bool = False) -> Path:
    value = str(raw_path or "").strip()
    if not value:
        raise RuntimeError("Path is required.")
    candidate = Path(value).expanduser()
    target = (root / candidate).resolve() if not candidate.is_absolute() else candidate.resolve()
    try:
        target.relative_to(root)
    except Exception as exc:
        raise RuntimeError(f"Path must stay inside local companion root: {root}") from exc
    if create_parent:
        target.parent.mkdir(parents=True, exist_ok=True)
    return target


def _resolve_local_dir(raw_path: Any, root: Path) -> Path:
    target = _resolve_local_path(raw_path or ".", root, create_parent=False)
    if not target.exists() or not target.is_dir():
        raise RuntimeError(f"Working directory not found: {_relative_to_root(target, root)}")
    return target


def _read_allow_prefixes() -> List[str]:
    raw = (
        str(os.getenv("ORION_LOCAL_COMPANION_COMMAND_ALLOW_PREFIXES") or "").strip()
        or str(os.getenv("ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES") or "").strip()
    )
    if raw:
        items = [part.strip() for part in raw.split(",") if part.strip()]
        if items:
            return items
    return default_local_companion_allow_prefixes(_project_root())


def _match_allowed_command(command: str) -> Tuple[List[str], str]:
    spec = command_spec_from_operation(command=command)
    return match_allowed_argv(spec.argv, _read_allow_prefixes())


def _match_allowed_operation_command(operation: Dict[str, Any]) -> Tuple[List[str], str, str]:
    argv = operation.get("argv") if isinstance(operation.get("argv"), list) else None
    command = str(operation.get("command") or "").strip()
    capability = str(operation.get("capability") or "").strip()
    if capability and (argv or command):
        raise RuntimeError("Capability-based shell execution cannot be mixed with raw command or argv.")
    if capability and not argv and not command:
        resolved_argv = capability_command(capability, _project_root())
        if not resolved_argv:
            raise RuntimeError(f"Capability is not supported on this machine: {capability}")
        spec = command_spec_from_operation(argv=resolved_argv)
        display = capability
    else:
        spec = command_spec_from_operation(command=command, argv=argv)
        display = spec.display
    tokens, matched_prefix = match_allowed_argv(spec.argv, _read_allow_prefixes())
    return tokens, matched_prefix, display


def _policy_gate(metadata: Dict[str, Any], requested_tools: List[str]) -> None:
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else {}
    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    decisions: Dict[str, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        tool_id = _normalize_action_id(item.get("tool_id"))
        decision = str(item.get("decision") or "").strip().lower()
        if tool_id and decision:
            decisions[tool_id] = decision

    blocked = sorted({tool for tool in requested_tools if decisions.get(tool) == "blocked"})
    if blocked:
        raise RuntimeError(f"Local execution blocked by safety policy: {', '.join(blocked)}.")

    approval = sorted({tool for tool in requested_tools if decisions.get(tool) == "approval_required"})
    if approval:
        raise RuntimeError(
            "Local execution requires approval for: "
            + ", ".join(approval)
            + ". Local companion V1 does not auto-execute approval-gated tools."
        )


def _coerce_text_content(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, indent=2, ensure_ascii=False)
    return str(value or "")


def _is_text_file(path: Path) -> bool:
    suffix = path.suffix.lower()
    return suffix in LOCAL_EXECUTION_TEXT_EXTENSIONS or not suffix


def _parse_operations(pack_inputs: Dict[str, Any], metadata: Optional[Dict[str, Any]] = None) -> Tuple[List[Dict[str, Any]], bool]:
    raw_ops = pack_inputs.get("operations") if isinstance(pack_inputs.get("operations"), list) else []
    continue_on_error = bool(pack_inputs.get("continue_on_error"))
    operations: List[Dict[str, Any]] = []
    if raw_ops:
        for item in raw_ops:
            if isinstance(item, dict):
                operations.append(dict(item))
    else:
        candidate = dict(pack_inputs)
        inferred_tool = (
            candidate.get("tool")
            or candidate.get("action")
            or capability_tool_id(candidate.get("capability"))
            or ("shell.execute" if str(candidate.get("command") or "").strip() or isinstance(candidate.get("argv"), list) else "")
            or ("browser_automation.interactive" if str(candidate.get("url") or "").strip() else "")
            or ("screenshot.capture" if bool(candidate.get("screenshot")) else "")
        )
        if not inferred_tool and str(candidate.get("path") or candidate.get("file_path") or "").strip():
            inferred_tool = "filesystem.read_write"
        if inferred_tool:
            candidate["tool"] = inferred_tool
            operations.append(candidate)
    if not operations:
        raise RuntimeError("local-execution-v1 requires at least one operation.")
    operation_limit = _resolved_local_operation_limit(metadata)
    if len(operations) > operation_limit:
        raise RuntimeError(_local_operation_limit_message(operation_limit))
    return operations, continue_on_error


def _operation_summary(operation: Dict[str, Any], fallback_index: int) -> str:
    tool_id = _normalize_action_id(operation.get("tool") or operation.get("action"))
    if tool_id == "shell.execute":
        capability = str(operation.get("capability") or "").strip()
        if capability and not str(operation.get("command") or "").strip() and not isinstance(operation.get("argv"), list):
            detail = capability_metadata(capability, _project_root())
            title = str(detail.get("title") or "").strip() if isinstance(detail, dict) else ""
            return title or capability
        try:
            spec = command_spec_from_operation(
                command=str(operation.get("command") or "").strip(),
                argv=operation.get("argv") if isinstance(operation.get("argv"), list) else None,
            )
            return spec.display or f"Shell command {fallback_index + 1}"
        except Exception:
            command = str(operation.get("command") or "").strip()
            return command or f"Shell command {fallback_index + 1}"
    if tool_id == "screenshot.capture":
        capability = str(operation.get("capability") or "").strip()
        if capability:
            detail = capability_metadata(capability, _project_root())
            title = str(detail.get("title") or "").strip() if isinstance(detail, dict) else ""
            if title:
                target = str(operation.get("path") or operation.get("file_path") or "").strip()
                return f"{title} -> {target}" if target else title
        target = str(operation.get("path") or operation.get("file_path") or "").strip()
        return target or f"Screenshot {fallback_index + 1}"
    if tool_id == "browser_automation.interactive":
        mode = _normalize_action_id(operation.get("mode") or "extract_text")
        url = str(operation.get("url") or "").strip()
        if mode == "capture_page":
            return f"Capture {url}" if url else f"Capture page {fallback_index + 1}"
        if mode == "extract_links":
            return f"Links from {url}" if url else f"Link extraction {fallback_index + 1}"
        if mode == "save_html":
            return f"Save HTML {url}" if url else f"Save HTML {fallback_index + 1}"
        return f"Extract text {url}" if url else f"Text extraction {fallback_index + 1}"
    mode = _normalize_action_id(operation.get("mode") or "read")
    target = str(operation.get("path") or operation.get("file_path") or "").strip()
    if mode == "append":
        return f"Append {target}" if target else f"Append file {fallback_index + 1}"
    if mode == "write":
        return f"Write {target}" if target else f"Write file {fallback_index + 1}"
    return f"Read {target}" if target else f"Read file {fallback_index + 1}"


def _run_shell_operation(run_id: str, op_index: int, operation: Dict[str, Any], root: Path, artifacts_root: Path) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    tokens, matched_prefix, display_command = _match_allowed_operation_command(operation)
    assert_file_mount_access(
        operation.get("cwd") or ".",
        "read",
        operation.get("file_mount_grants"),
        operation.get("__execution_target__") or "local_companion",
    )
    cwd = _resolve_local_dir(operation.get("cwd") or ".", root)
    timeout_seconds = int(operation.get("timeout_seconds") or 20)
    timeout_seconds = max(1, min(timeout_seconds, 120))
    completed = subprocess.run(
        tokens,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        check=False,
    )
    command_dir = artifacts_root / "commands"
    command_dir.mkdir(parents=True, exist_ok=True)
    log_path = command_dir / f"{run_id}-command-{op_index + 1}.log"
    log_path.write_text(
        "\n".join(
            [
                f"command: {display_command}",
                f"argv: {json.dumps(tokens, ensure_ascii=False)}",
                f"cwd: {_relative_to_root(cwd, root)}",
                f"matched_prefix: {matched_prefix}",
                f"exit_code: {completed.returncode}",
                "",
                "[stdout]",
                str(completed.stdout or ""),
                "",
                "[stderr]",
                str(completed.stderr or ""),
            ]
        ),
        encoding="utf-8",
    )
    action = {
        "step_index": op_index,
        "step_number": op_index + 1,
        "tool": "shell.execute",
        "status": "completed",
        "summary": _operation_summary(operation, op_index),
        "action": "shell.execute",
        "command": display_command,
        "argv": list(tokens),
        "cwd": _relative_to_root(cwd, root),
        "allowed_prefix": matched_prefix,
        "timeout_seconds": timeout_seconds,
        "exit_code": int(completed.returncode),
        "stdout_preview": _bounded_text(completed.stdout),
        "stderr_preview": _bounded_text(completed.stderr),
        "file_path": _relative_to_root(log_path, root),
    }
    capability = str(operation.get("capability") or "").strip()
    if capability:
        action["capability"] = capability
    artifact = {
        "step_index": op_index,
        "step_number": op_index + 1,
        "tool": "shell.execute",
        "kind": "report",
        "file_path": _relative_to_root(log_path, root),
        "label": log_path.name,
    }
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {completed.returncode}: {display_command}")
    return action, artifact


def _run_file_operation(operation: Dict[str, Any], root: Path, metadata: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    file_mount_grants = operation.get("file_mount_grants") if isinstance(operation.get("file_mount_grants"), list) else metadata.get("file_mount_grants")
    access = assert_file_mount_access(
        operation.get("path") or operation.get("file_path"),
        operation.get("mode") or "read",
        file_mount_grants,
        metadata.get("execution_target") or "local_companion",
    )
    mode = access["mode"]
    if mode not in {"read", "write", "append", "delete"}:
        raise RuntimeError("filesystem.read_write mode must be read, write, append, or delete.")
    target = _resolve_local_path(operation.get("path") or operation.get("file_path"), root, create_parent=mode in {"write", "append"})
    if not _is_text_file(target):
        raise RuntimeError("V1 file operations are limited to text-oriented files.")
    relative_path = _relative_to_root(target, root)

    if mode == "read":
        if not target.exists():
            raise RuntimeError(f"File not found: {relative_path}")
        content = target.read_text(encoding="utf-8")
        action = {
            "step_index": int(operation.get("__step_index__") or 0),
            "step_number": int(operation.get("__step_index__") or 0) + 1,
            "tool": "filesystem.read_write",
            "status": "completed",
            "summary": _operation_summary(operation, int(operation.get("__step_index__") or 0)),
            "action": "filesystem.read_write",
            "mode": mode,
            "path": relative_path,
            "file_path": relative_path,
            "bytes_read": len(content.encode("utf-8")),
            "content_preview": _bounded_text(content),
        }
        artifact = {
            "step_index": int(operation.get("__step_index__") or 0),
            "step_number": int(operation.get("__step_index__") or 0) + 1,
            "tool": "filesystem.read_write",
            "kind": "file",
            "file_path": relative_path,
            "label": target.name,
        }
        return action, artifact

    if mode == "delete":
        if not target.exists():
            raise RuntimeError(f"File not found: {relative_path}")
        if target.is_dir():
            raise RuntimeError("Directories cannot be deleted in V1.")
        target.unlink()
        action = {
            "step_index": int(operation.get("__step_index__") or 0),
            "step_number": int(operation.get("__step_index__") or 0) + 1,
            "tool": "filesystem.read_write",
            "status": "completed",
            "summary": _operation_summary(operation, int(operation.get("__step_index__") or 0)),
            "action": "filesystem.read_write",
            "mode": mode,
            "path": relative_path,
            "file_path": relative_path,
        }
        artifact = {
            "step_index": int(operation.get("__step_index__") or 0),
            "step_number": int(operation.get("__step_index__") or 0) + 1,
            "tool": "filesystem.read_write",
            "kind": "file_delete",
            "file_path": relative_path,
            "label": target.name,
        }
        return action, artifact

    content = _coerce_text_content(operation.get("content"))
    if mode == "write":
        overwrite = bool(operation.get("overwrite"))
        if target.exists() and not overwrite:
            raise RuntimeError(f"File already exists: {relative_path} (set overwrite=true to replace).")
        target.write_text(content, encoding="utf-8")
    else:
        with target.open("a", encoding="utf-8") as handle:
            handle.write(content)
    action = {
        "step_index": int(operation.get("__step_index__") or 0),
        "step_number": int(operation.get("__step_index__") or 0) + 1,
        "tool": "filesystem.read_write",
        "status": "completed",
        "summary": _operation_summary(operation, int(operation.get("__step_index__") or 0)),
        "action": "filesystem.read_write",
        "mode": mode,
        "path": relative_path,
        "file_path": relative_path,
        "bytes_written": len(content.encode("utf-8")),
    }
    artifact = {
        "step_index": int(operation.get("__step_index__") or 0),
        "step_number": int(operation.get("__step_index__") or 0) + 1,
        "tool": "filesystem.read_write",
        "kind": "file",
        "file_path": relative_path,
        "label": target.name,
    }
    return action, artifact


def _screenshot_command(target: Path) -> List[str]:
    return screenshot_command(target)


def _run_screenshot_operation(run_id: str, op_index: int, operation: Dict[str, Any], root: Path, artifacts_root: Path) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    capability = str(operation.get("capability") or "").strip()
    if capability:
        if capability.lower() != "screenshot.capture":
            raise RuntimeError(f"Unsupported screenshot capability: {capability}")
        if not supports_capability(capability, _project_root()):
            raise RuntimeError(f"Capability is not supported on this machine: {capability}")
    if str(operation.get("path") or operation.get("file_path") or "").strip():
        target = _resolve_local_path(operation.get("path") or operation.get("file_path"), root, create_parent=True)
    else:
        shot_dir = artifacts_root / "screenshots"
        shot_dir.mkdir(parents=True, exist_ok=True)
        target = (shot_dir / f"{run_id}-shot-{op_index + 1}.png").resolve()
    capture_result = capture_screenshot(
        monitor=str(operation.get("monitor") or "primary").strip() or "primary",
        region=operation.get("region"),
    )
    if not bool(capture_result.get("success")):
        raw_message = _bounded_text(str(capture_result.get("error") or "Screenshot capture failed.").strip())
        if sys.platform == "darwin":
            guidance = (
                "macOS screenshot capture needs Screen Recording permission for the app running "
                "Empyralis locally (usually Terminal or iTerm), plus an active display session. "
                "This captures the current display, not a specific Empyralis panel."
            )
            message = f"{raw_message}\n{guidance}" if raw_message else guidance
        else:
            message = raw_message
        raise RuntimeError(message)
    images = capture_result.get("images") if isinstance(capture_result.get("images"), list) else []
    first_image = images[0] if images and isinstance(images[0], dict) else None
    image_base64 = str((first_image or {}).get("data_base64") or "").strip()
    if not image_base64:
        raise RuntimeError("Screenshot capture returned no image data.")
    try:
        image_bytes = base64.b64decode(image_base64)
    except Exception as exc:
        raise RuntimeError("Screenshot capture returned invalid image data.") from exc
    target.write_bytes(image_bytes)
    if not target.exists():
        raise RuntimeError("Screenshot capture did not write the output file.")
    relative_path = _relative_to_root(target, root)
    action = {
        "step_index": op_index,
        "step_number": op_index + 1,
        "tool": "screenshot.capture",
        "status": "completed",
        "summary": _operation_summary(operation, op_index),
        "action": "screenshot.capture",
        "path": relative_path,
        "file_path": relative_path,
    }
    if capability:
        action["capability"] = capability
    artifact = {
        "step_index": op_index,
        "step_number": op_index + 1,
        "tool": "screenshot.capture",
        "kind": "screenshot",
        "file_path": relative_path,
        "label": target.name,
    }
    return action, artifact


def _run_computer_control_operation(op_index: int, operation: Dict[str, Any]) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    action_name = _normalize_action_id(operation.get("action"))
    if not action_name:
        raise RuntimeError("Computer control action is required.")

    summary = _operation_summary(operation, op_index)
    action: Dict[str, Any] = {
        "step_index": op_index,
        "step_number": op_index + 1,
        "tool": "computer_control",
        "status": "completed",
        "summary": summary,
        "action": "computer_control",
        "computer_action": action_name,
    }

    if action_name == "ocr":
        text = screen_ocr(region=operation.get("region"))
        action["text_preview"] = _bounded_text(text, 1200)
        return action, None
    if action_name == "click":
        text_target = str(operation.get("text") or "").strip()
        if text_target:
            message = click_element_by_text(text_target)
        else:
            if operation.get("x") is None or operation.get("y") is None:
                raise RuntimeError("Computer click requires x/y or text.")
            message = mouse_click(operation.get("x"), operation.get("y"))
        action["summary"] = message
        return action, None
    if action_name == "type":
        text = str(operation.get("text") or "")
        action["summary"] = keyboard_type(text)
        return action, None
    if action_name == "applescript":
        script = str(operation.get("script") or "").strip()
        output = run_applescript(script)
        action["output_preview"] = _bounded_text(output, 1200)
        return action, None
    if action_name == "clipboard_read":
        text = read_clipboard()
        action["text_preview"] = _bounded_text(text, 1200)
        return action, None
    if action_name == "clipboard_write":
        text = str(operation.get("text") or "")
        action["summary"] = write_clipboard(text)
        return action, None
    if action_name == "notify":
        title = str(operation.get("title") or "").strip()
        message = str(operation.get("message") or "").strip()
        action["summary"] = send_notification(title, message)
        return action, None
    if action_name == "list_apps":
        apps = list_running_apps()
        preview_items = [str(item.get("name") or item.get("exe") or item.get("pid") or "").strip() for item in apps[:20] if isinstance(item, dict)]
        action["apps_preview"] = "\n".join(item for item in preview_items if item)
        action["app_count"] = len(apps)
        return action, None
    if action_name == "launch_app":
        name_or_path = str(operation.get("name_or_path") or "").strip()
        action["summary"] = launch_app(name_or_path)
        return action, None
    if action_name == "speak":
        text = str(operation.get("text") or "").strip()
        voice = str(operation.get("voice") or "").strip() or None
        action["summary"] = speak_text(text, voice=voice)
        return action, None
    raise RuntimeError(f"Unsupported computer control action '{action_name}'.")


def _operation_capability_id(operation: Dict[str, Any], tool_id: str) -> str:
    capability = str(operation.get("capability") or "").strip()
    if capability:
        return capability
    if tool_id == "computer_control":
        action_name = _normalize_action_id(operation.get("action"))
        if action_name:
            return f"computer_control.{action_name}"
    return tool_id or "unknown"


def _operation_risk_level(operation: Dict[str, Any], tool_id: str) -> str:
    capability_id = _operation_capability_id(operation, tool_id)
    contract = resolve_capability(capability_id)
    if contract is not None:
        return str(contract.risk_level or "medium").strip() or "medium"
    return str(ACTION_RISK_LEVELS.get(tool_id or "", "medium")).strip() or "medium"


def build_local_execution_pack_result(run: Dict[str, Any], metadata: Dict[str, Any], pack_inputs: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    run_id = str(run.get("run_id") or uuid.uuid4()).strip()
    root = _local_execution_root()
    artifacts_root = _artifact_root(root)
    operations, continue_on_error = _parse_operations(pack_inputs, metadata)
    requested_tools = [_normalize_action_id(item.get("tool") or item.get("action")) for item in operations]
    requested_tools = [tool for tool in requested_tools if tool]
    _policy_gate(metadata, requested_tools)

    outputs_actions: List[Dict[str, Any]] = []
    outputs_artifacts: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    steps: List[Dict[str, Any]] = []

    for index, operation in enumerate(operations):
        operation_row = dict(operation)
        operation_row["__step_index__"] = index
        operation_row["__execution_target__"] = metadata.get("execution_target") or "local_companion"
        operation_row["__metadata__"] = metadata
        operation_row["__browser_checkpoint__"] = (
            run.get("browser_checkpoint")
            if isinstance(run.get("browser_checkpoint"), dict)
            else metadata.get("browser_checkpoint")
            if isinstance(metadata.get("browser_checkpoint"), dict)
            else {}
        )
        tool_id = _normalize_action_id(operation_row.get("tool") or operation_row.get("action"))
        summary_label = _operation_summary(operation_row, index)
        try:
            artifacts: List[Dict[str, Any]] = []
            artifact: Optional[Dict[str, Any]] = None
            tracer = get_tracer("scripts.orion_local_worker_execution")
            with tracer.start_as_current_span("local_worker.execute_tool") as span:
                set_span_attributes(
                    span,
                    {
                        "capability_id": _operation_capability_id(operation_row, tool_id),
                        "risk_level": _operation_risk_level(operation_row, tool_id),
                        "run_id": run_id,
                        "workspace_id": str(
                            metadata.get("workspace_id")
                            or (run.get("context") if isinstance(run.get("context"), dict) else {}).get("workspace_id")
                            or "default"
                        ).strip()
                        or "default",
                        "tenant_id": str(
                            metadata.get("tenant_id")
                            or (run.get("context") if isinstance(run.get("context"), dict) else {}).get("tenant_id")
                            or "default"
                        ).strip()
                        or "default",
                        "actor_type": "worker",
                        "tool_id": tool_id or "unknown",
                    },
                )
                if tool_id == "shell.execute":
                    action, artifact = _run_shell_operation(run_id, index, operation_row, root, artifacts_root)
                elif tool_id == "filesystem.read_write":
                    action, artifact = _run_file_operation(operation_row, root, metadata)
                elif tool_id == "screenshot.capture":
                    action, artifact = _run_screenshot_operation(run_id, index, operation_row, root, artifacts_root)
                    artifacts = [artifact]
                elif tool_id == "browser_automation.interactive":
                    action, artifacts = _run_browser_operation(run_id, index, operation_row, root, artifacts_root)
                elif tool_id == "computer_control":
                    action, artifact = _run_computer_control_operation(index, operation_row)
                else:
                    raise RuntimeError(f"Unsupported local execution tool '{tool_id or 'unknown'}'.")
                set_span_attributes(
                    span,
                    {
                        "tool_status": str(action.get("status") or "completed").strip() or "completed",
                        "artifact_count": len(artifacts) if tool_id == "browser_automation.interactive" else (1 if isinstance(artifact, dict) else 0),
                    },
                )
            outputs_actions.append(action)
            if tool_id == "browser_automation.interactive":
                outputs_artifacts.extend(artifacts)
            elif isinstance(artifact, dict):
                outputs_artifacts.append(artifact)
            steps.append(
                {
                    "step_index": index,
                    "step_number": index + 1,
                    "tool": tool_id or "unknown",
                    "summary": summary_label,
                    "status": "completed",
                    "artifact_file_path": (
                        artifacts[0].get("file_path")
                        if tool_id == "browser_automation.interactive" and artifacts
                        else artifact.get("file_path")
                        if isinstance(artifact, dict)
                        else None
                    ),
                    "session_profile": action.get("session_profile"),
                    "browser_security_profile": action.get("browser_security_profile"),
                }
            )
            if tool_id == "browser_automation.interactive" and str(action.get("status") or "").strip().lower() == "waiting_for_input":
                summary = str(action.get("pause_label") or "Browser operator paused for human unblock.").strip()
                data = {
                    "pack_id": LOCAL_EXECUTION_PACK_ID,
                    "status": "waiting_for_input",
                    "summary": summary,
                    "pause_reason": action.get("pause_reason") or "human_unblock_required",
                    "browser_checkpoint": action.get("browser_checkpoint") if isinstance(action.get("browser_checkpoint"), dict) else None,
                    "inputs": {
                        "operations_requested": len(operations),
                        "local_root": str(root),
                        "continue_on_error": continue_on_error,
                    },
                    "outputs": {
                        "operations_requested": len(operations),
                        "operations_executed": len(outputs_actions),
                        "outbound_actions": 0,
                        "urgent_count": 1,
                        "steps": steps,
                        "actions": outputs_actions,
                        "artifacts": outputs_artifacts,
                        "errors": errors,
                    },
                    "next_steps": [
                        "Complete the required login or CAPTCHA on the laptop.",
                        "Resume the same run from the saved browser checkpoint.",
                    ],
                }
                raise LocalExecutionPauseRequired(
                    summary,
                    data,
                    browser_checkpoint=(action.get("browser_checkpoint") if isinstance(action.get("browser_checkpoint"), dict) else None),
                )
        except Exception as exc:
            if isinstance(exc, LocalExecutionPauseRequired):
                raise
            sentry_sdk.capture_exception(exc)
            error_row = {
                "tool": tool_id or "unknown",
                "message": str(exc),
                "index": index,
                "step_index": index,
                "step_number": index + 1,
                "summary": summary_label,
            }
            errors.append(error_row)
            steps.append(
                {
                    "step_index": index,
                    "step_number": index + 1,
                    "tool": tool_id or "unknown",
                    "summary": summary_label,
                    "status": "failed",
                    "message": str(exc),
                }
            )
            if not continue_on_error:
                raise RuntimeError(
                    f"Local execution stopped on operation {index + 1}/{len(operations)} ({tool_id or 'unknown'}): {exc}"
                ) from exc

    executed = len(outputs_actions)
    summary = f"Executed {executed} of {len(operations)} local operations."
    if errors:
        summary = f"{summary} Errors: {len(errors)}."
    data = {
        "pack_id": LOCAL_EXECUTION_PACK_ID,
        "summary": summary,
        "inputs": {
            "operations_requested": len(operations),
            "local_root": str(root),
            "continue_on_error": continue_on_error,
        },
        "outputs": {
            "operations_requested": len(operations),
            "operations_executed": executed,
            "outbound_actions": 0,
            "urgent_count": 0,
            "steps": steps,
            "actions": outputs_actions,
            "artifacts": outputs_artifacts,
            "errors": errors,
        },
        "next_steps": [
            "Review generated artifacts and previews.",
            "Keep commands and file paths inside the configured local root.",
            "Expand allow-actions deliberately before enabling broader local execution.",
        ],
    }
    return summary, data
