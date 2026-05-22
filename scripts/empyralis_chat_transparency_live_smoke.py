#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
import uuid
from http.cookiejar import MozillaCookieJar
from pathlib import Path
from typing import Any
from urllib import error, request


DEFAULT_MESSAGE = "Use web search tool to find Empyralis and return one line."


def _json_request(
    *,
    base_url: str,
    path: str,
    cookie_jar: MozillaCookieJar,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: int = 30,
) -> dict[str, Any]:
    opener = request.build_opener(request.HTTPCookieProcessor(cookie_jar))
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    with opener.open(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    parsed = json.loads(raw or "{}")
    return parsed if isinstance(parsed, dict) else {}


def _stream_turn(
    *,
    base_url: str,
    cookie_jar: MozillaCookieJar,
    payload: dict[str, Any],
    timeout: int,
) -> list[dict[str, Any]]:
    opener = request.build_opener(request.HTTPCookieProcessor(cookie_jar))
    req = request.Request(
        f"{base_url.rstrip('/')}/api/turn",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    events: list[dict[str, Any]] = []
    with opener.open(req, timeout=timeout) as response:
        current_event = "message"
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line:
                current_event = "message"
                continue
            if line.startswith("event:"):
                current_event = line.split(":", 1)[1].strip()
                continue
            if not line.startswith("data:"):
                continue
            data = line.split(":", 1)[1].strip()
            try:
                payload_data = json.loads(data)
            except json.JSONDecodeError:
                payload_data = {"raw": data}
            events.append({"event": current_event, "payload": payload_data})
            if current_event == "final":
                break
    return events


def _read_required_text(payload: dict[str, Any], *keys: str) -> str:
    for key in keys:
        token = str(payload.get(key) or "").strip()
        if token:
            return token
    return ""


def _assistant_turns(thread_payload: dict[str, Any]) -> list[dict[str, Any]]:
    turns: list[dict[str, Any]] = []
    for item in list(thread_payload.get("items") or []):
        if not isinstance(item, dict):
            continue
        for turn in list(item.get("turns") or []):
            if isinstance(turn, dict) and str(turn.get("role") or "").strip() == "assistant":
                turns.append(turn)
    return turns


def _assert_safe_transcript_events(events: list[dict[str, Any]]) -> None:
    if not events:
        raise AssertionError("assistant turn did not persist metadata.transcript_events")
    blocked_tokens = ("args_preview", "arguments", "raw_output", "prompt", "trace_id")
    serialized = json.dumps(events, sort_keys=True)
    for token in blocked_tokens:
        if token in serialized:
            raise AssertionError(f"transcript_events leaked blocked token: {token}")
    for item in events:
        event_name = str(item.get("event") or "").strip()
        if event_name not in {"trace", "step"}:
            raise AssertionError(f"unexpected transcript event name: {event_name}")
        if item.get("schema_version") != 1:
            raise AssertionError("transcript event schema_version must be 1")


def run_smoke(args: argparse.Namespace) -> int:
    cookie_jar = MozillaCookieJar()
    email = f"codex.transparency.{int(time.time())}.{uuid.uuid4().hex[:8]}@local.test"
    password = f"CodexTransparency{uuid.uuid4().hex[:8]}!"
    signup = _json_request(
        base_url=args.backend_url,
        path="/api/v1/auth/signup",
        cookie_jar=cookie_jar,
        method="POST",
        payload={"email": email, "password": password, "name": "Codex Transparency Smoke"},
        timeout=args.timeout,
    )
    workspace_id = _read_required_text(signup, "default_workspace_id", "current_workspace_id")
    tenant_id = _read_required_text(signup, "default_tenant_id", "current_tenant_id")
    if not workspace_id or not tenant_id:
        raise AssertionError("signup did not return a default workspace and tenant")

    request_id = f"transparency-smoke-{uuid.uuid4().hex[:12]}"
    turn_payload = {
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "session_id": "primary",
        "thread_id": "primary",
        "channel": "web",
        "actor": {"type": "user", "id": "smoke", "display_name": "Smoke"},
        "message": args.message,
        "execution_mode": "sync",
        "response_mode": "stream",
        "context_hints": {
            "metadata": {
                "request_id": request_id,
                "billing_source": "empyralis_credits",
                "credential_plane": "platform_runtime",
            }
        },
        "client_request_id": request_id,
    }
    stream_events = _stream_turn(
        base_url=args.backend_url,
        cookie_jar=cookie_jar,
        payload=turn_payload,
        timeout=args.turn_timeout,
    )
    event_names = [str(item.get("event") or "").strip() for item in stream_events]
    if "final" not in event_names:
        raise AssertionError("turn stream did not emit final")
    if not any(name in {"trace", "step"} for name in event_names):
        raise AssertionError("turn stream did not emit proof events")

    matching_turn: dict[str, Any] | None = None
    for _ in range(args.poll_attempts):
        threads = _json_request(
            base_url=args.backend_url,
            path=f"/api/threads?workspace_id={workspace_id}&include_turns=true",
            cookie_jar=cookie_jar,
            timeout=args.timeout,
        )
        for turn in _assistant_turns(threads):
            metadata = turn.get("metadata") if isinstance(turn.get("metadata"), dict) else {}
            if str(metadata.get("request_id") or turn.get("request_id") or "").strip() == request_id:
                matching_turn = turn
                break
        if matching_turn is not None:
            break
        time.sleep(args.poll_interval)

    if matching_turn is None:
        raise AssertionError("assistant turn was not replayable from thread history")
    metadata = matching_turn.get("metadata") if isinstance(matching_turn.get("metadata"), dict) else {}
    transcript_events = list(metadata.get("transcript_events") or [])
    _assert_safe_transcript_events([item for item in transcript_events if isinstance(item, dict)])

    print("PASS chat transparency live smoke")
    print(f"  workspace_id: {workspace_id}")
    print(f"  request_id: {request_id}")
    print(f"  stream_events: {len(stream_events)}")
    print(f"  transcript_events: {len(transcript_events)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run a live localhost Sage transparency smoke and verify replayable transcript_events.",
    )
    parser.add_argument("--backend-url", default="http://127.0.0.1:8001")
    parser.add_argument("--message", default=DEFAULT_MESSAGE)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--turn-timeout", type=int, default=90)
    parser.add_argument("--poll-attempts", type=int, default=20)
    parser.add_argument("--poll-interval", type=float, default=0.5)
    args = parser.parse_args()
    try:
        return run_smoke(args)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"FAIL HTTP {exc.code}: {detail}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
