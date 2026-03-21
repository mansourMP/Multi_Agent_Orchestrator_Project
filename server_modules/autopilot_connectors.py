from __future__ import annotations
import asyncio, os, json, time, threading, base64, certifi, html, ssl, re, uuid, mimetypes
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, quote_plus, parse_qs
from urllib import request as urlrequest, error as urlerror
from scripts.platform_execution import stack_start_command_hint
from server_modules.automation_intents import classify_automation_intent, looks_like_camera_source
from server_modules.installed_skills import query_active_installed_skills
try:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client
except Exception:  # pragma: no cover - optional until MCP dependency is installed
    ClientSession = None  # type: ignore[assignment]
    streamable_http_client = None  # type: ignore[assignment]
try:
    from fastapi import Request, Response
except Exception:  # pragma: no cover - test fallback when FastAPI is unavailable
    class Request:  # type: ignore[override]
        pass

    class Response:  # type: ignore[override]
        pass

_server = None
_SYNC_SERVER_GLOBALS = (
    "TELEGRAM_AUTOPILOT_THREAD",
    "TELEGRAM_AUTOPILOT_STATE",
    "WHATSAPP_AUTOPILOT_STATE",
)

_AUTOPILOT_ERROR_CATEGORY_HINTS = (
    ("timed out", "timeout"),
    ("timeout", "timeout"),
    ("connection reset", "connection_reset"),
    ("reset by peer", "connection_reset"),
    ("temporarily unavailable", "network"),
    ("name or service not known", "network"),
    ("network is unreachable", "network"),
    ("connection refused", "network"),
    ("forbidden", "auth"),
    ("unauthorized", "auth"),
    ("invalid api key", "auth"),
    ("authentication", "auth"),
    ("429", "rate_limit"),
    ("too many requests", "rate_limit"),
    ("rate limit", "rate_limit"),
    ("not found", "not_found"),
    ("missing bot_token", "invalid_config"),
    ("missing chat_id", "invalid_config"),
    ("missing account sid", "invalid_config"),
    ("missing auth token", "invalid_config"),
    ("missing from number", "invalid_config"),
    ("no matching whatsapp connector", "connector_match"),
)

_AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS = (
    "missing scopes",
    "api.responses.write",
    "invalid api key",
    "incorrect api key",
    "unauthorized",
    "forbidden",
    "no credentials available",
    "api key is required",
    "api_key is required",
    "reconnect your ai account",
)

_AUTOPILOT_EVENT_DEDUP_LOCK = threading.Lock()
_AUTOPILOT_EVENT_DEDUP: Dict[str, float] = {}

EMPYRALIS_STATE_HOME = Path(
    os.getenv("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
EMPYRALIST_MCP_URL = os.getenv("EMPYRALIST_MCP_URL", "http://127.0.0.1:8001/mcp").strip() or "http://127.0.0.1:8001/mcp"
EMPYRALIST_RUNTIME_URL = os.getenv("EMPYRALIST_RUNTIME_URL", "http://127.0.0.1:8001").strip().rstrip("/") or "http://127.0.0.1:8001"
EMPYRALIST_WORKFLOW_API_URL = os.getenv("EMPYRALIST_WORKFLOW_API_URL", "http://127.0.0.1:4000/api/v1").strip().rstrip("/") or "http://127.0.0.1:4000/api/v1"
EMPYRALIST_WEB_URL = os.getenv("EMPYRALIST_WEB_URL", "http://127.0.0.1:3000").strip().rstrip("/") or "http://127.0.0.1:3000"


def _resolve_state_file(env_name: str, default_relative: str, legacy_filename: Optional[str] = None) -> Path:
    explicit = os.getenv(env_name)
    if explicit is not None and explicit.strip():
        return Path(explicit.strip()).expanduser()
    preferred = (EMPYRALIS_STATE_HOME / default_relative).expanduser()
    if legacy_filename:
        legacy_path = Path(legacy_filename)
        if legacy_path.exists() and not preferred.exists():
            return legacy_path
    return preferred


def _resolve_state_dir(env_name: str, default_relative: str, legacy_dirname: Optional[str] = None) -> Path:
    explicit = os.getenv(env_name)
    if explicit is not None and explicit.strip():
        return Path(explicit.strip()).expanduser()
    preferred = (EMPYRALIS_STATE_HOME / default_relative).expanduser()
    if legacy_dirname:
        legacy_path = Path(legacy_dirname)
        if legacy_path.exists() and not preferred.exists():
            return legacy_path
    return preferred


ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE = _resolve_state_file(
    "ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE",
    "channels/telegram/camera_setup_state.json",
    ".orion_telegram_camera_setup_state.json",
)


def _telegram_space_catalog() -> List[Dict[str, str]]:
    spaces_root = PROJECT_ROOT / "spaces"
    if not spaces_root.exists():
        return []
    items: List[Dict[str, str]] = []
    for space_dir in sorted([item for item in spaces_root.iterdir() if item.is_dir() and not item.name.startswith("_")], key=lambda item: item.name.lower()):
        config_path = space_dir / "config.json"
        config: Dict[str, Any] = {}
        try:
            parsed = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}
            config = parsed if isinstance(parsed, dict) else {}
        except Exception:
            config = {}
        aliases = config.get("aliases") if isinstance(config.get("aliases"), list) else []
        tokens = [space_dir.name, str(config.get("space_name") or "").strip()]
        tokens.extend(str(alias).strip() for alias in aliases if str(alias).strip())
        items.append(
            {
                "space_id": space_dir.name,
                "space_name": str(config.get("space_name") or space_dir.name).strip() or space_dir.name,
                "tokens": "|".join(token.lower() for token in tokens if token),
            }
        )
    return items


def _telegram_looks_like_space_question(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    cue_tokens = (" pool ", " lobby ", " breakfast ", " hallway ", " parking ", " gym ", " cafeteria ", " open", " busy", " people", " occupancy", " crowd", " clear")
    if any(token in f" {normalized} " for token in cue_tokens):
        return True
    return normalized.startswith("is the ") or normalized.startswith("how many ")


def _telegram_resolve_space_id(question: str) -> Optional[str]:
    normalized = f" {str(question or '').strip().lower()} "
    catalog = _telegram_space_catalog()
    for item in catalog:
        for token in [part for part in str(item.get("tokens") or "").split("|") if part]:
            if f" {token} " in normalized:
                return str(item.get("space_id") or "").strip() or None
    for candidate in catalog:
        if str(candidate.get("space_id") or "").strip() == "pool":
            return "pool"
    if len(catalog) == 1:
        return str(catalog[0].get("space_id") or "").strip() or None
    return str(catalog[0].get("space_id") or "").strip() or None if catalog else None


def _mcp_result_payload(result: Any) -> Dict[str, Any]:
    structured = getattr(result, "structuredContent", None)
    if isinstance(structured, dict):
        return structured
    content = getattr(result, "content", None)
    if isinstance(content, list):
        for item in content:
            text = getattr(item, "text", None)
            if isinstance(text, str) and text.strip():
                try:
                    parsed = json.loads(text)
                    if isinstance(parsed, dict):
                        return parsed
                except Exception:
                    return {"text": text.strip()}
    return {}


async def _telegram_space_status_via_mcp_async(space_id: str) -> Dict[str, Any]:
    if ClientSession is None or streamable_http_client is None:
        return {}
    async with streamable_http_client(EMPYRALIST_MCP_URL) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.call_tool("get_space_status", {"space_id": space_id})
    return _mcp_result_payload(result)


def _telegram_render_space_answer(question: str, state: Dict[str, Any], space_id: str) -> str:
    normalized = str(question or "").strip().lower()
    space_name = str(state.get("space_name") or state.get("space_id") or space_id).strip() or space_id
    status = str(state.get("status") or "unknown").strip() or "unknown"
    occupancy = int(state.get("occupancy_count") or 0)
    timestamp = str(state.get("timestamp") or "").strip()
    if "how many" in normalized or "people" in normalized or "occupancy" in normalized:
        return f"{space_name} currently has {occupancy} people. Last update: {timestamp or 'unknown'}."
    if "busy" in normalized or "crowded" in normalized:
        if "busy" in status:
            return f"Yes. {space_name} is busy right now. Current occupancy is {occupancy}."
        if "open" in status:
            return f"{space_name} is open and not especially busy right now. Current occupancy is {occupancy}."
        return f"{space_name} is currently {status}. Current occupancy is {occupancy}."
    if "open" in normalized or "closed" in normalized:
        if status.startswith("open"):
            return f"Yes. {space_name} is open right now."
        if status == "closed":
            return f"No. {space_name} is closed right now."
        return f"{space_name} status is currently {status}."
    summary_lines = state.get("summary_lines") if isinstance(state.get("summary_lines"), list) else []
    summary = str(summary_lines[0] if summary_lines else "").strip()
    return summary or f"{space_name} status is {status} with {occupancy} people."


def _telegram_space_question_via_mcp(question: str) -> Dict[str, Any]:
    if not _telegram_looks_like_space_question(question):
        return {"handled": False, "response": ""}
    space_id = _telegram_resolve_space_id(question)
    if not space_id:
        return {"handled": False, "response": ""}
    try:
        payload = asyncio.run(_telegram_space_status_via_mcp_async(space_id))
    except Exception:
        return {"handled": False, "response": ""}
    if not payload:
        return {"handled": False, "response": ""}
    response = _telegram_render_space_answer(question, payload, space_id)
    return {
        "handled": bool(response),
        "response": response,
        "skill_id": "vision-monitor-mcp",
        "metadata": {"space_id": space_id, "mcp": True},
        "prompt_append": "",
    }

ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS = os.getenv("ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS", "0") == "1"
ORION_TELEGRAM_MEDIA_ENABLED = os.getenv("ORION_TELEGRAM_MEDIA_ENABLED", "1") == "1"
ORION_TELEGRAM_MEDIA_DIR = _resolve_state_dir(
    "ORION_TELEGRAM_MEDIA_DIR",
    "channels/telegram/media",
    ".orion-media/telegram",
)
ORION_TELEGRAM_MEDIA_MAX_ITEMS = max(1, int(os.getenv("ORION_TELEGRAM_MEDIA_MAX_ITEMS", "4") or 4))
ORION_TELEGRAM_MEDIA_MAX_BYTES = max(1024 * 128, int(os.getenv("ORION_TELEGRAM_MEDIA_MAX_BYTES", str(10 * 1024 * 1024)) or str(10 * 1024 * 1024)))
ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL = os.getenv("ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL", "1") == "1"
ORION_CHANNEL_DEAD_LETTER_FILE = _resolve_state_file(
    "ORION_CHANNEL_DEAD_LETTER_FILE",
    "channels/dead_letters.json",
    ".orion_channel_dead_letters.json",
)
ORION_CHANNEL_DEAD_LETTER_LIMIT = max(50, int(os.getenv("ORION_CHANNEL_DEAD_LETTER_LIMIT", "500") or 500))
_CHANNEL_DEAD_LETTER_LOCK = threading.Lock()
ORION_TELEGRAM_PROFILE_STATE_FILE = _resolve_state_file(
    "ORION_TELEGRAM_PROFILE_STATE_FILE",
    "channels/telegram/chat_profiles.json",
    ".orion_telegram_chat_profiles.json",
)
ORION_TELEGRAM_ONBOARDING_ENABLED = os.getenv("ORION_TELEGRAM_ONBOARDING_ENABLED", "1") == "1"
ORION_TELEGRAM_ONBOARDING_STATE_FILE = _resolve_state_file(
    "ORION_TELEGRAM_ONBOARDING_STATE_FILE",
    "channels/telegram/chat_onboarding.json",
    ".orion_telegram_chat_onboarding.json",
)
_TELEGRAM_PROFILE_LOCK = threading.Lock()
_TELEGRAM_PROFILE_STATE: Dict[str, Any] = {
    "loaded": False,
    "profiles": {},
}
_TELEGRAM_ONBOARDING_LOCK = threading.Lock()
_TELEGRAM_ONBOARDING_STATE: Dict[str, Any] = {
    "loaded": False,
    "items": {},
}
_TELEGRAM_CAMERA_SETUP_LOCK = threading.Lock()
_TELEGRAM_CAMERA_SETUP_STATE: Dict[str, Any] = {
    "loaded": False,
    "items": {},
}
_TELEGRAM_PROFILE_FIELDS: Dict[str, str] = {
    "about": "About me",
    "project": "Project",
    "exam": "Exam prep",
    "preferences": "Preferences",
}
_TELEGRAM_PROFILE_FIELD_ALIASES: Dict[str, str] = {
    "about": "about",
    "bio": "about",
    "me": "about",
    "project": "project",
    "work": "project",
    "business": "project",
    "startup": "project",
    "exam": "exam",
    "study": "exam",
    "school": "exam",
    "prep": "exam",
    "preferences": "preferences",
    "preference": "preferences",
    "prefs": "preferences",
    "style": "preferences",
    "tone": "preferences",
}
_TELEGRAM_ONBOARDING_STEPS: List[Dict[str, str]] = [
    {
        "field": "about",
        "label": "About me",
        "question": "What's your name, and what are you working on right now?",
        "example": "Example: I'm Mansur, building an AI ops platform for my business.",
    },
    {
        "field": "project",
        "label": "Project",
        "question": "What does a great day look like for you? What should I help with most?",
        "example": "Example: End the day with top priorities executed and client follow-ups sent.",
    },
    {
        "field": "preferences",
        "label": "Preferences",
        "question": "Anything I should always prioritize or never touch?",
        "example": "Example: Prioritize urgent revenue tasks. Never send external messages without asking me first.",
    },
]
_TELEGRAM_QUICK_GOAL_TEMPLATES: Dict[str, str] = {
    "project update": "Give me a concise update for my current project with top priorities, blockers, and next 3 actions.",
    "today priorities": "Set my top priorities for today with a realistic execution order and time blocks.",
    "next steps": "Based on my current context, give me the next practical steps I should execute now.",
    "inbox triage": "Triage my incoming messages and tell me what needs urgent action, what can wait, and what should be delegated.",
    "draft message": "Draft a clear, professional message for my current task context. Keep it concise and actionable.",
    "meeting prep": "Prepare me for my next meeting: agenda, talking points, likely questions, and decisions needed.",
    "task breakdown": "Break my goal into a practical task list with priorities and estimated effort.",
}
_TELEGRAM_MENU_GOAL_TEMPLATES: Dict[str, str] = {
    "project update": _TELEGRAM_QUICK_GOAL_TEMPLATES["project update"],
    "today priorities": _TELEGRAM_QUICK_GOAL_TEMPLATES["today priorities"],
    "next steps": _TELEGRAM_QUICK_GOAL_TEMPLATES["next steps"],
    "inbox triage": _TELEGRAM_QUICK_GOAL_TEMPLATES["inbox triage"],
    "draft message": _TELEGRAM_QUICK_GOAL_TEMPLATES["draft message"],
    "meeting prep": _TELEGRAM_QUICK_GOAL_TEMPLATES["meeting prep"],
    "task breakdown": _TELEGRAM_QUICK_GOAL_TEMPLATES["task breakdown"],
    "write follow-up": "Draft a concise professional follow-up message for my current project context.",
    "exam plan": "Build my exam preparation plan for this week with daily tasks, time blocks, and revision checkpoints.",
}
DEFAULT_CHAT_PREFIX = "/empyralis"


def _runtime_skills_snapshot_safe() -> Dict[str, Any]:
    _init()
    fn = globals().get("_runtime_skills_snapshot")
    if callable(fn):
        try:
            payload = fn()
            if isinstance(payload, dict):
                return payload
        except Exception:
            return {}
    return {}


def _runtime_builtin_skills() -> List[Dict[str, Any]]:
    _init()
    raw = globals().get("RUNTIME_BUILTIN_SKILLS")
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    return []


def _normalize_runtime_skill_card(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    skill_id = str(raw.get("id") or "").strip().lower()
    title = str(raw.get("title") or "").strip()
    intent = str(raw.get("intent") or "").strip()
    if not skill_id or not title or not intent:
        return None
    tools_raw = raw.get("tools")
    tools: List[str] = []
    if isinstance(tools_raw, list):
        for item in tools_raw:
            token = str(item or "").strip()
            if token:
                tools.append(token[:120])
    guardrail = str(raw.get("guardrail") or "").strip()
    return {
        "id": skill_id[:80],
        "title": title[:120],
        "intent": intent[:1200],
        "tools": tools[:30],
        "guardrail": guardrail[:1200],
    }


def _runtime_active_skills(scope_key: str = "assistant_defaults", limit: int = 8) -> List[Dict[str, Any]]:
    scope = "assistant_defaults" if str(scope_key or "").strip().lower() != "automation_defaults" else "automation_defaults"
    snapshot = _runtime_skills_snapshot_safe()
    custom = snapshot.get("custom_skills") if isinstance(snapshot.get("custom_skills"), list) else []
    bindings = snapshot.get("bindings") if isinstance(snapshot.get("bindings"), dict) else {}
    selected_ids_raw = bindings.get(scope) if isinstance(bindings.get(scope), list) else []
    selected_ids = [str(item or "").strip().lower() for item in selected_ids_raw if str(item or "").strip()]
    catalog: Dict[str, Dict[str, Any]] = {}
    for item in _runtime_builtin_skills() + [entry for entry in custom if isinstance(entry, dict)]:
        card = _normalize_runtime_skill_card(item)
        if not card:
            continue
        catalog[card["id"]] = card
    result: List[Dict[str, Any]] = []
    if selected_ids:
        for skill_id in selected_ids:
            item = catalog.get(skill_id)
            if item:
                result.append(item)
    else:
        result = [_normalize_runtime_skill_card(item) for item in _runtime_builtin_skills()]
        result = [item for item in result if isinstance(item, dict)]
    return result[: max(1, int(limit or 8))]


def _telegram_skill_goal(skill: Dict[str, Any]) -> str:
    title = str(skill.get("title") or "").strip() or "Assistant Skill"
    intent = str(skill.get("intent") or "").strip()
    guardrail = str(skill.get("guardrail") or "").strip()
    tools_raw = skill.get("tools") if isinstance(skill.get("tools"), list) else []
    tools = ", ".join(str(item).strip() for item in tools_raw if str(item).strip()) or "none"
    return (
        f"Apply skill '{title}' for this conversation.\n"
        f"Intent: {intent}\n"
        f"Guardrail: {guardrail or 'none'}\n"
        f"Preferred tools: {tools}\n\n"
        "Use my current chat context and give concrete next actions."
    )


def _telegram_select_skill_from_text(raw_text: str) -> Optional[Dict[str, Any]]:
    text = str(raw_text or "").strip()
    if not text:
        return None
    token = text.lower()
    if token.startswith("skill:"):
        token = token.split(":", 1)[1].strip()
    if token.startswith("skill "):
        token = token.split(" ", 1)[1].strip()
    active = _runtime_active_skills("assistant_defaults", limit=20)
    for skill in active:
        skill_id = str(skill.get("id") or "").strip().lower()
        title = str(skill.get("title") or "").strip().lower()
        if token == skill_id or token == title:
            return skill
    if len(token) >= 3:
        for skill in active:
            title = str(skill.get("title") or "").strip().lower()
            if token in title:
                return skill
    return None


def _telegram_skills_menu_text(profile: Dict[str, Any]) -> str:
    skills = _runtime_active_skills("assistant_defaults", limit=8)
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
    cmd_prefix = f"{prefix} " if bool(profile.get("require_prefix")) else ""
    lines = ["Skills Menu"]
    if not skills:
        lines.append("- No active skills found. Configure skills in the Empyralis web UI.")
    else:
        lines.append("Tap a skill button or run one directly:")
        for skill in skills:
            lines.append(f"- {cmd_prefix}skill {skill.get('id')}")
    lines.append(f"- {cmd_prefix}menu (back to main)")
    return "\n".join(lines)


def _init():
    global _server
    if _server is None:
        import server as _s
        _server = _s
        for k, v in vars(_s).items():
            if not k.startswith("__") and k not in globals():
                globals()[k] = v
    for k in _SYNC_SERVER_GLOBALS:
        if hasattr(_server, k):
            globals()[k] = getattr(_server, k)


def _classify_autopilot_error(detail: Any) -> str:
    text = str(detail or "").strip().lower()
    if not text:
        return "unknown"
    for hint, category in _AUTOPILOT_ERROR_CATEGORY_HINTS:
        if hint in text:
            return category
    return "unknown"


def _iso_from_epoch(ts: float) -> str:
    value = float(ts)
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")

# --- COPIED LOGIC ---
def _telegram_autopilot_log(message: str):
    ts = _utc_now_iso()
    print(f"[telegram-autopilot {ts}] {message}", flush=True)


def _record_channel_event(
    channel: str,
    direction: str,
    event_type: str,
    text: str = "",
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    session_id: Optional[str] = None,
    message_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    action: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    _init()
    append_fn = globals().get("_append_channel_event")
    if not callable(append_fn):
        return None
    try:
        return append_fn(
            channel=channel,
            direction=direction,
            event_type=event_type,
            text=text,
            workspace_id=workspace_id,
            session_key=session_key,
            session_id=session_id,
            message_id=message_id,
            parent_id=parent_id,
            run_id=run_id,
            action=action,
            metadata=metadata or {},
        )
    except Exception:
        return None


def _append_channel_dead_letter(
    *,
    channel: str,
    direction: str,
    event_type: str,
    reason: str,
    text: str = "",
    workspace_id: str = "",
    session_key: str = "",
    run_id: str = "",
    action: str = "",
    connector_id: str = "",
    trace_id: str = "",
    source_event_id: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    _init()
    item = {
        "id": str(uuid.uuid4()),
        "ts": _utc_now_iso(),
        "channel": str(channel or "").strip().lower(),
        "direction": str(direction or "").strip().lower() or "outbound",
        "event_type": str(event_type or "").strip().lower() or "message",
        "workspace_id": _normalize_workspace_id(workspace_id),
        "session_key": str(session_key or "").strip(),
        "run_id": str(run_id or "").strip(),
        "action": str(action or "").strip().lower(),
        "reason": _truncate_one_line(str(reason or "").strip(), 240),
        "text": _truncate_one_line(str(text or "").strip(), 1600),
        "connector_id": str(connector_id or "").strip(),
        "trace_id": str(trace_id or "").strip(),
        "source_event_id": str(source_event_id or "").strip(),
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    with _CHANNEL_DEAD_LETTER_LOCK:
        payload = _safe_read_json(ORION_CHANNEL_DEAD_LETTER_FILE, {"version": 1, "items": []})
        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        items.insert(0, item)
        payload["version"] = 1
        payload["updated_at"] = _utc_now_iso()
        payload["items"] = items[:ORION_CHANNEL_DEAD_LETTER_LIMIT]
        _safe_write_json(ORION_CHANNEL_DEAD_LETTER_FILE, payload)


def _record_channel_event_throttled(
    *,
    channel: str,
    direction: str,
    event_type: str,
    text: str = "",
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    session_id: Optional[str] = None,
    message_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    action: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    dedupe_seconds: float = 30.0,
) -> bool:
    _init()
    normalize_workspace = globals().get("_normalize_workspace_id")
    normalized_workspace_id = workspace_id
    if callable(normalize_workspace):
        try:
            normalized_workspace_id = normalize_workspace(workspace_id)
        except Exception:
            normalized_workspace_id = workspace_id
    normalized_text = re.sub(r"\s+", " ", str(text or "").strip().lower())
    key = "|".join(
        [
            str(channel or "").strip().lower(),
            str(direction or "").strip().lower(),
            str(event_type or "").strip().lower(),
            str(action or "").strip().lower(),
            str(normalized_workspace_id or ""),
            normalized_text[:220],
        ]
    )
    now_ts = time.time()
    window = max(0.0, float(dedupe_seconds))
    if window > 0.0:
        with _AUTOPILOT_EVENT_DEDUP_LOCK:
            last_ts = float(_AUTOPILOT_EVENT_DEDUP.get(key) or 0.0)
            if (now_ts - last_ts) < window:
                return False
            _AUTOPILOT_EVENT_DEDUP[key] = now_ts
            # Keep in-memory index bounded.
            if len(_AUTOPILOT_EVENT_DEDUP) > 2048:
                cutoff = now_ts - max(window * 4.0, 120.0)
                stale = [k for k, ts in _AUTOPILOT_EVENT_DEDUP.items() if ts < cutoff]
                for stale_key in stale[:1024]:
                    _AUTOPILOT_EVENT_DEDUP.pop(stale_key, None)
    _record_channel_event(
        channel=channel,
        direction=direction,
        event_type=event_type,
        text=text,
        workspace_id=workspace_id,
        session_key=session_key,
        session_id=session_id,
        message_id=message_id,
        parent_id=parent_id,
        run_id=run_id,
        action=action,
        metadata=metadata,
    )
    return True


def _telegram_session_key(chat_id: str) -> str:
    cid = str(chat_id or "").strip()
    return f"telegram:{cid}" if cid else "telegram:unknown"


def _telegram_trace_id(chat_id: str, update_id: Any, message_id: Any = "") -> str:
    cid = _telegram_safe_path_token(chat_id or "unknown")
    upid = _telegram_safe_path_token(update_id or "0")
    mid = _telegram_safe_path_token(message_id or "")
    if mid:
        return f"tg:{cid}:{upid}:{mid}"
    return f"tg:{cid}:{upid}"


def _whatsapp_session_key(from_number: str, to_number: str) -> str:
    sender = _normalize_whatsapp_number(from_number) or "whatsapp:unknown"
    receiver = _normalize_whatsapp_number(to_number) or "whatsapp:unknown"
    return f"whatsapp:{sender}->{receiver}"


def _telegram_profile_key(workspace_id: str, chat_id: str) -> str:
    ws = str(workspace_id or "").strip() or "default"
    cid = str(chat_id or "").strip() or "unknown"
    return f"{ws}:{cid}"


def _load_telegram_profile_state() -> None:
    _init()
    payload = _safe_read_json(
        ORION_TELEGRAM_PROFILE_STATE_FILE,
        {"version": 1, "items": {}},
    )
    items = payload.get("items") if isinstance(payload.get("items"), dict) else {}
    parsed_profiles: Dict[str, Dict[str, str]] = {}
    for key, value in items.items():
        if not isinstance(value, dict):
            continue
        cleaned: Dict[str, str] = {}
        for field_name in _TELEGRAM_PROFILE_FIELDS:
            raw_value = str(value.get(field_name) or "").strip()
            if raw_value:
                cleaned[field_name] = raw_value[:2000]
        updated_at = str(value.get("updated_at") or "").strip()
        if cleaned:
            cleaned["updated_at"] = updated_at or _utc_now_iso()
            parsed_profiles[str(key)] = cleaned
    with _TELEGRAM_PROFILE_LOCK:
        _TELEGRAM_PROFILE_STATE["profiles"] = parsed_profiles
        _TELEGRAM_PROFILE_STATE["loaded"] = True


def _ensure_telegram_profile_state_loaded() -> None:
    with _TELEGRAM_PROFILE_LOCK:
        loaded = bool(_TELEGRAM_PROFILE_STATE.get("loaded"))
    if not loaded:
        _load_telegram_profile_state()


def _persist_telegram_profile_state() -> None:
    _init()
    with _TELEGRAM_PROFILE_LOCK:
        profiles = _TELEGRAM_PROFILE_STATE.get("profiles")
        data = dict(profiles) if isinstance(profiles, dict) else {}
    _safe_write_json(
        ORION_TELEGRAM_PROFILE_STATE_FILE,
        {"version": 1, "items": data},
    )


def _normalize_telegram_profile_field(raw_value: str) -> str:
    token = str(raw_value or "").strip().lower()
    if not token:
        return ""
    token = token.lstrip("/")
    return _TELEGRAM_PROFILE_FIELD_ALIASES.get(token, "")


def _get_telegram_profile(workspace_id: str, chat_id: str) -> Dict[str, str]:
    _ensure_telegram_profile_state_loaded()
    key = _telegram_profile_key(workspace_id, chat_id)
    with _TELEGRAM_PROFILE_LOCK:
        item = _TELEGRAM_PROFILE_STATE.get("profiles", {}).get(key)
        profile = dict(item) if isinstance(item, dict) else {}
    out: Dict[str, str] = {}
    for field_name in _TELEGRAM_PROFILE_FIELDS:
        out[field_name] = str(profile.get(field_name) or "").strip()
    out["updated_at"] = str(profile.get("updated_at") or "").strip()
    return out


def _set_telegram_profile_field(workspace_id: str, chat_id: str, field_name: str, value: str) -> Dict[str, str]:
    _ensure_telegram_profile_state_loaded()
    key = _telegram_profile_key(workspace_id, chat_id)
    cleaned_value = re.sub(r"\s+", " ", str(value or "")).strip()
    if not cleaned_value:
        raise RuntimeError("Value is required.")
    cleaned_value = cleaned_value[:2000]
    with _TELEGRAM_PROFILE_LOCK:
        profiles = _TELEGRAM_PROFILE_STATE.get("profiles")
        if not isinstance(profiles, dict):
            profiles = {}
            _TELEGRAM_PROFILE_STATE["profiles"] = profiles
        current = profiles.get(key)
        record = dict(current) if isinstance(current, dict) else {}
        record[field_name] = cleaned_value
        record["updated_at"] = _utc_now_iso()
        profiles[key] = record
    _persist_telegram_profile_state()
    return _get_telegram_profile(workspace_id, chat_id)


def _clear_telegram_profile(workspace_id: str, chat_id: str, field_name: str = "") -> Dict[str, str]:
    _ensure_telegram_profile_state_loaded()
    key = _telegram_profile_key(workspace_id, chat_id)
    with _TELEGRAM_PROFILE_LOCK:
        profiles = _TELEGRAM_PROFILE_STATE.get("profiles")
        if not isinstance(profiles, dict):
            profiles = {}
            _TELEGRAM_PROFILE_STATE["profiles"] = profiles
        record = profiles.get(key)
        if not isinstance(record, dict):
            record = {}
        if field_name:
            record.pop(field_name, None)
            if any(str(record.get(name) or "").strip() for name in _TELEGRAM_PROFILE_FIELDS):
                record["updated_at"] = _utc_now_iso()
                profiles[key] = record
            else:
                profiles.pop(key, None)
        else:
            profiles.pop(key, None)
    _persist_telegram_profile_state()
    return _get_telegram_profile(workspace_id, chat_id)


def _telegram_onboarding_key(workspace_id: str, chat_id: str) -> str:
    return _telegram_profile_key(workspace_id, chat_id)


def _load_telegram_onboarding_state() -> None:
    _init()
    payload = _safe_read_json(
        ORION_TELEGRAM_ONBOARDING_STATE_FILE,
        {"version": 1, "items": {}},
    )
    items = payload.get("items") if isinstance(payload.get("items"), dict) else {}
    parsed: Dict[str, Dict[str, Any]] = {}
    for key, value in items.items():
        if not isinstance(value, dict):
            continue
        active = bool(value.get("active"))
        step_index = int(value.get("step_index") or 0)
        started_at = str(value.get("started_at") or "").strip()
        updated_at = str(value.get("updated_at") or "").strip()
        if not active and step_index <= 0:
            continue
        parsed[str(key)] = {
            "active": active,
            "step_index": max(0, min(step_index, len(_TELEGRAM_ONBOARDING_STEPS))),
            "started_at": started_at or _utc_now_iso(),
            "updated_at": updated_at or _utc_now_iso(),
        }
    with _TELEGRAM_ONBOARDING_LOCK:
        _TELEGRAM_ONBOARDING_STATE["items"] = parsed
        _TELEGRAM_ONBOARDING_STATE["loaded"] = True


def _ensure_telegram_onboarding_state_loaded() -> None:
    with _TELEGRAM_ONBOARDING_LOCK:
        loaded = bool(_TELEGRAM_ONBOARDING_STATE.get("loaded"))
    if not loaded:
        _load_telegram_onboarding_state()


def _persist_telegram_onboarding_state() -> None:
    _init()
    with _TELEGRAM_ONBOARDING_LOCK:
        items = _TELEGRAM_ONBOARDING_STATE.get("items")
        data = dict(items) if isinstance(items, dict) else {}
    _safe_write_json(
        ORION_TELEGRAM_ONBOARDING_STATE_FILE,
        {"version": 1, "items": data},
    )


def _get_telegram_onboarding_state(workspace_id: str, chat_id: str) -> Dict[str, Any]:
    _ensure_telegram_onboarding_state_loaded()
    key = _telegram_onboarding_key(workspace_id, chat_id)
    with _TELEGRAM_ONBOARDING_LOCK:
        item = _TELEGRAM_ONBOARDING_STATE.get("items", {}).get(key)
        out = dict(item) if isinstance(item, dict) else {}
    return {
        "active": bool(out.get("active")),
        "step_index": int(out.get("step_index") or 0),
        "started_at": str(out.get("started_at") or "").strip(),
        "updated_at": str(out.get("updated_at") or "").strip(),
    }


def _start_telegram_onboarding(workspace_id: str, chat_id: str) -> Dict[str, Any]:
    _ensure_telegram_onboarding_state_loaded()
    key = _telegram_onboarding_key(workspace_id, chat_id)
    profile_data = _get_telegram_profile(workspace_id, chat_id)
    start_index = _telegram_next_onboarding_step_index(profile_data)
    should_activate = start_index < len(_TELEGRAM_ONBOARDING_STEPS)
    now = _utc_now_iso()
    with _TELEGRAM_ONBOARDING_LOCK:
        items = _TELEGRAM_ONBOARDING_STATE.get("items")
        if not isinstance(items, dict):
            items = {}
            _TELEGRAM_ONBOARDING_STATE["items"] = items
        items[key] = {
            "active": should_activate,
            "step_index": start_index,
            "started_at": now,
            "updated_at": now,
        }
    _persist_telegram_onboarding_state()
    return _get_telegram_onboarding_state(workspace_id, chat_id)


def _advance_telegram_onboarding(workspace_id: str, chat_id: str, step_index: int, active: bool) -> Dict[str, Any]:
    _ensure_telegram_onboarding_state_loaded()
    key = _telegram_onboarding_key(workspace_id, chat_id)
    now = _utc_now_iso()
    with _TELEGRAM_ONBOARDING_LOCK:
        items = _TELEGRAM_ONBOARDING_STATE.get("items")
        if not isinstance(items, dict):
            items = {}
            _TELEGRAM_ONBOARDING_STATE["items"] = items
        if active:
            current = items.get(key)
            record = dict(current) if isinstance(current, dict) else {}
            record["active"] = True
            record["step_index"] = max(0, min(int(step_index), len(_TELEGRAM_ONBOARDING_STEPS)))
            record["started_at"] = str(record.get("started_at") or now)
            record["updated_at"] = now
            items[key] = record
        else:
            items.pop(key, None)
    _persist_telegram_onboarding_state()
    return _get_telegram_onboarding_state(workspace_id, chat_id)


def _telegram_camera_setup_key(workspace_id: str, chat_id: str) -> str:
    return _telegram_profile_key(workspace_id, chat_id)


def _load_telegram_camera_setup_state() -> None:
    _init()
    payload = _safe_read_json(
        ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE,
        {"version": 1, "items": {}},
    )
    items = payload.get("items") if isinstance(payload.get("items"), dict) else {}
    parsed: Dict[str, Dict[str, Any]] = {}
    for key, value in items.items():
        if not isinstance(value, dict):
            continue
        stage = str(value.get("stage") or "").strip().lower()
        if stage not in {"awaiting_space_name", "awaiting_camera_source"}:
            continue
        parsed[str(key)] = {
            "stage": stage,
            "original_prompt": str(value.get("original_prompt") or "").strip(),
            "space_name": str(value.get("space_name") or "").strip(),
            "updated_at": str(value.get("updated_at") or "").strip() or _utc_now_iso(),
        }
    with _TELEGRAM_CAMERA_SETUP_LOCK:
        _TELEGRAM_CAMERA_SETUP_STATE["items"] = parsed
        _TELEGRAM_CAMERA_SETUP_STATE["loaded"] = True


def _ensure_telegram_camera_setup_state_loaded() -> None:
    with _TELEGRAM_CAMERA_SETUP_LOCK:
        loaded = bool(_TELEGRAM_CAMERA_SETUP_STATE.get("loaded"))
    if not loaded:
        _load_telegram_camera_setup_state()


def _persist_telegram_camera_setup_state() -> None:
    _init()
    with _TELEGRAM_CAMERA_SETUP_LOCK:
        items = _TELEGRAM_CAMERA_SETUP_STATE.get("items")
        data = dict(items) if isinstance(items, dict) else {}
    _safe_write_json(
        ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE,
        {"version": 1, "items": data},
    )


def _get_telegram_camera_setup_state(workspace_id: str, chat_id: str) -> Dict[str, Any]:
    _ensure_telegram_camera_setup_state_loaded()
    key = _telegram_camera_setup_key(workspace_id, chat_id)
    with _TELEGRAM_CAMERA_SETUP_LOCK:
        item = _TELEGRAM_CAMERA_SETUP_STATE.get("items", {}).get(key)
        out = dict(item) if isinstance(item, dict) else {}
    return {
        "active": bool(out.get("stage")),
        "stage": str(out.get("stage") or "").strip(),
        "original_prompt": str(out.get("original_prompt") or "").strip(),
        "space_name": str(out.get("space_name") or "").strip(),
        "updated_at": str(out.get("updated_at") or "").strip(),
    }


def _set_telegram_camera_setup_state(workspace_id: str, chat_id: str, stage: str, original_prompt: str, space_name: str = "") -> Dict[str, Any]:
    _ensure_telegram_camera_setup_state_loaded()
    key = _telegram_camera_setup_key(workspace_id, chat_id)
    now = _utc_now_iso()
    with _TELEGRAM_CAMERA_SETUP_LOCK:
        items = _TELEGRAM_CAMERA_SETUP_STATE.get("items")
        if not isinstance(items, dict):
            items = {}
            _TELEGRAM_CAMERA_SETUP_STATE["items"] = items
        items[key] = {
            "stage": stage,
            "original_prompt": str(original_prompt or "").strip(),
            "space_name": str(space_name or "").strip(),
            "updated_at": now,
        }
    _persist_telegram_camera_setup_state()
    return _get_telegram_camera_setup_state(workspace_id, chat_id)


def _clear_telegram_camera_setup_state(workspace_id: str, chat_id: str) -> None:
    _ensure_telegram_camera_setup_state_loaded()
    key = _telegram_camera_setup_key(workspace_id, chat_id)
    with _TELEGRAM_CAMERA_SETUP_LOCK:
        items = _TELEGRAM_CAMERA_SETUP_STATE.get("items")
        if isinstance(items, dict):
            items.pop(key, None)
    _persist_telegram_camera_setup_state()


def _runtime_api_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    api_key = str(globals().get("ORION_API_KEY") or "").strip()
    if api_key:
        headers["X-API-Key"] = api_key
    return headers


def _data_url_from_local_file(path_value: str, mime_type: str = "") -> str:
    path = Path(str(path_value or "").strip()).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise RuntimeError("Attached image file is not available.")
    raw = path.read_bytes()
    guessed_mime = str(mime_type or "").strip().lower() or mimetypes.guess_type(str(path.name))[0] or "image/jpeg"
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{guessed_mime};base64,{encoded}"


def _camera_monitor_workflow_definition(space_name: str) -> Dict[str, Any]:
    label = str(space_name or "").strip() or "Space"
    return {
        "nodes": [
            {
                "id": "trigger-schedule",
                "type": "trigger",
                "position": {"x": 265, "y": 50},
                "data": {"label": "Scheduled Scan", "triggerType": "schedule"},
            },
            {
                "id": "agent-vision",
                "type": "agent",
                "position": {"x": 265, "y": 220},
                "data": {
                    "label": "Vision Agent",
                    "modelId": "gpt-4o",
                    "prompt": f"Monitor {label} and report unusual activity.",
                    "tools": ["vision-monitor"],
                    "provider": "openai",
                    "role": "Vision",
                    "duty": f"Watch {label} and summarize unusual activity clearly.",
                    "status": "ready",
                    "description": f"{label} monitoring",
                },
            },
            {
                "id": "action-telegram",
                "type": "action",
                "position": {"x": 265, "y": 390},
                "data": {"label": "Send Telegram", "actionType": "send_telegram"},
            },
        ],
        "edges": [
            {
                "id": "edge-trigger-agent",
                "source": "trigger-schedule",
                "target": "agent-vision",
                "sourceHandle": "bottom",
                "targetHandle": "top",
                "type": "smoothstep",
            },
            {
                "id": "edge-agent-action",
                "source": "agent-vision",
                "target": "action-telegram",
                "sourceHandle": "bottom",
                "targetHandle": "top",
                "type": "smoothstep",
            },
        ],
        "meta": {"automationMode": "scheduled", "created_from": "camera_monitor_chat_bridge"},
    }


def _create_hotel_vision_space_via_api(
    *,
    space_name: str,
    camera_source: str,
    workspace_id: str,
    uploaded_mime_type: str = "",
) -> Dict[str, Any]:
    _init()
    status_res = http_json_request(
        f"{EMPYRALIST_RUNTIME_URL}/api/solutions/hotel-vision/onboarding/status",
        headers=_runtime_api_headers(),
        timeout=20,
    )
    status_json = status_res.get("json") if isinstance(status_res.get("json"), dict) else {}
    payload = {
        "hotel_name": "My Property",
        "city": "Unknown",
        "timezone": str(status_json.get("default_timezone") or "UTC").strip() or "UTC",
        "alert_channel": "telegram",
        "space_name": str(space_name or "").strip(),
        "monitoring_modes": ["people count", "after-hours movement", "occupancy level"],
        "busy_threshold": 15,
        "quiet_hours_from": "22:00",
        "quiet_hours_to": "06:00",
        "scan_cadence_minutes": 5,
        "workspace_id": str(workspace_id or "").strip() or "default",
    }
    if looks_like_camera_source(camera_source) and str(camera_source or "").strip().lower().startswith("data:image/"):
        payload["camera_mode"] = "upload"
        payload["uploaded_photo_data_url"] = camera_source
    elif str(camera_source or "").strip().lower().startswith(("http://", "https://", "rtsp://", "rtmp://", "rtmps://")):
        payload["camera_mode"] = "ip_camera"
        payload["camera_url"] = str(camera_source or "").strip()
    else:
        payload["camera_mode"] = "upload"
        payload["uploaded_photo_data_url"] = _data_url_from_local_file(camera_source, uploaded_mime_type)
    response = http_json_request(
        f"{EMPYRALIST_RUNTIME_URL}/api/solutions/hotel-vision/onboarding/space",
        method="POST",
        headers=_runtime_api_headers(),
        payload=payload,
        timeout=30,
    )
    payload_json = response.get("json") if isinstance(response.get("json"), dict) else {}
    return payload_json


def _create_workflow_visibility_record(space_name: str) -> Optional[str]:
    _init()
    create_res = http_json_request(
        f"{EMPYRALIST_WORKFLOW_API_URL}/workflows?workspaceId=default",
        method="POST",
        headers={"Content-Type": "application/json"},
        payload={
            "name": f"Monitor {str(space_name or '').strip() or 'Space'}",
            "description": f"Camera monitor for {str(space_name or '').strip() or 'this space'}",
            "definition": _camera_monitor_workflow_definition(space_name),
        },
        timeout=20,
    )
    create_json = create_res.get("json") if isinstance(create_res.get("json"), dict) else {}
    workflow_id = str(create_json.get("id") or "").strip()
    if workflow_id:
        try:
            http_json_request(
                f"{EMPYRALIST_WORKFLOW_API_URL}/workflows/{quote_plus(workflow_id)}/publish",
                method="POST",
                headers={"Content-Type": "application/json"},
                timeout=20,
            )
        except Exception:
            pass
    return workflow_id or None


def _camera_monitor_completion_text(space_name: str, channel_connected: bool, workflow_id: Optional[str] = None) -> str:
    label = str(space_name or "").strip() or "space"
    lines = [
        f"Done. Your {label} monitor is {'active' if channel_connected else 'ready'}.",
        "You'll get Telegram alerts when anything unusual happens." if channel_connected else "Connect Telegram to receive alerts.",
        f"Open Hotel Vision: {EMPYRALIST_WEB_URL}/solutions/hotel-vision",
    ]
    if workflow_id:
        lines.append(f"Open automation: {EMPYRALIST_WEB_URL}/workflows/{workflow_id}")
    if not channel_connected:
        lines.append(f"Connect Telegram to receive alerts → {EMPYRALIST_WEB_URL}/credentials?connector=telegram_bot&onboarding=1")
    return "\n\n".join(lines)


def _telegram_handle_camera_monitor_setup(
    *,
    workspace_id: str,
    chat_id: str,
    message_text: str,
    stored_attachments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    active_state = _get_telegram_camera_setup_state(workspace_id, chat_id)
    normalized_text = str(message_text or "").strip()

    if active_state.get("active"):
        stage = str(active_state.get("stage") or "").strip()
        if stage == "awaiting_space_name":
            if not normalized_text:
                return {"handled": True, "reply": "What should I call this space? (e.g. Entrance, Reception, Parking)"}
            _set_telegram_camera_setup_state(
                workspace_id,
                chat_id,
                "awaiting_camera_source",
                str(active_state.get("original_prompt") or "").strip(),
                space_name=normalized_text,
            )
            return {
                "handled": True,
                "reply": "Got it. Upload a photo of the space or paste a camera URL to get started.",
            }
        if stage == "awaiting_camera_source":
            source_value = normalized_text if looks_like_camera_source(normalized_text) else ""
            source_mime = ""
            if not source_value and isinstance(stored_attachments, list) and stored_attachments:
                first = stored_attachments[0] if isinstance(stored_attachments[0], dict) else {}
                source_value = str(first.get("path") or "").strip()
                source_mime = str(first.get("mime_type") or "").strip()
            if not source_value:
                return {
                    "handled": True,
                    "reply": "Paste a camera URL to continue, or upload one photo of the space.",
                }
            space_name = str(active_state.get("space_name") or "").strip() or "Space"
            try:
                created = _create_hotel_vision_space_via_api(
                    space_name=space_name,
                    camera_source=source_value,
                    workspace_id=workspace_id,
                    uploaded_mime_type=source_mime,
                )
                workflow_id = _create_workflow_visibility_record(space_name)
                _clear_telegram_camera_setup_state(workspace_id, chat_id)
                return {
                    "handled": True,
                    "reply": _camera_monitor_completion_text(
                        space_name,
                        bool(created.get("channel_connected")),
                        workflow_id,
                    ),
                }
            except Exception as exc:
                _clear_telegram_camera_setup_state(workspace_id, chat_id)
                return {
                    "handled": True,
                    "reply": f"I couldn't finish the setup.\n\n{str(exc).strip() or 'Failed to create the monitor.'}",
                }

    if classify_automation_intent(normalized_text) == "CAMERA_MONITOR":
        _set_telegram_camera_setup_state(
            workspace_id,
            chat_id,
            "awaiting_space_name",
            original_prompt=normalized_text,
        )
        return {
            "handled": True,
            "reply": "I'll set up a camera monitor for you.\n\nWhat should I call this space?\n\n(e.g. Entrance, Reception, Parking)",
        }

    return {"handled": False, "reply": ""}


def _telegram_profile_has_context(profile_data: Dict[str, str]) -> bool:
    return any(str(profile_data.get(field_name) or "").strip() for field_name in _TELEGRAM_PROFILE_FIELDS)


def _telegram_next_onboarding_step_index(profile_data: Dict[str, str]) -> int:
    for idx, step in enumerate(_TELEGRAM_ONBOARDING_STEPS):
        field_name = str(step.get("field") or "").strip().lower()
        if not field_name:
            continue
        if not str(profile_data.get(field_name) or "").strip():
            return idx
    return len(_TELEGRAM_ONBOARDING_STEPS)


def _is_low_quality_onboarding_answer(raw_value: str) -> bool:
    text = re.sub(r"\s+", " ", str(raw_value or "").strip())
    if not text:
        return True
    lower = text.lower()
    if lower in {"idk", "dont know", "don't know", "none", "nothing", "n/a", "na"}:
        return True
    if len(text) < 8:
        return True
    words = [w for w in re.split(r"\s+", lower) if w]
    if len(words) < 2 and len(text) < 12:
        return True
    letters_only = re.sub(r"[^a-z]", "", lower)
    if letters_only and len(set(letters_only)) <= 3 and len(letters_only) <= 8:
        return True
    return False


def _telegram_onboarding_prompt(step_index: int, retry: bool = False) -> str:
    idx = max(0, min(int(step_index), len(_TELEGRAM_ONBOARDING_STEPS) - 1))
    step = _TELEGRAM_ONBOARDING_STEPS[idx]
    lead = "Let's set your context (quick 3 questions)." if idx == 0 and not retry else "Thanks. Next question."
    if retry:
        lead = "I need a bit more detail for that answer."
    return "\n".join(
        [
            lead,
            f"{idx + 1}/{len(_TELEGRAM_ONBOARDING_STEPS)} {step.get('question')}",
            str(step.get("example") or "").strip(),
            "Reply with your answer, or type 'skip'.",
        ]
    ).strip()


def _telegram_onboarding_consume_answer(
    workspace_id: str,
    chat_id: str,
    answer_text: str,
) -> Dict[str, Any]:
    state = _get_telegram_onboarding_state(workspace_id, chat_id)
    if not bool(state.get("active")):
        state = _start_telegram_onboarding(workspace_id, chat_id)
    idx = max(0, min(int(state.get("step_index") or 0), len(_TELEGRAM_ONBOARDING_STEPS) - 1))
    step = _TELEGRAM_ONBOARDING_STEPS[idx]
    field_name = str(step.get("field") or "").strip().lower()
    answer = re.sub(r"\s+", " ", str(answer_text or "").strip())
    answer_lower = answer.lower()

    if answer_lower not in {"skip", "/skip", "later"} and _is_low_quality_onboarding_answer(answer):
        return {
            "completed": False,
            "saved": False,
            "reply": _telegram_onboarding_prompt(idx, retry=True),
            "next_state": state,
        }

    saved = False
    if answer_lower not in {"skip", "/skip", "later"} and field_name in _TELEGRAM_PROFILE_FIELDS:
        _set_telegram_profile_field(workspace_id, chat_id, field_name, answer)
        saved = True

    next_idx = idx + 1
    if next_idx >= len(_TELEGRAM_ONBOARDING_STEPS):
        _advance_telegram_onboarding(workspace_id, chat_id, next_idx, active=False)
        profile_data = _get_telegram_profile(workspace_id, chat_id)
        return {
            "completed": True,
            "saved": saved,
            "reply": "Onboarding complete.\n\n" + _telegram_profile_text({"prefix": DEFAULT_CHAT_PREFIX, "require_prefix": False}, profile_data),
            "next_state": {"active": False, "step_index": next_idx},
        }

    next_state = _advance_telegram_onboarding(workspace_id, chat_id, next_idx, active=True)
    return {
        "completed": False,
        "saved": saved,
        "reply": _telegram_onboarding_prompt(next_idx, retry=False),
        "next_state": next_state,
    }


def _telegram_profile_lines(profile_data: Dict[str, str]) -> List[str]:
    lines: List[str] = []
    for field_name, label in _TELEGRAM_PROFILE_FIELDS.items():
        value = str(profile_data.get(field_name) or "").strip()
        if value:
            lines.append(f"- {label}: {_truncate_one_line(value, 140)}")
    if not lines:
        lines.append("- No context saved yet.")
    return lines


def _telegram_profile_text(profile: Dict[str, Any], profile_data: Dict[str, str]) -> str:
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
    cmd_prefix = f"{prefix} " if bool(profile.get("require_prefix")) else ""
    lines = ["Saved context", *_telegram_profile_lines(profile_data), ""]
    lines.extend(
        [
            f"Review or update later with `{cmd_prefix}me`.",
            f"Quick edit: `{cmd_prefix}me set project <details>`",
            f"Clear a field: `{cmd_prefix}me clear [project|exam|about|preferences]`",
        ]
    )
    return "\n".join(lines).strip()


def _telegram_profile_help_text(profile: Dict[str, Any]) -> str:
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
    cmd_prefix = f"{prefix} " if bool(profile.get("require_prefix")) else ""
    return "\n".join(
        [
            "Profile commands",
            f"- {cmd_prefix}me",
            f"- {cmd_prefix}me set project <details>",
            f"- {cmd_prefix}me set exam <details>",
            f"- {cmd_prefix}me set about <details>",
            f"- {cmd_prefix}me set preferences <details>",
            f"- {cmd_prefix}me clear [project|exam|about|preferences]",
        ]
    )


def _telegram_build_goal_with_profile(goal: str, profile_data: Dict[str, str]) -> str:
    request_text = str(goal or "").strip()
    has_context = any(str(profile_data.get(field_name) or "").strip() for field_name in _TELEGRAM_PROFILE_FIELDS)
    if not has_context:
        return request_text
    context_lines = _telegram_profile_lines(profile_data)
    context_block = "\n".join(context_lines)
    return (
        "User context (apply only when relevant):\n"
        f"{context_block}\n\n"
        "User request:\n"
        f"{request_text}"
    )


def _connector_capability_summary(connector_id: str) -> str:
    provider = str(connector_id or "").strip().lower()
    if provider == "google_workspace":
        return "email, calendar, drive"
    if provider == "microsoft_365":
        return "email, calendar, files"
    if provider == "telegram_bot":
        return "telegram chat"
    if provider == "whatsapp_twilio":
        return "whatsapp chat"
    if provider == "discord_bot":
        return "discord chat"
    return "connected tool"


def _telegram_requested_recent_email_limit(goal: str) -> int:
    raw = str(goal or "").strip().lower()
    if not raw:
        return 0
    if not any(token in raw for token in ("email", "emails", "gmail", "inbox", "mailbox")):
        return 0
    if not any(token in raw for token in ("read", "summarize", "summary", "show", "latest", "recent", "last")):
        return 0
    match = re.search(r"\b(?:last|latest|recent)\s+(\d+)\s+emails?\b", raw)
    if match:
        try:
            return max(1, min(int(match.group(1)), 10))
        except Exception:
            return 3
    return 3


def _telegram_workspace_connector_context(
    goal: str,
    workspace_id: str,
    current_connector_id: str,
) -> Dict[str, Any]:
    _init()
    raw_goal = str(goal or "").strip().lower()
    entries = list_vault_connectors(workspace_id)
    summaries: List[Dict[str, Any]] = []
    preferred_email_entry: Optional[Dict[str, Any]] = None
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        connector_id = str(entry.get("id") or "").strip()
        provider = str(entry.get("connector") or "").strip().lower()
        label = str(entry.get("label") or provider or "Connector").strip()
        summaries.append(
            {
                "id": connector_id,
                "connector": provider,
                "label": label,
                "capabilities": _connector_capability_summary(provider),
                "session_connector": connector_id == str(current_connector_id or "").strip(),
            }
        )
        if provider in {"google_workspace", "microsoft_365"} and preferred_email_entry is None:
            preferred_email_entry = entry

    email_limit = _telegram_requested_recent_email_limit(goal)
    needs_prompt = bool(
        email_limit > 0
        or any(token in raw_goal for token in ("connector", "email", "gmail", "inbox", "calendar", "drive", "document", "spreadsheet", "sheet"))
    )

    prompt_lines: List[str] = []
    if summaries and needs_prompt:
        prompt_lines.append("Workspace connectors available for this request:")
        for item in summaries:
            label = str(item.get("label") or "Connector").strip()
            capabilities = str(item.get("capabilities") or "connected tool").strip()
            prompt_lines.append(f"- {label}: {capabilities}")

    selected_connector_id = ""
    selected_connector_provider = ""
    if email_limit > 0 and isinstance(preferred_email_entry, dict):
        selected_connector_id = str(preferred_email_entry.get("id") or "").strip()
        selected_connector_provider = str(preferred_email_entry.get("connector") or "").strip().lower()
        try:
            secret = resolve_vault_credential(selected_connector_id, workspace_id)
            messages = list_recent_connector_messages(secret, limit=email_limit)
        except Exception as exc:
            prompt_lines.append(f"Connector fetch warning: {str(exc).strip()}")
            messages = []
        if messages:
            prompt_lines.append("")
            prompt_lines.append(
                f"Recent emails fetched from {preferred_email_entry.get('label') or selected_connector_provider}:"
            )
            for idx, message in enumerate(messages, start=1):
                subject = str(message.get("subject") or "(no subject)").strip()
                sender = str(message.get("from") or "unknown sender").strip()
                date = str(message.get("date") or "").strip()
                snippet = re.sub(r"\s+", " ", str(message.get("snippet") or "").strip())
                if len(snippet) > 280:
                    snippet = snippet[:277] + "..."
                line = f"{idx}. From: {sender} | Subject: {subject}"
                if date:
                    line += f" | Date: {date}"
                prompt_lines.append(line)
                if snippet:
                    prompt_lines.append(f"   Snippet: {snippet}")

    return {
        "channel_connectors": [
            {"connector": str(item.get("connector") or "").strip(), "credential_id": str(item.get("id") or "").strip()}
            for item in summaries
            if str(item.get("connector") or "").strip() and str(item.get("id") or "").strip()
        ],
        "available_connectors": summaries,
        "connector_credential_id": selected_connector_id or None,
        "connector_provider": selected_connector_provider or None,
        "prompt_append": "\n".join(prompt_lines).strip(),
    }


def _telegram_build_goal_with_connector_context(goal: str, connector_prompt: str) -> str:
    request_text = str(goal or "").strip()
    prompt = str(connector_prompt or "").strip()
    if not prompt:
        return request_text
    if not request_text:
        return prompt
    return f"{request_text}\n\n{prompt}"


def _telegram_installed_skill_query(
    goal: str,
    workspace_id: str,
    connector_id: str,
    chat_id: str,
    session_key: str,
) -> Dict[str, Any]:
    try:
        return query_active_installed_skills(
            query=goal,
            channel="telegram",
            workspace_id=workspace_id,
            connector_id=connector_id,
            chat_id=chat_id,
            session_key=session_key,
        )
    except Exception as exc:
        return {
            "handled": False,
            "response": "",
            "prompt_append": "",
            "active_skill_ids": [],
            "errors": [{"skill_id": "installed_skills", "error": str(exc)}],
        }


def _telegram_prefixed_command(profile: Dict[str, Any], command_text: str) -> str:
    clean = str(command_text or "").strip()
    if not clean:
        return ""
    if bool(profile.get("require_prefix")):
        prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
        return f"{prefix} {clean}".strip()
    return clean


def _telegram_menu_keyboard(profile: Dict[str, Any], menu_id: str = "main") -> Dict[str, Any]:
    if not ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS:
        return {"remove_keyboard": True}
    require_prefix = bool(profile.get("require_prefix"))
    status_cmd = _telegram_prefixed_command(profile, "status") if require_prefix else "Status"
    approvals_cmd = _telegram_prefixed_command(profile, "approvals") if require_prefix else "Approvals"
    help_cmd = _telegram_prefixed_command(profile, "help") if require_prefix else "Help"
    me_cmd = _telegram_prefixed_command(profile, "me") if require_prefix else "My context"

    if menu_id == "study":
        if require_prefix:
            keyboard = [
                [{"text": _telegram_prefixed_command(profile, "run inbox triage")}, {"text": _telegram_prefixed_command(profile, "run draft message")}],
                [{"text": _telegram_prefixed_command(profile, "run today priorities")}, {"text": _telegram_prefixed_command(profile, "run task breakdown")}],
                [{"text": _telegram_prefixed_command(profile, "menu")}],
            ]
        else:
            keyboard = [
                [{"text": "Inbox triage"}, {"text": "Draft message"}],
                [{"text": "Today priorities"}, {"text": "Task breakdown"}],
                [{"text": "Back to main"}],
            ]
    elif menu_id == "project":
        if require_prefix:
            keyboard = [
                [{"text": _telegram_prefixed_command(profile, "run project update")}, {"text": _telegram_prefixed_command(profile, "run next steps")}],
                [{"text": _telegram_prefixed_command(profile, "run meeting prep")}, {"text": _telegram_prefixed_command(profile, "run write follow-up")}],
                [{"text": _telegram_prefixed_command(profile, "menu")}],
            ]
        else:
            keyboard = [
                [{"text": "Project update"}, {"text": "Next steps"}],
                [{"text": "Meeting prep"}, {"text": "Write follow-up"}],
                [{"text": "Back to main"}],
            ]
    elif menu_id == "context":
        if require_prefix:
            keyboard = [
                [{"text": _telegram_prefixed_command(profile, "me")}, {"text": _telegram_prefixed_command(profile, "help")}],
                [{"text": _telegram_prefixed_command(profile, "menu")}],
            ]
        else:
            keyboard = [
                [{"text": "My context"}, {"text": "Context help"}],
                [{"text": "Back to main"}],
            ]
    elif menu_id == "skills":
        active_skills = _runtime_active_skills("assistant_defaults", limit=8)
        if require_prefix:
            keyboard = []
            row: List[Dict[str, str]] = []
            for skill in active_skills:
                row.append({"text": _telegram_prefixed_command(profile, f"skill {skill.get('id')}")})
                if len(row) >= 2:
                    keyboard.append(row)
                    row = []
            if row:
                keyboard.append(row)
            keyboard.append([{"text": _telegram_prefixed_command(profile, "menu")}])
        else:
            keyboard = []
            row = []
            for skill in active_skills:
                label = f"Skill: {str(skill.get('title') or '').strip()}"[:48]
                row.append({"text": label})
                if len(row) >= 2:
                    keyboard.append(row)
                    row = []
            if row:
                keyboard.append(row)
            keyboard.append([{"text": "Back to main"}])
    else:
        if require_prefix:
            keyboard = [
                [{"text": _telegram_prefixed_command(profile, "menu work")}, {"text": _telegram_prefixed_command(profile, "menu project")}],
                [{"text": _telegram_prefixed_command(profile, "menu skills")}, {"text": _telegram_prefixed_command(profile, "menu context")}],
                [{"text": status_cmd}],
                [{"text": approvals_cmd}, {"text": help_cmd}],
            ]
        else:
            keyboard = [
                [{"text": "Work menu"}, {"text": "Project menu"}],
                [{"text": "Skills"}, {"text": "Context"}],
                [{"text": status_cmd}],
                [{"text": approvals_cmd}, {"text": help_cmd}],
            ]

    return {
        "keyboard": keyboard if keyboard else [[{"text": me_cmd}]],
        "resize_keyboard": True,
        "is_persistent": True,
        "one_time_keyboard": False,
        "input_field_placeholder": "Message Empyralis...",
    }


def _telegram_reply_keyboard(profile: Dict[str, Any]) -> Dict[str, Any]:
    if not ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS:
        return {"remove_keyboard": True}
    return _telegram_menu_keyboard(profile, "main")


def _load_telegram_autopilot_state():
    _init()
    payload = _safe_read_json(
        ORION_TELEGRAM_AUTOPILOT_STATE_FILE,
        {
            "version": 1,
            "state": {
                "connectors": {},
                "processed_updates": 0,
                "runs_started": 0,
                "last_poll_at": None,
                "last_error": None,
                "last_error_at": None,
                "last_error_category": None,
                "last_error_source": None,
                "error_count": 0,
                "consecutive_errors": 0,
                "retry_count": 0,
                "last_retry_at": None,
                "backoff_seconds": 0.0,
                "next_retry_at": None,
                "last_success_at": None,
            },
        },
    )
    state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
    connectors = state.get("connectors") if isinstance(state.get("connectors"), dict) else {}
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["connectors"] = connectors
        TELEGRAM_AUTOPILOT_STATE["processed_updates"] = int(state.get("processed_updates") or 0)
        TELEGRAM_AUTOPILOT_STATE["runs_started"] = int(state.get("runs_started") or 0)
        TELEGRAM_AUTOPILOT_STATE["last_poll_at"] = state.get("last_poll_at")
        TELEGRAM_AUTOPILOT_STATE["last_error"] = state.get("last_error")
        TELEGRAM_AUTOPILOT_STATE["last_error_at"] = state.get("last_error_at")
        TELEGRAM_AUTOPILOT_STATE["last_error_category"] = state.get("last_error_category")
        TELEGRAM_AUTOPILOT_STATE["last_error_source"] = state.get("last_error_source")
        TELEGRAM_AUTOPILOT_STATE["error_count"] = int(state.get("error_count") or 0)
        TELEGRAM_AUTOPILOT_STATE["consecutive_errors"] = int(state.get("consecutive_errors") or 0)
        TELEGRAM_AUTOPILOT_STATE["retry_count"] = int(state.get("retry_count") or 0)
        TELEGRAM_AUTOPILOT_STATE["last_retry_at"] = state.get("last_retry_at")
        TELEGRAM_AUTOPILOT_STATE["backoff_seconds"] = float(state.get("backoff_seconds") or 0.0)
        TELEGRAM_AUTOPILOT_STATE["next_retry_at"] = state.get("next_retry_at")
        TELEGRAM_AUTOPILOT_STATE["last_success_at"] = state.get("last_success_at")


def _persist_telegram_autopilot_state():
    _init()
    with TELEGRAM_AUTOPILOT_LOCK:
        payload = {
            "version": 1,
            "state": {
                "connectors": TELEGRAM_AUTOPILOT_STATE.get("connectors", {}),
                "processed_updates": int(TELEGRAM_AUTOPILOT_STATE.get("processed_updates") or 0),
                "runs_started": int(TELEGRAM_AUTOPILOT_STATE.get("runs_started") or 0),
                "last_poll_at": TELEGRAM_AUTOPILOT_STATE.get("last_poll_at"),
                "last_error": TELEGRAM_AUTOPILOT_STATE.get("last_error"),
                "last_error_at": TELEGRAM_AUTOPILOT_STATE.get("last_error_at"),
                "last_error_category": TELEGRAM_AUTOPILOT_STATE.get("last_error_category"),
                "last_error_source": TELEGRAM_AUTOPILOT_STATE.get("last_error_source"),
                "error_count": int(TELEGRAM_AUTOPILOT_STATE.get("error_count") or 0),
                "consecutive_errors": int(TELEGRAM_AUTOPILOT_STATE.get("consecutive_errors") or 0),
                "retry_count": int(TELEGRAM_AUTOPILOT_STATE.get("retry_count") or 0),
                "last_retry_at": TELEGRAM_AUTOPILOT_STATE.get("last_retry_at"),
                "backoff_seconds": float(TELEGRAM_AUTOPILOT_STATE.get("backoff_seconds") or 0.0),
                "next_retry_at": TELEGRAM_AUTOPILOT_STATE.get("next_retry_at"),
                "last_success_at": TELEGRAM_AUTOPILOT_STATE.get("last_success_at"),
            },
        }
    _safe_write_json(ORION_TELEGRAM_AUTOPILOT_STATE_FILE, payload)


def _telegram_autopilot_snapshot(include_connectors: bool = False) -> Dict[str, Any]:
    _init()
    thread_ref = getattr(_server, "TELEGRAM_AUTOPILOT_THREAD", None) if _server is not None else TELEGRAM_AUTOPILOT_THREAD
    with TELEGRAM_AUTOPILOT_LOCK:
        connectors_raw = TELEGRAM_AUTOPILOT_STATE.get("connectors", {})
        connectors = dict(connectors_raw) if isinstance(connectors_raw, dict) else {}
        snapshot: Dict[str, Any] = {
            "enabled": bool(ORION_TELEGRAM_AUTOPILOT_ENABLED),
            "active": bool(TELEGRAM_AUTOPILOT_STATE.get("active")),
            "started_at": TELEGRAM_AUTOPILOT_STATE.get("started_at"),
            "last_poll_at": TELEGRAM_AUTOPILOT_STATE.get("last_poll_at"),
            "last_error": TELEGRAM_AUTOPILOT_STATE.get("last_error"),
            "last_error_at": TELEGRAM_AUTOPILOT_STATE.get("last_error_at"),
            "last_error_category": TELEGRAM_AUTOPILOT_STATE.get("last_error_category"),
            "last_error_source": TELEGRAM_AUTOPILOT_STATE.get("last_error_source"),
            "error_count": int(TELEGRAM_AUTOPILOT_STATE.get("error_count") or 0),
            "consecutive_errors": int(TELEGRAM_AUTOPILOT_STATE.get("consecutive_errors") or 0),
            "retry_count": int(TELEGRAM_AUTOPILOT_STATE.get("retry_count") or 0),
            "last_retry_at": TELEGRAM_AUTOPILOT_STATE.get("last_retry_at"),
            "backoff_seconds": float(TELEGRAM_AUTOPILOT_STATE.get("backoff_seconds") or 0.0),
            "next_retry_at": TELEGRAM_AUTOPILOT_STATE.get("next_retry_at"),
            "last_success_at": TELEGRAM_AUTOPILOT_STATE.get("last_success_at"),
            "connectors_seen": int(TELEGRAM_AUTOPILOT_STATE.get("connectors_seen") or 0),
            "processed_updates": int(TELEGRAM_AUTOPILOT_STATE.get("processed_updates") or 0),
            "runs_started": int(TELEGRAM_AUTOPILOT_STATE.get("runs_started") or 0),
            "poll_seconds": ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            "max_updates": ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES,
            "run_timeout_seconds": ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS,
            "max_reply_chars": ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS,
            "require_prefix": bool(ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX),
            "prefix": ORION_TELEGRAM_AUTOPILOT_PREFIX,
            "default_profile": ORION_TELEGRAM_AUTOPILOT_PROFILE,
            "state_file": str(ORION_TELEGRAM_AUTOPILOT_STATE_FILE),
            "thread_alive": bool(thread_ref and thread_ref.is_alive()),
        }
    connector_error_count = 0
    dropped_sender_count = 0
    for connector_state in connectors.values():
        if isinstance(connector_state, dict):
            if connector_state.get("last_error"):
                connector_error_count += 1
            dropped_sender_count += int(connector_state.get("dropped_sender_count") or 0)
    snapshot["connector_state_count"] = len(connectors)
    snapshot["connector_error_count"] = connector_error_count
    snapshot["dropped_sender_count"] = dropped_sender_count
    if include_connectors:
        snapshot["connectors"] = connectors
    return snapshot


def _whatsapp_autopilot_log(message: str):
    ts = _utc_now_iso()
    print(f"[whatsapp-autopilot {ts}] {message}", flush=True)


def _load_whatsapp_autopilot_state():
    _init()
    payload = _safe_read_json(
        ORION_WHATSAPP_AUTOPILOT_STATE_FILE,
        {
            "version": 1,
            "state": {
                "connectors": {},
                "processed_messages": 0,
                "runs_started": 0,
                "last_inbound_at": None,
                "last_error": None,
                "last_error_at": None,
                "last_error_category": None,
                "last_error_source": None,
                "error_count": 0,
                "consecutive_errors": 0,
            },
        },
    )
    state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
    connectors = state.get("connectors") if isinstance(state.get("connectors"), dict) else {}
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["connectors"] = connectors
        WHATSAPP_AUTOPILOT_STATE["processed_messages"] = int(state.get("processed_messages") or 0)
        WHATSAPP_AUTOPILOT_STATE["runs_started"] = int(state.get("runs_started") or 0)
        WHATSAPP_AUTOPILOT_STATE["last_inbound_at"] = state.get("last_inbound_at")
        WHATSAPP_AUTOPILOT_STATE["last_error"] = state.get("last_error")
        WHATSAPP_AUTOPILOT_STATE["last_error_at"] = state.get("last_error_at")
        WHATSAPP_AUTOPILOT_STATE["last_error_category"] = state.get("last_error_category")
        WHATSAPP_AUTOPILOT_STATE["last_error_source"] = state.get("last_error_source")
        WHATSAPP_AUTOPILOT_STATE["error_count"] = int(state.get("error_count") or 0)
        WHATSAPP_AUTOPILOT_STATE["consecutive_errors"] = int(state.get("consecutive_errors") or 0)


def _persist_whatsapp_autopilot_state():
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        payload = {
            "version": 1,
            "state": {
                "connectors": WHATSAPP_AUTOPILOT_STATE.get("connectors", {}),
                "processed_messages": int(WHATSAPP_AUTOPILOT_STATE.get("processed_messages") or 0),
                "runs_started": int(WHATSAPP_AUTOPILOT_STATE.get("runs_started") or 0),
                "last_inbound_at": WHATSAPP_AUTOPILOT_STATE.get("last_inbound_at"),
                "last_error": WHATSAPP_AUTOPILOT_STATE.get("last_error"),
                "last_error_at": WHATSAPP_AUTOPILOT_STATE.get("last_error_at"),
                "last_error_category": WHATSAPP_AUTOPILOT_STATE.get("last_error_category"),
                "last_error_source": WHATSAPP_AUTOPILOT_STATE.get("last_error_source"),
                "error_count": int(WHATSAPP_AUTOPILOT_STATE.get("error_count") or 0),
                "consecutive_errors": int(WHATSAPP_AUTOPILOT_STATE.get("consecutive_errors") or 0),
            },
        }
    _safe_write_json(ORION_WHATSAPP_AUTOPILOT_STATE_FILE, payload)


def _whatsapp_autopilot_mark_error(detail: str, source: str = "webhook"):
    _init()
    now = _utc_now_iso()
    category = _classify_autopilot_error(detail)
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["last_error"] = detail
        WHATSAPP_AUTOPILOT_STATE["last_error_at"] = now
        WHATSAPP_AUTOPILOT_STATE["last_error_category"] = category
        WHATSAPP_AUTOPILOT_STATE["last_error_source"] = str(source or "webhook")
        WHATSAPP_AUTOPILOT_STATE["error_count"] = int(WHATSAPP_AUTOPILOT_STATE.get("error_count") or 0) + 1
        WHATSAPP_AUTOPILOT_STATE["consecutive_errors"] = int(WHATSAPP_AUTOPILOT_STATE.get("consecutive_errors") or 0) + 1
        WHATSAPP_AUTOPILOT_STATE["last_inbound_at"] = now
    _persist_whatsapp_autopilot_state()


def _whatsapp_autopilot_activate():
    _init()
    if not ORION_WHATSAPP_AUTOPILOT_ENABLED:
        return
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["enabled"] = True
        WHATSAPP_AUTOPILOT_STATE["active"] = True
        if not WHATSAPP_AUTOPILOT_STATE.get("started_at"):
            WHATSAPP_AUTOPILOT_STATE["started_at"] = _utc_now_iso()
    _persist_whatsapp_autopilot_state()


def _whatsapp_autopilot_mark_inbound(clear_error: bool = True):
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["last_inbound_at"] = _utc_now_iso()
        if clear_error:
            WHATSAPP_AUTOPILOT_STATE["last_error"] = None
            WHATSAPP_AUTOPILOT_STATE["last_error_at"] = None
            WHATSAPP_AUTOPILOT_STATE["last_error_category"] = None
            WHATSAPP_AUTOPILOT_STATE["last_error_source"] = None
            WHATSAPP_AUTOPILOT_STATE["consecutive_errors"] = 0
    _persist_whatsapp_autopilot_state()


def _whatsapp_connector_state(credential_id: str) -> Dict[str, Any]:
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        connectors = WHATSAPP_AUTOPILOT_STATE.setdefault("connectors", {})
        raw = connectors.get(credential_id)
        if not isinstance(raw, dict):
            raw = {}
        connectors[credential_id] = raw
        return raw


def _set_whatsapp_connector_state(credential_id: str, patch: Dict[str, Any]):
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        connectors = WHATSAPP_AUTOPILOT_STATE.setdefault("connectors", {})
        current = connectors.get(credential_id)
        if not isinstance(current, dict):
            current = {}
        for key, value in patch.items():
            current[key] = value
        connectors[credential_id] = current
    _persist_whatsapp_autopilot_state()


def _list_whatsapp_connector_entries() -> List[Dict[str, Any]]:
    _init()
    requested_ws = _normalize_workspace_id(ORION_WHATSAPP_AUTOPILOT_WORKSPACE_ID)
    entries: List[Dict[str, Any]] = []
    seen_identities: set[str] = set()
    for item in load_vault().get("credentials", []):
        if not isinstance(item, dict):
            continue
        if str(item.get("provider") or "").strip().lower() != "whatsapp_twilio":
            continue
        if not _workspace_visible(item.get("workspace_id"), requested_ws):
            continue
        if _connector_paused(item):
            continue
        credential_id = str(item.get("id") or "").strip()
        workspace_id = _normalize_workspace_id(item.get("workspace_id"))
        if not credential_id:
            continue
        try:
            secret = resolve_vault_credential(credential_id, workspace_id)
        except Exception:
            continue
        account_sid = str(secret.get("account_sid") or "").strip()
        from_number = _normalize_whatsapp_number(secret.get("from_number"))
        to_number = _normalize_whatsapp_number(secret.get("to_number"))
        identity = f"{account_sid}:{from_number}:{to_number}" if account_sid and from_number and to_number else ""
        if identity:
            if identity in seen_identities:
                continue
            seen_identities.add(identity)
        entries.append(item)
    entries.sort(key=lambda item: str(item.get("label") or "").lower())
    return entries


def _whatsapp_autopilot_snapshot(include_connectors: bool = False) -> Dict[str, Any]:
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        connectors_raw = WHATSAPP_AUTOPILOT_STATE.get("connectors", {})
        connectors = dict(connectors_raw) if isinstance(connectors_raw, dict) else {}
        snapshot: Dict[str, Any] = {
            "enabled": bool(ORION_WHATSAPP_AUTOPILOT_ENABLED),
            "active": bool(WHATSAPP_AUTOPILOT_STATE.get("active")),
            "started_at": WHATSAPP_AUTOPILOT_STATE.get("started_at"),
            "last_inbound_at": WHATSAPP_AUTOPILOT_STATE.get("last_inbound_at"),
            "last_error": WHATSAPP_AUTOPILOT_STATE.get("last_error"),
            "last_error_at": WHATSAPP_AUTOPILOT_STATE.get("last_error_at"),
            "last_error_category": WHATSAPP_AUTOPILOT_STATE.get("last_error_category"),
            "last_error_source": WHATSAPP_AUTOPILOT_STATE.get("last_error_source"),
            "error_count": int(WHATSAPP_AUTOPILOT_STATE.get("error_count") or 0),
            "consecutive_errors": int(WHATSAPP_AUTOPILOT_STATE.get("consecutive_errors") or 0),
            "processed_messages": int(WHATSAPP_AUTOPILOT_STATE.get("processed_messages") or 0),
            "runs_started": int(WHATSAPP_AUTOPILOT_STATE.get("runs_started") or 0),
            "run_timeout_seconds": ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS,
            "max_reply_chars": ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS,
            "require_prefix": bool(ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX),
            "prefix": ORION_WHATSAPP_AUTOPILOT_PREFIX,
            "default_profile": ORION_WHATSAPP_AUTOPILOT_PROFILE,
            "state_file": str(ORION_WHATSAPP_AUTOPILOT_STATE_FILE),
            # WhatsApp autopilot is webhook-driven (no poll thread); treat active state as listener liveliness.
            "thread_alive": bool(ORION_WHATSAPP_AUTOPILOT_ENABLED and WHATSAPP_AUTOPILOT_STATE.get("active")),
        }
    connector_error_count = 0
    for connector_state in connectors.values():
        if isinstance(connector_state, dict) and connector_state.get("last_error"):
            connector_error_count += 1
    snapshot["connector_state_count"] = len(connectors)
    snapshot["connector_error_count"] = connector_error_count
    try:
        snapshot["connectors_seen"] = len(_list_whatsapp_connector_entries())
    except Exception as exc:
        snapshot["connectors_seen"] = 0
        if not snapshot.get("last_error"):
            snapshot["last_error"] = str(exc)
            snapshot["last_error_category"] = _classify_autopilot_error(exc)
            snapshot["last_error_source"] = "list_connectors"
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["connectors_seen"] = int(snapshot.get("connectors_seen") or 0)
    if include_connectors:
        snapshot["connectors"] = connectors
    return snapshot


def _telegram_autopilot_mark_error(detail: str, source: str = "loop") -> float:
    _init()
    now_ts = time.time()
    now_iso = _utc_now_iso()
    category = _classify_autopilot_error(detail)
    source_name = str(source or "loop")
    backoff_seconds = 0.0
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["last_error"] = detail
        TELEGRAM_AUTOPILOT_STATE["last_poll_at"] = now_iso
        TELEGRAM_AUTOPILOT_STATE["last_error_at"] = now_iso
        TELEGRAM_AUTOPILOT_STATE["last_error_category"] = category
        TELEGRAM_AUTOPILOT_STATE["last_error_source"] = source_name
        TELEGRAM_AUTOPILOT_STATE["error_count"] = int(TELEGRAM_AUTOPILOT_STATE.get("error_count") or 0) + 1
        TELEGRAM_AUTOPILOT_STATE["consecutive_errors"] = int(TELEGRAM_AUTOPILOT_STATE.get("consecutive_errors") or 0) + 1
        if source_name == "loop":
            TELEGRAM_AUTOPILOT_STATE["retry_count"] = int(TELEGRAM_AUTOPILOT_STATE.get("retry_count") or 0) + 1
            TELEGRAM_AUTOPILOT_STATE["last_retry_at"] = now_iso
            consecutive = int(TELEGRAM_AUTOPILOT_STATE.get("consecutive_errors") or 0)
            base_delay = max(1.0, float(ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS))
            backoff_seconds = min(60.0, base_delay * (1.6 ** min(consecutive, 8)))
            TELEGRAM_AUTOPILOT_STATE["backoff_seconds"] = round(backoff_seconds, 3)
            TELEGRAM_AUTOPILOT_STATE["next_retry_at"] = _iso_from_epoch(now_ts + backoff_seconds)
    _persist_telegram_autopilot_state()
    return backoff_seconds


def _telegram_autopilot_mark_poll(clear_error: bool = True):
    _init()
    now = _utc_now_iso()
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["last_poll_at"] = now
        if clear_error:
            TELEGRAM_AUTOPILOT_STATE["last_error"] = None
            TELEGRAM_AUTOPILOT_STATE["last_error_at"] = None
            TELEGRAM_AUTOPILOT_STATE["last_error_category"] = None
            TELEGRAM_AUTOPILOT_STATE["last_error_source"] = None
            TELEGRAM_AUTOPILOT_STATE["consecutive_errors"] = 0
            TELEGRAM_AUTOPILOT_STATE["backoff_seconds"] = 0.0
            TELEGRAM_AUTOPILOT_STATE["next_retry_at"] = None
            TELEGRAM_AUTOPILOT_STATE["last_success_at"] = now


def _telegram_connector_state(credential_id: str) -> Dict[str, Any]:
    _init()
    with TELEGRAM_AUTOPILOT_LOCK:
        connectors = TELEGRAM_AUTOPILOT_STATE.setdefault("connectors", {})
        raw = connectors.get(credential_id)
        if not isinstance(raw, dict):
            raw = {}
        connectors[credential_id] = raw
        return raw


def _set_telegram_connector_state(credential_id: str, patch: Dict[str, Any]):
    _init()
    with TELEGRAM_AUTOPILOT_LOCK:
        connectors = TELEGRAM_AUTOPILOT_STATE.setdefault("connectors", {})
        current = connectors.get(credential_id)
        if not isinstance(current, dict):
            current = {}
        for key, value in patch.items():
            current[key] = value
        connectors[credential_id] = current
    _persist_telegram_autopilot_state()


def _list_telegram_connector_entries() -> List[Dict[str, Any]]:
    _init()
    requested_ws = _normalize_workspace_id(ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID)
    entries: List[Dict[str, Any]] = []
    seen_identities: set[str] = set()
    for item in load_vault().get("credentials", []):
        if not isinstance(item, dict):
            continue
        if str(item.get("provider") or "").strip().lower() != "telegram_bot":
            continue
        if not _workspace_visible(item.get("workspace_id"), requested_ws):
            continue
        if _connector_paused(item):
            continue
        try:
            secret = _telegram_get_secret(item)
        except Exception:
            continue
        bot_token = str(secret.get("bot_token") or "").strip()
        chat_id = str(secret.get("chat_id") or "").strip()
        identity = f"{bot_token}:{chat_id}" if bot_token and chat_id else ""
        if identity:
            if identity in seen_identities:
                continue
            seen_identities.add(identity)
        entries.append(item)
    entries.sort(key=lambda item: str(item.get("label") or "").lower())
    return entries


def _telegram_get_secret(entry: Dict[str, Any]) -> Dict[str, Any]:
    credential_id = str(entry.get("id") or "").strip()
    workspace_id = _normalize_workspace_id(entry.get("workspace_id"))
    if not credential_id:
        raise RuntimeError("Connector entry is missing id.")
    return resolve_vault_credential(credential_id, workspace_id)


def _telegram_api_request(
    bot_token: str,
    method_name: str,
    params: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    base = f"https://api.telegram.org/bot{bot_token}/{method_name}"
    if params:
        query_parts = []
        for key, value in params.items():
            if value is None:
                continue
            query_parts.append(f"{quote_plus(str(key))}={quote_plus(str(value))}")
        if query_parts:
            base = f"{base}?{'&'.join(query_parts)}"
    headers: Dict[str, str] = {}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    timeout_seconds = max(6, int(max(1.0, ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS)) + 3)
    res = http_json_request(base, method="POST" if payload is not None else "GET", headers=headers, payload=payload, timeout=timeout_seconds)
    body = res.get("json") if isinstance(res.get("json"), dict) else {}
    if not isinstance(body, dict):
        raise RuntimeError(f"Unexpected Telegram response for {method_name}.")
    if res.get("status") != 200 or not bool(body.get("ok")):
        detail = str(body.get("description") or "").strip()
        raise RuntimeError(detail or f"Telegram {method_name} failed.")
    result = body.get("result")
    return result if isinstance(result, dict) else {"result": result}


def _telegram_chat_matches(configured_chat_id: str, chat: Dict[str, Any]) -> bool:
    if not isinstance(chat, dict):
        return False
    if bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT", False)):
        return bool(str(chat.get("id") or chat.get("username") or "").strip())
    expected = str(configured_chat_id or "").strip()
    if not expected:
        return False
    if expected.lower() in {"*", "any", "all"}:
        return True
    chat_id = str(chat.get("id") or "").strip()
    chat_username = str(chat.get("username") or "").strip().lower()
    if expected.startswith("@"):
        return chat_username == expected[1:].lower()
    return chat_id == expected


def _telegram_parse_allow_from(value: Any) -> List[str]:
    tokens: List[str] = []
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        raw_items = value.split(",")
    else:
        raw_items = []
    for item in raw_items:
        token = str(item or "").strip().lower()
        if token:
            tokens.append(token)
    out: List[str] = []
    for token in tokens:
        normalized = token
        if normalized.startswith("id:"):
            normalized = normalized[3:].strip()
        elif normalized.startswith("user:"):
            normalized = f"@{normalized[5:].strip()}"
        if not normalized:
            continue
        if normalized in {"*", "any", "all"}:
            return ["*"]
        if normalized.startswith("@"):
            normalized = f"@{normalized[1:].strip().lower()}"
            if normalized == "@":
                continue
        elif re.fullmatch(r"-?\d+", normalized):
            pass
        else:
            normalized = f"@{normalized}"
        if normalized and normalized not in out:
            out.append(normalized)
    return out


def _telegram_resolve_allow_from(entry: Dict[str, Any]) -> List[str]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    env_value = os.getenv("ORION_TELEGRAM_AUTOPILOT_ALLOW_FROM", "")
    merged: List[str] = []
    for candidate in (
        metadata.get("allow_from"),
        metadata.get("telegram_allow_from"),
        metadata.get("autopilot_allow_from"),
        env_value,
    ):
        parsed = _telegram_parse_allow_from(candidate)
        for token in parsed:
            if token == "*":
                return ["*"]
            if token not in merged:
                merged.append(token)
    return merged


def _telegram_sender_allowed(sender: Dict[str, Any], allow_from: List[str]) -> bool:
    if not allow_from or "*" in allow_from:
        return True
    sender_id = str(sender.get("id") or "").strip()
    sender_username = str(sender.get("username") or "").strip().lower()
    if sender_id and sender_id in allow_from:
        return True
    if sender_username:
        normalized_username = f"@{sender_username}"
        if normalized_username in allow_from:
            return True
    return False


def _telegram_extract_message(update: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(update, dict):
        return None
    # Accept classic + newer Bot API message update envelopes.
    for key in (
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
        "business_message",
        "edited_business_message",
    ):
        candidate = update.get(key)
        if isinstance(candidate, dict):
            text = str(candidate.get("text") or candidate.get("caption") or "").strip()
            reply_to = candidate.get("reply_to_message") if isinstance(candidate.get("reply_to_message"), dict) else {}
            attachments: List[Dict[str, Any]] = []
            photos = candidate.get("photo") if isinstance(candidate.get("photo"), list) else []
            if photos:
                best_photo: Optional[Dict[str, Any]] = None
                for photo in photos:
                    if not isinstance(photo, dict):
                        continue
                    if best_photo is None:
                        best_photo = photo
                        continue
                    best_size = int(best_photo.get("file_size") or 0)
                    best_area = int(best_photo.get("width") or 0) * int(best_photo.get("height") or 0)
                    cur_size = int(photo.get("file_size") or 0)
                    cur_area = int(photo.get("width") or 0) * int(photo.get("height") or 0)
                    if cur_size > best_size or cur_area > best_area:
                        best_photo = photo
                if isinstance(best_photo, dict):
                    file_id = str(best_photo.get("file_id") or "").strip()
                    if file_id:
                        attachments.append(
                            {
                                "kind": "photo",
                                "file_id": file_id,
                                "file_unique_id": str(best_photo.get("file_unique_id") or "").strip(),
                                "file_size": int(best_photo.get("file_size") or 0),
                                "mime_type": "image/jpeg",
                                "width": int(best_photo.get("width") or 0),
                                "height": int(best_photo.get("height") or 0),
                            }
                        )

            document = candidate.get("document") if isinstance(candidate.get("document"), dict) else None
            if isinstance(document, dict):
                mime_type = str(document.get("mime_type") or "").strip().lower()
                if mime_type.startswith("image/"):
                    file_id = str(document.get("file_id") or "").strip()
                    if file_id:
                        attachments.append(
                            {
                                "kind": "document_image",
                                "file_id": file_id,
                                "file_unique_id": str(document.get("file_unique_id") or "").strip(),
                                "file_size": int(document.get("file_size") or 0),
                                "mime_type": mime_type or "application/octet-stream",
                                "file_name": str(document.get("file_name") or "").strip(),
                            }
                        )
            return {
                "text": text,
                "chat": candidate.get("chat") if isinstance(candidate.get("chat"), dict) else {},
                "from": candidate.get("from") if isinstance(candidate.get("from"), dict) else {},
                "message_id": candidate.get("message_id"),
                "reply_to_message_id": reply_to.get("message_id"),
                "date": candidate.get("date"),
                "kind": key,
                "attachments": attachments,
            }
    return None


def _telegram_safe_path_token(value: Any) -> str:
    token = re.sub(r"[^a-zA-Z0-9._-]+", "_", str(value or "").strip())
    return token.strip("._-") or "unknown"


def _telegram_extension_from_attachment(attachment: Dict[str, Any], remote_file_path: str) -> str:
    suffix = Path(str(remote_file_path or "")).suffix.strip().lower()
    if suffix:
        return suffix[:12]
    file_name = str(attachment.get("file_name") or "").strip()
    if file_name:
        name_suffix = Path(file_name).suffix.strip().lower()
        if name_suffix:
            return name_suffix[:12]
    mime_type = str(attachment.get("mime_type") or "").strip().lower()
    guessed = mimetypes.guess_extension(mime_type) if mime_type else None
    if guessed:
        return str(guessed).strip().lower()[:12]
    return ".bin"


def _telegram_download_file(bot_token: str, remote_file_path: str, dest_path: Path, max_bytes: int) -> int:
    file_url = f"https://api.telegram.org/file/bot{bot_token}/{remote_file_path}"
    req = urlrequest.Request(file_url, method="GET")
    context = ssl.create_default_context(cafile=certifi.where())
    total = 0
    with urlrequest.urlopen(req, timeout=20, context=context) as resp:
        with dest_path.open("wb") as handle:
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise RuntimeError(f"Attachment exceeds max size ({max_bytes} bytes).")
                handle.write(chunk)
    return total


def _telegram_store_attachments(
    *,
    bot_token: str,
    workspace_id: str,
    chat_id: str,
    update_id: int,
    message_id: str,
    attachments: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not ORION_TELEGRAM_MEDIA_ENABLED:
        return []
    if not isinstance(attachments, list) or not attachments:
        return []

    workspace_token = _telegram_safe_path_token(workspace_id or "default")
    chat_token = _telegram_safe_path_token(chat_id or "unknown")
    message_token = _telegram_safe_path_token(message_id or str(update_id))
    base_dir = ORION_TELEGRAM_MEDIA_DIR / workspace_token / chat_token
    try:
        base_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(base_dir, 0o700)
        except Exception:
            pass
    except Exception:
        return []

    stored: List[Dict[str, Any]] = []
    for idx, attachment in enumerate(attachments[:ORION_TELEGRAM_MEDIA_MAX_ITEMS], start=1):
        if not isinstance(attachment, dict):
            continue
        file_id = str(attachment.get("file_id") or "").strip()
        if not file_id:
            continue
        try:
            meta = _telegram_api_request(bot_token, "getFile", params={"file_id": file_id})
            remote_path = str(meta.get("file_path") or "").strip()
            if not remote_path:
                continue
            ext = _telegram_extension_from_attachment(attachment, remote_path)
            filename = f"{_telegram_safe_path_token(update_id)}_{message_token}_{idx}{ext}"
            destination = base_dir / filename
            size_bytes = _telegram_download_file(
                bot_token=bot_token,
                remote_file_path=remote_path,
                dest_path=destination,
                max_bytes=ORION_TELEGRAM_MEDIA_MAX_BYTES,
            )
            try:
                os.chmod(destination, 0o600)
            except Exception:
                pass
            relative_path = str(destination).replace(str(Path.cwd()) + os.sep, "")
            stored.append(
                {
                    "kind": str(attachment.get("kind") or "").strip() or "attachment",
                    "mime_type": str(attachment.get("mime_type") or "").strip(),
                    "file_id": file_id,
                    "file_unique_id": str(attachment.get("file_unique_id") or "").strip(),
                    "bytes": int(size_bytes),
                    "path": str(destination),
                    "relative_path": relative_path,
                }
            )
        except Exception:
            continue
    return stored


def _telegram_build_goal_with_attachments(goal: str, attachments: List[Dict[str, Any]]) -> str:
    request = str(goal or "").strip()
    if not request:
        request = "Please help with the attached image(s)."
    if not ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL:
        return request
    if not isinstance(attachments, list) or not attachments:
        return request
    lines = []
    for item in attachments[:ORION_TELEGRAM_MEDIA_MAX_ITEMS]:
        if not isinstance(item, dict):
            continue
        path = str(item.get("relative_path") or item.get("path") or "").strip()
        if not path:
            continue
        mime = str(item.get("mime_type") or "").strip()
        lines.append(f"- {path}" + (f" ({mime})" if mime else ""))
    if not lines:
        return request
    return (
        f"{request}\n\n"
        "Attached image files were saved locally in the workspace. If needed, inspect them before answering:\n"
        + "\n".join(lines)
    )


def _bool_from_any(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    raw = str(value).strip().lower()
    if raw in {"1", "true", "yes", "y", "on"}:
        return True
    if raw in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _connector_metadata(entry: Dict[str, Any]) -> Dict[str, Any]:
    return entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}


def _connector_assigned_agent_role(entry: Dict[str, Any]) -> str:
    _init()
    metadata = _connector_metadata(entry)
    normalize = globals().get("normalize_agent_role")
    if callable(normalize):
        try:
            return str(normalize(metadata.get("agent_role")) or "").strip().lower()
        except Exception:
            return ""
    return str(metadata.get("agent_role") or "").strip().lower()


def _connector_paused(entry: Dict[str, Any]) -> bool:
    return _bool_from_any(_connector_metadata(entry).get("paused"), False)


def _telegram_strip_prefix(text: str, prefix: str) -> Dict[str, Any]:
    raw = str(text or "").strip()
    pfx = str(prefix or "").strip()
    if not pfx:
        return {"matched": False, "body": raw}
    lowered = raw.lower()
    pfx_lower = pfx.lower()
    if lowered.startswith(pfx_lower):
        remainder = raw[len(pfx) :].strip()
        remainder = re.sub(r"^[:\-\s]+", "", remainder).strip()
        return {"matched": True, "body": remainder}
    if pfx.startswith("/") and lowered.startswith(f"{pfx_lower}@"):
        parts = raw.split(" ", 1)
        remainder = parts[1] if len(parts) > 1 else ""
        remainder = re.sub(r"^[:\-\s]+", "", remainder).strip()
        return {"matched": True, "body": remainder}
    return {"matched": False, "body": raw}


def _resolve_telegram_autopilot_profile(entry: Dict[str, Any]) -> Dict[str, Any]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    requested_profile = str(metadata.get("autopilot_profile") or ORION_TELEGRAM_AUTOPILOT_PROFILE).strip().lower()
    if requested_profile not in TELEGRAM_AUTOPILOT_PROFILE_CATALOG:
        requested_profile = "assistant"
    profile_base = TELEGRAM_AUTOPILOT_PROFILE_CATALOG.get(requested_profile, TELEGRAM_AUTOPILOT_PROFILE_CATALOG["assistant"])

    prefix = str(metadata.get("autopilot_prefix") or ORION_TELEGRAM_AUTOPILOT_PREFIX).strip() or ORION_TELEGRAM_AUTOPILOT_PREFIX
    require_prefix = _bool_from_any(metadata.get("autopilot_require_prefix"), ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX)
    allow_free_text = _bool_from_any(metadata.get("autopilot_allow_free_text"), bool(profile_base.get("allow_free_text")))
    allow_status = _bool_from_any(metadata.get("autopilot_allow_status"), bool(profile_base.get("allow_status")))
    allow_help = _bool_from_any(metadata.get("autopilot_allow_help"), bool(profile_base.get("allow_help")))

    return {
        "id": requested_profile,
        "label": profile_base.get("label"),
        "description": profile_base.get("description"),
        "prefix": prefix,
        "require_prefix": require_prefix,
        "allow_free_text": allow_free_text,
        "allow_status": allow_status,
        "allow_help": allow_help,
    }


def _resolve_whatsapp_autopilot_profile(entry: Dict[str, Any]) -> Dict[str, Any]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    requested_profile = str(
        metadata.get("autopilot_profile_whatsapp")
        or metadata.get("autopilot_profile")
        or ORION_WHATSAPP_AUTOPILOT_PROFILE
    ).strip().lower()
    if requested_profile not in WHATSAPP_AUTOPILOT_PROFILE_CATALOG:
        requested_profile = "assistant"
    profile_base = WHATSAPP_AUTOPILOT_PROFILE_CATALOG.get(requested_profile, WHATSAPP_AUTOPILOT_PROFILE_CATALOG["assistant"])

    prefix = str(
        metadata.get("autopilot_prefix_whatsapp")
        or metadata.get("autopilot_prefix")
        or ORION_WHATSAPP_AUTOPILOT_PREFIX
    ).strip() or ORION_WHATSAPP_AUTOPILOT_PREFIX
    require_prefix = _bool_from_any(
        metadata.get("autopilot_require_prefix_whatsapp")
        if metadata.get("autopilot_require_prefix_whatsapp") is not None
        else metadata.get("autopilot_require_prefix"),
        ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX,
    )
    allow_free_text = _bool_from_any(metadata.get("autopilot_allow_free_text"), bool(profile_base.get("allow_free_text")))
    allow_status = _bool_from_any(metadata.get("autopilot_allow_status"), bool(profile_base.get("allow_status")))
    allow_help = _bool_from_any(metadata.get("autopilot_allow_help"), bool(profile_base.get("allow_help")))

    return {
        "id": requested_profile,
        "label": profile_base.get("label"),
        "description": profile_base.get("description"),
        "prefix": prefix,
        "require_prefix": require_prefix,
        "allow_free_text": allow_free_text,
        "allow_status": allow_status,
        "allow_help": allow_help,
    }


def _telegram_route_message(raw_text: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    text = str(raw_text or "").strip()
    if not text:
        return {"action": "ignore", "reason": "empty"}

    prefix = str(profile.get("prefix") or "").strip()
    require_prefix = bool(profile.get("require_prefix"))
    stripped = _telegram_strip_prefix(text, prefix)
    prefix_matched = bool(stripped.get("matched"))
    body = str(stripped.get("body") or "").strip()

    if require_prefix and not prefix_matched:
        return {"action": "ignore", "reason": "prefix_required"}

    content = body if prefix_matched else text
    if not content:
        return {"action": "help"} if bool(profile.get("allow_help")) else {"action": "ignore", "reason": "empty_after_prefix"}

    tokens = content.split(None, 1)
    command = str(tokens[0] or "").strip().lower().lstrip("/")
    remainder = str(tokens[1] or "").strip() if len(tokens) > 1 else ""

    if command in {"start", "onboard", "setup"}:
        return {"action": "onboard_start"}
    if command in {"help", "h", "?", "commands", "cmd"}:
        return {"action": "help"} if bool(profile.get("allow_help")) else {"action": "ignore", "reason": "help_disabled"}
    if command in {"home", "main"}:
        return {"action": "menu_main"}
    if command in {"status", "health"}:
        return {"action": "status"} if bool(profile.get("allow_status")) else {"action": "help"}
    if command in {"orion", "empyralis"}:
        rem = re.sub(r"\s+", " ", remainder.lower()).strip()
        if not rem or rem in {"menu", "home", "main"}:
            return {"action": "menu_main"}
        if rem in {"help", "commands"}:
            return {"action": "help"} if bool(profile.get("allow_help")) else {"action": "ignore", "reason": "help_disabled"}
        if rem in {"status", "health"}:
            return {"action": "status"} if bool(profile.get("allow_status")) else {"action": "help"}
        if rem in {"me", "profile", "context"}:
            return {"action": "profile_show"}
        if rem.startswith("run "):
            run_goal = remainder[4:].strip()
            if run_goal:
                return {"action": "run", "goal": run_goal}
            return {"action": "help", "reason": "missing_goal"}
        return {"action": "run", "goal": remainder}
    if command in {"approvals", "approval", "pending"}:
        limit = 5
        if remainder:
            try:
                limit = max(1, min(20, int(remainder.split()[0])))
            except Exception:
                limit = 5
        return {"action": "approvals", "limit": limit}
    if command in {"approve", "ok"}:
        if not remainder:
            return {"action": "help", "reason": "missing_approval_id"}
        parts = remainder.split(None, 1)
        event_id = str(parts[0] or "").strip()
        note = str(parts[1] or "").strip() if len(parts) > 1 else ""
        if not event_id:
            return {"action": "help", "reason": "missing_approval_id"}
        return {"action": "approve", "event_id": event_id, "note": note}
    if command in {"reject", "deny"}:
        if not remainder:
            return {"action": "help", "reason": "missing_approval_id"}
        parts = remainder.split(None, 1)
        event_id = str(parts[0] or "").strip()
        note = str(parts[1] or "").strip() if len(parts) > 1 else ""
        if not event_id:
            return {"action": "help", "reason": "missing_approval_id"}
        return {"action": "reject", "event_id": event_id, "note": note}
    if command in {"run", "do", "task"}:
        if remainder:
            return {"action": "run", "goal": remainder}
        return {"action": "help", "reason": "missing_goal"}
    if command in {"menu", "buttons", "keyboard"}:
        menu_remainder = re.sub(r"\s+", " ", remainder.lower()).strip()
        if menu_remainder.startswith("study") or menu_remainder.startswith("work"):
            return {"action": "menu_study"}
        if menu_remainder.startswith("project"):
            return {"action": "menu_project"}
        if menu_remainder.startswith("skill"):
            return {"action": "menu_skills"}
        if menu_remainder.startswith("context"):
            return {"action": "menu_context"}
        return {"action": "menu_main"}
    if command in {"skill", "skills"}:
        if not remainder:
            return {"action": "menu_skills"}
        skill = _telegram_select_skill_from_text(remainder)
        if not skill:
            return {"action": "help", "reason": "unknown_skill"}
        return {"action": "run", "goal": _telegram_skill_goal(skill), "source": "skill_menu", "skill": skill}
    if command in {"me", "profile", "context"}:
        if not remainder:
            return {"action": "profile_show"}
        parts = remainder.split(None, 2)
        sub = str(parts[0] or "").strip().lower().lstrip("/") if parts else ""
        if sub in {"show", "view", "list"}:
            return {"action": "profile_show"}
        if sub in {"clear", "reset", "delete", "remove"}:
            field_raw = str(parts[1] or "").strip() if len(parts) > 1 else ""
            if not field_raw:
                return {"action": "profile_clear", "field": ""}
            field_name = _normalize_telegram_profile_field(field_raw)
            if not field_name:
                return {"action": "profile_help", "reason": "unknown_field"}
            return {"action": "profile_clear", "field": field_name}
        if sub in {"set", "update"}:
            if len(parts) < 3:
                return {"action": "profile_help", "reason": "missing_field_or_value"}
            field_name = _normalize_telegram_profile_field(str(parts[1] or "").strip())
            value = str(parts[2] or "").strip()
            if not field_name or not value:
                return {"action": "profile_help", "reason": "missing_field_or_value"}
            return {"action": "profile_set", "field": field_name, "value": value}
        shorthand_field = _normalize_telegram_profile_field(sub)
        if shorthand_field and len(parts) >= 2:
            value = str(remainder.split(None, 1)[1] or "").strip()
            if value:
                return {"action": "profile_set", "field": shorthand_field, "value": value}
        if bool(profile.get("allow_free_text")):
            return {"action": "run", "goal": content}
        return {"action": "profile_help"}

    normalized_content = re.sub(r"\s+", " ", content.lower()).strip()
    if normalized_content in {"study menu", "study", "work menu", "work"}:
        return {"action": "menu_study"}
    if normalized_content in {"project menu", "project"}:
        return {"action": "menu_project"}
    if normalized_content in {"skills menu", "skills", "skill menu"}:
        return {"action": "menu_skills"}
    if normalized_content in {"context", "context menu"}:
        return {"action": "menu_context"}
    if normalized_content in {"back to main", "main menu", "back"}:
        return {"action": "menu_main"}
    if normalized_content in {
        "orion",
        "orion home",
        "orion menu",
        "/orion",
        "/orion home",
        "/orion menu",
        "empyralis",
        "empyralis home",
        "empyralis menu",
        "/empyralis",
        "/empyralis home",
        "/empyralis menu",
    }:
        return {"action": "menu_main"}
    if normalized_content in {"my context", "show my context"}:
        return {"action": "profile_show"}
    if normalized_content in {"context help"}:
        return {"action": "profile_help"}
    if normalized_content.startswith("skill:"):
        skill = _telegram_select_skill_from_text(normalized_content)
        if skill:
            return {"action": "run", "goal": _telegram_skill_goal(skill), "source": "skill_menu", "skill": skill}
    if normalized_content in {"start", "start onboarding", "onboard me"}:
        return {"action": "onboard_start"}

    quick_goal = _TELEGRAM_MENU_GOAL_TEMPLATES.get(normalized_content) or _TELEGRAM_QUICK_GOAL_TEMPLATES.get(normalized_content)
    if quick_goal:
        return {"action": "run", "goal": quick_goal, "source": "quick_goal"}

    if bool(profile.get("allow_free_text")):
        return {"action": "run", "goal": content}
    return {"action": "help", "reason": "unknown_command"}


def _telegram_help_text(profile: Dict[str, Any]) -> str:
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
    require_prefix = bool(profile.get("require_prefix"))
    cmd_prefix = f"{prefix} " if require_prefix else ""
    lines = [
        "Empyralis Commands",
        f"- {cmd_prefix}run <goal>",
        f"- {cmd_prefix}onboard (quick context setup)",
        f"- {cmd_prefix}home (open main menu)",
    ]
    lines.append(f"- {cmd_prefix}commands (same as help)")
    if bool(profile.get("allow_status")):
        lines.append(f"- {cmd_prefix}status")
    lines.append(f"- {cmd_prefix}approvals [limit]")
    lines.append(f"- {cmd_prefix}approve <event_id> [note]")
    lines.append(f"- {cmd_prefix}reject <event_id> [reason]")
    lines.append(f"- {cmd_prefix}start (chat onboarding)")
    lines.append(f"- {cmd_prefix}me (show/save your context)")
    lines.append(f"- {cmd_prefix}skills (open skills menu)")
    lines.append(f"- {cmd_prefix}skill <id|name> (run with that skill)")
    lines.append(f"- {cmd_prefix}buttons (show quick actions)")
    if bool(profile.get("allow_help")):
        lines.append(f"- {cmd_prefix}help")
    if bool(profile.get("allow_free_text")):
        lines.append("- Or send plain text to start a run.")
    else:
        lines.append("- Plain text is ignored in this profile.")
    if require_prefix:
        lines.append(f"- Prefix mode is on ({prefix}).")
    return "\n".join(lines)


def _telegram_is_explicit_run_command(raw_text: str) -> bool:
    text = str(raw_text or "").strip()
    if not text:
        return False
    first = text.split(None, 1)[0].strip().lower().lstrip("/")
    return first in {"run", "do", "task"}


def _runtime_status_text(workspace_id: str) -> str:
    runtime_valid = not ORION_ENGINE_VALIDATION_ERRORS
    runtime_status = "healthy" if runtime_valid else "check"

    with METRICS_LOCK:
        runs_started = int(RUNTIME_METRICS.get("runs_started") or 0)
        runs_completed = int(RUNTIME_METRICS.get("runs_completed") or 0)
        runs_failed = int(RUNTIME_METRICS.get("runs_failed") or 0)
        runs_timeout = int(RUNTIME_METRICS.get("runs_timeout") or 0)

    with LOCAL_QUEUE_LOCK:
        pending_runs = len(LOCAL_PENDING_RUN_IDS)
        claimed_runs = len(LOCAL_CLAIMED_RUNS)
        now = _utc_now()
        online_workers = len(
            [
                record
                for record in LOCAL_WORKER_REGISTRY.values()
                if isinstance(record, dict) and _autopilot_is_worker_online(record, now)
            ]
        )

    recent_line = "none"
    with RUN_HISTORY_LOCK:
        if RUN_HISTORY:
            latest = RUN_HISTORY[0] if isinstance(RUN_HISTORY[0], dict) else {}
            rid = str(latest.get("run_id") or "")[:8]
            status = str(latest.get("status") or "unknown")
            recent_line = f"{rid} {status}" if rid else status

    lines = [
        "Empyralis Runtime Status",
        f"- workspace: {workspace_id}",
        f"- runtime: {runtime_status}",
        f"- runs: started={runs_started} completed={runs_completed} failed={runs_failed} timeout={runs_timeout}",
        f"- local companion: online_workers={online_workers} pending={pending_runs} claimed={claimed_runs}",
        f"- recent: {recent_line}",
    ]
    return "\n".join(lines)


def _autopilot_is_worker_online(record: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    helper = globals().get("_is_worker_online")
    if callable(helper):
        try:
            return bool(helper(record, now))
        except Exception:
            pass

    ref = now or _utc_now()
    seen_at = _parse_utc_ts(record.get("last_seen_at"))
    if seen_at is None:
        return False
    lease_seconds = int(record.get("lease_seconds") or ORION_LOCAL_LEASE_SECONDS)
    # Match local_queue semantics when helper is unavailable.
    online_window_seconds = max(20, lease_seconds * 2)
    return (ref - seen_at).total_seconds() <= online_window_seconds


def _local_companion_snapshot() -> Dict[str, int]:
    now = _utc_now()
    with LOCAL_QUEUE_LOCK:
        pending_runs = len(LOCAL_PENDING_RUN_IDS)
        claimed_runs = len(LOCAL_CLAIMED_RUNS)
        online_workers = len(
            [
                record
                for record in LOCAL_WORKER_REGISTRY.values()
                if isinstance(record, dict) and _autopilot_is_worker_online(record, now)
            ]
        )
    return {
        "online_workers": int(online_workers),
        "pending_runs": int(pending_runs),
        "claimed_runs": int(claimed_runs),
    }


def _telegram_runtime_status_text(workspace_id: str) -> str:
    return _runtime_status_text(workspace_id)


def _whatsapp_help_text(profile: Dict[str, Any]) -> str:
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
    lines = [
        "Empyralis WhatsApp Commands",
        f"- {prefix} run <goal>",
    ]
    if bool(profile.get("allow_status")):
        lines.append(f"- {prefix} status")
    lines.append(f"- {prefix} approvals [limit]")
    lines.append(f"- {prefix} approve <event_id> [note]")
    lines.append(f"- {prefix} reject <event_id> [reason]")
    if bool(profile.get("allow_help")):
        lines.append(f"- {prefix} help")
    if bool(profile.get("allow_free_text")):
        lines.append("- Or send plain text to start a run.")
    else:
        lines.append("- Plain text is ignored in this profile.")
    return "\n".join(lines)


def _normalize_whatsapp_number(raw_value: Any) -> str:
    value = str(raw_value or "").strip().replace(" ", "")
    if not value:
        return ""
    if value.lower() in {"*", "whatsapp:*"}:
        return "whatsapp:*"
    if value.lower().startswith("whatsapp:"):
        suffix = value.split(":", 1)[1]
        return f"whatsapp:{suffix}"
    if value.startswith("+"):
        return f"whatsapp:{value}"
    return value.lower()


def _whatsapp_twiml(message: Optional[str] = None) -> Response:
    if message and str(message).strip():
        safe = html.escape(str(message), quote=False)
        xml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{safe}</Message></Response>'
    else:
        xml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    return Response(content=xml, media_type="application/xml")


def _twilio_send_whatsapp_message(
    account_sid: str,
    auth_token: str,
    from_number: str,
    to_number: str,
    body: str,
):
    sid = str(account_sid or "").strip()
    token = str(auth_token or "").strip()
    sender = _normalize_whatsapp_number(from_number)
    receiver = _normalize_whatsapp_number(to_number)
    if not sid or not token:
        raise RuntimeError("Twilio account_sid/auth_token are required.")
    if not sender or not receiver:
        raise RuntimeError("Twilio From/To numbers are required.")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{quote_plus(sid)}/Messages.json"
    basic = base64.b64encode(f"{sid}:{token}".encode("utf-8")).decode("ascii")
    payload = urlencode({"From": sender, "To": receiver, "Body": str(body or "")}).encode("utf-8")
    headers = {
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    req = urlrequest.Request(url, data=payload, headers=headers, method="POST")
    context = ssl.create_default_context(cafile=certifi.where())
    try:
        with urlrequest.urlopen(req, timeout=15, context=context) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
            parsed = json.loads(raw) if raw else {}
            if resp.status not in {200, 201}:
                raise RuntimeError(f"Twilio send failed: status {resp.status}")
            return parsed if isinstance(parsed, dict) else {}
    except urlerror.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        detail = raw or str(exc)
        raise RuntimeError(f"Twilio send failed: HTTP {exc.code}: {detail}") from exc
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc


def _truncate_one_line(text: str, limit: int) -> str:
    flat = re.sub(r"\s+", " ", str(text or "")).strip()
    cap = max(120, limit)
    if len(flat) <= cap:
        return flat
    return flat[: cap - 1].rstrip() + "…"


def _extract_run_error_messages(run: Dict[str, Any]) -> List[str]:
    messages: List[str] = []
    events = run.get("events") if isinstance(run.get("events"), list) else []
    for event in events:
        if not isinstance(event, dict):
            continue
        event_name = str(event.get("event") or "").strip().lower()
        if event_name != "run_error":
            continue
        message = str(event.get("message") or "").strip()
        if message:
            messages.append(message)
    for key in ("error", "last_error"):
        message = str(run.get(key) or "").strip()
        if message:
            messages.append(message)
    deduped: List[str] = []
    seen: set[str] = set()
    for message in messages:
        marker = message.lower()
        if marker in seen:
            continue
        seen.add(marker)
        deduped.append(message)
    return deduped


def _latest_run_error_message(run: Dict[str, Any]) -> str:
    messages = _extract_run_error_messages(run)
    if not messages:
        return ""
    return messages[-1]


def _is_non_retryable_run_error(detail: str) -> bool:
    text = str(detail or "").strip().lower()
    if not text:
        return False
    return any(marker in text for marker in _AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS)


def _friendly_autopilot_run_error(detail: str) -> str:
    text = str(detail or "").strip()
    lower = text.lower()
    if "missing scopes" in lower or "api.responses.write" in lower:
        return "AI account authorization failed. Missing required scope: api.responses.write. Open Setup and reconnect your AI account."
    if (
        "invalid api key" in lower
        or "incorrect api key" in lower
        or "unauthorized" in lower
        or "forbidden" in lower
    ):
        return "AI account authorization failed. Open Setup and reconnect your AI account."
    if "no credentials available" in lower or "api key is required" in lower or "api_key is required" in lower:
        return "No valid AI account is connected. Open Setup and connect an account."
    return text or "Run failed."


def _humanize_telegram_run_summary(summary: str) -> str:
    text = str(summary or "").strip()
    if not text:
        return "Something went wrong. Please try again."

    lower = text.lower()
    if "run timed out waiting on local companion" in lower:
        return "Still working on it, but the local helper is taking too long. Give me a moment and try again."
    if "local companion is offline" in lower:
        return "The local helper is offline right now. Start it in Setup and try again."
    if lower == "run not found." or "run not found" in lower:
        return "I lost track of that request. Please send it again."
    if "missing required scope" in lower or "api.responses.write" in lower:
        return "Your AI account needs to be reconnected before I can continue. Open Setup and reconnect it."
    if (
        "ai account authorization failed" in lower
        or "invalid api key" in lower
        or "incorrect api key" in lower
        or "unauthorized" in lower
        or "forbidden" in lower
    ):
        return "Your AI account needs attention before I can continue. Open Setup and reconnect it."
    if "no valid ai account is connected" in lower or "no credentials available" in lower:
        return "I do not have a working AI account connected right now. Open Setup and connect one."
    if "approval window timed out" in lower or "approval timeout" in lower:
        return "I waited too long for approval. Please send the request again and approve it when prompted."
    if "requires local companion execution" in lower:
        return "That task needs local execution first. Start the local helper in Setup and try again."
    if "run blocked by safety policy" in lower or "action policy blocked" in lower:
        return "That action is blocked by your current safety settings. Review approvals or trust settings and try again."
    if lower == "run failed." or "run failed on attempt" in lower:
        return "Something went wrong while I was handling that. Please try again."
    if "run timed out while waiting for completion" in lower:
        return "I am taking longer than expected. Please try again in a moment."
    return text


def _summarize_run_terminal_result(run: Dict[str, Any], summary_limit: int) -> str:
    summary = str(run.get("result") or "").strip()
    if not summary and isinstance(run.get("result_data"), dict):
        summary = _truncate_one_line(json.dumps(run.get("result_data")), summary_limit)
    if not summary:
        latest_error = _latest_run_error_message(run)
        if latest_error:
            summary = _friendly_autopilot_run_error(latest_error)
    if not summary:
        summary = "Run finished."
    return _truncate_one_line(summary, summary_limit)


def _autopilot_include_run_meta() -> bool:
    raw = str(os.getenv("ORION_AUTOPILOT_INCLUDE_RUN_META", "0") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _autopilot_run_reply_text(status: str, run_id: str, summary: str) -> str:
    cleaned_summary = _humanize_telegram_run_summary(summary)
    if not _autopilot_include_run_meta():
        return cleaned_summary
    status_label = "⬢ completed" if str(status or "").strip().lower() == "completed" else "⬢ failed"
    if str(run_id or "").strip():
        return f"{status_label}\nrun_id: {run_id}\n{cleaned_summary}"
    return f"{status_label}\n{cleaned_summary}"


def _cognitive_defaults() -> Dict[str, str]:
    niche_id = str(os.getenv("ORION_COGNITIVE_NICHE_ID") or "astronomy").strip() or "astronomy"
    db_override = str(os.getenv("ORION_COGNITIVE_DB_PATH") or "").strip()
    if db_override:
        db_path = db_override
    else:
        root_dir = Path(__file__).resolve().parents[1]
        db_path = str(root_dir / "python_engine" / "agency_memory.db")
    return {"niche_id": niche_id, "db_path": db_path}


def _cognitive_module():
    try:
        from python_engine import cognitive_daemon as _cd  # type: ignore
        return _cd
    except Exception:
        return None


def _autopilot_approvals_list(limit: int = 5) -> Dict[str, Any]:
    mod = _cognitive_module()
    if mod is None:
        return {"ok": False, "error": "cognitive_daemon_unavailable"}
    conf = _cognitive_defaults()
    try:
        items = mod.list_pending_approvals(
            db_path=conf["db_path"],
            niche_id=conf["niche_id"],
            limit=max(1, min(20, int(limit))),
        )
        return {"ok": True, "items": items, "count": len(items)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _autopilot_approval_resolve(event_id: str, approved: bool, note: str = "") -> Dict[str, Any]:
    mod = _cognitive_module()
    if mod is None:
        return {"ok": False, "error": "cognitive_daemon_unavailable"}
    conf = _cognitive_defaults()
    try:
        out = mod.resolve_event_approval(
            db_path=conf["db_path"],
            event_id=str(event_id or "").strip(),
            approved=bool(approved),
            note=str(note or "").strip(),
        )
        return out if isinstance(out, dict) else {"ok": False, "error": "invalid_resolve_response"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _autopilot_approvals_text(payload: Dict[str, Any], prefix: str = DEFAULT_CHAT_PREFIX) -> str:
    if not bool(payload.get("ok")):
        reason = str(payload.get("error") or "unable to load approvals")
        return f"Empyralis approvals unavailable: {reason}"
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    if not items:
        return "No pending approvals."
    lines = ["Pending approvals:"]
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        event_id = str(item.get("event_id") or "").strip()
        short_id = event_id[:8] if event_id else "unknown"
        risk = str(item.get("risk_level") or "").strip() or "unknown"
        summary = _truncate_one_line(str(item.get("summary") or "").strip(), 96)
        objective_title = _truncate_one_line(str(item.get("objective_title") or "").strip(), 40)
        objective_id = str(item.get("objective_id") or "").strip()
        objective_text = ""
        if objective_title:
            objective_text = f" objective={objective_title}"
        elif objective_id:
            objective_text = f" objective={objective_id[:8]}"
        if event_id:
            lines.append(
                f"- {short_id} risk={risk}{objective_text} {summary}\n  event_id: {event_id}".rstrip()
            )
        else:
            lines.append(f"- {short_id} risk={risk}{objective_text} {summary}".rstrip())
    lines.append(f"Use {prefix} approve <event_id> or {prefix} reject <event_id> <reason>")
    return "\n".join(lines)


def _autopilot_approval_result_text(payload: Dict[str, Any], approved: bool) -> str:
    if not bool(payload.get("ok")):
        reason = str(payload.get("error") or "approval update failed")
        return f"Approval update failed: {reason}"
    event_id = str(payload.get("event_id") or "").strip()
    short_id = event_id[:8] if event_id else "unknown"
    status = str(payload.get("status") or "").strip() or ("pending" if approved else "failed")
    if approved:
        return f"Approved {short_id}. Status: {status}."
    note = str(payload.get("note") or "").strip()
    suffix = f" Reason: {note}" if note else ""
    return f"Rejected {short_id}. Status: {status}.{suffix}"


def _telegram_send_message(
    bot_token: str,
    chat_id: str,
    text: str,
    workspace_id: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    connector_id: Optional[str] = None,
    parent_message_id: Optional[Any] = None,
    profile: Optional[Dict[str, Any]] = None,
    include_keyboard: bool = True,
    reply_markup: Optional[Dict[str, Any]] = None,
    trace_id: Optional[str] = None,
    source_event_id: Optional[str] = None,
):
    payload = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    if isinstance(reply_markup, dict) and reply_markup:
        payload["reply_markup"] = reply_markup
    elif include_keyboard and isinstance(profile, dict):
        default_keyboard = _telegram_reply_keyboard(profile)
        if default_keyboard:
            payload["reply_markup"] = default_keyboard
    resolved_trace_id = str(trace_id or "").strip()
    if not resolved_trace_id:
        resolved_trace_id = f"tg-out:{_telegram_safe_path_token(chat_id)}:{str(uuid.uuid4())[:10]}"
    try:
        result = _telegram_api_request(bot_token, "sendMessage", payload=payload)
    except Exception as exc:
        reason = str(exc)
        _append_channel_dead_letter(
            channel="telegram",
            direction="outbound",
            event_type="message",
            reason=reason,
            text=text,
            workspace_id=str(workspace_id or ""),
            session_key=_telegram_session_key(chat_id),
            run_id=str(run_id or ""),
            action=str(action or ""),
            connector_id=str(connector_id or ""),
            trace_id=resolved_trace_id,
            source_event_id=str(source_event_id or "").strip(),
            metadata={"transport": "telegram_sendMessage"},
        )
        raise
    sent = result.get("result") if isinstance(result.get("result"), dict) else {}
    sent_message_id = str(sent.get("message_id") or "").strip()
    session_key = _telegram_session_key(chat_id)
    _record_channel_event(
        channel="telegram",
        direction="outbound",
        event_type="message",
        text=text,
        workspace_id=workspace_id,
        session_key=session_key,
        session_id=session_key,
        message_id=sent_message_id or None,
        parent_id=str(parent_message_id or "").strip() or None,
        run_id=run_id,
        action=action,
        metadata={
            "connector_id": str(connector_id or "").strip(),
            "trace_id": resolved_trace_id,
            "source_event_id": str(source_event_id or "").strip(),
            "delivery_status": "sent",
            "delivery_transport": "telegram_sendMessage",
        },
    )


def _chat_id_from_session_key(session_key: str) -> str:
    key = str(session_key or "").strip()
    if not key:
        return ""
    if key.startswith("telegram:"):
        return key.split(":", 1)[1].strip()
    return ""


def _normalize_string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            token = str(item or "").strip()
            if token:
                out.append(token)
        return out
    return []


def _pending_approval_event_id(item: Dict[str, Any]) -> str:
    return str(item.get("event_id") or "").strip()


def _telegram_notify_pending_approvals(
    *,
    connector_state: Dict[str, Any],
    bot_token: str,
    chat_id: str,
    workspace_id: str,
    profile: Dict[str, Any],
    connector_id: str,
) -> Dict[str, Any]:
    patch: Dict[str, Any] = {}
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX)
    payload = _autopilot_approvals_list(limit=20)
    if not bool(payload.get("ok")):
        reason = str(payload.get("error") or "unable to load approvals").strip() or "unable to load approvals"
        if reason != str(connector_state.get("last_approval_notify_error") or "").strip():
            patch["last_approval_notify_error"] = reason
        return patch

    patch["last_approval_notify_error"] = None
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    pending_items = [item for item in items if isinstance(item, dict)]
    pending_ids: List[str] = []
    for item in pending_items:
        event_id = _pending_approval_event_id(item)
        if event_id and event_id not in pending_ids:
            pending_ids.append(event_id)

    previous_ids = _normalize_string_list(connector_state.get("notified_approval_ids"))
    pending_id_set = set(pending_ids)
    retained_ids = [event_id for event_id in previous_ids if event_id in pending_id_set]
    retained_id_set = set(retained_ids)
    new_items = [item for item in pending_items if _pending_approval_event_id(item) not in retained_id_set]

    if new_items:
        new_payload = {"ok": True, "items": new_items}
        notify_text = "⚠️ Approval required.\n" + _autopilot_approvals_text(new_payload, prefix=prefix)
        _telegram_send_message(
            bot_token,
            chat_id,
            notify_text,
            workspace_id=workspace_id,
            action="approval_notify",
            connector_id=connector_id,
            profile=profile,
            include_keyboard=False,
        )
        patch["last_approval_notified_at"] = _utc_now_iso()
        patch["last_approval_notified_count"] = len(new_items)

    patch["notified_approval_ids"] = pending_ids[:40]
    patch["last_pending_approval_count"] = len(pending_ids)
    return patch


async def handle_telegram_send_message(
    text: str,
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    message = str(text or "").strip()
    if not message:
        raise RuntimeError("Message text is required.")
    if len(message) > 3900:
        raise RuntimeError("Message is too long for Telegram. Keep it under 3900 characters.")

    requested_workspace = _normalize_workspace_id(workspace_id)
    requested_chat_id = str(chat_id or "").strip() or _chat_id_from_session_key(str(session_key or "").strip())
    entries = _list_telegram_connector_entries()
    if requested_workspace:
        entries = [item for item in entries if _normalize_workspace_id(item.get("workspace_id")) == requested_workspace]
    if not entries:
        scope = requested_workspace or "visible workspaces"
        raise RuntimeError(f"No Telegram connector found for workspace '{scope}'.")

    selected_entry: Optional[Dict[str, Any]] = None
    selected_secret: Optional[Dict[str, Any]] = None
    target_chat_id = ""
    last_error = ""

    for entry in entries:
        try:
            secret = _telegram_get_secret(entry)
            bot_token = str(secret.get("bot_token") or "").strip()
            configured_chat_id = str(secret.get("chat_id") or "").strip()
            if not bot_token:
                raise RuntimeError("Connector is missing bot_token.")
            resolved_chat_id = requested_chat_id or configured_chat_id
            if not resolved_chat_id:
                raise RuntimeError("Connector is missing chat_id.")
            selected_entry = entry
            selected_secret = secret
            target_chat_id = resolved_chat_id
            break
        except Exception as exc:
            last_error = str(exc)
            continue

    if not selected_entry or not selected_secret:
        if last_error:
            raise RuntimeError(last_error)
        raise RuntimeError("Unable to resolve Telegram connector credentials.")

    connector_id = str(selected_entry.get("id") or "").strip()
    connector_label = str(selected_entry.get("label") or "Telegram Bot").strip()
    workspace_norm = _normalize_workspace_id(selected_entry.get("workspace_id"))
    bot_token = str(selected_secret.get("bot_token") or "").strip()
    trace_id = f"tg-terminal:{_telegram_safe_path_token(target_chat_id)}:{str(uuid.uuid4())[:10]}"

    _telegram_send_message(
        bot_token=bot_token,
        chat_id=target_chat_id,
        text=message,
        workspace_id=workspace_norm,
        action="terminal_send",
        connector_id=connector_id,
        trace_id=trace_id,
    )
    _set_telegram_connector_state(
        connector_id,
        {
            "label": connector_label,
            "workspace_id": workspace_norm,
            "last_action": "terminal_send",
            "last_chat_id": target_chat_id,
            "last_error": None,
            "last_processed_at": _utc_now_iso(),
            "last_poll_at": _utc_now_iso(),
        },
    )

    return {
        "ok": True,
        "channel": "telegram",
        "connector_id": connector_id,
        "connector_label": connector_label,
        "workspace_id": workspace_norm,
        "chat_id": target_chat_id,
        "session_key": _telegram_session_key(target_chat_id),
        "text": message,
        "trace_id": trace_id,
        "sent_at": _utc_now_iso(),
    }


async def handle_telegram_autopilot_test_message(
    text: str,
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    chat_id: Optional[str] = None,
    connector_id: Optional[str] = None,
    sender_id: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    _init()
    message = str(text or "").strip()
    if not message:
        raise RuntimeError("Message text is required.")

    requested_workspace = _normalize_workspace_id(workspace_id)
    requested_connector_id = str(connector_id or "").strip()
    requested_chat_id = str(chat_id or "").strip() or _chat_id_from_session_key(str(session_key or "").strip())
    entries = _list_telegram_connector_entries()
    if requested_workspace:
        entries = [item for item in entries if _normalize_workspace_id(item.get("workspace_id")) == requested_workspace]
    if requested_connector_id:
        entries = [item for item in entries if str(item.get("id") or "").strip() == requested_connector_id]
    if not entries:
        scope = requested_workspace or "visible workspaces"
        raise RuntimeError(f"No Telegram connector found for workspace '{scope}'.")

    selected_entry: Optional[Dict[str, Any]] = None
    last_error = ""
    target_chat_id = ""
    for entry in entries:
        try:
            secret = _telegram_get_secret(entry)
            bot_token = str(secret.get("bot_token") or "").strip()
            configured_chat_id = str(secret.get("chat_id") or "").strip()
            if not bot_token:
                raise RuntimeError("Connector is missing bot_token.")
            resolved_chat_id = requested_chat_id or configured_chat_id
            if not resolved_chat_id:
                raise RuntimeError("Connector is missing chat_id.")
            if requested_chat_id and configured_chat_id and requested_chat_id != configured_chat_id:
                continue
            selected_entry = entry
            target_chat_id = resolved_chat_id
            break
        except Exception as exc:
            last_error = str(exc)
            continue

    if not selected_entry:
        if last_error:
            raise RuntimeError(last_error)
        raise RuntimeError("Unable to resolve Telegram connector credentials.")

    profile = _resolve_telegram_autopilot_profile(selected_entry)
    routed = _telegram_route_message(message, profile)
    action = str(routed.get("action") or "ignore").strip().lower()
    if action != "run":
        return {
            "ok": True,
            "channel": "telegram",
            "mode": "autopilot_test",
            "action": action,
            "routed": routed,
            "message": "Telegram autopilot routed the test message without starting a run.",
        }

    workspace_norm = _normalize_workspace_id(selected_entry.get("workspace_id")) or requested_workspace or "default"
    connector_id_value = str(selected_entry.get("id") or "").strip()
    sender_value = str(sender_id or "telegram-test-user").strip() or "telegram-test-user"
    chat_profile = _get_telegram_profile(workspace_norm, target_chat_id)
    goal = str(routed.get("goal") or "").strip()
    run_goal = _telegram_build_goal_with_profile(goal, chat_profile)
    connector_context = _telegram_workspace_connector_context(
        goal=goal,
        workspace_id=workspace_norm,
        current_connector_id=connector_id_value,
    )
    run_goal = _telegram_build_goal_with_connector_context(
        run_goal,
        str(connector_context.get("prompt_append") or "").strip(),
    )
    skill_query = _telegram_installed_skill_query(
        goal=goal,
        workspace_id=workspace_norm,
        connector_id=connector_id_value,
        chat_id=target_chat_id,
        session_key=_telegram_session_key(target_chat_id),
    )
    run_goal = _telegram_build_goal_with_connector_context(
        run_goal,
        str(skill_query.get("prompt_append") or "").strip(),
    )
    direct_response = str(skill_query.get("response") or "").strip() if bool(skill_query.get("handled")) else ""
    if direct_response:
        return {
            "ok": True,
            "channel": "telegram",
            "mode": "autopilot_test",
            "connector_id": connector_id_value,
            "chat_id": target_chat_id,
            "profile_id": str(profile.get("id") or "").strip(),
            "routed": routed,
            "connector_context": connector_context,
            "skill_query": skill_query,
            "result": {
                "status": "completed",
                "summary": direct_response,
                "reply": direct_response,
            },
        }
    run_info = _create_telegram_run(
        goal=run_goal,
        workspace_id=workspace_norm,
        connector_id=connector_id_value,
        chat_id=target_chat_id,
        sender_id=sender_value,
        update_id=int(time.time()),
        message_id=f"test-{str(uuid.uuid4())[:10]}",
        profile_context=chat_profile,
        trace_id=f"tg-test:{_telegram_safe_path_token(target_chat_id)}:{str(uuid.uuid4())[:10]}",
        source_event_id="telegram-test-message",
        connector_entry=selected_entry,
        connector_context=connector_context,
    )
    run_id = str(run_info.get("run_id") or "").strip()
    if not run_id:
        raise RuntimeError("Telegram autopilot test did not create a run.")
    result = await asyncio.to_thread(
        _wait_for_run_terminal_status,
        run_id,
        timeout_seconds,
        None,
    )
    run = runs.get(run_id) if isinstance(runs, dict) else None
    context = run.get("context") if isinstance(run, dict) and isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return {
        "ok": True,
        "channel": "telegram",
        "mode": "autopilot_test",
        "connector_id": connector_id_value,
        "chat_id": target_chat_id,
        "profile_id": str(profile.get("id") or "").strip(),
        "run_id": run_id,
        "routed": routed,
        "route": run_info.get("route"),
        "connector_context": connector_context,
        "skill_query": skill_query,
        "run_metadata": metadata,
        "result": result,
    }


def _create_telegram_run(
    goal: str,
    workspace_id: str,
    connector_id: str,
    chat_id: str,
    sender_id: str,
    update_id: int,
    message_id: Optional[str] = None,
    profile_context: Optional[Dict[str, str]] = None,
    media_attachments: Optional[List[Dict[str, Any]]] = None,
    skill_override: Optional[Dict[str, Any]] = None,
    trace_id: Optional[str] = None,
    source_event_id: Optional[str] = None,
    connector_entry: Optional[Dict[str, Any]] = None,
    connector_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    resolved_trace_id = str(trace_id or "").strip() or _telegram_trace_id(chat_id, update_id, message_id or "")
    metadata: Dict[str, Any] = {
        "source": "telegram_autopilot",
        "channel": "telegram",
        "source_channel": "telegram",
        "connector_credential_id": connector_id,
        "source_connector_credential_id": connector_id,
        "trace_id": resolved_trace_id,
        "source_event_id": str(source_event_id or "").strip(),
        "delivery_status": "pending",
        "telegram": {
            "chat_id": chat_id,
            "sender_id": sender_id,
            "update_id": update_id,
            "message_id": str(message_id or "").strip(),
        },
    }
    if isinstance(connector_context, dict):
        available_connectors = (
            connector_context.get("available_connectors")
            if isinstance(connector_context.get("available_connectors"), list)
            else []
        )
        if available_connectors:
            metadata["available_connectors"] = available_connectors
        channel_connectors = (
            connector_context.get("channel_connectors")
            if isinstance(connector_context.get("channel_connectors"), list)
            else []
        )
        if channel_connectors:
            metadata["channel_connectors"] = channel_connectors
        selected_connector_id = str(connector_context.get("connector_credential_id") or "").strip()
        if selected_connector_id:
            metadata["connector_credential_id"] = selected_connector_id
        selected_connector_provider = str(connector_context.get("connector_provider") or "").strip()
        if selected_connector_provider:
            metadata["connector_provider"] = selected_connector_provider
        connector_prompt_append = str(connector_context.get("prompt_append") or "").strip()
        if connector_prompt_append:
            metadata["connector_prompt_append"] = connector_prompt_append[:12000]
    if isinstance(profile_context, dict):
        profile_payload: Dict[str, str] = {}
        for field_name in _TELEGRAM_PROFILE_FIELDS:
            raw_value = str(profile_context.get(field_name) or "").strip()
            if raw_value:
                profile_payload[field_name] = raw_value[:2000]
        if profile_payload:
            metadata["telegram"]["profile_context"] = profile_payload
    if isinstance(media_attachments, list) and media_attachments:
        compact_media: List[Dict[str, Any]] = []
        for item in media_attachments[:ORION_TELEGRAM_MEDIA_MAX_ITEMS]:
            if not isinstance(item, dict):
                continue
            path = str(item.get("relative_path") or item.get("path") or "").strip()
            if not path:
                continue
            compact_media.append(
                {
                    "kind": str(item.get("kind") or "").strip(),
                    "mime_type": str(item.get("mime_type") or "").strip(),
                    "path": path[:2000],
                    "bytes": int(item.get("bytes") or 0),
                }
            )
        if compact_media:
            metadata["telegram"]["attachments"] = compact_media
    if isinstance(skill_override, dict):
        skill_id = str(skill_override.get("id") or "").strip().lower()
        skill_title = str(skill_override.get("title") or "").strip()
        skill_intent = str(skill_override.get("intent") or "").strip()
        if skill_id and skill_title and skill_intent:
            tools_raw = skill_override.get("tools") if isinstance(skill_override.get("tools"), list) else []
            tools = [str(item).strip()[:120] for item in tools_raw if str(item).strip()][:30]
            guardrail = str(skill_override.get("guardrail") or "").strip()[:1000]
            skill_payload = {
                "id": skill_id[:80],
                "title": skill_title[:120],
                "intent": skill_intent[:1200],
                "tools": tools,
                "guardrail": guardrail,
            }
            metadata["skill_scope"] = "assistant_defaults"
            metadata["skill_bundle"] = {
                "skill_ids": [skill_payload["id"]],
                "skills": [skill_payload],
            }
            metadata["skill_prompt_append"] = (
                "Active skill directives (follow unless user overrides explicitly):\n"
                f"- {skill_payload['title']}: {skill_payload['intent']} "
                f"Guardrail: {skill_payload['guardrail'] or 'none'}. "
                f"Tools: {', '.join(skill_payload['tools']) or 'none'}."
            )[:6000]
    assigned_role = _connector_assigned_agent_role(connector_entry or {})
    if assigned_role:
        metadata["agent_role"] = assigned_role
        metadata["agent_role_source"] = "connector_assignment"
    metadata["trust_mode"] = normalize_trust_mode(ORION_TELEGRAM_AUTOPILOT_TRUST_MODE)
    selected_target = normalize_execution_target(ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET)
    metadata["execution_target"] = selected_target
    route = decide_execution_target(metadata)
    metadata["execution_target_requested"] = route["requested"]
    metadata["execution_target_selected"] = route["selected"]
    metadata["execution_target_reason"] = route["reason"]
    if route.get("fallback"):
        metadata["execution_target_fallback"] = route.get("fallback")

    engine = ORION_TELEGRAM_AUTOPILOT_ENGINE if ORION_TELEGRAM_AUTOPILOT_ENGINE in ENGINE_REGISTRY else "orion"
    run_id = create_run(
        engine=engine,
        context={
            "workflow_id": None,
            "workspace_id": workspace_id,
            "user_goal": goal,
            "business_plan": None,
            "provider": None,
            "model": None,
            "credential_id": None,
            "agents": [],
            "metadata": metadata,
        },
    )
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["runs_started"] = int(TELEGRAM_AUTOPILOT_STATE.get("runs_started") or 0) + 1
    _persist_telegram_autopilot_state()
    _record_channel_event(
        channel="telegram",
        direction="system",
        event_type="run_started",
        text=f"Run started for chat {chat_id}",
        workspace_id=workspace_id,
        session_key=_telegram_session_key(chat_id),
        session_id=_telegram_session_key(chat_id),
        parent_id=str(message_id or "").strip() or None,
        run_id=run_id,
        action="run",
        metadata={
            "connector_id": connector_id,
            "sender_id": sender_id,
            "update_id": int(update_id or 0),
            "message_id": str(message_id or "").strip(),
            "trace_id": resolved_trace_id,
            "source_event_id": str(source_event_id or "").strip(),
            "delivery_status": "pending",
            "agent_role": assigned_role or None,
        },
    )
    return {"run_id": run_id, "route": route}


def _wait_for_run_terminal_status(
    run_id: str,
    timeout_seconds: Optional[int] = None,
    max_reply_chars: Optional[int] = None,
) -> Dict[str, Any]:
    wait_timeout = max(30, int(timeout_seconds if timeout_seconds is not None else ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS))
    summary_limit = int(max_reply_chars if max_reply_chars is not None else ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS)
    deadline = time.time() + wait_timeout
    auto_approved = False
    last_status = "starting"
    no_worker_since: Optional[float] = None
    no_worker_grace_seconds = max(8.0, min(20.0, float(wait_timeout) * 0.2))
    while time.time() < deadline:
        run = runs.get(run_id)
        if not isinstance(run, dict):
            return {"status": "failed", "summary": "Run not found."}
        latest_error = _latest_run_error_message(run)
        if latest_error and _is_non_retryable_run_error(latest_error):
            return {
                "status": "failed",
                "summary": _friendly_autopilot_run_error(latest_error),
                "auto_approved": auto_approved,
            }
        status = str(run.get("status") or "").strip().lower()
        if status:
            last_status = status
        if status in {"completed", "failed", "timeout"}:
            summary = _summarize_run_terminal_result(run, summary_limit)
            return {
                "status": status,
                "summary": summary,
                "auto_approved": auto_approved,
            }
        if status in {"queued_local", "running_local"}:
            local_state = _local_companion_snapshot()
            if local_state["online_workers"] <= 0 and local_state["claimed_runs"] <= 0:
                if no_worker_since is None:
                    no_worker_since = time.time()
                elif (time.time() - no_worker_since) >= no_worker_grace_seconds:
                    return {
                        "status": "failed",
                        "summary": (
                            "Local companion is offline. "
                            f"pending={local_state['pending_runs']} claimed={local_state['claimed_runs']} online_workers={local_state['online_workers']}. "
                            f"Start it with: {stack_start_command_hint(Path(__file__).resolve().parents[1])}"
                        ),
                        "auto_approved": auto_approved,
                    }
            else:
                no_worker_since = None
        if status == "waiting_for_input" and not auto_approved:
            pending = run.get("pending_approval") if isinstance(run.get("pending_approval"), dict) else {}
            approval_id = str(pending.get("approval_id") or "").strip()
            if approval_id:
                run["input_queue"].put({"approval_id": approval_id, "decision": "proceed"})
            else:
                run["input_queue"].put("proceed")
            auto_approved = True
        time.sleep(1.0)
    run = runs.get(run_id)
    if isinstance(run, dict):
        latest_error = _latest_run_error_message(run)
        if latest_error:
            return {
                "status": "failed",
                "summary": _friendly_autopilot_run_error(latest_error),
                "auto_approved": auto_approved,
            }
    if last_status in {"queued_local", "running_local"}:
        local_state = _local_companion_snapshot()
        return {
            "status": "timeout",
            "summary": (
                "Run timed out waiting on Local Companion. "
                f"last_status={last_status} pending={local_state['pending_runs']} claimed={local_state['claimed_runs']} online_workers={local_state['online_workers']}."
            ),
            "auto_approved": auto_approved,
        }
    if last_status:
        return {
            "status": "timeout",
            "summary": f"Run timed out while waiting for completion (last_status={last_status}).",
            "auto_approved": auto_approved,
        }
    return {"status": "timeout", "summary": "Run timed out while waiting for completion."}


def _create_whatsapp_run(
    goal: str,
    workspace_id: str,
    connector_id: str,
    from_number: str,
    to_number: str,
    message_sid: str,
    account_sid: str,
    connector_entry: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    trace_id = f"wa:{_telegram_safe_path_token(to_number or 'to')}:{_telegram_safe_path_token(message_sid or str(uuid.uuid4())[:10])}"
    metadata: Dict[str, Any] = {
        "source": "whatsapp_autopilot",
        "channel": "whatsapp",
        "source_channel": "whatsapp",
        "connector_credential_id": connector_id,
        "trace_id": trace_id,
        "source_event_id": str(message_sid or "").strip(),
        "delivery_status": "pending",
        "whatsapp": {
            "from": from_number,
            "to": to_number,
            "message_sid": message_sid,
            "account_sid": account_sid,
        },
    }
    assigned_role = _connector_assigned_agent_role(connector_entry or {})
    if assigned_role:
        metadata["agent_role"] = assigned_role
        metadata["agent_role_source"] = "connector_assignment"
    metadata["trust_mode"] = normalize_trust_mode(ORION_WHATSAPP_AUTOPILOT_TRUST_MODE)
    selected_target = normalize_execution_target(ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET)
    metadata["execution_target"] = selected_target
    route = decide_execution_target(metadata)
    metadata["execution_target_requested"] = route["requested"]
    metadata["execution_target_selected"] = route["selected"]
    metadata["execution_target_reason"] = route["reason"]
    if route.get("fallback"):
        metadata["execution_target_fallback"] = route.get("fallback")

    engine = ORION_WHATSAPP_AUTOPILOT_ENGINE if ORION_WHATSAPP_AUTOPILOT_ENGINE in ENGINE_REGISTRY else "orion"
    run_id = create_run(
        engine=engine,
        context={
            "workflow_id": None,
            "workspace_id": workspace_id,
            "user_goal": goal,
            "business_plan": None,
            "provider": None,
            "model": None,
            "credential_id": None,
            "agents": [],
            "metadata": metadata,
        },
    )
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["runs_started"] = int(WHATSAPP_AUTOPILOT_STATE.get("runs_started") or 0) + 1
    _persist_whatsapp_autopilot_state()
    _record_channel_event(
        channel="whatsapp",
        direction="system",
        event_type="run_started",
        text=f"Run started for WhatsApp inbound {from_number}",
        workspace_id=workspace_id,
        session_key=_whatsapp_session_key(from_number, to_number),
        session_id=_whatsapp_session_key(from_number, to_number),
        parent_id=str(message_sid or "").strip() or None,
        run_id=run_id,
        action="run",
        metadata={
            "connector_id": connector_id,
            "message_sid": message_sid,
            "account_sid": account_sid,
            "to_number": to_number,
            "trace_id": trace_id,
            "source_event_id": str(message_sid or "").strip(),
            "agent_role": assigned_role or None,
            "delivery_status": "pending",
        },
    )
    return {"run_id": run_id, "route": route}


def _whatsapp_connector_match(
    account_sid: str,
    from_number: str,
    to_number: str,
) -> Optional[Dict[str, Any]]:
    inbound_account = str(account_sid or "").strip()
    inbound_from = _normalize_whatsapp_number(from_number)
    inbound_to = _normalize_whatsapp_number(to_number)
    entries = _list_whatsapp_connector_entries()
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["connectors_seen"] = len(entries)
    for entry in entries:
        credential_id = str(entry.get("id") or "").strip()
        workspace_id = _normalize_workspace_id(entry.get("workspace_id"))
        if not credential_id:
            continue
        try:
            secret = resolve_vault_credential(credential_id, workspace_id)
        except Exception:
            continue
        connector_sid = str(secret.get("account_sid") or "").strip()
        if inbound_account and connector_sid and inbound_account != connector_sid:
            continue
        connector_to = _normalize_whatsapp_number(secret.get("from_number"))
        if connector_to and inbound_to and connector_to != inbound_to:
            continue
        connector_from = _normalize_whatsapp_number(secret.get("to_number"))
        if connector_from and connector_from not in {"*", "whatsapp:*"} and inbound_from and connector_from != inbound_from:
            continue
        return {
            "entry": entry,
            "secret": secret,
            "connector_id": credential_id,
            "workspace_id": workspace_id or ORION_WHATSAPP_AUTOPILOT_WORKSPACE_ID or "default",
        }
    return None


def _whatsapp_finalize_run_async(
    run_id: str,
    connector_id: str,
    workspace_id: str,
    profile: Dict[str, Any],
    secret: Dict[str, Any],
    reply_to_number: str,
):
    session_key = _whatsapp_session_key(reply_to_number, str(secret.get("from_number") or ""))
    trace_id = f"wa:{_telegram_safe_path_token(connector_id)}:{_telegram_safe_path_token(run_id)[:12]}"
    try:
        result = _wait_for_run_terminal_status(
            run_id,
            timeout_seconds=ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS,
            max_reply_chars=ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS,
        )
        status = str(result.get("status") or "").lower()
        summary = _truncate_one_line(str(result.get("summary") or "Run finished."), ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS)
        message = _autopilot_run_reply_text(status, run_id, summary)
        try:
            sent = _twilio_send_whatsapp_message(
                account_sid=str(secret.get("account_sid") or ""),
                auth_token=str(secret.get("auth_token") or ""),
                from_number=str(secret.get("from_number") or ""),
                to_number=reply_to_number,
                body=message,
            )
        except Exception as send_exc:
            _append_channel_dead_letter(
                channel="whatsapp",
                direction="outbound",
                event_type="message",
                reason=str(send_exc),
                text=message,
                workspace_id=workspace_id,
                session_key=session_key,
                run_id=run_id,
                action="run",
                connector_id=connector_id,
                trace_id=trace_id,
                metadata={"transport": "twilio_messages_api"},
            )
            raise
        outbound_message_id = str(sent.get("sid") or "").strip() if isinstance(sent, dict) else ""
        _record_channel_event(
            channel="whatsapp",
            direction="outbound",
            event_type="message",
            text=message,
            workspace_id=workspace_id,
            session_key=session_key,
            session_id=session_key,
            message_id=outbound_message_id or None,
            run_id=run_id,
            action="run",
            metadata={
                "connector_id": connector_id,
                "profile_id": profile.get("id"),
                "trace_id": trace_id,
                "delivery_status": "sent",
            },
        )
        _record_channel_event(
            channel="whatsapp",
            direction="system",
            event_type=f"run_{status if status in {'completed', 'failed', 'timeout'} else 'finished'}",
            text=summary,
            workspace_id=workspace_id,
            session_key=session_key,
            session_id=session_key,
            run_id=run_id,
            action="run",
            metadata={"connector_id": connector_id, "profile_id": profile.get("id"), "trace_id": trace_id},
        )
        _set_whatsapp_connector_state(
            connector_id,
            {
                "workspace_id": workspace_id,
                "profile_id": profile.get("id"),
                "last_run_id": run_id,
                "last_action": "run",
                "last_error": None,
                "last_error_category": None,
                "last_error_at": None,
                "last_processed_at": _utc_now_iso(),
            },
        )
    except Exception as exc:
        detail = str(exc)
        category = _classify_autopilot_error(detail)
        _whatsapp_autopilot_log(f"finalize error run_id={run_id}: {detail}")
        _record_channel_event(
            channel="whatsapp",
            direction="system",
            event_type="error",
            text=detail,
            workspace_id=workspace_id,
            session_key=session_key,
            session_id=session_key,
            run_id=run_id,
            action="run",
            metadata={"connector_id": connector_id, "profile_id": profile.get("id")},
        )
        _set_whatsapp_connector_state(
            connector_id,
            {
                "workspace_id": workspace_id,
                "profile_id": profile.get("id"),
                "last_run_id": run_id,
                "last_action": "run",
                "last_error": detail,
                "last_error_category": category,
                "last_error_at": _utc_now_iso(),
                "last_processed_at": _utc_now_iso(),
            },
        )
        _whatsapp_autopilot_mark_error(detail, source="run_finalize")


async def _parse_form_urlencoded(request: Request) -> Dict[str, str]:
    raw = await request.body()
    decoded = raw.decode("utf-8", errors="ignore") if raw else ""
    parsed = parse_qs(decoded, keep_blank_values=True)
    out: Dict[str, str] = {}
    for key, values in parsed.items():
        if isinstance(values, list) and values:
            out[str(key)] = str(values[-1])
        else:
            out[str(key)] = ""
    return out


def _telegram_poll_connector(entry: Dict[str, Any]):
    connector_id = str(entry.get("id") or "").strip()
    if not connector_id:
        return
    label = str(entry.get("label") or connector_id)
    workspace_id = _normalize_workspace_id(entry.get("workspace_id")) or ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID or "default"
    profile = _resolve_telegram_autopilot_profile(entry)
    allow_from = _telegram_resolve_allow_from(entry)

    connector_state = _telegram_connector_state(connector_id)
    last_update_id = int(connector_state.get("last_update_id") or 0)
    approval_state_patch: Dict[str, Any] = {}

    try:
        secret = _telegram_get_secret(entry)
        bot_token = str(secret.get("bot_token") or "").strip()
        configured_chat_id = str(secret.get("chat_id") or "").strip()
        if not bot_token or not configured_chat_id:
            raise RuntimeError("Connector is missing bot_token or chat_id.")
        approval_state_patch = _telegram_notify_pending_approvals(
            connector_state=connector_state,
            bot_token=bot_token,
            chat_id=configured_chat_id,
            workspace_id=workspace_id,
            profile=profile,
            connector_id=connector_id,
        )

        updates_result = _telegram_api_request(
            bot_token,
            "getUpdates",
            params={
                "offset": last_update_id + 1,
                "limit": max(1, min(ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES, 100)),
                "timeout": 0,
            },
        )
        updates = updates_result.get("result")
        if not isinstance(updates, list):
            updates = []

        max_seen = last_update_id
        for update in updates:
            if not isinstance(update, dict):
                continue
            update_id = int(update.get("update_id") or 0)
            if update_id <= max_seen:
                continue
            max_seen = update_id

            message = _telegram_extract_message(update)
            if not isinstance(message, dict):
                continue
            chat = message.get("chat") if isinstance(message.get("chat"), dict) else {}
            sender = message.get("from") if isinstance(message.get("from"), dict) else {}
            if bool(sender.get("is_bot")):
                continue
            if not _telegram_chat_matches(configured_chat_id, chat):
                continue
            if not _telegram_sender_allowed(sender, allow_from):
                sender_id = str(sender.get("id") or "").strip()
                sender_username = str(sender.get("username") or "").strip().lower()
                _record_channel_event_throttled(
                    channel="telegram",
                    direction="system",
                    event_type="drop_sender_not_allowed",
                    text=(
                        f"Dropped Telegram inbound from sender_id={sender_id or '-'} "
                        f"username=@{sender_username or '-'} (not in allow_from)."
                    ),
                    workspace_id=workspace_id,
                    session_key=_telegram_session_key(str(chat.get("id") or configured_chat_id)),
                    action="drop",
                    metadata={
                        "connector_id": connector_id,
                        "chat_id": str(chat.get("id") or configured_chat_id).strip(),
                        "sender_id": sender_id,
                        "sender_username": sender_username,
                        "allow_from": list(allow_from),
                    },
                    dedupe_seconds=8.0,
                )
                dropped_count = int(connector_state.get("dropped_sender_count") or 0) + 1
                _set_telegram_connector_state(
                    connector_id,
                    {
                        "label": label,
                        "workspace_id": workspace_id,
                        "last_update_id": update_id,
                        "last_poll_at": _utc_now_iso(),
                        "last_error": None,
                        "last_error_category": None,
                        "last_error_at": None,
                        "profile_id": profile.get("id"),
                        "allow_from": list(allow_from),
                        "dropped_sender_count": dropped_count,
                        "last_dropped_sender_id": sender_id,
                        "last_dropped_sender_username": sender_username,
                        "last_dropped_at": _utc_now_iso(),
                    },
                )
                continue

            chat_id = str(chat.get("id") or configured_chat_id).strip()
            sender_id = str(sender.get("id") or "").strip()
            inbound_message_id = str(message.get("message_id") or "").strip()
            inbound_parent_id = str(message.get("reply_to_message_id") or "").strip()
            message_text = str(message.get("text") or "")
            raw_attachments = message.get("attachments") if isinstance(message.get("attachments"), list) else []
            stored_attachments = _telegram_store_attachments(
                bot_token=bot_token,
                workspace_id=workspace_id,
                chat_id=chat_id,
                update_id=update_id,
                message_id=inbound_message_id or "",
                attachments=raw_attachments,
            )
            routed = _telegram_route_message(message_text, profile)
            action = str(routed.get("action") or "ignore").strip().lower()
            if action == "ignore" and stored_attachments:
                routed = {
                    "action": "run",
                    "goal": "Analyze the attached image(s) and help me with what they contain.",
                    "source": "image_only",
                }
                action = "run"
            session_key = _telegram_session_key(chat_id)

            trace_id = _telegram_trace_id(chat_id, update_id, inbound_message_id or "")
            inbound_event = _record_channel_event(
                channel="telegram",
                direction="inbound",
                event_type="message",
                text=message_text,
                workspace_id=workspace_id,
                session_key=session_key,
                session_id=session_key,
                message_id=inbound_message_id or None,
                parent_id=inbound_parent_id or None,
                action=action,
                metadata={
                    "connector_id": connector_id,
                    "sender_id": sender_id,
                    "update_id": update_id,
                    "profile_id": profile.get("id"),
                    "attachments_count": len(stored_attachments),
                    "trace_id": trace_id,
                    "delivery_status": "received",
                    "attachments": [
                        {
                            "kind": str(item.get("kind") or "").strip(),
                            "mime_type": str(item.get("mime_type") or "").strip(),
                            "path": str(item.get("relative_path") or item.get("path") or "").strip(),
                            "bytes": int(item.get("bytes") or 0),
                        }
                        for item in stored_attachments[:ORION_TELEGRAM_MEDIA_MAX_ITEMS]
                        if isinstance(item, dict)
                    ],
                },
            )
            source_event_id = str((inbound_event or {}).get("id") or "").strip()
            camera_setup = _telegram_handle_camera_monitor_setup(
                workspace_id=workspace_id,
                chat_id=chat_id,
                message_text=message_text,
                stored_attachments=stored_attachments,
            )
            if bool(camera_setup.get("handled")):
                _record_channel_event(
                    channel="telegram",
                    direction="system",
                    event_type="camera_setup_reply",
                    text=str(camera_setup.get("reply") or "").strip(),
                    workspace_id=workspace_id,
                    session_key=session_key,
                    session_id=session_key,
                    parent_id=inbound_message_id or None,
                    action="camera_setup",
                    metadata={
                        "connector_id": connector_id,
                        "profile_id": profile.get("id"),
                        "trace_id": trace_id,
                        "source_event_id": source_event_id,
                    },
                )
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    str(camera_setup.get("reply") or "").strip(),
                    workspace_id=workspace_id,
                    action="camera_setup",
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
                continue
            if action == "ignore":
                continue

            run_id = ""
            chat_profile = _get_telegram_profile(workspace_id, chat_id)
            if action == "help":
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    _telegram_help_text(profile),
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action in {"menu", "menu_main", "menu_study", "menu_project", "menu_context", "menu_skills"}:
                menu_id = "main"
                if action.endswith("_study"):
                    menu_id = "study"
                elif action.endswith("_project"):
                    menu_id = "project"
                elif action.endswith("_context"):
                    menu_id = "context"
                elif action.endswith("_skills"):
                    menu_id = "skills"
                menu_titles = {
                    "main": "Main menu opened.",
                    "study": "Work menu opened.",
                    "project": "Project menu opened.",
                    "context": "Context menu opened.",
                    "skills": _telegram_skills_menu_text(profile),
                }
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    menu_titles.get(menu_id, "Menu opened."),
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    reply_markup=_telegram_menu_keyboard(profile, menu_id),
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action == "onboard_start":
                if ORION_TELEGRAM_ONBOARDING_ENABLED:
                    onboarding_state = _start_telegram_onboarding(workspace_id, chat_id)
                    step_index = int(onboarding_state.get("step_index") or 0)
                    if bool(onboarding_state.get("active")):
                        action = "onboarding_start"
                        _telegram_send_message(
                            bot_token,
                            chat_id,
                            _telegram_onboarding_prompt(step_index, retry=False),
                            workspace_id=workspace_id,
                            action=action,
                            connector_id=connector_id,
                            parent_message_id=inbound_message_id or None,
                            profile=profile,
                            trace_id=trace_id,
                            source_event_id=source_event_id,
                        )
                    else:
                        action = "onboarding_already_complete"
                        _telegram_send_message(
                            bot_token,
                            chat_id,
                            "Your context is already set. Use `me set ...` anytime to update it.\n\n"
                            + _telegram_profile_text(profile, chat_profile),
                            workspace_id=workspace_id,
                            action=action,
                            connector_id=connector_id,
                            parent_message_id=inbound_message_id or None,
                            profile=profile,
                            trace_id=trace_id,
                            source_event_id=source_event_id,
                        )
                else:
                    _telegram_send_message(
                        bot_token,
                        chat_id,
                        _telegram_profile_text(profile, chat_profile),
                        workspace_id=workspace_id,
                        action="profile_show",
                        connector_id=connector_id,
                        parent_message_id=inbound_message_id or None,
                        profile=profile,
                        trace_id=trace_id,
                        source_event_id=source_event_id,
                    )
            elif action == "profile_show":
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    _telegram_profile_text(profile, chat_profile),
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action == "profile_help":
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    _telegram_profile_help_text(profile),
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action == "profile_set":
                field_name = str(routed.get("field") or "").strip().lower()
                field_label = _TELEGRAM_PROFILE_FIELDS.get(field_name, field_name or "field")
                value = str(routed.get("value") or "").strip()
                if not field_name or not value:
                    _telegram_send_message(
                        bot_token,
                        chat_id,
                        _telegram_profile_help_text(profile),
                        workspace_id=workspace_id,
                        action="profile_help",
                        connector_id=connector_id,
                        parent_message_id=inbound_message_id or None,
                        profile=profile,
                        trace_id=trace_id,
                        source_event_id=source_event_id,
                    )
                else:
                    chat_profile = _set_telegram_profile_field(workspace_id, chat_id, field_name, value)
                    _telegram_send_message(
                        bot_token,
                        chat_id,
                        f"Saved {field_label}.\n\n{_telegram_profile_text(profile, chat_profile)}",
                        workspace_id=workspace_id,
                        action=action,
                        connector_id=connector_id,
                        parent_message_id=inbound_message_id or None,
                        profile=profile,
                        trace_id=trace_id,
                        source_event_id=source_event_id,
                    )
            elif action == "profile_clear":
                field_name = str(routed.get("field") or "").strip().lower()
                chat_profile = _clear_telegram_profile(workspace_id, chat_id, field_name)
                cleared_label = _TELEGRAM_PROFILE_FIELDS.get(field_name, field_name or "all context")
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    f"Cleared {cleared_label}.\n\n{_telegram_profile_text(profile, chat_profile)}",
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action == "status":
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    _telegram_runtime_status_text(workspace_id),
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action == "approvals":
                limit = int(routed.get("limit") or 5)
                payload = _autopilot_approvals_list(limit=limit)
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    _autopilot_approvals_text(payload, prefix=str(profile.get("prefix") or DEFAULT_CHAT_PREFIX)),
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action == "approve":
                event_id = str(routed.get("event_id") or "").strip()
                note = str(routed.get("note") or "").strip()
                payload = _autopilot_approval_resolve(event_id=event_id, approved=True, note=note)
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    _autopilot_approval_result_text(payload, approved=True),
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action == "reject":
                event_id = str(routed.get("event_id") or "").strip()
                note = str(routed.get("note") or "").strip()
                payload = _autopilot_approval_resolve(event_id=event_id, approved=False, note=note)
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    _autopilot_approval_result_text(payload, approved=False),
                    workspace_id=workspace_id,
                    action=action,
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )
            elif action == "run":
                goal = str(routed.get("goal") or "").strip()
                goal_source = str(routed.get("source") or "").strip().lower()
                onboarding_state = _get_telegram_onboarding_state(workspace_id, chat_id) if ORION_TELEGRAM_ONBOARDING_ENABLED else {
                    "active": False
                }
                onboarding_active = bool(onboarding_state.get("active"))
                explicit_run_command = _telegram_is_explicit_run_command(message_text)
                has_profile_context = _telegram_profile_has_context(chat_profile)

                if ORION_TELEGRAM_ONBOARDING_ENABLED and onboarding_active and not explicit_run_command:
                    onboarding_result = _telegram_onboarding_consume_answer(workspace_id, chat_id, message_text)
                    onboarding_reply = str(onboarding_result.get("reply") or "").strip() or _telegram_onboarding_prompt(
                        int(onboarding_state.get("step_index") or 0),
                        retry=True,
                    )
                    action = "onboarding_complete" if bool(onboarding_result.get("completed")) else "onboarding_step"
                    if bool(onboarding_result.get("completed")):
                        chat_profile = _get_telegram_profile(workspace_id, chat_id)
                    _telegram_send_message(
                        bot_token,
                        chat_id,
                        onboarding_reply,
                        workspace_id=workspace_id,
                        action=action,
                        connector_id=connector_id,
                        parent_message_id=inbound_message_id or None,
                        profile=profile,
                        trace_id=trace_id,
                        source_event_id=source_event_id,
                    )
                elif (
                    ORION_TELEGRAM_ONBOARDING_ENABLED
                    and not has_profile_context
                    and not explicit_run_command
                    and goal_source not in {"quick_goal", "image_only"}
                ):
                    onboarding_state = _start_telegram_onboarding(workspace_id, chat_id)
                    step_index = int(onboarding_state.get("step_index") or 0)
                    action = "onboarding_start_auto"
                    _telegram_send_message(
                        bot_token,
                        chat_id,
                        "Before I start, quick 3-question setup so I can personalize help.\n\n"
                        + _telegram_onboarding_prompt(step_index, retry=False),
                        workspace_id=workspace_id,
                        action=action,
                        connector_id=connector_id,
                        parent_message_id=inbound_message_id or None,
                        profile=profile,
                        trace_id=trace_id,
                        source_event_id=source_event_id,
                    )
                elif not goal:
                    _telegram_send_message(
                        bot_token,
                        chat_id,
                        _telegram_help_text(profile),
                        workspace_id=workspace_id,
                        action="help",
                        connector_id=connector_id,
                        parent_message_id=inbound_message_id or None,
                        profile=profile,
                        trace_id=trace_id,
                        source_event_id=source_event_id,
                    )
                else:
                    run_goal = _telegram_build_goal_with_profile(goal, chat_profile)
                    run_goal = _telegram_build_goal_with_attachments(run_goal, stored_attachments)
                    connector_context = _telegram_workspace_connector_context(
                        goal=goal,
                        workspace_id=workspace_id,
                        current_connector_id=connector_id,
                    )
                    run_goal = _telegram_build_goal_with_connector_context(
                        run_goal,
                        str(connector_context.get("prompt_append") or "").strip(),
                    )
                    mcp_space_query = _telegram_space_question_via_mcp(goal)
                    skill_query = _telegram_installed_skill_query(
                        goal=goal,
                        workspace_id=workspace_id,
                        connector_id=connector_id,
                        chat_id=chat_id,
                        session_key=session_key,
                    )
                    run_goal = _telegram_build_goal_with_connector_context(
                        run_goal,
                        str(skill_query.get("prompt_append") or "").strip(),
                    )
                    direct_response = str(mcp_space_query.get("response") or "").strip() if bool(mcp_space_query.get("handled")) else ""
                    if not direct_response:
                        direct_response = str(skill_query.get("response") or "").strip() if bool(skill_query.get("handled")) else ""
                    if direct_response:
                        summary = _truncate_one_line(direct_response, ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS)
                        _record_channel_event(
                            channel="telegram",
                            direction="system",
                            event_type="skill_reply",
                            text=summary,
                            workspace_id=workspace_id,
                            session_key=session_key,
                            session_id=session_key,
                            parent_id=inbound_message_id or None,
                            action="skill_reply",
                            metadata={
                                "connector_id": connector_id,
                                "profile_id": profile.get("id"),
                                "trace_id": trace_id,
                                "source_event_id": source_event_id,
                                "skill_id": str(mcp_space_query.get("skill_id") or skill_query.get("skill_id") or "").strip(),
                            },
                        )
                        _telegram_send_message(
                            bot_token,
                            chat_id,
                            direct_response,
                            workspace_id=workspace_id,
                            action="skill_reply",
                            connector_id=connector_id,
                            parent_message_id=inbound_message_id or None,
                            profile=profile,
                            trace_id=trace_id,
                            source_event_id=source_event_id,
                        )
                        action = "skill_reply"
                    else:
                        skill_override = routed.get("skill") if isinstance(routed.get("skill"), dict) else None
                        run_info = _create_telegram_run(
                            goal=run_goal,
                            workspace_id=workspace_id,
                            connector_id=connector_id,
                            chat_id=chat_id,
                            sender_id=sender_id,
                            update_id=update_id,
                            message_id=inbound_message_id or None,
                            profile_context=chat_profile,
                            media_attachments=stored_attachments,
                            skill_override=skill_override,
                            trace_id=trace_id,
                            source_event_id=source_event_id,
                            connector_entry=entry,
                            connector_context=connector_context,
                        )
                        run_id = str(run_info.get("run_id") or "")
                        if run_id and ORION_TELEGRAM_AUTOPILOT_SEND_ACK:
                            ack_text = "⏣ Empyralis started your request."
                            if _autopilot_include_run_meta():
                                ack_text += f"\nrun_id: {run_id}"
                            _telegram_send_message(
                                bot_token,
                                chat_id,
                                ack_text,
                                workspace_id=workspace_id,
                                action=action,
                                run_id=run_id,
                                connector_id=connector_id,
                                parent_message_id=inbound_message_id or None,
                                profile=profile,
                                trace_id=trace_id,
                                source_event_id=source_event_id,
                            )

                        result = _wait_for_run_terminal_status(run_id)
                        status = str(result.get("status") or "").lower()
                        summary = _truncate_one_line(str(result.get("summary") or "Run finished."), ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS)
                        _record_channel_event(
                            channel="telegram",
                            direction="system",
                            event_type=f"run_{status if status in {'completed', 'failed', 'timeout'} else 'finished'}",
                            text=summary,
                            workspace_id=workspace_id,
                            session_key=session_key,
                            session_id=session_key,
                            parent_id=inbound_message_id or None,
                            run_id=run_id,
                            action=action,
                            metadata={
                                "connector_id": connector_id,
                                "profile_id": profile.get("id"),
                                "trace_id": trace_id,
                                "source_event_id": source_event_id,
                            },
                        )
                        _telegram_send_message(
                            bot_token,
                            chat_id,
                            _autopilot_run_reply_text(status, run_id, summary),
                            workspace_id=workspace_id,
                            action=action,
                            run_id=run_id,
                            connector_id=connector_id,
                            parent_message_id=inbound_message_id or None,
                            profile=profile,
                            trace_id=trace_id,
                            source_event_id=source_event_id,
                        )
            else:
                _telegram_send_message(
                    bot_token,
                    chat_id,
                    _telegram_help_text(profile),
                    workspace_id=workspace_id,
                    action="help",
                    connector_id=connector_id,
                    parent_message_id=inbound_message_id or None,
                    profile=profile,
                    trace_id=trace_id,
                    source_event_id=source_event_id,
                )

            state_patch: Dict[str, Any] = {
                "label": label,
                "workspace_id": workspace_id,
                "last_update_id": update_id,
                "last_processed_at": _utc_now_iso(),
                "last_error": None,
                "last_error_category": None,
                "last_error_at": None,
                "last_chat_id": chat_id,
                "last_action": action,
                "profile_id": profile.get("id"),
                "allow_from": list(allow_from),
            }
            if run_id:
                state_patch["last_run_id"] = run_id
            if approval_state_patch:
                state_patch.update(approval_state_patch)
            _set_telegram_connector_state(connector_id, state_patch)
            with TELEGRAM_AUTOPILOT_LOCK:
                TELEGRAM_AUTOPILOT_STATE["processed_updates"] = int(TELEGRAM_AUTOPILOT_STATE.get("processed_updates") or 0) + 1

        if max_seen > last_update_id:
            patch = {
                "label": label,
                "workspace_id": workspace_id,
                "last_update_id": max_seen,
                "last_poll_at": _utc_now_iso(),
                "last_error": None,
                "last_error_category": None,
                "last_error_at": None,
                "profile_id": profile.get("id"),
                "allow_from": list(allow_from),
            }
            if approval_state_patch:
                patch.update(approval_state_patch)
            _set_telegram_connector_state(connector_id, patch)
        elif approval_state_patch:
            _set_telegram_connector_state(
                connector_id,
                {
                    "label": label,
                    "workspace_id": workspace_id,
                    "last_poll_at": _utc_now_iso(),
                    "last_error": None,
                    "last_error_category": None,
                    "last_error_at": None,
                    "profile_id": profile.get("id"),
                    "allow_from": list(allow_from),
                    **approval_state_patch,
                },
            )
    except Exception as exc:
        detail = str(exc)
        category = _classify_autopilot_error(detail)
        _record_channel_event_throttled(
            channel="telegram",
            direction="system",
            event_type="error",
            text=detail,
            workspace_id=workspace_id,
            action="connector",
            metadata={"connector_id": connector_id, "category": category},
            dedupe_seconds=max(30.0, float(ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS) * 6.0),
        )
        _set_telegram_connector_state(
            connector_id,
            {
                "label": label,
                "workspace_id": workspace_id,
                "last_error": detail,
                "last_error_category": category,
                "last_error_at": _utc_now_iso(),
                "last_poll_at": _utc_now_iso(),
            },
        )
        _telegram_autopilot_mark_error(detail, source="connector")
        raise


def _run_telegram_autopilot_forever():
    _init()
    poll_seconds = max(1.0, ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS)
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["active"] = True
        TELEGRAM_AUTOPILOT_STATE["started_at"] = _utc_now_iso()
        TELEGRAM_AUTOPILOT_STATE["enabled"] = True
    _persist_telegram_autopilot_state()
    _telegram_autopilot_log(
        f"enabled (poll={poll_seconds}s, prefix={'on' if ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX else 'off'}:{ORION_TELEGRAM_AUTOPILOT_PREFIX})"
    )

    while True:
        sleep_seconds = poll_seconds
        try:
            entries = _list_telegram_connector_entries()
            had_connector_error = False
            with TELEGRAM_AUTOPILOT_LOCK:
                TELEGRAM_AUTOPILOT_STATE["connectors_seen"] = len(entries)
            _telegram_autopilot_mark_poll(clear_error=False)
            for entry in entries:
                try:
                    _telegram_poll_connector(entry)
                except Exception as connector_exc:
                    had_connector_error = True
                    _telegram_autopilot_log(f"connector error: {connector_exc}")
                    _record_channel_event_throttled(
                        channel="telegram",
                        direction="system",
                        event_type="error",
                        text=str(connector_exc),
                        workspace_id=_normalize_workspace_id(entry.get("workspace_id")),
                        action="connector",
                        metadata={
                            "connector_id": str(entry.get("id") or "").strip(),
                            "source": "connector_loop",
                        },
                        dedupe_seconds=max(30.0, float(ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS) * 6.0),
                    )
            if not had_connector_error:
                _telegram_autopilot_mark_poll(clear_error=True)
            _persist_telegram_autopilot_state()
        except Exception as exc:
            detail = str(exc)
            sleep_seconds = max(poll_seconds, _telegram_autopilot_mark_error(detail, source="loop"))
            _telegram_autopilot_log(f"loop error: {detail}")
            _record_channel_event_throttled(
                channel="telegram",
                direction="system",
                event_type="error",
                text=detail,
                action="autopilot_loop",
                metadata={"source": "loop"},
                dedupe_seconds=max(45.0, float(poll_seconds) * 8.0),
            )
        time.sleep(max(0.25, float(sleep_seconds)))



# --- COPIED ENDPOINTS ---
async def handle_whatsapp_twilio_webhook(request: Request):
    _init()
    if not ORION_WHATSAPP_AUTOPILOT_ENABLED:
        return _whatsapp_twiml("Empyralis WhatsApp autopilot is disabled.")

    if ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET:
        provided_secret = str(
            request.query_params.get("secret")
            or request.headers.get("x-orion-webhook-secret")
            or ""
        ).strip()
        if provided_secret != ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET:
            return Response(status_code=403, content="forbidden")

    _whatsapp_autopilot_activate()
    form = await _parse_form_urlencoded(request)
    account_sid = str(form.get("AccountSid") or "").strip()
    message_sid = str(form.get("MessageSid") or "").strip()
    inbound_from = _normalize_whatsapp_number(form.get("From"))
    inbound_to = _normalize_whatsapp_number(form.get("To"))
    body = str(form.get("Body") or "").strip()
    session_key = _whatsapp_session_key(inbound_from, inbound_to)
    trace_id = f"wa:{_telegram_safe_path_token(inbound_to or 'to')}:{_telegram_safe_path_token(message_sid or str(uuid.uuid4())[:10])}"

    _whatsapp_autopilot_mark_inbound(clear_error=True)
    matched = _whatsapp_connector_match(account_sid, inbound_from, inbound_to)
    if not matched:
        detail = (
            f"No matching WhatsApp connector for inbound message "
            f"(account_sid={account_sid or 'unknown'}, to={inbound_to or 'unknown'})."
        )
        _record_channel_event(
            channel="whatsapp",
            direction="inbound",
            event_type="message",
            text=body,
            session_key=session_key,
            session_id=session_key,
            message_id=str(message_sid or "").strip() or None,
            action="unmatched",
            metadata={"account_sid": account_sid, "message_sid": message_sid, "to_number": inbound_to, "trace_id": trace_id, "delivery_status": "received"},
        )
        _record_channel_event(
            channel="whatsapp",
            direction="system",
            event_type="error",
            text=detail,
            session_key=session_key,
            session_id=session_key,
            parent_id=str(message_sid or "").strip() or None,
            action="match_connector",
            metadata={"account_sid": account_sid, "message_sid": message_sid, "to_number": inbound_to, "trace_id": trace_id},
        )
        _whatsapp_autopilot_mark_error(detail, source="match_connector")
        return _whatsapp_twiml("Empyralis is not configured for this WhatsApp number.")

    entry = matched.get("entry") if isinstance(matched.get("entry"), dict) else {}
    secret = matched.get("secret") if isinstance(matched.get("secret"), dict) else {}
    connector_id = str(matched.get("connector_id") or "").strip()
    workspace_id = str(matched.get("workspace_id") or "default")
    profile = _resolve_whatsapp_autopilot_profile(entry)
    routed = _telegram_route_message(body, profile)
    action = str(routed.get("action") or "ignore").strip().lower()
    _record_channel_event(
        channel="whatsapp",
        direction="inbound",
        event_type="message",
        text=body,
        workspace_id=workspace_id,
        session_key=session_key,
        session_id=session_key,
        message_id=str(message_sid or "").strip() or None,
        action=action,
        metadata={
            "connector_id": connector_id,
            "profile_id": profile.get("id"),
            "account_sid": account_sid,
            "message_sid": message_sid,
            "to_number": inbound_to,
            "trace_id": trace_id,
            "delivery_status": "received",
        },
    )

    if action == "ignore":
        return _whatsapp_twiml()

    run_id = ""
    response_text = ""
    if action == "help":
        response_text = _whatsapp_help_text(profile)
    elif action == "status":
        response_text = _runtime_status_text(workspace_id)
    elif action == "approvals":
        limit = int(routed.get("limit") or 5)
        payload = _autopilot_approvals_list(limit=limit)
        response_text = _autopilot_approvals_text(payload, prefix=str(profile.get("prefix") or DEFAULT_CHAT_PREFIX))
    elif action == "approve":
        event_id = str(routed.get("event_id") or "").strip()
        note = str(routed.get("note") or "").strip()
        payload = _autopilot_approval_resolve(event_id=event_id, approved=True, note=note)
        response_text = _autopilot_approval_result_text(payload, approved=True)
    elif action == "reject":
        event_id = str(routed.get("event_id") or "").strip()
        note = str(routed.get("note") or "").strip()
        payload = _autopilot_approval_resolve(event_id=event_id, approved=False, note=note)
        response_text = _autopilot_approval_result_text(payload, approved=False)
    elif action == "run":
        goal = str(routed.get("goal") or "").strip()
        if not goal:
            response_text = _whatsapp_help_text(profile)
            action = "help"
        else:
            run_info = _create_whatsapp_run(
                goal=goal,
                workspace_id=workspace_id,
                connector_id=connector_id,
                from_number=inbound_from,
                to_number=inbound_to,
                message_sid=message_sid,
                account_sid=account_sid,
                connector_entry=entry,
            )
            run_id = str(run_info.get("run_id") or "")
            if ORION_WHATSAPP_AUTOPILOT_SEND_ACK and run_id:
                response_text = "⏣ Empyralis started your request."
                if _autopilot_include_run_meta():
                    response_text += f"\nrun_id: {run_id}"
            elif ORION_WHATSAPP_AUTOPILOT_SEND_ACK:
                response_text = "⏣ Empyralis started your request."
            else:
                response_text = ""
            if run_id:
                thread = threading.Thread(
                    target=_whatsapp_finalize_run_async,
                    args=(run_id, connector_id, workspace_id, profile, secret, inbound_from),
                    daemon=True,
                )
                thread.start()
    else:
        action = "help"
        response_text = _whatsapp_help_text(profile)

    state_patch: Dict[str, Any] = {
        "label": entry.get("label"),
        "workspace_id": workspace_id,
        "profile_id": profile.get("id"),
        "last_action": action,
        "last_error": None,
        "last_error_category": None,
        "last_error_at": None,
        "last_message_sid": message_sid,
        "last_from_number": inbound_from,
        "last_to_number": inbound_to,
        "last_processed_at": _utc_now_iso(),
    }
    if run_id:
        state_patch["last_run_id"] = run_id
    _set_whatsapp_connector_state(connector_id, state_patch)
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["processed_messages"] = int(WHATSAPP_AUTOPILOT_STATE.get("processed_messages") or 0) + 1
    _persist_whatsapp_autopilot_state()
    if response_text:
        _record_channel_event(
            channel="whatsapp",
            direction="outbound",
            event_type="message",
            text=response_text,
            workspace_id=workspace_id,
            session_key=session_key,
            run_id=run_id,
            action=action,
            metadata={
                "connector_id": connector_id,
                "profile_id": profile.get("id"),
                "message_sid": message_sid,
                "trace_id": trace_id,
                "delivery_status": "sent",
            },
        )
    return _whatsapp_twiml(response_text)


async def handle_telegram_autopilot_status():
    _init()
    snapshot = _telegram_autopilot_snapshot(include_connectors=True)
    items: List[Dict[str, Any]] = []
    vault_error: Optional[str] = None
    connectors_index = snapshot.get("connectors", {}) if isinstance(snapshot.get("connectors"), dict) else {}
    try:
        entries = _list_telegram_connector_entries()
    except Exception as exc:
        entries = []
        vault_error = str(exc)
    for entry in entries:
        credential_id = str(entry.get("id") or "").strip()
        state = connectors_index.get(credential_id) if isinstance(connectors_index.get(credential_id), dict) else {}
        profile = _resolve_telegram_autopilot_profile(entry)
        items.append(
            {
                "id": credential_id,
                "label": entry.get("label"),
                "workspace_id": _normalize_workspace_id(entry.get("workspace_id")),
                "profile_id": profile.get("id"),
                "require_prefix": profile.get("require_prefix"),
                "prefix": profile.get("prefix"),
                "last_update_id": int(state.get("last_update_id") or 0),
                "last_poll_at": state.get("last_poll_at"),
                "last_processed_at": state.get("last_processed_at"),
                "last_run_id": state.get("last_run_id"),
                "last_action": state.get("last_action"),
                "last_chat_id": state.get("last_chat_id"),
                "allow_from": state.get("allow_from") if isinstance(state.get("allow_from"), list) else [],
                "dropped_sender_count": int(state.get("dropped_sender_count") or 0),
                "last_dropped_sender_id": state.get("last_dropped_sender_id"),
                "last_dropped_sender_username": state.get("last_dropped_sender_username"),
                "last_dropped_at": state.get("last_dropped_at"),
                "last_error": state.get("last_error"),
                "last_error_category": state.get("last_error_category"),
                "last_error_at": state.get("last_error_at"),
            }
        )
    return {
        "ok": bool(snapshot.get("enabled")),
        "autopilot": {
            "enabled": snapshot.get("enabled"),
            "active": snapshot.get("active"),
            "thread_alive": snapshot.get("thread_alive"),
            "started_at": snapshot.get("started_at"),
            "last_poll_at": snapshot.get("last_poll_at"),
            "last_error": snapshot.get("last_error"),
            "last_error_at": snapshot.get("last_error_at"),
            "last_error_category": snapshot.get("last_error_category"),
            "last_error_source": snapshot.get("last_error_source"),
            "error_count": snapshot.get("error_count"),
            "consecutive_errors": snapshot.get("consecutive_errors"),
            "retry_count": snapshot.get("retry_count"),
            "last_retry_at": snapshot.get("last_retry_at"),
            "backoff_seconds": snapshot.get("backoff_seconds"),
            "next_retry_at": snapshot.get("next_retry_at"),
            "last_success_at": snapshot.get("last_success_at"),
            "processed_updates": snapshot.get("processed_updates"),
            "runs_started": snapshot.get("runs_started"),
            "connectors_seen": snapshot.get("connectors_seen"),
            "connector_state_count": snapshot.get("connector_state_count"),
            "connector_error_count": snapshot.get("connector_error_count"),
            "dropped_sender_count": snapshot.get("dropped_sender_count"),
            "state_file": snapshot.get("state_file"),
            "poll_seconds": snapshot.get("poll_seconds"),
            "prefix": snapshot.get("prefix"),
            "require_prefix": snapshot.get("require_prefix"),
            "default_profile": snapshot.get("default_profile"),
        },
        "connectors": items,
        "vault_error": vault_error,
    }


async def handle_whatsapp_autopilot_status():
    _init()
    snapshot = _whatsapp_autopilot_snapshot(include_connectors=True)
    items: List[Dict[str, Any]] = []
    vault_error: Optional[str] = None
    connectors_index = snapshot.get("connectors", {}) if isinstance(snapshot.get("connectors"), dict) else {}
    try:
        entries = _list_whatsapp_connector_entries()
    except Exception as exc:
        entries = []
        vault_error = str(exc)
    for entry in entries:
        credential_id = str(entry.get("id") or "").strip()
        state = connectors_index.get(credential_id) if isinstance(connectors_index.get(credential_id), dict) else {}
        profile = _resolve_whatsapp_autopilot_profile(entry)
        items.append(
            {
                "id": credential_id,
                "label": entry.get("label"),
                "workspace_id": _normalize_workspace_id(entry.get("workspace_id")),
                "profile_id": profile.get("id"),
                "require_prefix": profile.get("require_prefix"),
                "prefix": profile.get("prefix"),
                "last_processed_at": state.get("last_processed_at"),
                "last_run_id": state.get("last_run_id"),
                "last_action": state.get("last_action"),
                "last_message_sid": state.get("last_message_sid"),
                "last_from_number": state.get("last_from_number"),
                "last_to_number": state.get("last_to_number"),
                "last_error": state.get("last_error"),
                "last_error_category": state.get("last_error_category"),
                "last_error_at": state.get("last_error_at"),
            }
        )
    return {
        "ok": bool(snapshot.get("enabled")),
        "autopilot": {
            "enabled": snapshot.get("enabled"),
            "active": snapshot.get("active"),
            "thread_alive": snapshot.get("thread_alive"),
            "started_at": snapshot.get("started_at"),
            "last_inbound_at": snapshot.get("last_inbound_at"),
            "last_error": snapshot.get("last_error"),
            "last_error_at": snapshot.get("last_error_at"),
            "last_error_category": snapshot.get("last_error_category"),
            "last_error_source": snapshot.get("last_error_source"),
            "error_count": snapshot.get("error_count"),
            "consecutive_errors": snapshot.get("consecutive_errors"),
            "processed_messages": snapshot.get("processed_messages"),
            "runs_started": snapshot.get("runs_started"),
            "connectors_seen": snapshot.get("connectors_seen"),
            "connector_state_count": snapshot.get("connector_state_count"),
            "connector_error_count": snapshot.get("connector_error_count"),
            "state_file": snapshot.get("state_file"),
            "prefix": snapshot.get("prefix"),
            "require_prefix": snapshot.get("require_prefix"),
            "default_profile": snapshot.get("default_profile"),
        },
        "connectors": items,
        "vault_error": vault_error,
    }


async def handle_list_autopilot_profiles():
    _init()
    telegram_profiles = []
    for profile_id, info in TELEGRAM_AUTOPILOT_PROFILE_CATALOG.items():
        telegram_profiles.append(
            {
                "id": profile_id,
                "label": info.get("label", profile_id),
                "description": info.get("description", ""),
                "allow_free_text": bool(info.get("allow_free_text")),
                "allow_status": bool(info.get("allow_status")),
                "allow_help": bool(info.get("allow_help")),
            }
        )
    return {
        "channels": {
            "telegram": {
                "enabled": bool(ORION_TELEGRAM_AUTOPILOT_ENABLED),
                "default_profile": ORION_TELEGRAM_AUTOPILOT_PROFILE,
                "profiles": telegram_profiles,
            },
            "whatsapp": {
                "enabled": bool(ORION_WHATSAPP_AUTOPILOT_ENABLED),
                "default_profile": ORION_WHATSAPP_AUTOPILOT_PROFILE,
                "profiles": [
                    {
                        "id": profile_id,
                        "label": info.get("label", profile_id),
                        "description": info.get("description", ""),
                        "allow_free_text": bool(info.get("allow_free_text")),
                        "allow_status": bool(info.get("allow_status")),
                        "allow_help": bool(info.get("allow_help")),
                    }
                    for profile_id, info in WHATSAPP_AUTOPILOT_PROFILE_CATALOG.items()
                ],
                "webhook_path": "/channels/whatsapp/twilio/webhook",
            },
        }
    }
