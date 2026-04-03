"""
Provider profile management, credential candidate resolution, and LLM provider adapters.

Extracted from server.py to reduce hotspot size.
All function signatures and behaviour are unchanged.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import base64
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set
from urllib.parse import quote_plus

from server_modules.usage_reporting import build_usage_record

# ---------------------------------------------------------------------------
# Imports from server.py globals – these must be supplied by the caller or
# looked-up at import time through the parent module.
# ---------------------------------------------------------------------------
# We import lazily from the parent server module to avoid circular imports.
# At module load time we cache the references we need.

_server = None  # populated by _init()


def _init():
    """Late-bind references to server.py globals.  Called once from __init__.py."""
    global _server
    if _server is not None:
        return
    import server as _s
    _server = _s


def _utc_now():
    _init()
    return _server._utc_now()


def _utc_now_iso():
    _init()
    return _server._utc_now_iso()


def _parse_utc_ts(raw):
    _init()
    return _server._parse_utc_ts(raw)


def _safe_write_json(path, payload):
    _init()
    return _server._safe_write_json(path, payload)


def _safe_read_json(path, fallback):
    _init()
    return _server._safe_read_json(path, fallback)


def _openai_bearer_from_credentials(credentials):
    _init()
    return _server._openai_bearer_from_credentials(credentials)


def _openai_env_bearer_with_source():
    _init()
    return _server._openai_env_bearer_with_source()


def http_json_request(url, **kwargs):
    _init()
    return _server.http_json_request(url, **kwargs)


def resolve_vault_credential(credential_id, workspace_id=None):
    _init()
    return _server.resolve_vault_credential(credential_id, workspace_id)


def resolve_default_vault_credential(provider, workspace_id=None):
    _init()
    return _server.resolve_default_vault_credential(provider, workspace_id)


def _validation_message(provider_label: str, response: Dict[str, Any]) -> str:
    status = int(response.get("status") or 500)
    payload = response.get("json")
    detail = ""
    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            detail = str(
                error_obj.get("message")
                or error_obj.get("detail")
                or error_obj.get("error")
                or ""
            ).strip()
        elif isinstance(error_obj, str):
            detail = error_obj.strip()
        if not detail:
            detail = str(
                payload.get("message")
                or payload.get("detail")
                or payload.get("error_description")
                or payload.get("title")
                or ""
            ).strip()
    if not detail:
        detail = str(response.get("text") or "").strip()
    if status == 200:
        return f"{provider_label} credential is valid."
    return detail or f"{provider_label} credential could not be verified (status {status})."


def _validation_result(provider_label: str, response: Dict[str, Any]) -> Dict[str, Any]:
    status = int(response.get("status") or 500)
    return {
        "ok": status == 200,
        "status": status,
        "message": _validation_message(provider_label, response),
    }


# ---------------------------------------------------------------------------
# Provider catalog (moved from server.py)
# ---------------------------------------------------------------------------

LEGACY_PROVIDER_ALIASES = {
    "claude_code_cli": "anthropic",
    "openai_codex": "openai-codex",
}

LOCAL_CLI_AUTH_MODES = {
    "local_cli",
    "local_subscription",
    "subscription_cli",
    "claude_code_cli",
}


PROVIDER_CATALOG = {
    "openai": {
        "label": "OpenAI",
        "auth": ["oauth_token", "access_token", "api_key"],
        "auth_modes": [
            {"id": "oauth_token", "label": "Saved OpenAI / Codex token", "secret_required": True},
            {"id": "access_token", "label": "OpenAI access token", "secret_required": True},
            {"id": "api_key", "label": "API Key", "secret_required": True},
        ],
        "default_auth_mode": "api_key",
        "default_model": "gpt-5.4",
        "note": "Direct OpenAI credentials only. Empyralis does not provide an in-product ChatGPT or Codex sign-in flow yet.",
    },
    "openai-codex": {
        "label": "OpenAI Codex",
        "auth": ["oauth_token"],
        "auth_modes": [
            {"id": "oauth_token", "label": "ChatGPT / Codex OAuth", "secret_required": True},
        ],
        "default_auth_mode": "oauth_token",
        "default_model": "gpt-5.4",
        "note": "ChatGPT / Codex OAuth session for the Codex transport.",
        "hidden": True,
    },
    "anthropic": {
        "label": "Anthropic",
        "auth": ["api_key", "local_cli"],
        "auth_modes": [
            {"id": "api_key", "label": "API Key", "secret_required": True},
            {"id": "local_cli", "label": "Claude Subscription", "secret_required": False},
        ],
        "default_auth_mode": "api_key",
        "default_model": "claude-3-5-sonnet-20241022",
        "note": "Use a direct Anthropic API key or the local Claude subscription already signed into the Claude CLI on this machine.",
    },
    "claude_code_cli": {
        "label": "Claude Code (Subscription)",
        "auth": ["local_subscription"],
        "auth_modes": [
            {"id": "local_cli", "label": "Claude Subscription", "secret_required": False},
        ],
        "default_auth_mode": "local_cli",
        "default_model": "sonnet",
        "alias_for": "anthropic",
        "hidden": True,
    },
    "gemini": {
        "label": "Google Gemini",
        "auth": ["api_key", "gemini_cli_oauth"],
        "auth_modes": [
            {"id": "api_key", "label": "API Key", "secret_required": True},
            {"id": "gemini_cli_oauth", "label": "Gemini CLI OAuth", "secret_required": False},
        ],
        "default_auth_mode": "api_key",
        "default_model": "gemini-1.5-flash",
        "note": "Direct Gemini API key or Gemini CLI OAuth.",
    },
    "vertex": {
        "label": "Google Vertex AI",
        "auth": ["access_token", "project_id", "location"],
        "auth_modes": [
            {"id": "access_token", "label": "Access Token", "secret_required": True},
        ],
        "default_auth_mode": "access_token",
        "default_model": "gemini-2.0-flash-001",
        "note": "Direct Vertex AI access token with project and region.",
    },
    "qwen": {
        "label": "Qwen",
        "auth": ["api_key"],
        "auth_modes": [
            {"id": "api_key", "label": "API Key", "secret_required": True},
        ],
        "default_auth_mode": "api_key",
        "default_model": "qwen-turbo",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen-turbo", "qwen-plus", "qwen-max"],
        "note": "Direct Qwen API key using Alibaba DashScope's OpenAI-compatible endpoint.",
    },
    "deepseek": {
        "label": "DeepSeek",
        "auth": ["api_key"],
        "auth_modes": [
            {"id": "api_key", "label": "API Key", "secret_required": True},
        ],
        "default_auth_mode": "api_key",
        "default_model": "deepseek-chat",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "note": "Direct DeepSeek API key using the OpenAI-compatible endpoint.",
    },
    "mistral": {
        "label": "Mistral",
        "auth": ["api_key"],
        "auth_modes": [
            {"id": "api_key", "label": "API Key", "secret_required": True},
        ],
        "default_auth_mode": "api_key",
        "default_model": "mistral-small-latest",
        "base_url": "https://api.mistral.ai/v1",
        "models": ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
        "note": "Direct Mistral API key using the OpenAI-compatible endpoint.",
    },
    "ollama": {
        "label": "Ollama",
        "auth": ["none"],
        "auth_modes": [
            {"id": "none", "label": "No auth required", "secret_required": False},
        ],
        "default_auth_mode": "none",
        "default_model": "llama3",
        "base_url": "http://localhost:11434/v1",
        "models": ["llama3", "mistral", "gemma", "phi3"],
        "note": "Local Ollama endpoint on this machine. No credential is required.",
    },
}


def normalize_provider_id(provider: Any) -> str:
    provider_id = str(provider or "").strip().lower()
    return LEGACY_PROVIDER_ALIASES.get(provider_id, provider_id)


def provider_catalog_entry(provider: Any) -> Dict[str, Any]:
    provider_id = normalize_provider_id(provider)
    return PROVIDER_CATALOG.get(provider_id, {})


def normalize_auth_mode(provider: Any, auth_mode: Any = None, credentials: Optional[Dict[str, Any]] = None) -> str:
    provider_id = str(provider or "").strip().lower()
    raw_auth_mode = str(
        auth_mode
        or (credentials or {}).get("auth_mode")
        or (credentials or {}).get("authMode")
        or ""
    ).strip().lower()
    if provider_id == "claude_code_cli":
        return "local_cli"
    if raw_auth_mode in LOCAL_CLI_AUTH_MODES:
        return "local_cli"
    if raw_auth_mode:
        return raw_auth_mode
    entry = provider_catalog_entry(provider_id)
    default_auth_mode = str(entry.get("default_auth_mode") or "").strip().lower()
    return default_auth_mode or ""


def provider_supports_auth_mode(provider: Any, auth_mode: Any) -> bool:
    entry = provider_catalog_entry(provider)
    supported = {str(mode).strip().lower() for mode in entry.get("auth", []) if str(mode).strip()}
    normalized = normalize_auth_mode(provider, auth_mode)
    if normalized == "local_cli":
        return bool({"local_cli", "local_subscription"} & supported) or str(provider).strip().lower() == "claude_code_cli"
    return normalized in supported if normalized else not supported


def provider_requires_credential(provider: Any, auth_mode: Any) -> bool:
    return normalize_auth_mode(provider, auth_mode) not in {"local_cli", "none"}


def secretless_provider_credentials(provider: Any, auth_mode: Any) -> Dict[str, Any]:
    provider_id = normalize_provider_id(provider)
    normalized_auth_mode = normalize_auth_mode(provider, auth_mode)
    credentials: Dict[str, Any] = {"auth_mode": normalized_auth_mode}
    if provider_id == "anthropic" and normalized_auth_mode == "local_cli":
        credentials["_provider"] = "anthropic"
    return credentials


def resolve_provider_adapter(provider: Any, credentials: Optional[Dict[str, Any]] = None) -> tuple[str, str, ProviderAdapter]:
    provider_id = normalize_provider_id(provider)
    auth_mode = normalize_auth_mode(provider, credentials=credentials)
    adapter_key = provider_id
    if provider_id == "anthropic" and auth_mode == "local_cli":
        adapter_key = "claude_code_cli"
    if provider_id == "openai-codex":
        adapter_key = "openai-codex"
    adapter = PROVIDER_ADAPTERS.get(adapter_key)
    if adapter is None:
        raise RuntimeError(f"Unsupported provider '{provider}'.")
    return provider_id, adapter_key, adapter

# ---------------------------------------------------------------------------
# Provider adapters (moved from server.py)
# ---------------------------------------------------------------------------

OPENAI_RESPONSES_URL = os.getenv("OPENAI_RESPONSES_URL", "https://api.openai.com/v1/responses")
OPENAI_ORG_ID = os.getenv("OPENAI_ORG_ID")
OPENAI_PROJECT_ID = os.getenv("OPENAI_PROJECT_ID")
OPENAI_CODEX_MODEL_CATALOG = [
    "gpt-5.4",
    "gpt-5.3-codex",
    "gpt-5.3-codex-spark",
    "gpt-5.2",
    "gpt-5.2-codex",
    "gpt-5.1-codex",
]
OPENAI_CODEX_DIRECT_AUTH_ERROR = (
    "This is a Codex OAuth token. Use openai-codex provider or set a direct OpenAI API key."
)
PROVIDER_LIVE_PROBE_PROMPT = "Reply with OK. Do not use tools."


class ProviderAdapter:
    provider_id = ""

    def validate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    def list_models(self, credentials: Dict[str, Any]) -> List[str]:
        raise NotImplementedError

    def generate(self, system_prompt: str, user_input: str, model: str, credentials: Dict[str, Any]) -> str:
        raise NotImplementedError

    def probe_model(self, credentials: Dict[str, Any]) -> str:
        _ = credentials
        entry = provider_catalog_entry(self.provider_id)
        return str(entry.get("default_model") or "").strip()

    def probe(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        selected_model = self.probe_model(credentials)
        if not selected_model:
            models = self.list_models(credentials)
            selected_model = str(models[0] if models else "").strip()
        if not selected_model:
            raise RuntimeError(f"No probe model available for provider '{self.provider_id}'.")
        reply = self.generate("", PROVIDER_LIVE_PROBE_PROMPT, selected_model, credentials)
        normalized_reply = str(reply or "").strip()
        if not normalized_reply:
            raise RuntimeError(f"{self.provider_id} probe returned empty output.")
        return {
            "ok": True,
            "status": 200,
            "message": "Live probe succeeded.",
            "model": selected_model,
            "reply": normalized_reply,
        }


def claude_code_cli_available() -> bool:
    return bool(shutil.which("claude"))


def gemini_cli_available() -> bool:
    return bool(shutil.which("gemini"))


def claude_code_cli_status(timeout: int = 15) -> Dict[str, Any]:
    if not claude_code_cli_available():
        return {
            "available": False,
            "logged_in": False,
            "message": "Claude Code CLI is not installed.",
        }
    try:
        result = subprocess.run(
            ["claude", "auth", "status", "--json"],
            capture_output=True,
            text=True,
            timeout=max(5, int(timeout)),
            check=False,
        )
    except Exception as exc:
        return {
            "available": True,
            "logged_in": False,
            "message": str(exc),
        }

    raw = str(result.stdout or result.stderr or "").strip()
    if result.returncode != 0:
        return {
            "available": True,
            "logged_in": False,
            "message": raw or f"Claude auth status failed with exit code {result.returncode}.",
        }
    try:
        payload = json.loads(raw) if raw else {}
    except Exception:
        payload = {}
    logged_in = bool(payload.get("loggedIn"))
    return {
        "available": True,
        "logged_in": logged_in,
        "auth_method": str(payload.get("authMethod") or "").strip(),
        "api_provider": str(payload.get("apiProvider") or "").strip(),
        "message": "Claude subscription is signed in on this machine." if logged_in else "Claude subscription is not signed in yet.",
    }


def run_claude_code_cli(system_prompt: str, user_input: str, model: str, timeout: int = 120) -> str:
    if not claude_code_cli_available():
        raise RuntimeError("Claude Code CLI is not installed.")

    selected_model = str(model or "sonnet").strip() or "sonnet"
    cmd = [
        "claude",
        "-p",
        "--output-format",
        "text",
        "--model",
        selected_model,
        "--system-prompt",
        system_prompt,
        user_input,
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=max(15, int(timeout)),
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Claude Code CLI timed out after {int(timeout)}s.") from exc
    except Exception as exc:
        raise RuntimeError(f"Claude Code CLI failed to start: {exc}") from exc

    if result.returncode != 0:
        detail = str(result.stderr or result.stdout or "").strip() or f"exit_{result.returncode}"
        if len(detail) > 500:
            detail = detail[:500] + "..."
        raise RuntimeError(detail)

    text = str(result.stdout or "").strip()
    if not text:
        raise RuntimeError("Claude Code CLI returned empty output.")
    return text


class OpenAIAdapter(ProviderAdapter):
    provider_id = "openai"

    def _uses_oauth_token(self, credentials: Dict[str, Any]) -> bool:
        auth_mode = str(credentials.get("auth_mode") or "").strip().lower()
        oauth_token = str(credentials.get("oauth_token") or "").strip()
        return auth_mode == "oauth_token" or (not auth_mode and bool(oauth_token))

    def _headers(self, credentials: Dict[str, Any]) -> Dict[str, str]:
        self._ensure_direct_api_credentials(credentials)
        token = _openai_bearer_from_credentials(credentials)
        if not token:
            raise RuntimeError("OpenAI credential requires api_key, access_token, or oauth_token.")
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        org_id = credentials.get("org_id") or OPENAI_ORG_ID
        project_id = credentials.get("project_id") or OPENAI_PROJECT_ID
        if org_id:
            headers["OpenAI-Organization"] = str(org_id)
        if project_id:
            headers["OpenAI-Project"] = str(project_id)
        return headers

    def _ensure_direct_api_credentials(self, credentials: Dict[str, Any]) -> None:
        if self._uses_oauth_token(credentials):
            raise RuntimeError(OPENAI_CODEX_DIRECT_AUTH_ERROR)

    def validate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        if self._uses_oauth_token(credentials):
            return {
                "ok": True,
                "status": 200,
                "message": "ChatGPT / Codex OAuth session imported.",
            }
        self._ensure_direct_api_credentials(credentials)
        res = http_json_request("https://api.openai.com/v1/models", headers=self._headers(credentials))
        return _validation_result("OpenAI", res)

    def list_models(self, credentials: Dict[str, Any]) -> List[str]:
        if self._uses_oauth_token(credentials):
            return list(OPENAI_CODEX_MODEL_CATALOG)
        self._ensure_direct_api_credentials(credentials)
        res = http_json_request("https://api.openai.com/v1/models", headers=self._headers(credentials))
        data = res.get("json", {}) or {}
        models = []
        for item in data.get("data", []) if isinstance(data.get("data"), list) else []:
            if isinstance(item, dict):
                model_id = item.get("id")
                if isinstance(model_id, str):
                    models.append(model_id)
        return sorted(set(models))

    def generate(self, system_prompt: str, user_input: str, model: str, credentials: Dict[str, Any]) -> str:
        from server_modules.model_router import call_model_sync

        self._ensure_direct_api_credentials(credentials)
        result = call_model_sync(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
            model=model,
            provider=self.provider_id,
            credentials=credentials,
        )
        return str(result.get("content") or "").strip()


class OpenAICompatibleAdapter(ProviderAdapter):
    def __init__(self, provider_id: str, provider_label: str, *, requires_auth: bool = True) -> None:
        self.provider_id = provider_id
        self.provider_label = provider_label
        self.requires_auth = requires_auth

    def _base_url(self, credentials: Dict[str, Any]) -> str:
        entry = provider_catalog_entry(self.provider_id)
        base_url = str(credentials.get("base_url") or entry.get("base_url") or "").strip().rstrip("/")
        if not base_url:
            raise RuntimeError(f"{self.provider_label} base URL is not configured.")
        return base_url

    def _headers(self, credentials: Dict[str, Any], *, include_content_type: bool = False) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if include_content_type:
            headers["Content-Type"] = "application/json"
        if not self.requires_auth:
            return headers
        token = str(
            credentials.get("api_key")
            or credentials.get("access_token")
            or credentials.get("oauth_token")
            or credentials.get("token")
            or ""
        ).strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        if not token:
            raise RuntimeError(f"{self.provider_label} api_key is required.")
        headers["Authorization"] = f"Bearer {token}"
        return headers

    def validate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        base_url = self._base_url(credentials)
        try:
            res = http_json_request(f"{base_url}/models", headers=self._headers(credentials))
        except Exception as exc:
            if self.provider_id == "ollama":
                raise RuntimeError(f"Ollama is not running at {base_url}") from exc
            raise
        return _validation_result(self.provider_label, res)

    def list_models(self, credentials: Dict[str, Any]) -> List[str]:
        res = http_json_request(f"{self._base_url(credentials)}/models", headers=self._headers(credentials))
        body = res.get("json") or {}
        models: List[str] = []
        for item in body.get("data", []) if isinstance(body.get("data"), list) else []:
            if not isinstance(item, dict):
                continue
            model_id = item.get("id")
            if isinstance(model_id, str) and model_id.strip():
                models.append(model_id.strip())
        if models:
            return sorted(set(models))
        entry = provider_catalog_entry(self.provider_id)
        fallback_models = [str(item).strip() for item in entry.get("models", []) if str(item).strip()]
        return fallback_models

    def generate(self, system_prompt: str, user_input: str, model: str, credentials: Dict[str, Any]) -> str:
        payload: Dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
            "temperature": 0.2,
        }
        if not str(system_prompt or "").strip():
            payload["messages"] = [{"role": "user", "content": user_input}]
        res = http_json_request(
            f"{self._base_url(credentials)}/chat/completions",
            method="POST",
            headers=self._headers(credentials, include_content_type=True),
            payload=payload,
            timeout=60,
        )
        body = res.get("json")
        if not isinstance(body, dict):
            raise RuntimeError(f"{self.provider_label} returned invalid response.")
        choices = body.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError(f"{self.provider_label} returned no choices.")
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
        if isinstance(content, str) and content.strip():
            return content.strip()
        raise RuntimeError(f"{self.provider_label} response did not include text content.")


def _urlsafe_b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("utf-8"))


def codex_account_id_from_token(token: Any) -> str:
    raw = str(token or "").strip()
    if not raw:
        return ""
    parts = raw.split(".")
    if len(parts) < 2:
        return ""
    try:
        payload = json.loads(_urlsafe_b64decode(parts[1]).decode("utf-8", "ignore"))
    except Exception:
        return ""
    auth_payload = payload.get("https://api.openai.com/auth")
    if isinstance(auth_payload, dict):
        account_id = str(auth_payload.get("chatgpt_account_id") or "").strip()
        if account_id:
            return account_id
    return str(payload.get("sub") or "").strip()


class OpenAICodexAdapter(ProviderAdapter):
    provider_id = "openai-codex"

    def _oauth_token(self, credentials: Dict[str, Any]) -> str:
        token = str(credentials.get("oauth_token") or credentials.get("access_token") or "").strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        if not token:
            raise RuntimeError("OpenAI Codex OAuth token is required.")
        return token

    def validate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        token = self._oauth_token(credentials)
        account_id = str(credentials.get("account_id") or "").strip() or codex_account_id_from_token(token)
        if not account_id:
            raise RuntimeError("OpenAI Codex OAuth token is missing a ChatGPT account id.")
        return {
            "ok": True,
            "status": 200,
            "message": "ChatGPT / Codex OAuth session imported.",
        }

    def list_models(self, credentials: Dict[str, Any]) -> List[str]:
        self._oauth_token(credentials)
        return list(OPENAI_CODEX_MODEL_CATALOG)

    def generate(self, system_prompt: str, user_input: str, model: str, credentials: Dict[str, Any]) -> str:
        _ = system_prompt, user_input, model, credentials
        raise RuntimeError("openai-codex uses the Codex transport and is not available through the direct adapter.")

    def probe(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        token = self._oauth_token(credentials)
        selected_model = self.probe_model(credentials) or "gpt-5.4"
        try:
            import sys
            from pathlib import Path

            scripts_dir = Path(__file__).resolve().parents[1] / "scripts"
            if str(scripts_dir) not in sys.path:
                sys.path.insert(0, str(scripts_dir))
            import orion_local_worker_llm as worker_llm  # type: ignore
        except Exception as exc:
            raise RuntimeError(f"Could not load Codex probe transport: {exc}") from exc

        text, _usage, used_model, error = worker_llm.openai_codex_backend_text(
            "",
            PROVIDER_LIVE_PROBE_PROMPT,
            model_override=selected_model,
            credential_override={
                "oauth_token": token,
                "account_id": str(credentials.get("account_id") or "").strip() or codex_account_id_from_token(token),
                "email": str(credentials.get("email") or "").strip(),
                "profile_name": str(credentials.get("profile_name") or "").strip(),
            },
        )
        if error:
            raise RuntimeError(str(error))
        reply = str(text or "").strip()
        if not reply:
            raise RuntimeError("openai-codex probe returned empty output.")
        return {
            "ok": True,
            "status": 200,
            "message": "Live probe succeeded.",
            "model": str(used_model or selected_model),
            "reply": reply,
        }


class AnthropicAdapter(ProviderAdapter):
    provider_id = "anthropic"
    _validate_model = "claude-3-5-sonnet-20241022"

    def _headers(self, credentials: Dict[str, Any]) -> Dict[str, str]:
        key = credentials.get("api_key") or ""
        if not key:
            raise RuntimeError("Anthropic api_key is required.")
        return {
            "x-api-key": str(key),
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

    def validate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        res = http_json_request(
            "https://api.anthropic.com/v1/messages",
            method="POST",
            headers=self._headers(credentials),
            payload={
                "model": self._validate_model,
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}],
            },
        )
        status = int(res.get("status") or 500)
        if status in {200, 400}:
            return {
                "ok": True,
                "status": status,
                "message": "Anthropic credential is valid.",
            }
        if status == 401:
            return {
                "ok": False,
                "status": status,
                "message": "Anthropic API key is invalid.",
            }
        raise RuntimeError(f"Anthropic credential validation failed with status {status}.")

    def list_models(self, credentials: Dict[str, Any]) -> List[str]:
        res = http_json_request("https://api.anthropic.com/v1/models", headers=self._headers(credentials))
        body = res.get("json") or {}
        out = []
        for item in body.get("data", []) if isinstance(body.get("data"), list) else []:
            if isinstance(item, dict):
                model_id = item.get("id")
                if isinstance(model_id, str):
                    out.append(model_id)
        return sorted(set(out))

    def generate(self, system_prompt: str, user_input: str, model: str, credentials: Dict[str, Any]) -> str:
        from server_modules.model_router import call_model_sync

        result = call_model_sync(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
            model=model,
            provider=self.provider_id,
            credentials=credentials,
            max_tokens=1024,
        )
        return str(result.get("content") or "").strip()


class ClaudeCodeCLIAdapter(ProviderAdapter):
    provider_id = "claude_code_cli"

    def validate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        _ = credentials  # Stored record exists for routing/selection; auth lives in the local Claude CLI session.
        status = claude_code_cli_status()
        if not status.get("available"):
            raise RuntimeError(status.get("message") or "Claude Code CLI is not installed.")
        if not status.get("logged_in"):
            return {
                "ok": False,
                "status": 401,
                "message": status.get("message") or "Claude subscription is not signed in yet.",
            }
        return {
            "ok": True,
            "status": 200,
            "message": status.get("message") or "Claude subscription is signed in on this machine.",
        }

    def list_models(self, credentials: Dict[str, Any]) -> List[str]:
        _ = credentials
        return ["sonnet", "opus"]

    def generate(self, system_prompt: str, user_input: str, model: str, credentials: Dict[str, Any]) -> str:
        _ = credentials
        return run_claude_code_cli(system_prompt, user_input, model or "sonnet", timeout=120)


class GeminiAdapter(ProviderAdapter):
    provider_id = "gemini"

    def _auth_params(self, credentials: Dict[str, Any]) -> Dict[str, str]:
        auth_mode = normalize_auth_mode(self.provider_id, credentials=credentials)
        access_token = str(credentials.get("access_token") or "").strip()
        if access_token.lower().startswith("bearer "):
            access_token = access_token[7:].strip()
        project_id = str(credentials.get("project_id") or "").strip()
        if auth_mode == "gemini_cli_oauth" or access_token:
            if not access_token:
                raise RuntimeError("Gemini CLI OAuth credential requires access_token.")
            if not project_id:
                raise RuntimeError("Gemini CLI OAuth credential requires project_id.")
            return {
                "mode": "oauth",
                "access_token": access_token,
                "project_id": project_id,
            }
        key = str(credentials.get("api_key") or "").strip()
        if not key:
            raise RuntimeError("Gemini api_key is required.")
        return {"mode": "api_key", "api_key": key}

    def validate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        auth = self._auth_params(credentials)
        if auth["mode"] == "oauth":
            res = http_json_request(
                "https://generativelanguage.googleapis.com/v1beta/models",
                headers={
                    "Authorization": f"Bearer {auth['access_token']}",
                    "x-goog-user-project": auth["project_id"],
                },
            )
        else:
            res = http_json_request(f"https://generativelanguage.googleapis.com/v1beta/models?key={quote_plus(auth['api_key'])}")
        return _validation_result("Gemini", res)

    def list_models(self, credentials: Dict[str, Any]) -> List[str]:
        auth = self._auth_params(credentials)
        if auth["mode"] == "oauth":
            res = http_json_request(
                "https://generativelanguage.googleapis.com/v1beta/models",
                headers={
                    "Authorization": f"Bearer {auth['access_token']}",
                    "x-goog-user-project": auth["project_id"],
                },
            )
        else:
            res = http_json_request(f"https://generativelanguage.googleapis.com/v1beta/models?key={quote_plus(auth['api_key'])}")
        body = res.get("json") or {}
        out = []
        for item in body.get("models", []) if isinstance(body.get("models"), list) else []:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            methods = item.get("supportedGenerationMethods", [])
            if not isinstance(name, str):
                continue
            if isinstance(methods, list) and "generateContent" not in methods:
                continue
            out.append(name.split("/")[-1])
        return sorted(set(out))

    def generate(self, system_prompt: str, user_input: str, model: str, credentials: Dict[str, Any]) -> str:
        from server_modules.model_router import call_model_sync

        result = call_model_sync(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
            model=model,
            provider=self.provider_id,
            credentials=credentials,
        )
        return str(result.get("content") or "").strip()


class VertexAdapter(ProviderAdapter):
    provider_id = "vertex"

    def _params(self, credentials: Dict[str, Any]):
        token = credentials.get("access_token") or ""
        project = credentials.get("project_id") or ""
        location = credentials.get("location") or "us-central1"
        if not token:
            raise RuntimeError("Vertex access_token is required.")
        if not project:
            raise RuntimeError("Vertex requires project_id and location")
        return str(token), str(project), str(location)

    def validate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        token, project, location = self._params(credentials)
        url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models"
        res = http_json_request(url, headers={"Authorization": f"Bearer {token}"})
        return _validation_result("Vertex", res)

    def list_models(self, credentials: Dict[str, Any]) -> List[str]:
        token, project, location = self._params(credentials)
        url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models"
        res = http_json_request(url, headers={"Authorization": f"Bearer {token}"})
        body = res.get("json") or {}
        out = []
        for item in body.get("models", []) if isinstance(body.get("models"), list) else []:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if isinstance(name, str):
                out.append(name.split("/")[-1])
        return sorted(set(out))

    def generate(self, system_prompt: str, user_input: str, model: str, credentials: Dict[str, Any]) -> str:
        token, project, location = self._params(credentials)
        url = (
            f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}"
            f"/publishers/google/models/{quote_plus(model)}:generateContent"
        )
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_input}]}],
        }
        res = http_json_request(
            url,
            method="POST",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            payload=payload,
            timeout=60,
        )
        body = res.get("json")
        if not isinstance(body, dict):
            raise RuntimeError("Vertex returned invalid response.")
        candidates = body.get("candidates")
        texts = []
        if isinstance(candidates, list):
            for cand in candidates:
                if not isinstance(cand, dict):
                    continue
                content = cand.get("content", {})
                if not isinstance(content, dict):
                    continue
                for part in content.get("parts", []) if isinstance(content.get("parts"), list) else []:
                    if isinstance(part, dict):
                        text = part.get("text")
                        if isinstance(text, str) and text.strip():
                            texts.append(text.strip())
        if texts:
            return "\n".join(texts)
        raise RuntimeError("Vertex response did not include text content.")


PROVIDER_ADAPTERS: Dict[str, ProviderAdapter] = {
    "openai": OpenAIAdapter(),
    "openai-codex": OpenAICodexAdapter(),
    "anthropic": AnthropicAdapter(),
    "claude_code_cli": ClaudeCodeCLIAdapter(),
    "gemini": GeminiAdapter(),
    "vertex": VertexAdapter(),
    "qwen": OpenAICompatibleAdapter("qwen", "Qwen"),
    "deepseek": OpenAICompatibleAdapter("deepseek", "DeepSeek"),
    "mistral": OpenAICompatibleAdapter("mistral", "Mistral"),
    "ollama": OpenAICompatibleAdapter("ollama", "Ollama", requires_auth=False),
}

# Approximate token pricing per 1K tokens; used only for masked telemetry.
PROVIDER_COST_PER_1K = {
    "openai": {"input": 0.0050, "output": 0.0150},
    "openai-codex": {"input": 0.0, "output": 0.0},
    "anthropic": {"input": 0.0030, "output": 0.0150},
    "claude_code_cli": {"input": 0.0, "output": 0.0},
    "gemini": {"input": 0.0010, "output": 0.0030},
    "vertex": {"input": 0.0010, "output": 0.0030},
    "qwen": {"input": 0.0, "output": 0.0},
    "deepseek": {"input": 0.0, "output": 0.0},
    "mistral": {"input": 0.0, "output": 0.0},
    "ollama": {"input": 0.0, "output": 0.0},
}


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def masked_cost_band(cost_usd: float) -> str:
    if cost_usd < 0.001:
        return "< $0.001"
    if cost_usd < 0.01:
        return "$0.001 - $0.01"
    if cost_usd < 0.05:
        return "$0.01 - $0.05"
    if cost_usd < 0.10:
        return "$0.05 - $0.10"
    return ">= $0.10"


def build_masked_usage(provider: str, model: str, input_text: str, output_text: str) -> Dict[str, Any]:
    input_tokens = estimate_tokens(input_text)
    output_tokens = estimate_tokens(output_text)
    usage = build_usage_record(
        provider,
        model,
        input_tokens,
        output_tokens,
        input_tokens + output_tokens,
    )
    if usage.get("estimated_cost_usd") is None:
        rates = PROVIDER_COST_PER_1K.get(provider, {"input": 0.0030, "output": 0.0100})
        cost_est = ((input_tokens / 1000.0) * rates["input"]) + ((output_tokens / 1000.0) * rates["output"])
        cost_est = round(cost_est, 6)
        usage["estimated_cost_usd"] = cost_est
        usage["cost_est_usd"] = cost_est
        usage["cost_band"] = masked_cost_band(cost_est)
    return usage


# ---------------------------------------------------------------------------
# Profile helpers (moved from server.py)
# ---------------------------------------------------------------------------

def _persist_provider_profiles():
    _init()
    _server.sync_acp_manager_paths(provider_profiles_path=_server.ORION_PROVIDER_PROFILES_FILE)
    _server.ACP_MANAGER._persist_provider_profiles()


def _load_provider_profiles():
    _init()
    with _server.PROFILES_LOCK:
        _server.sync_acp_manager_paths(provider_profiles_path=_server.ORION_PROVIDER_PROFILES_FILE)
        _server.ACP_MANAGER.reload_secondary_state()


def _profile_cooldown_seconds_for_error(raw_error: str) -> int:
    _init()
    lowered = raw_error.lower()
    if "401" in lowered or "403" in lowered or "api_key" in lowered or "unauthorized" in lowered:
        return max(60, _server.ORION_PROFILE_COOLDOWN_AUTH_SECONDS)
    if "429" in lowered or "rate limit" in lowered:
        return max(30, _server.ORION_PROFILE_COOLDOWN_RATE_LIMIT_SECONDS)
    return max(15, _server.ORION_PROFILE_COOLDOWN_TRANSIENT_SECONDS)


def _profile_ready(profile: Dict[str, Any], ref: Optional[datetime] = None) -> bool:
    if not bool(profile.get("enabled", True)):
        return False
    now = ref or _utc_now()
    cooldown_until = _parse_utc_ts(profile.get("cooldown_until"))
    if cooldown_until is None:
        return True
    return cooldown_until <= now


def _mark_profile_success(profile_id: str):
    _init()
    with _server.PROFILES_LOCK:
        profile = _server.PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            return
        profile["last_used_at"] = _utc_now_iso()
        profile["last_success_at"] = _utc_now_iso()
        profile["last_error"] = None
        profile["cooldown_until"] = None
        profile["success_count"] = int(profile.get("success_count", 0)) + 1
        profile["updated_at"] = _utc_now_iso()
        _server.PROVIDER_PROFILES[profile_id] = profile
    _persist_provider_profiles()


def _mark_profile_failure(profile_id: str, error_text: str):
    _init()
    cooldown_seconds = _profile_cooldown_seconds_for_error(error_text)
    cooldown_until = (_utc_now() + timedelta(seconds=cooldown_seconds)).isoformat().replace("+00:00", "Z")
    with _server.PROFILES_LOCK:
        profile = _server.PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            return
        profile["last_error"] = error_text[:1200]
        profile["last_failure_at"] = _utc_now_iso()
        profile["failure_count"] = int(profile.get("failure_count", 0)) + 1
        profile["cooldown_until"] = cooldown_until
        profile["updated_at"] = _utc_now_iso()
        _server.PROVIDER_PROFILES[profile_id] = profile
    _persist_provider_profiles()


def _sorted_profiles(provider: str, workspace_id: Optional[str], preferred_profile_id: Optional[str] = None) -> List[Dict[str, Any]]:
    _init()
    requested_ws = str(workspace_id or "default").strip() or "default"
    provider_id = normalize_provider_id(provider)
    preferred = str(preferred_profile_id or "").strip()
    with _server.PROFILES_LOCK:
        values = [dict(item) for item in _server.PROVIDER_PROFILES.values() if isinstance(item, dict)]
    filtered: List[Dict[str, Any]] = []
    now = _utc_now()
    for profile in values:
        if normalize_provider_id(profile.get("provider")) != provider_id:
            continue
        profile_ws = str(profile.get("workspace_id") or "default").strip() or "default"
        if profile_ws != requested_ws:
            continue
        if not _profile_ready(profile, now):
            continue
        filtered.append(profile)
    filtered.sort(key=lambda p: (0 if str(p.get("id") or "") == preferred else 1, int(p.get("priority", 100)), str(p.get("created_at") or "")))
    return filtered


def _build_provider_credential_candidates(context: Dict[str, Any], metadata: Dict[str, Any], provider: str) -> List[Dict[str, Any]]:
    _init()
    workspace_id = str(context.get("workspace_id") or metadata.get("workspace_id") or "default").strip() or "default"
    credential_id = context.get("credential_id") or metadata.get("credential_id")
    canonical_provider = normalize_provider_id(provider)
    candidates: List[Dict[str, Any]] = []
    seen_labels: Set[str] = set()

    if credential_id:
        credentials = resolve_vault_credential(str(credential_id), workspace_id)
        candidates.append(
            {
                "source": "credential_id",
                "credentials": credentials,
                "profile_id": None,
                "label": f"credential:{credential_id}",
            }
        )
        seen_labels.add(f"credential:{credential_id}")

    if isinstance(metadata.get("credentials"), dict) and metadata.get("credentials"):
        candidates.append(
            {
                "source": "inline",
                "credentials": metadata.get("credentials"),
                "profile_id": None,
                "label": "inline",
            }
        )
        seen_labels.add("inline")

    profile_id = str(metadata.get("profile_id") or "").strip()
    profiles = _sorted_profiles(canonical_provider, workspace_id, profile_id if profile_id else None)
    for profile in profiles:
        pid = str(profile.get("id") or "").strip()
        cid = str(profile.get("credential_id") or "").strip()
        profile_auth_mode = normalize_auth_mode(profile.get("provider") or canonical_provider, profile.get("auth_mode"))
        if not pid or not cid:
            if not pid or provider_requires_credential(profile.get("provider") or canonical_provider, profile_auth_mode):
                continue
        label = f"profile:{pid}"
        if label in seen_labels:
            continue
        if cid:
            try:
                credentials = resolve_vault_credential(cid, workspace_id)
            except Exception as exc:
                _mark_profile_failure(pid, f"Credential resolution failed: {exc}")
                continue
        else:
            credentials = secretless_provider_credentials(profile.get("provider") or canonical_provider, profile_auth_mode)
        candidates.append(
            {
                "source": "profile",
                "credentials": credentials,
                "profile_id": pid,
                "label": label,
                "model": profile.get("model"),
            }
        )
        seen_labels.add(label)

    if canonical_provider == "openai":
        try:
            fallback = resolve_default_vault_credential("openai", workspace_id)
            if "vault-default" not in seen_labels:
                candidates.append(
                    {
                        "source": "vault_default",
                        "credentials": fallback,
                        "profile_id": None,
                        "label": "vault-default",
                    }
                )
                seen_labels.add("vault-default")
        except Exception:
            pass
        env_key, _ = _openai_env_bearer_with_source()
        if env_key and "env-openai" not in seen_labels:
            candidates.append(
                {
                    "source": "env",
                    "credentials": {
                        "access_token": env_key,
                        "org_id": OPENAI_ORG_ID,
                        "project_id": OPENAI_PROJECT_ID,
                    },
                    "profile_id": None,
                    "label": "env-openai",
                }
            )
            seen_labels.add("env-openai")

    if canonical_provider == "openai-codex":
        try:
            fallback = resolve_default_vault_credential("openai-codex", workspace_id)
            if "vault-default-codex" not in seen_labels:
                candidates.append(
                    {
                        "source": "vault_default",
                        "credentials": fallback,
                        "profile_id": None,
                        "label": "vault-default-codex",
                    }
                )
                seen_labels.add("vault-default-codex")
        except Exception:
            pass

    if canonical_provider == "anthropic":
        env_key = str(os.getenv("ANTHROPIC_API_KEY") or "").strip()
        if env_key and "env-anthropic" not in seen_labels:
            candidates.append(
                {
                    "source": "env",
                    "credentials": {
                        "api_key": env_key,
                    },
                    "profile_id": None,
                    "label": "env-anthropic",
                }
            )
            seen_labels.add("env-anthropic")

    if canonical_provider == "anthropic" and claude_code_cli_available() and "local-claude-cli" not in seen_labels:
        candidates.append(
            {
                "source": "local_cli",
                "credentials": secretless_provider_credentials("anthropic", "local_cli"),
                "profile_id": None,
                "label": "local-claude-cli",
            }
        )
        seen_labels.add("local-claude-cli")

    if canonical_provider == "gemini":
        env_key = str(os.getenv("GEMINI_API_KEY") or "").strip()
        if env_key and "env-gemini" not in seen_labels:
            candidates.append(
                {
                    "source": "env",
                    "credentials": {
                        "api_key": env_key,
                    },
                    "profile_id": None,
                    "label": "env-gemini",
                }
            )
            seen_labels.add("env-gemini")

    if canonical_provider == "qwen":
        env_key = str(
            os.getenv("ORION_LOCAL_WORKER_QWEN_API_KEY")
            or os.getenv("QWEN_API_KEY")
            or os.getenv("DASHSCOPE_API_KEY")
            or ""
        ).strip()
        if env_key and "env-qwen" not in seen_labels:
            candidates.append(
                {
                    "source": "env",
                    "credentials": {"api_key": env_key},
                    "profile_id": None,
                    "label": "env-qwen",
                }
            )
            seen_labels.add("env-qwen")

    if canonical_provider == "deepseek":
        env_key = str(
            os.getenv("ORION_LOCAL_WORKER_DEEPSEEK_API_KEY")
            or os.getenv("DEEPSEEK_API_KEY")
            or ""
        ).strip()
        if env_key and "env-deepseek" not in seen_labels:
            candidates.append(
                {
                    "source": "env",
                    "credentials": {"api_key": env_key},
                    "profile_id": None,
                    "label": "env-deepseek",
                }
            )
            seen_labels.add("env-deepseek")

    if canonical_provider == "mistral":
        env_key = str(
            os.getenv("ORION_LOCAL_WORKER_MISTRAL_API_KEY")
            or os.getenv("MISTRAL_API_KEY")
            or ""
        ).strip()
        if env_key and "env-mistral" not in seen_labels:
            candidates.append(
                {
                    "source": "env",
                    "credentials": {"api_key": env_key},
                    "profile_id": None,
                    "label": "env-mistral",
                }
            )
            seen_labels.add("env-mistral")

    if canonical_provider == "ollama" and "local-ollama" not in seen_labels:
        candidates.append(
            {
                "source": "local",
                "credentials": secretless_provider_credentials("ollama", "none"),
                "profile_id": None,
                "label": "local-ollama",
            }
        )
        seen_labels.add("local-ollama")

    return candidates
