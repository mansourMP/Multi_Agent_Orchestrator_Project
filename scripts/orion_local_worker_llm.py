from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

SUPPORTED_PROVIDERS = ("codex_cli", "claude_code_cli", "openai", "anthropic", "gemini", "ollama")
LOCAL_CLI_AUTH_MODES = {"local_cli", "local_subscription", "subscription_cli", "claude_code_cli"}
PROVIDER_COST_PER_1K = {
    "codex_cli": {"input": 0.0, "output": 0.0},
    "claude_code_cli": {"input": 0.0, "output": 0.0},
    "openai": {"input": 0.0030, "output": 0.0100},
    "anthropic": {"input": 0.0030, "output": 0.0150},
    "gemini": {"input": 0.0010, "output": 0.0030},
    "ollama": {"input": 0.0, "output": 0.0},
}
AUTH_SCOPE_ERROR_MARKERS = (
    "api.responses.write",
    "missing scopes",
    "missing required scope",
    "insufficient scope",
    "insufficient permissions",
)


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
    auth_file = Path(
        os.getenv("CODEX_AUTH_FILE", str(Path.home() / ".codex" / "auth.json"))
    ).expanduser()
    return [
        os.getenv("ORION_LOCAL_WORKER_OPENAI_TOKEN"),
        os.getenv("CODEX_OAUTH_TOKEN"),
        os.getenv("OPENAI_OAUTH_TOKEN"),
        os.getenv("OPENAI_ACCESS_TOKEN"),
        codex_token_from_vault(auth_file),
    ]


def _openai_api_key_candidates() -> list[Any]:
    if _openai_api_key_disabled():
        return []
    return [
        os.getenv("ORION_LOCAL_WORKER_OPENAI_API_KEY"),
        os.getenv("OPENAI_API_KEY"),
    ]


def get_openai_bearer_token() -> str:
    disable_api_key = str(os.getenv("ORION_DISABLE_OPENAI_API_KEY", "0")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    auth_mode = _openai_auth_mode()
    oauth_candidates = _openai_oauth_candidates()
    api_key_candidates = [] if disable_api_key else _openai_api_key_candidates()
    if auth_mode == "api_key":
        # In api_key mode, prefer API keys first, then OAuth/Codex token fallback.
        return _first_valid_token(api_key_candidates + oauth_candidates)
    # Default/codex mode: prefer OAuth/Codex token, then API key fallback.
    return _first_valid_token(oauth_candidates + api_key_candidates)


def get_openai_api_key() -> str:
    api_key = _first_valid_token(_openai_api_key_candidates())
    if api_key:
        return api_key
    return get_openai_bearer_token().strip()


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
        return bool(get_openai_bearer_token())
    if pid == "anthropic":
        return bool(get_anthropic_api_key())
    if pid == "gemini":
        return bool(get_gemini_api_key())
    if pid == "ollama":
        return ollama_enabled()
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


def should_use_openai_chat_completions(context: Dict[str, Any], metadata: Dict[str, Any]) -> bool:
    requested_mode = requested_auth_mode(context, metadata)
    if requested_mode == "oauth_token":
        return True
    return _openai_auth_mode() == "codex"


def resolve_requested_provider(context: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    raw_provider = str(context.get("provider") or metadata.get("provider") or "").strip().lower()
    auth_mode = requested_auth_mode(context, metadata)
    if raw_provider == "claude_code_cli":
        return "claude_code_cli"
    if raw_provider == "anthropic" and auth_mode in LOCAL_CLI_AUTH_MODES:
        return "claude_code_cli"
    return raw_provider


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


def openai_chat_json(system_prompt: str, user_prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    api_key = get_openai_api_key()
    if not api_key:
        return None, None, "", "missing_api_key"

    model = (os.getenv("ORION_LOCAL_WORKER_OPENAI_MODEL") or "gpt-4.1").strip() or "gpt-4.1"
    temperature = to_float(os.getenv("ORION_LOCAL_WORKER_TEMPERATURE"), 0.2)
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    base_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_OPENAI_URL") or "https://api.openai.com/v1")

    payload = {
        "model": model,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
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


def openai_responses_text(system_prompt: str, user_prompt: str) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    token = get_openai_bearer_token()
    if not token:
        return "", None, "", "missing_api_key"

    model = (
        os.getenv("ORION_LOCAL_WORKER_OPENAI_MODEL")
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
        "instructions": system_prompt,
        "input": user_prompt,
    }
    req = urllib.request.Request(
        url=api_url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
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


def codex_exec_text(system_prompt: str, user_prompt: str) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    if not codex_cli_available():
        return "", None, "codex", "codex_cli_not_found"

    timeout_seconds = max(15, to_int(os.getenv("ORION_LOCAL_WORKER_CODEX_TIMEOUT_SECONDS"), 90))
    model = (os.getenv("ORION_LOCAL_WORKER_CODEX_MODEL") or "").strip()

    prompt = (
        f"{system_prompt}\n\n"
        "Respond directly to the user request with practical, concise output.\n\n"
        f"User request:\n{user_prompt}"
    )

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
        return "", None, model or "codex", "codex_timeout"
    except Exception as exc:
        return "", None, model or "codex", f"codex_exec_error: {exc}"
    finally:
        try:
            Path(out_path).unlink(missing_ok=True)
        except Exception:
            pass


def codex_exec_json(system_prompt: str, user_prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    prompt = (
        f"{user_prompt}\n\n"
        'Return strictly valid JSON only with keys: "summary", "content_plan", "next_steps".'
    )
    text, usage, model, err = codex_exec_text(system_prompt, prompt)
    if not text:
        return None, usage, model, err or "codex_empty_output"
    parsed = parse_json_object_loose(text)
    if not isinstance(parsed, dict):
        return None, usage, model, "codex_invalid_json_content"
    return parsed, usage, model, ""


def claude_code_exec_text(system_prompt: str, user_prompt: str) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    if not claude_code_cli_available():
        return "", None, "sonnet", "claude_code_cli_not_found"

    timeout_seconds = max(15, to_int(os.getenv("ORION_LOCAL_WORKER_CLAUDE_CODE_TIMEOUT_SECONDS"), 120))
    model = (os.getenv("ORION_LOCAL_WORKER_CLAUDE_CODE_MODEL") or "sonnet").strip() or "sonnet"
    cmd = [
        "claude",
        "-p",
        "--output-format",
        "text",
        "--model",
        model,
        "--system-prompt",
        system_prompt,
        user_prompt,
    ]

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


def claude_code_exec_json(system_prompt: str, user_prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    prompt = (
        f"{user_prompt}\n\n"
        'Return strictly valid JSON only with keys: "summary", "content_plan", "next_steps".'
    )
    text, usage, model, err = claude_code_exec_text(system_prompt, prompt)
    if not text:
        return None, usage, model, err or "claude_code_empty_output"
    parsed = parse_json_object_loose(text)
    if not isinstance(parsed, dict):
        return None, usage, model, "claude_code_invalid_json_content"
    return parsed, usage, model, ""


def anthropic_chat_json(system_prompt: str, user_prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    api_key = get_anthropic_api_key()
    if not api_key:
        return None, None, "", "missing_api_key"

    model = (os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_MODEL") or "claude-3-5-sonnet-20241022").strip() or "claude-3-5-sonnet-20241022"
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    max_tokens = max(256, to_int(os.getenv("ORION_LOCAL_WORKER_MAX_TOKENS"), 1200))
    api_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_ANTHROPIC_URL") or "https://api.anthropic.com")
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
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


def gemini_chat_json(system_prompt: str, user_prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    api_key = get_gemini_api_key()
    if not api_key:
        return None, None, "", "missing_api_key"

    model = (os.getenv("ORION_LOCAL_WORKER_GEMINI_MODEL") or "gemini-2.0-flash").strip() or "gemini-2.0-flash"
    timeout_seconds = max(10, to_int(os.getenv("ORION_LOCAL_WORKER_LLM_TIMEOUT_SECONDS"), 45))
    api_url = ensure_trailing_slashless(os.getenv("ORION_LOCAL_WORKER_GEMINI_URL") or "https://generativelanguage.googleapis.com/v1beta")
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
    }
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


def ollama_chat_json(system_prompt: str, user_prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    if not ollama_enabled():
        return None, None, "", "ollama_disabled"

    model = (os.getenv("ORION_LOCAL_WORKER_OLLAMA_MODEL") or "llama3.1:8b").strip() or "llama3.1:8b"
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
        "system": system_prompt,
        "prompt": user_prompt,
        "options": {"temperature": temperature, "num_predict": num_predict},
    }
    req = urllib.request.Request(
        url=f"{api_url}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw)
        content = parsed.get("response") if isinstance(parsed, dict) else None
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


def get_provider_token_rates(provider: str) -> Tuple[float, float]:
    pid = str(provider or "").strip().lower()
    default_rates = PROVIDER_COST_PER_1K.get(pid, {"input": 0.0, "output": 0.0})
    base_input = to_float(default_rates.get("input"), 0.0) / 1000.0
    base_output = to_float(default_rates.get("output"), 0.0) / 1000.0

    provider_prefix = f"ORION_LOCAL_WORKER_{pid.upper()}"
    in_override = os.getenv(f"{provider_prefix}_INPUT_COST_PER_TOKEN_USD")
    out_override = os.getenv(f"{provider_prefix}_OUTPUT_COST_PER_TOKEN_USD")
    generic_in = os.getenv("ORION_LOCAL_WORKER_INPUT_COST_PER_TOKEN_USD")
    generic_out = os.getenv("ORION_LOCAL_WORKER_OUTPUT_COST_PER_TOKEN_USD")

    input_rate = to_float(in_override if in_override is not None else generic_in, base_input)
    output_rate = to_float(out_override if out_override is not None else generic_out, base_output)
    return max(0.0, input_rate), max(0.0, output_rate)


def build_usage_masked(provider: str, model: str, input_tokens: int, output_tokens: int, total_tokens: int) -> Dict[str, Any]:
    in_rate, out_rate = get_provider_token_rates(provider)
    cost_est = (max(0, input_tokens) * in_rate) + (max(0, output_tokens) * out_rate)
    if cost_est <= 0:
        band = "$0.00"
    elif cost_est < 0.01:
        band = "$0.00 - $0.01"
    elif cost_est < 0.05:
        band = "$0.01 - $0.05"
    else:
        band = "$0.05+"
    return {
        "provider": str(provider or "local_companion"),
        "model": model or "unknown-model",
        "input_tokens_est": max(0, input_tokens),
        "output_tokens_est": max(0, output_tokens),
        "total_tokens_est": max(0, total_tokens),
        "cost_est_usd": round(cost_est, 6),
        "cost_band": band,
    }


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

    base = list(requested_order)
    if provider_hint and provider_hint != "auto" and provider_hint in SUPPORTED_PROVIDERS and provider_hint not in base:
        base.insert(0, provider_hint)
    if context_provider in SUPPORTED_PROVIDERS and context_provider not in base:
        base.insert(0, context_provider)

    for pid in SUPPORTED_PROVIDERS:
        if pid not in base:
            base.append(pid)
    if auth_mode == "codex" and prefer_direct_openai and "openai" in base and provider_has_key("openai"):
        ordered: list[str] = ["openai"]
        if use_codex_cli and "codex_cli" in base and provider_has_key("codex_cli"):
            ordered.append("codex_cli")
        ordered.extend(pid for pid in base if pid not in ordered)
        base = ordered
    elif use_codex_cli and auth_mode == "codex" and "codex_cli" in base:
        base = ["codex_cli"] + [pid for pid in base if pid != "codex_cli"]

    fallback_enabled = str(os.getenv("ORION_LOCAL_WORKER_PROVIDER_FALLBACK", "1")).strip().lower() not in {"0", "false", "no", "off"}
    if provider_hint and provider_hint != "auto" and provider_hint in SUPPORTED_PROVIDERS and not fallback_enabled:
        return [provider_hint] if provider_has_key(provider_hint) else []

    return [pid for pid in base if provider_has_key(pid)]


def generate_pack_with_provider_fallback(
    context: Dict[str, Any],
    metadata: Dict[str, Any],
    system_prompt: str,
    user_prompt: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    attempted: list[str] = []
    last_error = "no provider credentials available"
    for provider in provider_order_for_run(context, metadata):
        attempted.append(provider)
        if provider == "codex_cli":
            result, usage, model, provider_error = codex_exec_json(system_prompt, user_prompt)
        elif provider == "claude_code_cli":
            result, usage, model, provider_error = claude_code_exec_json(system_prompt, user_prompt)
        elif provider == "openai":
            result, usage, model, provider_error = openai_chat_json(system_prompt, user_prompt)
        elif provider == "anthropic":
            result, usage, model, provider_error = anthropic_chat_json(system_prompt, user_prompt)
        elif provider == "gemini":
            result, usage, model, provider_error = gemini_chat_json(system_prompt, user_prompt)
        elif provider == "ollama":
            result, usage, model, provider_error = ollama_chat_json(system_prompt, user_prompt)
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
    system_prompt: str,
) -> Tuple[str, Optional[Dict[str, Any]], str, str]:
    attempted: list[str] = []
    last_error = "no provider credentials available"
    prefer_openai_chat = should_use_openai_chat_completions(context, metadata)
    for provider in provider_order_for_run(context, metadata):
        attempted.append(provider)
        if provider == "codex_cli":
            text, usage, model, provider_error = codex_exec_text(system_prompt, user_goal)
            if text:
                return (
                    text,
                    build_usage_masked_from_provider("codex_cli", usage, model),
                    ",".join(attempted),
                    "",
                )
            last_error = f"codex_cli generation failed: {provider_error or 'unknown_error'}"
            continue
        if provider == "claude_code_cli":
            text, usage, model, provider_error = claude_code_exec_text(system_prompt, user_goal)
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
            provider_error = ""
            if not prefer_openai_chat:
                text, usage, model, provider_error = openai_responses_text(system_prompt, user_goal)
                if text:
                    return (
                        text,
                        build_usage_masked_from_provider("openai", usage, model),
                        ",".join(attempted),
                        "",
                    )
            # Fallback to chat-completions JSON wrapper if responses fails.
            json_prompt = (
                f"User goal:\n{user_goal}\n\n"
                "Return JSON only: {\"reply\":\"short helpful assistant reply\"}."
            )
            result, usage_json, model_json, provider_error_json = openai_chat_json(system_prompt, json_prompt)
            if isinstance(result, dict):
                reply = str(result.get("reply") or result.get("summary") or "").strip()
                if reply:
                    return (
                        reply,
                        build_usage_masked_from_provider("openai", usage_json, model_json),
                        ",".join(attempted),
                        "",
                    )
            last_error = (
                f"openai generation failed: {provider_error or provider_error_json or 'unknown_error'}"
            )
            continue
        if provider == "anthropic":
            prompt = (
                f"User goal:\n{user_goal}\n\n"
                "Return JSON only: {\"reply\":\"short helpful assistant reply\"}."
            )
            result, usage, model, provider_error = anthropic_chat_json(system_prompt, prompt)
        elif provider == "gemini":
            prompt = (
                f"User goal:\n{user_goal}\n\n"
                "Return JSON only: {\"reply\":\"short helpful assistant reply\"}."
            )
            result, usage, model, provider_error = gemini_chat_json(system_prompt, prompt)
        elif provider == "ollama":
            prompt = (
                f"User goal:\n{user_goal}\n\n"
                "Return JSON only: {\"reply\":\"short helpful assistant reply\"}."
            )
            result, usage, model, provider_error = ollama_chat_json(system_prompt, prompt)
        else:
            continue
        if isinstance(result, dict):
            reply = str(result.get("reply") or result.get("summary") or "").strip()
            if reply:
                return reply, build_usage_masked_from_provider(provider, usage, model), ",".join(attempted), ""
        if provider_error:
            last_error = f"{provider} generation failed: {provider_error}"
        else:
            last_error = f"{provider} generation failed"
    return "", None, ",".join(attempted), last_error
