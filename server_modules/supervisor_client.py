from __future__ import annotations

import hashlib
import hmac
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import requests


SUPERVISOR_URL = "http://127.0.0.1:7788"
SUPERVISOR_TIMEOUT_SECONDS = 10
SUPERVISOR_UNREACHABLE_MESSAGE = (
    "Supervisor not running. Start empyralis-supervisor before using computer control."
)


def capture_screenshot(monitor: str = "primary", region: dict[str, Any] | None = None) -> dict[str, Any]:
    return _execute(
        "screenshot.capture",
        {
            "monitor": monitor,
            "region": region,
        },
    )


def click(x: int, y: int, button: str = "left", double: bool = False) -> dict[str, Any]:
    return _execute(
        "computer_control.click",
        {
            "x": x,
            "y": y,
            "button": button,
            "double": double,
        },
    )


def type_text(text: str, delay_ms: int | None = None) -> dict[str, Any]:
    return _execute(
        "computer_control.type",
        {
            "text": text,
            "delay_ms": delay_ms,
        },
    )


def press_key(key: str) -> dict[str, Any]:
    return _execute(
        "computer_control.key",
        {
            "key": key,
        },
    )


def clipboard_read() -> dict[str, Any]:
    return _execute("computer_control.clipboard_read", {})


def clipboard_write(text: str) -> dict[str, Any]:
    return _execute(
        "computer_control.clipboard_write",
        {
            "text": text,
        },
    )


def list_windows() -> dict[str, Any]:
    return _execute("computer_control.list_windows", {})


def launch(target: str) -> dict[str, Any]:
    return _execute(
        "computer_control.launch",
        {
            "target": target,
        },
    )


def _execute(capability_id: str, arguments: dict[str, Any]) -> dict[str, Any]:
    request_id = str(uuid.uuid4())
    nonce = str(uuid.uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat().replace("+00:00", "Z")
    payload = {
        "request_id": request_id,
        "capability_id": capability_id,
        "run_id": "supervisor-client",
        "trace_id": request_id,
        "workspace_id": "local",
        "arguments": arguments,
        "nonce": nonce,
        "expires_at": expires_at,
        "signature": _sign_request(
            request_id=request_id,
            capability_id=capability_id,
            nonce=nonce,
            expires_at=expires_at,
        ),
    }

    try:
        response = requests.post(
            f"{SUPERVISOR_URL}/execute",
            json=payload,
            timeout=SUPERVISOR_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise RuntimeError(SUPERVISOR_UNREACHABLE_MESSAGE) from exc

    try:
        body = response.json()
    except ValueError as exc:
        raise RuntimeError(f"Supervisor returned invalid JSON (HTTP {response.status_code}).") from exc

    if response.status_code == 401:
        message = body.get("error") or "Supervisor rejected the signed request."
        raise RuntimeError(message)
    if response.status_code >= 400:
        message = body.get("error") or f"Supervisor request failed with HTTP {response.status_code}."
        raise RuntimeError(message)
    if not body.get("success", False):
        raise RuntimeError(body.get("error") or "Supervisor execution failed.")

    result = body.get("result")
    if not isinstance(result, dict):
        raise RuntimeError("Supervisor returned an invalid result payload.")
    return result


def _sign_request(*, request_id: str, capability_id: str, nonce: str, expires_at: str) -> str:
    secret = os.getenv("EMPYRALIS_SUPERVISOR_SECRET")
    if not secret:
        raise RuntimeError("EMPYRALIS_SUPERVISOR_SECRET is required for supervisor calls.")
    sign_str = f"{request_id}:{capability_id}:{nonce}:{expires_at}"
    return hmac.new(secret.encode("utf-8"), sign_str.encode("utf-8"), hashlib.sha256).hexdigest()
