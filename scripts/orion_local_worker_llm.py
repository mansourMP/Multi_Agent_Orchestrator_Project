from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterator, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from server_modules.agent_turn import (
    AgentTurnRequest,
    bind_agent_turn_metadata,
    resolve_agent_turn_request,
)
from server_modules.usage_reporting import build_usage_record

SUPPORTED_PROVIDERS = ("codex_cli", "claude_code_cli", "openai", "anthropic", "gemini", "ollama", "qwen", "deepseek", "mistral")
LOCAL_CLI_AUTH_MODES = {"local_cli", "local_subscription", "subscription_cli", "claude_code_cli"}
AUTH_SCOPE_ERROR_MARKERS = (
    "api.responses.write",
    "missing scopes",
    "missing required scope",
    "insufficient scope",
    "insufficient permissions",
)
DIRECT_CHAT_TRANSPORT_UNAVAILABLE = "direct_chat_transport_unavailable"
OPENAI_API_KEY_MISSING_ERROR = "No OpenAI API key configured. Add one from the AI accounts page."
OPENAI_CODEX_DIRECT_AUTH_ERROR = (
    "This is a Codex OAuth token. Use openai-codex provider or set a direct OpenAI API key."
)
CLAUDE_CODE_CREDENTIALS_PATH = Path.home() / ".claude" / ".credentials.json"
CLAUDE_CODE_KEYCHAIN_SERVICE = "Claude Code-credentials"


def ensure_trailing_slashless(url: str) -> str:
    return str(url or "").rstrip("/")


def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def parse_json_object_loose(text: str) -> Optional[Dict[str, Any]]:
    raw = str(text or "").strip()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    candidate = raw[start : end + 1]
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return None
    return None


def _normalize_prior_messages(
    prior_messages: Any,
    *,
    assistant_role: str = "assistant",
) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    if not isinstance(prior_messages, list):
        return normalized
    allowed_roles = {"user", assistant_role}
    for item in prior_messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role == "assistant":
            role = assistant_role
        if role not in allowed_roles:
            continue
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        normalized.append({"role": role, "content": content})
    return normalized


def _build_chat_messages(
    user_prompt: str,
    *,
    prior_messages: Any = None,
    assistant_role: str = "assistant",
) -> List[Dict[str, str]]:
    messages = _normalize_prior_messages(prior_messages, assistant_role=assistant_role)
    content = str(user_prompt or "").strip()
    if content:
        messages.append({"role": "user", "content": content})
    return messages


def _build_responses_input(
    user_prompt: str,
    *,
    prior_messages: Any = None,
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for message in _build_chat_messages(user_prompt, prior_messages=prior_messages):
        role = message["role"]
        content_type = "output_text" if role == "assistant" else "input_text"
        items.append(
            {
                "role": role,
                "content": [
                    {
                        "type": content_type,
                        "text": message["content"],
                    }
                ],
            }
        )
    return items


def safe_read_json(path: Path, fallback: Any) -> Any:
    try:
        if not path.exists():
            return fallback
        raw = path.read_text(encoding="utf-8")
        parsed = json.loads(raw)
        return parsed
    except Exception:
        return fallback


def is_auth_scope_error(message: Any) -> bool:
    lowered = str(message or "").strip().lower()
    if not lowered:
        return False
    return any(marker in lowered for marker in AUTH_SCOPE_ERROR_MARKERS)


def sanitize_bearer_token(value: Any) -> str:
    token = str(value or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


def _jwt_payload(token: str) -> Optional[Dict[str, Any]]:
    raw = sanitize_bearer_token(token)
    parts = raw.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1].strip()
    if not payload:
        return None
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode((payload + padding).encode("utf-8")).decode("utf-8")
        parsed = json.loads(decoded)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def codex_account_id_from_token(token: str) -> str:
    payload = _jwt_payload(token)
    if not isinstance(payload, dict):
        return ""
    auth_payload = payload.get("https://api.openai.com/auth")
    if not isinstance(auth_payload, dict):
        return ""
    account_id = str(auth_payload.get("chatgpt_account_id") or "").strip()
    return account_id


def codex_token_from_vault(codex_auth_file: Path) -> str:
    try:
        payload = safe_read_json(codex_auth_file, {})
        if not isinstance(payload, dict):
            return ""
        tokens = payload.get("tokens")
        if not isinstance(tokens, dict):
            return ""
        return sanitize_bearer_token(tokens.get("access_token"))
    except Exception:
        return ""


def codex_cli_available() -> bool:
    return bool(shutil.which("codex"))


def claude_code_cli_available() -> bool:
    return bool(shutil.which("claude"))


def _coerce_epoch_ms(value: Any) -> int:
    try:
        return int(float(value))
    except Exception:
        return 0


def _parse_claude_code_session_token(payload: Any) -> str:
    source = payload.get("claudeAiOauth") if isinstance(payload, dict) else payload
    if not isinstance(source, dict):
        return ""
    token = sanitize_bearer_token(
        source.get("accessToken")
        or source.get("access_token")
        or source.get("token")
        or ""
    )
    if not token:
        return ""
    expires_at = _coerce_epoch_ms(
        source.get("expiresAt")
        or source.get("expires_at")
        or source.get("expires")
        or 0
    )
    if expires_at and expires_at <= int(time.time() * 1000):
        return ""
    return token


def read_claude_code_keychain_token() -> str:
    if not shutil.which("security"):
        return ""
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", CLAUDE_CODE_KEYCHAIN_SERVICE, "-w"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except Exception:
        return ""
    if result.returncode != 0:
        return ""
    raw = str(result.stdout or "").strip()
    if not raw:
        return ""
    try:
        parsed = json.loads(raw)
    except Exception:
        return ""
    return _parse_claude_code_session_token(parsed)


def read_claude_code_file_token() -> str:
    parsed = safe_read_json(CLAUDE_CODE_CREDENTIALS_PATH, {})
    return _parse_claude_code_session_token(parsed)


def get_claude_code_session_token() -> str:
    return read_claude_code_keychain_token() or read_claude_code_file_token()


def _openai_api_key_disabled() -> bool:
    return str(os.getenv("ORION_DISABLE_OPENAI_API_KEY", "0")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _openai_auth_mode() -> str:
    return str(os.getenv("ORION_AUTH_MODE", "")).strip().lower()


def _first_valid_token(candidates: list[Any]) -> str:
    for raw in candidates:
        token = sanitize_bearer_token(raw)
        if token:
            return token
    return ""


def _openai_oauth_candidates() -> list[Any]:
    return [
        os.getenv("ORION_LOCAL_WORKER_OPENAI_TOKEN"),
        os.getenv("CODEX_OAUTH_TOKEN"),
        os.getenv("OPENAI_OAUTH_TOKEN"),
        os.getenv("OPENAI_ACCESS_TOKEN"),
    ]


def _codex_oauth_candidates() -> list[Any]:
    auth_file = Path(
        os.getenv("CODEX_AUTH_FILE", str(Path.home() / ".codex" / "auth.json"))
    ).expanduser()
    return _openai_oauth_candidates() + [codex_token_from_vault(auth_file)]


def _openai_api_key_candidates() -> list[Any]:
    if _openai_api_key_disabled():
        return []
    return [
        os.getenv("ORION_LOCAL_WORKER_OPENAI_API_KEY"),
        os.getenv("OPENAI_API_KEY"),
    ]


def get_openai_bearer_token() -> str:
    return _first_valid_token(_openai_oauth_candidates())


def get_codex_oauth_token() -> str:
    return _first_valid_token(_codex_oauth_candidates())


def get_openai_api_key() -> str:
    return _first_valid_token(_openai_api_key_candidates())


def get_anthropic_api_key() -> str:
    return (
        os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_API_KEY")
        or os.getenv("ANTHROPIC_API_KEY")
        or ""
    ).strip()


def get_gemini_api_key() -> str:
    return (
        os.getenv("ORION_LOCAL_WORKER_GEMINI_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or ""
    ).strip()


def get_qwen_api_key() -> str:
    return (
        os.getenv("ORION_LOCAL_WORKER_QWEN_API_KEY")
        or os.getenv("QWEN_API_KEY")
        or os.getenv("DASHSCOPE_API_KEY")
        or ""
    ).strip()


def get_deepseek_api_key() -> str:
    return (
        os.getenv("ORION_LOCAL_WORKER_DEEPSEEK_API_KEY")
        or os.getenv("DEEPSEEK_API_KEY")
        or ""
    ).strip()


def get_mistral_api_key() -> str:
    return (
        os.getenv("ORION_LOCAL_WORKER_MISTRAL_API_KEY")
        or os.getenv("MISTRAL_API_KEY")
        or ""
    ).strip()


def ollama_enabled() -> bool:
    raw = str(os.getenv("ORION_LOCAL_WORKER_OLLAMA_ENABLED", "0")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def provider_has_key(provider: str) -> bool:
    pid = str(provider or "").strip().lower()
    if pid == "codex_cli":
        return codex_cli_available()
    if pid == "claude_code_cli":
        return claude_code_cli_available()
    if pid == "openai":
        return bool(get_openai_api_key())
    if pid == "anthropic":
        return bool(get_anthropic_api_key())
    if pid == "gemini":
        return bool(get_gemini_api_key())
    if pid == "ollama":
        return ollama_enabled()
    if pid == "qwen":
        return bool(get_qwen_api_key())
    if pid == "deepseek":
        return bool(get_deepseek_api_key())
    if pid == "mistral":
        return bool(get_mistral_api_key())
    return False


def requested_auth_mode(context: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    inline_credentials = metadata.get("credentials") if isinstance(metadata.get("credentials"), dict) else {}
    return str(
        inline_credentials.get("auth_mode")
        or inline_credentials.get("authMode")
        or metadata.get("auth_mode")
        or context.get("auth_mode")
        or ""
    ).strip().lower()


def openai_direct_auth_error(context: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    inline_credentials = metadata.get("credentials") if isinstance(metadata.get("credentials"), dict) else {}
    if requested_auth_mode(context, metadata) == "oauth_token":
        return OPENAI_CODEX_DIRECT_AUTH_ERROR
    oauth_token = sanitize_bearer_token(
        inline_credentials.get("oauth_token")
        or inline_credentials.get("oauthToken")
        or metadata.get("oauth_token")
    )
    if oauth_token:
        return OPENAI_CODEX_DIRECT_AUTH_ERROR
    return ""


def should_use_openai_chat_completions(context: Dict[str, Any], metadata: Dict[str, Any]) -> bool:
    requested_mode = requested_auth_mode(context, metadata)
    if requested_mode == "oauth_token":
        return True
    run_source = str(metadata.get("source") or context.get("source") or "").strip().lower()
    if run_source == "chat_direct":
        return False
    return _openai_auth_mode() == "codex"


def resolve_requested_provider(context: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    raw_provider = str(context.get("provider") or metadata.get("provider") or "").strip().lower()
    auth_mode = requested_auth_mode(context, metadata)
    if raw_provider == "claude_code_cli":
        return "claude_code_cli"
    if raw_provider == "openai-codex":
        return "codex_cli"
    if raw_provider == "anthropic" and auth_mode in LOCAL_CLI_AUTH_MODES:
        return "claude_code_cli"
    return raw_provider


def resolve_requested_model(context: Dict[str, Any], metadata: Dict[str, Any], provider: str = "") -> str:
    requested = str(
        context.get("model")
        or metadata.get("model")
        or metadata.get("requested_model")
        or ""
    ).strip()
    if requested:
        return requested
    pid = str(provider or resolve_requested_provider(context, metadata) or "").strip().lower()
    if pid == "codex_cli":
        return (
            os.getenv("ORION_LOCAL_WORKER_CODEX_MODEL")
            or os.getenv("CODEX_MODEL")
            or "gpt-5.4"
        ).strip() or "gpt-5.4"
    if pid == "openai":
        return (os.getenv("ORION_LOCAL_WORKER_OPENAI_MODEL") or os.getenv("CODEX_MODEL") or "gpt-4.1").strip() or "gpt-4.1"
    if pid == "claude_code_cli":
        return (os.getenv("ORION_LOCAL_WORKER_CLAUDE_CODE_MODEL") or "sonnet").strip() or "sonnet"
    if pid == "anthropic":
        return (os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_MODEL") or "claude-3-5-sonnet-20241022").strip() or "claude-3-5-sonnet-20241022"
    if pid == "gemini":
        return (os.getenv("ORION_LOCAL_WORKER_GEMINI_MODEL") or "gemini-2.0-flash").strip() or "gemini-2.0-flash"
    if pid == "ollama":
        return (os.getenv("ORION_LOCAL_WORKER_OLLAMA_MODEL") or "llama3.1:8b").strip() or "llama3.1:8b"
    if pid == "qwen":
        return (os.getenv("ORION_LOCAL_WORKER_QWEN_MODEL") or "qwen-turbo").strip() or "qwen-turbo"
    if pid == "deepseek":
        return (os.getenv("ORION_LOCAL_WORKER_DEEPSEEK_MODEL") or "deepseek-chat").strip() or "deepseek-chat"
    if pid == "mistral":
        return (os.getenv("ORION_LOCAL_WORKER_MISTRAL_MODEL") or "mistral-small-latest").strip() or "mistral-small-latest"
    return ""


def default_codex_model() -> str:
    return (
        os.getenv("ORION_LOCAL_WORKER_CODEX_MODEL")
        or os.getenv("CODEX_MODEL")
        or "gpt-5.4"
    ).strip() or "gpt-5.4"


def codex_cli_supports_model(model: Any) -> bool:
    normalized = str(model or "").strip().lower()
    if not normalized:
        return False
    return normalized.startswith("gpt-5") or "codex" in normalized


def coerce_requested_model_for_provider(requested_model: Any, provider: str) -> str:
    model = str(requested_model or "").strip()
    pid = str(provider or "").strip().lower()
    if pid == "codex_cli":
        return model if codex_cli_supports_model(model) else default_codex_model()
    if pid == "claude_code_cli":
        if not model or model.strip().lower() in {"sonnet", "claude", "default"}:
            return (
                os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_MODEL")
                or "claude-3-5-sonnet-20241022"
            ).strip() or "claude-3-5-sonnet-20241022"
    return model


def _inline_credentials(metadata: Dict[str, Any]) -> Dict[str, Any]:
    payload = metadata.get("credentials") if isinstance(metadata.get("credentials"), dict) else {}
    return payload if isinstance(payload, dict) else {}


def resolve_anthropic_api_key(credential_override: Optional[Dict[str, Any]] = None) -> str:
    override = credential_override if isinstance(credential_override, dict) else {}
    auth_mode = str(
        override.get("auth_mode")
        or override.get("authMode")
        or ""
    ).strip().lower()
    direct_token = sanitize_bearer_token(
        override.get("api_key")
        or override.get("access_token")
        or override.get("oauth_token")
        or override.get("token")
        or ""
    )
    if direct_token:
        return direct_token
    if auth_mode in LOCAL_CLI_AUTH_MODES:
        return get_claude_code_session_token()
    return get_anthropic_api_key()


def provider_has_usable_credentials(provider: str, context: Dict[str, Any], metadata: Dict[str, Any]) -> bool:
    pid = str(provider or "").strip().lower()
    inline_credentials = _inline_credentials(metadata)
    auth_mode = requested_auth_mode(context, metadata)
    if pid == "codex_cli":
        inline_token = sanitize_bearer_token(
            inline_credentials.get("oauth_token")
            or inline_credentials.get("access_token")
            or ""
        )
        return bool(inline_token) or provider_has_key("codex_cli")
    if pid == "claude_code_cli":
        return bool(get_claude_code_session_token())
    if pid == "openai":
        inline_key = sanitize_bearer_token(inline_credentials.get("api_key") or "")
        return bool(inline_key) or provider_has_key("openai")
    if pid == "anthropic":
        if auth_mode in LOCAL_CLI_AUTH_MODES:
            return bool(get_claude_code_session_token())
        inline_key = sanitize_bearer_token(
            inline_credentials.get("api_key")
            or inline_credentials.get("access_token")
            or inline_credentials.get("oauth_token")
            or inline_credentials.get("token")
            or ""
        )
        return bool(inline_key) or provider_has_key("anthropic")
    if pid == "gemini":
        inline_key = sanitize_bearer_token(inline_credentials.get("api_key") or "")
        return bool(inline_key) or provider_has_key("gemini")
    if pid in {"qwen", "deepseek", "mistral"}:
        inline_key = sanitize_bearer_token(
            inline_credentials.get("api_key")
            or inline_credentials.get("access_token")
            or inline_credentials.get("oauth_token")
            or inline_credentials.get("token")
            or ""
        )
        return bool(inline_key) or provider_has_key(pid)
    return provider_has_key(pid)


def resolve_requested_reasoning_effort(context: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    requested = str(
        context.get("reasoning_effort")
        or metadata.get("reasoning_effort")
        or metadata.get("requested_reasoning_effort")
        or ""
    ).strip().lower()
    if requested in {"low", "medium", "high", "xhigh"}:
        return requested
    return ""


def resolve_requested_tools(context: Dict[str, Any], metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_tools = metadata.get("tools")
    if not isinstance(raw_tools, list):
        raw_tools = context.get("tools")
    resolved: List[Dict[str, Any]] = []
    if not isinstance(raw_tools, list):
        return resolved
    for item in raw_tools:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        description = str(item.get("description") or "").strip()
        parameters = item.get("parameters") if isinstance(item.get("parameters"), dict) else None
        if not name or not parameters:
            continue
        resolved.append(
            {
                "name": name,
                "description": description,
                "parameters": parameters,
            }
        )
    return resolved


def format_provider_error(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        status = getattr(exc, "code", None)
        body = ""
        try:
            body = exc.read().decode("utf-8", "ignore")
        except Exception:
            body = ""
        body = " ".join(body.strip().split()) if body else ""
        if len(body) > 320:
            body = body[:320] + "..."
        if status is not None:
            return f"http_{status}: {body or str(exc.reason)}"
        return body or str(exc)
    if isinstance(exc, urllib.error.URLError):
        reason = getattr(exc, "reason", None)
        return f"url_error: {reason or str(exc)}"
    return str(exc)


def codex_instructions(system_prompt: Optional[str]) -> str:
    return str(system_prompt or "")


def resolve_openai_compatible_api_key(
    provider: str,
    credential_override: Optional[Dict[str, Any]] = None,
) -> str:
    override = credential_override if isinstance(credential_override, dict) else {}
    inline_key = sanitize_bearer_token(
        override.get("api_key")
        or override.get("access_token")
        or override.get("oauth_token")
        or override.get("token")
        or ""
    )
    if inline_key:
        return inline_key
    pid = str(provider or "openai").strip().lower()
    if pid == "openai":
        return get_openai_api_key()
    if pid == "qwen":
        return get_qwen_api_key()
    if pid == "deepseek":
        return get_deepseek_api_key()
    if pid == "mistral":
        return get_mistral_api_key()
    return ""


def resolve_openai_compatible_base_url(
    provider: str,
    credential_override: Optional[Dict[str, Any]] = None,
) -> str:
    override = credential_override if isinstance(credential_override, dict) else {}
    override_base_url = str(override.get("base_url") or "").strip()
    if override_base_url:
        return ensure_trailing_slashless(override_base_url)
    pid = str(provider or "openai").strip().lower()
    if pid == "qwen":
        return ensure_trailing_slashless(
            os.getenv("ORION_LOCAL_WORKER_QWEN_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
    if pid == "deepseek":
        return ensure_trailing_slashless(
            os.getenv("ORION_LOCAL_WORKER_DEEPSEEK_URL") or "https://api.deepseek.com/v1"
        )
    if pid == "mistral":
        return ensure_trailing_slashless(
            os.getenv("ORION_LOCAL_WORKER_MISTRAL_URL") or "https://api.mistral.ai/v1"
        )
    return ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_OPENAI_URL") or "https://api.openai.com/v1")


def default_openai_compatible_model(provider: str) -> str:
    pid = str(provider or "openai").strip().lower()
    if pid == "qwen":
        return (os.getenv("ORION_LOCAL_WORKER_QWEN_MODEL") or "qwen-turbo").strip() or "qwen-turbo"
    if pid == "deepseek":
        return (os.getenv("ORION_LOCAL_WORKER_DEEPSEEK_MODEL") or "deepseek-chat").strip() or "deepseek-chat"
    if pid == "mistral":
        return (os.getenv("ORION_LOCAL_WORKER_MISTRAL_MODEL") or "mistral-small-latest").strip() or "mistral-small-latest"
    return (os.getenv("ORION_LOCAL_WORKER_OPENAI_MODEL") or "gpt-4.1").strip() or "gpt-4.1"


def openai_compatible_missing_key_error(provider: str) -> str:
    pid = str(provider or "openai").strip().lower()
    if pid == "qwen":
        return "No Qwen API key configured. Add one from the AI accounts page."
    if pid == "deepseek":
        return "No DeepSeek API key configured. Add one from the AI accounts page."
    if pid == "mistral":
        return "No Mistral API key configured. Add one from the AI accounts page."
    return OPENAI_API_KEY_MISSING_ERROR


def openai_chat_json(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
    *,
    provider: str = "openai",
    credential_override: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    api_key = resolve_openai_compatible_api_key(provider, credential_override=credential_override)
    if not api_key:
        return None, None, "", openai_compatible_missing_key_error(provider)

    model = (str(model_override or "").strip() or default_openai_compatible_model(provider)).strip() or default_openai_compatible_model(provider)
    temperature = to_float(os.getenv("ORION_LOCAL_WORKER_TEMPERATURE"), 0.2)
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    base_url = resolve_openai_compatible_base_url(provider, credential_override=credential_override)

    messages: List[Dict[str, str]] = []
    if str(system_prompt or "").strip():
        messages.append({"role": "system", "content": str(system_prompt).strip()})
    messages.extend(_build_chat_messages(user_prompt, prior_messages=prior_messages))
    payload = {
        "model": model,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=f"{base_url}/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        choices = parsed.get("choices") if isinstance(parsed, dict) else None
        if not isinstance(choices, list) or not choices:
            return None, None, model, "empty_choices"
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            return None, None, model, "empty_content"
        result = parse_json_object_loose(content)
        if not isinstance(result, dict):
            return None, None, model, "invalid_json_content"
        usage_raw = parsed.get("usage") if isinstance(parsed, dict) else None
        usage = usage_raw if isinstance(usage_raw, dict) else None
        return result, usage, model, ""
    except Exception as exc:
        return None, None, model, format_provider_error(exc)


def openai_chat_text(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
    *,
    provider: str = "openai",
    credential_override: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    api_key = resolve_openai_compatible_api_key(provider, credential_override=credential_override)
    if not api_key:
        return "", None, "", openai_compatible_missing_key_error(provider)

    model = (str(model_override or "").strip() or default_openai_compatible_model(provider)).strip() or default_openai_compatible_model(provider)
    temperature = to_float(os.getenv("ORION_LOCAL_WORKER_TEMPERATURE"), 0.2)
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    base_url = resolve_openai_compatible_base_url(provider, credential_override=credential_override)

    messages: List[Dict[str, str]] = []
    if str(system_prompt or "").strip():
        messages.append({"role": "system", "content": str(system_prompt).strip()})
    messages.extend(_build_chat_messages(user_prompt, prior_messages=prior_messages))
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": messages,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=f"{base_url}/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        choices = parsed.get("choices") if isinstance(parsed, dict) else None
        if not isinstance(choices, list) or not choices:
            return "", None, model, "empty_choices"
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, list):
            parts: List[str] = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                text = str(item.get("text") or "").strip()
                if text:
                    parts.append(text)
            content = "\n".join(parts).strip()
        if not isinstance(content, str) or not content.strip():
            return "", None, model, "empty_content"
        usage_raw = parsed.get("usage") if isinstance(parsed, dict) else None
        usage = usage_raw if isinstance(usage_raw, dict) else None
        return content.strip(), usage, model, ""
    except Exception as exc:
        return "", None, model, format_provider_error(exc)


def extract_openai_text(payload: Dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload.get("output_text"):
        return payload["output_text"]

    output = payload.get("output") or []
    text_parts: list[str] = []
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content") or []
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    block_text = block.get("text")
                    if isinstance(block_text, str) and block_text.strip():
                        text_parts.append(block_text.strip())
            item_text = item.get("text")
            if isinstance(item_text, str) and item_text.strip():
                text_parts.append(item_text.strip())
    if text_parts:
        return "\n".join(text_parts)

    choices = payload.get("choices") or []
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message") or {}
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content
    return ""


def openai_codex_backend_text(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    reasoning_effort_override: Optional[str] = None,
    prior_messages: Any = None,
    credential_override: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    text_parts: list[str] = []
    usage: Optional[Dict[str, Any]] = None
    model = (
        str(model_override or "").strip()
        or os.getenv("ORION_LOCAL_WORKER_CODEX_MODEL")
        or os.getenv("CODEX_MODEL")
        or "gpt-5.4"
    ).strip() or "gpt-5.4"
    for event in iter_openai_codex_backend_events(
        system_prompt,
        user_prompt,
        model_override=model_override,
        reasoning_effort_override=reasoning_effort_override,
        prior_messages=prior_messages,
        credential_override=credential_override,
    ):
        event_type = str(event.get("type") or "").strip().lower()
        if event_type == "delta":
            delta = str(event.get("delta") or "")
            if delta:
                text_parts.append(delta)
            continue
        if event_type == "done":
            usage = event.get("usage") if isinstance(event.get("usage"), dict) else None
            resolved_model = str(event.get("model") or model or "").strip() or model
            text = str(event.get("text") or "").strip() or "".join(text_parts).strip()
            if text:
                return text, usage, resolved_model, ""
            return "", usage, resolved_model, "codex_empty_output"
        if event_type == "error":
            resolved_model = str(event.get("model") or model or "").strip() or model
            return "", None, resolved_model, str(event.get("error") or "codex_response_failed").strip() or "codex_response_failed"
    final_text = "".join(text_parts).strip()
    if final_text:
        return final_text, usage, model, ""
    return "", usage, model, "codex_empty_output"


def iter_openai_codex_backend_events(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    reasoning_effort_override: Optional[str] = None,
    prior_messages: Any = None,
    credential_override: Optional[Dict[str, Any]] = None,
    tools: Any = None,
) -> Iterator[Dict[str, Any]]:
    override = credential_override if isinstance(credential_override, dict) else {}
    token = sanitize_bearer_token(
        override.get("oauth_token")
        or override.get("access_token")
        or ""
    ) or get_codex_oauth_token()
    if not token:
        yield {"type": "error", "error": "missing_oauth_token", "model": ""}
        return

    account_id = str(override.get("account_id") or "").strip() or codex_account_id_from_token(token)
    if not account_id:
        yield {"type": "error", "error": "missing_chatgpt_account_id", "model": ""}
        return

    model = (
        str(model_override or "").strip()
        or os.getenv("ORION_LOCAL_WORKER_CODEX_MODEL")
        or os.getenv("CODEX_MODEL")
        or "gpt-5.4"
    ).strip() or "gpt-5.4"
    timeout_seconds = max(20, to_int(os.getenv("ORION_LOCAL_WORKER_CODEX_TIMEOUT_SECONDS"), 90))
    reasoning_effort = (
        str(reasoning_effort_override or "").strip().lower()
        or str(os.getenv("ORION_LOCAL_WORKER_CODEX_REASONING_EFFORT") or "low").strip().lower()
        or "low"
    )
    api_url = ensure_trailing_slashless(
        os.getenv("ORION_LOCAL_WORKER_CODEX_RESPONSES_URL")
        or "https://chatgpt.com/backend-api/codex/responses"
    )

    payload = {
        "model": model,
        "store": False,
        "stream": True,
        "input": _build_responses_input(user_prompt, prior_messages=prior_messages),
        "instructions": codex_instructions(system_prompt),
        "text": {"verbosity": "low"},
        "tool_choice": "auto",
        "parallel_tool_calls": True,
    }
    if isinstance(tools, list) and tools:
        payload["tools"] = [
            {
                "type": "function",
                "name": str(item.get("name") or "").strip(),
                "description": str(item.get("description") or "").strip(),
                "parameters": item.get("parameters"),
            }
            for item in tools
            if isinstance(item, dict)
            and str(item.get("name") or "").strip()
            and isinstance(item.get("parameters"), dict)
        ]
        if not payload["tools"]:
            payload.pop("tools", None)
    if reasoning_effort:
        payload["reasoning"] = {"effort": reasoning_effort, "summary": "auto"}

    req = urllib.request.Request(
        url=api_url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "chatgpt-account-id": account_id,
            "originator": "pi",
            "OpenAI-Beta": "responses=experimental",
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
            "User-Agent": "Empyralis Local Worker",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            buffer = ""
            text_parts: list[str] = []
            usage: Optional[Dict[str, Any]] = None
            completed_message_text = ""
            tool_calls: list[Dict[str, Any]] = []

            while True:
                chunk = response.read(8192)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", "ignore")
                while "\n\n" in buffer:
                    raw_event, buffer = buffer.split("\n\n", 1)
                    data_lines = []
                    for line in raw_event.splitlines():
                        if line.startswith("data:"):
                            data_lines.append(line[5:].strip())
                    if not data_lines:
                        continue
                    payload_text = "\n".join(data_lines).strip()
                    if not payload_text or payload_text == "[DONE]":
                        continue
                    try:
                        event = json.loads(payload_text)
                    except Exception:
                        continue
                    if not isinstance(event, dict):
                        continue
                    event_type = str(event.get("type") or "").strip()
                    if event_type == "response.output_text.delta":
                        delta = str(event.get("delta") or "")
                        if delta:
                            text_parts.append(delta)
                            yield {"type": "delta", "delta": delta, "model": model}
                        continue
                    if event_type == "response.output_item.done":
                        item = event.get("item")
                        if isinstance(item, dict) and str(item.get("type") or "").strip() == "function_call":
                            tool_name = str(item.get("name") or "").strip()
                            if tool_name:
                                tool_calls.append(
                                    {
                                        "name": tool_name,
                                        "arguments": item.get("arguments"),
                                    }
                                )
                            continue
                        if isinstance(item, dict) and str(item.get("type") or "").strip() == "message":
                            content = item.get("content")
                            done_parts: list[str] = []
                            if isinstance(content, list):
                                for block in content:
                                    if not isinstance(block, dict):
                                        continue
                                    if str(block.get("type") or "").strip() == "output_text":
                                        block_text = str(block.get("text") or "")
                                        if block_text:
                                            done_parts.append(block_text)
                            completed_message_text = "\n".join(part for part in done_parts if part).strip()
                        continue
                    if event_type in {"response.completed", "response.done", "response.incomplete"}:
                        response_payload = event.get("response")
                        if isinstance(response_payload, dict) and isinstance(response_payload.get("usage"), dict):
                            usage = response_payload.get("usage")
                        final_text = completed_message_text or "\n".join(part for part in text_parts if part).strip()
                        if not final_text and isinstance(response_payload, dict):
                            final_text = extract_openai_text(response_payload).strip()
                        if final_text or tool_calls:
                            yield {
                                "type": "done",
                                "text": final_text,
                                "usage": usage,
                                "model": model,
                                "tool_calls": tool_calls,
                            }
                            return
                        yield {"type": "error", "error": "codex_empty_output", "model": model}
                        return
                    if event_type in {"response.failed", "error"}:
                        message = ""
                        response_payload = event.get("response")
                        if isinstance(response_payload, dict):
                            response_error = response_payload.get("error")
                            if isinstance(response_error, dict):
                                message = str(response_error.get("message") or response_error.get("code") or "").strip()
                        if not message:
                            message = str(event.get("message") or event.get("code") or "codex_response_failed").strip()
                        yield {"type": "error", "error": message or "codex_response_failed", "model": model}
                        return

            final_text = "\n".join(part for part in text_parts if part).strip()
            if final_text or tool_calls:
                yield {
                    "type": "done",
                    "text": final_text,
                    "usage": usage,
                    "model": model,
                    "tool_calls": tool_calls,
                }
                return
            yield {"type": "error", "error": "codex_empty_output", "model": model}
            return
    except Exception as exc:
        yield {"type": "error", "error": format_provider_error(exc), "model": model}
        return


def openai_responses_text(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    api_key = get_openai_api_key()
    if not api_key:
        return "", None, "", OPENAI_API_KEY_MISSING_ERROR

    model = (
        str(model_override or "").strip()
        or os.getenv("ORION_LOCAL_WORKER_OPENAI_MODEL")
        or os.getenv("CODEX_MODEL")
        or "gpt-4.1"
    ).strip() or "gpt-4.1"
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    api_url = ensure_trailing_slashless(
        os.getenv("ORION_LOCAL_WORKER_OPENAI_RESPONSES_URL")
        or os.getenv("OPENAI_RESPONSES_URL")
        or "https://api.openai.com/v1/responses"
    )
    payload = {
        "model": model,
        "input": _build_responses_input(user_prompt, prior_messages=prior_messages),
    }
    if str(system_prompt or "").strip():
        payload["instructions"] = str(system_prompt).strip()
    req = urllib.request.Request(
        url=api_url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return "", None, model, "invalid_response"
        text = extract_openai_text(parsed).strip()
        if not text:
            return "", parsed.get("usage") if isinstance(parsed.get("usage"), dict) else None, model, "empty_content"
        usage = parsed.get("usage") if isinstance(parsed.get("usage"), dict) else None
        return text, usage, model, ""
    except Exception as exc:
        return "", None, model, format_provider_error(exc)


def codex_exec_text(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    reasoning_effort_override: Optional[str] = None,
    prior_messages: Any = None,
    credential_override: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    direct_text, direct_usage, direct_model, direct_error = openai_codex_backend_text(
        system_prompt,
        user_prompt,
        model_override=model_override,
        reasoning_effort_override=reasoning_effort_override,
        prior_messages=prior_messages,
        credential_override=credential_override,
    )
    if direct_text:
        return direct_text, direct_usage, direct_model, ""
    if not codex_cli_available():
        return "", None, direct_model or "codex", direct_error or "codex_cli_not_found"

    timeout_seconds = max(15, to_int(os.getenv("ORION_LOCAL_WORKER_CODEX_TIMEOUT_SECONDS"), 90))
    model = (str(model_override or "").strip() or os.getenv("ORION_LOCAL_WORKER_CODEX_MODEL") or "").strip()

    prompt_parts: List[str] = []
    if str(system_prompt or "").strip():
        prompt_parts.append(str(system_prompt).strip())
    prompt_parts.append(str(user_prompt or "").strip())
    prompt = "\n\n".join(prompt_parts)

    with tempfile.NamedTemporaryFile(prefix="orion-codex-", suffix=".txt", delete=False) as tmp:
        out_path = tmp.name

    cmd = [
        "codex",
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "--output-last-message",
        out_path,
    ]
    if model:
        cmd.extend(["--model", model])
    cmd.append(prompt)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        if result.returncode != 0:
            stderr = str(result.stderr or "").strip()
            stdout = str(result.stdout or "").strip()
            detail = stderr or stdout or f"exit_{result.returncode}"
            if len(detail) > 320:
                detail = detail[:320] + "..."
            return "", None, model or "codex", f"codex_exec_failed: {detail}"
        try:
            text = Path(out_path).read_text(encoding="utf-8").strip()
        except Exception:
            text = ""
        if not text:
            return "", None, model or "codex", "codex_empty_output"
        return text, None, model or "codex", ""
    except subprocess.TimeoutExpired:
        if direct_error:
            return "", None, model or "codex", direct_error
        return "", None, model or "codex", "codex_timeout"
    except Exception as exc:
        if direct_error:
            return "", None, model or "codex", direct_error
        return "", None, model or "codex", f"codex_exec_error: {exc}"
    finally:
        try:
            Path(out_path).unlink(missing_ok=True)
        except Exception:
            pass


def codex_exec_json(
    system_prompt: str,
    user_prompt: str,
    model_override: Optional[str] = None,
    credential_override: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    prompt = (
        f"{user_prompt}\n\n"
        'Return strictly valid JSON only with keys: "summary", "content_plan", "next_steps".'
    )
    text, usage, model, err = codex_exec_text(
        system_prompt,
        prompt,
        model_override=model_override,
        credential_override=credential_override,
    )
    if not text:
        return None, usage, model, err or "codex_empty_output"
    parsed = parse_json_object_loose(text)
    if not isinstance(parsed, dict):
        return None, usage, model, "codex_invalid_json_content"
    return parsed, usage, model, ""


def claude_code_exec_text(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    if not claude_code_cli_available():
        return "", None, "sonnet", "claude_code_cli_not_found"

    timeout_seconds = max(15, to_int(os.getenv("ORION_LOCAL_WORKER_CLAUDE_CODE_TIMEOUT_SECONDS"), 120))
    model = (str(model_override or "").strip() or os.getenv("ORION_LOCAL_WORKER_CLAUDE_CODE_MODEL") or "sonnet").strip() or "sonnet"
    cmd = [
        "claude",
        "-p",
        "--output-format",
        "text",
        "--model",
        model,
    ]
    if str(system_prompt or "").strip():
        cmd.extend(["--system-prompt", str(system_prompt).strip()])
    cmd.append(user_prompt)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        if result.returncode != 0:
            stderr = str(result.stderr or "").strip()
            stdout = str(result.stdout or "").strip()
            detail = stderr or stdout or f"exit_{result.returncode}"
            if len(detail) > 320:
                detail = detail[:320] + "..."
            return "", None, model, f"claude_code_exec_failed: {detail}"
        text = str(result.stdout or "").strip()
        if not text:
            return "", None, model, "claude_code_empty_output"
        return text, None, model, ""
    except subprocess.TimeoutExpired:
        return "", None, model, "claude_code_timeout"
    except Exception as exc:
        return "", None, model, f"claude_code_exec_error: {exc}"


def claude_code_exec_json(system_prompt: str, user_prompt: str, model_override: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    prompt = (
        f"{user_prompt}\n\n"
        'Return strictly valid JSON only with keys: "summary", "content_plan", "next_steps".'
    )
    text, usage, model, err = claude_code_exec_text(system_prompt, prompt, model_override=model_override)
    if not text:
        return None, usage, model, err or "claude_code_empty_output"
    parsed = parse_json_object_loose(text)
    if not isinstance(parsed, dict):
        return None, usage, model, "claude_code_invalid_json_content"
    return parsed, usage, model, ""


def anthropic_chat_text(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
    credential_override: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    api_key = resolve_anthropic_api_key(credential_override=credential_override)
    if not api_key:
        return "", None, "", "missing_api_key"

    model = (str(model_override or "").strip() or os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_MODEL") or "claude-3-5-sonnet-20241022").strip() or "claude-3-5-sonnet-20241022"
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    max_tokens = max(256, to_int(os.getenv("ORION_LOCAL_WORKER_MAX_TOKENS"), 1200))
    api_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_URL") or "https://api.anthropic.com")
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": _build_chat_messages(user_prompt, prior_messages=prior_messages),
    }
    if str(system_prompt or "").strip():
        payload["system"] = str(system_prompt).strip()
    req = urllib.request.Request(
        url=f"{api_url}/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        content = parsed.get("content") if isinstance(parsed, dict) else None
        parts: list[str] = []
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text.strip())
        combined = "\n".join(parts).strip()
        if not combined:
            return "", None, model, "empty_content"
        usage_raw = parsed.get("usage") if isinstance(parsed, dict) else None
        usage = usage_raw if isinstance(usage_raw, dict) else None
        return combined, usage, model, ""
    except Exception as exc:
        return "", None, model, format_provider_error(exc)


def anthropic_chat_json(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
    credential_override: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    api_key = resolve_anthropic_api_key(credential_override=credential_override)
    if not api_key:
        return None, None, "", "missing_api_key"

    model = (str(model_override or "").strip() or os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_MODEL") or "claude-3-5-sonnet-20241022").strip() or "claude-3-5-sonnet-20241022"
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    max_tokens = max(256, to_int(os.getenv("ORION_LOCAL_WORKER_MAX_TOKENS"), 1200))
    api_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_URL") or "https://api.anthropic.com")
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": _build_chat_messages(user_prompt, prior_messages=prior_messages),
    }
    if str(system_prompt or "").strip():
        payload["system"] = str(system_prompt).strip()
    req = urllib.request.Request(
        url=f"{api_url}/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        content = parsed.get("content") if isinstance(parsed, dict) else None
        parts: list[str] = []
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text.strip())
        combined = "\n".join(parts).strip()
        if not combined:
            return None, None, model, "empty_content"
        result = parse_json_object_loose(combined)
        if not isinstance(result, dict):
            return None, None, model, "invalid_json_content"
        usage_raw = parsed.get("usage") if isinstance(parsed, dict) else None
        usage = usage_raw if isinstance(usage_raw, dict) else None
        return result, usage, model, ""
    except Exception as exc:
        return None, None, model, format_provider_error(exc)


def gemini_chat_text(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    api_key = get_gemini_api_key()
    if not api_key:
        return "", None, "", "missing_api_key"

    model = (str(model_override or "").strip() or os.getenv("ORION_LOCAL_WORKER_GEMINI_MODEL") or "gemini-2.0-flash").strip() or "gemini-2.0-flash"
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    api_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_GEMINI_URL") or "https://generativelanguage.googleapis.com/v1beta")
    payload = {
        "contents": [
            {"role": item["role"], "parts": [{"text": item["content"]}]}
            for item in _build_chat_messages(user_prompt, prior_messages=prior_messages, assistant_role="model")
        ],
    }
    if str(system_prompt or "").strip():
        payload["system_instruction"] = {"parts": [{"text": str(system_prompt).strip()}]}
    req = urllib.request.Request(
        url=f"{api_url}/models/{urllib.parse.quote_plus(model)}:generateContent?key={urllib.parse.quote_plus(api_key)}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        candidates = parsed.get("candidates") if isinstance(parsed, dict) else None
        texts: list[str] = []
        if isinstance(candidates, list):
            for cand in candidates:
                if not isinstance(cand, dict):
                    continue
                content = cand.get("content")
                if not isinstance(content, dict):
                    continue
                for part in content.get("parts", []) if isinstance(content.get("parts"), list) else []:
                    if isinstance(part, dict):
                        text = part.get("text")
                        if isinstance(text, str) and text.strip():
                            texts.append(text.strip())
        combined = "\n".join(texts).strip()
        if not combined:
            return "", None, model, "empty_content"
        usage_raw = parsed.get("usageMetadata") if isinstance(parsed, dict) else None
        usage = usage_raw if isinstance(usage_raw, dict) else None
        return combined, usage, model, ""
    except Exception as exc:
        return "", None, model, format_provider_error(exc)


def gemini_chat_json(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    api_key = get_gemini_api_key()
    if not api_key:
        return None, None, "", "missing_api_key"

    model = (str(model_override or "").strip() or os.getenv("ORION_LOCAL_WORKER_GEMINI_MODEL") or "gemini-2.0-flash").strip() or "gemini-2.0-flash"
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    api_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_GEMINI_URL") or "https://generativelanguage.googleapis.com/v1beta")
    payload = {
        "contents": [
            {"role": item["role"], "parts": [{"text": item["content"]}]}
            for item in _build_chat_messages(user_prompt, prior_messages=prior_messages, assistant_role="model")
        ],
    }
    if str(system_prompt or "").strip():
        payload["system_instruction"] = {"parts": [{"text": str(system_prompt).strip()}]}
    req = urllib.request.Request(
        url=f"{api_url}/models/{urllib.parse.quote_plus(model)}:generateContent?key={urllib.parse.quote_plus(api_key)}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        candidates = parsed.get("candidates") if isinstance(parsed, dict) else None
        texts: list[str] = []
        if isinstance(candidates, list):
            for cand in candidates:
                if not isinstance(cand, dict):
                    continue
                content = cand.get("content")
                if not isinstance(content, dict):
                    continue
                for part in content.get("parts", []) if isinstance(content.get("parts"), list) else []:
                    if isinstance(part, dict):
                        text = part.get("text")
                        if isinstance(text, str) and text.strip():
                            texts.append(text.strip())
        combined = "\n".join(texts).strip()
        if not combined:
            return None, None, model, "empty_content"
        result = parse_json_object_loose(combined)
        if not isinstance(result, dict):
            return None, None, model, "invalid_json_content"
        usage_raw = parsed.get("usageMetadata") if isinstance(parsed, dict) else None
        usage = usage_raw if isinstance(usage_raw, dict) else None
        return result, usage, model, ""
    except Exception as exc:
        return None, None, model, format_provider_error(exc)


def ollama_chat_text(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    if not ollama_enabled():
        return "", None, "", "ollama_disabled"

    model = (str(model_override or "").strip() or os.getenv("ORION_LOCAL_WORKER_OLLAMA_MODEL") or "llama3.1:8b").strip() or "llama3.1:8b"
    temperature = to_float(os.getenv("ORION_LOCAL_WORKER_TEMPERATURE"), 0.2)
    base_timeout = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_OLLAMA_TIMEOUT_SECONDS"), base_timeout))
    api_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_OLLAMA_URL") or "http://127.0.0.1:11434")
    num_predict = max(
        128,
        to_int(
            os.getenv("ORION_LOCAL_WORKER_OLLAMA_NUM_PREDICT"),
            to_int(os.getenv("ORION_LOCAL_WORKER_MAX_TOKENS"), 700),
        ),
    )

    payload = {
        "model": model,
        "stream": False,
        "messages": _build_chat_messages(user_prompt, prior_messages=prior_messages),
        "options": {"temperature": temperature, "num_predict": num_predict},
    }
    if str(system_prompt or "").strip():
        payload["system"] = str(system_prompt).strip()
    req = urllib.request.Request(
        url=f"{api_url}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        message = parsed.get("message") if isinstance(parsed, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            return "", None, model, "empty_content"
        usage = {
            "prompt_eval_count": to_int(parsed.get("prompt_eval_count"), 0),
            "eval_count": to_int(parsed.get("eval_count"), 0),
        }
        return content.strip(), usage, model, ""
    except Exception as exc:
        return "", None, model, format_provider_error(exc)


def ollama_chat_json(
    system_prompt: Optional[str],
    user_prompt: str,
    model_override: Optional[str] = None,
    prior_messages: Any = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    if not ollama_enabled():
        return None, None, "", "ollama_disabled"

    model = (str(model_override or "").strip() or os.getenv("ORION_LOCAL_WORKER_OLLAMA_MODEL") or "llama3.1:8b").strip() or "llama3.1:8b"
    temperature = to_float(os.getenv("ORION_LOCAL_WORKER_TEMPERATURE"), 0.2)
    base_timeout = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_OLLAMA_TIMEOUT_SECONDS"), base_timeout))
    api_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_OLLAMA_URL") or "http://127.0.0.1:11434")
    num_predict = max(
        128,
        to_int(
            os.getenv("ORION_LOCAL_WORKER_OLLAMA_NUM_PREDICT"),
            to_int(os.getenv("ORION_LOCAL_WORKER_MAX_TOKENS"), 700),
        ),
    )

    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "messages": _build_chat_messages(user_prompt, prior_messages=prior_messages),
        "options": {"temperature": temperature, "num_predict": num_predict},
    }
    if str(system_prompt or "").strip():
        payload["system"] = str(system_prompt).strip()
    req = urllib.request.Request(
        url=f"{api_url}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        message = parsed.get("message") if isinstance(parsed, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            return None, None, model, "empty_content"
        result = parse_json_object_loose(content)
        if not isinstance(result, dict):
            return None, None, model, "invalid_json_content"
        usage = {
            "prompt_eval_count": to_int(parsed.get("prompt_eval_count"), 0),
            "eval_count": to_int(parsed.get("eval_count"), 0),
        }
        return result, usage, model, ""
    except Exception as exc:
        return None, None, model, format_provider_error(exc)


def build_usage_masked(provider: str, model: str, input_tokens: int, output_tokens: int, total_tokens: int) -> Dict[str, Any]:
    return build_usage_record(
        provider,
        model,
        max(0, input_tokens),
        max(0, output_tokens),
        max(0, total_tokens),
    )


def build_usage_masked_from_provider(provider: str, usage: Optional[Dict[str, Any]], model: str) -> Dict[str, Any]:
    pid = str(provider or "").strip().lower()
    source = usage or {}
    if pid == "codex_cli":
        prompt_tokens = to_int(source.get("prompt_tokens"), 0)
        completion_tokens = to_int(source.get("completion_tokens"), 0)
        total_tokens = to_int(source.get("total_tokens"), prompt_tokens + completion_tokens)
        return build_usage_masked(pid, model or "codex", prompt_tokens, completion_tokens, total_tokens)
    if pid == "claude_code_cli":
        return build_usage_masked(pid, model or "sonnet", 0, 0, 0)
    if pid == "openai":
        prompt_tokens = to_int(source.get("prompt_tokens"), 0)
        completion_tokens = to_int(source.get("completion_tokens"), 0)
        total_tokens = to_int(source.get("total_tokens"), prompt_tokens + completion_tokens)
        return build_usage_masked(pid, model or "gpt-4.1", prompt_tokens, completion_tokens, total_tokens)
    if pid in {"qwen", "deepseek", "mistral"}:
        prompt_tokens = to_int(source.get("prompt_tokens"), 0)
        completion_tokens = to_int(source.get("completion_tokens"), 0)
        total_tokens = to_int(source.get("total_tokens"), prompt_tokens + completion_tokens)
        return build_usage_masked(pid, model or resolve_requested_model({}, {}, pid), prompt_tokens, completion_tokens, total_tokens)
    if pid == "anthropic":
        prompt_tokens = to_int(source.get("input_tokens"), 0)
        completion_tokens = to_int(source.get("output_tokens"), 0)
        total_tokens = prompt_tokens + completion_tokens
        return build_usage_masked(pid, model or "claude-3-5-sonnet-20241022", prompt_tokens, completion_tokens, total_tokens)
    if pid == "gemini":
        prompt_tokens = to_int(source.get("promptTokenCount"), 0)
        completion_tokens = to_int(source.get("candidatesTokenCount"), 0)
        total_tokens = to_int(source.get("totalTokenCount"), prompt_tokens + completion_tokens)
        return build_usage_masked(pid, model or "gemini-2.0-flash", prompt_tokens, completion_tokens, total_tokens)
    if pid == "ollama":
        prompt_tokens = to_int(source.get("prompt_eval_count"), 0)
        completion_tokens = to_int(source.get("eval_count"), 0)
        total_tokens = prompt_tokens + completion_tokens
        return build_usage_masked(pid, model or "llama3.1:8b", prompt_tokens, completion_tokens, total_tokens)
    return build_usage_masked(pid or "local_companion", model or "unknown-model", 0, 0, 0)


def provider_order_for_run(context: Dict[str, Any], metadata: Dict[str, Any]) -> list[str]:
    requested_order = [item.strip().lower() for item in str(os.getenv("ORION_LOCAL_WORKER_PROVIDER_ORDER") or "").split(",") if item.strip()]
    requested_order = [item for item in requested_order if item in SUPPORTED_PROVIDERS]

    provider_hint = str(os.getenv("ORION_LOCAL_WORKER_PROVIDER") or "").strip().lower()
    auth_mode = _openai_auth_mode()
    use_codex_cli = str(os.getenv("ORION_LOCAL_WORKER_USE_CODEX_CLI", "1")).strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    prefer_direct_openai = str(os.getenv("ORION_LOCAL_WORKER_PREFER_DIRECT_OPENAI", "1")).strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    context_provider = resolve_requested_provider(context, metadata)
    run_source = str(metadata.get("source") or context.get("source") or "").strip().lower()
    disable_fallback = str(
        metadata.get("disable_provider_fallback")
        or context.get("disable_provider_fallback")
        or ""
    ).strip().lower() in {"1", "true", "yes", "on"}

    base = list(requested_order)
    if provider_hint and provider_hint != "auto" and provider_hint in SUPPORTED_PROVIDERS and provider_hint not in base:
        base.insert(0, provider_hint)
    if context_provider in SUPPORTED_PROVIDERS and context_provider not in base:
        base.insert(0, context_provider)

    for pid in SUPPORTED_PROVIDERS:
        if pid not in base:
            base.append(pid)
    if (
        auth_mode == "codex"
        and run_source not in {"chat_direct"}
        and use_codex_cli
        and "codex_cli" in base
        and provider_has_usable_credentials("codex_cli", context, metadata)
    ):
        if run_source in {"telegram_autopilot", "whatsapp_autopilot"}:
            return ["codex_cli"]
        base = ["codex_cli"] + [pid for pid in base if pid != "codex_cli"]
        if prefer_direct_openai and "openai" in base and provider_has_usable_credentials("openai", context, metadata):
            openai_index = base.index("openai")
            if openai_index > 1:
                base.pop(openai_index)
                base.insert(1, "openai")

    fallback_enabled = str(os.getenv("ORION_LOCAL_WORKER_PROVIDER_FALLBACK", "1")).strip().lower() not in {"0", "false", "no", "off"}
    if disable_fallback and context_provider in SUPPORTED_PROVIDERS:
        return [context_provider] if provider_has_usable_credentials(context_provider, context, metadata) else []
    if provider_hint and provider_hint != "auto" and provider_hint in SUPPORTED_PROVIDERS and not fallback_enabled:
        return [provider_hint] if provider_has_usable_credentials(provider_hint, context, metadata) else []

    return [pid for pid in base if provider_has_usable_credentials(pid, context, metadata)]


def generate_pack_with_provider_fallback(
    context: Dict[str, Any],
    metadata: Dict[str, Any],
    system_prompt: str,
    user_prompt: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    attempted: list[str] = []
    last_error = "no provider credentials available"
    requested_model = resolve_requested_model(context, metadata)
    credential_override = metadata.get("credentials") if isinstance(metadata.get("credentials"), dict) else None
    for provider in provider_order_for_run(context, metadata):
        attempted.append(provider)
        provider_model = coerce_requested_model_for_provider(requested_model, provider)
        if provider == "codex_cli":
            result, usage, model, provider_error = codex_exec_json(
                system_prompt,
                user_prompt,
                model_override=provider_model,
                credential_override=credential_override,
            )
        elif provider == "claude_code_cli":
            result, usage, model, provider_error = anthropic_chat_json(
                system_prompt,
                user_prompt,
                model_override=provider_model,
                credential_override=credential_override,
            )
        elif provider == "openai":
            direct_auth_error = openai_direct_auth_error(context, metadata)
            if direct_auth_error:
                last_error = direct_auth_error
                continue
            result, usage, model, provider_error = openai_chat_json(
                system_prompt,
                user_prompt,
                model_override=provider_model,
                provider="openai",
                credential_override=credential_override,
            )
        elif provider in {"qwen", "deepseek", "mistral"}:
            result, usage, model, provider_error = openai_chat_json(
                system_prompt,
                user_prompt,
                model_override=provider_model,
                provider=provider,
                credential_override=credential_override,
            )
        elif provider == "anthropic":
            result, usage, model, provider_error = anthropic_chat_json(
                system_prompt,
                user_prompt,
                model_override=provider_model,
                credential_override=credential_override,
            )
        elif provider == "gemini":
            result, usage, model, provider_error = gemini_chat_json(system_prompt, user_prompt, model_override=provider_model)
        elif provider == "ollama":
            result, usage, model, provider_error = ollama_chat_json(system_prompt, user_prompt, model_override=provider_model)
        else:
            continue
        if isinstance(result, dict):
            return result, build_usage_masked_from_provider(provider, usage, model), ",".join(attempted), ""
        if provider_error:
            last_error = f"{provider} generation failed: {provider_error}"
        else:
            last_error = f"{provider} generation failed"
    attempted_str = ",".join(attempted)
    return None, None, attempted_str, last_error


def generate_chat_reply_with_provider_fallback(
    context: Dict[str, Any],
    metadata: Dict[str, Any],
    user_goal: str,
    system_prompt: Optional[str],
    prior_messages: Any = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    attempted: list[str] = []
    last_error = "no provider credentials available"
    prefer_openai_chat = should_use_openai_chat_completions(context, metadata)
    requested_model = resolve_requested_model(context, metadata)
    requested_reasoning_effort = resolve_requested_reasoning_effort(context, metadata)
    credential_override = metadata.get("credentials") if isinstance(metadata.get("credentials"), dict) else None
    for provider in provider_order_for_run(context, metadata):
        attempted.append(provider)
        provider_model = coerce_requested_model_for_provider(requested_model, provider)
        if provider == "codex_cli":
            text, usage, model, provider_error = openai_codex_backend_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                reasoning_effort_override=requested_reasoning_effort or None,
                prior_messages=prior_messages,
                credential_override=credential_override,
            )
            if text:
                return (
                    text,
                    build_usage_masked_from_provider("codex_cli", usage, model),
                    ",".join(attempted),
                    "",
                )
            last_error = (
                f"{DIRECT_CHAT_TRANSPORT_UNAVAILABLE}: codex_cli_backend_unavailable: "
                f"{provider_error or 'unknown_error'}"
            )
            continue
        if provider == "claude_code_cli":
            text, usage, model, provider_error = anthropic_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
                credential_override=credential_override,
            )
            if text:
                return (
                    text,
                    build_usage_masked_from_provider("claude_code_cli", usage, model),
                    ",".join(attempted),
                    "",
                )
            last_error = f"claude_code_cli generation failed: {provider_error or 'unknown_error'}"
            continue
        if provider == "openai":
            direct_auth_error = openai_direct_auth_error(context, metadata)
            if direct_auth_error:
                last_error = f"openai generation failed: {direct_auth_error}"
                continue
            if not prefer_openai_chat:
                text, usage, model, provider_error = openai_responses_text(
                    system_prompt,
                    user_goal,
                    model_override=provider_model,
                    prior_messages=prior_messages,
                )
                if text:
                    return (
                        text,
                        build_usage_masked_from_provider("openai", usage, model),
                        ",".join(attempted),
                        "",
                    )
            else:
                provider_error = ""
            text, usage_chat, model_chat, provider_error_chat = openai_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
                provider="openai",
                credential_override=credential_override,
            )
            if text:
                return (
                    text,
                    build_usage_masked_from_provider("openai", usage_chat, model_chat),
                    ",".join(attempted),
                    "",
                )
            last_error = (
                f"openai generation failed: "
                f"{provider_error or provider_error_chat or 'unknown_error'}"
            )
            continue
        if provider in {"qwen", "deepseek", "mistral"}:
            text, usage, model, provider_error = openai_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
                provider=provider,
                credential_override=credential_override,
            )
            if text:
                return text, build_usage_masked_from_provider(provider, usage, model), ",".join(attempted), ""
            last_error = f"{provider} generation failed: {provider_error or 'unknown_error'}"
            continue
        if provider == "anthropic":
            text, usage, model, provider_error = anthropic_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
                credential_override=credential_override,
            )
        elif provider == "gemini":
            text, usage, model, provider_error = gemini_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
            )
        elif provider == "ollama":
            text, usage, model, provider_error = ollama_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
            )
        else:
            continue
        if text:
            return text, build_usage_masked_from_provider(provider, usage, model), ",".join(attempted), ""
        if provider_error:
            last_error = f"{provider} generation failed: {provider_error}"
        else:
            last_error = f"{provider} generation failed"
    return "", None, ",".join(attempted), last_error


def generate_chat_reply_for_turn_request(
    *,
    turn_request: Any,
    context: Dict[str, Any],
    metadata: Dict[str, Any],
    system_prompt: Optional[str],
    prior_messages: Any = None,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    resolved = resolve_agent_turn_request(turn_request)
    if not isinstance(resolved, AgentTurnRequest):
        raise ValueError("A valid AgentTurnRequest is required for local worker chat dispatch.")

    next_context = dict(context or {})
    next_metadata = bind_agent_turn_metadata(
        dict(metadata or {}),
        resolved,
        source="local_worker",
    )
    next_context["metadata"] = next_metadata
    return generate_chat_reply_with_provider_fallback(
        context=next_context,
        metadata=next_metadata,
        user_goal=resolved.message,
        system_prompt=system_prompt,
        prior_messages=prior_messages,
    )


def generate_chat_reply_stream_with_provider_fallback(
    context: Dict[str, Any],
    metadata: Dict[str, Any],
    user_goal: str,
    system_prompt: Optional[str],
    prior_messages: Any = None,
) -> Iterator[Dict[str, Any]]:
    attempted: list[str] = []
    last_error = "no provider credentials available"
    prefer_openai_chat = should_use_openai_chat_completions(context, metadata)
    requested_model = resolve_requested_model(context, metadata)
    requested_reasoning_effort = resolve_requested_reasoning_effort(context, metadata)
    credential_override = metadata.get("credentials") if isinstance(metadata.get("credentials"), dict) else None
    requested_tools = resolve_requested_tools(context, metadata)

    for provider in provider_order_for_run(context, metadata):
        attempted.append(provider)
        attempted_str = ",".join(attempted)
        provider_model = coerce_requested_model_for_provider(requested_model, provider)

        if provider == "codex_cli":
            streamed_parts: list[str] = []
            final_usage: Optional[Dict[str, Any]] = None
            final_model = provider_model
            for event in iter_openai_codex_backend_events(
                system_prompt,
                user_goal,
                model_override=provider_model,
                reasoning_effort_override=requested_reasoning_effort or None,
                prior_messages=prior_messages,
                credential_override=credential_override,
                tools=requested_tools,
            ):
                event_type = str(event.get("type") or "").strip().lower()
                if event_type == "delta":
                    delta = str(event.get("delta") or "")
                    if delta:
                        streamed_parts.append(delta)
                        yield {"type": "chunk", "delta": delta}
                    continue
                if event_type == "done":
                    final_usage = event.get("usage") if isinstance(event.get("usage"), dict) else None
                    final_model = str(event.get("model") or final_model or "").strip() or final_model
                    tool_calls = event.get("tool_calls") if isinstance(event.get("tool_calls"), list) else []
                    final_text = str(event.get("text") or "").strip() or "".join(streamed_parts).strip()
                    if final_text or tool_calls:
                        yield {
                            "type": "result",
                            "reply": final_text,
                            "usage_masked": build_usage_masked_from_provider("codex_cli", final_usage, final_model),
                            "provider": "codex_cli",
                            "model": final_model,
                            "attempted_providers": attempted_str,
                            "error": "",
                            "tool_calls": tool_calls,
                        }
                        return
                    last_error = f"{DIRECT_CHAT_TRANSPORT_UNAVAILABLE}: codex_cli_backend_unavailable: codex_empty_output"
                    break
                if event_type == "error":
                    final_model = str(event.get("model") or final_model or "").strip() or final_model
                    error_text = str(event.get("error") or "unknown_error").strip() or "unknown_error"
                    if streamed_parts:
                        yield {
                            "type": "result",
                            "reply": "".join(streamed_parts).strip(),
                            "usage_masked": build_usage_masked_from_provider("codex_cli", final_usage, final_model),
                            "provider": "codex_cli",
                            "model": final_model,
                            "attempted_providers": attempted_str,
                            "error": error_text,
                        }
                        return
                    last_error = f"{DIRECT_CHAT_TRANSPORT_UNAVAILABLE}: codex_cli_backend_unavailable: {error_text}"
                    break
            continue

        if provider == "claude_code_cli":
            text, usage, model, provider_error = anthropic_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
                credential_override=credential_override,
            )
            if text:
                yield {"type": "chunk", "delta": text}
                yield {
                    "type": "result",
                    "reply": text,
                    "usage_masked": build_usage_masked_from_provider("claude_code_cli", usage, model),
                    "provider": "claude_code_cli",
                    "model": model,
                    "attempted_providers": attempted_str,
                    "error": "",
                }
                return
            last_error = f"claude_code_cli generation failed: {provider_error or 'unknown_error'}"
            continue

        if provider == "openai":
            direct_auth_error = openai_direct_auth_error(context, metadata)
            if direct_auth_error:
                last_error = f"openai generation failed: {direct_auth_error}"
                continue
            text = ""
            usage: Optional[Dict[str, Any]] = None
            model = provider_model
            provider_error = ""
            if not prefer_openai_chat:
                text, usage, model, provider_error = openai_responses_text(
                    system_prompt,
                    user_goal,
                    model_override=provider_model,
                    prior_messages=prior_messages,
                )
            if not text:
                text, usage, model, provider_error = openai_chat_text(
                    system_prompt,
                    user_goal,
                    model_override=provider_model,
                    prior_messages=prior_messages,
                    provider="openai",
                    credential_override=credential_override,
                )
            if text:
                yield {"type": "chunk", "delta": text}
                yield {
                    "type": "result",
                    "reply": text,
                    "usage_masked": build_usage_masked_from_provider("openai", usage, model),
                    "provider": "openai",
                    "model": model,
                    "attempted_providers": attempted_str,
                    "error": "",
                }
                return
            last_error = f"openai generation failed: {provider_error or 'unknown_error'}"
            continue

        if provider in {"qwen", "deepseek", "mistral"}:
            text, usage, model, provider_error = openai_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
                provider=provider,
                credential_override=credential_override,
            )
            if text:
                yield {"type": "chunk", "delta": text}
                yield {
                    "type": "result",
                    "reply": text,
                    "usage_masked": build_usage_masked_from_provider(provider, usage, model),
                    "provider": provider,
                    "model": model,
                    "attempted_providers": attempted_str,
                    "error": "",
                }
                return
            last_error = f"{provider} generation failed: {provider_error or 'unknown_error'}"
            continue

        if provider == "anthropic":
            text, usage, model, provider_error = anthropic_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
                credential_override=credential_override,
            )
        elif provider == "gemini":
            text, usage, model, provider_error = gemini_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
            )
        elif provider == "ollama":
            text, usage, model, provider_error = ollama_chat_text(
                system_prompt,
                user_goal,
                model_override=provider_model,
                prior_messages=prior_messages,
            )
        else:
            continue
        if text:
            yield {"type": "chunk", "delta": text}
            yield {
                "type": "result",
                "reply": text,
                "usage_masked": build_usage_masked_from_provider(provider, usage, model),
                "provider": provider,
                "model": model,
                "attempted_providers": attempted_str,
                "error": "",
            }
            return
        if provider_error:
            last_error = f"{provider} generation failed: {provider_error}"
        else:
            last_error = f"{provider} generation failed"
    yield {
        "type": "failure",
        "attempted_providers": ",".join(attempted),
        "error": last_error,
    }
