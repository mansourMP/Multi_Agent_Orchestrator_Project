from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple


def _json_request(url: str, payload: Dict[str, Any], headers: Dict[str, str] | None = None, timeout: int = 60) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8", "ignore")
    parsed = json.loads(raw)
    return parsed if isinstance(parsed, dict) else {}


def _json_get(url: str, headers: Dict[str, str] | None = None, timeout: int = 10) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8", "ignore")
    parsed = json.loads(raw)
    return parsed if isinstance(parsed, dict) else {}


def _ollama_available(endpoint: str) -> bool:
    try:
        _json_get(f"{endpoint.rstrip('/')}/api/tags")
        return True
    except Exception:
        return False


def _provider_order(config: Dict[str, Any]) -> List[str]:
    explicit_provider = str(config.get("model_provider") or "").strip().lower()
    if explicit_provider:
        order = [explicit_provider]
        for provider in ["openai", "anthropic", "gemini"]:
            if provider != explicit_provider:
                order.append(provider)
        return order
    cloud = config.get("cloud") if isinstance(config.get("cloud"), dict) else {}
    raw = cloud.get("provider_order")
    if isinstance(raw, list):
        order = [str(item or "").strip().lower() for item in raw if str(item or "").strip()]
        if order:
            return order
    return ["openai", "anthropic", "gemini"]


def resolve_model_target(vlm_config: Dict[str, Any]) -> Dict[str, str]:
    preference = str(vlm_config.get("preference") or "local").strip().lower() or "local"
    ollama_cfg = vlm_config.get("ollama") if isinstance(vlm_config.get("ollama"), dict) else {}
    endpoint = str(ollama_cfg.get("endpoint") or "http://127.0.0.1:11434").strip()
    local_available = bool(endpoint) and _ollama_available(endpoint)
    cloud_available: List[Tuple[str, str]] = []
    cloud_cfg = vlm_config.get("cloud") if isinstance(vlm_config.get("cloud"), dict) else {}
    if str(os.getenv("OPENAI_API_KEY") or "").strip():
        cloud_available.append(("openai", str(cloud_cfg.get("openai_model") or "gpt-4o").strip() or "gpt-4o"))
    if str(os.getenv("ANTHROPIC_API_KEY") or "").strip():
        cloud_available.append(("anthropic", str(cloud_cfg.get("anthropic_model") or "claude-sonnet-4-20250514").strip() or "claude-sonnet-4-20250514"))
    if str(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip():
        cloud_available.append(("gemini", str(cloud_cfg.get("gemini_model") or "gemini-1.5-pro").strip() or "gemini-1.5-pro"))

    if local_available and cloud_available:
        if preference == "cloud":
            order = _provider_order(vlm_config)
            for provider in order:
                for candidate_provider, model in cloud_available:
                    if provider == candidate_provider:
                        return {"mode": "cloud", "provider": candidate_provider, "model": model}
        return {"mode": "local", "provider": "ollama", "model": str(ollama_cfg.get("model") or "qwen2.5vl:7b").strip() or "qwen2.5vl:7b"}
    if cloud_available:
        order = _provider_order(vlm_config)
        for provider in order:
            for candidate_provider, model in cloud_available:
                if provider == candidate_provider:
                    return {"mode": "cloud", "provider": candidate_provider, "model": model}
        provider, model = cloud_available[0]
        return {"mode": "cloud", "provider": provider, "model": model}
    if local_available:
        return {"mode": "local", "provider": "ollama", "model": str(ollama_cfg.get("model") or "qwen2.5vl:7b").strip() or "qwen2.5vl:7b"}
    raise RuntimeError(
        "No vision model is available. Start Ollama with a vision model or set OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY."
    )


def _image_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("utf-8")


def _call_ollama(endpoint: str, model: str, image_path: Path, prompt: str) -> str:
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": [_image_b64(image_path)],
            }
        ],
    }
    parsed = _json_request(f"{endpoint.rstrip('/')}/api/chat", payload, timeout=120)
    message = parsed.get("message") if isinstance(parsed.get("message"), dict) else {}
    return str(message.get("content") or "").strip()


def _call_ollama_text(endpoint: str, model: str, prompt: str) -> str:
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    }
    parsed = _json_request(f"{endpoint.rstrip('/')}/api/chat", payload, timeout=120)
    message = parsed.get("message") if isinstance(parsed.get("message"), dict) else {}
    return str(message.get("content") or "").strip()


def _call_openai(model: str, image_path: Path, prompt: str) -> str:
    api_key = str(os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{_image_b64(image_path)}",
                        },
                    },
                ],
            }
        ],
    }
    parsed = _json_request(
        "https://api.openai.com/v1/chat/completions",
        payload,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=120,
    )
    choices = parsed.get("choices") if isinstance(parsed.get("choices"), list) else []
    if not choices or not isinstance(choices[0], dict):
        return ""
    message = choices[0].get("message") if isinstance(choices[0].get("message"), dict) else {}
    return str(message.get("content") or "").strip()


def _call_openai_text(model: str, prompt: str) -> str:
    api_key = str(os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    }
    parsed = _json_request(
        "https://api.openai.com/v1/chat/completions",
        payload,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=120,
    )
    choices = parsed.get("choices") if isinstance(parsed.get("choices"), list) else []
    if not choices or not isinstance(choices[0], dict):
        return ""
    message = choices[0].get("message") if isinstance(choices[0].get("message"), dict) else {}
    return str(message.get("content") or "").strip()


def _call_anthropic(model: str, image_path: Path, prompt: str) -> str:
    api_key = str(os.getenv("ANTHROPIC_API_KEY") or "").strip()
    payload = {
        "model": model,
        "max_tokens": 400,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": _image_b64(image_path),
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    }
    parsed = _json_request(
        "https://api.anthropic.com/v1/messages",
        payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        timeout=120,
    )
    content = parsed.get("content") if isinstance(parsed.get("content"), list) else []
    texts = [str(item.get("text") or "").strip() for item in content if isinstance(item, dict) and str(item.get("type") or "") == "text"]
    return "\n".join(chunk for chunk in texts if chunk).strip()


def _call_anthropic_text(model: str, prompt: str) -> str:
    api_key = str(os.getenv("ANTHROPIC_API_KEY") or "").strip()
    payload = {
        "model": model,
        "max_tokens": 400,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    }
    parsed = _json_request(
        "https://api.anthropic.com/v1/messages",
        payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        timeout=120,
    )
    content = parsed.get("content") if isinstance(parsed.get("content"), list) else []
    texts = [str(item.get("text") or "").strip() for item in content if isinstance(item, dict) and str(item.get("type") or "") == "text"]
    return "\n".join(chunk for chunk in texts if chunk).strip()


def _call_gemini(model: str, image_path: Path, prompt: str) -> str:
    api_key = str(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": _image_b64(image_path),
                        }
                    },
                ]
            }
        ]
    }
    parsed = _json_request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        payload,
        timeout=120,
    )
    candidates = parsed.get("candidates") if isinstance(parsed.get("candidates"), list) else []
    if not candidates or not isinstance(candidates[0], dict):
        return ""
    content = candidates[0].get("content") if isinstance(candidates[0].get("content"), dict) else {}
    parts = content.get("parts") if isinstance(content.get("parts"), list) else []
    texts = [str(part.get("text") or "").strip() for part in parts if isinstance(part, dict)]
    return "\n".join(chunk for chunk in texts if chunk).strip()


def _call_gemini_text(model: str, prompt: str) -> str:
    api_key = str(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                ]
            }
        ]
    }
    parsed = _json_request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        payload,
        timeout=120,
    )
    candidates = parsed.get("candidates") if isinstance(parsed.get("candidates"), list) else []
    if not candidates or not isinstance(candidates[0], dict):
        return ""
    content = candidates[0].get("content") if isinstance(candidates[0].get("content"), dict) else {}
    parts = content.get("parts") if isinstance(content.get("parts"), list) else []
    texts = [str(part.get("text") or "").strip() for part in parts if isinstance(part, dict)]
    return "\n".join(chunk for chunk in texts if chunk).strip()


def summarize_scene(image_path: Path, prompt: str, vlm_config: Dict[str, Any]) -> Dict[str, Any]:
    target = resolve_model_target(vlm_config)
    provider = str(target.get("provider") or "").strip().lower()
    model = str(target.get("model") or "").strip()
    if provider == "ollama":
        endpoint = str(((vlm_config.get("ollama") if isinstance(vlm_config.get("ollama"), dict) else {}) or {}).get("endpoint") or "http://127.0.0.1:11434").strip()
        text = _call_ollama(endpoint, model, image_path, prompt)
    elif provider == "openai":
        text = _call_openai(model, image_path, prompt)
    elif provider == "anthropic":
        text = _call_anthropic(model, image_path, prompt)
    elif provider == "gemini":
        text = _call_gemini(model, image_path, prompt)
    else:
        raise RuntimeError(f"Unsupported routed model provider: {provider}")
    if not text:
        raise RuntimeError(f"{provider} returned an empty scene summary.")
    return {"provider": provider, "model": model, "text": text}


def complete_text(prompt: str, vlm_config: Dict[str, Any]) -> Dict[str, Any]:
    target = resolve_model_target(vlm_config)
    provider = str(target.get("provider") or "").strip().lower()
    model = str(target.get("model") or "").strip()
    if provider == "ollama":
        endpoint = str(((vlm_config.get("ollama") if isinstance(vlm_config.get("ollama"), dict) else {}) or {}).get("endpoint") or "http://127.0.0.1:11434").strip()
        text = _call_ollama_text(endpoint, model, prompt)
    elif provider == "openai":
        text = _call_openai_text(model, prompt)
    elif provider == "anthropic":
        text = _call_anthropic_text(model, prompt)
    elif provider == "gemini":
        text = _call_gemini_text(model, prompt)
    else:
        raise RuntimeError(f"Unsupported routed model provider: {provider}")
    if not text:
        raise RuntimeError(f"{provider} returned an empty text completion.")
    return {"provider": provider, "model": model, "text": text}
