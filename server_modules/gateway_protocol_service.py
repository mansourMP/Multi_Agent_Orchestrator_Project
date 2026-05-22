from __future__ import annotations

import asyncio
import json
import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Dict, Optional

from fastapi import HTTPException
from fastapi import WebSocket, WebSocketDisconnect

PROTOCOL_VERSION = "v1alpha2"
SUPPORTED_PROTOCOL_VERSIONS = {"v1alpha2"}
DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS = 15
MAX_GATEWAY_FRAME_BYTES = 256 * 1024
MAX_GATEWAY_JSON_DEPTH = 32

from server_modules import (
    auth,
    gateway_activity_service,
    gateway_registry_service,
    gateway_state_repository,
    personal_channels_service,
    session_service,
)
from server_modules.kill_switch_gate import assert_not_killed, KillSwitchBlockedError
from server_modules.gateway_quota_enforcement import (
    evaluate_gateway_quota,
    GATEWAY_CHANNEL_OUTBOUND,
)


_LIVE_GATEWAY_CONNECTIONS_BY_GATEWAY: Dict[str, "_LiveGatewayConnection"] = {}
_LIVE_GATEWAY_CONNECTIONS_BY_SESSION: Dict[str, "_LiveGatewayConnection"] = {}
_LIVE_GATEWAY_CONNECTIONS_LOCK = threading.Lock()


@dataclass
class _PendingGatewayRequest:
    message_type: str
    future: asyncio.Future[Dict[str, Any]]
    loop: asyncio.AbstractEventLoop


class GatewayFrameValidationError(ValueError):
    def __init__(self, *, error_code: str, reason: str, close_code: int = 4408) -> None:
        super().__init__(reason)
        self.error_code = str(error_code or "invalid_gateway_frame").strip() or "invalid_gateway_frame"
        self.reason = str(reason or "Invalid gateway frame.").strip() or "Invalid gateway frame."
        self.close_code = int(close_code)


class _LiveGatewayConnection:
    def __init__(
        self,
        *,
        websocket: WebSocket,
        gateway_id: str,
        session_id: str,
        scope: Dict[str, str],
    ) -> None:
        self.websocket = websocket
        self.gateway_id = str(gateway_id or "").strip()
        self.session_id = str(session_id or "").strip()
        self.scope = dict(scope or {})
        self._pending_requests: Dict[str, _PendingGatewayRequest] = {}
        self._seen_inbound_frame_ids: set[str] = set()
        self._frame_response_cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._send_lock = asyncio.Lock()
        self._closed = False

    async def send_request(
        self,
        *,
        message_type: str,
        payload: Dict[str, Any],
        timeout_seconds: int,
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if self._closed:
            raise RuntimeError("Gateway connection is no longer active.")
        resolved_request_id = str(request_id or f"greq_{uuid.uuid4().hex}").strip()
        frame = {
            "kind": "request",
            "id": resolved_request_id,
            "type": str(message_type or "").strip(),
            "ts": gateway_state_repository._utc_now_iso(),
            "scope": dict(self.scope),
            "payload": dict(payload or {}),
        }
        loop = asyncio.get_running_loop()
        future: asyncio.Future[Dict[str, Any]] = loop.create_future()
        self._pending_requests[resolved_request_id] = _PendingGatewayRequest(
            message_type=str(message_type or "").strip() or "unknown",
            future=future,
            loop=loop,
        )
        gateway_state_repository.record_gateway_event(
            gateway_id=self.gateway_id,
            session_id=self.session_id,
            direction="outbound",
            frame_kind="request",
            message_type=str(message_type or "").strip() or "unknown",
            payload=frame,
        )
        async with self._send_lock:
            await self.websocket.send_json(frame)
        try:
            return await asyncio.wait_for(future, timeout=max(int(timeout_seconds or 0), 1))
        finally:
            self._pending_requests.pop(resolved_request_id, None)

    def resolve_response(self, frame: Dict[str, Any]) -> str:
        request_id = str(frame.get("id") or "").strip()
        pending = self._pending_requests.pop(request_id, None)
        if pending is None:
            return "response"
        if not pending.future.done():
            pending.loop.call_soon_threadsafe(pending.future.set_result, dict(frame or {}))
        return pending.message_type

    def remember_inbound_frame_id(self, frame_id: Any) -> bool:
        normalized = str(frame_id or "").strip()
        if not normalized:
            return True
        if normalized in self._seen_inbound_frame_ids:
            return False
        if len(self._seen_inbound_frame_ids) >= 4096:
            import logging
            logging.warning("Inbound frame ID set reached capacity (%d); clearing oldest 2048 entries", len(self._seen_inbound_frame_ids))
            self._seen_inbound_frame_ids = set(list(self._seen_inbound_frame_ids)[2048:])
        self._seen_inbound_frame_ids.add(normalized)
        return True

    def cache_frame_response(self, frame_id: str, response: Dict[str, Any]) -> None:
        self._frame_response_cache[frame_id] = response
        self._frame_response_cache.move_to_end(frame_id)
        if len(self._frame_response_cache) > 2048:
            self._frame_response_cache.popitem(last=False)

    def get_cached_frame_response(self, frame_id: str) -> Optional[Dict[str, Any]]:
        return self._frame_response_cache.get(frame_id)

    def fail_pending(self, reason: str) -> None:
        if self._closed:
            return
        self._closed = True
        for pending in list(self._pending_requests.values()):
            if pending.future.done():
                continue
            pending.loop.call_soon_threadsafe(
                pending.future.set_exception,
                RuntimeError(str(reason or "Gateway connection closed.")),
            )
        self._pending_requests.clear()


def _register_live_connection(connection: _LiveGatewayConnection) -> None:
    with _LIVE_GATEWAY_CONNECTIONS_LOCK:
        _LIVE_GATEWAY_CONNECTIONS_BY_GATEWAY[connection.gateway_id] = connection
        _LIVE_GATEWAY_CONNECTIONS_BY_SESSION[connection.session_id] = connection


def _unregister_live_connection(*, gateway_id: str, session_id: str, reason: str) -> None:
    with _LIVE_GATEWAY_CONNECTIONS_LOCK:
        connection = _LIVE_GATEWAY_CONNECTIONS_BY_SESSION.pop(str(session_id or "").strip(), None)
        if connection is None:
            connection = _LIVE_GATEWAY_CONNECTIONS_BY_GATEWAY.get(str(gateway_id or "").strip())
        _LIVE_GATEWAY_CONNECTIONS_BY_GATEWAY.pop(str(gateway_id or "").strip(), None)
    if connection is not None:
        connection.fail_pending(reason)


def _get_live_connection(gateway_id: str) -> Optional[_LiveGatewayConnection]:
    with _LIVE_GATEWAY_CONNECTIONS_LOCK:
        return _LIVE_GATEWAY_CONNECTIONS_BY_GATEWAY.get(str(gateway_id or "").strip())


def gateway_connection_is_live(gateway_id: str) -> bool:
    return _get_live_connection(gateway_id) is not None


async def dispatch_tool_invoke(
    *,
    gateway_id: str,
    capability_id: str,
    arguments: Optional[Dict[str, Any]],
    run_id: str,
    trace_id: str,
    workspace_id: str,
    timeout_seconds: int = DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    assert_not_killed(gateway_id=gateway_id, trace_id=trace_id)
    connection = _get_live_connection(gateway_id)
    if connection is None:
        raise ValueError("Gateway is not currently connected.")
    response = await connection.send_request(
        message_type="tool.invoke",
        payload={
            "capability_id": str(capability_id or "").strip(),
            "arguments": dict(arguments or {}),
            "run_id": str(run_id or "").strip(),
            "trace_id": str(trace_id or "").strip(),
            "workspace_id": str(workspace_id or "").strip(),
        },
        timeout_seconds=timeout_seconds,
        request_id=request_id,
    )
    if not bool(response.get("ok")):
        error = dict(response.get("error") or {})
        raise ValueError(str(error.get("message") or "Gateway tool invocation failed.").strip() or "Gateway tool invocation failed.")
    return dict(response.get("payload") or {})


async def dispatch_tool_interrupt(
    *,
    gateway_id: str,
    run_id: str,
    trace_id: str,
    workspace_id: str,
    target_request_id: Optional[str] = None,
    reason: Optional[str] = None,
    timeout_seconds: int = DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    connection = _get_live_connection(gateway_id)
    if connection is None:
        raise ValueError("Gateway is not currently connected.")
    response = await connection.send_request(
        message_type="tool.interrupt",
        payload={
            "run_id": str(run_id or "").strip(),
            "trace_id": str(trace_id or "").strip(),
            "workspace_id": str(workspace_id or "").strip(),
            "target_request_id": str(target_request_id or "").strip() or None,
            "reason": str(reason or "").strip() or None,
        },
        timeout_seconds=timeout_seconds,
        request_id=request_id,
    )
    if not bool(response.get("ok")):
        error = dict(response.get("error") or {})
        raise ValueError(str(error.get("message") or "Gateway tool interrupt failed.").strip() or "Gateway tool interrupt failed.")
    return dict(response.get("payload") or {})


async def dispatch_channel_outbound(
    *,
    gateway_id: str,
    channel_key: str,
    provider: str,
    remote_jid: str,
    text: str,
    idempotency_key: str,
    operation: Optional[str] = None,
    draft_id: Optional[str] = None,
    sequence: Optional[int] = None,
    delta: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    reply_to_external_message_id: Optional[str] = None,
    timeout_seconds: int = DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    assert_not_killed(gateway_id=gateway_id)
    quota_decision = evaluate_gateway_quota(profile=GATEWAY_CHANNEL_OUTBOUND, gateway_id=gateway_id)
    if not quota_decision.allowed:
        return {"ok": False, "error": "quota_exceeded", "detail": "Channel outbound quota exceeded.", "retry_after_seconds": quota_decision.retry_after_seconds}
    connection = _get_live_connection(gateway_id)
    if connection is None:
        raise ValueError("Gateway is not currently connected.")
    response = await connection.send_request(
        message_type="channel.outbound",
        payload={
            "channel_key": str(channel_key or "").strip(),
            "provider": str(provider or "").strip(),
            "remote_jid": str(remote_jid or "").strip(),
            "text": str(text or "").strip(),
            "idempotency_key": str(idempotency_key or "").strip(),
            "operation": str(operation or "").strip() or None,
            "draft_id": str(draft_id or "").strip() or None,
            "sequence": sequence if sequence is not None else None,
            "delta": str(delta or ""),
            "metadata": dict(metadata or {}),
            "reply_to_external_message_id": str(reply_to_external_message_id or "").strip() or None,
        },
        timeout_seconds=timeout_seconds,
        request_id=request_id,
    )
    if not bool(response.get("ok")):
        error = dict(response.get("error") or {})
        raise ValueError(str(error.get("message") or "Gateway channel outbound failed.").strip() or "Gateway channel outbound failed.")
    return dict(response.get("payload") or {})


def _response_frame(request_id: str, *, ok: bool, payload: Optional[Dict[str, Any]] = None, error: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    frame: Dict[str, Any] = {
        "kind": "response",
        "id": str(request_id or "").strip(),
        "ok": bool(ok),
        "ts": gateway_state_repository._utc_now_iso(),
    }
    if ok:
        frame["payload"] = dict(payload or {})
    else:
        frame["error"] = dict(error or {})
    return frame


def _event_frame(
    event_type: str,
    *,
    scope: Dict[str, str],
    payload: Optional[Dict[str, Any]] = None,
    seq: int,
    ack: Optional[int] = None,
) -> Dict[str, Any]:
    frame: Dict[str, Any] = {
        "kind": "event",
        "type": str(event_type or "").strip(),
        "seq": int(seq),
        "ts": gateway_state_repository._utc_now_iso(),
        "scope": dict(scope or {}),
        "payload": dict(payload or {}),
    }
    if ack is not None:
        frame["ack"] = int(ack)
    return frame


def _json_depth(value: Any, *, limit: int = MAX_GATEWAY_JSON_DEPTH) -> int:
    def _walk(item: Any, depth: int) -> int:
        if depth > limit:
            return depth
        if isinstance(item, dict):
            if not item:
                return depth
            return max(_walk(child, depth + 1) for child in item.values())
        if isinstance(item, list):
            if not item:
                return depth
            return max(_walk(child, depth + 1) for child in item)
        return depth

    return _walk(value, 0)


def _parse_frame(raw_text: str) -> Dict[str, Any]:
    raw = str(raw_text or "")
    if len(raw.encode("utf-8")) > MAX_GATEWAY_FRAME_BYTES:
        raise GatewayFrameValidationError(
            error_code="gateway_frame_too_large",
            reason="Gateway frame exceeds the maximum allowed size.",
            close_code=4409,
        )
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GatewayFrameValidationError(
            error_code="gateway_frame_invalid_json",
            reason="Gateway frame must be valid JSON.",
        ) from exc
    if not isinstance(payload, dict):
        raise GatewayFrameValidationError(
            error_code="gateway_frame_not_object",
            reason="Gateway frame must decode to an object.",
        )
    if _json_depth(payload) > MAX_GATEWAY_JSON_DEPTH:
        raise GatewayFrameValidationError(
            error_code="gateway_frame_too_deep",
            reason="Gateway frame exceeds the maximum allowed nesting depth.",
        )
    return payload


def _normalized_request_type(frame: Dict[str, Any]) -> str:
    return str(frame.get("type") or "").strip()


def _validate_client_protocol_version(client_version: Optional[str]) -> Optional[str]:
    if not client_version:
        return "Protocol version is required. Supported: " + ", ".join(sorted(SUPPORTED_PROTOCOL_VERSIONS))
    if client_version not in SUPPORTED_PROTOCOL_VERSIONS:
        return "Unsupported protocol version: " + client_version + ". Supported: " + ", ".join(sorted(SUPPORTED_PROTOCOL_VERSIONS))
    return None


def _connect_frame_protocol_version(frame: Dict[str, Any], connect_payload: Dict[str, Any]) -> str:
    return str(
        frame.get("protocolVersion")
        or frame.get("protocol_version")
        or connect_payload.get("protocol_version")
        or ""
    ).strip()


def _scope_matches_registration(frame_scope: Dict[str, Any], registration: Dict[str, Any]) -> bool:
    expected = gateway_registry_service.gateway_scope_payload(registration)
    for key, value in expected.items():
        raw = str(frame_scope.get(key) or "").strip()
        if raw != value:
            return False
    return True


def _normalize_frame_seq_ack(frame: Dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    def _normalize(name: str) -> Optional[int]:
        if name not in frame:
            return None
        value = frame.get(name)
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            raise GatewayFrameValidationError(
                error_code="gateway_frame_invalid_sequence",
                reason=f"Gateway frame {name} must be an integer.",
            )
        try:
            normalized = int(value)
        except (TypeError, ValueError) as exc:
            raise GatewayFrameValidationError(
                error_code="gateway_frame_invalid_sequence",
                reason=f"Gateway frame {name} must be an integer.",
            ) from exc
        if normalized < 0:
            raise GatewayFrameValidationError(
                error_code="gateway_frame_invalid_sequence",
                reason=f"Gateway frame {name} must be non-negative.",
            )
        return normalized

    return (_normalize("seq"), _normalize("ack"))


async def _validate_gateway_binding(
    *,
    session: Dict[str, Any],
    registration: Dict[str, Any],
) -> Dict[str, Any]:
    try:
        device_link = auth.validate_local_gateway_device_link(
            user_id=str(registration.get("user_id") or "").strip(),
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            device_id=str(registration.get("device_id") or "").strip(),
            gateway_id=str(registration.get("gateway_id") or "").strip(),
        )
    except HTTPException as exc:
        raise ValueError(str(exc.detail)) from exc

    auth_session = auth.get_auth_session(str(session.get("session_id") or "").strip())
    if not auth_session:
        raise ValueError("Gateway auth session was not found.")
    if str(auth_session.get("status") or "").strip().lower() != "active":
        raise ValueError("Gateway auth session is not active.")
    if str(auth_session.get("device_id") or "").strip() != str(registration.get("device_id") or "").strip():
        raise ValueError("Gateway auth session device mismatch.")
    if str(auth_session.get("runtime_id") or "").strip() != str(registration.get("gateway_id") or "").strip():
        raise ValueError("Gateway auth session runtime mismatch.")
    if str(auth_session.get("channel") or "").strip().lower() != "local_runtime_companion":
        raise ValueError("Gateway auth session channel is invalid.")
    if str(auth_session.get("trust_state") or "").strip().lower() == "revoked":
        raise ValueError("Gateway auth session trust was revoked.")

    runtime_session = await session_service.get_local_gateway_session(str(session.get("session_id") or "").strip())
    if not runtime_session:
        raise ValueError("Gateway runtime session was not found.")
    if str(runtime_session.get("status") or "").strip().lower() in {"expired", "revoked"}:
        raise ValueError("Gateway runtime session is not active.")
    if str(runtime_session.get("workspace_id") or "").strip() != str(registration.get("workspace_id") or "").strip():
        raise ValueError("Gateway runtime session workspace mismatch.")
    if str(runtime_session.get("tenant_id") or "").strip() != str(registration.get("tenant_id") or "").strip():
        raise ValueError("Gateway runtime session tenant mismatch.")
    if str(runtime_session.get("channel") or "").strip().lower() != "local_runtime_companion":
        raise ValueError("Gateway runtime session channel is invalid.")
    runtime_metadata = dict(runtime_session.get("metadata") or {})
    if str(runtime_metadata.get("gateway_id") or "").strip() != str(registration.get("gateway_id") or "").strip():
        raise ValueError("Gateway runtime session binding mismatch.")
    if str(runtime_metadata.get("device_id") or "").strip() != str(registration.get("device_id") or "").strip():
        raise ValueError("Gateway runtime session device binding mismatch.")
    if str(runtime_metadata.get("user_id") or "").strip() != str(registration.get("user_id") or "").strip():
        raise ValueError("Gateway runtime session user binding mismatch.")
    return {
        "device_link": device_link,
        "auth_session": auth_session,
        "runtime_session": runtime_session,
    }


async def handle_gateway_websocket(
    websocket: WebSocket,
    *,
    gateway_id: str,
    session_token: str,
    accept_subprotocol: Optional[str] = None,
) -> None:
    connection: Optional[_LiveGatewayConnection] = None
    background_tasks: set[asyncio.Task[Any]] = set()

    def _track_background_task(task: asyncio.Task[Any]) -> None:
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)

    async def _handle_personal_channel_inbound_event(event_payload: Dict[str, Any]) -> None:
        try:
            await personal_channels_service.handle_gateway_channel_inbound(
                gateway_id=gateway_id,
                registration=registration,
                payload=event_payload,
            )
        except Exception as exc:
            gateway_state_repository.record_gateway_event(
                gateway_id=gateway_id,
                session_id=session_id,
                direction="system",
                frame_kind="event_handler",
                message_type="channel.inbound.error",
                payload={
                    "error": str(exc),
                    "payload": event_payload,
                },
            )

    try:
        session = gateway_state_repository.validate_gateway_session(
            gateway_id=gateway_id,
            session_token=session_token,
        )
    except ValueError as exc:
        await websocket.close(code=4401, reason=str(exc))
        return
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        await websocket.close(code=4404, reason="Gateway registration not found.")
        return
    try:
        binding = await _validate_gateway_binding(session=session, registration=registration)
    except ValueError as exc:
        gateway_state_repository.mark_gateway_session_disconnected(
            str(session.get("session_id") or "").strip(),
            reason="binding_validation_failed",
        )
        await websocket.close(code=4401, reason=str(exc))
        return

    session_id = str(session.get("session_id") or "")
    scope = gateway_registry_service.gateway_scope_payload(registration)
    server_event_seq = 0
    last_client_seq: Optional[int] = None
    disconnected = False
    await websocket.accept(subprotocol=accept_subprotocol)

    try:
        try:
            first_frame = _parse_frame(await websocket.receive_text())
            first_seq, first_ack = _normalize_frame_seq_ack(first_frame)
        except GatewayFrameValidationError as exc:
            await websocket.close(code=exc.close_code, reason=exc.reason)
            disconnected = True
            gateway_state_repository.mark_gateway_session_disconnected(session_id, reason=exc.error_code)
            return
        gateway_state_repository.record_gateway_event(
            gateway_id=gateway_id,
            session_id=session_id,
            direction="inbound",
            frame_kind=str(first_frame.get("kind") or ""),
            message_type=_normalized_request_type(first_frame),
            payload=first_frame,
            seq=first_seq,
            ack=first_ack,
        )
        if str(first_frame.get("kind") or "").strip() != "request" or _normalized_request_type(first_frame) != "gateway.connect":
            await websocket.send_json(
                _response_frame(
                    str(first_frame.get("id") or "connect"),
                    ok=False,
                    error={"code": "gateway_connect_required", "message": "First frame must be gateway.connect."},
                )
            )
            await websocket.close(code=4408, reason="gateway.connect required")
            disconnected = True
            gateway_state_repository.mark_gateway_session_disconnected(session_id, reason="connect_required")
            return
        frame_scope = first_frame.get("scope") if isinstance(first_frame.get("scope"), dict) else {}
        if not _scope_matches_registration(frame_scope, registration):
            await websocket.send_json(
                _response_frame(
                    str(first_frame.get("id") or "connect"),
                    ok=False,
                    error={"code": "scope_mismatch", "message": "Gateway scope does not match registration."},
                )
            )
            await websocket.close(code=4403, reason="scope mismatch")
            disconnected = True
            gateway_state_repository.mark_gateway_session_disconnected(session_id, reason="scope_mismatch")
            return

        connect_payload = first_frame.get("payload") if isinstance(first_frame.get("payload"), dict) else {}
        client_version = _connect_frame_protocol_version(first_frame, connect_payload)
        version_error = _validate_client_protocol_version(client_version)
        if version_error:
            await websocket.send_json(
                _response_frame(
                    str(first_frame.get("id") or "connect"),
                    ok=False,
                    error={"code": "unsupported_protocol_version", "message": version_error},
                )
            )
            await websocket.close(code=4408, reason="unsupported protocol version")
            disconnected = True
            gateway_state_repository.mark_gateway_session_disconnected(session_id, reason="unsupported_protocol_version")
            return

        gateway_state_repository.mark_gateway_session_connected(session_id)
        gateway_state_repository.touch_gateway_session(
            session_id=session_id,
            gateway_id=gateway_id,
            seq=first_seq,
            ack=first_ack,
            journal_cursor=connect_payload.get("journal_cursor"),
            checkpoint_cursor=connect_payload.get("checkpoint_cursor"),
            metadata={
                "gateway_version": connect_payload.get("gateway_version"),
                "device_metadata": connect_payload.get("device_metadata"),
                "requested_capabilities": connect_payload.get("requested_capabilities"),
                "auth_session_id": session_id,
                "runtime_session_id": session_id,
            },
        )
        gateway_state_repository.update_gateway_registration_state(
            gateway_id=gateway_id,
            device_trust_state=str(binding["device_link"].get("trust_state") or "verified").strip() or "verified",
            metadata={
                "auth_session_id": session_id,
                "runtime_session_id": session_id,
            },
        )
        connection = _LiveGatewayConnection(
            websocket=websocket,
            gateway_id=gateway_id,
            session_id=session_id,
            scope=scope,
        )
        _register_live_connection(connection)
        connect_response = _response_frame(
            str(first_frame.get("id") or "connect"),
            ok=True,
            payload={"accepted": True, "protocol_version": PROTOCOL_VERSION},
        )
        await websocket.send_json(connect_response)
        if connection is not None:
            connection.cache_frame_response(str(first_frame.get("id") or "").strip(), connect_response)
        server_event_seq += 1
        hello_frame = _event_frame(
            "gateway.hello",
            scope=scope,
            payload={
                "session_id": session_id,
                "protocol_version": PROTOCOL_VERSION,
                "heartbeat_interval_seconds": gateway_registry_service.DEFAULT_GATEWAY_HEARTBEAT_INTERVAL_SECONDS,
                "scope": scope,
            },
            seq=server_event_seq,
            ack=first_ack,
        )
        gateway_state_repository.record_gateway_event(
            gateway_id=gateway_id,
            session_id=session_id,
            direction="outbound",
            frame_kind="event",
            message_type="gateway.hello",
            payload=hello_frame,
            seq=server_event_seq,
            ack=first_ack,
        )
        await websocket.send_json(hello_frame)
        server_event_seq += 1
        presence_frame = _event_frame(
            "gateway.presence",
            scope=scope,
            payload={"status": "online", "gateway_id": gateway_id},
            seq=server_event_seq,
            ack=first_ack,
        )
        gateway_state_repository.record_gateway_event(
            gateway_id=gateway_id,
            session_id=session_id,
            direction="outbound",
            frame_kind="event",
            message_type="gateway.presence",
            payload=presence_frame,
            seq=server_event_seq,
            ack=first_ack,
        )
        await websocket.send_json(presence_frame)
        await gateway_activity_service.emit_gateway_presence_activity(
            registration,
            action="gateway_connected",
            title="Gateway connected",
            summary="Paired local gateway connected to the cloud control plane.",
            status="online",
            payload={"session_id": session_id, "scope": scope},
        )
        last_client_seq = first_seq

        while True:
            try:
                frame = _parse_frame(await websocket.receive_text())
                frame_seq, frame_ack = _normalize_frame_seq_ack(frame)
            except GatewayFrameValidationError as exc:
                await websocket.send_json(
                    _response_frame(
                        "invalid",
                        ok=False,
                        error={"code": exc.error_code, "message": exc.reason},
                    )
                )
                await websocket.close(code=exc.close_code, reason=exc.reason)
                disconnected = True
                gateway_state_repository.mark_gateway_session_disconnected(session_id, reason=exc.error_code)
                break
            if frame_seq is not None and last_client_seq is not None and frame_seq <= last_client_seq:
                await websocket.send_json(
                    _response_frame(
                        str(frame.get("id") or "replayed"),
                        ok=False,
                        error={
                            "code": "gateway_frame_replayed",
                            "message": "Gateway frame sequence must be strictly increasing.",
                        },
                    )
                )
                disconnected = True
                gateway_state_repository.mark_gateway_session_disconnected(session_id, reason="gateway_frame_replayed")
                await websocket.close(code=4408, reason="gateway frame replay detected")
                break
            if frame_seq is not None:
                last_client_seq = frame_seq
            frame_kind = str(frame.get("kind") or "").strip()
            message_type = _normalized_request_type(frame)
            payload = frame.get("payload") if isinstance(frame.get("payload"), dict) else {}
            if frame_kind == "request" and connection is not None and not connection.remember_inbound_frame_id(frame.get("id")):
                frame_id = str(frame.get("id") or "").strip()
                cached = connection.get_cached_frame_response(frame_id)
                if cached is not None:
                    await websocket.send_json(cached)
                else:
                    await websocket.send_json(
                        _response_frame(
                            frame_id or "replayed",
                            ok=False,
                            error={
                                "code": "duplicate_frame_id",
                                "detail": "Frame ID already processed",
                            },
                        )
                    )
                continue
            if frame_kind == "response" and connection is not None:
                resolved_message_type = connection.resolve_response(frame)
                if resolved_message_type == "tool.invoke":
                    message_type = "tool.result"
                elif resolved_message_type == "tool.interrupt":
                    message_type = "tool.interrupt.result"
                elif resolved_message_type == "channel.outbound":
                    message_type = "channel.outbound.result"
                else:
                    message_type = resolved_message_type or "response"
            gateway_state_repository.record_gateway_event(
                gateway_id=gateway_id,
                session_id=session_id,
                direction="inbound",
                frame_kind=frame_kind,
                message_type=message_type,
                payload=frame,
                seq=frame_seq,
                ack=frame_ack,
            )
            if frame_kind == "response":
                if message_type == "channel.outbound.result":
                    try:
                        personal_channels_service.sync_gateway_channel_outbound_result(
                            gateway_id=gateway_id,
                            payload=dict(payload),
                        )
                    except Exception:
                        pass
                gateway_state_repository.touch_gateway_session(
                    session_id=session_id,
                    gateway_id=gateway_id,
                    metadata={"last_cloud_request_type": message_type},
                )
                continue
            if frame_kind == "event":
                if str(frame.get("type") or "").strip() == "channel.inbound":
                    _track_background_task(
                        asyncio.create_task(
                            _handle_personal_channel_inbound_event(dict(payload)),
                        )
                    )
                    gateway_state_repository.touch_gateway_session(
                        session_id=session_id,
                        gateway_id=gateway_id,
                        seq=frame_seq,
                        ack=frame_ack,
                        metadata={"last_personal_channel_event": "channel.inbound"},
                    )
                    continue
                continue
            if frame_kind != "request":
                await websocket.send_json(
                    _response_frame(
                        str(frame.get("id") or "invalid"),
                        ok=False,
                        error={"code": "invalid_frame_kind", "message": "Only request frames are accepted."},
                    )
                )
                continue
            try:
                binding = await _validate_gateway_binding(session=session, registration=registration)
            except ValueError as exc:
                gateway_state_repository.mark_gateway_session_disconnected(
                    session_id,
                    reason="binding_validation_failed",
                )
                await websocket.send_json(
                    _response_frame(
                        str(frame.get("id") or "binding"),
                        ok=False,
                        error={"code": "binding_validation_failed", "message": str(exc)},
                    )
                )
                disconnected = True
                break
            if message_type == "gateway.heartbeat":
                gateway_state_repository.touch_gateway_session(
                    session_id=session_id,
                    gateway_id=gateway_id,
                    seq=frame_seq,
                    ack=frame_ack,
                    health_state=payload.get("health_state"),
                    journal_cursor=payload.get("journal_cursor"),
                    checkpoint_cursor=payload.get("checkpoint_cursor"),
                    metadata={
                        "capability_readiness": payload.get("capability_readiness"),
                        "queue_depth_summary": payload.get("queue_depth_summary"),
                        "device_trust_state": str(binding["device_link"].get("trust_state") or "verified").strip()
                        or "verified",
                    },
                )
                heartbeat_response = _response_frame(
                    str(frame.get("id") or "heartbeat"),
                    ok=True,
                    payload={
                        "status": "online",
                        "heartbeat_interval_seconds": gateway_registry_service.DEFAULT_GATEWAY_HEARTBEAT_INTERVAL_SECONDS,
                    },
                )
                await websocket.send_json(heartbeat_response)
                if connection is not None:
                    connection.cache_frame_response(str(frame.get("id") or "").strip(), heartbeat_response)
                continue
            if message_type == "gateway.state.update":
                previous_health_state = str(registration.get("metadata", {}).get("health_state") or "").strip().lower()
                registration = gateway_state_repository.update_gateway_registration_state(
                    gateway_id=gateway_id,
                    metadata=payload,
                    journal_cursor=payload.get("journal_cursor"),
                    checkpoint_cursor=payload.get("checkpoint_cursor"),
                ) or registration
                personal_channels_service.sync_gateway_personal_channel_state(
                    gateway_id=gateway_id,
                    registration=registration,
                    payload=payload,
                )
                gateway_state_repository.touch_gateway_session(
                    session_id=session_id,
                    gateway_id=gateway_id,
                    seq=frame_seq,
                    ack=frame_ack,
                    health_state=payload.get("health_state"),
                    journal_cursor=payload.get("journal_cursor"),
                    checkpoint_cursor=payload.get("checkpoint_cursor"),
                    metadata={
                        "personal_channels": payload.get("personal_channels"),
                    },
                )
                next_health_state = str(payload.get("health_state") or registration.get("metadata", {}).get("health_state") or "").strip().lower()
                if payload.get("personal_channels") or next_health_state != previous_health_state:
                    await gateway_activity_service.emit_gateway_presence_activity(
                        registration,
                        action="gateway_state_updated" if next_health_state in {"", "online"} else "gateway_degraded",
                        title="Gateway state updated",
                        summary=(
                            f"Gateway reported {next_health_state} state."
                            if next_health_state
                            else "Gateway reported updated state."
                        ),
                        status=next_health_state or "online",
                        payload=payload,
                    )
                state_update_response = _response_frame(
                    str(frame.get("id") or "state_update"),
                    ok=True,
                    payload={"updated": True},
                )
                await websocket.send_json(state_update_response)
                if connection is not None:
                    connection.cache_frame_response(str(frame.get("id") or "").strip(), state_update_response)
                server_event_seq += 1
                state_event = _event_frame(
                    "gateway.presence",
                    scope=scope,
                    payload={
                        "status": "online",
                        "gateway_id": gateway_id,
                        "state": payload,
                    },
                    seq=server_event_seq,
                    ack=frame_ack,
                )
                gateway_state_repository.record_gateway_event(
                    gateway_id=gateway_id,
                    session_id=session_id,
                    direction="outbound",
                    frame_kind="event",
                    message_type="gateway.presence",
                    payload=state_event,
                    seq=server_event_seq,
                    ack=frame_ack,
                )
                await websocket.send_json(state_event)
                continue
            if message_type == "gateway.disconnect":
                gateway_state_repository.mark_gateway_session_disconnected(
                    session_id,
                    reason=str(payload.get("reason") or "client_disconnect"),
                )
                await gateway_activity_service.emit_gateway_presence_activity(
                    registration,
                    action="gateway_disconnected",
                    title="Gateway disconnected",
                    summary=str(payload.get("reason") or "Gateway disconnected from the control plane."),
                    status="offline",
                    payload={"session_id": session_id, "reason": payload.get("reason")},
                )
                disconnect_response = _response_frame(
                    str(frame.get("id") or "disconnect"),
                    ok=True,
                    payload={"disconnected": True},
                )
                await websocket.send_json(disconnect_response)
                if connection is not None:
                    connection.cache_frame_response(str(frame.get("id") or "").strip(), disconnect_response)
                disconnected = True
                break

            unsupported_response = _response_frame(
                str(frame.get("id") or "unsupported"),
                ok=False,
                error={"code": "unsupported_message_type", "message": f"Unsupported message type: {message_type}"},
            )
            await websocket.send_json(unsupported_response)
            if connection is not None:
                connection.cache_frame_response(str(frame.get("id") or "").strip(), unsupported_response)
    except WebSocketDisconnect:
        if not disconnected:
            gateway_state_repository.mark_gateway_session_disconnected(session_id, reason="websocket_disconnect")
            await gateway_activity_service.emit_gateway_presence_activity(
                registration,
                action="gateway_disconnected",
                title="Gateway disconnected",
                summary="Gateway websocket disconnected.",
                status="offline",
                payload={"session_id": session_id, "reason": "websocket_disconnect"},
            )
    finally:
        _unregister_live_connection(
            gateway_id=gateway_id,
            session_id=session_id,
            reason="gateway_websocket_closed",
        )
        if background_tasks:
            for task in list(background_tasks):
                task.cancel()
            await asyncio.gather(*background_tasks, return_exceptions=True)
        if not disconnected:
            gateway_state_repository.mark_gateway_session_disconnected(session_id, reason="socket_closed")
