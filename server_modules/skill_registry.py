from __future__ import annotations

import asyncio
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal
from urllib.parse import quote_plus

from server_modules import inventory_skill, mcp_registry_service, tools_http, web_tools
from server_modules.browser_engine import BrowserEngine
from server_modules.installed_skills import list_installed_skills


SkillExecutor = Callable[..., Awaitable[dict[str, Any]]]
SkillActionClass = Literal["read", "write", "execute"]
SkillClass = Literal["system", "business", "specialist_local"]

_SUPPORTED_ACTION_CLASSES = {"read", "write", "execute"}
_SUPPORTED_RUNTIME_MODES = {"hosted_secure", "local_secure", "privileged_device"}
_SUPPORTED_SKILL_CLASSES = {"system", "business", "specialist_local"}
_URL_PATTERN = re.compile(r"https?://[^\s)]+", re.IGNORECASE)
_BUILT_IN_SOURCE = "built_in"
_ALL_RUNTIME_MODES = ("hosted_secure", "local_secure", "privileged_device")


@dataclass(frozen=True)
class SkillDefinition:
    id: str
    label: str
    description: str
    permission_label: str
    execution_mode: str
    action_class: SkillActionClass
    connector_scopes: tuple[str, ...]
    trigger_terms: tuple[str, ...]
    allowed_runtime_modes: tuple[str, ...] = _ALL_RUNTIME_MODES
    requires_approval: bool = False
    executor: SkillExecutor | None = None
    skill_class: SkillClass = "system"
    execution_adapter: str | None = None
    source: str = _BUILT_IN_SOURCE
    path: str | None = None
    enabled: bool = True


async def _manual_skill_stub(*, goal: str, agent_label: str, skill_label: str, **_: Any) -> dict[str, Any]:
    return {
        "status": "manual",
        "reply": f"{agent_label} recognizes that this request needs {skill_label}, but that skill is still waiting for a live adapter.",
        "artifact": None,
        "steps": [
            {"label": "Resolving skill requirement", "detail": goal, "status": "done", "kind": "thinking"},
            {"label": "Skill adapter unavailable", "detail": f"{skill_label} is not wired to a live execution path yet", "status": "error", "kind": "connector"},
        ],
    }


def _ordered_unique(values: list[str] | tuple[str, ...]) -> tuple[str, ...]:
    ordered: list[str] = []
    seen: set[str] = set()
    for raw in values:
        token = str(raw or "").strip()
        if not token or token in seen:
            continue
        seen.add(token)
        ordered.append(token)
    return tuple(ordered)


def _normalize_skill_class(value: Any, default: SkillClass = "specialist_local") -> SkillClass:
    token = str(value or "").strip().lower()
    if token in _SUPPORTED_SKILL_CLASSES:
        return token  # type: ignore[return-value]
    return default


def _normalize_action_class(value: Any, default: SkillActionClass = "read") -> SkillActionClass:
    token = str(value or "").strip().lower()
    if token in _SUPPORTED_ACTION_CLASSES:
        return token  # type: ignore[return-value]
    return default


def _normalize_runtime_modes(values: Any) -> tuple[str, ...]:
    modes = _ordered_unique(tuple(str(item or "").strip().lower() for item in list(values or [])))
    filtered = tuple(mode for mode in modes if mode in _SUPPORTED_RUNTIME_MODES)
    return filtered or _ALL_RUNTIME_MODES


def _normalize_trigger_terms(values: Any) -> tuple[str, ...]:
    return _ordered_unique(tuple(str(item or "").strip().lower() for item in list(values or [])))


def _normalize_connector_scopes(values: Any) -> tuple[str, ...]:
    return _ordered_unique(tuple(str(item or "").strip().lower() for item in list(values or [])))


def _search_url_from_goal(goal: str) -> str:
    direct_url = _URL_PATTERN.search(str(goal or "").strip())
    if direct_url:
        return direct_url.group(0)
    compact = str(goal or "").strip()
    query = re.sub(r"\s+", " ", compact).strip()
    return f"https://duckduckgo.com/?q={quote_plus(query)}" if query else "https://example.com"


def _build_search_reply(agent_label: str, goal: str, results: list[dict[str, str]]) -> str:
    if not results:
        return f"{agent_label} searched the public web for '{goal}' but did not find a confident result set."
    top = results[0]
    title = str(top.get("title") or top.get("url") or "Top result").strip()
    snippet = str(top.get("snippet") or "").strip()
    source = str(top.get("url") or "").strip()
    reply = f"{agent_label} found public sources for '{goal}'. Top result: {title}."
    if snippet:
        reply += f" {snippet}"
    if source:
        reply += f" Source: {source}"
    return reply.strip()


def _search_artifact(goal: str, results: list[dict[str, str]]) -> dict[str, Any]:
    lines = ["# Web search results", "", f"Goal: {goal}", ""]
    if not results:
        lines.append("No results found.")
    for index, item in enumerate(results, start=1):
        title = str(item.get("title") or item.get("url") or "Untitled result").strip()
        url = str(item.get("url") or "").strip()
        snippet = str(item.get("snippet") or "").strip()
        lines.append(f"{index}. {title}")
        if url:
            lines.append(f"   - URL: {url}")
        if snippet:
            lines.append(f"   - Snippet: {snippet}")
    return {
        "label": "Web search result",
        "kind": "web-search-results",
        "summary": f"{len(results)} public result(s) returned for the current goal.",
        "media_type": "text/markdown",
        "preview_content": "\n".join(lines)[:12000],
    }


async def _live_web_search(
    *,
    goal: str,
    agent_label: str,
    hard_context: str,
    operational_policy: str,
    **_: Any,
) -> dict[str, Any]:
    del hard_context, operational_policy
    query = str(goal or "").strip()
    if not query:
        return {
            "status": "no_query",
            "reply": f"{agent_label} needs a search query before it can use Web Search.",
            "artifact": None,
            "steps": [
                {"label": "Resolving public research request", "detail": "Missing query", "status": "error", "kind": "thinking"},
            ],
        }
    response = await tools_http.http_request(
        method="GET",
        url=f"https://html.duckduckgo.com/html/?q={quote_plus(query)}",
        headers={"User-Agent": web_tools.DEFAULT_USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
    )
    html_body = str(response.get("body") or "")
    results = web_tools._parse_html_results(html_body) or web_tools._parse_lite_results(html_body)
    return {
        "status": "ok" if results else "no_match",
        "reply": _build_search_reply(agent_label, query, results),
        "artifact": _search_artifact(query, results),
        "steps": [
            {"label": "Resolving public research request", "detail": query, "status": "done", "kind": "thinking"},
            {"label": "Searching public sources", "detail": f"{len(results)} result(s) parsed from DuckDuckGo HTML", "status": "done", "kind": "connector"},
        ],
        "results": results,
    }


async def _live_browser_skill(
    *,
    goal: str,
    agent_label: str,
    hard_context: str,
    operational_policy: str,
    **_: Any,
) -> dict[str, Any]:
    del hard_context, operational_policy
    target_url = _search_url_from_goal(goal)
    browser = BrowserEngine()
    navigation = await browser.navigate(target_url)
    observation = await browser.observe()
    preview = str(observation.get("text") or "").strip()
    current_url = str(observation.get("url") or navigation.get("url") or target_url).strip()
    title = str(observation.get("title") or navigation.get("title") or current_url).strip()
    reply = f"{agent_label} opened {title or current_url}."
    if preview:
        reply += f" Preview: {preview[:320].strip()}"
    return {
        "status": "ok",
        "reply": reply.strip(),
        "artifact": {
            "label": title or "Browser observation",
            "kind": "browser-observation",
            "summary": f"Observed {current_url or target_url}",
            "media_type": "application/json",
            "preview_content": json.dumps(
                {
                    "url": current_url,
                    "title": title,
                    "text": preview[:2000],
                    "interactive_count": len(list(observation.get("interactive_elements") or [])),
                    "screenshot_path": str(observation.get("screenshot_path") or "").strip() or None,
                },
                ensure_ascii=False,
                indent=2,
            )[:12000],
        },
        "steps": [
            {"label": "Resolving browser goal", "detail": goal, "status": "done", "kind": "thinking"},
            {"label": "Opening browser target", "detail": target_url, "status": "done", "kind": "connector"},
            {"label": "Observing current page", "detail": title or current_url or target_url, "status": "done", "kind": "connector"},
        ],
        "observation": observation,
        "navigation": navigation,
    }


async def _execute_handler_skill(
    definition: SkillDefinition,
    *,
    tenant_id: str,
    workspace_id: str,
    goal: str,
    agent_label: str,
    hard_context: str,
    operational_policy: str,
    seed_demo_if_empty: bool = False,
) -> dict[str, Any]:
    skill_path = Path(str(definition.path or "")).expanduser().resolve()
    handler_path = skill_path / "handler.py"
    if not handler_path.exists():
        handler_path = skill_path / "query_handler.py"
    if not handler_path.exists():
        return await _manual_skill_stub(goal=goal, agent_label=agent_label, skill_label=definition.label)
    payload = {
        "mode": "execute_skill",
        "skill_id": definition.id,
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "goal": goal,
        "agent_label": agent_label,
        "hard_context": hard_context,
        "operational_policy": operational_policy,
        "seed_demo_if_empty": bool(seed_demo_if_empty),
    }

    def _run_handler() -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            [sys.executable, str(handler_path)],
            input=json.dumps(payload).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(skill_path),
            check=False,
            timeout=12,
        )

    completed = await asyncio.to_thread(_run_handler)
    raw_stdout = (completed.stdout or b"").decode("utf-8", "ignore").strip()
    raw_stderr = (completed.stderr or b"").decode("utf-8", "ignore").strip()
    if completed.returncode != 0:
        return {
            "status": "error",
            "reply": f"{agent_label} could not execute {definition.label} right now.",
            "artifact": None,
            "steps": [
                {"label": "Resolving skill handler", "detail": definition.id, "status": "done", "kind": "thinking"},
                {"label": "Handler execution failed", "detail": raw_stderr or raw_stdout or f"exit_{completed.returncode}", "status": "error", "kind": "connector"},
            ],
        }
    try:
        parsed = json.loads(raw_stdout) if raw_stdout else {}
    except Exception:
        parsed = {"reply": raw_stdout}
    if isinstance(parsed, dict):
        result = dict(parsed)
        result.setdefault("status", "ok")
        result.setdefault("reply", raw_stdout or f"{definition.label} completed.")
        result.setdefault("artifact", None)
        result.setdefault(
            "steps",
            [
                {"label": "Resolving skill handler", "detail": definition.id, "status": "done", "kind": "thinking"},
                {"label": "Handler execution complete", "detail": definition.label, "status": "done", "kind": "connector"},
            ],
        )
        return result
    return {
        "status": "ok",
        "reply": raw_stdout or f"{definition.label} completed.",
        "artifact": None,
        "steps": [
            {"label": "Resolving skill handler", "detail": definition.id, "status": "done", "kind": "thinking"},
            {"label": "Handler execution complete", "detail": definition.label, "status": "done", "kind": "connector"},
        ],
    }


_ADAPTER_EXECUTORS: dict[str, SkillExecutor] = {
    "web_search": _live_web_search,
    "browser": _live_browser_skill,
    "inventory": inventory_skill.execute_inventory_skill,
}


_BUILT_IN_SKILLS: tuple[SkillDefinition, ...] = (
    SkillDefinition(
        id="email-access",
        label="Email Access",
        description="Read, draft, and route customer emails.",
        permission_label="Inbox scope",
        execution_mode="manual",
        action_class="write",
        connector_scopes=("email",),
        trigger_terms=("email", "inbox", "reply", "respond by email"),
        requires_approval=True,
        skill_class="system",
    ),
    SkillDefinition(
        id="web-search",
        label="Web Search",
        description="Research public facts and retrieve references.",
        permission_label="Public web",
        execution_mode="live",
        action_class="read",
        connector_scopes=("web",),
        trigger_terms=("latest", "research", "search", "find online", "web", "source", "look up", "compare"),
        executor=_live_web_search,
        execution_adapter="web_search",
        skill_class="system",
    ),
    SkillDefinition(
        id="browser",
        label="Browser",
        description="Open a page in the browser runtime and return the current page state.",
        permission_label="Browser runtime",
        execution_mode="live",
        action_class="read",
        connector_scopes=("browser",),
        trigger_terms=("browser", "browse", "open site", "open website", "navigate", "inspect page", "open http", "open https"),
        executor=_live_browser_skill,
        execution_adapter="browser",
        skill_class="system",
    ),
    SkillDefinition(
        id="calendar-access",
        label="Calendar Access",
        description="Create, move, or confirm appointments.",
        permission_label="Calendar scope",
        execution_mode="manual",
        action_class="write",
        connector_scopes=("calendar",),
        trigger_terms=("appointment", "book", "schedule", "calendar", "reschedule"),
        requires_approval=True,
        skill_class="system",
    ),
    SkillDefinition(
        id="task-runner",
        label="Task Runner",
        description="Execute operational tools behind approvals.",
        permission_label="Operational tools",
        execution_mode="manual",
        action_class="execute",
        connector_scopes=("task_runner",),
        allowed_runtime_modes=("local_secure", "privileged_device"),
        requires_approval=True,
        trigger_terms=("run task", "execute", "automation", "update system"),
        skill_class="system",
    ),
    SkillDefinition(
        id="inventory-tool",
        label="Inventory Tool",
        description="Check stock, fitment, and availability from the workspace inventory table.",
        permission_label="Inventory scope",
        execution_mode="live",
        action_class="read",
        connector_scopes=("inventory",),
        trigger_terms=("inventory", "stock", "availability", "fitment", "sku", "part", "parts", "wiper", "brake", "rotor", "filter", "tesla", "toyota", "model 3", "eta", "delivery"),
        executor=inventory_skill.execute_inventory_skill,
        execution_adapter="inventory",
        skill_class="business",
    ),
    SkillDefinition(
        id="crm-notes",
        label="CRM Notes",
        description="Write structured conversation notes back to the system of record.",
        permission_label="CRM writeback",
        execution_mode="manual",
        action_class="write",
        connector_scopes=("crm",),
        requires_approval=True,
        trigger_terms=("crm", "lead note", "follow up note", "save note"),
        skill_class="system",
    ),
)


def _definition_from_installed_skill(item: dict[str, Any]) -> SkillDefinition | None:
    skill_id = str(item.get("id") or "").strip()
    if not skill_id:
        return None
    runtime_metadata = dict(item.get("runtime_metadata") or {}) if isinstance(item.get("runtime_metadata"), dict) else {}
    execution_adapter = str(runtime_metadata.get("execution_adapter") or "").strip().lower()
    has_query_handler = bool(item.get("has_query_handler"))
    if not execution_adapter and not has_query_handler:
        return None
    executor: SkillExecutor | None = _ADAPTER_EXECUTORS.get(execution_adapter) if execution_adapter else None
    if executor is None and execution_adapter not in {"", "handler"} and not has_query_handler:
        return None
    if executor is None and (execution_adapter == "handler" or has_query_handler):
        execution_adapter = "handler"
    label = str(item.get("name") or skill_id).strip() or skill_id
    description = str(item.get("description") or "").strip() or f"{label} skill."
    connector_scopes = _normalize_connector_scopes(runtime_metadata.get("connector_scopes") or ())
    trigger_terms = _normalize_trigger_terms(runtime_metadata.get("trigger_terms") or ())
    permission_label = str(runtime_metadata.get("permission_label") or label).strip() or label
    execution_mode = str(runtime_metadata.get("execution_mode") or ("live" if execution_adapter else "manual")).strip().lower() or "manual"
    return SkillDefinition(
        id=skill_id,
        label=label,
        description=description,
        permission_label=permission_label,
        execution_mode=execution_mode,
        action_class=_normalize_action_class(runtime_metadata.get("action_class"), "read"),
        connector_scopes=connector_scopes,
        trigger_terms=trigger_terms,
        allowed_runtime_modes=_normalize_runtime_modes(runtime_metadata.get("allowed_runtime_modes") or ()),
        requires_approval=bool(runtime_metadata.get("requires_approval")),
        executor=executor,
        skill_class=_normalize_skill_class(runtime_metadata.get("skill_class"), "specialist_local"),
        execution_adapter=execution_adapter or None,
        source=str(item.get("source") or "workspace").strip() or "workspace",
        path=str(item.get("path") or "").strip() or None,
        enabled=bool(item.get("enabled")),
    )


def _definition_from_mcp_skill_entry(item: dict[str, Any]) -> SkillDefinition | None:
    skill_id = str(item.get("id") or "").strip()
    if not skill_id:
        return None
    metadata = dict(item.get("metadata") or {}) if isinstance(item.get("metadata"), dict) else {}
    return SkillDefinition(
        id=skill_id,
        label=str(item.get("label") or skill_id).strip() or skill_id,
        description=str(item.get("description") or "").strip() or f"{skill_id} MCP tool.",
        permission_label=str(item.get("permission_label") or item.get("server_id") or "MCP server").strip() or "MCP server",
        execution_mode=str(item.get("execution_mode") or "live").strip().lower() or "live",
        action_class=_normalize_action_class(item.get("action_class"), "read"),
        connector_scopes=_normalize_connector_scopes(item.get("connector_scopes") or ()),
        trigger_terms=_normalize_trigger_terms(item.get("trigger_terms") or ()),
        allowed_runtime_modes=_normalize_runtime_modes(item.get("allowed_runtime_modes") or ()),
        requires_approval=bool(item.get("requires_approval")),
        skill_class=_normalize_skill_class(item.get("skill_class"), "specialist_local"),
        execution_adapter=str(item.get("execution_adapter") or "mcp_tool").strip().lower() or "mcp_tool",
        source=str(item.get("source") or "mcp_registry").strip() or "mcp_registry",
        path=str(item.get("path") or metadata.get("endpoint") or "").strip() or None,
        enabled=bool(item.get("enabled", True)),
    )


def _skill_registry_map(*, workspace_id: str | None = None, include_disabled: bool = False) -> dict[str, SkillDefinition]:
    merged: dict[str, SkillDefinition] = {definition.id: definition for definition in _BUILT_IN_SKILLS}
    for item in list_installed_skills(workspace_id=workspace_id):
        definition = _definition_from_installed_skill(item)
        if definition is None:
            continue
        if not include_disabled and not definition.enabled:
            if definition.id in merged:
                merged.pop(definition.id, None)
            continue
        merged[definition.id] = definition
    normalized_workspace_id = str(workspace_id or "").strip()
    if normalized_workspace_id:
        for item in mcp_registry_service.list_workspace_mcp_skill_entries(normalized_workspace_id):
            definition = _definition_from_mcp_skill_entry(item)
            if definition is None:
                continue
            if not include_disabled and not definition.enabled:
                if definition.id in merged:
                    merged.pop(definition.id, None)
                continue
            merged[definition.id] = definition
    return merged


def get_skill_definition(skill_id: str, *, workspace_id: str | None = None, include_disabled: bool = False) -> SkillDefinition | None:
    normalized = str(skill_id or "").strip()
    if not normalized:
        return None
    return _skill_registry_map(workspace_id=workspace_id, include_disabled=include_disabled).get(normalized)


def list_skill_definitions(*, workspace_id: str | None = None, include_disabled: bool = False) -> list[SkillDefinition]:
    return list(_skill_registry_map(workspace_id=workspace_id, include_disabled=include_disabled).values())


def skill_connector_scopes(skill_ids: list[str] | tuple[str, ...], *, workspace_id: str | None = None) -> list[str]:
    scopes: list[str] = []
    for skill_id in skill_ids:
        definition = get_skill_definition(skill_id, workspace_id=workspace_id)
        if definition is None:
            continue
        for scope in definition.connector_scopes:
            if scope not in scopes:
                scopes.append(scope)
    return scopes


def detect_skill_need(goal: str, *, workspace_id: str | None = None) -> SkillDefinition | None:
    normalized = str(goal or "").strip().lower()
    if not normalized:
        return None
    best_match: SkillDefinition | None = None
    best_score = -1
    for skill in list_skill_definitions(workspace_id=workspace_id):
        matched_terms = [len(term) for term in skill.trigger_terms if term and term in normalized]
        if not matched_terms:
            continue
        score = max(matched_terms)
        if score > best_score:
            best_score = score
            best_match = skill
    return best_match


async def execute_skill(
    *,
    skill_id: str,
    tenant_id: str,
    workspace_id: str,
    goal: str,
    agent_label: str,
    hard_context: str,
    operational_policy: str,
    seed_demo_if_empty: bool = False,
) -> dict[str, Any]:
    definition = get_skill_definition(skill_id, workspace_id=workspace_id, include_disabled=True)
    if definition is None:
        return {
            "status": "missing",
            "reply": f"The requested skill {skill_id} is not registered in the universal harness.",
            "artifact": None,
            "steps": [
                {"label": "Resolving skill registry", "detail": skill_id, "status": "error", "kind": "connector"},
            ],
        }

    if not definition.enabled:
        return {
            "status": "disabled",
            "reply": f"{agent_label} recognizes that this request needs {definition.label}, but that skill is disabled for this workspace.",
            "artifact": None,
            "steps": [
                {"label": "Resolving skill registry", "detail": definition.id, "status": "done", "kind": "thinking"},
                {"label": "Workspace skill state", "detail": f"{definition.label} is disabled", "status": "error", "kind": "connector"},
            ],
        }

    if definition.executor is not None:
        return await definition.executor(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            goal=goal,
            agent_label=agent_label,
            hard_context=hard_context,
            operational_policy=operational_policy,
            seed_demo_if_empty=seed_demo_if_empty,
        )

    if definition.execution_adapter == "handler":
        return await _execute_handler_skill(
            definition,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            goal=goal,
            agent_label=agent_label,
            hard_context=hard_context,
            operational_policy=operational_policy,
            seed_demo_if_empty=seed_demo_if_empty,
        )

    if definition.execution_adapter == "mcp_tool":
        return await mcp_registry_service.invoke_workspace_mcp_skill_async(
            workspace_id=workspace_id,
            skill_id=definition.id,
            goal=goal,
            agent_label=agent_label,
        )

    return await _manual_skill_stub(goal=goal, agent_label=agent_label, skill_label=definition.label)
