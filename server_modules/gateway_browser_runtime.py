from __future__ import annotations

import json
import sys
import uuid
from typing import Any, Dict, Optional

from server_modules.execution_router import get_browser_adapter


def _token(value: Any) -> str:
    return str(value or "").strip()


def _browser_session_mode(value: Any) -> str:
    token = _token(value).lower()
    if token == "existing_session_attach":
        return "existing_session_attach"
    return "managed_profile"


def _attach_state(value: Any) -> str:
    token = _token(value).lower()
    if token in {"attached", "not_attached", "attach_required", "attach_failed"}:
        return token
    return "not_attached"


def _session_status(session_mode: str, attach_state: str, *, manual_takeover: bool = False) -> str:
    if manual_takeover:
        return "waiting_for_input"
    if session_mode == "existing_session_attach":
        if attach_state in {"attached", "not_attached", "attach_required", "attach_failed"}:
            return attach_state
        return "not_attached"
    return "active"


def _session_metadata(
    browser_metadata: Optional[Dict[str, Any]],
    *,
    session_mode: str,
    attach_endpoint_url: Optional[str],
    attach_state: str,
    attach_failure: Optional[str] = None,
) -> Dict[str, Any]:
    metadata = dict(browser_metadata or {})
    metadata["browser_session_mode"] = session_mode
    metadata["browser_attach_state"] = attach_state
    if attach_endpoint_url:
        metadata["browser_attach_endpoint_url"] = _token(attach_endpoint_url)
    else:
        metadata.pop("browser_attach_endpoint_url", None)
    if attach_failure:
        metadata["browser_attach_failure"] = _token(attach_failure)
    else:
        metadata.pop("browser_attach_failure", None)
    return metadata


def _checkpoint(
    *,
    session_profile: Optional[str],
    session_mode: Optional[str],
    next_action_index: int,
    snapshot: Optional[Dict[str, Any]],
    attach_endpoint_url: Optional[str] = None,
    attach_state: Optional[str] = None,
    manual_takeover: bool = False,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "next_action_index": max(int(next_action_index or 0), 0),
        "session_profile": _token(session_profile) or None,
        "session_mode": _browser_session_mode(session_mode),
        "manual_takeover": bool(manual_takeover),
    }
    if _token(attach_endpoint_url):
        payload["attach_endpoint_url"] = _token(attach_endpoint_url)
    if _token(attach_state):
        payload["attach_state"] = _attach_state(attach_state)
    if isinstance(snapshot, dict):
        if isinstance(snapshot.get("tabs"), list):
            payload["tabs"] = list(snapshot.get("tabs") or [])
        if isinstance(snapshot.get("accessibility_snapshot"), dict):
            payload["accessibility_snapshot"] = dict(snapshot.get("accessibility_snapshot") or {})
        current_url = _token(snapshot.get("url"))
        if current_url:
            payload["current_url"] = current_url
    return payload


class GatewayBrowserRuntime:
    def __init__(self) -> None:
        self._adapter = get_browser_adapter({"trust_mode": "reviewed"}, target="local_companion")
        self._sessions: Dict[str, Dict[str, Any]] = {}

    async def _page_snapshot(self) -> Dict[str, Any]:
        try:
            state = await self._adapter.get_page_state()
            return dict(state or {})
        except Exception:
            return {}

    def _session(self, browser_session_id: str) -> Dict[str, Any]:
        token = _token(browser_session_id)
        session = self._sessions.get(token)
        if session is None:
            raise RuntimeError("Browser session was not found.")
        return session

    def _session_mode_and_attach(self, payload: Dict[str, Any], session: Optional[Dict[str, Any]] = None) -> tuple[str, Optional[str]]:
        metadata = (
            payload.get("browser_metadata")
            if isinstance(payload.get("browser_metadata"), dict)
            else (session or {}).get("metadata")
            if isinstance((session or {}).get("metadata"), dict)
            else {}
        )
        checkpoint = (
            payload.get("checkpoint")
            if isinstance(payload.get("checkpoint"), dict)
            else (session or {}).get("checkpoint")
            if isinstance((session or {}).get("checkpoint"), dict)
            else {}
        )
        session_mode = _browser_session_mode(
            payload.get("session_mode")
            or metadata.get("browser_session_mode")
            or checkpoint.get("session_mode")
        )
        attach_endpoint_url = (
            _token(payload.get("attach_endpoint_url"))
            or _token(metadata.get("browser_attach_endpoint_url"))
            or _token(checkpoint.get("attach_endpoint_url"))
            or None
        )
        return session_mode, attach_endpoint_url

    async def _configure_adapter(
        self,
        *,
        session_mode: str,
        attach_endpoint_url: Optional[str],
    ) -> Dict[str, Any]:
        return dict(
            await self._adapter.configure_session(
                session_mode=session_mode,
                attach_endpoint_url=attach_endpoint_url,
            )
        )

    async def start_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        browser_session_id = _token(payload.get("browser_session_id")) or f"gbsess_{uuid.uuid4().hex}"
        session_profile = _token(payload.get("session_profile")) or "gateway_default"
        url = _token(payload.get("url"))
        session_mode, attach_endpoint_url = self._session_mode_and_attach(payload)
        browser_metadata = payload.get("browser_metadata") if isinstance(payload.get("browser_metadata"), dict) else {}
        runtime_state = await self._configure_adapter(
            session_mode=session_mode,
            attach_endpoint_url=attach_endpoint_url,
        )
        resolved_attach_state = _attach_state(runtime_state.get("attach_state"))
        status = _session_status(session_mode, resolved_attach_state)
        snapshot: Dict[str, Any] = {}
        if status in {"active", "attached"}:
            if url:
                await self._adapter.navigate(url)
            snapshot = await self._page_snapshot()
        next_action_index = int(payload.get("next_action_index") or 0)
        checkpoint = _checkpoint(
            session_profile=session_profile,
            session_mode=session_mode,
            next_action_index=next_action_index,
            snapshot=snapshot,
            attach_endpoint_url=attach_endpoint_url,
            attach_state=resolved_attach_state,
        )
        metadata = _session_metadata(
            browser_metadata,
            session_mode=session_mode,
            attach_endpoint_url=attach_endpoint_url,
            attach_state=resolved_attach_state,
            attach_failure=_token(runtime_state.get("attach_failure")) or None,
        )
        session = {
            "browser_session_id": browser_session_id,
            "status": status,
            "session_profile": session_profile,
            "current_url": _token(snapshot.get("url")) or _token(runtime_state.get("current_url")) or url or None,
            "manual_takeover": False,
            "resume_supported": status in {"active", "attached"},
            "checkpoint": checkpoint,
            "snapshot": snapshot,
            "metadata": metadata,
        }
        self._sessions[browser_session_id] = session
        return {
            "browser_session": session,
            "status": "started" if status in {"active", "attached"} else status,
        }

    async def perform_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        browser_session_id = _token(payload.get("browser_session_id"))
        session = self._session(browser_session_id)
        session_mode, attach_endpoint_url = self._session_mode_and_attach(payload, session)
        runtime_state = await self._configure_adapter(
            session_mode=session_mode,
            attach_endpoint_url=attach_endpoint_url,
        )
        resolved_attach_state = _attach_state(runtime_state.get("attach_state"))
        if _session_status(session_mode, resolved_attach_state) not in {"active", "attached", "waiting_for_input"}:
            session["status"] = _session_status(session_mode, resolved_attach_state)
            session["metadata"] = _session_metadata(
                session.get("metadata") if isinstance(session.get("metadata"), dict) else {},
                session_mode=session_mode,
                attach_endpoint_url=attach_endpoint_url,
                attach_state=resolved_attach_state,
                attach_failure=_token(runtime_state.get("attach_failure")) or None,
            )
            self._sessions[browser_session_id] = session
            return {
                "browser_session": session,
                "status": session["status"],
                "action_result": {},
            }
        action = _token(payload.get("action")).lower()
        action_args = dict(payload.get("action_args") or {})
        result: Dict[str, Any] = {}
        if action == "navigate":
            result = dict(await self._adapter.navigate(_token(action_args.get("url"))))
        elif action == "observe":
            result = dict(await self._adapter.observe())
        elif action == "click":
            result = dict(await self._adapter.click(_token(action_args.get("selector"))))
        elif action == "fill":
            result = dict(
                await self._adapter.fill(
                    _token(action_args.get("selector")),
                    _token(action_args.get("value")),
                )
            )
        elif action == "select":
            result = dict(
                await self._adapter.select(
                    _token(action_args.get("selector")),
                    _token(action_args.get("value")),
                )
            )
        elif action == "extract_text":
            result = {"text": await self._adapter.extract_text(_token(action_args.get("selector")) or None)}
        elif action == "execute_js":
            result = {"value": await self._adapter.execute_js(_token(action_args.get("script")))}
        elif action == "screenshot":
            result = {"path": await self._adapter.screenshot(_token(action_args.get("selector")) or None)}
        elif action == "new_tab":
            result = {"tab_id": await self._adapter.new_tab(_token(action_args.get("url")) or None)}
        elif action == "switch_tab":
            await self._adapter.switch_tab(int(action_args.get("tab_id") or 0))
            result = {"tab_id": int(action_args.get("tab_id") or 0)}
        elif action == "close_tab":
            await self._adapter.close_tab(int(action_args.get("tab_id") or 0))
            result = {"tab_id": int(action_args.get("tab_id") or 0), "closed": True}
        elif action == "download_file":
            result = {
                "path": await self._adapter.download_file(
                    _token(action_args.get("url")),
                    _token(action_args.get("save_path")) or None,
                )
            }
        else:
            raise RuntimeError(f"Unsupported browser action '{action}'.")
        snapshot = await self._page_snapshot()
        next_action_index = int((session.get("checkpoint") or {}).get("next_action_index") or 0) + 1
        session["checkpoint"] = _checkpoint(
            session_profile=session.get("session_profile"),
            session_mode=session_mode,
            next_action_index=next_action_index,
            snapshot=snapshot,
            attach_endpoint_url=attach_endpoint_url,
            attach_state=resolved_attach_state,
            manual_takeover=bool(session.get("manual_takeover")),
        )
        session["snapshot"] = snapshot
        session["current_url"] = _token(snapshot.get("url")) or session.get("current_url")
        session["status"] = _session_status(
            session_mode,
            resolved_attach_state,
            manual_takeover=bool(session.get("manual_takeover")),
        )
        session["metadata"] = _session_metadata(
            session.get("metadata") if isinstance(session.get("metadata"), dict) else {},
            session_mode=session_mode,
            attach_endpoint_url=attach_endpoint_url,
            attach_state=resolved_attach_state,
            attach_failure=_token(runtime_state.get("attach_failure")) or None,
        )
        self._sessions[browser_session_id] = session
        return {
            "browser_session": session,
            "status": "completed",
            "action_result": result,
        }

    async def takeover(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session = self._session(_token(payload.get("browser_session_id")))
        session_mode, attach_endpoint_url = self._session_mode_and_attach(payload, session)
        snapshot = await self._page_snapshot()
        session["manual_takeover"] = True
        session["status"] = _session_status(session_mode, _attach_state((session.get("metadata") or {}).get("browser_attach_state")), manual_takeover=True)
        session["checkpoint"] = _checkpoint(
            session_profile=session.get("session_profile"),
            session_mode=session_mode,
            next_action_index=int((session.get("checkpoint") or {}).get("next_action_index") or 0),
            snapshot=snapshot,
            attach_endpoint_url=attach_endpoint_url,
            attach_state=(session.get("metadata") or {}).get("browser_attach_state"),
            manual_takeover=True,
        )
        session["snapshot"] = snapshot
        self._sessions[_token(payload.get("browser_session_id"))] = session
        return {
            "browser_session": session,
            "status": "waiting_for_input",
            "manual_takeover": True,
        }

    async def resume_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session = self._session(_token(payload.get("browser_session_id")))
        checkpoint = payload.get("checkpoint") if isinstance(payload.get("checkpoint"), dict) else {}
        session_mode, attach_endpoint_url = self._session_mode_and_attach(payload, session)
        runtime_state = await self._configure_adapter(
            session_mode=session_mode,
            attach_endpoint_url=attach_endpoint_url,
        )
        resolved_attach_state = _attach_state(runtime_state.get("attach_state"))
        if _session_status(session_mode, resolved_attach_state) not in {"active", "attached", "waiting_for_input"}:
            session["manual_takeover"] = False
            session["status"] = _session_status(session_mode, resolved_attach_state)
            session["metadata"] = _session_metadata(
                session.get("metadata") if isinstance(session.get("metadata"), dict) else {},
                session_mode=session_mode,
                attach_endpoint_url=attach_endpoint_url,
                attach_state=resolved_attach_state,
                attach_failure=_token(runtime_state.get("attach_failure")) or None,
            )
            self._sessions[_token(payload.get("browser_session_id"))] = session
            return {
                "browser_session": session,
                "status": session["status"],
                "manual_takeover": False,
            }
        current_url = _token(checkpoint.get("current_url") or (session.get("checkpoint") or {}).get("current_url"))
        if current_url:
            await self._adapter.navigate(current_url)
        snapshot = await self._page_snapshot()
        session["manual_takeover"] = False
        session["status"] = _session_status(session_mode, resolved_attach_state)
        session["checkpoint"] = _checkpoint(
            session_profile=session.get("session_profile"),
            session_mode=session_mode,
            next_action_index=int(checkpoint.get("next_action_index") or (session.get("checkpoint") or {}).get("next_action_index") or 0),
            snapshot=snapshot,
            attach_endpoint_url=attach_endpoint_url,
            attach_state=resolved_attach_state,
            manual_takeover=False,
        )
        session["snapshot"] = snapshot
        session["current_url"] = _token(snapshot.get("url")) or current_url or session.get("current_url")
        session["metadata"] = _session_metadata(
            session.get("metadata") if isinstance(session.get("metadata"), dict) else {},
            session_mode=session_mode,
            attach_endpoint_url=attach_endpoint_url,
            attach_state=resolved_attach_state,
            attach_failure=_token(runtime_state.get("attach_failure")) or None,
        )
        self._sessions[_token(payload.get("browser_session_id"))] = session
        return {
            "browser_session": session,
            "status": "resumed" if session["status"] in {"active", "attached"} else session["status"],
            "manual_takeover": False,
        }

    async def interrupt_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        session = self._session(_token(payload.get("browser_session_id")))
        session["status"] = "interrupted"
        self._sessions[_token(payload.get("browser_session_id"))] = session
        return {
            "browser_session": session,
            "status": "interrupted",
            "interrupted": True,
            "interrupt_count": 1,
        }

    async def dispatch(self, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        token = _token(action)
        if token == "start_session":
            return await self.start_session(payload)
        if token == "perform_action":
            return await self.perform_action(payload)
        if token == "takeover":
            return await self.takeover(payload)
        if token == "resume_session":
            return await self.resume_session(payload)
        if token == "interrupt_session":
            return await self.interrupt_session(payload)
        raise RuntimeError(f"Unsupported browser runtime action '{token}'.")


async def _run() -> int:
    runtime = GatewayBrowserRuntime()
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        request_id = ""
        try:
            payload = json.loads(line)
            if not isinstance(payload, dict):
                raise RuntimeError("Gateway browser runtime payload must be an object.")
            request_id = _token(payload.get("id"))
            response_payload = await runtime.dispatch(
                _token(payload.get("action")),
                dict(payload.get("payload") or {}),
            )
            response = {
                "id": request_id,
                "ok": True,
                "payload": response_payload,
            }
        except Exception as exc:
            response = {
                "id": request_id,
                "ok": False,
                "error": {
                    "message": str(exc),
                },
            }
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    import asyncio

    raise SystemExit(asyncio.run(_run()))
