import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

try:
    from scripts.platform_execution import (
        capability_command,
        capability_metadata,
        capability_tool_id,
        command_spec_from_operation,
        default_local_companion_allow_prefixes,
        electron_command,
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
        electron_command,
        match_allowed_argv,
        screenshot_command,
        supports_capability,
    )


LOCAL_EXECUTION_PACK_ID = "local-execution-v1"
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
    return str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")


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


def _run_browser_capture_task(
    url: str,
    screenshot_target: Path,
    *,
    session_profile: str = "",
    download_dir: Optional[Path] = None,
    browser_actions: Optional[List[Dict[str, Any]]] = None,
    wait_for_selector: str = "",
    click_selector: str = "",
    type_selector: str = "",
    type_text: str = "",
    timeout_seconds: int = 45,
) -> Dict[str, Any]:
    project_root = _project_root()
    desktop_root = project_root / "desktop"
    task_script = desktop_root / "browser_task.js"
    if not task_script.exists():
        raise RuntimeError("Missing desktop/browser_task.js for browser capture.")

    task_id = uuid.uuid4().hex
    payload_path = desktop_root / f".browser-task-payload-{task_id}.json"
    output_path = desktop_root / f".browser-task-output-{task_id}.json"
    payload = {
        "mode": "capture_page",
        "url": url,
        "screenshotPath": str(screenshot_target),
        "downloadDir": str(download_dir) if download_dir else "",
        "sessionProfile": session_profile,
        "browserActions": browser_actions or [],
        "waitForSelector": wait_for_selector,
        "clickSelector": click_selector,
        "typeSelector": type_selector,
        "typeText": type_text,
        "timeoutMs": timeout_seconds * 1000,
        "settleMs": 1200,
    }
    payload_path.write_text(json.dumps(payload), encoding="utf-8")
    if output_path.exists():
        output_path.unlink()
    command = electron_command(project_root) + [str(task_script), "--payload", str(payload_path), "--output", str(output_path)]
    completed = subprocess.run(
        command,
        cwd=str(desktop_root),
        capture_output=True,
        text=True,
        timeout=timeout_seconds + 10,
        check=False,
    )
    try:
        if completed.returncode != 0:
            message = _bounded_text(completed.stderr or completed.stdout or "Browser capture failed.", 1000)
            raise RuntimeError(message)
        if not output_path.exists():
            raise RuntimeError("Browser capture did not produce output metadata.")
        result = json.loads(output_path.read_text(encoding="utf-8"))
        if not isinstance(result, dict) or not result.get("ok"):
            raise RuntimeError("Browser capture returned an invalid result.")
        return result
    finally:
        try:
            payload_path.unlink(missing_ok=True)
        except Exception:
            pass
        try:
            output_path.unlink(missing_ok=True)
        except Exception:
            pass


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
            if action not in {"wait", "type", "click", "navigate", "sleep", "select", "upload", "extract", "open_tab", "switch_tab", "close_tab", "download", "open_popup"}:
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


def _run_browser_operation(run_id: str, op_index: int, operation: Dict[str, Any], root: Path, artifacts_root: Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    mode = _normalize_action_id(operation.get("mode") or "extract_text")
    if mode not in {"extract_text", "extract_links", "save_html", "capture_page"}:
        raise RuntimeError("Browser mode must be extract_text, extract_links, save_html, or capture_page.")
    url = _validate_browser_url(operation.get("url"))
    if mode == "capture_page":
        screenshot_target, report_target = _browser_capture_artifact_paths(run_id, op_index, operation, root, artifacts_root)
        download_dir = _browser_download_dir(run_id, op_index, artifacts_root)
        session_profile = str(operation.get("session_profile") or operation.get("sessionProfile") or "").strip()
        browser_actions = _normalize_browser_actions(operation, root)
        browser_security_profile = _browser_security_profile(session_profile, browser_actions)
        capture_result = _run_browser_capture_task(
            url,
            screenshot_target,
            session_profile=session_profile,
            download_dir=download_dir,
            browser_actions=browser_actions,
        )
        links = capture_result.get("links") if isinstance(capture_result.get("links"), list) else []
        downloads = capture_result.get("downloads") if isinstance(capture_result.get("downloads"), list) else []
        report_lines = [
            f"URL: {capture_result.get('finalUrl') or url}",
            f"Title: {capture_result.get('title') or '-'}",
            f"Session profile: {session_profile or '-'}",
            f"Security profile: {browser_security_profile}",
            f"Screenshot: {_relative_to_root(screenshot_target, root)}",
            "",
            "Text preview:",
            _bounded_text(capture_result.get("textPreview") or "", 2000),
        ]
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
        report_target.write_text("\n".join(report_lines).strip(), encoding="utf-8")
        action = {
            "step_index": op_index,
            "step_number": op_index + 1,
            "tool": "browser_automation",
            "status": "completed",
            "summary": _operation_summary(operation, op_index),
            "action": "browser_automation",
            "mode": mode,
            "url": str(capture_result.get("finalUrl") or url),
            "title": str(capture_result.get("title") or ""),
            "text_preview": _bounded_text(capture_result.get("textPreview") or "", 2000),
            "links_count": len(links),
            "file_path": _relative_to_root(screenshot_target, root),
            "report_file_path": _relative_to_root(report_target, root),
            "session_profile": session_profile or None,
            "browser_security_profile": browser_security_profile,
            "browser_actions": browser_actions,
            "action_results": action_results,
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
                "tool": "browser_automation",
                "kind": "screenshot",
                "file_path": _relative_to_root(screenshot_target, root),
                "label": screenshot_target.name,
            },
            {
                "step_index": op_index,
                "step_number": op_index + 1,
                "tool": "browser_automation",
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
                    "tool": "browser_automation",
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
        "tool": "browser_automation",
        "status": "completed",
        "summary": _operation_summary(operation, op_index),
        "action": "browser_automation",
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
            "tool": "browser_automation",
            "kind": "file",
            "file_path": _relative_to_root(report_target, root),
            "label": report_target.name,
        },
        {
            "step_index": op_index,
            "step_number": op_index + 1,
            "tool": "browser_automation",
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


def _parse_operations(pack_inputs: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], bool]:
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
            or ("execute_shell_command" if str(candidate.get("command") or "").strip() or isinstance(candidate.get("argv"), list) else "")
            or ("browser_automation" if str(candidate.get("url") or "").strip() else "")
            or ("capture_screenshot" if bool(candidate.get("screenshot")) else "")
        )
        if not inferred_tool and str(candidate.get("path") or candidate.get("file_path") or "").strip():
            inferred_tool = "read_write_files"
        if inferred_tool:
            candidate["tool"] = inferred_tool
            operations.append(candidate)
    if not operations:
        raise RuntimeError("local-execution-v1 requires at least one operation.")
    if len(operations) > 12:
        raise RuntimeError("local-execution-v1 supports at most 12 operations per run.")
    return operations, continue_on_error


def _operation_summary(operation: Dict[str, Any], fallback_index: int) -> str:
    tool_id = _normalize_action_id(operation.get("tool") or operation.get("action"))
    if tool_id == "execute_shell_command":
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
    if tool_id == "capture_screenshot":
        capability = str(operation.get("capability") or "").strip()
        if capability:
            detail = capability_metadata(capability, _project_root())
            title = str(detail.get("title") or "").strip() if isinstance(detail, dict) else ""
            if title:
                target = str(operation.get("path") or operation.get("file_path") or "").strip()
                return f"{title} -> {target}" if target else title
        target = str(operation.get("path") or operation.get("file_path") or "").strip()
        return target or f"Screenshot {fallback_index + 1}"
    if tool_id == "browser_automation":
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
        "tool": "execute_shell_command",
        "status": "completed",
        "summary": _operation_summary(operation, op_index),
        "action": "execute_shell_command",
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
        "tool": "execute_shell_command",
        "kind": "report",
        "file_path": _relative_to_root(log_path, root),
        "label": log_path.name,
    }
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {completed.returncode}: {display_command}")
    return action, artifact


def _run_file_operation(operation: Dict[str, Any], root: Path) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    mode = _normalize_action_id(operation.get("mode") or "read")
    if mode not in {"read", "write", "append", "delete"}:
        raise RuntimeError("read_write_files mode must be read, write, append, or delete.")
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
            "tool": "read_write_files",
            "status": "completed",
            "summary": _operation_summary(operation, int(operation.get("__step_index__") or 0)),
            "action": "read_write_files",
            "mode": mode,
            "path": relative_path,
            "file_path": relative_path,
            "bytes_read": len(content.encode("utf-8")),
            "content_preview": _bounded_text(content),
        }
        artifact = {
            "step_index": int(operation.get("__step_index__") or 0),
            "step_number": int(operation.get("__step_index__") or 0) + 1,
            "tool": "read_write_files",
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
            "tool": "read_write_files",
            "status": "completed",
            "summary": _operation_summary(operation, int(operation.get("__step_index__") or 0)),
            "action": "read_write_files",
            "mode": mode,
            "path": relative_path,
            "file_path": relative_path,
        }
        artifact = {
            "step_index": int(operation.get("__step_index__") or 0),
            "step_number": int(operation.get("__step_index__") or 0) + 1,
            "tool": "read_write_files",
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
        "tool": "read_write_files",
        "status": "completed",
        "summary": _operation_summary(operation, int(operation.get("__step_index__") or 0)),
        "action": "read_write_files",
        "mode": mode,
        "path": relative_path,
        "file_path": relative_path,
        "bytes_written": len(content.encode("utf-8")),
    }
    artifact = {
        "step_index": int(operation.get("__step_index__") or 0),
        "step_number": int(operation.get("__step_index__") or 0) + 1,
        "tool": "read_write_files",
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
    command = _screenshot_command(target)
    completed = subprocess.run(command, capture_output=True, text=True, timeout=20, check=False)
    if completed.returncode != 0 or not target.exists():
        raw_message = _bounded_text(completed.stderr or completed.stdout or "Screenshot capture failed.")
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
    relative_path = _relative_to_root(target, root)
    action = {
        "step_index": op_index,
        "step_number": op_index + 1,
        "tool": "capture_screenshot",
        "status": "completed",
        "summary": _operation_summary(operation, op_index),
        "action": "capture_screenshot",
        "path": relative_path,
        "file_path": relative_path,
    }
    if capability:
        action["capability"] = capability
    artifact = {
        "step_index": op_index,
        "step_number": op_index + 1,
        "tool": "capture_screenshot",
        "kind": "screenshot",
        "file_path": relative_path,
        "label": target.name,
    }
    return action, artifact


def build_local_execution_pack_result(run: Dict[str, Any], metadata: Dict[str, Any], pack_inputs: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    run_id = str(run.get("run_id") or uuid.uuid4()).strip()
    root = _local_execution_root()
    artifacts_root = _artifact_root(root)
    operations, continue_on_error = _parse_operations(pack_inputs)
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
        tool_id = _normalize_action_id(operation_row.get("tool") or operation_row.get("action"))
        summary_label = _operation_summary(operation_row, index)
        try:
            if tool_id == "execute_shell_command":
                action, artifact = _run_shell_operation(run_id, index, operation_row, root, artifacts_root)
            elif tool_id == "read_write_files":
                action, artifact = _run_file_operation(operation_row, root)
            elif tool_id == "capture_screenshot":
                action, artifact = _run_screenshot_operation(run_id, index, operation_row, root, artifacts_root)
                artifacts = [artifact]
            elif tool_id == "browser_automation":
                action, artifacts = _run_browser_operation(run_id, index, operation_row, root, artifacts_root)
            else:
                raise RuntimeError(f"Unsupported local execution tool '{tool_id or 'unknown'}'.")
            outputs_actions.append(action)
            outputs_artifacts.extend(artifacts if tool_id == "browser_automation" else [artifact])
            steps.append(
                {
                    "step_index": index,
                    "step_number": index + 1,
                    "tool": tool_id or "unknown",
                    "summary": summary_label,
                    "status": "completed",
                    "artifact_file_path": (artifacts[0].get("file_path") if tool_id == "browser_automation" else artifact.get("file_path")),
                    "session_profile": action.get("session_profile"),
                    "browser_security_profile": action.get("browser_security_profile"),
                }
            )
        except Exception as exc:
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
