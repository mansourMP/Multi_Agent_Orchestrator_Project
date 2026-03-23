from __future__ import annotations

import asyncio
import os
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple, Union

os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
import litellm
from litellm import acompletion, completion

from server_modules.provider_profiles import (
    PROVIDER_CATALOG,
    _build_provider_credential_candidates,
    _openai_bearer_from_credentials,
    normalize_provider_id,
    resolve_provider_adapter,
)
from server_modules.shared import PROFILES_LOCK, PROVIDER_PROFILES


litellm.set_verbose = False
if hasattr(litellm, "telemetry"):
    litellm.telemetry = False


DEFAULT_MODEL = "gpt-4o-mini"
MODEL_ALIASES = {
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4.1": "gpt-4.1",
    "gpt-4.1-mini": "gpt-4.1-mini",
    "claude-sonnet": "anthropic/claude-3-5-sonnet-20241022",
    "claude-haiku": "anthropic/claude-3-haiku-20240307",
    "gemini-flash": "gemini/gemini-2.0-flash",
    "gemini-pro": "gemini/gemini-1.5-pro",
    "vertex-gemini-flash": "vertex_ai/gemini-2.0-flash-001",
}
ALLOWED_MESSAGE_ROLES = {"system", "user", "assistant", "tool"}


def _profile_record(profile_id: Optional[str]) -> Optional[Dict[str, Any]]:
    token = str(profile_id or "").strip()
    if not token:
        return None
    with PROFILES_LOCK:
        raw = PROVIDER_PROFILES.get(token)
    return dict(raw) if isinstance(raw, dict) else None


def infer_provider(model_name: Optional[str], provider: Optional[str] = None, profile_id: Optional[str] = None) -> str:
    if provider:
        return normalize_provider_id(provider)
    profile = _profile_record(profile_id)
    if profile:
        return normalize_provider_id(profile.get("provider"))
    raw = str(model_name or "").strip().lower()
    if raw.startswith("anthropic/") or raw.startswith("claude"):
        return "anthropic"
    if raw.startswith("gemini/") or raw.startswith("gemini"):
        return "gemini"
    if raw.startswith("vertex_ai/") or raw.startswith("vertex"):
        return "vertex"
    return "openai"


def resolve_model(model_name: Optional[str], provider: Optional[str] = None, profile_id: Optional[str] = None) -> str:
    resolved_provider = infer_provider(model_name, provider=provider, profile_id=profile_id)
    raw = str(model_name or "").strip()
    if not raw:
        raw = str(PROVIDER_CATALOG.get(resolved_provider, {}).get("default_model") or DEFAULT_MODEL)
    raw = MODEL_ALIASES.get(raw, raw)
    if raw.startswith("openai/"):
        return raw.split("/", 1)[1]
    if "/" in raw:
        return raw
    if resolved_provider == "anthropic":
        return f"anthropic/{raw}"
    if resolved_provider == "gemini":
        return f"gemini/{raw}"
    if resolved_provider == "vertex":
        return f"vertex_ai/{raw}"
    return raw


def list_model_aliases() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    default_model_resolved = resolve_model(DEFAULT_MODEL)
    for alias, target in sorted(MODEL_ALIASES.items(), key=lambda item: item[0]):
        provider = infer_provider(target)
        provider_default_raw = str(PROVIDER_CATALOG.get(provider, {}).get("default_model") or "").strip() or None
        provider_default_resolved = resolve_model(provider_default_raw, provider=provider) if provider_default_raw else None
        resolved_target = resolve_model(alias, provider=provider)
        items.append(
            {
                "alias": alias,
                "provider": provider,
                "model": target,
                "resolved_model": resolved_target,
                "is_global_default": resolved_target == default_model_resolved,
                "is_provider_default": bool(provider_default_resolved and resolved_target == provider_default_resolved),
            }
        )
    return items


def normalize_messages(messages: List[Any]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for message in messages or []:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "user").strip().lower()
        if role not in ALLOWED_MESSAGE_ROLES:
            role = "user"
        content = message.get("content", "")
        if content is None:
            content = ""
        elif not isinstance(content, (str, list)):
            content = str(content)
        normalized.append({"role": role, "content": content})
    return normalized


def resolve_call_credentials(
    *,
    model: Optional[str] = None,
    provider: Optional[str] = None,
    workspace_id: Optional[str] = None,
    profile_id: Optional[str] = None,
    credential_id: Optional[str] = None,
) -> Dict[str, Any]:
    resolved_provider = infer_provider(model, provider=provider, profile_id=profile_id)
    profile = _profile_record(profile_id)
    candidates = _build_provider_credential_candidates(
        {
            "workspace_id": str(workspace_id or "default").strip() or "default",
            "credential_id": credential_id,
        },
        {
            "profile_id": str(profile_id or "").strip() or None,
        },
        resolved_provider,
    )
    candidate = candidates[0] if candidates else None
    preferred_model = (
        str(model or "").strip()
        or str((candidate or {}).get("model") or "").strip()
        or str((profile or {}).get("model") or "").strip()
        or str(PROVIDER_CATALOG.get(resolved_provider, {}).get("default_model") or DEFAULT_MODEL)
    )
    return {
        "provider": resolved_provider,
        "model": resolve_model(preferred_model, provider=resolved_provider, profile_id=profile_id),
        "credentials": (candidate or {}).get("credentials"),
        "candidate": candidate,
    }


def _response_field(payload: Any, key: str, default: Any = None) -> Any:
    if isinstance(payload, dict):
        return payload.get(key, default)
    return getattr(payload, key, default)


def _normalize_text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text:
                    parts.append(text)
        return "".join(parts)
    return ""


def _extract_text(response: Any) -> str:
    choices = _response_field(response, "choices", []) or []
    if isinstance(choices, list) and choices:
        first = choices[0]
        message = _response_field(first, "message", {}) or {}
        content = _response_field(message, "content")
        text = _normalize_text_content(content)
        if text:
            return text
        delta = _response_field(first, "delta", {}) or {}
        delta_text = _normalize_text_content(_response_field(delta, "content"))
        if delta_text:
            return delta_text
        direct_text = _response_field(first, "text", None)
        if isinstance(direct_text, str) and direct_text:
            return direct_text
    return ""


def _normalize_usage(response: Any) -> Dict[str, int]:
    usage = _response_field(response, "usage", {}) or {}
    prompt_tokens = int(_response_field(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(_response_field(usage, "completion_tokens", 0) or 0)
    total_tokens = int(_response_field(usage, "total_tokens", prompt_tokens + completion_tokens) or 0)
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def _message_text(message: Dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return "\n".join(parts).strip()
    return str(content).strip() if content is not None else ""


def _legacy_adapter_payload(messages: List[Any]) -> Tuple[str, str]:
    normalized = normalize_messages(messages)
    system_parts: List[str] = []
    user_parts: List[str] = []
    for message in normalized:
        text = _message_text(message)
        if not text:
            continue
        if message.get("role") == "system":
            system_parts.append(text)
        else:
            user_parts.append(text)
    return "\n\n".join(system_parts).strip(), "\n\n".join(user_parts).strip()


def _use_adapter_compat_fallback(provider: str, credentials: Optional[Dict[str, Any]]) -> bool:
    if provider != "vertex" or not isinstance(credentials, dict):
        return False
    return bool(str(credentials.get("access_token") or "").strip())


def _legacy_adapter_call(
    *,
    provider: str,
    messages: List[Any],
    model: str,
    credentials: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if not isinstance(credentials, dict):
        raise RuntimeError(f"No credential available for provider '{provider}'.")
    _, _, adapter = resolve_provider_adapter(provider, credentials=credentials)
    system_prompt, user_input = _legacy_adapter_payload(messages)
    adapter_model = model.split("/", 1)[1] if provider == "vertex" and "/" in model else model
    content = adapter.generate(system_prompt, user_input, adapter_model, credentials)
    return {
        "content": str(content or "").strip(),
        "model": model,
        "provider": provider,
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def _provider_kwargs(provider: str, credentials: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not credentials:
        return {}
    if provider == "openai":
        token = _openai_bearer_from_credentials(credentials)
        if not token:
            raise RuntimeError("OpenAI credential requires api_key or access_token.")
        extra_headers: Dict[str, str] = {}
        org_id = str(credentials.get("org_id") or "").strip()
        project_id = str(credentials.get("project_id") or "").strip()
        if org_id:
            extra_headers["OpenAI-Organization"] = org_id
        if project_id:
            extra_headers["OpenAI-Project"] = project_id
        kwargs: Dict[str, Any] = {"api_key": token}
        if extra_headers:
            kwargs["extra_headers"] = extra_headers
        return kwargs
    if provider == "anthropic":
        key = str(credentials.get("api_key") or "").strip()
        if not key:
            raise RuntimeError("Anthropic credential requires api_key.")
        return {"api_key": key}
    if provider == "gemini":
        key = str(credentials.get("api_key") or "").strip()
        if not key:
            raise RuntimeError("Gemini credential requires api_key.")
        return {"api_key": key}
    if provider == "vertex":
        raise RuntimeError("Vertex model routing is not wired through LiteLLM yet.")
    raise RuntimeError(f"Unsupported provider '{provider}'.")


def _base_completion_kwargs(
    *,
    messages: List[Any],
    model: Optional[str],
    provider: Optional[str],
    profile_id: Optional[str],
    credentials: Optional[Dict[str, Any]],
    max_tokens: int,
    temperature: float,
) -> Tuple[str, str, Dict[str, Any]]:
    resolved_provider = infer_provider(model, provider=provider, profile_id=profile_id)
    resolved_model = resolve_model(model, provider=resolved_provider, profile_id=profile_id)
    kwargs: Dict[str, Any] = {
        "model": resolved_model,
        "messages": normalize_messages(messages),
        "max_tokens": int(max_tokens),
        "temperature": float(temperature),
    }
    kwargs.update(_provider_kwargs(resolved_provider, credentials))
    return resolved_provider, resolved_model, kwargs


async def _stream_text(stream: Any) -> AsyncGenerator[str, None]:
    async for chunk in stream:
        text = _extract_text(chunk)
        if text:
            yield text


async def call_model(
    messages: List[Any],
    *,
    model: Optional[str] = None,
    provider: Optional[str] = None,
    profile_id: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    max_tokens: int = 2000,
    temperature: float = 0.7,
    stream: bool = False,
) -> Union[Dict[str, Any], AsyncGenerator[str, None]]:
    resolved_provider = infer_provider(model, provider=provider, profile_id=profile_id)
    resolved_model = resolve_model(model, provider=resolved_provider, profile_id=profile_id)
    if _use_adapter_compat_fallback(resolved_provider, credentials):
        if stream:
            raise RuntimeError(f"Streaming is not supported for provider '{resolved_provider}' with the current credential format.")
        return await asyncio.to_thread(
            _legacy_adapter_call,
            provider=resolved_provider,
            messages=messages,
            model=resolved_model,
            credentials=credentials,
        )
    resolved_provider, resolved_model, kwargs = _base_completion_kwargs(
        messages=messages,
        model=model,
        provider=provider,
        profile_id=profile_id,
        credentials=credentials,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    try:
        if stream:
            stream_response = await acompletion(stream=True, **kwargs)
            return _stream_text(stream_response)
        response = await acompletion(stream=False, **kwargs)
        return {
            "content": _extract_text(response),
            "model": resolved_model,
            "provider": resolved_provider,
            "usage": _normalize_usage(response),
        }
    except litellm.AuthenticationError as exc:
        raise ValueError(f"Invalid or missing credential for provider '{resolved_provider}'.") from exc
    except litellm.RateLimitError as exc:
        raise ValueError(f"Rate limit reached for '{resolved_model}'. Try again shortly or switch models.") from exc
    except litellm.BadRequestError as exc:
        raise ValueError(f"Bad request to '{resolved_model}': {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"Model call failed [{resolved_model}]: {exc}") from exc


def call_model_sync(
    messages: List[Any],
    *,
    model: Optional[str] = None,
    provider: Optional[str] = None,
    profile_id: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    max_tokens: int = 2000,
    temperature: float = 0.7,
) -> Dict[str, Any]:
    resolved_provider = infer_provider(model, provider=provider, profile_id=profile_id)
    resolved_model = resolve_model(model, provider=resolved_provider, profile_id=profile_id)
    if _use_adapter_compat_fallback(resolved_provider, credentials):
        return _legacy_adapter_call(
            provider=resolved_provider,
            messages=messages,
            model=resolved_model,
            credentials=credentials,
        )
    resolved_provider, resolved_model, kwargs = _base_completion_kwargs(
        messages=messages,
        model=model,
        provider=provider,
        profile_id=profile_id,
        credentials=credentials,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    try:
        response = completion(stream=False, **kwargs)
        return {
            "content": _extract_text(response),
            "model": resolved_model,
            "provider": resolved_provider,
            "usage": _normalize_usage(response),
        }
    except litellm.AuthenticationError as exc:
        raise ValueError(f"Invalid or missing credential for provider '{resolved_provider}'.") from exc
    except litellm.RateLimitError as exc:
        raise ValueError(f"Rate limit reached for '{resolved_model}'. Try again shortly or switch models.") from exc
    except litellm.BadRequestError as exc:
        raise ValueError(f"Bad request to '{resolved_model}': {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"Model call failed [{resolved_model}]: {exc}") from exc
